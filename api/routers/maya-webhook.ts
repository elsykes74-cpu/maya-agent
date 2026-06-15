import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabase } from "../lib/supabase";
import { getMayaResponse, type ConversationTurn } from "../lib/anthropic";
import { elevenLabsTTSStream } from "../lib/elevenlabs";

// ---------------------------------------------------------------------------
// Twilio webhook signature validation
// Prevents forged webhook calls that would burn Claude + ElevenLabs credits.
// Skipped when TWILIO_AUTH_TOKEN is unset (local dev / initial setup).
// ---------------------------------------------------------------------------
function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  let s = url;
  for (const k of Object.keys(params).sort()) s += k + (params[k] ?? "");
  return createHmac("sha1", authToken).update(s, "utf8").digest("base64");
}

const twilioGuard: MiddlewareHandler = async (c, next) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  if (!authToken) return next(); // dev / unconfigured — skip

  const signature = c.req.header("x-twilio-signature") ?? "";
  if (!signature) return c.body("Forbidden", 403);

  const params: Record<string, string> = {};
  if (c.req.method === "POST") {
    const body = await c.req.parseBody();
    for (const [k, v] of Object.entries(body)) params[k] = String(v);
  }

  const expected = computeTwilioSignature(authToken, c.req.url, params);
  let valid = false;
  try { valid = timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); } catch { /* length mismatch */ }

  if (!valid) {
    console.error("[twilio/guard] invalid signature:", c.req.url);
    return c.body("Forbidden", 403);
  }
  return next();
};


function getAppUrl(c: Context): string {
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  // x-forwarded-host is the real public hostname in Vercel serverless; host may be internal
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function twimlResponse(c: Context, xml: string) {
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, 200, { "Content-Type": "text/xml; charset=utf-8" });
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
}

function say(text: string, voice = "Google.en-US-Neural2-F"): string {
  return `<Say voice="${voice}">${escXml(text)}</Say>`;
}

function gather(action: string, content: string): string {
  return `<Gather input="speech" speechTimeout="auto" timeout="15" action="${escXml(action)}" method="POST">${content}</Gather>`;
}

function respondUrl(appUrl: string, name: string, address: string, voice: string): string {
  return `${appUrl}/api/maya/respond?name=${enc(name)}&address=${enc(address)}&voice=${enc(voice)}`;
}

function noResponseUrl(appUrl: string, name: string, address: string, voice: string): string {
  return `${appUrl}/api/maya/no-response?name=${enc(name)}&address=${enc(address)}&voice=${enc(voice)}`;
}

interface ElevenLabsConfig { apiKey: string; voiceId: string; }

interface AIConfigResult { systemPrompt: string; elevenlabs: ElevenLabsConfig | null; }
let aiConfigCache: AIConfigResult | null = null;
let aiConfigCachedAt = 0;
const AI_CONFIG_TTL = 60_000; // re-fetch at most once per minute

async function getAIConfig(): Promise<AIConfigResult> {
  const now = Date.now();
  if (aiConfigCache && now - aiConfigCachedAt < AI_CONFIG_TTL) return aiConfigCache;

  const { data, error } = await supabase
    .from("ai_config")
    .select("system_prompt, elevenlabs_api_key, elevenlabs_voice_id")
    .order("id")
    .limit(1)
    .single();
  if (error) {
    console.error("[maya] getAIConfig error:", error.message);
  }
  // Prefer ELEVENLABS_API_KEY env var over Supabase value (Supabase may hold a rotated/disabled key)
  const apiKey = (process.env.ELEVENLABS_API_KEY || data?.elevenlabs_api_key || "").trim();
  const voiceId = (data?.elevenlabs_voice_id || "").trim();
  const elevenlabs = apiKey && voiceId ? { apiKey, voiceId } : null;
  const result: AIConfigResult = { systemPrompt: data?.system_prompt ?? defaultSystemPrompt, elevenlabs };
  aiConfigCache = result;
  aiConfigCachedAt = now;
  return result;
}

function playEl(appUrl: string, text: string, voiceId: string): string {
  const url = `${appUrl}/api/maya/audio?text=${enc(text)}&vid=${enc(voiceId)}`;
  return `<Play>${escXml(url)}</Play>`;
}

function tts(appUrl: string, text: string, voice: string, el: ElevenLabsConfig | null): string {
  return el ? playEl(appUrl, text, el.voiceId) : say(text, voice);
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
  const { error } = await supabase.from("maya_conversations").upsert(
    { call_sid: callSid, turns, metadata, updated_at: new Date().toISOString() },
    { onConflict: "call_sid" }
  );
  if (error) console.error("[maya] saveConversation error:", error.message);
}

async function extractAndSaveOutcome(callSid: string, turns: ConversationTurn[]) {
  try {
    const fullText = turns.map(t => `${t.role}: ${t.content}`).join("\n");
    const appointmentSet = /next week|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|confirm the detail/i.test(fullText);

    await supabase.from("maya_conversations")
      .update({ metadata: { appointment_set: appointmentSet, outcome_processed: true } })
      .eq("call_sid", callSid);
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
  app.post("/initial", twilioGuard, async (c) => {
    console.log("[maya/initial] webhook received");
    try {
      const appUrl = getAppUrl(c);
      const voice = c.req.query("voice") ?? "Google.en-US-Neural2-F";
      const body = await c.req.parseBody();
      const callSid = (body["CallSid"] as string) ?? "";

      const opener = "Hi there — this is Maya calling. I wanted to reach out about your property. Did I catch you at a bad time?";

      if (callSid) {
        saveConversation(callSid, [{ role: "assistant", content: opener }]).catch(err =>
          console.error("[maya/initial] save error:", err)
        );
      }

      let elevenlabs: ElevenLabsConfig | null = null;
      try { ({ elevenlabs } = await getAIConfig()); } catch {}

      return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, "", "", voice), tts(appUrl, opener, voice, elevenlabs))}
<Redirect method="POST">${escXml(noResponseUrl(appUrl, "", "", voice))}</Redirect>
</Response>`);
    } catch (err) {
      console.error("[maya/initial] fatal:", err);
      return twimlResponse(c, `<Response><Say>Hi, this is Maya. Please call us back shortly. Thank you!</Say><Hangup/></Response>`);
    }
  });

  // Outbound personalized opener
  app.post("/outbound", twilioGuard, async (c) => {
    console.log("[maya/outbound] webhook received");
    try {
      const name = c.req.query("name") ?? "";
      const address = c.req.query("address") ?? "";
      const voice = c.req.query("voice") ?? "Google.en-US-Neural2-F";
      const appUrl = getAppUrl(c);
      console.log("[maya/outbound] appUrl:", appUrl, "name:", name, "address:", address);

      const body = await c.req.parseBody();
      const callSid = (body["CallSid"] as string) ?? "";
      const answeredBy = (body["AnsweredBy"] as string) ?? "";
      const isMachine = answeredBy.startsWith("machine") || answeredBy === "fax";
      console.log("[maya/outbound] callSid:", callSid, "answeredBy:", answeredBy);

      let elevenlabs: ElevenLabsConfig | null = null;
      try { ({ elevenlabs } = await getAIConfig()); } catch (err) {
        console.error("[maya/outbound] getAIConfig error:", err);
      }

      if (isMachine) {
        const vm = name
          ? `Hey ${name}, this is Maya calling about the property on ${address}. Nothing urgent — I just wanted to reach out about something that might be worth a quick conversation. Give us a call back when you get a chance. Thanks!`
          : `Hi, this is Maya with a quick message about your property. Give us a call back when you get a chance. Thanks!`;
        return twimlResponse(c, `<Response>${tts(appUrl, vm, voice, elevenlabs)}<Hangup/></Response>`);
      }

      const opener = name
        ? `Hey — is this ${name}? This is Maya, I'm calling about the property on ${address}. Did I catch you at a bad time?`
        : `Hi there — this is Maya calling. I wanted to reach out about your property. Did I catch you at a bad time?`;

      if (callSid) {
        saveConversation(callSid, [{ role: "assistant", content: opener }], { name, address }).catch(err =>
          console.error("[maya/outbound] save error:", err)
        );
      }

      return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, name, address, voice), tts(appUrl, opener, voice, elevenlabs))}
<Redirect method="POST">${escXml(noResponseUrl(appUrl, name, address, voice))}</Redirect>
</Response>`);
    } catch (err) {
      console.error("[maya/outbound] fatal:", err);
      return twimlResponse(c, `<Response><Say>Hi there, this is Maya. We'll try you again shortly. Thanks!</Say><Hangup/></Response>`);
    }
  });

  // AI-powered speech response handler
  app.post("/respond", twilioGuard, async (c) => {
    console.log("[maya/respond] webhook received");

    // Safety deadline: Vercel's 10s limit starts at request arrival, not handler entry.
    // Cold start (3-5s) + this deadline must fit in 10s total.
    // With AI config cached after first call, Supabase latency drops to ~0 on subsequent turns.
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(() => reject(new Error("handler_deadline")), 25000);
    });

    const work = (async () => {
      const name = c.req.query("name") ?? "";
      const address = c.req.query("address") ?? "";
      const voice = c.req.query("voice") ?? "Google.en-US-Neural2-F";
      const appUrl = getAppUrl(c);

      const body = await c.req.parseBody();
      const speech = (body["SpeechResult"] as string) ?? "";
      const callSid = (body["CallSid"] as string) ?? "";
      console.log("[maya/respond] speech:", speech.slice(0, 80), "callSid:", callSid);

      const [turns, { systemPrompt, elevenlabs }] = await Promise.all([
        callSid ? loadConversation(callSid) : Promise.resolve([]),
        getAIConfig(),
      ]);

      const updatedTurns: ConversationTurn[] = [
        ...turns,
        { role: "user", content: speech || "(silence)" },
      ];

      let mayaResponse: string;
      try {
        mayaResponse = await getMayaResponse(systemPrompt, updatedTurns, name, address);
      } catch (err) {
        console.error("[maya/respond] Claude error:", err);
        mayaResponse = "Sorry about that — can you say that again?";
      }

      const endCall = mayaResponse.includes("[END_CALL]");
      const spoken = mayaResponse.replace("[END_CALL]", "").trim() || "Thank you for your time. Have a great day!";

      const finalTurns: ConversationTurn[] = [
        ...updatedTurns,
        { role: "assistant", content: spoken },
      ];
      if (callSid) {
        saveConversation(callSid, finalTurns, { name, address }).catch(err =>
          console.error("[maya/respond] save error:", err)
        );
      }

      const spokenTts = tts(appUrl, spoken, voice, elevenlabs);

      if (endCall) {
        return twimlResponse(c, `<Response>${spokenTts}<Hangup/></Response>`);
      }

      return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, name, address, voice), spokenTts)}
<Redirect method="POST">${escXml(noResponseUrl(appUrl, name, address, voice))}</Redirect>
</Response>`);
    })();

    try {
      const result = await Promise.race([work, deadline]);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      return result;
    } catch (err) {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      const isDeadline = err instanceof Error && err.message === "handler_deadline";
      console.error(isDeadline ? "[maya/respond] deadline exceeded" : "[maya/respond] fatal:", err);
      const appUrl = getAppUrl(c);
      const name = c.req.query("name") ?? "";
      const address = c.req.query("address") ?? "";
      const voice = c.req.query("voice") ?? "Google.en-US-Neural2-F";
      return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, name, address, voice), say("Sorry, one moment — can you say that again?", voice))}
<Redirect method="POST">${escXml(noResponseUrl(appUrl, name, address, voice))}</Redirect>
</Response>`);
    }
  });

  // No response — remind once then hang up
  app.post("/no-response", twilioGuard, async (c) => {
    console.log("[maya/no-response] webhook received");
    try {
      const name = c.req.query("name") ?? "";
      const address = c.req.query("address") ?? "";
      const voice = c.req.query("voice") ?? "Google.en-US-Neural2-F";
      const appUrl = getAppUrl(c);

      let elevenlabs: ElevenLabsConfig | null = null;
      try { ({ elevenlabs } = await getAIConfig()); } catch {}

      const prompt = "Sorry, I didn't catch that — are you still there?";
      return twimlResponse(c, `<Response>
${gather(respondUrl(appUrl, name, address, voice), tts(appUrl, prompt, voice, elevenlabs))}
<Hangup/>
</Response>`);
    } catch (err) {
      console.error("[maya/no-response] fatal:", err);
      return twimlResponse(c, `<Response><Hangup/></Response>`);
    }
  });

  // ElevenLabs audio proxy — streams TTS audio for Twilio <Play>
  // API key is never exposed in the URL; it's fetched server-side from config/env.
  app.get("/audio", async (c) => {
    const text = c.req.query("text") ?? "";
    const voiceId = c.req.query("vid") ?? "";

    if (!text || !voiceId) {
      return c.body("Missing params", 400);
    }

    let apiKey: string;
    try {
      const config = await getAIConfig();
      apiKey = config.elevenlabs?.apiKey ?? "";
    } catch {
      apiKey = "";
    }

    if (!apiKey) {
      console.error("[elevenlabs] audio proxy: no API key configured");
      return c.body("TTS not configured", 502);
    }

    try {
      const upstream = await elevenLabsTTSStream(text, voiceId, apiKey);
      if (!upstream.ok) {
        console.error("[elevenlabs] TTS error:", upstream.status);
        return c.body("TTS error", 502);
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      console.error("[elevenlabs] audio proxy error:", err);
      return c.body("TTS error", 502);
    }
  });

  // Status callback — save outcome when call completes
  app.post("/status", twilioGuard, async (c) => {
    try {
      const body = await c.req.parseBody();
      const callSid = (body["CallSid"] as string) ?? "";
      const callStatus = (body["CallStatus"] as string) ?? "";
      console.log(`[maya/status] call ${callSid} → ${callStatus}`);

      if ((callStatus === "completed" || callStatus === "no-answer") && callSid) {
        const turns = await loadConversation(callSid);
        if (turns.length > 1) {
          await extractAndSaveOutcome(callSid, turns);
        }
      }
    } catch (err) {
      console.error("[maya/status] error:", err);
    }
    return c.body(null, 204);
  });

  return app;
}
