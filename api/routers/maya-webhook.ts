import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { createHmac } from "node:crypto";
import { supabase } from "../lib/supabase";
import { getMayaResponse, type ConversationTurn } from "../lib/anthropic";
import { elevenLabsTTSStream } from "../lib/elevenlabs";
import { deriveScopedSecret, safeEqual } from "../lib/secrets";
import { env } from "../lib/env";
import { safeTwilioDiagnostic, terminalOutcomeForStatus } from "../lib/call-outcomes";

// ---------------------------------------------------------------------------
// Twilio webhook signature validation
// Prevents forged webhook calls that would burn Claude + ElevenLabs credits.
// Local development may omit credentials; production always fails closed.
// ---------------------------------------------------------------------------
function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  let s = url;
  for (const k of Object.keys(params).sort()) s += k + (params[k] ?? "");
  return createHmac("sha1", authToken).update(s, "utf8").digest("base64");
}

type TwilioWebhookBody = Record<string, string>;

async function getTwilioBody(c: Context): Promise<TwilioWebhookBody> {
  const cached = c.get("twilioBody") as TwilioWebhookBody | undefined;
  if (cached) return cached;

  const params: Record<string, string> = {};
  const body = await c.req.parseBody();
  for (const [key, value] of Object.entries(body)) params[key] = String(value);
  c.set("twilioBody", params);
  return params;
}

export const twilioGuard: MiddlewareHandler = async (c, next) => {
  let authToken = "";
  try {
    // Use the same database-first credential precedence as call creation so a
    // rotation cannot make valid Twilio callbacks fail signature validation.
    authToken = (await getAIConfig()).twilioAuthToken;
  } catch {
    authToken = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
    console.error("[twilio/guard] unable to load database webhook credential");
  }
  if (!authToken) {
    return c.body("Webhook verification is not configured", 503);
  }

  const signature = c.req.header("x-twilio-signature") ?? "";
  if (!signature) return c.body("Forbidden", 403);

  const params = c.req.method === "POST" ? await getTwilioBody(c) : {};

  const inboundUrl = new URL(c.req.url);
  const publicUrl = `${getAppUrl(c)}${inboundUrl.pathname}${inboundUrl.search}`;
  const expected = computeTwilioSignature(authToken, publicUrl, params);
  if (!safeEqual(expected, signature)) {
    console.error("[twilio/guard] rejected invalid signature", { path: c.req.path });
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

function webhookErrorTwiml(c: Context, label: string, err: unknown, message: string, voice = "Google.en-US-Neural2-F") {
  console.error(`[${label}] webhook failure`, {
    path: c.req.path,
    method: c.req.method,
    error: err,
  });
  return twimlResponse(c, `<Response>${say(message, voice)}<Hangup/></Response>`);
}

function webhookSoftFailTwiml(c: Context, label: string, err: unknown, message: string, voice = "Google.en-US-Neural2-F") {
  console.error(`[${label}] soft failure`, {
    path: c.req.path,
    method: c.req.method,
    error: err,
  });
  return twimlResponse(c, `<Response>${say(message, voice)}</Response>`);
}


function enc(s: string): string {
  return encodeURIComponent(s);
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
}

function pipecatConnect(params: Record<string, string>): string | null {
  if (!env.pipecatWebsocketUrl) return null;
  try {
    const url = new URL(env.pipecatWebsocketUrl);
    if (url.protocol !== "wss:") throw new Error("PIPECAT_WEBSOCKET_URL must use wss://");
    const parameters = Object.entries(params)
      .filter(([, value]) => value.length > 0)
      .map(([name, value]) => `<Parameter name="${escXml(name)}" value="${escXml(value.slice(0, 400))}"/>`)
      .join("");
    return `<Response><Connect><Stream url="${escXml(url.toString())}">${parameters}</Stream></Connect></Response>`;
  } catch (error) {
    console.error("[maya/pipecat] invalid websocket configuration:", error);
    return null;
  }
}

function say(text: string, voice = "Google.en-US-Neural2-F"): string {
  return `<Say voice="${escXml(voice)}">${escXml(text)}</Say>`;
}

export function guardedGather(action: string, content: string): string {
  // Short-utterance and barge-in tuned for telephone greetings like "hello".
  return `<Gather input="speech" language="en-US" speechModel="experimental_utterances" speechTimeout="2" timeout="10" bargeIn="true" actionOnEmptyResult="false" action="${escXml(action)}" method="POST">${content}</Gather>`;
}

function respondUrl(appUrl: string, name: string, address: string, voice: string): string {
  return `${appUrl}/api/maya/respond?name=${enc(name)}&address=${enc(address)}&voice=${enc(voice)}`;
}

function noResponseUrl(appUrl: string, name: string, address: string, voice: string): string {
  return `${appUrl}/api/maya/no-response?name=${enc(name)}&address=${enc(address)}&voice=${enc(voice)}`;
}

function initialGatherTwiml(actionUrl: string): string {
  return `<Response>
${guardedGather(actionUrl, "<Pause length=\"1\"/>")}
</Response>`;
}

interface ElevenLabsConfig { apiKey: string; voiceId: string; }

interface AIConfigResult { systemPrompt: string; elevenlabs: ElevenLabsConfig | null; twilioAuthToken: string; }
let aiConfigCache: AIConfigResult | null = null;
let aiConfigCachedAt = 0;
const AI_CONFIG_TTL = 60_000; // re-fetch at most once per minute

async function getAIConfig(): Promise<AIConfigResult> {
  const now = Date.now();
  if (aiConfigCache && now - aiConfigCachedAt < AI_CONFIG_TTL) return aiConfigCache;

  const { data, error } = await supabase
    .from("ai_config")
    .select("system_prompt, elevenlabs_api_key, elevenlabs_voice_id, twilio_auth_token")
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
  // The database value is also passed to the Twilio call creator. Keep this
  // precedence identical so callback signatures survive credential rotation.
  const twilioAuthToken = (data?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || "").trim();
  const result: AIConfigResult = {
    systemPrompt: data?.system_prompt ?? defaultSystemPrompt,
    elevenlabs,
    twilioAuthToken,
  };
  aiConfigCache = result;
  aiConfigCachedAt = now;
  return result;
}

function playEl(appUrl: string, text: string, voiceId: string, fallbackVoice: string): string {
  const rootSecret = env.appSecret || env.claudeEndpointSecret;
  if (!rootSecret) {
    console.warn("[maya] audio signing not configured; falling back to Twilio TTS");
    return say(text, fallbackVoice);
  }
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  const signature = deriveScopedSecret(rootSecret, `elevenlabs-audio:${expiresAt}:${voiceId}:${text}`);
  const url = `${appUrl}/api/maya/audio?text=${enc(text)}&vid=${enc(voiceId)}&expires=${expiresAt}&sig=${enc(signature)}`;
  return `<Play>${escXml(url)}</Play>`;
}

function tts(appUrl: string, text: string, voice: string, el: ElevenLabsConfig | null): string {
  return el ? playEl(appUrl, text, el.voiceId, voice) : say(text, voice);
}

async function loadConversation(callSid: string): Promise<ConversationTurn[]> {
  const { data } = await supabase
    .from("maya_conversations")
    .select("turns")
    .eq("call_sid", callSid)
    .single();
  return (data?.turns as ConversationTurn[]) ?? [];
}

async function loadConversationMetadata(callSid: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("maya_conversations")
    .select("metadata")
    .eq("call_sid", callSid)
    .maybeSingle();
  return (data?.metadata as Record<string, unknown> | undefined) ?? {};
}

async function saveConversation(callSid: string, turns: ConversationTurn[], metadata: Record<string, unknown> = {}) {
  const existingMetadata = await loadConversationMetadata(callSid);
  const existingStatusEvents = Array.isArray(existingMetadata.twilio_status_events) ? existingMetadata.twilio_status_events : [];
  const newStatusEvents = Array.isArray(metadata.twilio_status_events) ? metadata.twilio_status_events : [];

  const mergedMetadata = {
    ...existingMetadata,
    ...metadata,
    ...(existingStatusEvents.length || newStatusEvents.length
      ? { twilio_status_events: [...existingStatusEvents, ...newStatusEvents] }
      : {}),
  };

  const { error } = await supabase.from("maya_conversations").upsert(
    { call_sid: callSid, turns, metadata: mergedMetadata, updated_at: new Date().toISOString() },
    { onConflict: "call_sid" }
  );
  if (error) console.error("[maya] saveConversation error:", error.message);
}

async function updateConversationMetadata(callSid: string, metadata: Record<string, unknown> = {}) {
  const turns = await loadConversation(callSid);
  await saveConversation(callSid, turns, metadata);
}

async function appendConversationEvent(callSid: string, event: string, data: Record<string, unknown> = {}) {
  try {
    const turns = await loadConversation(callSid);
    const existingMetadata = await loadConversationMetadata(callSid);
    const previousEvents = Array.isArray(existingMetadata.twilio_flow_events) ? existingMetadata.twilio_flow_events : [];
    await saveConversation(callSid, turns, {
      twilio_flow_events: [
        ...previousEvents,
        {
          event,
          at: new Date().toISOString(),
          ...data,
        },
      ],
    });
  } catch (err) {
    console.error("[maya] failed to append conversation event:", event, err);
  }
}

export function isDncRequest(speech: string): boolean {
  return /\b(do not call|don't call|stop calling|remove me|take me off|opt[ -]?out|no more calls|never call)\b/i.test(speech);
}

function normalizeDncPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return "";
}

function callerPhoneFromTwilioBody(body: Record<string, unknown>): string {
  const direction = String(body["Direction"] ?? "").toLowerCase();
  const raw = direction.startsWith("outbound")
    ? String(body["To"] ?? "")
    : String(body["From"] ?? "");
  return normalizeDncPhone(raw);
}

async function persistDncRequest(phone: string, name: string, callSid: string): Promise<void> {
  if (!phone) throw new Error("DNC request did not include a valid caller phone number");
  const { error } = await supabase.from("dnc_list").upsert({
    phone,
    name: name || null,
    reason: "seller_request",
    source: "maya_voice",
    notes: callSid ? `Spoken opt-out during call ${callSid}` : "Spoken opt-out during Maya call",
  }, { onConflict: "phone" });
  if (error) throw new Error(`Unable to persist DNC request: ${error.message}`);
}

async function extractAndSaveOutcome(callSid: string, turns: ConversationTurn[]) {
  try {
    const fullText = turns.map(t => `${t.role}: ${t.content}`).join("\n");
    const appointmentSet = /next week|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|confirm the detail/i.test(fullText);

    const { data: existing } = await supabase
      .from("maya_conversations")
      .select("metadata")
      .eq("call_sid", callSid)
      .maybeSingle();

    const existingMetadata = (existing?.metadata as Record<string, unknown> | undefined) ?? {};
    const { error } = await supabase
      .from("maya_conversations")
      .update({
        metadata: {
          ...existingMetadata,
          appointment_set: appointmentSet,
          outcome_processed: true,
        },
      })
      .eq("call_sid", callSid);

    if (error) throw error;
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
      const body = await getTwilioBody(c);
      const callSid = (body["CallSid"] as string) ?? "";

      if (callSid) {
        await appendConversationEvent(callSid, "initial_received", {
          from: (body["From"] as string) ?? "",
          to: (body["To"] as string) ?? "",
          direction: (body["Direction"] as string) ?? "",
        });
      }

      const stream = pipecatConnect({
        call_sid: callSid,
        target_phone: (body["From"] as string) ?? "",
        direction: "inbound",
      });
      if (stream) return twimlResponse(c, stream);

      const opener = "Hi, this is Maya, an AI assistant calling for Erick's local property team. Is now an okay time for a quick question about your property?";

      if (callSid) {
        await appendConversationEvent(callSid, "initial_fallback_twiml", { voice });
        saveConversation(callSid, [{ role: "assistant", content: opener }]).catch(err =>
          console.error("[maya/initial] save error:", err)
        );
      }

      return twimlResponse(c, `<Response>
${say(opener, voice)}
${guardedGather(respondUrl(appUrl, "", "", voice), "<Pause length=\"1\"/>")}
</Response>`);
    } catch (err) {
      return webhookErrorTwiml(c, "maya/initial", err, "Hi, this is Maya. Please call us back shortly. Thank you!");
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

      const body = await getTwilioBody(c);
      const callSid = (body["CallSid"] as string) ?? "";
      const answeredBy = (body["AnsweredBy"] as string) ?? "";
      const isMachine = answeredBy.startsWith("machine") || answeredBy === "fax";
      console.log("[maya/outbound] callSid:", callSid, "answeredBy:", answeredBy);

      let elevenlabs: ElevenLabsConfig | null = null;
      try { ({ elevenlabs } = await getAIConfig()); } catch (err) {
        console.error("[maya/outbound] getAIConfig error:", err);
      }

      if (isMachine) {
        if (callSid) await appendConversationEvent(callSid, "outbound_machine_detected", { answeredBy });
        const vm = name
          ? `Hey ${name}, this is Maya calling about the property on ${address}. Nothing urgent — I just wanted to reach out about something that might be worth a quick conversation. Give us a call back when you get a chance. Thanks!`
          : `Hi, this is Maya with a quick message about your property. Give us a call back when you get a chance. Thanks!`;
        return twimlResponse(c, `<Response>${tts(appUrl, vm, voice, elevenlabs)}<Hangup/></Response>`);
      }

      const stream = pipecatConnect({
        call_sid: callSid,
        target_phone: (body["To"] as string) ?? "",
        direction: "outbound",
        name,
        address,
      });
      if (stream) return twimlResponse(c, stream);

      const propertyReference = address ? `the property on ${address}` : "your property";
      const opener = name
        ? `Hi, is this ${name}? This is Maya, an AI assistant calling for Erick's local property team about ${propertyReference}. Is now an okay time for a quick question?`
        : `Hi, this is Maya, an AI assistant calling for Erick's local property team about ${propertyReference}. Is now an okay time for a quick question?`;

      if (callSid) {
        await appendConversationEvent(callSid, "outbound_fallback_twiml", { name, address });
        saveConversation(callSid, [{ role: "assistant", content: opener }], { name, address }).catch(err =>
          console.error("[maya/outbound] save error:", err)
        );
      }

      // Use Twilio's built-in TTS for the opener so the first response window
      // opens immediately; keep ElevenLabs for the model's reply path.
      return twimlResponse(c, `<Response>
${say(opener, voice)}
${guardedGather(respondUrl(appUrl, name, address, voice), "<Pause length=\"1\"/>")}
<Redirect method="POST">${escXml(noResponseUrl(appUrl, name, address, voice))}</Redirect>
</Response>`);
    } catch (err) {
      return webhookErrorTwiml(c, "maya/outbound", err, "Hi there, this is Maya. We'll try you again shortly. Thanks!");
    }
  });

  // AI-powered speech response handler
  app.post("/respond", twilioGuard, async (c) => {
    console.log("[maya/respond] webhook received");

    // Vercel allows 30 seconds for this function. Keep our response inside
    // Twilio's voice-webhook window while leaving enough time for a cold start,
    // conversation lookup, and the model's first response.
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(() => reject(new Error("handler_deadline")), 12_000);
    });

    const work = (async () => {
      const name = c.req.query("name") ?? "";
      const address = c.req.query("address") ?? "";
      const voice = c.req.query("voice") ?? "Google.en-US-Neural2-F";
      const appUrl = getAppUrl(c);

      const body = await getTwilioBody(c);
      const speech = (body["SpeechResult"] as string) ?? "";
      const callSid = (body["CallSid"] as string) ?? "";
      const dncRequested = isDncRequest(speech);
      const callerPhone = callerPhoneFromTwilioBody(body);
      console.log("[maya/respond] speech:", speech.slice(0, 80), "callSid:", callSid);
      if (callSid) {
        await appendConversationEvent(callSid, "respond_received", {
          speech_preview: speech.slice(0, 80),
          speech_length: speech.length,
          dnc_requested: dncRequested,
        });
      }

      const [turns, { systemPrompt, elevenlabs }] = await Promise.all([
        callSid ? loadConversation(callSid) : Promise.resolve([]),
        getAIConfig(),
      ]);

      const updatedTurns: ConversationTurn[] = [
        ...turns,
        { role: "user", content: speech || "(silence)" },
      ];

      let mayaResponse: string;
      if (dncRequested) {
        try {
          await persistDncRequest(callerPhone, name, callSid);
          mayaResponse = "Understood. I've added this number to our do-not-call list. Take care. [END_CALL]";
        } catch (err) {
          // End the interaction even if storage is temporarily unavailable; do
          // not continue a sales conversation after an explicit opt-out.
          console.error("[maya/respond] DNC persistence failed:", err);
          mayaResponse = "Understood. We'll end the call now. Take care. [END_CALL]";
        }
      } else {
        try {
          mayaResponse = await getMayaResponse(systemPrompt, updatedTurns, name, address);
        } catch (err) {
          console.error("[maya/respond] Claude error:", err);
          mayaResponse = "I'm having trouble on my end, so I'll let you go for now. Take care. [END_CALL]";
        }
      }

      const endCall = dncRequested || mayaResponse.includes("[END_CALL]");
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
${guardedGather(respondUrl(appUrl, name, address, voice), spokenTts)}
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
      const voice = c.req.query("voice") ?? "Google.en-US-Neural2-F";
      return webhookErrorTwiml(
        c,
        isDeadline ? "maya/respond/deadline" : "maya/respond",
        err,
        "I'm having trouble on my end, so I'll let you go for now. Take care.",
        voice
      );
    }
  });

  // No response — give one reminder and end cleanly.
  app.post("/no-response", twilioGuard, async (c) => {
    console.log("[maya/no-response] webhook received");
    try {
      const voice = c.req.query("voice") ?? "Google.en-US-Neural2-F";
      let elevenlabs: ElevenLabsConfig | null = null;
      try {
        ({ elevenlabs } = await getAIConfig());
      } catch {
        console.error("[maya/no-response] unable to load voice configuration");
      }

      const prompt = "Sorry, I didn't catch that — I'll let you go for now. Have a good day!";
      return twimlResponse(c, `<Response>${tts(getAppUrl(c), prompt, voice, elevenlabs)}<Hangup/></Response>`);
    } catch (err) {
      return webhookSoftFailTwiml(c, "maya/no-response", err, "Sorry, I didn't catch that — I'll let you go for now. Have a good day!", c.req.query("voice") ?? "Google.en-US-Neural2-F");
    }
  });

  // ElevenLabs audio proxy — streams TTS audio for Twilio <Play>
  // API key is never exposed in the URL; it's fetched server-side from config/env.
  app.get("/audio", async (c) => {
    const text = c.req.query("text") ?? "";
    const voiceId = c.req.query("vid") ?? "";
    const expiresRaw = c.req.query("expires") ?? "";
    const providedSignature = c.req.query("sig") ?? "";
    const expiresAt = Number(expiresRaw);
    const now = Math.floor(Date.now() / 1000);
    const rootSecret = env.appSecret || env.claudeEndpointSecret;

    if (!text || !voiceId || text.length > 1_000 || voiceId.length > 128) {
      return c.body("Invalid params", 400);
    }
    if (!rootSecret || !Number.isSafeInteger(expiresAt) || expiresAt < now || expiresAt > now + 600) {
      return c.body("Forbidden", 403);
    }
    const expectedSignature = deriveScopedSecret(rootSecret, `elevenlabs-audio:${expiresAt}:${voiceId}:${text}`);
    if (!safeEqual(providedSignature, expectedSignature)) {
      return c.body("Forbidden", 403);
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
      const body = await getTwilioBody(c);
      const callSid = (body["CallSid"] as string) ?? "";
      const callStatus = (body["CallStatus"] as string) ?? "";
      console.log(`[maya/status] call ${callSid} → ${callStatus}`);

      if (callSid) {
        const statusAt = new Date().toISOString();
        const diagnostics = Object.fromEntries(
          [
            ["error_code", safeTwilioDiagnostic(body["ErrorCode"])],
            ["error_message", safeTwilioDiagnostic(body["ErrorMessage"])],
            ["sip_response_code", safeTwilioDiagnostic(body["SipResponseCode"])],
            ["call_duration", safeTwilioDiagnostic(body["CallDuration"])],
            ["sequence_number", safeTwilioDiagnostic(body["SequenceNumber"])],
          ].filter((entry): entry is [string, string] => Boolean(entry[1])),
        );

        await updateConversationMetadata(callSid, {
          twilio_status_events: [{ status: callStatus, at: statusAt, ...diagnostics }],
        });
        await appendConversationEvent(callSid, "status_callback", { status: callStatus, ...diagnostics });

        const turns = await loadConversation(callSid);
        const terminalOutcome = terminalOutcomeForStatus(callStatus, turns.length);
        if (terminalOutcome) {
          await updateConversationMetadata(callSid, {
            terminal_status: callStatus,
            terminal_outcome: terminalOutcome,
            terminal_at: statusAt,
            terminal_diagnostics: diagnostics,
          });
          await appendConversationEvent(callSid, "terminal_outcome_recorded", {
            status: callStatus,
            outcome: terminalOutcome,
            ...diagnostics,
          });

          if (callStatus === "completed" && turns.length > 1) {
            await extractAndSaveOutcome(callSid, turns);
          }
        }
      }
    } catch (err) {
      console.error("[maya/status] error:", err);
    }
    return c.body(null, 204);
  });

  return app;
}
