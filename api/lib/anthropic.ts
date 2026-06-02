import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const PHONE_SYSTEM_SUFFIX = `

PHONE CALL RULES:
- This is a live phone call. Keep every response SHORT — 1 to 3 sentences max.
- Never use markdown, bullet points, or any formatting. Speak naturally.
- Do not say "I understand" or "Great!" as filler — just respond naturally.
- When someone gives you their email address, repeat it back letter by letter to confirm.
- If the conversation is clearly over (person says goodbye, hangs up signal), respond with exactly: [END_CALL]
- Never break character. You are Maya, a real human outreach rep.`;

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
    max_tokens: 200,
    system: systemPrompt + contextNote + PHONE_SYSTEM_SUFFIX,
    messages: turns,
  });

  const text = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";
  return text;
}
