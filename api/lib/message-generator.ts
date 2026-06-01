import { env } from "./env";
import type { Lead } from "../../db/schema";

export type MessageTone = "professional" | "friendly" | "direct";
export type MessageType = "sms" | "email" | "voicemail" | "followup";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as any;
  return (data?.content?.[0]?.text ?? "").trim();
}

function typeLengthNote(type: MessageType): string {
  switch (type) {
    case "sms":
      return "Keep the message under 160 characters.";
    case "voicemail":
      return "Keep the script short — suitable for a 30-second voicemail.";
    case "email":
      return "Write a concise email with a subject line on the first line, then a blank line, then the body.";
    case "followup":
      return "Write a concise follow-up message.";
  }
}

function toneNote(tone: MessageTone): string {
  switch (tone) {
    case "professional":
      return "Use a professional, respectful tone.";
    case "friendly":
      return "Use a warm, friendly, conversational tone.";
    case "direct":
      return "Be direct and to the point. No fluff.";
  }
}

function buildFollowUpPrompt(lead: Lead, type: MessageType, tone: MessageTone): string {
  const motivationFlags: string[] = [];
  if (lead.isPreForeclosure) motivationFlags.push("Pre-Foreclosure");
  if (lead.hasTaxDelinquency) motivationFlags.push("Tax Delinquent");
  if (lead.isProbate) motivationFlags.push("Probate");
  if (lead.isVacant) motivationFlags.push("Vacant");
  if (lead.isAbsentee) motivationFlags.push("Absentee Owner");
  if (lead.hasCodeViolations) motivationFlags.push("Code Violation");
  if (lead.isExpiredListing) motivationFlags.push("Expired Listing");
  if (lead.isFsbo) motivationFlags.push("FSBO");
  if (lead.isOutOfState) motivationFlags.push("Out-of-State Owner");

  const flagsText = motivationFlags.length > 0
    ? `Motivation flags: ${motivationFlags.join(", ")}.`
    : "No specific motivation flags.";

  const painPoints = lead.keyPainPoints
    ? `Key pain points: ${lead.keyPainPoints}`
    : "No known pain points.";

  const angle = lead.outreachAngle
    ? `Outreach angle: ${lead.outreachAngle}`
    : "No specific outreach angle.";

  const motivationLevel = lead.motivationLevel ?? "cold";

  return [
    `You are a real estate wholesale outreach specialist in Western Massachusetts.`,
    ``,
    `Write a ${type} message for the following lead:`,
    `- Seller name: ${lead.sellerName}`,
    `- Property address: ${lead.propertyAddress}`,
    `- City: ${lead.city ?? "Western MA"}`,
    `- Motivation level: ${motivationLevel}`,
    `- ${flagsText}`,
    `- ${painPoints}`,
    `- ${angle}`,
    ``,
    toneNote(tone),
    typeLengthNote(type),
    ``,
    `Write only the message content — no extra commentary, no labels, no quotes around the message.`,
  ].join("\n");
}

const FALLBACK_TEMPLATES: Record<MessageType, string> = {
  sms: "Hi {name}, this is Erick from Western Mass. Quick question about your property on {address}. Would you be open to a conversation?",
  email: "Subject: Your property on {address}\n\nHi {name},\n\nI hope this finds you well. I'm a local real estate investor in Western Mass and I had a quick question about your property. Would you be open to a brief conversation?\n\nBest,\nErick",
  voicemail: "Hi {name}, this is Erick calling from Western Mass. I'm a local real estate investor and had a quick question about your property at {address}. Please call me back at your convenience. Thank you.",
  followup: "Hi {name}, just following up on my earlier message about your property on {address}. I'd love to connect when you have a moment. Thanks!",
};

function applyFallbackTemplate(template: string, lead: Lead): string {
  return template
    .replace("{name}", lead.sellerName.split(" ")[0])
    .replace("{address}", lead.propertyAddress.split(",")[0]);
}

export async function generateFollowUpMessage(
  lead: Lead,
  type: MessageType,
  tone: MessageTone
): Promise<string> {
  if (!env.anthropicApiKey) {
    return applyFallbackTemplate(FALLBACK_TEMPLATES[type], lead);
  }

  const prompt = buildFollowUpPrompt(lead, type, tone);
  return await callClaude(prompt);
}

export async function callClaudeConversation(systemPrompt: string, userMessage: string): Promise<string> {
  if (!env.anthropicApiKey) {
    return "I need an ANTHROPIC_API_KEY to respond to messages.";
  }
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  const data = await res.json() as any;
  return (data?.content?.[0]?.text ?? "").trim();
}

export async function rewriteMessage(originalText: string, tone: MessageTone): Promise<string> {
  if (!env.anthropicApiKey) {
    return originalText;
  }

  const prompt = [
    `Rewrite the following message in a ${tone} tone while preserving the core message.`,
    ``,
    toneNote(tone),
    ``,
    `Original message:`,
    originalText,
    ``,
    `Write only the rewritten message — no extra commentary, no labels, no quotes.`,
  ].join("\n");

  return await callClaude(prompt);
}
