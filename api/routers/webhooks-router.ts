import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { webhookEvents, campaignLeads, callQueue, calls, leads, dncList, activities, tasks } from "../../db/schema";
import { sendAlert } from "../lib/telegram";

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
    const appointmentSet = functionCalls.some((f: any) => f.name === "setAppointment");
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

    // Update lead
    const leadUpdate: any = {
      callCount: sql`${leads.callCount} + 1`,
      lastContactDate: new Date(),
      pipelineStage: appointmentSet ? "appointment" : outcome === "not_interested" ? "cold_drip" : "outreach",
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

    // Notify via Telegram when appointment is set
    if (appointmentSet) {
      const apptLead = await db.query.leads.findFirst({ where: eq(leads.id, queueEntry.leadId) });
      const msg =
        `🔥 <b>Appointment Set!</b>\n\n` +
        `<b>${apptLead?.sellerName ?? "Unknown"}</b>\n` +
        `📍 ${apptLead?.propertyAddress ?? ""}\n` +
        `📞 ${apptLead?.phone ?? ""}\n\n` +
        `Call outcome logged. Follow up to confirm time.`;
      await sendAlert(msg, "quickkick");
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
