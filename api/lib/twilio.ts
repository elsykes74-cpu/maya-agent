import { Buffer } from "node:buffer";

/**
 * Twilio outbound call helper.
 * Places a call via Twilio REST API and points the answered webhook
 * at our /api/maya/outbound handler so both legs use the same conversation engine.
 */

export interface TwilioCallResult {
  sid: string;
  status: string;
  error?: string;
}

type TwilioCredential = {
  label: string;
  user: string;
  secret: string;
};

export function getTwilioEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const apiKey = process.env.TWILIO_API_KEY ?? "";
  const apiSecret = process.env.TWILIO_API_SECRET ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";

  const credentials: TwilioCredential[] = [];
  if (apiKey && apiSecret) {
    credentials.push({ label: "api-key", user: apiKey, secret: apiSecret });
  }
  if (accountSid && (authToken || apiSecret)) {
    credentials.push({ label: "account-token", user: accountSid, secret: authToken || apiSecret });
  }

  return {
    accountSid,
    credentials,
    authUser: credentials[0]?.user ?? "",
    authSecret: credentials[0]?.secret ?? "",
    fromNumber: process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "",
  };
}

export function isTwilioConfigured(): boolean {
  const { accountSid, credentials, fromNumber } = getTwilioEnv();
  return !!(accountSid && credentials.length && fromNumber);
}

function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

function resolveAppUrl(appUrl: string): string {
  // On Vercel, always use the exact deployment URL so Twilio webhooks
  // come back to the same deployment (preview or production).
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (appUrl && !appUrl.includes("localhost")) return appUrl.replace(/\/$/, "");
  return appUrl.replace(/\/$/, "");
}

async function postTwilioCall(accountSid: string, credential: TwilioCredential, body: URLSearchParams) {
  return fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credential.user}:${credential.secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );
}

export async function placeTwilioOutboundCall(opts: {
  to: string;
  name: string;
  address: string;
  appUrl: string;
  voice?: string;
}): Promise<TwilioCallResult> {
  const { accountSid, credentials, fromNumber } = getTwilioEnv();
  if (!accountSid || !credentials.length || !fromNumber) {
    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !credentials.length && "TWILIO_AUTH_TOKEN (or TWILIO_API_KEY + TWILIO_API_SECRET)",
      !fromNumber && "TWILIO_FROM_NUMBER",
    ].filter(Boolean).join(", ");
    return { sid: "", status: "failed", error: `Missing env vars: ${missing}` };
  }

  const baseUrl = resolveAppUrl(opts.appUrl);
  const params = new URLSearchParams({ name: opts.name, address: opts.address, voice: opts.voice ?? "Google.en-US-Neural2-F" });
  const webhookUrl = `${baseUrl}/api/maya/outbound?${params}`;
  const statusUrl = `${baseUrl}/api/maya/status`;

  const body = new URLSearchParams({
    To: normalizePhoneNumber(opts.to),
    From: normalizePhoneNumber(fromNumber),
    Url: webhookUrl,
    StatusCallback: statusUrl,
    StatusCallbackMethod: "POST",
    MachineDetection: "Enable",
    MachineDetectionTimeout: "30",
  });

  try {
    for (const credential of credentials) {
      const res = await postTwilioCall(accountSid, credential, body);
      if (res.ok) {
        const data: any = await res.json();
        return { sid: data.sid, status: data.status };
      }

      const errText = await res.text();
      console.error("[twilio] outbound call error:", credential.label, res.status, errText);

      let friendlyError = `Twilio error ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.message) friendlyError = errJson.message;
        if (errJson.code === 21219) friendlyError = "The destination number is not verified. Twilio trial accounts can only call verified numbers. Upgrade your Twilio account or verify the number at twilio.com/console.";
        if (errJson.code === 21211) friendlyError = "Invalid 'To' phone number format. Use E.164 format like +14135551234.";
        if (errJson.code === 21212) friendlyError = "Invalid 'From' phone number. Check TWILIO_FROM_NUMBER in your Vercel env vars.";
        if (errJson.code === 20003) friendlyError = "Twilio authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel.";
      } catch { /* errText not JSON */ }

      if (res.status !== 401) return { sid: "", status: "failed", error: friendlyError };
    }
    return { sid: "", status: "failed", error: "Twilio authentication failed for all credentials." };
  } catch (err: any) {
    console.error("[twilio] outbound call exception:", err);
    return { sid: "", status: "failed", error: err?.message ?? "Network error reaching Twilio." };
  }
}
