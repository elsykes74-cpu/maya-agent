import { Hono } from "hono";
import type { Context } from "hono";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return `<Gather input="speech" speechTimeout="auto" timeout="8" action="${escXml(action)}" method="POST">${content}</Gather>`;
}

function noRespUrl(appUrl: string, stage: string, name: string, address: string): string {
  return `${appUrl}/api/maya/no-response?stage=${enc(stage)}&name=${enc(name)}&address=${enc(address)}`;
}

function respondUrl(appUrl: string, stage: string, name: string, address: string): string {
  return `${appUrl}/api/maya/respond?stage=${enc(stage)}&name=${enc(name)}&address=${enc(address)}`;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

function stageOpening(appUrl: string, name: string, address: string): string {
  const greeting = name
    ? `Hey — is this ${name}? This is Maya, I'm calling about the property on ${address}. Did I catch you at a bad time?`
    : `Hi there — this is Maya calling. I wanted to reach out about your property. Did I catch you at a bad time?`;

  return `<Response>
${gather(respondUrl(appUrl, "discovery", name, address), say(greeting))}
<Redirect method="POST">${escXml(noRespUrl(appUrl, "opening", name, address))}</Redirect>
</Response>`;
}

function handleStage(
  stage: string,
  speech: string,
  appUrl: string,
  name: string,
  address: string
): string {
  const lower = speech.toLowerCase();

  if (/do not call|take me off|stop calling|remove me/.test(lower)) {
    return `<Response>${say("Of course, I'll remove you from our list right away. Sorry to bother you — have a great day!")}<Hangup/></Response>`;
  }

  switch (stage) {
    case "discovery": {
      if (/bad time|call back|busy|not now|call me later/.test(lower)) {
        return `<Response>${say("No worries at all — when would be a better time to reach you? I can call back then.")}<Hangup/></Response>`;
      }
      const pitch = address
        ? `Perfect. I'll be straight with you — we work with a small group of local investors, and ${address} came up on our radar. We're looking to buy directly in the area. Have you thought at all about selling at some point?`
        : `Perfect. I'll be straight with you — we work with a small group of local investors and wanted to reach out about your property. Have you thought at all about selling?`;
      return `<Response>
${gather(respondUrl(appUrl, "motivation", name, address), say(pitch))}
<Redirect method="POST">${escXml(noRespUrl(appUrl, "discovery", name, address))}</Redirect>
</Response>`;
    }

    case "motivation": {
      if (/not interested|not selling|not looking|no thanks|not really|definitely not/.test(lower)) {
        return `<Response>${say("I totally understand. Most people I talk to aren't actively looking — I just wanted to see if there was ever a scenario where it might make sense. If things change, feel free to reach out anytime. Have a great day!")}<Hangup/></Response>`;
      }
      const question = `That's helpful to know. Quick question — what's the condition of the property right now? Is it move-in ready or does it need some work?`;
      return `<Response>
${gather(respondUrl(appUrl, "condition", name, address), say(question))}
<Redirect method="POST">${escXml(noRespUrl(appUrl, "motivation", name, address))}</Redirect>
</Response>`;
    }

    case "condition": {
      const question = `Got it, thanks. And if you did decide to sell — what kind of timeline would you be thinking? Like a few months out, or something sooner?`;
      return `<Response>
${gather(respondUrl(appUrl, "close", name, address), say(question))}
<Redirect method="POST">${escXml(noRespUrl(appUrl, "condition", name, address))}</Redirect>
</Response>`;
    }

    case "close": {
      const close = `Honestly, the best next step is just a quick walkthrough — takes about 20 minutes. We give you a real number, no pressure, no obligation. If it works for both sides, great. If not, no worries at all. Would something next week work for you?`;
      return `<Response>
${gather(respondUrl(appUrl, "appointment", name, address), say(close))}
<Redirect method="POST">${escXml(noRespUrl(appUrl, "close", name, address))}</Redirect>
</Response>`;
    }

    case "appointment": {
      if (/yes|sure|works|okay|ok|sounds good|fine|yeah|yep|absolutely|perfect|great/.test(lower)) {
        const confirm = `Perfect — I'll have Erick reach out to confirm the details. What's the best email address to send the confirmation to?`;
        return `<Response>${gather(respondUrl(appUrl, "email", name, address), say(confirm))}<Hangup/></Response>`;
      }
      return `<Response>${say("I completely understand. No pressure at all. If you ever want to explore your options, we'd love to connect. Thanks so much for your time — have a wonderful day!")}<Hangup/></Response>`;
    }

    case "email": {
      return `<Response>${say("Perfect, thank you so much. We'll be in touch shortly. Have a wonderful day!")}<Hangup/></Response>`;
    }

    default:
      return `<Response><Hangup/></Response>`;
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createMayaWebhookRouter() {
  const app = new Hono();

  // Inbound generic opener — Twilio points here for calls to your number
  app.post("/initial", async (c) => {
    const appUrl = getAppUrl(c);
    return twimlResponse(c, stageOpening(appUrl, "", ""));
  });

  // Outbound personalized opener — placeTwilioOutboundCall sets webhook to
  // /api/maya/outbound?name=X&address=Y
  app.post("/outbound", async (c) => {
    const name = c.req.query("name") ?? "";
    const address = c.req.query("address") ?? "";
    const appUrl = getAppUrl(c);

    // Answering machine: leave voicemail then hang up
    // Only treat as machine if Twilio explicitly identifies it — "unknown" means
    // detection timed out, which usually means a human answered quickly.
    const body = await c.req.parseBody();
    const answeredBy = (body["AnsweredBy"] as string) ?? "";
    const isMachine = answeredBy.startsWith("machine") || answeredBy === "fax";
    if (isMachine) {
      const vm = name
        ? `Hey ${name}, this is Maya calling about the property on ${address}. Nothing urgent — I just wanted to reach out about something that might be worth a quick conversation. You can call us back, or I'll try you again soon. Thanks!`
        : `Hi, this is Maya with a quick message about your property. Give us a call back when you get a chance. Thanks!`;
      return twimlResponse(c, `<Response>${say(vm)}<Hangup/></Response>`);
    }

    return twimlResponse(c, stageOpening(appUrl, name, address));
  });

  // Speech response handler for all stages
  app.post("/respond", async (c) => {
    const stage = c.req.query("stage") ?? "discovery";
    const name = c.req.query("name") ?? "";
    const address = c.req.query("address") ?? "";
    const appUrl = getAppUrl(c);

    const body = await c.req.parseBody();
    const speech = (body["SpeechResult"] as string) ?? "";

    return twimlResponse(c, handleStage(stage, speech, appUrl, name, address));
  });

  // Silence / no response handler
  app.post("/no-response", async (c) => {
    const stage = c.req.query("stage") ?? "opening";
    const name = c.req.query("name") ?? "";
    const address = c.req.query("address") ?? "";
    const appUrl = getAppUrl(c);

    const twiml = `<Response>
${gather(respondUrl(appUrl, stage, name, address), say("Sorry, I didn't catch that. Are you still there?"))}
<Hangup/>
</Response>`;
    return twimlResponse(c, twiml);
  });

  // Status callback — Twilio posts call completion events here
  app.post("/status", async (c) => {
    const body = await c.req.parseBody();
    console.log(`[maya] call ${body["CallSid"]} → ${body["CallStatus"]}`);
    return c.body(null, 204);
  });

  return app;
}
