import { desc } from "drizzle-orm";
import { leads, scrapeRuns } from "../../db/schema";
import { escapeHtml, sendAlert } from "./telegram";
import { getDb } from "../queries/connection";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

const CL_BASE = "https://westernmass.craigslist.org";
const CL_RSS = `${CL_BASE}/search/rea?format=rss&sort=date`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

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

// ── RSS parsing (CL uses CDATA) ────────────────────────────────────────────────

function extractCdata(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i");
  return xml.match(re)?.[1]?.trim() ?? "";
}

function parseRssItems(xml: string) {
  const items: Array<{ id: string; title: string; url: string; blurb: string; pubDate: string }> = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const chunk = m[1];
    const title = extractCdata(chunk, "title");
    const url = extractCdata(chunk, "link") || extractCdata(chunk, "guid");
    const blurb = extractCdata(chunk, "description");
    const pubDate = extractCdata(chunk, "pubDate");
    const id = url.match(/\/(\d{10,})\./)?.[1] ?? "";
    if (id && title) items.push({ id, title, url, blurb, pubDate });
  }
  return items;
}

// ── Detail page ──────────────────────────────────────────────────────────────
async function fetchDetail(url: string): Promise<{ description: string; phone: string | null; location: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { description: "", phone: null, location: null };
    const html = await res.text();

    // Posting body
    const bodyMatch = html.match(/<section[^>]+id="postingbody"[^>]*>([\s\S]*?)<\/section>/);
    const rawBody = bodyMatch?.[1] ?? "";
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

    // Map data-accuracy / data-latitude for location (CL embeds it)
    const cityMatch = html.match(/<meta content="([^"]+(?:Springfield|Holyoke|Chicopee|Westfield|Agawam|Northampton|Pittsfield|Ludlow|Palmer|Ware|Easthampton)[^"]*)" /i);
    const location = cityMatch?.[1]?.trim() ?? null;

    return { description, phone, location };
  } catch {
    return { description: "", phone: null, location: null };
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
}

export async function runCraigslistScrape(
  db: Db,
  opts: { maxItems?: number } = {},
): Promise<ScrapeResult> {
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const res = await fetch(CL_RSS, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Craigslist fetch failed: ${res.status}`);
  const xml = await res.text();

  const items = parseRssItems(xml);
  const newLeads: CraigslistLead[] = [];
  let added = 0;

  for (const item of items.slice(0, maxItems)) {
    const externalId = `cl:${item.id}`;

    // Rate limit — be polite to CL
    await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
    const { description, phone, location } = await fetchDetail(item.url);

    const combinedText = `${item.title} ${item.blurb} ${description}`;
    const price = parsePrice(item.title) ?? parsePrice(description);
    const { level, flags } = scoreText(combinedText);

    // Try to extract a readable address from blurb
    const blurbText = item.blurb.replace(/<[^>]+>/g, " ").trim();
    const propertyAddress = location ?? (blurbText.slice(0, 80) || item.title.slice(0, 80));

    const lead: CraigslistLead = {
      clId: item.id,
      title: item.title,
      url: item.url,
      price,
      location: propertyAddress,
      description: description || blurbText.slice(0, 500),
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
    }
  }

  return { found: items.length, added, newLeads };
}

// ── Scrape run log ───────────────────────────────────────────────────────────
// The scheduler records every run here; /findleads reads the latest row so the
// bot never scrapes live (serverless function timeouts).

export async function recordScrapeRun(
  db: Db,
  run: { status: "ok" | "error"; found: number; added: number; newLeads?: CraigslistLead[]; error?: string },
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
