import { env } from "./env";

const botUrl = () => `https://api.telegram.org/bot${env.telegramBotToken}`;

// ---------------------------------------------------------------------------
// Core send
// ---------------------------------------------------------------------------
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
): Promise<void> {
  if (!env.telegramBotToken || !chatId) return;
  try {
    const res = await fetch(`${botUrl()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[telegram] sendMessage failed:", res.status, err);
    }
  } catch (err) {
    console.error("[telegram] sendMessage error:", err);
  }
}

// Broadcast to the configured owner chat
export async function notify(text: string): Promise<void> {
  if (!env.telegramChatId) return;
  await sendTelegramMessage(env.telegramChatId, text);
}

// ---------------------------------------------------------------------------
// Register webhook with Telegram
// ---------------------------------------------------------------------------
export async function registerWebhook(webhookUrl: string): Promise<void> {
  if (!env.telegramBotToken) return;
  const res = await fetch(`${botUrl()}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const json = await res.json() as any;
  console.log("[telegram] setWebhook:", json);
}

// ---------------------------------------------------------------------------
// Notification: new lead created
// ---------------------------------------------------------------------------
export async function notifyNewLead(lead: {
  id: number;
  sellerName: string;
  phone?: string | null;
  propertyAddress: string;
  motivationLevel?: string | null;
  pipelineStage?: string | null;
}): Promise<void> {
  const motivation = lead.motivationLevel ?? "unknown";
  const emoji = motivation === "hot" ? "🔥" : motivation === "warm" ? "♨️" : "❄️";
  const text = [
    `${emoji} <b>New Lead Added</b>`,
    `👤 ${lead.sellerName}`,
    `📍 ${lead.propertyAddress}`,
    lead.phone ? `📞 ${lead.phone}` : null,
    `📊 ${motivation.toUpperCase()} · ${lead.pipelineStage ?? "lead"}`,
    `🆔 #${lead.id}`,
  ]
    .filter(Boolean)
    .join("\n");
  await notify(text);
}

// ---------------------------------------------------------------------------
// Notification: call complete + follow-up brief
// ---------------------------------------------------------------------------
export async function notifyCallComplete(params: {
  leadName: string;
  leadId: number;
  phone: string;
  outcome: string;
  duration: number;
  appointmentSet: boolean;
  painSignals?: string;
  askingPrice?: string | null;
}): Promise<void> {
  const outcomeEmoji: Record<string, string> = {
    appointment_set: "✅",
    answered: "📞",
    voicemail: "📬",
    no_answer: "📵",
    busy: "🔴",
    not_interested: "🚫",
    dnc: "⛔",
    disconnected: "❌",
  };
  const emoji = outcomeEmoji[params.outcome] ?? "📞";

  const durationStr =
    params.duration > 0
      ? `${Math.floor(params.duration / 60)}m ${params.duration % 60}s`
      : "—";

  const lines = [
    `${emoji} <b>Call Complete — ${params.leadName}</b>`,
    `📞 ${params.phone}`,
    `📊 Outcome: <b>${params.outcome.replace(/_/g, " ").toUpperCase()}</b>`,
    `⏱ Duration: ${durationStr}`,
  ];

  if (params.appointmentSet) lines.push("🗓 Appointment booked!");
  if (params.askingPrice) lines.push(`💰 Asking price: $${params.askingPrice}`);
  if (params.painSignals) lines.push(`⚠️ Pain signals: ${params.painSignals}`);

  lines.push("", "<b>📋 Follow-Up Brief</b>");
  lines.push(buildFollowUpBrief(params));
  lines.push(`\n🆔 Lead #${params.leadId}`);

  await notify(lines.join("\n"));
}

function buildFollowUpBrief(params: {
  outcome: string;
  appointmentSet: boolean;
  painSignals?: string;
  askingPrice?: string | null;
}): string {
  if (params.appointmentSet) {
    return "Appointment booked. Send confirmation, pull comps, review pain signals before the meeting.";
  }
  switch (params.outcome) {
    case "voicemail":
      return "Left voicemail. Follow up with SMS in 2–4 hrs. Retry tomorrow morning.";
    case "no_answer":
      return "No answer. Retry in 3 hrs. Send SMS intro. Flag for 3-touch sequence.";
    case "not_interested":
      return "Declined. Move to cold drip. Set 30-day callback. Note objections for future outreach.";
    case "dnc":
      return "Added to DNC. No further contact.";
    case "busy":
      return "Line busy. Retry in 1 hour.";
    case "disconnected":
      return "Number may be disconnected. Verify contact info before retrying.";
    default:
      if (params.painSignals) {
        return `Connected. Key pain: ${params.painSignals}. Send offer within 24h.`;
      }
      return "Connected. Send follow-up SMS with offer summary within 24h.";
  }
}
