import { Hono } from "hono";
import { eq, gte, and, lt, desc, sql } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { leads } from "../db/schema";
import {
  sendMessage,
  formatLeadCard,
  formatDailyDigest,
  formatScoreBreakdown,
  helpText,
} from "./lib/telegram";
import {
  generateCallOpening,
  generateSMSOpener,
  generateOutreachAngle,
} from "./lib/lead-scorer";

export const telegramApp = new Hono();

telegramApp.post("/webhook", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.text("ok");

  const message = body.message ?? body.edited_message;
  if (!message?.text) return c.text("ok");

  const chatId = String(message.chat.id);
  const rawText = (message.text as string).trim();
  const parts = rawText.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/@\w+$/, "");

  try {
    switch (cmd) {
      case "/start":
      case "/help":
        await sendMessage(chatId, helpText(), { parse_mode: "HTML" });
        break;
      case "/hot":
        await handleHotLeads(chatId);
        break;
      case "/warm":
        await handleWarmLeads(chatId);
        break;
      case "/leads":
        await handleRecentLeads(chatId);
        break;
      case "/digest":
        await handleDigest(chatId);
        break;
      case "/outreach": {
        const id = parts[1] ? parseInt(parts[1], 10) : NaN;
        if (!isNaN(id)) await handleOutreach(chatId, id);
        else await sendMessage(chatId, "Usage: /outreach [lead_id]\nExample: /outreach 42");
        break;
      }
      case "/score": {
        const id = parts[1] ? parseInt(parts[1], 10) : NaN;
        if (!isNaN(id)) await handleScore(chatId, id);
        else await sendMessage(chatId, "Usage: /score [lead_id]\nExample: /score 42");
        break;
      }
      default:
        await sendMessage(chatId, "Unknown command. Type /help for available commands.");
    }
  } catch (err) {
    console.error("[telegram/webhook] error:", err);
    await sendMessage(chatId, "⚠️ Something went wrong. Try again.");
  }

  return c.text("ok");
});

async function handleHotLeads(chatId: string) {
  const db = getDb();
  const items = await db.query.leads.findMany({
    where: gte(leads.leadScore, 80),
    orderBy: [desc(leads.leadScore)],
    limit: 5,
  });
  if (!items.length) {
    await sendMessage(chatId, "🔥 No HOT leads yet. Use /digest or add leads via the web app.");
    return;
  }
  const header = `🔥 <b>HOT LEADS — ${items.length} found</b>\n${"─".repeat(22)}\n\n`;
  await sendMessage(chatId, header + items.map((l) => formatLeadCard(l)).join("\n─\n"), {
    parse_mode: "HTML",
  });
}

async function handleWarmLeads(chatId: string) {
  const db = getDb();
  const items = await db.query.leads.findMany({
    where: and(gte(leads.leadScore, 60), lt(leads.leadScore, 80)),
    orderBy: [desc(leads.leadScore)],
    limit: 5,
  });
  if (!items.length) {
    await sendMessage(chatId, "⚡ No WARM leads yet.");
    return;
  }
  const header = `⚡ <b>WARM LEADS — ${items.length} found</b>\n${"─".repeat(22)}\n\n`;
  await sendMessage(chatId, header + items.map((l) => formatLeadCard(l)).join("\n─\n"), {
    parse_mode: "HTML",
  });
}

async function handleRecentLeads(chatId: string) {
  const db = getDb();
  const items = await db.query.leads.findMany({
    orderBy: [desc(leads.createdAt)],
    limit: 5,
  });
  if (!items.length) {
    await sendMessage(chatId, "📭 No leads yet. Add leads via the web app.");
    return;
  }
  const header = `📋 <b>RECENT LEADS</b>\n${"─".repeat(22)}\n\n`;
  await sendMessage(chatId, header + items.map((l) => formatLeadCard(l, true)).join("\n─\n"), {
    parse_mode: "HTML",
  });
}

async function handleDigest(chatId: string) {
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
    db.select({ count: sql<number>`count(*)` })
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

  await sendMessage(chatId, formatDailyDigest(stats, hotLeads, warmLeads), { parse_mode: "HTML" });
}

async function handleOutreach(chatId: string, id: number) {
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`);
    return;
  }

  const callOpening = lead.callOpening ?? generateCallOpening(lead.propertyAddress);
  const smsOpener = lead.smsOpener ?? generateSMSOpener(lead.sellerName, lead.propertyAddress);
  const angle = lead.outreachAngle ?? generateOutreachAngle(lead.leadType);

  let msg = `🎯 <b>Outreach — #${id} ${lead.sellerName}</b>\n`;
  msg += `📍 ${lead.propertyAddress}\n\n`;
  msg += `<b>Strategy:</b>\n<i>${angle}</i>\n\n`;
  msg += `📞 <b>Call Opening:</b>\n"${callOpening}"\n\n`;
  msg += `💬 <b>SMS Opener (${smsOpener.length} chars):</b>\n"${smsOpener}"`;

  await sendMessage(chatId, msg, { parse_mode: "HTML" });
}

async function handleScore(chatId: string, id: number) {
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`);
    return;
  }
  await sendMessage(chatId, formatScoreBreakdown(lead), { parse_mode: "HTML" });
}
