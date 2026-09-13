import { leads, scrapeRuns } from "../../db/schema";
import { env } from "./env";
import { routeLead } from "./pipeline-engine";
import { getDb } from "../queries/connection";
import { sendAlert } from "./telegram";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

// RentCast property-records API. Licensed data, self-serve instant key, no
// anti-bot challenge (unlike the Imperva-protected county registry portal).
// Auth is a static X-Api-Key header. Target ZIPs / per-ZIP limit are env
// configurable so coverage and API spend can be tuned without a code change.
const RENTCAST_BASE = "https://api.rentcast.io/v1";

// Western MA (Hampden / Hampshire / Franklin / Berkshire) postal codes.
const DEFAULT_ZIPS = [
  "01103", "01104", "01105", "01107", "01108", "01109", // Springfield
  "01013", "01020", // Chicopee
  "01040", // Holyoke
  "01085", // Westfield
  "01001", // Agawam
  "01056", // Ludlow
  "01069", // Palmer
  "01060", "01062", // Northampton
  "01201", // Pittsfield
  "01301", // Greenfield
];
const DEFAULT_LIMIT_PER_ZIP = 50;
const MAX_ZIPS = 25;

export interface RegistryLead {
  recordId: string;
  address: string;
  city: string | null;
  price: string | null;
  motivationLevel: "hot" | "warm" | "cold";
  motivationFlags: string[];
  leadType: string;
}

export interface RegistryResult {
  ok: boolean;
  found: number;
  added: number;
  newLeads: RegistryLead[];
  error?: string;
}

function targetZips(): string[] {
  const raw = env.registryZips?.split(",").map((s) => s.trim()).filter(Boolean);
  return (raw && raw.length ? raw : DEFAULT_ZIPS).slice(0, MAX_ZIPS);
}

function limitPerZip(): number {
  const n = parseInt(env.registryLimitPerZip || "", 10);
  return Number.isFinite(n) && n > 0 && n <= 500 ? n : DEFAULT_LIMIT_PER_ZIP;
}

async function fetchZip(zip: string, limit: number): Promise<any[]> {
  const url = `${RENTCAST_BASE}/properties?zipCode=${encodeURIComponent(zip)}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": env.rentcastApiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`RentCast ${zip} → ${res.status}`);
  const data: any = await res.json();
  return Array.isArray(data) ? data : Array.isArray(data?.properties) ? data.properties : [];
}

const ENTITY_RE = /\b(LLC|L\.?L\.?C|LLP|INC|CORP|LP|TRUST|HOLDINGS?|PROPERT(?:Y|IES)|ENTERPRISES?|REALTY|INVESTMENTS?|GROUP|VENTURES?)\b/i;
// Government / institutional owners — public records, but not sellable leads.
const GOV_RE = /\b(HOUSING AUTH|AUTHORITY|CITY OF|TOWN OF|COMMONWEALTH|STATE OF|COUNTY OF|UNITED STATES|U\.?S\.?A|FEDERAL|MUNICIPAL|REDEVELOPMENT|CHURCH|DIOCESE|UNIVERSITY|COLLEGE|SCHOOL DIST)\b/i;

// Latest available assessed value from taxAssessments (keyed by year).
function latestAssessedValue(p: any): number | null {
  const ta = p?.taxAssessments;
  if (!ta || typeof ta !== "object") return null;
  const years = Object.keys(ta).map(Number).filter(Boolean).sort((a, b) => b - a);
  for (const y of years) {
    const v = Number(ta[String(y)]?.value);
    if (v > 0) return v;
  }
  return null;
}

// Defensive scoring against the fields RentCast actually returns on this plan:
// owner / ownerOccupied / mailingAddress are present on a minority of records
// (the ones worth surfacing); sale history is not returned, so no tenure signal.
function scoreProperty(p: any): { level: "hot" | "warm" | "cold"; flags: string[]; leadType: string; ownerName: string | null; absentee: boolean } {
  const flags: string[] = [];
  let score = 0;
  let leadType = "other";
  let absentee = false;

  const ownerNames = Array.isArray(p?.owner?.names) ? p.owner.names : [];
  const ownerName = ownerNames[0] ?? null;

  // Government / institutional owners aren't sellable — drop them entirely.
  if (ownerName && GOV_RE.test(ownerName)) {
    return { level: "cold", flags: [], leadType: "other", ownerName, absentee };
  }

  // Absentee owner — the primary motivated-seller signal.
  if (p?.ownerOccupied === false) {
    score += 3;
    absentee = true;
    flags.push("absentee owner");
    leadType = "absentee_owner";
  }

  // Entity/investor ownership (LLC, trust, etc.).
  if (ownerName && ENTITY_RE.test(ownerName)) {
    score += 2;
    flags.push("entity owner");
    if (leadType === "other") leadType = "absentee_owner";
  }

  // Owner mailing address in a different town than the property.
  const propCity = String(p?.city ?? "").toLowerCase().trim();
  const mailCity = String(p?.owner?.mailingAddress?.city ?? "").toLowerCase().trim();
  if (propCity && mailCity && propCity !== mailCity) {
    score += 1;
    if (!flags.includes("absentee owner")) flags.push("out-of-town owner");
  }

  // Older construction → more likely to need work (condition-based motivation).
  const yearBuilt = Number(p?.yearBuilt ?? 0);
  if (yearBuilt && yearBuilt <= 1960) {
    score += 1;
    flags.push("older home");
  }

  const level = score >= 5 ? "hot" : score >= 2 ? "warm" : "cold";
  return { level, flags: [...new Set(flags)], leadType, ownerName, absentee };
}

export async function runRegistryScrape(db: Db): Promise<RegistryResult> {
  const startedAt = new Date();
  const newLeads: RegistryLead[] = [];
  let found = 0;
  let added = 0;
  let ok = true;
  let error: string | undefined;

  try {
    if (!env.rentcastApiKey) throw new Error("RENTCAST_API_KEY not configured");
    const limit = limitPerZip();

    for (const zip of targetZips()) {
      const props = await fetchZip(zip, limit);
      found += props.length;

      for (const p of props) {
        const recordId = String(p?.id ?? p?.formattedAddress ?? "");
        const address = String(p?.formattedAddress ?? p?.addressLine1 ?? "").trim();
        if (!recordId || !address) continue;

        // Only surface motivated records — skip owner-occupied / no-signal
        // properties so the full tax roll doesn't land in leads.
        const { level, flags, leadType, ownerName, absentee } = scoreProperty(p);
        if (level === "cold") continue;

        const externalId = `rc:${recordId}`;
        const city = p?.city != null ? String(p.city).slice(0, 100) : null;
        const value = latestAssessedValue(p);
        const mail = p?.owner?.mailingAddress;
        const mailStr = mail
          ? [mail.addressLine1, mail.city, mail.state, mail.zipCode].filter(Boolean).join(", ")
          : "";
        const yearBuilt = Number(p?.yearBuilt ?? 0) || null;

        // Dedup on indexed external_id; ON CONFLICT makes concurrent runs safe
        // (no more check-then-insert race, no LIKE scan over notes).
        const [inserted] = await db
          .insert(leads)
          .values({
            sellerName: (ownerName ?? "Registry Owner").slice(0, 255),
            propertyAddress: address.slice(0, 255),
            city,
            phone: "",
            email: null,
            motivationLevel: level,
            assessedValue: value ? String(value) : null,
            estimatedValue: value ? String(value) : null,
            yearBuilt,
            keyPainPoints: flags.length ? flags.join(", ") : null,
            ownerMailingAddress: mailStr || null,
            isAbsentee: absentee,
            notes: `[rc:${recordId}] ${address}${mailStr ? `\nOwner mailing: ${mailStr}` : ""}${flags.length ? `\nFlags: ${flags.join(", ")}` : ""}`.slice(0, 2000),
            pipelineStage: "lead",
            leadType: leadType as any,
            confidenceLevel: level === "hot" ? "high" : "medium",
            externalId,
          })
          .onConflictDoNothing({ target: leads.externalId })
          .returning({ id: leads.id });

        if (inserted) {
          added++;
          newLeads.push({
            recordId,
            address,
            city,
            price: value ? String(value) : null,
            motivationLevel: level,
            motivationFlags: flags,
            leadType,
          });
          // Pipeline: score + route immediately so leads flow into the same
          // engine as Craigslist leads (phoneless ones go to skip tracing).
          try {
            await routeLead(inserted.id);
          } catch (routeErr) {
            console.error("[rentcast] routeLead error:", routeErr);
          }
        }
      }
    }
  } catch (err: any) {
    ok = false;
    error = err?.message ?? String(err);
  }

  // Audit every run — best-effort, never let logging mask the result.
  try {
    await db.insert(scrapeRuns).values({
      source: "rentcast",
      status: ok ? "ok" : "error",
      found,
      added,
      newLeadsJson: JSON.stringify(
        newLeads.map((l) => ({ address: l.address, price: l.price, motivationLevel: l.motivationLevel, motivationFlags: l.motivationFlags }))
      ),
      error: error ?? null,
      startedAt,
      finishedAt: new Date(),
    });
  } catch {
    // ignore logging failure
  }

  return { ok, found, added, newLeads, error };
}

export function formatRegistryAlert(result: RegistryResult): string {
  const { found, added, newLeads } = result;

  if (!result.ok) {
    return (
      `⚠️ <b>Registry Scan Failed</b>\n\n` +
      `${result.error ?? "Unknown error"}\n\n` +
      `<i>Check RENTCAST_API_KEY and your plan's request quota.</i>`
    );
  }

  if (added === 0) {
    return `🏛 <b>Registry Scan</b>\n\nChecked ${found} records — no new motivated leads found.`;
  }

  const hot = newLeads.filter((l) => l.motivationLevel === "hot");
  const warm = newLeads.filter((l) => l.motivationLevel === "warm");

  let msg = `🏛 <b>Registry Scan</b> — ${added} new lead${added > 1 ? "s" : ""} found\n`;
  msg += `<i>Checked ${found} records via RentCast</i>\n`;

  const formatGroup = (emoji: string, label: string, items: RegistryLead[]) => {
    if (!items.length) return "";
    let s = `\n${emoji} <b>${label}</b>\n`;
    for (const l of items.slice(0, 3)) {
      const priceStr = l.price ? ` · ~$${Number(l.price).toLocaleString()}` : "";
      s += `\n• <b>${l.address.slice(0, 60)}</b>${priceStr}\n`;
      if (l.motivationFlags.length) s += `   ✓ ${l.motivationFlags.slice(0, 3).join(" · ")}\n`;
    }
    return s;
  };

  msg += formatGroup("🔥", "Hot", hot);
  msg += formatGroup("🌡", "Warm", warm);
  msg += `\nSkip-trace these owners, then use /leads to work them.`;

  return msg;
}

// ── Scheduler ────────────────────────────────────────────────────────────────
// RentCast is the licensed replacement for the Imperva-blocked Hampden portal,
// so it runs on the same in-process cadence as the other sources. Daily is
// enough — registry/ownership data changes slowly and RentCast bills per call.
const RENTCAST_INTERVAL_MS = 24 * 60 * 60 * 1000;
let rentcastSchedulerStarted = false;

async function runScheduledRentcastScrape(): Promise<void> {
  const db = getDb();
  const result = await runRegistryScrape(db);
  if (result.added > 0 || !result.ok) {
    await sendAlert(formatRegistryAlert(result), "quickkick").catch(() => {});
  }
}

export function startRentcastScheduler(): void {
  if (rentcastSchedulerStarted) return;
  if (!env.rentcastApiKey) {
    console.log("[rentcast-scheduler] Skipped — RENTCAST_API_KEY not set");
    return;
  }
  rentcastSchedulerStarted = true;
  // First run a few minutes after boot, then daily.
  setTimeout(() => runScheduledRentcastScrape().catch(() => {}), 3 * 60 * 1000);
  setInterval(() => runScheduledRentcastScrape().catch(() => {}), RENTCAST_INTERVAL_MS);
  console.log("[rentcast-scheduler] Started — RentCast registry scan daily");
}
