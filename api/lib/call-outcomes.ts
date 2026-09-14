// Post-call reconciliation + follow-up campaign engine.
//
// Two jobs:
//  1. reconcileCallOutcomes() — after every Maya/VAPI call ends, pull the
//     result from VAPI and write an accurate note: outcome, duration, and a
//     concise summary of what happened. Notes land in the calls table plus a
//     linked activity on the lead, so the full history is visible in the UI.
//  2. Follow-up campaign — call outcomes automatically schedule the next
//     touch: call_back tasks (dialed by processFollowUpTasks) and send_email
//     tasks (sent by processDueEmailTasks when a sender is configured and the
//     lead has an email). All three run inside runPipelineTick(), which the
//     /api/cron/pipeline-tick endpoint drives every 15 min on Vercel.

import { eq, and, asc, isNull, or, lt, lte, sql, gte, ne, inArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { callQueue, calls, leads, activities, tasks, dncList } from "../../db/schema";
import {
  getCallingConfig,
  isWithinCallWindow,
  scrubPhone,
  createVapiCall,
  getVapiCallDetail,
  type VapiCallDetail,
} from "./vapi";
import { callClaudeConversation, generateFollowUpMessage } from "./message-generator";
import { mapWithConcurrency } from "./concurrency";

const RECONCILE_DELAY_MS = 6 * 60 * 1000; // let the call finish (VAPI max 5 min)
const RECONCILE_BATCH = 20;
const MAX_CALL_ATTEMPTS = 5; // initial + follow-ups, then stop

type CallOutcome =
  | "answered" | "voicemail" | "no_answer" | "busy" | "wrong_number"
  | "disconnected" | "callback_requested" | "appointment_set"
  | "not_interested" | "dnc";

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  answered: "Answered — conversation",
  voicemail: "Voicemail",
  no_answer: "No answer",
  busy: "Busy",
  wrong_number: "Wrong number",
  disconnected: "Disconnected",
  callback_requested: "Asked for a call back",
  appointment_set: "Appointment set",
  not_interested: "Not interested",
  dnc: "Do not call",
};

const DNC_PHRASES = ["do not call", "don't call", "dont call", "take me off", "remove me from", "stop calling", "never call"];
const NOT_INTERESTED_PHRASES = ["not interested", "not selling", "don't want to sell", "dont want to sell", "leave me alone"];
const APPOINTMENT_PHRASES = ["setappointment", "walkthrough", "walk through", "come by", "stop by", "take a look", "schedule a time", "what day works", "what time works"];
const CALLBACK_PHRASES = ["call me back", "call back later", "call back tomorrow", "try me again", "try again later", "call next week"];

function transcriptHas(transcript: string, phrases: string[]): boolean {
  const t = transcript.toLowerCase();
  return phrases.some((p) => t.includes(p));
}

/** Map a finished VAPI call to a CRM outcome, preferring what was actually said. */
function mapOutcome(detail: VapiCallDetail): CallOutcome {
  const t = (detail.transcript ?? "").toLowerCase();
  const reason = (detail.endedReason ?? "").toLowerCase();

  if (transcriptHas(t, DNC_PHRASES)) return "dnc";
  if (transcriptHas(t, APPOINTMENT_PHRASES)) return "appointment_set";
  if (transcriptHas(t, CALLBACK_PHRASES)) return "callback_requested";
  if (transcriptHas(t, NOT_INTERESTED_PHRASES)) return "not_interested";

  if (reason.includes("voicemail")) return "voicemail";
  if (reason.includes("no-answer") || reason.includes("no_answer")) return "no_answer";
  if (reason.includes("busy")) return "busy";
  if (reason.includes("failed") || reason.includes("error")) {
    return t.length > 200 ? "answered" : "disconnected";
  }
  // assistant/customer ended with real conversation
  return t.length > 200 ? "answered" : "no_answer";
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "unknown length";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

/**
 * A hung third-party API must never eat the tick's 30s maxDuration (Vercel
 * kills the function and the tick dies with a dropped connection). Cap every
 * external call made during reconciliation.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Concise accurate note of what happened on the call. */
async function summarizeCall(
  detail: VapiCallDetail,
  outcome: CallOutcome,
  sellerName: string,
  address: string,
): Promise<string> {
  if (detail.summary && detail.summary.trim().length > 10) {
    return detail.summary.trim();
  }
  const transcript = (detail.transcript ?? "").trim();
  if (transcript.length > 100) {
    try {
      const note = await withTimeout(
        callClaudeConversation(
          "You write short, factual call notes for a real estate investor's CRM. " +
            "Summarize in 2-4 sentences: what the seller said about selling, their timeline, " +
            "price expectations, property condition, and any agreed next step. " +
            "No fluff, no greeting, just the facts.",
          `Seller: ${sellerName}. Property: ${address}.\n\nCall transcript:\n${transcript.slice(0, 6000)}`,
        ),
        15000,
        "claude-call-summary",
      );
      if (note && note.trim().length > 10) return note.trim();
    } catch {
      // fall through to excerpt
    }
    return `Transcript excerpt: ${transcript.slice(0, 500)}${transcript.length > 500 ? "…" : ""}`;
  }
  return OUTCOME_LABELS[outcome];
}

/** Number of calls already dialed today (for the daily cap). */
async function countDialedToday(timezone: string): Promise<number> {
  const db = getDb();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const startOfDay = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00`);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(callQueue)
    .where(
      and(
        gte(callQueue.startedAt, startOfDay),
        inArray(callQueue.status, ["dialing", "connected", "completed"] as any),
      ),
    );
  return Number(result[0]?.count ?? 0);
}

async function countCallsForLead(leadId: number): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(eq(calls.leadId, leadId));
  return Number(result[0]?.count ?? 0);
}

/**
 * Schedule the next follow-up touch after a call outcome.
 * Sequence: +2d call → +5d call (+email if we have one) → +9d call (+email) → +14d final call.
 */
async function scheduleFollowUps(leadId: number, outcome: CallOutcome, lead: any): Promise<void> {
  const db = getDb();
  const attempts = await countCallsForLead(leadId);
  if (attempts >= MAX_CALL_ATTEMPTS) {
    await db.insert(activities).values({
      leadId, type: "system",
      body: `⏹ Follow-up sequence ended: ${attempts} call attempts reached, no appointment.`,
    } as any);
    return;
  }

  // Don't stack duplicates
  const pending = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.leadId, leadId),
      inArray(tasks.type, ["call_back", "send_email"] as any),
      eq(tasks.status, "pending"),
    ),
  });
  if (pending) return;

  const step = attempts; // 1 = first follow-up after initial call
  const callDelays: Record<number, number> = { 1: 2, 2: 5, 3: 9, 4: 14 };
  const delayDays = callDelays[step] ?? 14;
  const dueAt = new Date(Date.now() + delayDays * 24 * 3600 * 1000);

  await db.insert(tasks).values({
    leadId,
    type: "call_back",
    title: `Follow-up call #${attempts + 1} — ${lead.sellerName || "seller"}`,
    notes: `Auto-scheduled after "${OUTCOME_LABELS[outcome]}" on last call.`,
    dueAt,
    status: "pending",
  } as any);

  // Email touch on the middle steps, only when we actually have an address
  if ((step === 2 || step === 3) && lead.email) {
    await db.insert(tasks).values({
      leadId,
      type: "send_email",
      title: `Follow-up email — ${lead.sellerName || "seller"}`,
      notes: `Auto-scheduled follow-up email.`,
      dueAt: new Date(Date.now() + (delayDays - 1) * 24 * 3600 * 1000),
      status: "pending",
    } as any);
  }

  await db.insert(activities).values({
    leadId, type: "system",
    body: `📅 Follow-up scheduled: call in ${delayDays} day${delayDays === 1 ? "" : "s"}${lead.email && (step === 2 || step === 3) ? " + email" : ""} (attempt ${attempts + 1} of ${MAX_CALL_ATTEMPTS}).`,
  } as any);
}

/**
 * Reconcile finished VAPI calls: write an accurate note per call and drive
 * the follow-up campaign from the outcome. Returns number of calls reconciled.
 */
export async function reconcileCallOutcomes(): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - RECONCILE_DELAY_MS);

  const pending = await db.query.callQueue.findMany({
    where: and(
      inArray(callQueue.status, ["dialing", "connected"] as any),
      sql`${callQueue.externalCallId} IS NOT NULL`,
      lt(callQueue.startedAt, cutoff),
    ),
    orderBy: [asc(callQueue.startedAt)],
    limit: RECONCILE_BATCH,
  });

  // Each call's detail fetch + LLM summary is independent — run a few in
  // parallel. Serial, these were the slowest chain in the tick (VAPI detail up
  // to 10s + Claude summary up to 15s per call).
  const reconcileRow = async (row: (typeof pending)[number]): Promise<boolean> => {
    try {
      const detail = await withTimeout(
        getVapiCallDetail(row.externalCallId as string),
        10000,
        "vapi-call-detail",
      ).catch(() => null);
      if (!detail || detail.status !== "ended") return false; // still on the phone

      const outcome = mapOutcome(detail);
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, row.leadId) });
      const sellerName = lead?.sellerName || "Seller";
      const address = lead?.propertyAddress || "";
      const note = await summarizeCall(detail, outcome, sellerName, address);
      const priorCalls = await countCallsForLead(row.leadId);

      const [callRow] = await db.insert(calls).values({
        leadId: row.leadId,
        callType: (priorCalls === 0 ? "initial" : "follow_up") as any,
        callOutcome: outcome as any,
        duration: detail.durationSeconds,
        notes: note,
        callRecordingUrl: detail.recordingUrl,
        appointmentSet: outcome === "appointment_set",
      } as any).returning({ id: calls.id });

      await db.update(callQueue)
        .set({ status: "completed", callOutcome: outcome as any } as any)
        .where(eq(callQueue.id, row.id));

      await db.insert(activities).values({
        leadId: row.leadId,
        type: "call",
        body: `📞 Maya call — ${OUTCOME_LABELS[outcome]} (${fmtDuration(detail.durationSeconds)}). ${note}`,
        linkedTable: "calls",
        linkedId: callRow.id,
      } as any);

      // Outcome-driven side effects
      if (outcome === "dnc") {
        const digits = (row.phone || "").replace(/\D/g, "");
        if (digits) {
          await db.insert(dncList).values({
            phone: digits, name: sellerName, reason: "seller_request",
            source: "maya-call", notes: `Asked on call ${callRow.id}`,
          } as any).onConflictDoNothing();
        }
        await db.update(tasks).set({ status: "cancelled" } as any)
          .where(and(eq(tasks.leadId, row.leadId), eq(tasks.status, "pending")));
      } else if (outcome === "appointment_set") {
        await db.insert(tasks).values({
          leadId: row.leadId,
          type: "follow_up",
          title: `Confirm appointment — ${sellerName}`,
          notes: `Maya booked an appointment on the call. Call notes: ${note}`,
          dueAt: new Date(Date.now() + 24 * 3600 * 1000),
          status: "pending",
        } as any);
      } else if (outcome === "not_interested") {
        if (lead) {
          await db.update(leads).set({ motivationLevel: "cold" } as any)
            .where(eq(leads.id, row.leadId));
        }
      } else if (outcome === "wrong_number" || outcome === "disconnected") {
        // dead number — no follow-up calls
        await db.insert(activities).values({
          leadId: row.leadId, type: "system",
          body: `⏹ Number appears dead (${OUTCOME_LABELS[outcome]}). Follow-up calls stopped.`,
        } as any);
      } else if (lead && !lead.appointmentSet) {
        await scheduleFollowUps(row.leadId, outcome, lead);
      }

      return true;
    } catch (err) {
      console.error(`[call-outcomes] reconcile error on queue #${row.id}:`, err);
      return false;
    }
  };
  const results = await mapWithConcurrency(pending, 3, reconcileRow);
  return results.filter(Boolean).length;
}

/**
 * Dial due call_back tasks via Maya/VAPI.
 * (Moved here from telegram-scheduler so the 15-min pipeline tick can drive it
 * on Vercel, where the in-process scheduler never starts.)
 */
export async function processFollowUpTasks(): Promise<number> {
  const db = getDb();
  const config = await getCallingConfig();
  if (!config?.apiKey) return 0;

  const tz = config.timezone || "America/New_York";
  if (!isWithinCallWindow(config.callWindowStart || "09:00", config.callWindowEnd || "19:00", tz)) {
    return 0;
  }
  const dialedToday = await countDialedToday(tz);
  const remaining = (config.maxDailyCalls || 100) - dialedToday;
  if (remaining <= 0) return 0;

  const dueTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.type, "call_back"),
      eq(tasks.status, "pending"),
      lte(tasks.dueAt, new Date()),
    ),
    orderBy: [asc(tasks.dueAt)],
    limit: Math.min(20, remaining),
  });

  // Per-task dials are independent — run a few in parallel so a batch of due
  // follow-ups doesn't push the tick past the serverless timeout.
  const dialTask = async (task: (typeof dueTasks)[number]): Promise<boolean> => {
    try {
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, Number(task.leadId)) });
      if (!lead?.phone) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        return false;
      }
      if (lead.appointmentSet) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        return false;
      }
      const scrub = await scrubPhone(lead.phone, config.scrubDncBeforeCall ?? true, config.scrubLitigants ?? true, lead.id);
      if (!scrub.pass) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        await db.insert(activities).values({
          leadId: lead.id, type: "system",
          body: `🚫 Follow-up call blocked: ${scrub.reason}`,
          linkedTable: "tasks", linkedId: task.id,
        } as any);
        return false;
      }

      await db.update(tasks).set({ status: "in_progress" } as any).where(eq(tasks.id, task.id));
      const [queueRow] = await db.insert(callQueue).values({
        campaignId: 0, campaignLeadId: 0, leadId: lead.id, phone: lead.phone, status: "queued",
      } as any).returning({ id: callQueue.id });

      const vapiCall = await createVapiCall(lead.id, lead.phone, lead.sellerName || "Seller");
      if (!vapiCall) {
        await db.update(tasks).set({ status: "pending" } as any).where(eq(tasks.id, task.id));
        return false;
      }
      if (queueRow?.id) {
        await db.update(callQueue)
          .set({ externalCallId: vapiCall.id, status: "dialing" } as any)
          .where(eq(callQueue.id, queueRow.id));
      }
      await db.update(tasks).set({ status: "completed", completedAt: new Date() } as any)
        .where(eq(tasks.id, task.id));
      await db.insert(activities).values({
        leadId: lead.id, type: "call",
        body: `📞 Maya follow-up call placed — VAPI ${vapiCall.id}`,
      } as any);
      console.log(`[follow-up] Dialed lead #${lead.id} (${lead.sellerName}) — VAPI ${vapiCall.id}`);
      return true;
    } catch (err) {
      console.error(`[follow-up] Error on task #${task.id}:`, err);
      await db.update(tasks).set({ status: "pending" } as any).where(eq(tasks.id, task.id));
      return false;
    }
  };
  const results = await mapWithConcurrency(dueTasks, 4, dialTask);
  return results.filter(Boolean).length;
}

/**
 * Send due follow-up emails. Requires RESEND_API_KEY + EMAIL_FROM to be set;
 * without them (or without a lead email) the task stays pending and is
 * reported as blocked so nothing is silently dropped.
 */
export async function processDueEmailTasks(): Promise<{ sent: number; blocked: number }> {
  const db = getDb();
  const due = await db.query.tasks.findMany({
    where: and(
      eq(tasks.type, "send_email"),
      eq(tasks.status, "pending"),
      lte(tasks.dueAt, new Date()),
    ),
    orderBy: [asc(tasks.dueAt)],
    limit: 20,
  });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Per-task work is independent — run several in parallel so a batch of due
  // emails doesn't push the tick past the serverless timeout.
  const sendTask = async (task: (typeof due)[number]): Promise<"sent" | "blocked"> => {
    try {
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, Number(task.leadId)) });
      if (!lead?.email || !apiKey || !from) {
        return "blocked"; // stays pending until an email + sender exist
      }

      const subject = `Following up on ${lead.propertyAddress || "your property"}`;
      let text = await generateFollowUpMessage(lead as any, "email", "professional").catch(() => "");
      // The generator may prefix "Subject: ..."; we set the subject separately.
      text = text.replace(/^Subject:.*\n+/i, "").trim();
      if (!text) {
        text =
          `Hi ${lead.sellerName || "there"},\n\nErick here — I'm a local investor and I wanted to follow up on ${lead.propertyAddress || "your property"}. If you're still considering selling, I'd welcome a quick conversation.\n\nBest,\nErick`;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: lead.email, subject, text }),
      });
      if (!res.ok) {
        console.error(`[email-followup] Resend error for lead #${lead.id}:`, await res.text());
        return "blocked";
      }
      await db.update(tasks).set({ status: "completed", completedAt: new Date() } as any)
        .where(eq(tasks.id, task.id));
      await db.insert(activities).values({
        leadId: lead.id, type: "email",
        body: `✉️ Follow-up email sent to ${lead.email}: "${subject}"`,
        linkedTable: "tasks", linkedId: task.id,
      } as any);
      return "sent";
    } catch (err) {
      console.error(`[email-followup] Error on task #${task.id}:`, err);
      return "blocked";
    }
  };
  const results = await mapWithConcurrency(due, 5, sendTask);
  return {
    sent: results.filter((r) => r === "sent").length,
    blocked: results.filter((r) => r === "blocked").length,
  };
}
