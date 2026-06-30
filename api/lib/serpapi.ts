const BASE = "https://serpapi.com/search.json";

export interface MapsPropertyContext {
  placeType: string;
  title: string;
  address: string;
  rating?: number;
  hasActiveListing: boolean;
  thumbnail?: string;
  summary: string;
}

export async function searchGoogleMapsAddress(address: string): Promise<MapsPropertyContext | null> {
  const apiKey = process.env.SERPAPI_KEY ?? "";
  if (!apiKey || !address) return null;

  const params = new URLSearchParams({
    engine: "google_maps",
    q: address,
    type: "search",
    api_key: apiKey,
  });

  try {
    const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.error("[serpapi/maps] error:", res.status);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    const results = (data?.local_results as Record<string, unknown>[]) ?? [];
    const first = results[0];

    if (!first) return null;

    const placeType = (first.type as string) ?? "";
    const title = (first.title as string) ?? "";
    const addr = (first.address as string) ?? address;
    const rating = first.rating as number | undefined;
    const thumbnail = first.thumbnail as string | undefined;

    // Check if any result looks like an active for-sale/rent listing
    const rawJson = JSON.stringify(data).toLowerCase();
    const hasActiveListing = /for sale|for rent|listed|zillow|redfin|realtor\.com/.test(rawJson);

    const parts: string[] = [];
    if (placeType) parts.push(`Type: ${placeType}`);
    if (title && title.toLowerCase() !== address.toLowerCase()) parts.push(`Name: ${title}`);
    if (addr) parts.push(`Address confirmed: ${addr}`);
    if (hasActiveListing) parts.push("Active for-sale/rent listing found");

    return {
      placeType,
      title,
      address: addr,
      rating,
      hasActiveListing,
      thumbnail,
      summary: parts.join(" | "),
    };
  } catch (err) {
    console.error("[serpapi/maps] fetch error:", err);
    return null;
  }
}

export async function searchGoogleMapsOwner(name: string, address: string): Promise<string | null> {
  const apiKey = process.env.SERPAPI_KEY ?? "";
  if (!apiKey || !name) return null;

  const params = new URLSearchParams({
    engine: "google",
    q: `"${name}" "${address}" real estate property owner`,
    num: "5",
    api_key: apiKey,
  });

  try {
    const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    const results = (data?.organic_results as Record<string, unknown>[]) ?? [];

    const snippets = results
      .slice(0, 3)
      .map((r) => (r.snippet as string) ?? "")
      .filter(Boolean)
      .join(" ");

    return snippets || null;
  } catch {
    return null;
  }
}
