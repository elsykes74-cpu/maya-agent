import { eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads, tasks, activities, offers, buyers } from "../../db/schema";
import { sendMessage, escapeHtml } from "../lib/telegram";
import { generateFollowUpMessage, rewriteMessage, callClaudeConversation } from "../lib/message-generator";
import { saveFollowUpMessage, getFollowUpHistory } from "../lib/crm-saver";
import type { MessageTone, MessageType } from "../lib/message-generator";

function ladyJayeHelp(): string {
  return (
    `💬 <b>LadyJayeBot — Content & Follow-Up</b>\n\n` +
    `<b>Message Generation</b>\n` +
    `/sms [id] — Generate SMS follow-up (160 chars)\n` +
    `/email [id] — Generate email follow-up\n` +
    `/voicemail [id] — Generate voicemail script\n` +
    `/followup [id] — Generate follow-up message\n` +
    `/rewrite [tone] [message] — Rewrite in professional / friendly / direct\n` +
    `/history [id] — Show last 5 saved follow-ups\n` +
    `\n<b>CRM Commands</b>\n` +
    `/tasks [id] — Pending tasks for a lead\n` +
    `/timeline [id] — Recent activity timeline\n` +
    `/offer [id] [amount] — Create an offer for a lead\n` +
    `/addbuyer [name] — Add a cash buyer to the database\n` +
    `\n/help — Show this menu\n\n` +
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
  msg += `<b>#${id} — ${escapeHtml(lead.sellerName)}</b>\n`;
  msg += `📍 ${escapeHtml(lead.propertyAddress)}\n\n`;
  msg += `<code>${escapeHtml(content)}</code>\n\n`;
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
  msg += `<b>Original:</b>\n<i>${escapeHtml(originalText)}</i>\n\n`;
  msg += `<b>Rewritten:</b>\n<code>${escapeHtml(rewritten)}</code>`;

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

  let msg = `📋 <b>Follow-Up History — #${id} ${escapeHtml(lead.sellerName)}</b>\n${"─".repeat(22)}\n\n`;
  for (const item of history) {
    const date = new Date(item.createdAt).toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    });
    msg += `<b>${escapeHtml(item.messageType.toUpperCase())}</b> · ${escapeHtml(item.tone)} · ${date}\n`;
    msg += `<i>${escapeHtml(item.content.slice(0, 120))}${item.content.length > 120 ? "…" : ""}</i>\n\n`;
  }

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleTasks(chatId: string, parts: string[], token: string): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(id)) {
    await sendMessage(chatId, "Usage: /tasks [lead_id]\nExample: /tasks 42", { token } as any);
    return;
  }
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }
  // Ascending: overdue / most-due-first on top, undated tasks last (Postgres sorts NULLs last for ASC).
  const pendingTasks = await db.query.tasks.findMany({
    where: and(eq(tasks.leadId, id), eq(tasks.status, "pending")),
    orderBy: [asc(tasks.dueAt)],
    limit: 10,
  });

  let msg = `📋 <b>Tasks — #${id} ${escapeHtml(lead.sellerName)}</b>\n`;
  if (!pendingTasks.length) {
    msg += `\n✅ No pending tasks.`;
  } else {
    for (const t of pendingTasks) {
      const dueStr = t.dueAt
        ? new Date(t.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "no due date";
      const typeLabel = t.type === "call_back" ? "📞" : t.type === "send_sms" ? "💬" : t.type === "send_email" ? "📧" : "📌";
      const overdue = t.dueAt && new Date(t.dueAt) <= new Date() ? " ⚠️" : "";
      msg += `\n${typeLabel} <b>${escapeHtml(t.title)}</b>${overdue}\n   Due: ${dueStr}\n`;
      if (t.notes) msg += `   <i>${escapeHtml(t.notes)}</i>\n`;
    }
  }
  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleTimeline(chatId: string, parts: string[], token: string): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(id)) {
    await sendMessage(chatId, "Usage: /timeline [lead_id]\nExample: /timeline 42", { token } as any);
    return;
  }
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }
  const recentActivities = await db.query.activities.findMany({
    where: eq(activities.leadId, id),
    orderBy: [desc(activities.createdAt)],
    limit: 8,
  });

  let msg = `📅 <b>Timeline — #${id} ${escapeHtml(lead.sellerName)}</b>\n`;
  if (!recentActivities.length) {
    msg += `\n<i>No activity yet.</i>`;
  } else {
    for (const a of recentActivities) {
      const d = a.createdAt ? new Date(a.createdAt) : null;
      const dateStr = d && !isNaN(d.getTime())
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "—";
      msg += `\n<b>${dateStr}</b> ${escapeHtml(a.body.slice(0, 120))}`;
    }
  }
  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleOffer(chatId: string, parts: string[], token: string): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  const rawAmount = parts[2] ? parts[2].replace(/[$,]/g, "") : "";
  const amount = parseFloat(rawAmount);
  if (isNaN(id) || isNaN(amount) || amount <= 0) {
    await sendMessage(chatId, "Usage: /offer [lead_id] [amount]\nExample: /offer 42 85000", { token } as any);
    return;
  }
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }
  const [created] = await db.insert(offers).values({
    leadId: id,
    offerAmount: String(amount),
    status: "draft",
  } as any).returning({ id: offers.id });
  await db.insert(activities).values({
    leadId: id,
    type: "offer",
    body: `💰 Offer created via LadyJaye bot: $${amount.toLocaleString()}`,
    linkedTable: "offers",
    linkedId: created.id,
    metadata: JSON.stringify({ offerAmount: amount, source: "telegram_bot_ladyjaye" }),
  } as any);

  const msg =
    `💰 <b>Offer Created</b>\n\n` +
    `Lead: #${id} ${escapeHtml(lead.sellerName)}\n` +
    `📍 ${escapeHtml(lead.propertyAddress)}\n` +
    `Offer Amount: <b>$${amount.toLocaleString()}</b>\n` +
    `Status: Draft\n\n` +
    `Use the web app to submit or update this offer.`;
  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleAddBuyer(chatId: string, parts: string[], token: string): Promise<void> {
  const name = parts.slice(1).join(" ").trim();
  if (!name) {
    await sendMessage(chatId, "Usage: /addbuyer [name]\nExample: /addbuyer John Smith\n\nOpen the web app to add phone, email, and buy box criteria after.", { token } as any);
    return;
  }
  const db = getDb();
  const [created] = await db.insert(buyers).values({ name, status: "active" } as any).returning({ id: buyers.id });
  const msg =
    `✅ <b>Buyer Added</b>\n\n` +
    `Name: <b>${escapeHtml(name)}</b>\n` +
    `Buyer ID: #${created.id}\n\n` +
    `Open the web app to add phone, email, and buy box criteria (zip codes, price range, etc.).`;
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
      case "/tasks":
        await handleTasks(chatId, parts, token);
        break;
      case "/timeline":
        await handleTimeline(chatId, parts, token);
        break;
      case "/offer":
        await handleOffer(chatId, parts, token);
        break;
      case "/addbuyer":
        await handleAddBuyer(chatId, parts, token);
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
