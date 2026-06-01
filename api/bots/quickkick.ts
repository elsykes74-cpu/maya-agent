import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads } from "../../db/schema";
import { sendMessage } from "../lib/telegram";
import { computeLeadScore, generateCallOpening, generateOutreachAngle, scoreToMotivation, scoreToPriorityLabel } from "../lib/lead-scorer";
import { researchLead } from "../lib/brave-search";
import { formatScoreBreakdown, getMotivationFlags } from "../lib/telegram";
import { saveResearchToLead } from "../lib/crm-saver";

function getTelegramFlags(lead: any): string[] {
  return getMotivationFlags(lead);
}

function quickKickHelp(): string {
  return (
    `🔍 <b>QuickKickBot — Lead Research & Intelligence</b>\n\n` +
    `/researchlead [address or name] — Brave Search + distress signals\n` +
    `/scorelead [id] — Compute & display lead score\n` +
    `/callbrief [id] — 30-sec call briefing + opening line\n` +
    `/leadstatus [id] — Full lead status snapshot\n` +
    `/help — Show this menu\n\n` +
    `Also available: /hot /warm /leads /digest /outreach /score`
  );
}

async function handleResearchLead(chatId: string, parts: string[], token: string): Promise<void> {
  const query = parts.slice(1).join(" ").trim();
  if (!query) {
    await sendMessage(chatId, "Usage: /researchlead [address or seller name]", { token } as any);
    return;
  }

  await sendMessage(chatId, `🔍 Researching: <b>${query}</b>…`, { parse_mode: "HTML", token } as any);

  const db = getDb();

  // Try to find a matching lead in DB
  const allLeads = await db.query.leads.findMany({ limit: 200 });
  const queryLower = query.toLowerCase();
  const matchedLead = allLeads.find(
    (l) =>
      l.propertyAddress.toLowerCase().includes(queryLower) ||
      l.sellerName.toLowerCase().includes(queryLower)
  );

  const searchName = matchedLead?.sellerName ?? query;
  const searchAddress = matchedLead?.propertyAddress ?? query;
  const searchCity = matchedLead?.city ?? "";

  const { results, distressSignals, summary } = await researchLead(searchName, searchAddress, searchCity);

  // Save research back to DB if we matched a lead
  if (matchedLead) {
    await saveResearchToLead(matchedLead.id, {
      researchSummary: summary,
      distressSignals: JSON.stringify(distressSignals),
      webMentions: JSON.stringify(results),
    });
  }

  let msg = `🔍 <b>Research Results</b>\n`;
  if (matchedLead) {
    msg += `<b>Lead #${matchedLead.id} — ${matchedLead.sellerName}</b>\n`;
    msg += `📍 ${matchedLead.propertyAddress}\n`;
  } else {
    msg += `<i>No matching lead found in DB for "${query}"</i>\n`;
  }
  msg += `\n`;

  if (distressSignals.length > 0) {
    msg += `⚠️ <b>Distress Signals:</b>\n`;
    for (const signal of distressSignals) {
      msg += `  • ${signal}\n`;
    }
    msg += `\n`;
  } else {
    msg += `✅ No distress signals detected.\n\n`;
  }

  msg += `📋 <b>Summary:</b>\n<i>${summary}</i>\n`;

  if (results.length > 0) {
    msg += `\n🌐 <b>Top Sources (${results.length}):</b>\n`;
    for (const r of results.slice(0, 3)) {
      msg += `• <a href="${r.url}">${r.title.slice(0, 60)}</a>\n`;
    }
  }

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleScoreLead(chatId: string, parts: string[], token: string): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(id)) {
    await sendMessage(chatId, "Usage: /scorelead [lead_id]\nExample: /scorelead 42", { token } as any);
    return;
  }

  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }

  const score = computeLeadScore(lead);
  const priority = scoreToPriorityLabel(score);
  const motivation = scoreToMotivation(score);

  // Build a score breakdown message
  let msg = formatScoreBreakdown({ ...lead, leadScore: score });
  msg += `\n\n📊 Computed score: <b>${score}/100</b> — ${priority} (${motivation})`;

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleCallBrief(chatId: string, parts: string[], token: string): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(id)) {
    await sendMessage(chatId, "Usage: /callbrief [lead_id]\nExample: /callbrief 42", { token } as any);
    return;
  }

  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }

  const score = computeLeadScore(lead);
  const priority = scoreToPriorityLabel(score);
  const flags = getMotivationFlags(lead);
  const angle = lead.outreachAngle ?? generateOutreachAngle(lead.leadType);
  const opening = lead.callOpening ?? generateCallOpening(lead.propertyAddress);

  let briefing = `📞 <b>Call Briefing — #${id} ${lead.sellerName}</b>\n`;
  briefing += `📍 ${lead.propertyAddress}`;
  if (lead.city) briefing += `, ${lead.city} MA`;
  briefing += `\n\n`;
  briefing += `🎯 <b>Score:</b> ${score}/100 — ${priority}\n`;
  briefing += `💡 <b>Motivation Level:</b> ${lead.motivationLevel ?? "unknown"}\n`;

  if (flags.length > 0) {
    briefing += `⚠️ <b>Flags:</b> ${flags.join(" · ")}\n`;
  }

  if (lead.keyPainPoints) {
    briefing += `😟 <b>Pain Points:</b> ${lead.keyPainPoints}\n`;
  }

  briefing += `\n🔑 <b>Outreach Angle:</b>\n<i>${angle}</i>\n`;
  briefing += `\n💬 <b>Suggested Opening Line:</b>\n"${opening}"`;

  // Save to DB
  await saveResearchToLead(id, { callBriefing: briefing.replace(/<[^>]+>/g, "") });

  await sendMessage(chatId, briefing, { parse_mode: "HTML", token } as any);
}

async function handleLeadStatus(chatId: string, parts: string[], token: string): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(id)) {
    await sendMessage(chatId, "Usage: /leadstatus [lead_id]\nExample: /leadstatus 42", { token } as any);
    return;
  }

  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }

  const score = lead.leadScore ?? 0;
  const priority = scoreToPriorityLabel(score);

  const fmt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  let msg = `📋 <b>Lead Status — #${id}</b>\n`;
  msg += `<b>${lead.sellerName}</b>\n`;
  msg += `📍 ${lead.propertyAddress}`;
  if (lead.city) msg += `, ${lead.city} MA`;
  msg += `\n\n`;
  msg += `🎯 <b>Score:</b> ${score}/100 — ${priority}\n`;
  msg += `💡 <b>Motivation:</b> ${lead.motivationLevel ?? "—"}\n`;
  msg += `🔄 <b>Pipeline Stage:</b> ${lead.pipelineStage ?? "—"}\n`;
  msg += `\n`;
  msg += `📅 <b>Last Contact:</b> ${fmt(lead.lastContactDate)}\n`;
  msg += `📆 <b>Next Follow-Up:</b> ${fmt(lead.nextFollowUpDate)}\n`;
  msg += `\n`;
  msg += `📞 <b>Call Count:</b> ${lead.callCount ?? 0}\n`;
  msg += `💬 <b>SMS Count:</b> ${lead.smsCount ?? 0}\n`;

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

export async function handleQuickKickCommand(
  chatId: string,
  cmd: string,
  parts: string[],
  token: string
): Promise<void> {
  try {
    switch (cmd) {
      case "/researchlead":
        await handleResearchLead(chatId, parts, token);
        break;
      case "/scorelead":
        await handleScoreLead(chatId, parts, token);
        break;
      case "/callbrief":
        await handleCallBrief(chatId, parts, token);
        break;
      case "/leadstatus":
        await handleLeadStatus(chatId, parts, token);
        break;
      case "/help":
        await sendMessage(chatId, quickKickHelp(), { parse_mode: "HTML", token } as any);
        break;
      default:
        await sendMessage(chatId, "Unknown command. Type /help for available commands.", { token } as any);
    }
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    await sendMessage(chatId, `⚠️ ${cmd} failed: ${errMsg}`, { token } as any);
  }
}
