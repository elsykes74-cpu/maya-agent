import { eq, and, asc, isNull, or, lt, sql, gte } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { callQueue, campaignLeads, leads } from "../../db/schema";
import {
  createVapiCall,
  getCallingConfig,
  isWithinCallWindow,
} from "./vapi";

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes between retries
const BATCH_SIZE = 10; // dial at most this many per tick
const TICK_MS = 30 * 1000; // how often the worker wakes up

let running = false;

/** Number of calls already dialed today in the configured timezone. */
async function countDialedToday(timezone: string): Promise<number> {
  const db = getDb();
  const startOfDay = getStartOfDayInTimezone(timezone);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(callQueue)
    .where(
      and(
        gte(callQueue.startedAt, startOfDay),
        or(
          eq(callQueue.status, "dialing"),
          eq(callQueue.status, "connected"),
          eq(callQueue.status, "completed"),
        ),
      ),
    );
  return result[0]?.count ?? 0;
}

function getStartOfDayInTimezone(timezone: string): Date {
  const now = new Date();
  // Compute the local calendar day start in the given timezone as an ISO string,
  // then parse back to a UTC Date.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  return new Date(`${dateStr}T00:00:00`);
}

/** Schedule a failed queue entry for retry, or mark it failed after too many. */
async function markForRetry(queueId: number, errorMessage: string) {
  const db = getDb();
  const entry = await db.query.callQueue.findFirst({ where: eq(callQueue.id, queueId) });
  const retryCount = (entry?.retryCount ?? 0) + 1;

  if (retryCount > MAX_RETRIES) {
    await db
      .update(callQueue)
      .set({ status: "failed", errorMessage, retryCount })
      .where(eq(callQueue.id, queueId));
    return;
  }

  await db
    .update(callQueue)
    .set({
      status: "queued",
      errorMessage,
      retryCount,
      scheduledAt: new Date(Date.now() + RETRY_BACKOFF_MS),
    })
    .where(eq(callQueue.id, queueId));
}

async function dialOne(queueEntry: {
  id: number;
  campaignId: number;
  leadId: number;
  phone: string;
  campaignLeadId: number;
}) {
  const db = getDb();

  // Look up lead name for the personalized prompt.
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, queueEntry.leadId) });
  if (!lead) {
    await db
      .update(callQueue)
      .set({ status: "failed", errorMessage: "Lead not found" })
      .where(eq(callQueue.id, queueEntry.id));
    return;
  }

  // Mark as dialing before the call so we don't double-dial on a slow response.
  await db
    .update(callQueue)
    .set({ status: "dialing", startedAt: new Date() })
    .where(eq(callQueue.id, queueEntry.id));

  try {
    const vapiResponse = await createVapiCall(
      queueEntry.leadId,
      queueEntry.phone,
      lead.sellerName,
    );
    if (vapiResponse && vapiResponse.id) {
      await db
        .update(callQueue)
        .set({ status: "dialing", externalCallId: vapiResponse.id })
        .where(eq(callQueue.id, queueEntry.id));

      await db
        .update(campaignLeads)
        .set({ status: "queued", externalCallId: vapiResponse.id })
        .where(eq(campaignLeads.id, queueEntry.campaignLeadId));
    } else {
      await markForRetry(queueEntry.id, "Vapi API returned no call ID");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markForRetry(queueEntry.id, msg);
  }
}

/** One worker tick: pick up eligible queue entries and dial them. */
export async function runCallWorker(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const db = getDb();
    const config = await getCallingConfig();
    if (!config || !config.apiKey) return;

    const timezone = config.timezone || "America/New_York";
    const dailyCap = config.maxDailyCalls || 100;

    if (!isWithinCallWindow(config.callWindowStart || "09:00", config.callWindowEnd || "19:00", timezone)) {
      return; // outside business hours — dial nothing, try again next tick
    }

    const dialedToday = await countDialedToday(timezone);
    if (dialedToday >= dailyCap) {
      return; // daily cap reached
    }
    const budget = Math.max(0, Math.min(BATCH_SIZE, dailyCap - dialedToday));

    // Eligible: status queued and (no schedule yet OR schedule is due).
    const due = await db.query.callQueue.findMany({
      where: and(
        eq(callQueue.status, "queued"),
        or(isNull(callQueue.scheduledAt), lt(callQueue.scheduledAt, new Date())),
      ),
      orderBy: [asc(callQueue.scheduledAt)],
      limit: budget,
    });

    for (const entry of due) {
      await dialOne(entry);
    }
  } catch (err) {
    console.error("[call-worker] tick error:", err);
  } finally {
    running = false;
  }
}

/** Start the background loop. Safe to call once at boot. */
export function startCallWorker(): NodeJS.Timeout {
  // Kick off a first tick shortly after boot, then run on an interval.
  setTimeout(() => runCallWorker(), 5_000);
  const timer = setInterval(() => runCallWorker(), TICK_MS);
  timer.unref?.();
  return timer;
}
