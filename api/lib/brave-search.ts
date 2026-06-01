import { env } from "./env";

export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
};

const BRAVE_BASE_URL = "https://api.search.brave.com/res/v1/web/search";

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  // unreachable but satisfies TS
  throw new Error("fetch failed after retries");
}

export async function braveSearch(query: string, count = 5): Promise<BraveSearchResult[]> {
  if (!env.braveApiKey) {
    console.warn("[brave-search] Brave Search not configured — set BRAVE_API_KEY");
    return [];
  }

  const url = new URL(BRAVE_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  let res: Response;
  try {
    res = await fetchWithRetry(url.toString(), {
      headers: {
        "X-Subscription-Token": env.braveApiKey,
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
      },
    });
  } catch (err) {
    console.error("[brave-search] fetch error:", err);
    return [];
  }

  if (!res.ok) {
    console.error("[brave-search] API error:", res.status, await res.text().catch(() => ""));
    return [];
  }

  let data: any;
  try {
    data = await res.json();
  } catch (err) {
    console.error("[brave-search] JSON parse error:", err);
    return [];
  }

  const webResults: any[] = data?.web?.results ?? [];
  return webResults.slice(0, count).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    description: r.description ?? "",
  }));
}

const DISTRESS_KEYWORDS: Record<string, string> = {
  foreclosure: "Pre-Foreclosure",
  "pre-foreclosure": "Pre-Foreclosure",
  auction: "Auction",
  "tax delinquent": "Tax Delinquent",
  "tax lien": "Tax Delinquent",
  "back taxes": "Tax Delinquent",
  "code violation": "Code Violation",
  "code enforcement": "Code Violation",
  probate: "Probate",
  "estate sale": "Probate",
  vacant: "Vacant",
  abandoned: "Vacant",
  "lis pendens": "Pre-Foreclosure",
  "notice of default": "Pre-Foreclosure",
};

function detectDistressSignals(results: BraveSearchResult[]): string[] {
  const found = new Set<string>();
  const combined = results
    .map((r) => `${r.title} ${r.description}`.toLowerCase())
    .join(" ");

  for (const [keyword, label] of Object.entries(DISTRESS_KEYWORDS)) {
    if (combined.includes(keyword)) {
      found.add(label);
    }
  }

  return Array.from(found);
}

function buildSummary(
  allResults: BraveSearchResult[],
  distressSignals: string[],
  propertyAddress: string,
  sellerName: string
): string {
  if (allResults.length === 0) {
    return "Brave Search not configured — set BRAVE_API_KEY";
  }

  const signals =
    distressSignals.length > 0
      ? `Distress signals found: ${distressSignals.join(", ")}.`
      : "No distress signals detected in search results.";

  const topSources = allResults
    .slice(0, 3)
    .map((r) => r.title)
    .filter(Boolean)
    .join(", ");

  return (
    `Research on ${propertyAddress} (owner: ${sellerName}) returned ${allResults.length} result(s). ` +
    `${signals}` +
    (topSources ? ` Top sources: ${topSources}.` : "")
  );
}

export async function researchLead(
  sellerName: string,
  propertyAddress: string,
  city: string
): Promise<{
  results: BraveSearchResult[];
  distressSignals: string[];
  summary: string;
}> {
  if (!env.braveApiKey) {
    return {
      results: [],
      distressSignals: [],
      summary: "Brave Search not configured — set BRAVE_API_KEY",
    };
  }

  const queries = [
    `${propertyAddress} ${city} MA foreclosure OR auction OR tax delinquent OR code violation`,
    `${sellerName} ${city} MA property`,
    `${propertyAddress} public record`,
  ];

  const allResults: BraveSearchResult[] = [];

  for (const query of queries) {
    const results = await braveSearch(query, 5);
    allResults.push(...results);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  const distressSignals = detectDistressSignals(unique);
  const summary = buildSummary(unique, distressSignals, propertyAddress, sellerName);

  return { results: unique, distressSignals, summary };
}
