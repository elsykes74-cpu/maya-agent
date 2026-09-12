import { desc } from "drizzle-orm";
import { proxiedFetch } from "./proxy-fetch";
import { leads, scrapeRuns } from "../../db/schema";
import { escapeHtml, sendAlert } from "./telegram";
import { getDb } from "../queries/connection";
import { routeLead } from "./pipeline-engine";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

const CL_BASE = "https://www.craigslist.org";
// HTML search (server-rendered result links). The old ?format=rss feed is
// hard-blocked for automated clients (HTTP 403); the HTML search page
// returns 200 with <li class="cl-static-search-result"> anchors.
// purveyor=owner restricts to FSBO listings so leadType/isFsbo are accurate
// (the unfiltered category mixes in ~1/3 broker listings).
const CL_SEARCH = `${CL_BASE}/search/area/westernmass?cat=rea&purveyor=owner`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// ── Egress proxy ─────────────────────────────────────────────────────────────
// Craigslist 403-blocks datacenter IPs (Vercel/AWS). Set CL_PROXY_URL to a
// residential proxy (http://user:pass@host:port) and all CL traffic routes
// through it. When unset, fetches go direct (and will likely be blocked).
async function clFetch(url: string, timeoutMs: number): Promise<Response> {
  return proxiedFetch(
    url,
    {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    },
    process.env.CL_PROXY_URL,
  );
}

// HTTP statuses that mean "Craigslist blocked this IP" rather than a bug.
const BLOCKED_STATUSES = new Set([403, 429, 503]);

// Max detail pages per run. Keeps scheduled runs fast and polite to CL.
const DEFAULT_MAX_ITEMS = 20;
// Delay between detail-page fetches — be polite to Craigslist.
const FETCH_DELAY_MS = 600;

const HIGH_FLAGS = [
  "must sell", "motivated", "as-is", "as is", "divorce", "estate sale",
  "probate", "inherited", "foreclosure", "pre-foreclosure", "behind on",
  "desperate", "need to sell fast", "quick sale", "fire sale", "distressed",
  "cash only", "price reduced", "drastic", "bank owned", "reo",
];
const MED_FLAGS = [
  "fixer", "investor", "handyman", "needs work", "tlc", "needs tlc",
  "relocating", "moving", "vacant", "tired landlord", "absentee", "out of state",
];

// ── Search-page parsing (server-rendered HTML, no RSS) ────────────────────────
// Each result: <li class="cl-static-search-result"><a href=".../view/d/{slug}/{id}">
//   <div class="title">…</div><div class="details"><div class="price">$…</div>
//   <div class="location">…</div></div></a></li>

interface SearchItem {
  id: string; // hash from the /view/d/ URL — stable external_id for dedup
  title: string;
  url: string;
  price: string | null;
  location: string;
}

function cleanText(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseSearchHtml(html: string): SearchItem[] {
  const items: SearchItem[] = [];
  const liRe = /<li[^>]*class="[^"]*cl-static-search-result[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  for (const m of html.matchAll(liRe)) {
    const chunk = m[1];
    const href = chunk.match(/<a[^>]*href="([^"]+\/view\/d\/[^"]+)"/)?.[1] ?? "";
    if (!href) continue;
    const id = href.match(/\/view\/d\/[^/]+\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
    const title = cleanText(chunk.match(/<div class="title">([\s\S]*?)<\/div>/)?.[1] ?? "");
    const priceRaw = cleanText(chunk.match(/<div class="price">([\s\S]*?)<\/div>/)?.[1] ?? "");
    const location = cleanText(chunk.match(/<div class="location">([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!id || !title) continue;
    items.push({
      id,
      title,
      url: href,
      price: priceRaw && priceRaw !== "$0" ? priceRaw : null,
      location,
    });
  }
  return items;
}

// ── Detail page ──────────────────────────────────────────────────────────────
async function fetchDetail(url: string): Promise<{ description: string; phone: string | null; location: string | null; postedAt: string | null }> {
  try {
    const res = await clFetch(url, 10000);
    if (!res.ok) return { description: "", phone: null, location: null, postedAt: null };
    const html = await res.text();
    if (html.includes("blockID")) return { description: "", phone: null, location: null, postedAt: null };

    // Posting body (new /view/d/ layout). Strip <script> first so the gallery
    // JS and numeric posting IDs can't pollute the description or phone match.
    const bodyMatch = html.match(/<section class="userbody">([\s\S]*?)<\/section>/);
    const rawBody = (bodyMatch?.[1] ?? "").replace(/<script[\s\S]*?<\/script>/g, " ");
    const description = rawBody
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);

    // Phone — search the posting body only (not raw HTML/JS), and require the
    // match to not be embedded in a longer digit string (avoids grabbing
    // timestamps, IDs, or script constants as the seller's phone).
    const phoneMatch = description.match(/(?<!\d)(\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4})(?!\d)/);
    const phone = phoneMatch
      ? phoneMatch[1].replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")
      : null;

    // Posted date (CL embeds it)
    const dateMatch = html.match(/datetime="([^"]+)"/);
    const postedAt = dateMatch?.[1] ?? null;

    // Map data-accuracy / data-latitude for location (CL embeds it)
    const cityMatch = html.match(/<meta content="([^"]+(?:Springfield|Holyoke|Chicopee|Westfield|Agawam|Northampton|Pittsfield|Ludlow|Palmer|Ware|Easthampton)[^"]*)" /i);
    const location = cityMatch?.[1]?.trim() ?? null;

    return { description, phone, location, postedAt };
  } catch {
    return { description: "", phone: null, location: null, postedAt: null };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePrice(text: string): string | null {
  const m = text.match(/\$\s?([\d,]{4,})/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return n > 5000 && n < 5_000_000 ? String(n) : null;
}

function scoreText(text: string): { level: "hot" | "warm" | "cold"; flags: string[] } {
  const lower = text.toLowerCase();
  const flags: string[] = [];
  let score = 0;
  for (const kw of HIGH_FLAGS) if (lower.includes(kw)) { score += 3; flags.push(kw); }
  for (const kw of MED_FLAGS) if (lower.includes(kw)) { score += 1; flags.push(kw); }
  return { level: score >= 6 ? "hot" : score >= 2 ? "warm" : "cold", flags: [...new Set(flags)] };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface CraigslistLead {
  clId: string;
  title: string;
  url: string;
  price: string | null;
  location: string;
  description: string;
  phone: string | null;
  motivationLevel: "hot" | "warm" | "cold";
  motivationFlags: string[];
}

export interface ScrapeResult {
  found: number;
  added: number;
  newLeads: CraigslistLead[];
  /** True when Craigslist blocked the request (IP block) — not a code bug. */
  blocked?: boolean;
}

export async function runCraigslistScrape(
  db: Db,
  opts: { maxItems?: number } = {},
): Promise<ScrapeResult> {
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const res = await clFetch(CL_SEARCH, 15000);
  // A block is an expected condition, not a crash: return a clean
  // "blocked" result so callers record it instead of throwing a 500.
  if (!res.ok && BLOCKED_STATUSES.has(res.status)) {
    console.warn(
      `[scraper] Craigslist blocked the request (HTTP ${res.status}). ` +
        "Set CL_PROXY_URL to a residential proxy to restore scanning.",
    );
    return { found: 0, added: 0, newLeads: [], blocked: true };
  }
  if (!res.ok) throw new Error(`Craigslist fetch failed: ${res.status}`);
  const html = await res.text();

  const items = parseSearchHtml(html);
  const newLeads: CraigslistLead[] = [];
  let added = 0;

  for (const item of items.slice(0, maxItems)) {
    const externalId = `cl:${item.id}`;

    // Rate limit — be polite to CL
    await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
    const { description, phone, location, postedAt } = await fetchDetail(item.url);

    const combinedText = `${item.title} ${description}`;
    // Prefer the search-card price: CL titles rarely include one (~all owner
    // listings carry the price only on the card). Fall back to title/body.
    const price = parsePrice(item.price ?? "") ?? parsePrice(item.title) ?? parsePrice(description);
    const { level, flags } = scoreText(combinedText);

    const propertyAddress = location ?? item.location ?? item.title.slice(0, 80);

    const lead: CraigslistLead = {
      clId: item.id,
      title: item.title,
      url: item.url,
      price,
      location: propertyAddress,
      description: description || item.title,
      phone,
      motivationLevel: level,
      motivationFlags: flags,
    };

    // Dedup on indexed external_id; ON CONFLICT makes concurrent runs safe
    // (no more check-then-insert race, no LIKE scan over notes).
    const [inserted] = await db
      .insert(leads)
      .values({
        sellerName: "CL Seller",
        propertyAddress,
        phone: phone ?? "",
        email: null,
        motivationLevel: level,
        askingPrice: price,
        keyPainPoints: flags.length ? flags.join(", ") : null,
        notes: `[cl:${item.id}] ${item.url}\n\n${description}`.slice(0, 2000),
        pipelineStage: "lead",
        leadType: "fsbo",
        isFsbo: true,
        confidenceLevel: level === "hot" ? "high" : level === "warm" ? "medium" : "low",
        externalId,
      })
      .onConflictDoNothing({ target: leads.externalId })
      .returning({ id: leads.id });

    if (inserted) {
      added++;
      newLeads.push(lead);
      // Pipeline: score + route immediately so hot leads flow to Maya
      // and warm/cold leads enroll in LadyJaye nurture tracks.
      try {
        await routeLead(inserted.id);
      } catch (err) {
        console.error("[scraper] routeLead error:", err);
      }
    }
  }

  return { found: items.length, added, newLeads };
}

// ── Scrape run log ───────────────────────────────────────────────────────────
// The scheduler records every run here; /findleads reads the latest row so the
// bot never scrapes live (serverless function timeouts).

export async function recordScrapeRun(
  db: Db,
  run: { status: "ok" | "error" | "blocked"; found: number; added: number; newLeads?: CraigslistLead[]; error?: string },
): Promise<void> {
  await db.insert(scrapeRuns).values({
    source: "craigslist",
    status: run.status,
    found: run.found,
    added: run.added,
    newLeadsJson: run.newLeads
      ? JSON.stringify(
          run.newLeads.map(l => ({
            title: l.title,
            price: l.price,
            phone: l.phone,
            motivationLevel: l.motivationLevel,
            motivationFlags: l.motivationFlags,
            url: l.url,
          })),
        )
      : null,
    error: run.error ?? null,
    finishedAt: new Date(),
  });
}

export async function getLatestScrapeRun(db: Db) {
  return db.query.scrapeRuns.findFirst({
    orderBy: [desc(scrapeRuns.startedAt)],
  });
}

export interface CachedLead {
  title: string;
  price: string | null;
  phone: string | null;
  motivationLevel: "hot" | "warm" | "cold";
  motivationFlags: string[];
  url: string;
}

// ── Background scheduler (long-lived deploys: Railway, VPS) ─────────────────
// Runs the scrape every 30 min inside the persistent server process, where
// there is no serverless function timeout. Overlap-guarded so a slow run
// never stacks on top of the previous one.

const SCRAPE_INTERVAL_MS = 30 * 60 * 1000;
let scrapeRunning = false;
let scrapeSchedulerStarted = false;

export async function runScheduledScrape(): Promise<void> {
  if (scrapeRunning) {
    console.log("[scrape-scheduler] previous run still in progress — skipping");
    return;
  }
  scrapeRunning = true;
  const db = getDb();
  try {
    const result = await runCraigslistScrape(db);
    if (result.blocked) {
      await recordScrapeRun(db, {
        status: "blocked",
        found: 0,
        added: 0,
        error: "Craigslist blocked the server IP (HTTP 403/429/503). Set CL_PROXY_URL to a residential proxy to restore scanning.",
      });
      console.log("[scrape-scheduler] run blocked by Craigslist — recorded, no alert sent");
      return;
    }
    await recordScrapeRun(db, {
      status: "ok",
      found: result.found,
      added: result.added,
      newLeads: result.newLeads,
    });
    console.log(`[scrape-scheduler] done: found=${result.found} added=${result.added}`);
    if (result.added > 0) {
      const msg = formatScrapeAlert(result);
      await sendAlert(msg, "quickkick");
      await sendAlert(msg, "ladyjaye");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scrape-scheduler] failed:", message);
    await recordScrapeRun(db, { status: "error", found: 0, added: 0, error: message }).catch(() => {});
  } finally {
    scrapeRunning = false;
  }
}

export function startScrapeScheduler(): void {
  if (scrapeSchedulerStarted) return;
  scrapeSchedulerStarted = true;
  // One run shortly after boot so /findleads has data, then every 30 min.
  setTimeout(() => runScheduledScrape().catch(() => {}), 60 * 1000);
  setInterval(() => runScheduledScrape().catch(() => {}), SCRAPE_INTERVAL_MS);
  console.log("[scrape-scheduler] Started — Craigslist scan every 30 min");
}

// ── Alert formatting ─────────────────────────────────────────────────────────

export function formatScrapeAlert(result: { found: number; added: number; newLeads: CraigslistLead[] }): string;
export function formatScrapeAlert(result: { found: number; added: number; newLeads: CachedLead[] }): string;
export function formatScrapeAlert(result: { found: number; added: number; newLeads: Array<CraigslistLead | CachedLead> }): string {
  const { found, added, newLeads } = result;

  if (added === 0) {
    return `🔍 <b>Craigslist Scan</b>\n\nChecked ${found} listings — no new leads found.`;
  }

  const hot = newLeads.filter(l => l.motivationLevel === "hot");
  const warm = newLeads.filter(l => l.motivationLevel === "warm");
  const cold = newLeads.filter(l => l.motivationLevel === "cold");

  let msg = `🔍 <b>Craigslist Scan</b> — ${added} new lead${added > 1 ? "s" : ""} found\n`;
  msg += `<i>Checked ${found} listings in Western MA</i>\n`;

  const formatGroup = (emoji: string, label: string, items: Array<CraigslistLead | CachedLead>) => {
    if (!items.length) return "";
    let s = `\n${emoji} <b>${label}</b>\n`;
    for (const l of items.slice(0, 3)) {
      const priceStr = l.price ? ` · $${Number(l.price).toLocaleString()}` : "";
      const phoneStr = l.phone ? `\n   📞 ${l.phone}` : "";
      // Titles come from Craigslist — escape before embedding in HTML mode.
      s += `\n• <b>${escapeHtml(l.title).slice(0, 60)}</b>${priceStr}${phoneStr}\n`;
      if (l.motivationFlags.length) s += `   ✓ ${l.motivationFlags.slice(0, 3).join(" · ")}\n`;
    }
    return s;
  };

  msg += formatGroup("🔥", "Hot", hot);
  msg += formatGroup("🌡", "Warm", warm);
  if (cold.length) msg += `\n❄️ ${cold.length} cold lead${cold.length > 1 ? "s" : ""} also added\n`;
  msg += `\nUse /leads to view all leads.`;

  return msg;
}
