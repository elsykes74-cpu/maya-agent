/**
 * Pipeline engine — the automation brain.
 *
 * Flow: scrape → routeLead (score + stage) → hot_routing → Maya/VAPI calls
 *                                            → warm_nurture / cold_drip → LadyJaye SMS tracks
 * Call outcomes feed back in via webhooks-router → stage progression.
 *
 * Driven by runPipelineTick(), invoked every 15 min from telegram-scheduler.
 */
import { and, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  activities,
  callQueue,
  leads,
  smsLogs,
  smsTemplates,
  tasks,
} from "../../db/schema";
import { computeLeadScore } from "./lead-scorer";
import { sendTwilioSms } from "./twilio";
import { createVapiCall, getCallingConfig, isWithinCallWindow, scrubPhone } from "./vapi";
import {
  reconcileCallOutcomes,
  processFollowUpTasks,
  processDueEmailTasks,
} from "./call-outcomes";
import { validatePhoneForDial } from "./phone-validate";
import { sendAlert } from "./telegram";
import { supabase } from "./supabase";
import { mapWithConcurrency } from "./concurrency";

// ── Track definitions ────────────────────────────────────────────────────────
// Each step references a row in sms_templates by day; delayDays is the wait
// after the previous step before this one becomes due.
const TRACKS: Record<string, { templateDay: number; delayDays: number }[]> = {
  warm_nurture: [
    { templateDay: 0, delayDays: 0 },
    { templateDay: 3, delayDays: 3 },
    { templateDay: 7, delayDays: 4 },
  ],
  cold_drip: [
    { templateDay: 0, delayDays: 0 },
    { templateDay: 7, delayDays: 30 },
  ],
};

const AGENT_NAME = "Erick";

function personalize(body: string, lead: any, fromNumber: string): string {
  const street = String(lead.propertyAddress || "").split(",")[0].trim();
  return body
    .replace(/\[Name\]/g, String(lead.sellerName || "there"))
    .replace(/\[Street Address\]/g, String(lead.propertyAddress || ""))
    .replace(/\[Street\]/g, street)
    .replace(/\[Agent Name\]/g, AGENT_NAME)
    .replace(/\[Number\]/g, fromNumber || "");
}

async function getTwilioSmsConfig() {
  const { data } = await supabase
    .from("ai_config")
    .select("twilio_account_sid, twilio_auth_token, twilio_from_number")
    .order("id")
    .limit(1)
    .single();
  const accountSid = data?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = data?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || "";
  const fromNumber =
    data?.twilio_from_number || process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "";
  return { accountSid, authToken, fromNumber, configured: !!(accountSid && authToken && fromNumber) };
}

// ── 1. Ingest scoring + routing ─────────────────────────────────────────────

export async function routeLead(leadId: number): Promise<{ stage: string; score: number } | null> {
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead || lead.pipelineStage !== "lead") return null;

  const stack = computeLeadScore(lead as any);
  // Keyword signals from the scraper are the only motivation data on fresh
  // Craigslist leads — blend them in so a keyword-hot FSBO routes hot.
  const boost = lead.motivationLevel === "hot" ? 55 : lead.motivationLevel === "warm" ? 30 : 0;
  const score = Math.min(100, stack + boost);
  const stage = score >= 60 ? "hot_routing" : score >= 40 ? "warm_nurture" : "cold_drip";

  await db
    .update(leads)
    .set({ leadScore: score, pipelineStage: stage } as any)
    .where(eq(leads.id, leadId));

  await db.insert(activities).values({
    leadId,
    type: "system",
    body: `⚙️ Pipeline routed: score ${score} → ${stage}`,
  } as any);

  if (stage === "warm_nurture" || stage === "cold_drip") {
    await enrollInTrack(leadId, stage);
  }

  if (stage === "hot_routing") {
    await sendAlert(
      `🔥 <b>Hot lead routed</b>\n<b>${lead.sellerName ?? "Seller"}</b>\n📍 ${lead.propertyAddress ?? ""}\nScore ${score} — Maya will call during the call window.`,
      "quickkick",
    ).catch(() => {});
  }

  return { stage, score };
}

// ── 2. Nurture track enrollment + sending ────────────────────────────────────

export async function enrollInTrack(leadId: number, track: "warm_nurture" | "cold_drip"): Promise<boolean> {
  const db = getDb();
  const steps = TRACKS[track];
  if (!steps?.length) return false;

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead?.phone) {
    await db.insert(activities).values({
      leadId,
      type: "system",
      body: `⚠️ Nurture enrollment skipped — no phone on file`,
    } as any);
    return false;
  }

  // Never double-enroll: one active SMS track per lead
  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.leadId, leadId), eq(tasks.type, "send_sms"), eq(tasks.status, "pending")),
  });
  if (existing) return false;

  await db.insert(tasks).values({
    leadId,
    type: "send_sms",
    title: `Nurture SMS — ${track} step 1/${steps.length}`,
    notes: JSON.stringify({ track, stepIndex: 0 }),
    dueAt: new Date(Date.now() + 15 * 60 * 1000),
    status: "pending",
  } as any);

  await db.insert(activities).values({
    leadId,
    type: "system",
    body: `📋 Enrolled in ${track} (${steps.length} touches)`,
  } as any);
  return true;
}

export async function processDueSmsTasks(): Promise<number> {
  const db = getDb();
  const due = await db.query.tasks.findMany({
    where: and(eq(tasks.type, "send_sms"), eq(tasks.status, "pending"), lte(tasks.dueAt, new Date())),
    limit: 20,
  });
  if (!due.length) return 0;

  // Per-task work is independent — run several in parallel so a batch of due
  // SMS doesn't push the tick past the serverless timeout.
  const sendTask = async (task: (typeof due)[number]): Promise<boolean> => {
    try {
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, Number(task.leadId)) });
      if (!lead?.phone || (lead as any).appointmentSet) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        return false;
      }

      let meta: any = {};
      try { meta = JSON.parse(task.notes || "{}"); } catch { /* treat as unparseable */ }
      const steps = TRACKS[meta.track];
      const step = steps?.[meta.stepIndex ?? 0];
      if (!step) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        return false;
      }

      const template = await db.query.smsTemplates.findFirst({
        where: and(eq(smsTemplates.day, step.templateDay), eq(smsTemplates.isActive, true)),
      });
      if (!template) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        return false;
      }

      const tw = await getTwilioSmsConfig();
      if (!tw.configured) {
        console.error("[pipeline] Twilio SMS not configured — leaving task pending");
        return false;
      }

      // Line-type gate: never text landlines, voip, or invalid numbers.
      // Fail-open: when the check can't run (no key / cap exhausted / error),
      // the SMS proceeds without line-type info.
      const lineCheck = await validatePhoneForDial(db, lead.id, lead.phone);
      if (lineCheck.checked && !lineCheck.canSms) {
        await db.insert(activities).values({
          leadId: lead.id,
          type: "system",
          body: `📵 Nurture SMS skipped: ${lineCheck.reason}`,
        } as any);
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        return false;
      }

      const body = personalize(template.content, lead, tw.fromNumber);
      const result = await sendTwilioSms(lead.phone, body, tw);
      if (result.status === "failed") {
        console.error("[pipeline] SMS send failed:", result.error);
        await db.insert(activities).values({
          leadId: lead.id,
          type: "system",
          body: `⚠️ Nurture SMS failed: ${result.error}`,
        } as any);
        return false; // leave pending for next tick
      }

      await db.insert(smsLogs).values({
        leadId: lead.id,
        sequenceDay: step.templateDay,
        messageContent: body,
        direction: "outbound",
        status: "sent",
      } as any);

      await db.insert(activities).values({
        leadId: lead.id,
        type: "sms",
        body: `📱 LadyJaye nurture SMS sent (${meta.track} step ${(meta.stepIndex ?? 0) + 1}): ${body.slice(0, 140)}`,
      } as any);

      await db.update(tasks).set({ status: "completed", completedAt: new Date() } as any).where(eq(tasks.id, task.id));

      const next = steps[(meta.stepIndex ?? 0) + 1];
      if (next) {
        await db.insert(tasks).values({
          leadId: lead.id,
          type: "send_sms",
          title: `Nurture SMS — ${meta.track} step ${(meta.stepIndex ?? 0) + 2}/${steps.length}`,
          notes: JSON.stringify({ track: meta.track, stepIndex: (meta.stepIndex ?? 0) + 1 }),
          dueAt: new Date(Date.now() + next.delayDays * 86400000),
          status: "pending",
        } as any);
      } else {
        await db.insert(activities).values({
          leadId: lead.id,
          type: "system",
          body: `✅ Nurture track ${meta.track} complete`,
        } as any);
      }
      return true;
    } catch (err) {
      console.error("[pipeline] send_sms task error:", err);
      return false;
    }
  };
  const results = await mapWithConcurrency(due, 5, sendTask);
  return results.filter(Boolean).length;
}

/** Cancel all pending outreach tasks for a lead (appointment, DNC, not interested). */
export async function cancelNurtureTasks(leadId: number): Promise<void> {
  const db = getDb();
  await db
    .update(tasks)
    .set({ status: "cancelled" } as any)
    .where(
      and(
        eq(tasks.leadId, leadId),
        inArray(tasks.type, ["send_sms", "call_back", "follow_up"]),
        eq(tasks.status, "pending"),
      ),
    );
}

// ── 3. Hot track → Maya (VAPI) ───────────────────────────────────────────────

export async function processHotLeads(): Promise<{ dialed: number; reason?: string }> {
  const db = getDb();
  const config = await getCallingConfig();
  if (!config?.apiKey) return { dialed: 0, reason: "vapi not configured" };

  const start = config.callWindowStart || "09:00";
  const end = config.callWindowEnd || "19:00";
  const tz = config.timezone || "America/New_York";
  if (!isWithinCallWindow(start, end, tz)) return { dialed: 0, reason: "outside call window" };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const counted = await db
    .select({ count: sql<number>`count(*)` })
    .from(callQueue)
    .where(gte(callQueue.createdAt, todayStart));
  const remaining = (config.maxDailyCalls ?? 100) - Number(counted[0]?.count ?? 0);
  if (remaining <= 0) return { dialed: 0, reason: "daily cap reached" };

  const BATCH = Math.min(remaining, 5);
  // Fetch enough candidates to fill the batch. The top-N by score are often
  // undialable (48h redial guard / no phone), so a tight candidate limit of 5
  // starved the dialer — every tick fetched the same 5 blocked leads and
  // dialed nothing. Fixed 2026-09-15.
  const candidates = await db.query.leads.findMany({
    // appointmentSet defaults to false (not NULL) on every lead row, so match
    // both NULL and false — "not yet set" means the lead hasn't booked.
    where: and(
      eq(leads.pipelineStage, "hot_routing"),
      or(isNull(leads.appointmentSet), eq(leads.appointmentSet, false)),
    ),
    orderBy: [desc(leads.leadScore)],
    limit: Math.min(remaining, 50),
  });

  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
  // Phase 1 (read-only + scrub): collect up to BATCH dialable leads.
  const eligible: (typeof candidates)[number][] = [];
  await mapWithConcurrency(candidates, 4, async (lead) => {
    if (eligible.length >= BATCH) return false;
    if (!lead.phone) return false;
    // Don't hammer: skip if called in the last 48h. A queue row that failed
    // before the call reached VAPI (failed + no external call id) is not a
    // call — it must not block retries.
    const recent = await db.query.callQueue.findFirst({
      where: and(
        eq(callQueue.leadId, lead.id),
        gte(callQueue.createdAt, twoDaysAgo),
        or(ne(callQueue.status, "failed"), sql`${callQueue.externalCallId} IS NOT NULL`),
      ),
      orderBy: [desc(callQueue.createdAt)],
    });
    if (recent) return false;

    const scrub = await scrubPhone(lead.phone, config.scrubDncBeforeCall ?? true, config.scrubLitigants ?? true, lead.id);
    if (!scrub.pass) {
      await db.insert(activities).values({
        leadId: lead.id,
        type: "system",
        body: `🚫 Pipeline dial blocked: ${scrub.reason}`,
      } as any);
      return false;
    }
    if (eligible.length >= BATCH) return false;
    eligible.push(lead);
    return true;
  });

  // Phase 2: place the calls (at most BATCH).
  const toDial = eligible.slice(0, BATCH);
  // Per-lead work is independent (each lead touches only its own rows), so
  // run a few in parallel — serial VAPI round-trips were pushing the
  // tick past the serverless timeout, which dropped the HTTP response.
  // (Eligibility was already decided in phase 1; this only dials.)
  const dialLead = async (lead: (typeof toDial)[number]): Promise<boolean> => {
    try {
      if (!lead.phone) return false;

      const [queueRow] = await db
        .insert(callQueue)
        .values({ campaignId: 0, campaignLeadId: 0, leadId: lead.id, phone: lead.phone, status: "queued" } as any)
        .returning({ id: callQueue.id });

      const vapiCall = await createVapiCall(lead.id, lead.phone, lead.sellerName || "Seller");
      if (!vapiCall) {
        await db
          .update(callQueue)
          .set({ status: "failed", errorMessage: "VAPI call request failed (see function logs)" } as any)
          .where(eq(callQueue.id, queueRow.id));
        return false;
      }

      await db
        .update(callQueue)
        .set({ status: "dialing", startedAt: new Date(), externalCallId: (vapiCall as any).id } as any)
        .where(eq(callQueue.id, queueRow.id));
      await db.update(leads).set({ lastContactDate: new Date() } as any).where(eq(leads.id, lead.id));
      await db.insert(activities).values({
        leadId: lead.id,
        type: "call",
        body: `📞 Pipeline auto-dial via Maya — call ${(vapiCall as any).id}`,
      } as any);
      return true;
    } catch (err) {
      console.error("[pipeline] hot dial error:", err);
      return false;
    }
  };
  const results = await mapWithConcurrency(toDial, 4, dialLead);
  return { dialed: results.filter(Boolean).length };
}

// ── 4. Tick ──────────────────────────────────────────────────────────────────

export async function runPipelineTick(): Promise<string> {
  const parts: string[] = [];

  try {
    const db = getDb();
    const unrouted = await db.query.leads.findMany({
      where: eq(leads.pipelineStage, "lead"),
      limit: 25,
    });
    let routed = 0;
    let hot = 0;
    for (const l of unrouted) {
      try {
        const r = await routeLead(l.id);
        if (r) {
          routed++;
          if (r.stage === "hot_routing") hot++;
        }
      } catch (err) {
        console.error("[pipeline] route error:", err);
      }
    }
    parts.push(`routed ${routed} (${hot} hot)`);
  } catch (err) {
    console.error("[pipeline] routing pass error:", err);
    parts.push("routing error");
  }

  try {
    const { dialed, reason } = await processHotLeads();
    parts.push(`dialed ${dialed}${reason ? ` (${reason})` : ""}`);
  } catch (err) {
    console.error("[pipeline] hot-dial pass error:", err);
    parts.push("dial error");
  }

  try {
    const sent = await processDueSmsTasks();
    parts.push(`sms ${sent}`);
  } catch (err) {
    console.error("[pipeline] sms pass error:", err);
    parts.push("sms error");
  }

  try {
    const noted = await reconcileCallOutcomes();
    parts.push(`call notes ${noted}`);
  } catch (err) {
    console.error("[pipeline] call-outcome reconcile error:", err);
    parts.push("call notes error");
  }

  try {
    const redialed = await processFollowUpTasks();
    parts.push(`follow-up calls ${redialed}`);
  } catch (err) {
    console.error("[pipeline] follow-up pass error:", err);
    parts.push("follow-up error");
  }

  try {
    const { sent, blocked } = await processDueEmailTasks();
    parts.push(`emails ${sent}${blocked ? ` (${blocked} waiting on email setup)` : ""}`);
  } catch (err) {
    console.error("[pipeline] email pass error:", err);
    parts.push("email error");
  }

  return parts.join(", ");
}
