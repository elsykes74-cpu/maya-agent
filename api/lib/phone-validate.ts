import { eq, sql } from "drizzle-orm";
import { numverifyUsage, phoneValidation } from "../../db/schema";
import { env } from "./env";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

// Centralized Numverify line-type check with a hard monthly quota guard.
//
// Tavily-sourced phone numbers are unverified. Before a VAPI voice dial or an
// SMS goes out, validatePhoneForDial confirms the number is real and reports
// its line type (mobile / landline / voip).
//
// Every lookup goes through this module, which checks the month's logged
// usage against NUMVERIFY_MONTHLY_CAP (default 100 — the free-tier allowance)
// BEFORE issuing the request. Results are cached in phone_validation keyed by
// normalized digits, so repeat dials/SMS to the same number never re-spend
// quota.
//
// Fail-open by design: when the API key is missing, the budget is exhausted,
// or the lookup errors, the result is { checked: false } and the caller must
// NOT block the dial/SMS — it proceeds without line-type info.

const NUMVERIFY_BASE = "http://apilayer.net/api/validate"; // free tier is HTTP-only

export type LineType = "mobile" | "landline" | "voip" | "unknown";

export interface PhoneCheckResult {
  /**
   * false when no verification happened (no key / cap exhausted / API error).
   * Callers must fail open on false — never block the dial/SMS.
   */
  checked: boolean;
  /** The number is a real, dialable number. */
  valid: boolean;
  lineType: LineType;
  carrier: string | null;
  /** Voice dial allowed. */
  canVoice: boolean;
  /** SMS allowed (mobile only). */
  canSms: boolean;
  /** Human-readable reason for logs / block messages. */
  reason: string;
}

type PhoneStatus = "valid" | "invalid" | "disconnected" | "voip" | "landline" | "mobile" | "unknown";

export function numverifyMonthlyCap(): number {
  const n = parseInt(env.numverifyMonthlyCap || "", 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export async function numverifyUsageThisMonth(db: Db): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(numverifyUsage)
    .where(sql`date_trunc('month', ${numverifyUsage.createdAt}) = date_trunc('month', now())`);
  return Number(rows[0]?.count ?? 0);
}

export async function numverifyBudgetRemaining(db: Db): Promise<number> {
  return Math.max(0, numverifyMonthlyCap() - (await numverifyUsageThisMonth(db)));
}

/** Strip to digits; returns "" when there aren't enough digits to dial. */
export function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : "";
}

function mapLineType(raw: string | null | undefined): LineType {
  const t = (raw || "").toLowerCase();
  if (t === "mobile") return "mobile";
  if (t === "landline") return "landline";
  if (t === "voip") return "voip";
  return "unknown";
}

function buildResult(checked: boolean, valid: boolean, lineType: LineType, carrier: string | null): PhoneCheckResult {
  const canVoice = valid;
  const canSms = valid && lineType === "mobile";
  let reason: string;
  if (!valid) reason = "number reported invalid by carrier lookup";
  else if (lineType === "mobile") reason = "mobile — voice + SMS ok";
  else if (lineType === "landline") reason = "landline — voice ok, SMS not supported";
  else if (lineType === "voip") reason = "voip line — voice ok, SMS not supported";
  else reason = "valid number, line type unknown — voice ok, SMS skipped";
  return { checked, valid, lineType, carrier, canVoice, canSms, reason };
}

function unchecked(reason: string): PhoneCheckResult {
  // Fail open: canVoice/canSms true so `checked && !canX` guards pass through.
  return { checked: false, valid: false, lineType: "unknown", carrier: null, canVoice: true, canSms: true, reason };
}

function rowToResult(row: { status: string | null; lineType: string | null; carrier: string | null }): PhoneCheckResult {
  const valid = row.status !== "invalid" && row.status !== "disconnected";
  return buildResult(true, valid, mapLineType(row.lineType), row.carrier ?? null);
}

/**
 * Validate a phone number for dialing/SMS.
 *
 * Cache-first (by normalized digits, any lead), then quota-guarded Numverify.
 * Never throws for API problems — those return { checked: false } (fail open).
 */
export async function validatePhoneForDial(db: Db, leadId: number, phone: string): Promise<PhoneCheckResult> {
  const digits = normalizePhone(phone);
  if (!digits) {
    return {
      checked: true, valid: false, lineType: "unknown", carrier: null,
      canVoice: false, canSms: false, reason: "not a dialable phone number",
    };
  }

  // Cache: reuse any prior validation for these digits (any lead).
  try {
    const cached = await db.query.phoneValidation.findFirst({
      where: eq(phoneValidation.phone, digits),
    });
    if (cached) return rowToResult(cached);
  } catch (e) {
    console.error("[phone-validate] cache lookup failed (fail open):", (e as Error)?.message ?? e);
  }

  if (!env.numverifyApiKey) {
    console.error("[phone-validate] NUMVERIFY_API_KEY not configured — proceeding without line-type check");
    return unchecked("line-type check unavailable (no API key)");
  }
  const remaining = await numverifyBudgetRemaining(db).catch(() => 0);
  if (remaining <= 0) {
    console.error("[phone-validate] monthly cap exhausted — proceeding without line-type check");
    return unchecked("line-type check unavailable (monthly cap exhausted)");
  }

  const params = new URLSearchParams({ access_key: env.numverifyApiKey, number: digits, format: "1" });
  if (digits.length === 10) params.set("country_code", "US"); // pipeline is US-only

  let data: any;
  try {
    const res = await fetch(`${NUMVERIFY_BASE}?${params}`, { signal: AbortSignal.timeout(20000) });
    // Log every issued call — even failures count against the quota.
    await db.insert(numverifyUsage).values({ endpoint: "validate" }).catch(() => {});
    if (!res.ok) {
      console.error(`[phone-validate] Numverify → ${res.status} (fail open)`);
      return unchecked(`line-type check failed (HTTP ${res.status})`);
    }
    data = await res.json();
  } catch (e) {
    console.error("[phone-validate] request failed (fail open):", (e as Error)?.message ?? e);
    return unchecked("line-type check request failed");
  }

  const valid = data?.valid === true;
  const lineType = mapLineType(data?.line_type);
  const carrier = typeof data?.carrier === "string" && data.carrier ? data.carrier.slice(0, 100) : null;
  const status: PhoneStatus = !valid ? "invalid" : lineType === "unknown" ? "valid" : lineType;

  // Upsert the cache row (best-effort; never blocks the dial path).
  try {
    const existing = await db.query.phoneValidation.findFirst({
      where: eq(phoneValidation.phone, digits),
    });
    const values = { leadId, phone: digits, status, carrier, lineType, validatedAt: new Date() };
    if (existing) {
      await db.update(phoneValidation).set(values).where(eq(phoneValidation.id, existing.id));
    } else {
      await db.insert(phoneValidation).values(values);
    }
  } catch (e) {
    console.error("[phone-validate] cache upsert failed (non-blocking):", (e as Error)?.message ?? e);
  }

  return buildResult(true, valid, lineType, carrier);
}
