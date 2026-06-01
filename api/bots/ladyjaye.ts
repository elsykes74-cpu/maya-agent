import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads } from "../../db/schema";
import { sendMessage } from "../lib/telegram";
import { generateFollowUpMessage, rewriteMessage, callClaudeConversation } from "../lib/message-generator";
import { saveFollowUpMessage, getFollowUpHistory } from "../lib/crm-saver";
import type { MessageTone, MessageType } from "../lib/message-generator";

function ladyJayeHelp(): string {
  return (
    `💬 <b>LadyJayeBot — Content & Follow-Up</b>\n\n` +
    `/sms [id] — Generate SMS follow-up (160 chars)\n` +
    `/email [id] — Generate email follow-up\n` +
    `/voicemail [id] — Generate voicemail script\n` +
    `/followup [id] — Generate follow-up message\n` +
    `/rewrite [tone] [message] — Rewrite in professional / friendly / direct\n` +
    `/history [id] — Show last 5 saved follow-ups\n` +
    `/help — Show this menu\n\n` +
    `Also available: /hot /warm /leads /digest /outreach /score`
  );
}

const TYPE_LABELS: Record<MessageType, string> = {
  sms: "📱 SMS Follow-Up",
  email: "📧 Email Follow-Up",
  voicemail: "📞 Voicemail Script",
  followup: "💬 Follow-Up Message",
};

async function handleGenerateMessage(
  chatId: string,
  parts: string[],
  token: string,
  type: MessageType,
  tone: MessageTone
): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(id)) {
    await sendMessage(chatId, `Usage: /${type} [lead_id]\nExample: /${type} 42`, { token } as any);
    return;
  }

  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }

  await sendMessage(chatId, `✍️ Generating ${TYPE_LABELS[type]}…`, { token } as any);

  const content = await generateFollowUpMessage(lead, type, tone);
  await saveFollowUpMessage(id, type, content, tone);

  let msg = `${TYPE_LABELS[type]}\n`;
  msg += `<b>#${id} — ${lead.sellerName}</b>\n`;
  msg += `📍 ${lead.propertyAddress}\n\n`;
  msg += `<code>${content}</code>\n\n`;
  msg += `<i>💾 Saved to CRM</i>`;

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleRewrite(chatId: string, parts: string[], token: string): Promise<void> {
  const VALID_TONES: MessageTone[] = ["professional", "friendly", "direct"];
  const rawTone = parts[1]?.toLowerCase() as MessageTone;

  if (!rawTone || !VALID_TONES.includes(rawTone)) {
    await sendMessage(
      chatId,
      "Usage: /rewrite [tone] [message]\nTones: professional | friendly | direct\nExample: /rewrite professional Hey call me back",
      { token } as any
    );
    return;
  }

  const originalText = parts.slice(2).join(" ").trim();
  if (!originalText) {
    await sendMessage(chatId, "Please include a message to rewrite after the tone.\nExample: /rewrite friendly Can we talk?", { token } as any);
    return;
  }

  await sendMessage(chatId, `✍️ Rewriting in <b>${rawTone}</b> tone…`, { parse_mode: "HTML", token } as any);

  const rewritten = await rewriteMessage(originalText, rawTone);

  let msg = `✏️ <b>Rewritten (${rawTone})</b>\n\n`;
  msg += `<b>Original:</b>\n<i>${originalText}</i>\n\n`;
  msg += `<b>Rewritten:</b>\n<code>${rewritten}</code>`;

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleHistory(chatId: string, parts: string[], token: string): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(id)) {
    await sendMessage(chatId, "Usage: /history [lead_id]\nExample: /history 42", { token } as any);
    return;
  }

  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }

  const history = await getFollowUpHistory(id, 5);

  if (!history.length) {
    await sendMessage(chatId, `📭 No follow-up history for Lead #${id} yet.`, { token } as any);
    return;
  }

  let msg = `📋 <b>Follow-Up History — #${id} ${lead.sellerName}</b>\n${"─".repeat(22)}\n\n`;
  for (const item of history) {
    const date = new Date(item.createdAt).toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    });
    msg += `<b>${item.messageType.toUpperCase()}</b> · ${item.tone} · ${date}\n`;
    msg += `<i>${item.content.slice(0, 120)}${item.content.length > 120 ? "…" : ""}</i>\n\n`;
  }

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

const LADYJAYE_SYSTEM = `You are LadyJayeBot, a real estate outreach and messaging specialist for a wholesale investor in Western Massachusetts. You help write SMS messages, emails, voicemail scripts, follow-up content, and provide messaging strategy and advice. Keep responses concise and Telegram-friendly (plain text, short paragraphs). For generating messages for specific leads, remind users of: /sms [id], /email [id], /voicemail [id], /followup [id], /rewrite [tone] [message].`;

export async function handleLadyJayeNaturalLanguage(chatId: string, text: string, token: string): Promise<void> {
  const response = await callClaudeConversation(LADYJAYE_SYSTEM, text);
  await sendMessage(chatId, response, { token } as any);
}

export async function handleLadyJayeCommand(
  chatId: string,
  cmd: string,
  parts: string[],
  token: string
): Promise<void> {
  try {
    switch (cmd) {
      case "/sms":
        await handleGenerateMessage(chatId, parts, token, "sms", "friendly");
        break;
      case "/email":
        await handleGenerateMessage(chatId, parts, token, "email", "professional");
        break;
      case "/voicemail":
        await handleGenerateMessage(chatId, parts, token, "voicemail", "friendly");
        break;
      case "/followup":
        await handleGenerateMessage(chatId, parts, token, "followup", "friendly");
        break;
      case "/rewrite":
        await handleRewrite(chatId, parts, token);
        break;
      case "/history":
        await handleHistory(chatId, parts, token);
        break;
      case "/help":
        await sendMessage(chatId, ladyJayeHelp(), { parse_mode: "HTML", token } as any);
        break;
      default:
        await sendMessage(chatId, "Unknown command. Type /help for available commands.", { token } as any);
    }
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    await sendMessage(chatId, `⚠️ ${cmd} failed: ${errMsg}`, { token } as any);
  }
}
