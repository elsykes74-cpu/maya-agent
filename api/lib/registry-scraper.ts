// ─── Hampden County Registry of Deeds — distressed-filing scraper ─────────────
// Source: search.hampdendeeds.com ALIS index (legacy endpoint, still live).
// Pulls recently recorded LIS PENDENS / ORDER OF NOTICE / FORECLOSURE DEED
// filings and inserts them as pre-foreclosure leads.
//
// Two hard realities this module is built around:
//  1. The registry sits behind Imperva Incapsula. A plain datacenter fetch gets
//     a JS challenge (/_Incapsula_Resource). All traffic honors REGISTRY_PROXY_URL
//     (falls back to CL_PROXY_URL) — a residential IP usually skips the challenge.
//     If the challenge still fires, the run records status "blocked" instead of
//     crashing, exactly like the Craigslist scraper.
//  2. Registry filings carry OWNER NAME + PROPERTY ADDRESS but NO PHONE.
//     These leads stay in pipeline_stage "lead" (unrouted) until skip-traced —
//     the pipeline already refuses to call/text phoneless leads, so nothing
//     misfires. routeLead is deliberately NOT called here.

import { proxiedFetch } from "./proxy-fetch";
import { leads, scrapeRuns, activities } from "../../db/schema";
import { escapeHtml, sendAlert } from "./telegram";
import { getDb } from "../queries/connection";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

const ALIS_BASE = "https://search.hampdendeeds.com/ALIS/WW400R.HTM";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Distress instrument types — filtered CLIENT-SIDE because the ALIS W9ABR
// document-type codes are not publicly documented. Query *ALL, filter here.
const DISTRESS_TYPES = [
  { match: /LIS\s+PENDENS/i, label: "LIS PENDENS" },
  { match: /ORDER\s+OF\s+NOTICE/i, label: "ORDER OF NOTICE" },
  { match: /FORECLOSURE\s+DEED/i, label: "FORECLOSURE DEED" },
  { match: /NOTICE\s+OF\s+FORECLOSURE/i, label: "NOTICE OF FORECLOSURE" },
] as const;

// How far back each run looks (days). Registry filings are low-volume;
// a weekly run with a 9-day window overlaps safely.
const DEFAULT_LOOKBACK_DAYS = 9;
// Politeness: robots.txt is Disallow:/ — keep requests slow and few.
const REQUEST_DELAY_MS = 2500;

export interface RegistryFiling {
  instNumber: string; // "Inst #: NNNNN"
  bookPage: string | null; // "Bk-Pg:NNNNN-NNN"
  docType: string; // matched distress label
  rawRow: string; // cleaned row text (best-effort party/address source)
  grantor: string | null;
  street: string | null;
  town: string | null;
  recordingDate: string | null;
}

export interface RegistryScrapeResult {
  found: number; // distress filings matched in window
  added: number; // new leads inserted
  filings: RegistryFiling[];
  blocked?: boolean; // Imperva challenge fired
}

// ── Egress ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function alisDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}${dd}${d.getFullYear()}`;
}

// Parameter ORDER matters to ALIS (per the registry's own scraper authors).
function buildAlisUrl(from: Date, to: Date): string {
  const params = [
    "W9ABR=*ALL",
    "W9TOWN=*ALL",
    `W9FDTA=${alisDate(from)}`,
    `W9TDTA=${alisDate(to)}`,
    "WSHTNM=WW414R00",
    "WSIQTP=SY14AP",
    "WSKYCD=T",
    "WSWVER=2",
  ];
  return `${ALIS_BASE}?${params.join("&")}`;
}

async function alisFetch(url: string, cookieHeader?: string): Promise<{ res: Response; setCookies: string[] }> {
  const res = await proxiedFetch(
    url,
    {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Upgrade-Insecure-Requests": "1",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    },
    process.env.REGISTRY_PROXY_URL || process.env.CL_PROXY_URL,
  );
  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === "function"
      ? (res.headers as any).getSetCookie()
      : [];
  return { res, setCookies };
}

// ALIS does a cookie-check: first hit 302s and sets session cookies, the
// repeat hit with cookies returns results. Returns null when the Imperva
// JS challenge fires (plain HTTP can't solve it).
async function fetchAlisResults(url: string): Promise<{ html: string } | { challenged: true }> {
  const first = await alisFetch(url);
  // Follow the 302 manually so we control cookies.
  const loc = first.res.headers.get("location");
  const cookieHeader = first.setCookies.map(c => c.split(";")[0]).join("; ");
  await sleep(REQUEST_DELAY_MS);
  const second = await alisFetch(loc || url, cookieHeader || undefined);
  const html = await second.res.text();
  if (html.includes("_Incapsula_Resource") || html.includes("incapsula")) {
    console.warn("[registry] Imperva challenge fired — residential proxy likely needed");
    return { challenged: true };
  }
  return { html };
}

// ── Row parsing ──────────────────────────────────────────────────────────────
// Verified row shape (from the registry's result table):
//   <tr> … <a title="View Document Image"> … "Bk-Pg:24417-378 … Inst #: 11253 …"
// Column labels for parties/address were not verifiable without a live results
// page, so grantor/street parse best-effort and the full row text is kept.

function cleanText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAlisRows(html: string): RegistryFiling[] {
  const filings: RegistryFiling[] = [];
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const rowHtml = m[0];
    if (!rowHtml.includes("View Document Image")) continue;
    const text = cleanText(rowHtml);

    const bkpg = text.match(/Bk-Pg:\s*([\d-]+)/i)?.[1] ?? null;
    const inst = text.match(/Inst #:\s*(\d+)/i)?.[1] ?? null;
    if (!inst && !bkpg) continue;

    const distress = DISTRESS_TYPES.find(d => d.match.test(text));
    if (!distress) continue;

    // Best-effort: strip the tokens we already extracted, then look for
    // labeled fragments; otherwise keep the raw row for human review.
    let rest = text
      .replace(/Bk-Pg:\s*[\d-]+/i, " ")
      .replace(/Inst #:\s*\d+/i, " ")
      .replace(distress.match, " ")
      .replace(/\s+/g, " ")
      .trim();

    const grantor =
      rest.match(/(?:grantor|from)\s*:\s*([^:]{2,80}?)(?=\s{2,}|$)/i)?.[1]?.trim() ?? null;
    // Street: number + name + recognized suffix. The negative lookahead skips
    // 4-digit years (19xx/20xx) so dates don't parse as house numbers.
    const street =
      rest
        .match(
          /\b(?!(?:19|20)\d{2}\b)(\d{1,6}\s+[A-Z0-9][A-Z0-9 .'-]{1,40}?\s+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|PL|PLACE|BLVD|BOULEVARD|WAY|TER|TERRACE|PKWY|PARKWAY))\b/i,
        )?.[1]?.trim() ?? null;
    const town =
      rest.match(
        /\b(SPRINGFIELD|HOLYOKE|CHICOPEE|WESTFIELD|AGAWAM|WEST SPRINGFIELD|EAST LONGMEADOW|LONGMEADOW|LUDLOW|SOUTHWICK|WILBRAHAM|PALMER|MONSON|WARE|BRIMFIELD|HOLLAND|WALES|GRANVILLE|TOLLAND|BLANDFORD|CHESTER|RUSSELL|MONTGOMERY|SOUTHHAMPTON|EASTHAMPTON|SOUTH HADLEY|GRANBY|BELCHERTOWN)\b/i,
      )?.[1]?.toUpperCase() ?? null;
    const recordingDate = rest.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] ?? null;

    filings.push({
      instNumber: inst ?? `bkpg-${bkpg}`,
      bookPage: bkpg,
      docType: distress.label,
      rawRow: text.slice(0, 600),
      grantor,
      street,
      town,
      recordingDate,
    });
  }
  return filings;
}

// ── Scrape → leads ───────────────────────────────────────────────────────────

export async function runRegistryScrape(
  db: Db,
  opts: { lookbackDays?: number } = {},
): Promise<RegistryScrapeResult> {
  const lookback = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const to = new Date();
  const from = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);
  const url = buildAlisUrl(from, to);

  const fetched = await fetchAlisResults(url);
  if ("challenged" in fetched) {
    return { found: 0, added: 0, filings: [], blocked: true };
  }

  if (/no \(more\) matching names found/i.test(fetched.html)) {
    return { found: 0, added: 0, filings: [] };
  }

  return ingestRegistryHtml(db, fetched.html);
}

// ── Browser-fed ingest ───────────────────────────────────────────────────────
// GitHub Actions runs a real Playwright browser (which solves the Imperva JS
// challenge), then POSTs the rendered HTML here via /api/cron/registry-ingest.
// Same parse + insert path as runRegistryScrape, minus the direct fetch.

export async function ingestRegistryHtml(db: Db, html: string): Promise<RegistryScrapeResult> {
  if (/no \(more\) matching names found/i.test(html)) {
    return { found: 0, added: 0, filings: [] };
  }
  const filings = parseAlisRows(html);
  return insertRegistryFilings(db, filings);
}

async function insertRegistryFilings(db: Db, filings: RegistryFiling[]): Promise<RegistryScrapeResult> {
  let added = 0;
  const newFilings: RegistryFiling[] = [];

  for (const f of filings) {
    const externalId = `reg:inst:${f.instNumber}`;
    const [inserted] = await db
      .insert(leads)
      .values({
        sellerName: f.grantor ?? "Registry filing — see notes",
        propertyAddress: f.street ?? "Address in filing — see notes",
        city: f.town,
        county: "Hampden",
        state: "MA",
        phone: null,
        motivationLevel: "hot",
        leadType: "pre_foreclosure",
        isPreForeclosure: true,
        foreclosureStatus: f.docType,
        leadScore: 75,
        pipelineStage: "lead", // unrouted: needs skip trace for a phone first
        keyPainPoints: f.docType.toLowerCase(),
        notes:
          `Hampden Registry — ${f.docType} recorded ${f.recordingDate ?? "recently"}\n` +
          `Inst #${f.instNumber}${f.bookPage ? ` · Bk-Pg ${f.bookPage}` : ""}\n` +
          `Row: ${f.rawRow}`.slice(0, 2000),
        externalId,
      } as any)
      .onConflictDoNothing({ target: leads.externalId })
      .returning({ id: leads.id });

    if (inserted) {
      added++;
      newFilings.push(f);
      await db.insert(activities).values({
        leadId: inserted.id,
        type: "system",
        body: `🏛️ Registry filing: ${f.docType} (Inst #${f.instNumber}). No phone on file — skip trace before routing.`,
      } as any);
    }
    await sleep(200);
  }

  return { found: filings.length, added, filings: newFilings };
}

export async function recordRegistryRun(
  db: Db,
  run: { status: "ok" | "error" | "blocked"; found: number; added: number; error?: string },
): Promise<void> {
  await db.insert(scrapeRuns).values({
    source: "registry",
    status: run.status,
    found: run.found,
    added: run.added,
    newLeadsJson: null,
    error: run.error ?? null,
    finishedAt: new Date(),
  });
}

export function formatRegistryAlert(result: RegistryScrapeResult): string {
  if (result.added === 0) {
    return `🏛️ <b>Registry Scan</b>\n\nChecked recent Hampden filings — no new distress filings found.`;
  }
  let msg = `🏛️ <b>Registry Scan</b> — ${result.added} new distress filing${result.added > 1 ? "s" : ""}\n`;
  msg += `<i>Hampden County Registry of Deeds</i>\n`;
  for (const f of result.filings.slice(0, 5)) {
    msg += `\n• <b>${escapeHtml(f.docType)}</b> — ${escapeHtml(f.grantor ?? "owner in filing")}`;
    if (f.street) msg += `\n   📍 ${escapeHtml(f.street)}${f.town ? `, ${escapeHtml(f.town)}` : ""}`;
    msg += `\n   Inst #${escapeHtml(f.instNumber)} — <i>skip trace for phone</i>\n`;
  }
  msg += `\nThese have no phone numbers yet — skip trace before Maya/LadyJaye can work them.`;
  return msg;
}

// ── Scheduler (weekly — filings are low-volume) ──────────────────────────────

const REGISTRY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
let registryRunning = false;
let registrySchedulerStarted = false;

export async function runScheduledRegistryScrape(): Promise<void> {
  if (registryRunning) {
    console.log("[registry-scheduler] previous run still in progress — skipping");
    return;
  }
  registryRunning = true;
  const db = getDb();
  try {
    const result = await runRegistryScrape(db);
    if (result.blocked) {
      await recordRegistryRun(db, {
        status: "blocked",
        found: 0,
        added: 0,
        error:
          "Registry bot challenge fired (Imperva). Set REGISTRY_PROXY_URL (or CL_PROXY_URL) to a residential proxy to restore scanning.",
      });
      console.log("[registry-scheduler] run challenged — recorded, no alert sent");
      return;
    }
    await recordRegistryRun(db, { status: "ok", found: result.found, added: result.added });
    console.log(`[registry-scheduler] done: found=${result.found} added=${result.added}`);
    if (result.added > 0) {
      await sendAlert(formatRegistryAlert(result), "quickkick");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[registry-scheduler] failed:", message);
    await recordRegistryRun(db, { status: "error", found: 0, added: 0, error: message }).catch(() => {});
  } finally {
    registryRunning = false;
  }
}

export function startRegistryScheduler(): void {
  if (registrySchedulerStarted) return;
  registrySchedulerStarted = true;
  setTimeout(() => runScheduledRegistryScrape().catch(() => {}), 5 * 60 * 1000);
  setInterval(() => runScheduledRegistryScrape().catch(() => {}), REGISTRY_INTERVAL_MS);
  console.log("[registry-scheduler] Started — Hampden registry scan weekly");
}
