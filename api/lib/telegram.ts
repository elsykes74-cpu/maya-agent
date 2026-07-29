import { env } from "./env";

const botUrl = (token: string) => `https://api.telegram.org/bot${token}`;

// Compatibility shim for older code that uses sendTelegramMessage/notify
export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  return sendMessage(String(chatId), text, { parse_mode: "HTML" });
}

export async function notify(text: string): Promise<void> {
  if (!env.telegramChatId) return;
  return sendTelegramMessage(env.telegramChatId, text);
}

export async function sendMessage(
  chatId: string,
  text: string,
  opts: { parse_mode?: "HTML"; disable_web_page_preview?: boolean; token?: string; [k: string]: unknown } = {}
): Promise<void> {
  const token = opts.token ?? env.telegramBotToken;
  if (!token || !chatId) return;
  const { token: _t, ...rest } = opts;
  try {
    const res = await fetch(`${botUrl(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...rest }),
    });
    if (!res.ok) console.error("[telegram] sendMessage error:", await res.text());
  } catch (err) {
    console.error("[telegram] sendMessage fetch error:", err);
  }
}

export async function sendAlert(text: string, bot: "quickkick" | "ladyjaye" = "quickkick"): Promise<void> {
  const token = bot === "ladyjaye" ? env.telegramBotTokenLadyJaye : env.telegramBotToken;
  const chatId = bot === "ladyjaye" ? env.telegramChatIdLadyJaye : env.telegramChatId;
  if (!token || !chatId) return;
  await sendMessage(chatId, text, { parse_mode: "HTML", token });
}

export async function registerWebhook(token: string, webhookUrl: string, secretToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${botUrl(token)}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        drop_pending_updates: true,
        secret_token: secretToken,
      }),
    });
    const data = await res.json().catch(() => null) as any;
    if (!res.ok || !data?.ok) {
      console.error("[telegram] setWebhook failed:", data);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] setWebhook fetch error:", err);
    return false;
  }
}

export async function getWebhookInfo(token: string): Promise<any> {
  try {
    const res = await fetch(`${botUrl(token)}/getWebhookInfo`);
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export function scoreEmoji(score: number): string {
  if (score >= 80) return "🔥";
  if (score >= 60) return "⚡";
  if (score >= 40) return "❄️";
  return "📋";
}

export function priorityLabel(score: number): string {
  if (score >= 80) return "HOT";
  if (score >= 60) return "WARM";
  if (score >= 40) return "NURTURE";
  return "LOW";
}

export function getMotivationFlags(lead: any): string[] {
  const f: string[] = [];
  if (lead.isPreForeclosure) f.push("Pre-Foreclosure");
  if (lead.hasTaxDelinquency) f.push("Tax Delinquent");
  if (lead.isProbate) f.push("Probate");
  if (lead.isVacant) f.push("Vacant");
  if (lead.isAbsentee) f.push("Absentee Owner");
  if (lead.hasCodeViolations) f.push("Code Violation");
  if (lead.isExpiredListing) f.push("Expired Listing");
  if (lead.isFsbo) f.push("FSBO");
  if (lead.isOutOfState) f.push("Out of State");
  return f;
}

export function formatLeadCard(lead: any, short = false): string {
  const score = lead.leadScore ?? 0;
  const flags = getMotivationFlags(lead);

  let msg = `${scoreEmoji(score)} <b>${priorityLabel(score)} — Score ${score}/100</b>\n`;
  msg += `<b>ID #${lead.id}</b>  |  ${lead.sellerName}\n`;
  msg += `📍 ${lead.propertyAddress}`;
  if (lead.city) msg += `, ${lead.city} MA`;
  msg += "\n";
  if (lead.phone) msg += `📞 ${lead.phone}\n`;
  if (flags.length) msg += `⚠️ <i>${flags.join(" · ")}</i>\n`;

  if (!short) {
    if (lead.arv && Number(lead.arv) > 0)
      msg += `💰 ARV: $${Number(lead.arv).toLocaleString()}\n`;
    if (lead.estimatedRepairs && Number(lead.estimatedRepairs) > 0)
      msg += `🔧 Repairs: $${Number(lead.estimatedRepairs).toLocaleString()}\n`;
    if (lead.callOpening)
      msg += `\n💬 <i>"${lead.callOpening}"</i>`;
  }

  return msg;
}

export function formatScoreBreakdown(lead: any): string {
  const score = lead.leadScore ?? 0;
  const rows: [string, boolean, number][] = [
    ["Pre-Foreclosure", !!lead.isPreForeclosure, 25],
    ["Tax Delinquent", !!lead.hasTaxDelinquency, 20],
    ["Probate / Estate", !!lead.isProbate, 20],
    ["Vacant Property", !!lead.isVacant, 20],
    ["Absentee Owner", !!lead.isAbsentee, 15],
    ["Code Violations", !!lead.hasCodeViolations, 15],
    ["Expired Listing", !!lead.isExpiredListing, 15],
    ["FSBO", !!lead.isFsbo, 10],
    ["15+ Yrs Ownership", (lead.ownershipYears ?? 0) >= 15, 10],
    ["Out-of-State Owner", !!lead.isOutOfState, 10],
    ["Multifamily Landlord", !!lead.isMultifamilyLandlord, 10],
    ["Visible Distress", !!lead.hasVisibleDistress, 10],
  ];

  let msg = `${scoreEmoji(score)} <b>Score Breakdown — #${lead.id}</b>\n`;
  msg += `${lead.sellerName}  ·  ${lead.propertyAddress}\n`;
  msg += `<b>Total: ${score}/100  (${priorityLabel(score)})</b>\n\n`;

  for (const [label, active, pts] of rows) {
    if (active) msg += `✅ ${label} +${pts}\n`;
  }
  if (!rows.some(([, a]) => a)) msg += `<i>No motivation indicators set yet.</i>\n`;

  if (lead.outreachAngle)
    msg += `\n🎯 <i>${lead.outreachAngle}</i>`;

  return msg;
}

export function formatDailyDigest(
  stats: { hot: number; warm: number; nurture: number; low: number; total: number },
  hotLeads: any[],
  warmLeads: any[]
): string {
  const now = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    timeZone: "America/New_York",
  });

  let msg = `🌅 <b>Western Mass Lead Bot — Daily Digest</b>\n`;
  msg += `<i>${now}</i>\n\n`;
  msg += `📊 <b>Pipeline</b>  🔥 ${stats.hot} HOT  ⚡ ${stats.warm} WARM  ❄️ ${stats.nurture} NURTURE  📋 ${stats.low} LOW\n`;
  msg += `Total: ${stats.total} leads\n`;

  if (hotLeads.length > 0) {
    msg += `\n🔥 <b>HOT LEADS — Call Today</b>\n${"─".repeat(22)}\n`;
    for (const lead of hotLeads.slice(0, 5)) {
      msg += "\n" + formatLeadCard(lead, true);
    }
  }

  if (warmLeads.length > 0) {
    msg += `\n\n⚡ <b>WARM LEADS — Call This Week</b>\n${"─".repeat(22)}\n`;
    for (const lead of warmLeads.slice(0, 3)) {
      msg += "\n" + formatLeadCard(lead, true);
    }
  }

  if (!hotLeads.length && !warmLeads.length) {
    msg += "\n📭 No scored leads. Add leads in the web app and click Re-Score All.";
  } else {
    msg += `\n\n💡 /outreach [id] for scripts  ·  /score [id] for breakdown`;
  }

  return msg;
}

export function helpText(): string {
  return (
    `🏠 <b>Western Mass Wholesale Bot — @Quickkickbot</b>\n\n` +
    `/hot — HOT leads (score 80+) · Call same day\n` +
    `/warm — WARM leads (60–79) · Call this week\n` +
    `/leads — Last 5 leads added\n` +
    `/digest — Full morning digest with stats\n` +
    `/outreach [id] — Call opening + SMS for a lead\n` +
    `/score [id] — Score breakdown for a lead\n` +
    `/help — Show this message\n\n` +
    `🔔 Automatic alerts fire when a new HOT lead is scored.`
  );
}

export function helpTextLadyJaye(): string {
  return (
    `💼 <b>Western Mass Wholesale Bot — @LadyJaye</b>\n\n` +
    `/hot — HOT leads (score 80+) · Call same day\n` +
    `/warm — WARM leads (60–79) · Call this week\n` +
    `/leads — Last 5 leads added\n` +
    `/digest — Full morning digest with stats\n` +
    `/outreach [id] — Call opening + SMS for a lead\n` +
    `/score [id] — Score breakdown for a lead\n` +
    `/help — Show this message\n\n` +
    `🔔 Automatic alerts fire when a new HOT lead is scored.`
  );
}
