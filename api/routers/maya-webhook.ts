import { Hono } from "hono";
import type { Context } from "hono";
import { supabase } from "../lib/supabase";
import { getMayaResponse, type ConversationTurn } from "../lib/anthropic";

function getAppUrl(c: Context): string {
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  const host = c.req.header("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function twimlResponse(c: Context, xml: string) {
  return c.body(xml, 200, { "Content-Type": "text/xml" });
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;");
}

function say(text: string, voice = "Polly.Joanna-Neural"): string {
  return `<Say voice="${voice}">${escXml(text)}</Say>`;
}

function gather(action: string, content: string): string {
  return `<Gather input="speech" speechTimeout="auto" timeout="10" action="${escXml(action)}" method="POST">${content}</Gather>`;
}

function respondUrl(appUrl: string, name: string, address: string): string {
  return `${appUrl}/api/maya/respond?name=${enc(name)}&address=${enc(address)}`;
}

async function getSystemPrompt(): Promise<string> {
  const { data } = await supabase
    .from("ai_config")
    .select("system_prompt")
    .order("id")
    .limit(1)
    .single();
  return data?.system_prompt ?? defaultSystemPrompt;
}

async function loadConversation(callSid: string): Promise<ConversationTurn[]> {
  const { data } = await supabase
    .from("maya_conversations")
    .select("turns")
    .eq("call_sid", callSid)
    .single();
  return (data?.turns as ConversationTurn[]) ?? [];
}

async function saveConversation(callSid: string, turns: ConversationTurn[], metadata: Record<string, unknown> = {}) {
  await supabase.from("maya_conversations").upsert(
    { call_sid: callSid, turns, metadata, updated_at: new Date().toISOString() },
    { onConflict: "call_sid" }
  );
}

async function extractAndSaveOutcome(callSid: string, turns: ConversationTurn[]) {
  try {
    const fullText = turns.map(t => `${t.role}: ${t.content}`).join("\n");

    // Extract email addresses from conversation
    const emailMatch = fullText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    const email = emailMatch?.[0] ?? null;

    // Detect appointment interest
    const appointmentSet = /next week|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|i'll have erick|erick will|confirm the detail/i.test(fullText);

    // Save to calls table (no lead_id since this is a test call from the app)
    await supabase.from("calls").insert({
      lead_id: 1, // placeholder — real calls from leads page will have actual lead_id
      call_outcome: appointmentSet ? "appointment_set" : "answered",
      notes: fullText.slice(0, 2000),
      appointment_set: appointmentSet,
    });

    if (email) {
      await supabase.from("maya_conversations")
        .update({ metadata: { email, appointment_set: appointmentSet } })
        .eq("call_sid", callSid);
    }
  } catch (err) {
    console.error("[maya] outcome save error:", err);
  }
}

const defaultSystemPrompt = `ROLE:
You are Maya, a real estate acquisitions representative working on behalf of a local investment group in Western Massachusetts.

OBJECTIVE:
Call property owners, identify motivation and distress, pre-qualify deal viability, and set appointments for a property walkthrough. You are not closing a sale — you are opening a relationship.

COMPLIANCE RULES:
- Never represent yourself as the guaranteed end buyer
- Never discuss contract terms
- Never make price guarantees on the call
- Position the team as 'local buyers working with a network of investment partners'
- If asked if you are an agent: 'I work with a buyer group directly — we're not listing it, we're looking to buy.'
- Stay conversational. Never sound scripted.

TONE:
Calm, confident, empathetic. You are solving a problem, not selling a product. Never rush. Never argue. Always end by moving the conversation forward.`;

export function createMayaWebhookRouter() {
  const app = new Hono();

  // Inbound calls — generic opener
  app.post("/initial", async (c) => {
    const appUrl = getAppUrl(c);
    const body = await c.req.parseBody();
    const callSid = (body["CallSid"] as string) ?? "";
    if (callSid) {
      await saveConversation(callSid, [
        { role: "assistant", content: "Hi there — this is Maya calling. I wanted to reach out about your property. Did I catch you at a bad time?" }
      ]);
    }
    return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, "", ""), say("Hi there — this is Maya calling. I wanted to reach out about your property. Did I catch you at a bad time?"))}
<Redirect method="POST">${escXml(`${appUrl}/api/maya/no-response?name=&address=`)}</Redirect>
</Response>`);
  });

  // Outbound personalized opener
  app.post("/outbound", async (c) => {
    const name = c.req.query("name") ?? "";
    const address = c.req.query("address") ?? "";
    const appUrl = getAppUrl(c);

    const body = await c.req.parseBody();
    const callSid = (body["CallSid"] as string) ?? "";

    // Machine detection — only leave voicemail if explicitly identified
    const answeredBy = (body["AnsweredBy"] as string) ?? "";
    const isMachine = answeredBy.startsWith("machine") || answeredBy === "fax";

    if (isMachine) {
      const vm = name
        ? `Hey ${name}, this is Maya calling about the property on ${address}. Nothing urgent — I just wanted to reach out about something that might be worth a quick conversation. Give us a call back when you get a chance. Thanks!`
        : `Hi, this is Maya with a quick message about your property. Give us a call back when you get a chance. Thanks!`;
      return twimlResponse(c, `<Response>${say(vm)}<Hangup/></Response>`);
    }

    const opener = name
      ? `Hey — is this ${name}? This is Maya, I'm calling about the property on ${address}. Did I catch you at a bad time?`
      : `Hi there — this is Maya calling. I wanted to reach out about your property. Did I catch you at a bad time?`;

    if (callSid) {
      await saveConversation(callSid, [
        { role: "assistant", content: opener }
      ], { name, address });
    }

    return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, name, address), say(opener))}
<Redirect method="POST">${escXml(`${appUrl}/api/maya/no-response?name=${enc(name)}&address=${enc(address)}`)}</Redirect>
</Response>`);
  });

  // AI-powered speech response handler
  app.post("/respond", async (c) => {
    const name = c.req.query("name") ?? "";
    const address = c.req.query("address") ?? "";
    const appUrl = getAppUrl(c);

    const body = await c.req.parseBody();
    const speech = (body["SpeechResult"] as string) ?? "";
    const callSid = (body["CallSid"] as string) ?? "";

    // Load conversation history and system prompt in parallel
    const [turns, systemPrompt] = await Promise.all([
      callSid ? loadConversation(callSid) : Promise.resolve([]),
      getSystemPrompt(),
    ]);

    // Add what the person just said
    const updatedTurns: ConversationTurn[] = [
      ...turns,
      { role: "user", content: speech || "(silence)" },
    ];

    let mayaResponse: string;
    try {
      mayaResponse = await getMayaResponse(systemPrompt, updatedTurns, name, address);
    } catch (err) {
      console.error("[maya] Claude error:", err);
      mayaResponse = "Sorry about that — can you say that again?";
    }

    // Check if Claude signaled end of call
    const endCall = mayaResponse.includes("[END_CALL]");
    const spoken = mayaResponse.replace("[END_CALL]", "").trim() || "Thank you for your time. Have a great day!";

    // Save conversation with Maya's response added
    const finalTurns: ConversationTurn[] = [
      ...updatedTurns,
      { role: "assistant", content: spoken },
    ];
    if (callSid) {
      await saveConversation(callSid, finalTurns, { name, address });
    }

    if (endCall) {
      return twimlResponse(c, `<Response>${say(spoken)}<Hangup/></Response>`);
    }

    return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, name, address), say(spoken))}
<Redirect method="POST">${escXml(`${appUrl}/api/maya/no-response?name=${enc(name)}&address=${enc(address)}`)}</Redirect>
</Response>`);
  });

  // No response — remind once then hang up
  app.post("/no-response", async (c) => {
    const name = c.req.query("name") ?? "";
    const address = c.req.query("address") ?? "";
    const appUrl = getAppUrl(c);

    return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, name, address), say("Sorry, I didn't catch that — are you still there?"))}
<Hangup/>
</Response>`);
  });

  // Status callback — save outcome when call completes
  app.post("/status", async (c) => {
    const body = await c.req.parseBody();
    const callSid = (body["CallSid"] as string) ?? "";
    const callStatus = (body["CallStatus"] as string) ?? "";
    console.log(`[maya] call ${callSid} → ${callStatus}`);

    if ((callStatus === "completed" || callStatus === "no-answer") && callSid) {
      const turns = await loadConversation(callSid);
      if (turns.length > 1) {
        await extractAndSaveOutcome(callSid, turns);
      }
    }

    return c.body(null, 204);
  });

  return app;
}
