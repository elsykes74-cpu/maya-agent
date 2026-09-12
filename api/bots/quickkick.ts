import { eq, and, isNull, lt, desc, lte, asc } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads, callQueue, tasks, activities, offers, buyers } from "../../db/schema";
import { sendMessage, escapeHtml } from "../lib/telegram";
import { computeLeadScore, generateCallOpening, generateOutreachAngle, scoreToMotivation, scoreToPriorityLabel, computeSTACKScore, formatSTACKBreakdown } from "../lib/lead-scorer";
import { braveSearch, researchLead } from "../lib/brave-search";
import { formatScoreBreakdown, getMotivationFlags } from "../lib/telegram";
import { saveResearchToLead } from "../lib/crm-saver";
import { callClaudeConversation } from "../lib/message-generator";
import { createVapiCall, scrubPhone, getCallingConfig } from "../lib/vapi";
import { formatScrapeAlert, getLatestScrapeRun, type CachedLead } from "../lib/craigslist-scraper";

function getTelegramFlags(lead: any): string[] {
  return getMotivationFlags(lead);
}

function quickKickHelp(): string {
  return (
    `🔍 <b>QuickKickBot — Lead Research & Intelligence</b>\n\n` +
    `<b>Research & Scoring</b>\n` +
    `/findleads — Latest Craigslist scan results (auto-scanned every 30 min)\n` +
    `/researchlead [address or name] — Brave Search + distress signals\n` +
    `/scorelead [id] — STACK score + traditional score breakdown\n` +
    `/callbrief [id] — 30-sec call briefing + opening line\n` +
    `/leadstatus [id] — Full lead status snapshot\n` +
    `/timeline [id] — Recent activity timeline for a lead\n` +
    `\n<b>Dialing & Automation</b>\n` +
    `/callnow [id] — Dial lead with AI agent (VAPI)\n` +
    `/comps [address] — Comp Analyzer (ARV estimate)\n` +
    `/runleads — Auto-scrub, score & dial all ready leads\n` +
    `\n<b>CRM Commands</b>\n` +
    `/tasks [id] — Pending tasks for a lead\n` +
    `/offer [id] [amount] — Create an offer for a lead\n` +
    `/addbuyer [name] — Add a cash buyer to the database\n` +
    `\n/help — Show this menu\n\n` +
    `Also available: /hot /warm /leads /digest /outreach /score`
  );
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
    body: `💰 Offer created via bot: $${amount.toLocaleString()}`,
    linkedTable: "offers",
    linkedId: created.id,
    metadata: JSON.stringify({ offerAmount: amount, source: "telegram_bot" }),
  } as any);

  const msg =
    `💰 <b>Offer Created</b>\n\n` +
    `Lead: #${id} ${lead.sellerName}\n` +
    `📍 ${lead.propertyAddress}\n` +
    `Offer Amount: <b>$${amount.toLocaleString()}</b>\n` +
    `Status: Draft\n\n` +
    `Use the web app to submit or update this offer.`;
  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleAddBuyer(chatId: string, parts: string[], token: string): Promise<void> {
  const name = parts.slice(1).join(" ").trim();
  if (!name) {
    await sendMessage(chatId, "Usage: /addbuyer [name]\nExample: /addbuyer John Smith\n\nUse the web app to add phone, email, and buy box criteria after creating.", { token } as any);
    return;
  }
  const db = getDb();
  const [created] = await db.insert(buyers).values({ name, status: "active" } as any).returning({ id: buyers.id });
  const msg =
    `✅ <b>Buyer Added</b>\n\n` +
    `Name: <b>${name}</b>\n` +
    `Buyer ID: #${created.id}\n\n` +
    `Open the web app to add phone, email, and buy box criteria (zip codes, price range, etc.).`;
  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleCallNow(chatId: string, parts: string[], token: string): Promise<void> {
  const id = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(id)) {
    await sendMessage(chatId, "Usage: /callnow [lead_id]\nExample: /callnow 42", { token } as any);
    return;
  }

  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    await sendMessage(chatId, `❌ Lead #${id} not found.`, { token } as any);
    return;
  }
  if (!lead.phone) {
    await sendMessage(chatId, `❌ Lead #${id} (${lead.sellerName}) has no phone number.`, { token } as any);
    return;
  }

  const config = await getCallingConfig();
  if (!config?.apiKey) {
    await sendMessage(chatId, "❌ VAPI not configured. Add VAPI_API_KEY in Calling Config settings.", { token } as any);
    return;
  }

  const scrub = await scrubPhone(lead.phone, config.scrubDncBeforeCall ?? true, config.scrubLitigants ?? true);
  if (!scrub.pass) {
    await sendMessage(chatId, `🚫 Call blocked: ${scrub.reason}`, { token } as any);
    return;
  }

  await sendMessage(chatId, `📞 Dialing <b>${escapeHtml(lead.sellerName)}</b> (${escapeHtml(lead.phone)}) with AI agent…`, { parse_mode: "HTML", token } as any);

  // Insert a callQueue row so the VAPI webhook can record the outcome
  const [queueRow] = await db.insert(callQueue).values({
    campaignId: 0,
    campaignLeadId: 0,
    leadId: lead.id,
    phone: lead.phone,
    status: "queued",
  } as any).returning({ id: callQueue.id });

  const vapiCall = await createVapiCall(lead.id, lead.phone, lead.sellerName);
  if (!vapiCall) {
    await sendMessage(chatId, "❌ VAPI call failed to start. Check your VAPI API key and phone number ID in settings.", { token } as any);
    return;
  }

  // Bind the external call ID so webhook can match it
  if (queueRow?.id) {
    await db.update(callQueue)
      .set({ externalCallId: vapiCall.id, status: "dialing" } as any)
      .where(eq(callQueue.id, queueRow.id));
  }

  let msg = `✅ <b>AI Agent Dialing</b>\n`;
  msg += `Lead: #${id} ${escapeHtml(lead.sellerName)}\n`;
  msg += `Phone: ${escapeHtml(lead.phone)}\n`;
  msg += `VAPI Call ID: <code>${escapeHtml(vapiCall.id)}</code>\n`;
  msg += `Status: ${escapeHtml(vapiCall.status)}`;
  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

async function handleComps(chatId: string, parts: string[], token: string): Promise<void> {
  const address = parts.slice(1).join(" ").trim();
  if (!address) {
    await sendMessage(chatId, "Usage: /comps [address]\nExample: /comps 42 Elm St Springfield", { token } as any);
    return;
  }

  await sendMessage(chatId, `🏠 Running Comp Analyzer for <b>${escapeHtml(address)}</b>…`, { parse_mode: "HTML", token } as any);

  const searchQuery = `${address} Western Massachusetts sold homes comparable sales site:zillow.com OR site:redfin.com OR site:realtor.com`;
  const results = await braveSearch(searchQuery, 8);

  if (!results.length) {
    await sendMessage(chatId, "❌ No comp data found. Try a more specific address.", { token } as any);
    return;
  }

  const snippets = results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.description}`)
    .join("\n\n");

  const compPrompt =
    `You are a real estate comp analyzer for Western Massachusetts wholesale investing.\n\n` +
    `Subject property: ${address}\n\n` +
    `Apply strict comp filters: ±20% sqft, ±1 bed/bath, within 1 mile, sold last 90 days.\n\n` +
    `Search results:\n${snippets}\n\n` +
    `From the data above, extract:\n` +
    `1. Up to 3 qualifying comps (address, beds/baths, sqft, sold price, sold date)\n` +
    `2. ARV estimate range (low/mid/high)\n` +
    `3. Confidence: Low / Medium / High\n` +
    `4. Max offer at 70% ARV minus repairs\n\n` +
    `If insufficient data, say so and note what's missing. Keep response concise and Telegram-friendly.`;

  const analysis = await callClaudeConversation(
    "You are a precise real estate comp analyst. Extract only what the data supports. Never hallucinate prices.",
    compPrompt
  );

  let msg = `🏠 <b>Comp Analyzer — ${escapeHtml(address)}</b>\n`;
  msg += `${"─".repeat(22)}\n\n`;
  msg += analysis;

  await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
}

export async function runLeadsAutomation(notifyChatId?: string, notifyToken?: string): Promise<void> {
  const db = getDb();
  const config = await getCallingConfig();

  const send = async (text: string) => {
    if (notifyChatId && notifyToken) {
      await sendMessage(notifyChatId, text, { parse_mode: "HTML", token: notifyToken } as any);
    }
  };

  if (!config?.apiKey) {
    await send("❌ VAPI not configured — add VAPI_API_KEY in settings.");
    return;
  }

  const candidates = await db.query.leads.findMany({
    where: and(
      isNull(leads.lastContactDate),
      isNull(leads.appointmentSet),
    ),
    orderBy: [desc(leads.leadScore)],
    limit: 20,
  });

  const withPhone = candidates.filter((l) => !!l.phone);
  if (!withPhone.length) {
    await send("📭 No uncontacted leads with phone numbers found.");
    return;
  }

  await send(`🚀 <b>Lead Automation Starting</b>\n${withPhone.length} candidates found. Scrubbing & scoring…`);

  let dialed = 0;
  let blocked = 0;
  const skipped: string[] = [];

  for (const lead of withPhone) {
    const score = lead.leadScore ?? computeLeadScore(lead);

    if (score < 40) {
      skipped.push(`#${lead.id} ${lead.sellerName} (score ${score})`);
      continue;
    }

    const scrub = await scrubPhone(lead.phone!, config.scrubDncBeforeCall ?? true, config.scrubLitigants ?? true);
    if (!scrub.pass) {
      blocked++;
      continue;
    }

    const [queueRow] = await db.insert(callQueue).values({
      campaignId: 0,
      campaignLeadId: 0,
      leadId: lead.id,
      phone: lead.phone!,
      status: "queued",
    } as any).returning({ id: callQueue.id });

    const vapiCall = await createVapiCall(lead.id, lead.phone!, lead.sellerName);
    if (!vapiCall) {
      await db.update(callQueue).set({ status: "failed" } as any).where(eq(callQueue.id, queueRow.id));
      continue;
    }

    await db.update(callQueue)
      .set({ externalCallId: vapiCall.id, status: "dialing" } as any)
      .where(eq(callQueue.id, queueRow.id));

    dialed++;
    await new Promise((r) => setTimeout(r, 1500));
  }

  let summary = `✅ <b>Run Complete</b>\n`;
  summary += `📞 Dialed: ${dialed}\n`;
  summary += `🚫 Blocked (DNC/scrub): ${blocked}\n`;
  if (skipped.length) summary += `⏭ Skipped (low score): ${skipped.length}\n`;
  summary += `\nAppointment alerts will fire automatically when a call lands.`;
  await send(summary);
}

async function handleRunLeads(chatId: string, token: string): Promise<void> {
  await runLeadsAutomation(chatId, token);
}

async function handleFindLeads(chatId: string, token: string): Promise<void> {
  // /findleads reports the latest SCHEDULED scan results — it never scrapes
  // live, because a full scrape exceeds serverless function timeouts.
  const db = getDb();
  try {
    const run = await getLatestScrapeRun(db);
    if (!run) {
      await sendMessage(
        chatId,
        "🔍 The Craigslist scanner hasn't completed a run yet — it scans every 30 minutes. Check back shortly.",
        { token } as any,
      );
      return;
    }
    const when = run.finishedAt ?? run.startedAt;
    const header = `<i>Last scan: ${when.toLocaleString()}</i>\n\n`;
    if (run.status === "error") {
      await sendMessage(
        chatId,
        `${header}⚠️ The last Craigslist scan failed (${escapeHtml(run.error ?? "unknown error")}). The next scheduled scan will retry automatically.`,
        { parse_mode: "HTML", token } as any,
      );
      return;
    }
    const newLeads: CachedLead[] = run.newLeadsJson ? JSON.parse(run.newLeadsJson) : [];
    const msg = header + formatScrapeAlert({ found: run.found, added: run.added, newLeads });
    await sendMessage(chatId, msg, { parse_mode: "HTML", token } as any);
  } catch (err: any) {
    await sendMessage(
      chatId,
      `⚠️ Couldn't load the latest scan results: ${escapeHtml(err?.message ?? String(err))}`,
      { token } as any,
    );
  }
}

async function handleResearchLead(chatId: string, parts: string[], token: string): Promise<void> {
  const query = parts.slice(1).join(" ").trim();
  if (!query) {
    await sendMessage(chatId, "Usage: /researchlead [address or seller name]", { token } as any);
    return;
  }

  await sendMessage(chatId, `🔍 Researching: <b>${escapeHtml(query)}</b>…`, { parse_mode: "HTML", token } as any);

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
    msg += `<b>Lead #${matchedLead.id} — ${escapeHtml(matchedLead.sellerName)}</b>\n`;
    msg += `📍 ${escapeHtml(matchedLead.propertyAddress)}\n`;
  } else {
    msg += `<i>No matching lead found in DB for "${escapeHtml(query)}"</i>\n`;
  }
  msg += `\n`;

  if (distressSignals.length > 0) {
    msg += `⚠️ <b>Distress Signals:</b>\n`;
    for (const signal of distressSignals) {
      msg += `  • ${escapeHtml(signal)}\n`;
    }
    msg += `\n`;
  } else {
    msg += `✅ No distress signals detected.\n\n`;
  }

  msg += `📋 <b>Summary:</b>\n<i>${escapeHtml(summary)}</i>\n`;

  if (results.length > 0) {
    msg += `\n🌐 <b>Top Sources (${results.length}):</b>\n`;
    for (const r of results.slice(0, 3)) {
      msg += `• <a href="${escapeHtml(r.url)}">${escapeHtml(r.title.slice(0, 60))}</a>\n`;
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
  const stack = computeSTACKScore(lead);

  let msg = `🎯 <b>Lead Score — #${id} ${escapeHtml(lead.sellerName)}</b>\n`;
  msg += `📍 ${escapeHtml(lead.propertyAddress)}\n\n`;
  msg += formatSTACKBreakdown(stack);
  msg += `\n`;
  msg += formatScoreBreakdown({ ...lead, leadScore: score });
  msg += `\n\n<b>Traditional:</b> ${score}/100 — ${priority}`;

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
  const stack = computeSTACKScore(lead);
  const flags = getMotivationFlags(lead);
  const angle = lead.outreachAngle ?? generateOutreachAngle(lead.leadType);
  const opening = lead.callOpening ?? generateCallOpening(lead.propertyAddress);

  let briefing = `📞 <b>Call Briefing — #${id} ${escapeHtml(lead.sellerName)}</b>\n`;
  briefing += `📍 ${escapeHtml(lead.propertyAddress)}`;
  if (lead.city) briefing += `, ${escapeHtml(lead.city)} MA`;
  briefing += `\n\n`;
  briefing += formatSTACKBreakdown(stack);
  briefing += `\n`;
  briefing += `🎯 <b>Traditional Score:</b> ${score}/100 — ${priority}\n`;
  briefing += `💡 <b>Motivation Level:</b> ${lead.motivationLevel ?? "unknown"}\n`;

  if (flags.length > 0) {
    briefing += `⚠️ <b>Flags:</b> ${flags.join(" · ")}\n`;
  }

  if (lead.keyPainPoints) {
    briefing += `😟 <b>Pain Points:</b> ${escapeHtml(lead.keyPainPoints)}\n`;
  }

  briefing += `\n🔑 <b>Outreach Angle:</b>\n<i>${escapeHtml(angle)}</i>\n`;
  briefing += `\n💬 <b>Suggested Opening Line:</b>\n"${escapeHtml(opening)}"`;

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
  msg += `<b>${escapeHtml(lead.sellerName)}</b>\n`;
  msg += `📍 ${escapeHtml(lead.propertyAddress)}`;
  if (lead.city) msg += `, ${escapeHtml(lead.city)} MA`;
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

const QUICKKICK_SYSTEM = `You are QuickKickBot, a real estate lead research and intelligence assistant for a wholesale investor in Western Massachusetts. You help with property research, comparable sales, distress signals, lead scoring, and outreach strategy. Keep responses concise and Telegram-friendly (plain text, short paragraphs). Remind users they can use /researchlead, /scorelead, /callbrief, /leadstatus, /hot, /warm, /leads, /digest for specific tasks.`;

const RESEARCH_KEYWORDS = ["sale", "sold", "foreclos", "price", "comp", "neighborhood", "area", "blvd", "street", "ave", " rd ", " rd,", "lane", "court", "drive", "propert", "listing", "market", "home", "house", "sqft", "bedroom", "bath", "zestimate", "zillow", "realtor", "redfin", "mls"];

function looksLikeResearchQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return RESEARCH_KEYWORDS.some((k) => lower.includes(k));
}

export async function handleQuickKickNaturalLanguage(chatId: string, text: string, token: string): Promise<void> {
  let contextMessage = text;

  if (looksLikeResearchQuery(text)) {
    const results = await braveSearch(`${text} Western Massachusetts real estate`, 5);
    if (results.length > 0) {
      const snippets = results
        .slice(0, 3)
        .map((r) => `${r.title}: ${r.description}`)
        .join("\n");
      contextMessage = `User question: ${text}\n\nSearch results:\n${snippets}`;
    }
  }

  const response = await callClaudeConversation(QUICKKICK_SYSTEM, contextMessage);
  await sendMessage(chatId, response, { token } as any);
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
      case "/callnow":
        await handleCallNow(chatId, parts, token);
        break;
      case "/comps":
        await handleComps(chatId, parts, token);
        break;
      case "/runleads":
        await handleRunLeads(chatId, token);
        break;
      case "/findleads":
        await handleFindLeads(chatId, token);
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
