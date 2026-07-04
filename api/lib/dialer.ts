import { eq, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { callQueue, campaignLeads, campaigns, leads } from "../../db/schema";
import { getCallingConfig, isWithinCallWindow, createVapiCall } from "./vapi";
import { placeTwilioOutboundCall, isTwilioConfigured } from "./twilio";

/**
 * Durable dialer loop. Campaign activation only *queues* calls; this module
 * drains the queue in small batches so no single request has to dial an
 * entire campaign inside Vercel's timeout budget. Ticks are safe to run
 * concurrently (Vercel cron + Railway interval + inline after activation):
 * each tick atomically claims its batch with FOR UPDATE SKIP LOCKED, so a
 * queued call is dialed exactly once.
 */

export const DEFAULT_BATCH_SIZE = 5;
export const MAX_BATCH_SIZE = 20;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_INTERVAL_HOURS = 48;
const MIN_RETRY_INTERVAL_HOURS = 1;

/** Outcomes worth another attempt on a later day; terminal outcomes are not. */
const RETRYABLE_OUTCOMES = new Set(["no_answer", "busy", "voicemail", "failed"]);

export function isRetryableOutcome(outcome: string | null | undefined): boolean {
  return !!outcome && RETRYABLE_OUTCOMES.has(outcome);
}

export function clampBatchSize(requested: number | string | null | undefined): number {
  const n = Number(requested);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(n), MAX_BATCH_SIZE);
}

export function computeNextAttemptAt(now: Date, callIntervalHours: number | null | undefined): Date {
  const hours = Math.max(callIntervalHours ?? DEFAULT_RETRY_INTERVAL_HOURS, MIN_RETRY_INTERVAL_HOURS);
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export type DialerTickResult = {
  skipped?: string;
  claimed: number;
  dialed: number;
  requeued: number;
  failed: number;
};

type ClaimedRow = {
  id: number;
  campaign_id: number;
  campaign_lead_id: number;
  lead_id: number;
  phone: string;
  retry_count: number | null;
};

/**
 * Claim up to batchSize due queue entries and dial them.
 * `appUrl` must be the URL of the *current* deployment (derive it from the
 * incoming request's x-forwarded-host header, or env.appUrl for the
 * long-running Railway process) so Twilio webhooks come back to code that
 * matches what initiated the call.
 */
export async function processDialerTick(opts: { appUrl: string; batchSize?: number }): Promise<DialerTickResult> {
  const result: DialerTickResult = { claimed: 0, dialed: 0, requeued: 0, failed: 0 };
  const db = getDb();

  const config = await getCallingConfig();
  const twilioReady = isTwilioConfigured();
  if (!twilioReady && !config?.apiKey) {
    result.skipped = "no calling provider configured";
    return result;
  }

  const windowStart = config?.callWindowStart || "09:00";
  const windowEnd = config?.callWindowEnd || "19:00";
  const timezone = config?.timezone || "America/New_York";
  if (!isWithinCallWindow(windowStart, windowEnd, timezone)) {
    result.skipped = `outside call window ${windowStart}-${windowEnd} ${timezone}`;
    return result;
  }

  const batch = clampBatchSize(opts.batchSize);
  const claimed = (await db.execute(sql`
    UPDATE call_queue SET status = 'dialing', started_at = now()
    WHERE id IN (
      SELECT id FROM call_queue
      WHERE status = 'queued' AND (scheduled_at IS NULL OR scheduled_at <= now())
      ORDER BY scheduled_at ASC NULLS FIRST
      LIMIT ${batch}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, campaign_id, campaign_lead_id, lead_id, phone, retry_count
  `)) as unknown as ClaimedRow[];
  result.claimed = claimed.length;

  for (const entry of claimed) {
    const lead = await db.query.leads.findFirst({ where: eq(leads.id, entry.lead_id) });
    try {
      let callId: string | null = null;
      if (twilioReady) {
        const call = await placeTwilioOutboundCall({
          to: entry.phone,
          name: lead?.sellerName ?? "",
          address: lead?.propertyAddress ?? "",
          appUrl: opts.appUrl,
        });
        callId = call?.sid ?? null;
      } else {
        const call = await createVapiCall(entry.lead_id, entry.phone, lead?.sellerName ?? "");
        callId = call?.id ?? null;
      }

      if (callId) {
        await db.update(callQueue)
          .set({ externalCallId: callId })
          .where(eq(callQueue.id, entry.id));
        await db.update(campaignLeads)
          .set({ status: "queued", externalCallId: callId, lastAttemptAt: new Date() })
          .where(eq(campaignLeads.id, entry.campaign_lead_id));
        result.dialed++;
      } else {
        await handleDialFailure(db, entry, "Call provider returned no call ID", result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await handleDialFailure(db, entry, msg, result);
    }
  }

  return result;
}

async function handleDialFailure(
  db: ReturnType<typeof getDb>,
  entry: ClaimedRow,
  errorMessage: string,
  result: DialerTickResult,
): Promise<void> {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, entry.campaign_id) });
  const maxAttempts = campaign?.maxCallsPerLead ?? DEFAULT_MAX_ATTEMPTS;
  const attemptsSoFar = (entry.retry_count ?? 0) + 1;

  if (attemptsSoFar < maxAttempts) {
    await db.update(callQueue)
      .set({
        status: "queued",
        retryCount: attemptsSoFar,
        scheduledAt: computeNextAttemptAt(new Date(), campaign?.callIntervalHours),
        errorMessage,
      })
      .where(eq(callQueue.id, entry.id));
    result.requeued++;
  } else {
    await db.update(callQueue)
      .set({ status: "failed", errorMessage, completedAt: new Date() })
      .where(eq(callQueue.id, entry.id));
    await db.update(campaignLeads)
      .set({ status: "failed" })
      .where(eq(campaignLeads.id, entry.campaign_lead_id));
    result.failed++;
  }
}

/**
 * Called from the call-ended webhook. If the outcome was non-terminal
 * (no answer, busy, voicemail, provider failure) and the campaign allows
 * more attempts, schedule the next touch per the campaign's cadence.
 * Returns true when a retry was scheduled.
 */
export async function scheduleRetryAfterOutcome(
  queueEntry: { campaignId: number; campaignLeadId: number; leadId: number; phone: string },
  outcome: string | null | undefined,
  attemptsCompleted: number,
): Promise<boolean> {
  if (!isRetryableOutcome(outcome)) return false;
  const db = getDb();

  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, queueEntry.campaignId) });
  const maxAttempts = campaign?.maxCallsPerLead ?? DEFAULT_MAX_ATTEMPTS;
  if (attemptsCompleted >= maxAttempts) return false;

  const nextAttemptAt = computeNextAttemptAt(new Date(), campaign?.callIntervalHours);
  await db.insert(callQueue).values({
    campaignId: queueEntry.campaignId,
    campaignLeadId: queueEntry.campaignLeadId,
    leadId: queueEntry.leadId,
    phone: queueEntry.phone,
    status: "queued",
    scrubResult: "pass",
    retryCount: attemptsCompleted,
    scheduledAt: nextAttemptAt,
  });
  await db.update(campaignLeads)
    .set({ status: "pending", nextAttemptAt })
    .where(eq(campaignLeads.id, queueEntry.campaignLeadId));
  return true;
}

/** Queue depth by status, for the dialer health endpoint. */
export async function getQueueStats(): Promise<Record<string, number>> {
  const db = getDb();
  const rows = (await db.execute(
    sql`SELECT status, count(*)::int AS count FROM call_queue GROUP BY status`
  )) as unknown as { status: string; count: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}

let dialerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * In-process scheduler for the long-running (Railway) deployment.
 * Opt-in via DIALER_ENABLED=true so merging this code never starts
 * placing real calls by itself. Serverless deployments should drive
 * POST /api/dialer/tick from a cron instead.
 */
export function startDialerScheduler(appUrl: string, intervalMs = 60_000): void {
  if (process.env.DIALER_ENABLED !== "true") {
    console.log("[dialer] scheduler disabled (set DIALER_ENABLED=true to enable)");
    return;
  }
  if (dialerInterval) return;
  console.log(`[dialer] scheduler started, interval ${intervalMs}ms`);
  dialerInterval = setInterval(async () => {
    try {
      const res = await processDialerTick({ appUrl, batchSize: Number(process.env.DIALER_BATCH_SIZE) || DEFAULT_BATCH_SIZE });
      if (res.claimed > 0 || res.skipped === undefined) {
        console.log(`[dialer] tick: claimed=${res.claimed} dialed=${res.dialed} requeued=${res.requeued} failed=${res.failed}${res.skipped ? ` skipped=${res.skipped}` : ""}`);
      }
    } catch (err) {
      console.error("[dialer] tick error:", err);
    }
  }, intervalMs);
}
