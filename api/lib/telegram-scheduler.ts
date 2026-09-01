import { desc, gte, and, lt, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads } from "../../db/schema";
import { sendAlert, formatDailyDigest } from "./telegram";
import { env } from "./env";
import { runLeadsAutomation } from "../bots/quickkick";

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
  }, 60 * 1000);

  console.log("[telegram-scheduler] Started — digest at 8:00 AM ET, lead run at 9:00 AM ET");
}
