import { leads } from "../../db/schema";
import { env } from "./env";
import { and, eq, or, isNull, sql, desc } from "drizzle-orm";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

// Free web-search phone enrichment (Tavily, 1,000 searches/mo free tier).
// For phoneless leads with a real owner name, searches `"Name" City ST phone`
// and lifts the most-mentioned US phone number from public result snippets
// (directories, obituaries, news, business listings). Best-effort: a found
// number is marked unverified in notes so the dialer/SMS leg treats it as
// unconfirmed until a conversation validates it.
const TAVILY_URL = "https://api.tavily.com/search";

const ENTITY_RE =
  /\b(LLC|L\.?L\.?C|LLP|INC|CORP|LP|TRUST|HOLDINGS?|PROPERT(?:Y|IES)|ENTERPRISES?|REALTY|INVESTMENTS?|GROUP|VENTURES?|CHURCH|DIOCESE|CITY OF|TOWN OF|HOUSING)\b/i;

function usableName(name: string | null): string | null {
  if (!name) return null;
  const n = name.trim();
  if (n.length < 4 || ENTITY_RE.test(n)) return null;
  if (/^(registry owner|unknown)/i.test(n)) return null;
  if (!/\s/.test(n)) return null; // need at least first + last for a search
  if (/^\d+$/.test(n.replace(/\s/g, ""))) return null;
  return n;
}

const PHONE_RE =
  /\b(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?([2-9]\d{2})[-.\s]?(\d{4})\b/g;

function extractPhones(text: string): string[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[1] + m[2] + m[3];
    if (/^(\d)\1{9}$/.test(digits)) continue; // 1111111111 etc.
    if (digits.startsWith("55501")) continue; // fictional 555-01xx range
    const fmt = `(${m[1]}) ${m[2]}-${m[3]}`;
    counts.set(fmt, (counts.get(fmt) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

async function tavilySearch(query: string): Promise<string> {
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.tavilyApiKey,
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data: any = await res.json();
  const parts: string[] = [];
  for (const r of data?.results ?? []) {
    parts.push(String(r?.title ?? ""), String(r?.content ?? ""));
  }
  return parts.join("\n");
}

export interface EnrichResult {
  ok: boolean;
  checked: number;
  found: number;
  remaining: number;
  quotaSuspected: boolean;
  lastError: string | null;
  error?: string;
}

// Marker appended to notes for leads whose seller name can never be used for
// a name search (LLC, institution, junk). The candidate query excludes marked
// leads so they stop blocking the queue head for future runs.
const SKIP_MARKER = "[skip:unusable-name]";
// A completed search (no throw) that finds no number is a strike. The query is
// identical every attempt, so retrying a numberless lead is pure waste — after
// MAX_FAILS strikes the lead is marked and never searched again. Throws (rate
// limit, quota, network) never count as strikes; the lead is retried later.
const FAIL_MARKER = "[enrich:fail]";
const SKIP_NO_NUMBER = "[skip:no-number]";
const MAX_FAILS = 2;

// Batch-enrich phoneless leads. Hot first, then warm, newest first; skips
// entity/junk names. maxLeads caps Tavily spend per invocation (free tier is
// 1,000 searches/mo — a weekly scan adding ~40 leads plus backfill fits).
export async function enrichPhones(db: Db, maxLeads = 40): Promise<EnrichResult> {
  if (!env.tavilyApiKey) {
    return { ok: false, checked: 0, found: 0, remaining: 0, quotaSuspected: false, lastError: null, error: "TAVILY_API_KEY not configured" };
  }
  let checked = 0;
  let found = 0;
  let quotaErrors = 0;
  let lastError: string | null = null;
  const unmarked = () =>
    and(
      or(eq(leads.phone, ""), isNull(leads.phone)),
      sql`coalesce(${leads.notes}, '') NOT LIKE ${"%" + SKIP_MARKER + "%"}`,
      sql`coalesce(${leads.notes}, '') NOT LIKE ${"%" + SKIP_NO_NUMBER + "%"}`
    );
  try {
    const rows = await db
      .select({
        id: leads.id,
        sellerName: leads.sellerName,
        city: leads.city,
        state: leads.state,
        notes: leads.notes,
      })
      .from(leads)
      .where(unmarked())
      .orderBy(
        sql`case when ${leads.motivationLevel} = 'hot' then 0 when ${leads.motivationLevel} = 'warm' then 1 else 2 end`,
        desc(leads.id)
      )
      .limit(maxLeads * 3); // oversample; unusable names are filtered below

    for (const row of rows) {
      if (checked >= maxLeads) break;
      const name = usableName(row.sellerName);
      if (!name) {
        // Permanently unusable for name search — mark so it stops occupying
        // the head of the queue on every future run.
        await db
          .update(leads)
          .set({
            notes: sql`left(coalesce(${leads.notes}, '') || ${"\n" + SKIP_MARKER}, 2000)`,
          })
          .where(eq(leads.id, row.id));
        continue;
      }
      checked++;
      try {
        const loc = [row.city, row.state].filter(Boolean).join(", ");
        const text = await tavilySearch(`"${name}" ${loc} phone number`);
        const phones = extractPhones(text);
        if (phones.length) {
          const note = `\nPhone via web search (unverified): ${phones[0]}`;
          await db
            .update(leads)
            .set({
              phone: phones[0],
              notes: sql`left(coalesce(${leads.notes}, '') || ${note}, 2000)`,
            })
            .where(eq(leads.id, row.id));
          found++;
        } else {
          // Search completed but the public web has no number for this name.
          // Same query would return the same results, so count a strike and
          // stop searching this lead after MAX_FAILS.
          const fails = (row.notes?.match(/\[enrich:fail\]/g) || []).length + 1;
          const marker = fails >= MAX_FAILS ? SKIP_NO_NUMBER : FAIL_MARKER;
          await db
            .update(leads)
            .set({
              notes: sql`left(coalesce(${leads.notes}, '') || ${"\n" + marker}, 2000)`,
            })
            .where(eq(leads.id, row.id));
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        console.error(`[enrich] lead ${row.id} failed:`, msg);
        lastError = msg;
        // Throw = we didn't actually check (rate limit, quota, network), so
        // it never counts as a strike. But 3+ 429s in one run means the well
        // is dry — stop the run instead of burning through it.
        if (/429/.test(msg) && ++quotaErrors >= 3) break;
      }
      // Gentle pacing between searches.
      await new Promise((r) => setTimeout(r, 1200));
    }
  } catch (err: any) {
    return { ok: false, checked, found, remaining: 0, quotaSuspected: quotaErrors >= 3, lastError, error: err?.message ?? String(err) };
  }
  const remainingRows = await db
    .select({ n: sql`count(*)` })
    .from(leads)
    .where(unmarked());
  const remaining = Number((remainingRows[0] as any)?.n ?? 0);
  return { ok: true, checked, found, remaining, quotaSuspected: quotaErrors >= 3, lastError };
}
