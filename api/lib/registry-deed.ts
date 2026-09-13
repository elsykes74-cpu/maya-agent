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
  grantor: string | null;
  grantee: string | null;
}

function parseStreet(propertyAddress: string | null | undefined): string | null {
  if (!propertyAddress) return null;
  // "37 Spruce St, Springfield, MA 01105" -> "37 Spruce St"
  const street = propertyAddress.split(",")[0]?.trim();
  return street || null;
}

/**
 * Hot leads (pipelineStage = hot_routing, the canonical Hot definition) whose
 * address has never been checked against the registry deed index.
 */
export async function getDeedLookupQueue(db: Db, limit: number): Promise<DeedQueueEntry[]> {
  const rows = await db.query.leads.findMany({
    where: and(
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
 * the deed chain merges into saleHistory with source='registry'. Deeds carry
 * no consideration in the index, so lastSalePrice is never set from here.
 * Always marks the address checked, even when no deeds were found.
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
  const registryEntries = deduped.map((d) => ({
    date: d.recordedDate,
    price: null,
    type: d.docType,
    source: "registry",
    book: d.book,
    page: d.page,
  }));
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
  }

  await db.update(leads).set(patch).where(eq(leads.id, leadId));
  return { ok: true, leadId, deedsFound: deduped.length, lastSaleDate };
}
