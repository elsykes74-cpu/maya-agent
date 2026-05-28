import type { Context } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads } from "../../db/schema";
import { sendTelegramMessage } from "./telegram";
import { createVapiCall } from "./vapi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------
export async function handleTelegramWebhook(c: Context): Promise<Response> {
  let update: TelegramUpdate;
  try {
    update = await c.req.json();
  } catch {
    return c.json({ ok: false }, 400);
  }

  const msg = update.message;
  if (!msg?.text) return c.json({ ok: true });

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  try {
    if (text.startsWith("/start")) {
      await handleStart(chatId);
    } else if (text.startsWith("/leads")) {
      await handleLeads(chatId);
    } else if (text.startsWith("/lead ")) {
      const query = text.slice(6).trim();
      await handleLeadSearch(chatId, query);
    } else if (text.startsWith("/call ")) {
      const query = text.slice(6).trim();
      await handleCall(chatId, query);
    } else if (text.startsWith("/stats")) {
      await handleStats(chatId);
    } else {
      await sendTelegramMessage(chatId, [
        "Commands:",
        "/leads — recent leads",
        "/lead &lt;name or phone&gt; — search a lead",
        "/call &lt;phone&gt; — trigger a VAPI call",
        "/stats — pipeline summary",
      ].join("\n"));
    }
  } catch (err) {
    console.error("[telegram-webhook] handler error:", err);
    await sendTelegramMessage(chatId, "⚠️ Something went wrong. Check server logs.");
  }

  return c.json({ ok: true });
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------
async function handleStart(chatId: number): Promise<void> {
  await sendTelegramMessage(chatId, [
    "👋 <b>Maya Agent Bot</b>",
    "",
    "Your chat ID is: <code>" + chatId + "</code>",
    "Set this as TELEGRAM_CHAT_ID in your Vercel env vars to receive notifications.",
    "",
    "/leads — recent leads",
    "/lead &lt;name or phone&gt; — search",
    "/call &lt;phone&gt; — trigger outbound call",
    "/stats — pipeline summary",
  ].join("\n"));
}

// ---------------------------------------------------------------------------
// /leads
// ---------------------------------------------------------------------------
async function handleLeads(chatId: number): Promise<void> {
  const db = getDb();
  const items = await db.query.leads.findMany({
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
    limit: 5,
  });

  if (!items.length) {
    await sendTelegramMessage(chatId, "No leads yet.");
    return;
  }

  const lines = ["<b>Recent Leads</b>", ""];
  for (const lead of items) {
    const m = lead.motivationLevel;
    const emoji = m === "hot" ? "🔥" : m === "warm" ? "♨️" : "❄️";
    lines.push(`${emoji} <b>${lead.sellerName}</b>`);
    lines.push(`📍 ${lead.propertyAddress}`);
    if (lead.phone) lines.push(`📞 ${lead.phone}`);
    lines.push(`Stage: ${lead.pipelineStage ?? "lead"} · Calls: ${lead.callCount ?? 0}`);
    lines.push(`🆔 #${lead.id}`);
    lines.push("");
  }

  await sendTelegramMessage(chatId, lines.join("\n").trimEnd());
}

// ---------------------------------------------------------------------------
// /lead <query>
// ---------------------------------------------------------------------------
async function handleLeadSearch(chatId: number, query: string): Promise<void> {
  if (!query) {
    await sendTelegramMessage(chatId, "Usage: /lead &lt;name or phone&gt;");
    return;
  }

  const db = getDb();
  const term = `%${query}%`;
  const items = await db.query.leads.findMany({
    where: sql`(${leads.sellerName} ILIKE ${term} OR ${leads.phone} ILIKE ${term} OR ${leads.propertyAddress} ILIKE ${term})`,
    limit: 3,
  });

  if (!items.length) {
    await sendTelegramMessage(chatId, `No leads found for "${query}".`);
    return;
  }

  const lines = [`<b>Results for "${query}"</b>`, ""];
  for (const lead of items) {
    const m = lead.motivationLevel;
    const emoji = m === "hot" ? "🔥" : m === "warm" ? "♨️" : "❄️";
    lines.push(`${emoji} <b>${lead.sellerName}</b> — #${lead.id}`);
    lines.push(`📍 ${lead.propertyAddress}`);
    if (lead.phone) lines.push(`📞 ${lead.phone}`);
    lines.push(`Stage: ${lead.pipelineStage ?? "lead"}`);
    if (lead.motivationLevel) lines.push(`Motivation: ${lead.motivationLevel.toUpperCase()}`);
    if (lead.keyPainPoints) lines.push(`⚠️ ${lead.keyPainPoints}`);
    lines.push("");
  }

  await sendTelegramMessage(chatId, lines.join("\n").trimEnd());
}

// ---------------------------------------------------------------------------
// /call <phone>
// ---------------------------------------------------------------------------
async function handleCall(chatId: number, phone: string): Promise<void> {
  if (!phone) {
    await sendTelegramMessage(chatId, "Usage: /call &lt;phone number&gt;");
    return;
  }

  const db = getDb();
  // Normalize phone for search
  const cleanPhone = phone.replace(/\D/g, "");
  const term = `%${cleanPhone}%`;

  const lead = await db.query.leads.findFirst({
    where: sql`regexp_replace(${leads.phone}, '[^0-9]', '', 'g') LIKE ${term}`,
  });

  if (!lead || !lead.phone) {
    await sendTelegramMessage(
      chatId,
      `❌ No lead found with phone matching <code>${phone}</code>.\n\nUse /lead to search by name first.`,
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    `📞 Initiating call to <b>${lead.sellerName}</b> at ${lead.phone}…`,
  );

  const result = await createVapiCall(lead.id, lead.phone, lead.sellerName);

  if (!result) {
    await sendTelegramMessage(
      chatId,
      "❌ Call failed. Check VAPI credentials and assistant ID in Settings.",
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    [
      "✅ <b>Call launched</b>",
      `👤 ${lead.sellerName}`,
      `📞 ${lead.phone}`,
      `🆔 VAPI call ID: <code>${result.id}</code>`,
      `Status: ${result.status}`,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// /stats
// ---------------------------------------------------------------------------
async function handleStats(chatId: number): Promise<void> {
  const db = getDb();

  const [hotR, warmR, coldR, totalR, apptR] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.motivationLevel, "hot")),
    db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.motivationLevel, "warm")),
    db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.motivationLevel, "cold")),
    db.select({ count: sql<number>`count(*)` }).from(leads),
    db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.appointmentSet, true)),
  ]);

  const byStage = await db
    .select({ stage: leads.pipelineStage, count: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.pipelineStage);

  const stageLines = byStage
    .filter((s) => s.count > 0)
    .map((s) => `  ${s.stage ?? "unknown"}: ${s.count}`)
    .join("\n");

  const text = [
    "<b>📊 Pipeline Stats</b>",
    "",
    `Total leads: ${totalR[0]?.count ?? 0}`,
    `🔥 Hot: ${hotR[0]?.count ?? 0}`,
    `♨️ Warm: ${warmR[0]?.count ?? 0}`,
    `❄️ Cold: ${coldR[0]?.count ?? 0}`,
    `🗓 Appointments: ${apptR[0]?.count ?? 0}`,
    "",
    "<b>By Stage</b>",
    stageLines || "  (no data)",
  ].join("\n");

  await sendTelegramMessage(chatId, text);
}
