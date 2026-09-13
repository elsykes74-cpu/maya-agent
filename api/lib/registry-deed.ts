import { and, desc, eq, isNull } from "drizzle-orm";
import { leads } from "../../db/schema";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

// Registry deed lookup (Erick: "hot leads only, stay on free").
//
// RentCast property records have NO sale history for Hampden County, so
// last-purchase dates come from the Hampden County Registry of Deeds itself:
// a browser automation searches each hot lead's address on the registry's
// public address index and POSTs the recorded deeds here.
//
// What the registry index gives us per deed: book/page, recording date,
// document type, grantor/grantee. What it does NOT give: the sale price
// (consideration only appears on the scanned document image). So this fills
// lastSaleDate + the deed chain, never lastSalePrice.

export interface DeedQueueEntry {
  id: number;
  street: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface RegistryDeed {
  recordedDate: string; // YYYY-MM-DD
  book: string | null;
  page: string | null;
  docType: string | null;
  /** Raw Doc$ figure from the index row, if present. On deed-type rows this is
   *  the stated consideration (sale price); on mortgages it would be the loan
   *  amount — the ingest only maps it to price for deeds. */
  docAmount?: string | null;
  grantor: string | null;
  grantee: string | null;
}

function parseStreet(propertyAddress: string | null | undefined): string | null {
  if (!propertyAddress) return null;
  // "37 Spruce St, Springfield, MA 01105" -> "37 Spruce St"
  const street = propertyAddress.split(",")[0]?.trim();
  return street || null;
}

/** "67,100.00" -> 67100; null when unparseable. */
function parseDocAmount(raw: string): number | null {
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Deed-type rows only — Doc$ on a mortgage is the loan amount, never a price. */
function isDeedLike(docType: string | null): boolean {
  return /deed/i.test(docType || "");
}

/**
 * Hot leads (pipelineStage = hot_routing, the canonical Hot definition) whose
 * address has never been checked against the registry deed index.
 * ?retry=1 includes already-checked leads (re-runs after scraper fixes).
 */
export async function getDeedLookupQueue(db: Db, limit: number, retry = false): Promise<DeedQueueEntry[]> {
  const rows = await db.query.leads.findMany({
    where: retry
      ? eq(leads.pipelineStage, "hot_routing" as any)
      : and(
          eq(leads.pipelineStage, "hot_routing" as any),
          isNull(leads.registryDeedCheckedAt)
        ),
    orderBy: [desc(leads.leadScore)],
    limit,
  });
  const out: DeedQueueEntry[] = [];
  for (const r of rows) {
    const street = parseStreet(r.propertyAddress as any);
    if (!street) {
      // No usable address — mark checked so it never blocks the queue.
      await db.update(leads).set({ registryDeedCheckedAt: new Date() }).where(eq(leads.id, r.id)).catch(() => {});
      continue;
    }
    out.push({
      id: r.id,
      street,
      city: r.city ?? null,
      state: r.state ?? null,
      zip: r.zipCode ?? null,
    });
  }
  return out;
}

function parseIsoDate(v: any): Date | null {
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

export interface DeedIngestResult {
  ok: boolean;
  leadId: number;
  deedsFound: number;
  lastSaleDate: string | null;
  error?: string;
}

/**
 * Store recorded deeds for a lead. The most recent deed's recording date
 * becomes lastSaleDate (authoritative — the registry IS the public record);
 * the deed chain merges into saleHistory with source='registry'.
 * On deed-type rows the index's Doc$ figure is the document's stated
 * consideration (verified 2026-09-13 on a live deed: the abstract itemizes
 * Recording Fee / State excise / Surcharge separately, so Doc$ is not a fee;
 * and Doc$ on mortgage rows is the loan amount — never map those). The
 * figure is stored as the entry price, and the latest deed's price becomes
 * lastSalePrice. Always marks the address checked, even when no deeds found.
 */
export async function ingestDeedLookup(
  db: Db,
  leadId: number,
  deeds: RegistryDeed[]
): Promise<DeedIngestResult> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, leadId, deedsFound: 0, lastSaleDate: null, error: "lead not found" };

  const valid = (Array.isArray(deeds) ? deeds : [])
    .map((d) => ({
      recordedDate: String(d?.recordedDate ?? "").slice(0, 10),
      book: d?.book != null ? String(d.book) : null,
      page: d?.page != null ? String(d.page) : null,
      docType: d?.docType != null ? String(d.docType).slice(0, 60) : null,
      docAmount: d?.docAmount != null ? String(d.docAmount).slice(0, 32) : null,
      grantor: d?.grantor != null ? String(d.grantor).slice(0, 255) : null,
      grantee: d?.grantee != null ? String(d.grantee).slice(0, 255) : null,
    }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.recordedDate) && parseIsoDate(d.recordedDate))
    .sort((a, b) => b.recordedDate.localeCompare(a.recordedDate));

  // Dedupe on book/page (pagination overlap safety).
  const seen = new Set<string>();
  const deduped = valid.filter((d) => {
    const k = `${d.book ?? ""}-${d.page ?? ""}-${d.recordedDate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const existing = Array.isArray(lead.saleHistory) ? lead.saleHistory : [];
  const nonRegistry = existing.filter((e) => e?.source !== "registry");
  const registryEntries = deduped.map((d) => {
    // Doc$ -> price only for deed-type rows (consideration). On mortgages
    // Doc$ is the loan amount; those never reach here, but guard anyway.
    const price = isDeedLike(d.docType) && d.docAmount ? parseDocAmount(d.docAmount) : null;
    return {
      date: d.recordedDate,
      price,
      type: d.docType,
      source: "registry",
      book: d.book,
      page: d.page,
      // Raw Doc$ figure from the index row, kept for audit.
      ...(d.docAmount ? { docAmount: d.docAmount } : {}),
    };
  });
  const merged = [...nonRegistry, ...registryEntries].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? ""))
  );

  const patch: any = {
    saleHistory: merged,
    registryDeedCheckedAt: new Date(),
    updatedAt: new Date(),
  };
  let lastSaleDate: string | null = null;
  if (deduped.length > 0) {
    const latest = parseIsoDate(deduped[0].recordedDate)!;
    patch.lastSaleDate = latest;
    patch.ownershipYears = fullYearsBetween(latest, new Date());
    lastSaleDate = deduped[0].recordedDate;
    const latestPrice =
      isDeedLike(deduped[0].docType) && deduped[0].docAmount
        ? parseDocAmount(deduped[0].docAmount)
        : null;
    if (latestPrice != null) patch.lastSalePrice = latestPrice;
  }

  await db.update(leads).set(patch).where(eq(leads.id, leadId));
  return { ok: true, leadId, deedsFound: deduped.length, lastSaleDate };
}
