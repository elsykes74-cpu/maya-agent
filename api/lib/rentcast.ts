import { sql } from "drizzle-orm";
import { rentcastUsage } from "../../db/schema";
import { env } from "./env";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

// Centralized RentCast client with a hard monthly quota guard.
//
// Every RentCast consumer (registry scan, record enrichment) goes through
// rentcastFetch, which checks the month's logged usage against
// RENTCAST_MONTHLY_CAP (default 45 — headroom under the 50-call free tier)
// BEFORE issuing the request. When the budget is exhausted the call returns
// null instead of firing, so the free tier can never be exceeded by code.
//
// Usage is logged per call in rentcast_usage (best-effort; a logging failure
// never blocks the data path, it just under-counts slightly).

const RENTCAST_BASE = "https://api.rentcast.io/v1";

export function rentcastMonthlyCap(): number {
  const n = parseInt(env.rentcastMonthlyCap || "", 10);
  return Number.isFinite(n) && n > 0 ? n : 45;
}

export async function rentcastUsageThisMonth(db: Db): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(rentcastUsage)
    .where(sql`date_trunc('month', ${rentcastUsage.createdAt}) = date_trunc('month', now())`);
  return Number(rows[0]?.count ?? 0);
}

export async function rentcastBudgetRemaining(db: Db): Promise<number> {
  return Math.max(0, rentcastMonthlyCap() - (await rentcastUsageThisMonth(db)));
}

/**
 * Quota-guarded GET against the RentCast API.
 * @returns parsed JSON, or null when the monthly budget is exhausted (caller
 * should treat null as "skip quietly", not an error).
 * @throws on missing key or non-2xx responses (those still count as usage).
 */
export async function rentcastFetch(db: Db, path: string): Promise<any | null> {
  if (!env.rentcastApiKey) throw new Error("RENTCAST_API_KEY not configured");
  const remaining = await rentcastBudgetRemaining(db);
  if (remaining <= 0) return null;
  const res = await fetch(`${RENTCAST_BASE}${path}`, {
    headers: { "X-Api-Key": env.rentcastApiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  // Log every issued call — even failures count against the quota.
  await db
    .insert(rentcastUsage)
    .values({ endpoint: path.split("?")[0].slice(0, 120) })
    .catch(() => {});
  if (!res.ok) throw new Error(`RentCast ${path.split("?")[0]} → ${res.status}`);
  return res.json();
}
