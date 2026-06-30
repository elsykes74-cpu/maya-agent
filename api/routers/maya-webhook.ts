import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { supabase } from "../lib/supabase";
import { getMayaResponse, analyzeCallOutcome, type ConversationTurn } from "../lib/anthropic";
import { elevenLabsTTSStream } from "../lib/elevenlabs";
import { searchGoogleMapsAddress } from "../lib/serpapi";
import { researchLead } from "../lib/brave-search";
import { env } from "../lib/env";

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
  return `<Gather input="speech" speechTimeout="3" timeout="15" action="${escXml(action)}" method="POST">${content}</Gather>`;
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

async function loadConversation(callSid: string): Promise<{ turns: ConversationTurn[]; systemPrompt?: string }> {
  const { data } = await supabase
    .from("maya_conversations")
    .select("turns, metadata")
    .eq("call_sid", callSid)
    .single();
  const meta = (data?.metadata as Record<string, unknown>) ?? {};
  return {
    turns: (data?.turns as ConversationTurn[]) ?? [],
    systemPrompt: meta.systemPrompt as string | undefined,
  };
}

async function saveConversation(callSid: string, turns: ConversationTurn[], metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from("maya_conversations").upsert(
    { call_sid: callSid, turns, metadata, updated_at: new Date().toISOString() },
    { onConflict: "call_sid" }
  );
  if (error) console.error("[maya] saveConversation error:", error.message);
}

async function sendEmail(subject: string, html: string): Promise<void> {
  if (!env.resendApiKey) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.resendFromEmail,
        to: [env.notifyEmail],
        subject,
        html,
      }),
    });
    if (!res.ok) console.error("[maya/email] Resend error:", res.status, await res.text());
    else console.log("[maya/email] sent:", subject);
  } catch (err) {
    console.error("[maya/email] fetch error:", err);
  }
}

async function extractAndSaveOutcome(callSid: string, turns: ConversationTurn[]) {
  try {
    const { data: existing } = await supabase
      .from("maya_conversations")
      .select("metadata")
      .eq("call_sid", callSid)
      .single();
    const meta = (existing?.metadata as Record<string, unknown>) ?? {};

    const fullText = turns.map(t => `${t.role}: ${t.content}`).join("\n");
    const appointmentSet = /next week|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|confirm the detail/i.test(fullText);

    await supabase.from("maya_conversations")
      .update({ metadata: { ...meta, appointment_set: appointmentSet, outcome_processed: true } })
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

function scriptedFallback(priorTurnCount: number, name: string, address: string): string {
  const first = name.split(" ")[0];
  const prop = address || "your property";
  // Cycle through conversation stages so the call progresses even when Claude is unavailable
  const stage = Math.floor(priorTurnCount / 2);
  switch (stage) {
    case 0:
      return first
        ? `Hey ${first}, thanks for picking up. Are you still the owner of the property at ${prop}?`
        : `Thanks for picking up. Are you the owner of the property we've been looking at?`;
    case 1:
      return `Got it. We work with a local buyer group here in Western Mass — we buy properties as-is, no repairs needed, no agent fees. Have you had any thoughts about selling?`;
    case 2:
      return `Totally understand. We can work around your timeline — no rush. Would it be okay if I sent over a quick text with some info on how we work?`;
    case 3:
      return `Of course. Could I grab the best number for a text, or would email work better for you?`;
    default:
      return `I really appreciate your time today. We'll follow up shortly. Hope you have a great rest of your day! [END_CALL]`;
  }
}

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
      const toPhone = (body["To"] as string) ?? "";
      const isMachine = answeredBy.startsWith("machine") || answeredBy === "fax";
      console.log("[maya/outbound] callSid:", callSid, "answeredBy:", answeredBy);

      // Run AI config + property research in parallel — research enriches Maya's system prompt
      let elevenlabs: ElevenLabsConfig | null = null;
      let systemPromptOverride: string | null = null;
      try {
        const [aiConfig, mapsData, braveData] = await Promise.all([
          getAIConfig(),
          address ? searchGoogleMapsAddress(address).catch(() => null) : Promise.resolve(null),
          (name && address) ? researchLead(name, address, "").catch(() => null) : Promise.resolve(null),
        ]);
        elevenlabs = aiConfig.elevenlabs;

        const researchLines: string[] = [];
        if (mapsData?.summary) researchLines.push(`Google Maps: ${mapsData.summary}`);
        if (braveData?.distressSignals?.length) researchLines.push(`Distress signals: ${braveData.distressSignals.join(", ")}`);
        if (braveData?.summary && !braveData.summary.includes("not configured")) researchLines.push(`Web research: ${braveData.summary}`);

        if (researchLines.length > 0) {
          systemPromptOverride = aiConfig.systemPrompt + `\n\nPRE-CALL RESEARCH (use naturally in conversation, don't read verbatim):\n${researchLines.join("\n")}`;
          console.log("[maya/outbound] enriched prompt with research:", researchLines.length, "signals");
        } else {
          systemPromptOverride = aiConfig.systemPrompt;
        }
      } catch (err) {
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
        saveConversation(callSid, [{ role: "assistant", content: opener }], {
          name, address, phone: toPhone,
          ...(systemPromptOverride ? { systemPrompt: systemPromptOverride } : {}),
        }).catch(err => console.error("[maya/outbound] save error:", err));
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
      console.error("[maya/respond] SpeechResult=%s callSid=%s", JSON.stringify(speech), callSid);

      const [convData, { systemPrompt: basePrompt, elevenlabs }] = await Promise.all([
        callSid ? loadConversation(callSid) : Promise.resolve({ turns: [], systemPrompt: undefined }),
        getAIConfig(),
      ]);
      const turns = convData.turns;
      // Use research-enriched prompt stored at call start if available, fall back to base
      const systemPrompt = convData.systemPrompt ?? basePrompt;

      const updatedTurns: ConversationTurn[] = [
        ...turns,
        { role: "user", content: speech || "(silence)" },
      ];

      let mayaResponse: string;
      try {
        mayaResponse = await getMayaResponse(systemPrompt, updatedTurns, name, address);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[maya/respond] Claude error:", errMsg);
        mayaResponse = scriptedFallback(turns.length, name, address);
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
${gather(respondUrl(appUrl, name, address, voice), say(scriptedFallback(0, name, address), voice))}
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

  // Recording status callback — save recording URL and send email notification
  app.post("/recording-status", async (c) => {
    try {
      const body = await c.req.parseBody();
      const callSid = (body["CallSid"] as string) ?? "";
      const recordingUrl = (body["RecordingUrl"] as string) ?? "";
      const recordingStatus = (body["RecordingStatus"] as string) ?? "";
      const recordingSid = (body["RecordingSid"] as string) ?? "";
      const duration = parseInt((body["RecordingDuration"] as string) ?? "0", 10);
      console.log(`[maya/recording] callSid=${callSid} status=${recordingStatus} url=${recordingUrl}`);

      if (!callSid || !recordingUrl || recordingStatus !== "completed") {
        return c.body(null, 204);
      }

      const mp3Url = `${recordingUrl}.mp3`;

      // Fetch full conversation to merge metadata and analyze outcome
      const { data } = await supabase
        .from("maya_conversations")
        .select("metadata, turns")
        .eq("call_sid", callSid)
        .single();

      const existingMeta = (data?.metadata as Record<string, unknown>) ?? {};
      const name = (existingMeta.name as string) ?? "";
      const address = (existingMeta.address as string) ?? "";
      const phone = (existingMeta.phone as string) ?? "";
      const turns = (data?.turns as ConversationTurn[]) ?? [];

      // Save recording URL into metadata (merging, not replacing)
      await supabase.from("maya_conversations").upsert(
        { call_sid: callSid, metadata: { ...existingMeta, recording_url: mp3Url, recording_duration: duration }, updated_at: new Date().toISOString() },
        { onConflict: "call_sid" }
      );

      // Analyze outcome and send email notification (non-blocking)
      if (turns.length > 0) {
        analyzeCallOutcome(turns).then(async (analysis) => {
          const isAppointment = analysis.outcome === "connected_interested" &&
            /next week|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|schedule|appointment|meet|walkthrough/i.test(
              turns.map(t => t.content).join(" ")
            );
          const isFollowUp = analysis.outcome === "callback_requested";

          const durationFmt = duration > 0
            ? `${Math.floor(duration / 60)}m ${duration % 60}s`
            : "< 1 min";

          const transcriptHtml = turns
            .map(t => `<tr><td style="padding:4px 8px;font-weight:700;color:${t.role === "assistant" ? "#7c3aed" : "#374151"};white-space:nowrap;">${t.role === "assistant" ? "Maya" : "Seller"}</td><td style="padding:4px 8px;color:#374151;">${t.content}</td></tr>`)
            .join("");

          const audioLink = recordingSid
            ? `<a href="${env.appUrl}/api/maya/recording-audio?sid=${recordingSid}" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#7c3aed;color:white;border-radius:8px;text-decoration:none;font-weight:700;">▶ Play Recording</a>`
            : "";

          let subjectEmoji = "📋";
          let subjectLabel = "Call Summary";
          let alertBanner = "";
          if (isAppointment) {
            subjectEmoji = "🏠";
            subjectLabel = "Appointment Set";
            alertBanner = `<div style="background:#d1fae5;border:2px solid #10b981;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-weight:700;color:#065f46;font-size:15px;">✅ APPOINTMENT SET — follow up to confirm details</div>`;
          } else if (isFollowUp) {
            subjectEmoji = "📞";
            subjectLabel = "Follow-Up Call Needed";
            alertBanner = `<div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-weight:700;color:#92400e;font-size:15px;">📞 FOLLOW-UP REQUESTED — seller asked to be called back</div>`;
          }

          const html = `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;">
  <div style="background:white;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 4px;color:#111827;">Maya Call Report</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>

    ${alertBanner}

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:90px;">Lead</td><td style="padding:6px 0;font-weight:700;color:#111827;">${name || "Unknown"}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Phone</td><td style="padding:6px 0;font-weight:600;color:#111827;">${phone}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Address</td><td style="padding:6px 0;font-weight:600;color:#111827;">${address || "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Duration</td><td style="padding:6px 0;font-weight:600;color:#111827;">${durationFmt}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Outcome</td><td style="padding:6px 0;font-weight:600;color:#7c3aed;">${analysis.outcome.replace(/_/g, " ")}</td></tr>
    </table>

    <div style="background:#f3f4f6;border-radius:10px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#374151;font-style:italic;">${analysis.notes}</p>
    </div>

    ${audioLink}

    ${turns.length > 0 ? `
    <h3 style="margin:24px 0 10px;color:#111827;font-size:14px;">Transcript</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#f9fafb;border-radius:10px;overflow:hidden;">
      ${transcriptHtml}
    </table>` : ""}
  </div>
</div>`;

          const subject = `${subjectEmoji} ${subjectLabel} — ${name || phone} ${address ? `· ${address}` : ""}`;
          await sendEmail(subject, html);
        }).catch(err => console.error("[maya/recording] email error:", err));
      }
    } catch (err) {
      console.error("[maya/recording] error:", err);
    }
    return c.body(null, 204);
  });

  // Recording audio proxy — streams Twilio recording with server-side auth so browser can play it
  app.get("/recording-audio", async (c) => {
    const sid = c.req.query("sid") ?? "";
    if (!sid) return c.body("Missing sid", 400);

    const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
    const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
    if (!accountSid || !authToken) return c.body("Twilio not configured", 503);

    const recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`;
    try {
      const upstream = await fetch(recordingUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        },
      });
      if (!upstream.ok) return c.body("Recording not found", 404);
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (err) {
      console.error("[maya/recording-audio] error:", err);
      return c.body("Failed to fetch recording", 502);
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
        const convData = await loadConversation(callSid);
        if (convData.turns.length > 1) {
          await extractAndSaveOutcome(callSid, convData.turns);
        }
      }
    } catch (err) {
      console.error("[maya/status] error:", err);
    }
    return c.body(null, 204);
  });

  return app;
}
