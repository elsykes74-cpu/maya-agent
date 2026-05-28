import { env } from "./env";

const TWILIO_BASE = `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`;

function twilioAuth(): string {
  // API key auth: key SID + secret (recommended over auth token)
  const creds = `${env.twilioApiKey}:${env.twilioApiSecret}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

export interface SMSResult {
  sid: string;
  status: string;
  error?: string;
}

export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  if (!env.twilioAccountSid || !env.twilioApiKey || !env.twilioApiSecret) {
    console.error("[twilio] Missing credentials — set TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET");
    return { sid: "", status: "failed", error: "Twilio not configured" };
  }

  const from = env.twilioPhoneNumber;
  if (!from) {
    return { sid: "", status: "failed", error: "TWILIO_PHONE_NUMBER not set" };
  }

  // Normalize phone
  const toClean = to.startsWith("+") ? to : `+1${to.replace(/\D/g, "")}`;

  const params = new URLSearchParams({ To: toClean, From: from, Body: body });

  try {
    const res = await fetch(TWILIO_BASE, {
      method: "POST",
      headers: {
        Authorization: twilioAuth(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const json = (await res.json()) as any;

    if (!res.ok) {
      console.error("[twilio] API error:", json);
      return { sid: "", status: "failed", error: json.message ?? "Unknown error" };
    }

    return { sid: json.sid, status: json.status };
  } catch (err) {
    console.error("[twilio] fetch error:", err);
    return { sid: "", status: "failed", error: String(err) };
  }
}
