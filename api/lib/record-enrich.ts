import { and, desc, eq, isNull, or } from "drizzle-orm";
import { leads } from "../../db/schema";
import { rentcastFetch, rentcastBudgetRemaining } from "./rentcast";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

// Public-record enrichment for hot leads (Erick: "hot leads only, stay on free").
// Looks up each lead's address on RentCast's property-records endpoint — data
// aggregated directly from public county records / tax assessors — and fills:
// last purchase date + price, full sale history, ownership tenure, assessed
// value, tax status, structural details, and owner identity.
//
// Quota: every lookup goes through the quota-guarded rentcastFetch (monthly
// cap, default 45). When the budget is exhausted the run stops quietly and
// resumes next month — the free tier is never exceeded by code.

export interface EnrichResult {
  ok: boolean;
  matched: boolean;
  quotaExhausted?: boolean;
  error?: string;
  // Which public-record fields RentCast actually had for this property —
  // coverage varies by county, so this tells us what the source can give us.
  present?: { history: boolean; lastSale: boolean; tax: boolean; owner: boolean };
}

export interface EnrichBatchResult {
  ok: boolean;
  checked: number;
  enriched: number;
  quotaExhausted: boolean;
  budgetRemaining: number;
  details?: Array<{ id: number; address: string | null; ok: boolean; error?: string; present?: EnrichResult["present"] }>;
  error?: string;
}

function fullAddress(l: any): string | null {
  const street = (l.propertyAddress ?? "").trim();
  if (!street) return null;
  // Avoid duplicating parts already embedded in propertyAddress
  // (e.g. "44 Greenacre Sq, Springfield, MA 01105" already has city/state/zip).
  const lower = street.toLowerCase();
  const extra = [l.city, l.state, l.zipCode]
    .filter(Boolean)
    .map((s: string) => String(s).trim())
    .filter((s) => s && !lower.includes(s.toLowerCase()));
  return [street, ...extra].join(", ");
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fullYearsBetween(from: Date, to: Date): number {
  let y = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) y--;
  return Math.max(0, y);
}

// Latest assessed value from taxAssessments keyed by year.
function latestAssessed(p: any): number | null {
  const ta = p?.taxAssessments;
  if (!ta || typeof ta !== "object") return null;
  const years = Object.keys(ta).map(Number).filter(Boolean).sort((a, b) => b - a);
  for (const y of years) {
    const v = Number(ta[String(y)]?.value);
    if (v > 0) return v;
  }
  return null;
}

// Normalize RentCast `history` (keyed by YYYY-MM-DD) into a sorted array,
// newest first.
function normalizeHistory(p: any): Array<{ date: string | null; price: number | null; type?: string | null }> {
  const h = p?.history;
  if (!h || typeof h !== "object") return [];
  return Object.entries(h)
    .map(([key, e]: [string, any]) => ({
      date: e?.date ?? key ?? null,
      price: e?.price != null ? Number(e.price) : null,
      type: e?.event ?? null,
    }))
    .filter((s) => s.date || s.price)
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

/** Enrich one lead by id. Returns matched=false when RentCast has no record. */
export async function enrichLeadRecord(db: Db, leadId: number): Promise<EnrichResult> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, matched: false, error: "lead not found" };

  const addr = fullAddress(lead);
  if (!addr) {
    // Mark attempted so we don't retry an unusable address every run.
    await db.update(leads).set({ saleHistory: [] }).where(eq(leads.id, leadId)).catch(() => {});
    return { ok: false, matched: false, error: "no usable address" };
  }

  let data: any;
  try {
    data = await rentcastFetch(db, `/properties?address=${encodeURIComponent(addr)}&limit=1`);
  } catch (err: any) {
    return { ok: false, matched: false, error: err?.message ?? String(err) };
  }
  if (data === null) return { ok: false, matched: false, quotaExhausted: true };

  const p = Array.isArray(data) ? data[0] : data?.properties?.[0];
  if (!p) {
    // No public record found — mark attempted (empty array) so the address
    // isn't re-queried on every run.
    await db.update(leads).set({ saleHistory: [] }).where(eq(leads.id, leadId)).catch(() => {});
    return { ok: false, matched: true, error: "no record found", present: { history: false, lastSale: false, tax: false, owner: false } };
  }

  const history = normalizeHistory(p);
  const lastSaleDate = parseDate(p.lastSaleDate) ?? parseDate(history[0]?.date);
  const lastSalePrice = p.lastSalePrice != null ? Number(p.lastSalePrice) : history[0]?.price ?? null;
  const assessed = latestAssessed(p);
  const present = {
    history: history.length > 0,
    lastSale: !!(p.lastSaleDate || p.lastSalePrice),
    tax: assessed != null,
    owner: Array.isArray(p?.owner?.names) && p.owner.names.length > 0,
  };
  const ownerNames: string[] = Array.isArray(p?.owner?.names) ? p.owner.names : [];
  const mail = p?.owner?.mailingAddress;
  const mailStr = mail
    ? [mail.addressLine1, mail.city, mail.state, mail.zipCode].filter(Boolean).join(", ")
    : "";

  const patch: any = {
    saleHistory: history,
    updatedAt: new Date(),
  };
  if (lastSaleDate) {
    patch.lastSaleDate = lastSaleDate;
    patch.ownershipYears = fullYearsBetween(lastSaleDate, new Date());
  }
  if (lastSalePrice != null && Number.isFinite(lastSalePrice)) patch.lastSalePrice = String(lastSalePrice);
  if (assessed) {
    patch.assessedValue = String(assessed);
    if (!lead.estimatedValue) patch.estimatedValue = String(assessed);
  }
  const beds = Number(p?.bedrooms ?? 0);
  if (beds > 0 && !lead.beds) patch.beds = beds;
  const baths = Number(p?.bathrooms ?? 0);
  if (baths > 0 && !lead.baths) patch.baths = String(baths);
  const sqft = Number(p?.squareFootage ?? 0);
  if (sqft > 0 && !lead.squareFootage) patch.squareFootage = sqft;
  const yb = Number(p?.yearBuilt ?? 0);
  if (yb > 0 && !lead.yearBuilt) patch.yearBuilt = yb;
  if (p?.county && !lead.county) patch.county = String(p.county).slice(0, 100);
  // Fill owner identity only when the lead has a placeholder/generic name.
  const genericName = !lead.sellerName || /^(registry owner|cl seller|unknown)$/i.test(lead.sellerName.trim());
  if (genericName && ownerNames[0]) patch.sellerName = ownerNames[0].slice(0, 255);
  if (mailStr && !lead.ownerMailingAddress) patch.ownerMailingAddress = mailStr;
  if (typeof p?.ownerOccupied === "boolean") patch.isAbsentee = !p.ownerOccupied;

  await db.update(leads).set(patch).where(eq(leads.id, leadId));
  return { ok: true, matched: true, present };
}

/**
 * Enrich hot leads missing public-record data, highest score first.
 * Stops at `limit` or when the monthly RentCast budget runs out.
 * `retryEmpty` re-processes leads whose earlier lookup found nothing
 * (useful after address-matching fixes or coverage improvements).
 */
export async function enrichHotLeadRecords(
  db: Db,
  limit: number,
  retryEmpty = false
): Promise<EnrichBatchResult> {
  const budget = await rentcastBudgetRemaining(db);
  if (budget <= 0) {
    return { ok: true, checked: 0, enriched: 0, quotaExhausted: true, budgetRemaining: 0 };
  }
  const n = Math.min(limit, budget);

  const attempted = retryEmpty
    ? sql`${leads.saleHistory} = '[]'::jsonb`
    : sql`1 = 0`;
  const candidates = await db.query.leads.findMany({
    where: and(
      or(isNull(leads.saleHistory), attempted),
      isNull(leads.lastSaleDate),
      or(eq(leads.pipelineStage, "hot_routing" as any), eq(leads.motivationLevel, "hot" as any))
    ),
    orderBy: [desc(leads.leadScore)],
    limit: n,
  });

  const details: EnrichBatchResult["details"] = [];
  let enriched = 0;
  let quotaExhausted = false;
  for (const c of candidates) {
    const r = await enrichLeadRecord(db, c.id);
    details.push({ id: c.id, address: c.propertyAddress, ok: r.ok, error: r.error, present: r.present });
    if (r.quotaExhausted) {
      quotaExhausted = true;
      break;
    }
    if (r.ok) enriched++;
  }

  return {
    ok: true,
    checked: candidates.length,
    enriched,
    quotaExhausted,
    budgetRemaining: await rentcastBudgetRemaining(db),
    details,
  };
}
