import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Cold start (3-5s) eats into Vercel's 10s limit before handler runs.
  // Handler deadline is 4s, so Claude gets 3s max to leave headroom for Supabase + overhead.
  timeout: 3000,
});

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const PHONE_SYSTEM_SUFFIX = `

PHONE CALL RULES:
- This is a live phone call. Keep every response to 1-2 sentences MAX. Shorter is always better.
- Never use markdown, bullet points, or any formatting. Speak naturally.
- Do not say "I understand", "Great!", or any filler — respond immediately to the point.
- When someone gives you their email address, repeat it back letter by letter to confirm.
- If the conversation is clearly over (person says goodbye, hangs up signal), respond with exactly: [END_CALL]
- Never break character. You are Maya, a real human outreach rep.`;

export type CallOutcomeKey =
  | "voicemail"
  | "connected_interested"
  | "connected_not_interested"
  | "callback_requested"
  | "no_answer"
  | "hung_up";

export interface OutcomeAnalysis {
  outcome: CallOutcomeKey;
  notes: string;
  confidence: number;
}

export async function analyzeCallOutcome(turns: ConversationTurn[]): Promise<OutcomeAnalysis> {
  const transcript = turns
    .map(t => `${t.role === "assistant" ? "Maya" : "Seller"}: ${t.content}`)
    .join("\n");

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: `You analyze real estate cold call transcripts. Classify the outcome and write a brief CRM note.

Return ONLY valid JSON — no markdown, no explanation:
{"outcome":"<OUTCOME>","notes":"<2-3 sentence CRM summary>","confidence":<0.0-1.0>}

OUTCOME must be one of:
- voicemail  (reached answering machine, left message)
- connected_interested  (person engaged, wants more info or open to discussion)
- connected_not_interested  (person declined or said not interested)
- callback_requested  (person asked Maya to call back or wants a follow-up)
- no_answer  (nobody picked up)
- hung_up  (person picked up then disconnected quickly)`,
    messages: [{ role: "user", content: `Analyze this call:\n\n${transcript}` }],
  });

  const raw = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : raw) as OutcomeAnalysis;
  } catch {
    const lower = transcript.toLowerCase();
    if (lower.includes("call back") || lower.includes("callback")) {
      return { outcome: "callback_requested", notes: "Seller requested a callback.", confidence: 0.7 };
    }
    if (lower.includes("not interested") || lower.includes("no thank")) {
      return { outcome: "connected_not_interested", notes: "Seller indicated not interested.", confidence: 0.7 };
    }
    return { outcome: "connected_interested", notes: "Call completed — review transcript for details.", confidence: 0.5 };
  }
}

export async function getMayaResponse(
  systemPrompt: string,
  turns: ConversationTurn[],
  name: string,
  address: string
): Promise<string> {
  const contextNote = name || address
    ? `\n\nCALL CONTEXT: Calling ${name || "this person"} about the property at ${address || "their property"}.`
    : "";

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 120,
    system: systemPrompt + contextNote + PHONE_SYSTEM_SUFFIX,
    messages: turns,
  });

  const text = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";
  return text;
}
