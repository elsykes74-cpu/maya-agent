import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { eq, gte, and, lt, desc, sql } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { leads } from "../db/schema";
import {
  sendMessage,
  formatLeadCard,
  formatDailyDigest,
  formatScoreBreakdown,
  registerWebhook,
  getWebhookInfo,
} from "./lib/telegram";
import {
  generateCallOpening,
  generateSMSOpener,
  generateOutreachAngle,
} from "./lib/lead-scorer";
import { env } from "./lib/env";
import { deriveScopedSecret, safeEqual } from "./lib/secrets";
import { handleQuickKickCommand, handleQuickKickNaturalLanguage } from "./bots/quickkick";
import { handleLadyJayeCommand, handleLadyJayeNaturalLanguage } from "./bots/ladyjaye";

export const telegramApp = new Hono();

type TelegramBotName = "quickkick" | "ladyjaye";

function telegramWebhookSecret(botName: TelegramBotName): string {
  return deriveScopedSecret(env.appSecret, `telegram-webhook:${botName}`);
}

function telegramGuard(botName: TelegramBotName): MiddlewareHandler {
  return async (c, next) => {
    const expected = telegramWebhookSecret(botName);
    const supplied = c.req.header("x-telegram-bot-api-secret-token") ?? "";
    if (!expected) return c.text("Webhook verification is not configured", 503);
    if (!safeEqual(expected, supplied)) return c.text("Forbidden", 403);
    return next();
  };
}

function isAllowedChat(botName: TelegramBotName, chatId: string): boolean {
  const allowed = botName === "ladyjaye" ? env.telegramChatIdLadyJaye : env.telegramChatId;
  return Boolean(allowed) && safeEqual(allowed, chatId);
}

const adminGuard: MiddlewareHandler = async (c, next) => {
  const expected = env.claudeEndpointSecret || env.appSecret;
  const supplied = c.req.header("x-maya-agent-secret") ?? "";
  if (!expected) return c.json({ error: "Administrative authentication is not configured" }, 503);
  if (!safeEqual(expected, supplied)) return c.json({ error: "Unauthorized" }, 401);
  return next();
};

// ── Shared command dispatcher ──────────────────────────────────────────────
async function dispatchCommand(
  chatId: string,
  cmd: string,
  parts: string[],
  token: string,
  botName: "quickkick" | "ladyjaye"
) {
  const send = (text: string, opts: Record<string, unknown> = {}) =>
    sendMessage(chatId, text, { ...opts, token } as any);

  switch (cmd) {
    case "/start":
    case "/help":
      // Route to each bot's own handler so /help lists all bot-specific commands.
      if (botName === "ladyjaye") {
        await handleLadyJayeCommand(chatId, cmd, parts, token);
      } else {
        await handleQuickKickCommand(chatId, cmd, parts, token);
      }
      break;
    case "/hot":
      await handleHotLeads(chatId, token);
      break;
    case "/warm":
      await handleWarmLeads(chatId, token);
      break;
    case "/leads":
      await handleRecentLeads(chatId, token);
      break;
    case "/digest":
      await handleDigest(chatId, token);
      break;
    case "/outreach": {
      const id = parts[1] ? parseInt(parts[1], 10) : NaN;
      if (!isNaN(id)) await handleOutreach(chatId, id, token);
      else await send("Usage: /outreach [lead_id]\nExample: /outreach 42");
      break;
    }
    case "/score": {
      const id = parts[1] ? parseInt(parts[1], 10) : NaN;
      if (!isNaN(id)) await handleScore(chatId, id, token);
      else await send("Usage: /score [lead_id]\nExample: /score 42");
      break;
    }
    // ── QuickKickBot exclusive commands ──────────────────────────────────────
    case "/researchlead":
    case "/scorelead":
    case "/callbrief":
    case "/leadstatus":
    case "/callnow":
      if (botName === "quickkick") {
        await handleQuickKickCommand(chatId, cmd, parts, token);
      } else {
        await send("This command is only available on QuickKickBot.");
      }
      break;
    // ── LadyJayeBot exclusive commands ───────────────────────────────────────
    case "/sms":
    case "/email":
    case "/voicemail":
    case "/followup":
    case "/rewrite":
    case "/history":
      if (botName === "ladyjaye") {
        await handleLadyJayeCommand(chatId, cmd, parts, token);
      } else {
        await send("This command is only available on LadyJayeBot.");
      }
      break;
    default:
      if (!cmd.startsWith("/")) {
        const fullText = parts.join(" ");
        if (botName === "ladyjaye") {
          await handleLadyJayeNaturalLanguage(chatId, fullText, token);
        } else {
          await handleQuickKickNaturalLanguage(chatId, fullText, token);
        }
      } else {
        await send("Unknown command. Type /help for available commands.");
      }
  }
}

function parseUpdate(body: any): { chatId: string; cmd: string; parts: string[] } | null {
  const message = body?.message ?? body?.edited_message;
  if (!message?.text) return null;
  const rawText = (message.text as string).trim();
  const parts = rawText.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/@\w+$/, "");
  return { chatId: String(message.chat.id), cmd, parts };
}

// ── Quickkick webhook ──────────────────────────────────────────────────────
telegramApp.post("/webhook", telegramGuard("quickkick"), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = parseUpdate(body);
  if (!parsed) return c.text("ok");
  const { chatId, cmd, parts } = parsed;
  if (!isAllowedChat("quickkick", chatId)) return c.text("Forbidden", 403);
  try {
    await dispatchCommand(chatId, cmd, parts, env.telegramBotToken, "quickkick");
  } catch (err) {
    console.error("[telegram/quickkick] error:", err);
    await sendMessage(chatId, "⚠️ Something went wrong. Try again.", { token: env.telegramBotToken } as any);
  }
  return c.text("ok");
});

// ── LadyJaye webhook ───────────────────────────────────────────────────────
telegramApp.post("/ladyjaye", telegramGuard("ladyjaye"), async (c) => {
  const token = env.telegramBotTokenLadyJaye;
  if (!token) return c.text("ok");
  const body = await c.req.json().catch(() => null);
  const parsed = parseUpdate(body);
  if (!parsed) return c.text("ok");
  const { chatId, cmd, parts } = parsed;
  if (!isAllowedChat("ladyjaye", chatId)) return c.text("Forbidden", 403);
  try {
    await dispatchCommand(chatId, cmd, parts, token, "ladyjaye");
  } catch (err) {
    console.error("[telegram/ladyjaye] error:", err);
    await sendMessage(chatId, "⚠️ Something went wrong. Try again.", { token } as any);
  }
  return c.text("ok");
});

// ── Webhook registration ───────────────────────────────────────────────────
export async function registerAllWebhooks(appUrl: string): Promise<void> {
  const base = appUrl.replace(/\/$/, "");

  // Only register when the operator explicitly set the token.
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const url = `${base}/api/telegram/webhook`;
    const ok = await registerWebhook(env.telegramBotToken, url, telegramWebhookSecret("quickkick"));
    console.log(`[telegram] Quickkick webhook ${ok ? "registered" : "FAILED"}: ${url}`);
  }

  if (process.env.TELEGRAM_BOT_TOKEN_LADYJAYE) {
    const url = `${base}/api/telegram/ladyjaye`;
    const ok = await registerWebhook(env.telegramBotTokenLadyJaye, url, telegramWebhookSecret("ladyjaye"));
    console.log(`[telegram] LadyJaye webhook ${ok ? "registered" : "FAILED"}: ${url}`);
  }
}

// ── Admin: manual re-registration endpoint ────────────────────────────────
telegramApp.post("/register-webhooks", adminGuard, async (c) => {
  const appUrl = env.appUrl;
  if (!appUrl || appUrl.includes("localhost")) {
    return c.json({ error: "APP_URL not set or is localhost — set it to your public domain" }, 400);
  }

  await registerAllWebhooks(appUrl);
  return c.json({ ok: true, appUrl });
});

// ── Health: show current webhook status for both bots ─────────────────────
telegramApp.get("/health", adminGuard, async (c) => {
  const [qk, lj] = await Promise.all([
    env.telegramBotToken ? getWebhookInfo(env.telegramBotToken) : null,
    env.telegramBotTokenLadyJaye ? getWebhookInfo(env.telegramBotTokenLadyJaye) : null,
  ]);
  return c.json({
    quickkick: {
      configured: Boolean(env.telegramBotToken),
      webhook: qk?.result?.url ?? null,
      pendingCount: qk?.result?.pending_update_count ?? 0,
      lastError: qk?.result?.last_error_message ?? null,
    },
    ladyjaye: {
      configured: Boolean(env.telegramBotTokenLadyJaye),
      webhook: lj?.result?.url ?? null,
      pendingCount: lj?.result?.pending_update_count ?? 0,
      lastError: lj?.result?.last_error_message ?? null,
    },
  }, 200, { "Cache-Control": "no-store" });
});

async function handleHotLeads(chatId: string, token: string) {
  const db = getDb();
  const items = await db.query.leads.findMany({
    where: gte(leads.leadScore, 80),
    orderBy: [desc(leads.leadScore)],
    limit: 5,
  });
  if (!items.length) {
    await sendMessage(chatId, "🔥 No HOT leads yet. Use /digest or add leads via the web app.", { token } as any);
    return;
  }
  const header = `🔥 <b>HOT LEADS — ${items.length} found</b>\n${"─".repeat(22)}\n\n`;
  await sendMessage(chatId, header + items.map((l) => formatLeadCard(l)).join("\n─\n"), {
    parse_mode: "HTML", token,
  } as any);
}

async function handleWarmLeads(chatId: string, token: string) {
  const db = getDb();
  const items = await db.query.leads.findMany({
    where: and(gte(leads.leadScore, 60), lt(leads.leadScore, 80)),
    orderBy: [desc(leads.leadScore)],
    limit: 5,
  });
  if (!items.length) {
    await sendMessage(chatId, "⚡ No WARM leads yet.", { token } as any);
    return;
  }
  const header = `⚡ <b>WARM LEADS — ${items.length} found</b>\n${"─".repeat(22)}\n\n`;
  await sendMessage(chatId, header + items.map((l) => formatLeadCard(l)).join("\n─\n"), {
    parse_mode: "HTML", token,
  } as any);
}

async function handleRecentLeads(chatId: string, token: string) {
  const db = getDb();
  const items = await db.query.leads.findMany({
    orderBy: [desc(leads.createdAt)],
    limit: 5,
  });
  if (!items.length) {
    await sendMessage(chatId, "📭 No leads yet. Add leads via the web app.", { token } as any);
    return;
  }
  const header = `📋 <b>RECENT LEADS</b>\n${"─".repeat(22)}\n\n`;
  await sendMessage(chatId, header + items.map((l) => formatLeadCard(l, true)).join("\n─\n"), {
    parse_mode: "HTML", token,
  } as any);
}

async function handleDigest(chatId: string, token: string) {
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

  await sendMessage(chatId, formatDailyDigest(stats, hotLeads, warmLeads), { parse_mode: "HTML", token } as any);
}

async function handleOutreach(chatId: string, id: number, token: string) {
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
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

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleScore(chatId: string, id: number, token: string) {
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }
  await sendMessage(chatId, formatScoreBreakdown(lead), { parse_mode: "HTML", token } as any);
}
