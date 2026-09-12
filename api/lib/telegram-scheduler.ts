import { desc, gte, and, lt, lte, eq, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads, tasks, callQueue, activities } from "../../db/schema";
import { sendAlert, formatDailyDigest } from "./telegram";
import { env } from "./env";
import { runLeadsAutomation } from "../bots/quickkick";
import { createVapiCall, scrubPhone, getCallingConfig } from "./vapi";
import { runPipelineTick } from "./pipeline-engine";

let lastDigestDate = "";

function isDigestTime(): boolean {
  const et = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  return et.getHours() === 8 && et.getMinutes() === 0;
}

function isLeadRunTime(): boolean {
  const et = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  return et.getHours() === 9 && et.getMinutes() === 0;
}

let lastLeadRunDate = "";
let lastPipelineTick = 0;

export async function sendDailyDigestNow(): Promise<void> {
  const db = getDb();
  const [totalResult, hotLeads, warmLeads, nurtureResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(leads),
    db.query.leads.findMany({
      where: gte(leads.leadScore, 80),
      orderBy: [desc(leads.leadScore)],
      limit: 5,
    }),
    db.query.leads.findMany({
      where: and(gte(leads.leadScore, 60), lt(leads.leadScore, 80)),
      orderBy: [desc(leads.leadScore)],
      limit: 3,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(and(gte(leads.leadScore, 40), lt(leads.leadScore, 60))),
  ]);

  const total = Number(totalResult[0]?.count ?? 0);
  const nurture = Number(nurtureResult[0]?.count ?? 0);
  const stats = {
    hot: hotLeads.length,
    warm: warmLeads.length,
    nurture,
    low: Math.max(0, total - hotLeads.length - warmLeads.length - nurture),
    total,
  };

  const digest = formatDailyDigest(stats, hotLeads, warmLeads);
  await sendAlert(digest, "quickkick");
  await sendAlert(digest, "ladyjaye");
}

// Process call_back tasks that are due — auto-dial the lead via VAPI
async function processFollowUpTasks(): Promise<void> {
  const db = getDb();
  const config = await getCallingConfig();
  if (!config?.apiKey) return;

  const dueTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.type, "call_back"),
      eq(tasks.status, "pending"),
      lte(tasks.dueAt, new Date()),
    ),
    limit: 20,
  });

  if (!dueTasks.length) return;
  console.log(`[follow-up-processor] ${dueTasks.length} call_back tasks due`);

  for (const task of dueTasks) {
    try {
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, Number(task.leadId)) });
      if (!lead?.phone) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        continue;
      }

      // Skip leads that already have an appointment
      if (lead.appointmentSet) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        continue;
      }

      const scrub = await scrubPhone(lead.phone, config.scrubDncBeforeCall ?? true, config.scrubLitigants ?? true);
      if (!scrub.pass) {
        await db.update(tasks).set({ status: "cancelled" } as any).where(eq(tasks.id, task.id));
        await db.insert(activities).values({
          leadId: lead.id,
          type: "system",
          body: `🚫 Follow-up call blocked: ${scrub.reason}`,
          linkedTable: "tasks",
          linkedId: task.id,
        } as any);
        continue;
      }

      // Mark in-progress before dialing
      await db.update(tasks).set({ status: "in_progress" } as any).where(eq(tasks.id, task.id));

      const [queueRow] = await db.insert(callQueue).values({
        campaignId: 0,
        campaignLeadId: 0,
        leadId: lead.id,
        phone: lead.phone,
        status: "queued",
      } as any).returning({ id: callQueue.id });

      const vapiCall = await createVapiCall(lead.id, lead.phone, lead.sellerName);
      if (!vapiCall) {
        console.error(`[follow-up-processor] VAPI call failed for lead #${lead.id} — re-queueing task`);
        await db.update(tasks).set({ status: "pending" } as any).where(eq(tasks.id, task.id));
        continue;
      }

      if (queueRow?.id) {
        await db.update(callQueue)
          .set({ externalCallId: vapiCall.id, status: "dialing" } as any)
          .where(eq(callQueue.id, queueRow.id));
      }

      // Mark task complete — VAPI webhook will create next follow-up task if needed
      await db.update(tasks).set({ status: "completed", completedAt: new Date() } as any).where(eq(tasks.id, task.id));

      console.log(`[follow-up-processor] Dialed lead #${lead.id} (${lead.sellerName}) — VAPI ${vapiCall.id}`);
    } catch (err) {
      console.error(`[follow-up-processor] Error on task #${task.id}:`, err);
      await db.update(tasks).set({ status: "pending" } as any).where(eq(tasks.id, task.id));
    }
  }
}

export function startDailyDigestScheduler(): void {
  const hasAnyBot = (env.telegramBotToken && env.telegramChatId) ||
    (env.telegramBotTokenLadyJaye && env.telegramChatIdLadyJaye);
  if (!hasAnyBot) {
    console.log("[telegram-scheduler] Skipped — no bot tokens/chat IDs configured");
    return;
  }

  setInterval(async () => {
    const today = new Date().toISOString().slice(0, 10);

    if (isDigestTime() && lastDigestDate !== today) {
      lastDigestDate = today;
      try {
        await sendDailyDigestNow();
        console.log("[telegram-scheduler] Daily digest sent");
      } catch (err) {
        console.error("[telegram-scheduler] digest error:", err);
      }
    }

    if (isLeadRunTime() && lastLeadRunDate !== today) {
      lastLeadRunDate = today;
      try {
        console.log("[telegram-scheduler] Starting scheduled lead run");
        await runLeadsAutomation();
        console.log("[telegram-scheduler] Scheduled lead run complete");
      } catch (err) {
        console.error("[telegram-scheduler] lead run error:", err);
      }
    }

    // Pipeline tick every 15 min — route new leads, dial hot via Maya,
    // send due LadyJaye nurture SMS
    if (Date.now() - lastPipelineTick > 15 * 60 * 1000) {
      lastPipelineTick = Date.now();
      try {
        const summary = await runPipelineTick();
        console.log(`[pipeline] tick: ${summary}`);
      } catch (err) {
        console.error("[pipeline] tick error:", err);
      }
    }

    // Process due follow-up tasks every tick (every 60s)
    try {
      await processFollowUpTasks();
    } catch (err) {
      console.error("[follow-up-processor] error:", err);
    }
  }, 60 * 1000);

  console.log("[telegram-scheduler] Started — digest at 8:00 AM ET, lead run at 9:00 AM ET, follow-ups every 60s");
}
