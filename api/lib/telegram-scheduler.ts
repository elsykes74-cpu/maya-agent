import { desc, gte, and, lt, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads } from "../../db/schema";
import { sendAlert, formatDailyDigest } from "./telegram";
import { env } from "./env";

let lastDigestDate = "";

function isDigestTime(): boolean {
  const et = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  return et.getHours() === 8 && et.getMinutes() === 0;
}

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

  await sendAlert(formatDailyDigest(stats, hotLeads, warmLeads));
}

export function startDailyDigestScheduler(): void {
  if (!env.telegramChatId || !env.telegramBotToken) {
    console.log("[telegram-scheduler] Skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return;
  }

  setInterval(async () => {
    if (!isDigestTime()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (lastDigestDate === today) return;
    lastDigestDate = today;
    try {
      await sendDailyDigestNow();
      console.log("[telegram-scheduler] Daily digest sent");
    } catch (err) {
      console.error("[telegram-scheduler] digest error:", err);
    }
  }, 60 * 1000);

  console.log("[telegram-scheduler] Started — digest fires at 8:00 AM ET");
}
