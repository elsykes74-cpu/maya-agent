import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { webhookEvents, campaignLeads, callQueue, calls, leads, dncList, activities, tasks, appointments } from "../../db/schema";
import { sendAlert } from "../lib/telegram";
import { matchBuyersToLead, formatBuyerMatchAlert } from "../lib/buyer-matcher";
import { cancelNurtureTasks, enrollInTrack } from "../lib/pipeline-engine";

// Parse Maya's informal setAppointment args ("Thursday", "2pm") into a concrete
// date + display time. A weekday resolves to its next occurrence; unparseable
// input falls back to 2 days out so a real appointment row is always created.
// scheduledTime keeps the raw phrase and is the human-facing source of truth;
// scheduledDate's date component is what the dashboard/calendar keys off.
function parseApptDateTime(day: string, time: string): { scheduledDate: Date; scheduledTime: string } {
  const now = new Date();
  const rawTime = (time || "").trim();
  const rawDay = (day || "").trim().toLowerCase();

  let hours = 10;
  let minutes = 0;
  const tm = rawTime.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (tm) {
    hours = parseInt(tm[1], 10);
    minutes = tm[2] ? parseInt(tm[2], 10) : 0;
    if (tm[3] === "pm" && hours < 12) hours += 12;
    if (tm[3] === "am" && hours === 12) hours = 0;
    if (hours > 23 || hours < 0) hours = 10;
  }

  const dows = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  let daysAhead = 2;
  if (rawDay.includes("today")) daysAhead = 0;
  else if (rawDay.includes("tomorrow")) daysAhead = 1;
  else {
    const idx = dows.findIndex((d) => rawDay.includes(d) || rawDay.includes(d.slice(0, 3)));
    if (idx >= 0) {
      daysAhead = (idx - now.getDay() + 7) % 7;
      if (daysAhead === 0) daysAhead = 7; // e.g. "Thursday" said on a Thursday → next week
    }
  }

  const scheduledDate = new Date(now);
  scheduledDate.setDate(now.getDate() + daysAhead);
  scheduledDate.setHours(hours, minutes, 0, 0);
  return { scheduledDate, scheduledTime: rawTime || `${hours}:${String(minutes).padStart(2, "0")}` };
}

export const webhooksRouter = createRouter({
  receive: publicQuery
    .input(z.object({
      provider: z.enum(["vapi", "bland", "retell", "custom"]),
      eventType: z.string(),
      payload: z.any(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const [event] = await db.insert(webhookEvents).values({
        provider: input.provider,
        eventType: input.eventType,
        payload: JSON.stringify(input.payload),
      }).returning({ id: webhookEvents.id });

      // Process Vapi events — handleVapiWebhook is idempotent (skips already-completed calls)
      if (input.provider === "vapi") {
        await handleVapiWebhook(input.payload, db);
      }

      await db.update(webhookEvents)
        .set({ processed: true })
        .where(eq(webhookEvents.id, event.id));

      return { received: true, eventId: event.id };
    }),

  list: publicQuery
    .input(z.object({ provider: z.string().optional(), limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      if (input?.provider && input.provider !== "all") {
        filters.push(eq(webhookEvents.provider, input.provider as any));
      }
      const items = await db.query.webhookEvents.findMany({
        where: filters.length > 0 ? and(...filters) : undefined,
        orderBy: [desc(webhookEvents.createdAt)],
        limit: input?.limit ?? 50,
      });
      return { items };
    }),

  retry: publicQuery
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const event = await db.query.webhookEvents.findFirst({ where: eq(webhookEvents.id, input.eventId) });
      if (!event) throw new Error("Event not found");
      
      await db.update(webhookEvents)
        .set({ processed: false })
        .where(eq(webhookEvents.id, input.eventId));
      
      return { success: true };
    }),
});

async function handleVapiWebhook(payload: any, db: any) {
  const eventType = payload.message?.type || payload.type || "";
  const callData = payload.call || payload.message?.call || payload;
  const externalCallId = callData?.id || callData?.call_id || "";
  
  if (!externalCallId) return;

  // Find the queued call
  const queueEntry = await db.query.callQueue.findFirst({
    where: eq(callQueue.externalCallId, externalCallId),
  });

  if (!queueEntry) return;

  // Idempotency guard: if we've already processed this call to completion, ignore
  // the repeated webhook delivery (Vapi retries on transient network issues).
  if (queueEntry.status === "completed") {
    return;
  }

  if (eventType === "call-ended" || eventType === "call.ended" || eventType === "end-of-call-report") {
    const analysis = payload.message?.analysis || payload.analysis || {};
    const transcript = payload.message?.transcript || payload.transcript || "";
    const recordingUrl = callData?.recordingUrl || callData?.recording_url || "";
    const duration = callData?.duration || callData?.durationSeconds || 0;
    const endedReason = callData?.endedReason || callData?.ended_reason || "";
    const status = callData?.status || "";
    
    // Map outcome
    const outcome = mapVapiOutcome(endedReason, status, analysis.successEvaluation);
    
    // Extract appointment if set via function call
    const functionCalls = analysis.functionCalls || [];
    const apptCall = functionCalls.find((f: any) => f.name === "setAppointment");
    const appointmentSet = !!apptCall;
    const apptDay = apptCall?.parameters?.day ?? "";
    const apptTime = apptCall?.parameters?.time ?? "";
    const painSignals = functionCalls
      .filter((f: any) => f.name === "logPainSignal")
      .map((f: any) => f.parameters?.signal)
      .join("; ");
    const askingPriceLog = functionCalls
      .find((f: any) => f.name === "logAskingPrice");
    const sellerAskingPrice = askingPriceLog?.parameters?.price;
    const dncRequested = functionCalls.some((f: any) => f.name === "addToDNC");

    // Update call queue
    await db.update(callQueue)
      .set({
        status: "completed",
        callOutcome: outcome as any,
        transcript,
        recordingUrl,
        completedAt: new Date(),
      })
      .where(eq(callQueue.id, queueEntry.id));

    // Update campaign lead
    await db.update(campaignLeads)
      .set({
        status: "completed",
        callResult: outcome as any,
        attempts: sql`${campaignLeads.attempts} + 1`,
      })
      .where(eq(campaignLeads.id, queueEntry.campaignLeadId));

    // Log in calls table
    const [callRow] = await db.insert(calls).values({
      leadId: queueEntry.leadId,
      callType: "initial",
      callOutcome: outcome as any,
      duration,
      notes: transcript?.substring(0, 500) || "",
      painSignals: painSignals || undefined,
      priceDiscussed: !!sellerAskingPrice,
      sellerAskingPrice: sellerAskingPrice || null,
      voicemailLeft: outcome === "voicemail",
      appointmentSet,
      callRecordingUrl: recordingUrl,
    } as any).returning({ id: calls.id });

    // Update lead — pipeline stage progression: preserve hot_routing for
    // no-contact outcomes so the pipeline keeps dialing; answered but no
    // appointment moves to warm nurture; appointment/DNC/not-interested
    // stop all outreach.
    const prevLeadStage = (await db.query.leads.findFirst({ where: eq(leads.id, queueEntry.leadId) }) as any)?.pipelineStage;
    const leadUpdate: any = {
      callCount: sql`${leads.callCount} + 1`,
      lastContactDate: new Date(),
      pipelineStage: appointmentSet
        ? "appointment"
        : outcome === "answered"
          ? "warm_nurture"
          : prevLeadStage === "hot_routing"
            ? "hot_routing"
            : "outreach",
      keyPainPoints: painSignals || undefined,
    };
    if (appointmentSet) {
      leadUpdate.appointmentSet = true;
    }
    if (sellerAskingPrice) {
      leadUpdate.askingPrice = sellerAskingPrice;
    }
    await db.update(leads).set(leadUpdate).where(eq(leads.id, queueEntry.leadId));

    // Write activity to unified timeline
    const outcomeEmoji: Record<string, string> = {
      answered: "📞", voicemail: "📬", no_answer: "🔕", busy: "🔄",
      appointment_set: "🔥", not_interested: "❌", dnc: "🚫", failed: "⚠️",
    };
    const emoji = outcomeEmoji[outcome] ?? "📞";
    const durationStr = duration ? ` (${Math.round(duration)}s)` : "";
    const parts = [`${emoji} VAPI call — ${outcome}${durationStr}`];
    if (appointmentSet) parts.push("🔥 Appointment set");
    if (painSignals) parts.push(`Pain signals: ${painSignals}`);
    if (sellerAskingPrice) parts.push(`Asking price: $${sellerAskingPrice}`);
    if (outcome === "voicemail") parts.push("Voicemail left");

    await db.insert(activities).values({
      leadId: queueEntry.leadId,
      type: "call",
      body: parts.join(" | "),
      linkedTable: "calls",
      linkedId: callRow?.id ?? null,
      metadata: JSON.stringify({
        outcome,
        duration,
        recordingUrl: recordingUrl || null,
        transcript: transcript ? transcript.substring(0, 600) : null,
        externalCallId,
      }),
    } as any);

    // Auto-create follow-up task when call ends without appointment
    if (!appointmentSet && outcome !== "dnc" && outcome !== "not_interested") {
      const followUpHours = outcome === "voicemail" ? 48 : outcome === "no_answer" ? 24 : 72;
      const dueAt = new Date(Date.now() + followUpHours * 60 * 60 * 1000);
      const taskTitles: Record<string, string> = {
        voicemail: "Follow-up call — voicemail left",
        no_answer: "Follow-up call — no answer",
        busy: "Follow-up call — line busy",
        answered: "Follow-up call — conversation, no appointment",
      };
      await db.insert(tasks).values({
        leadId: queueEntry.leadId,
        type: "call_back",
        title: taskTitles[outcome] ?? "Follow-up call",
        notes: painSignals ? `Pain signals: ${painSignals}` : undefined,
        dueAt,
        status: "pending",
      } as any);
    }

    // Pipeline: stop all outreach on terminal outcomes; enroll answered
    // (no appointment) leads into the LadyJaye warm nurture track.
    if (appointmentSet || outcome === "dnc" || outcome === "not_interested") {
      try {
        await cancelNurtureTasks(queueEntry.leadId);
      } catch (err) {
        console.error("[webhooks] cancelNurtureTasks error:", err);
      }
    } else if (outcome === "answered") {
      try {
        await enrollInTrack(queueEntry.leadId, "warm_nurture");
      } catch (err) {
        console.error("[webhooks] enrollInTrack error:", err);
      }
    }

    // Notify via Telegram when appointment is set
    if (appointmentSet) {
      const apptLead = await db.query.leads.findFirst({ where: eq(leads.id, queueEntry.leadId) });

      // Persist a real appointment record from Maya's captured day/time so it
      // shows in the dashboard and can be marked confirmed — not just a flag.
      // Best-effort: never let this break the outcome/alert flow.
      let whenLabel = "";
      try {
        const { scheduledDate, scheduledTime } = parseApptDateTime(apptDay, apptTime);
        await db.insert(appointments).values({
          leadId: queueEntry.leadId,
          scheduledDate,
          scheduledTime,
          appointmentType: "walkthrough",
          status: "scheduled",
          notes: `Set by Maya on VAPI call. Captured: "${apptDay} ${apptTime}".${painSignals ? ` Pain: ${painSignals}` : ""}`.slice(0, 1000),
        } as any);
        await db.update(leads).set({ appointmentDate: scheduledDate } as any).where(eq(leads.id, queueEntry.leadId));
        whenLabel = `${apptDay} ${apptTime}`.trim();
      } catch (err) {
        console.error("[webhooks] appointment record creation failed:", err);
      }

      const apptMsg =
        `🔥 <b>Appointment Set!</b>\n\n` +
        `<b>${apptLead?.sellerName ?? "Unknown"}</b>\n` +
        `📍 ${apptLead?.propertyAddress ?? ""}\n` +
        `📞 ${apptLead?.phone ?? ""}\n` +
        (whenLabel ? `🗓 <b>${whenLabel}</b>\n` : "") +
        `\nCall the seller to confirm, then mark it confirmed in the dashboard.`;
      await sendAlert(apptMsg, "quickkick");
      await sendAlert(apptMsg, "ladyjaye");

      // Auto-match buyers and send match alert to both bots
      const matches = await matchBuyersToLead(queueEntry.leadId, db);
      const matchMsg = formatBuyerMatchAlert(
        queueEntry.leadId,
        apptLead?.sellerName ?? "Unknown",
        apptLead?.propertyAddress ?? "",
        apptLead?.askingPrice ?? null,
        matches,
      );
      await sendAlert(matchMsg, "quickkick");
      await sendAlert(matchMsg, "ladyjaye");
    }

    // Handle DNC request
    if (dncRequested) {
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, queueEntry.leadId) });
      if (lead?.phone) {
        await db.insert(dncList).values({
          phone: lead.phone,
          name: lead.sellerName,
          reason: "seller_request",
          source: "vapi_ai_call",
          notes: `Seller requested DNC during AI call ${externalCallId}`,
        });
        await db.insert(activities).values({
          leadId: queueEntry.leadId,
          type: "system",
          body: "🚫 Seller requested Do Not Call — added to DNC list",
          linkedTable: "calls",
          linkedId: callRow?.id ?? null,
          metadata: JSON.stringify({ phone: lead.phone, source: "vapi_ai_call", externalCallId }),
        } as any);
      }
    }

    // Update campaign stats
    await db.execute(sql`
      UPDATE campaigns 
      SET callsCompleted = callsCompleted + 1,
          appointmentsSet = appointmentsSet + ${appointmentSet ? 1 : 0}
      WHERE id = ${queueEntry.campaignId}
    `);
  }

  if (eventType === "status-update" || eventType === "call.started") {
    await db.update(callQueue)
      .set({ status: "connected" })
      .where(eq(callQueue.externalCallId, externalCallId));
  }
}

function mapVapiOutcome(endedReason: string, status: string, successEvaluation: string | undefined): string {
  const reason = (endedReason || "").toLowerCase();
  const st = (status || "").toLowerCase();
  
  if (reason.includes("voicemail")) return "voicemail";
  if (reason.includes("no-answer") || reason.includes("unanswered") || reason.includes("no_answer")) return "no_answer";
  if (reason.includes("busy")) return "busy";
  if (reason.includes("appointment") || successEvaluation === "success") return "appointment_set";
  if (reason.includes("not_interested") || reason.includes("declined") || successEvaluation === "failure") return "not_interested";
  if (reason.includes("dnc") || reason.includes("do_not_call")) return "dnc";
  if (st.includes("completed") || st.includes("ended")) return "answered";
  return "answered";
}
