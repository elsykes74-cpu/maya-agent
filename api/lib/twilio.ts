import { Buffer } from "node:buffer";

/**
 * Twilio outbound call helper.
 * Places a call via Twilio REST API and points the answered webhook
 * at our /api/maya/outbound handler so both legs use the same conversation engine.
 */

export interface TwilioCallResult {
  sid: string;
  status: string;
}

export function getTwilioEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const apiKey = process.env.TWILIO_API_KEY ?? "";
  const apiSecret = process.env.TWILIO_API_SECRET ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";

  return {
    accountSid,
    authUser: apiKey || accountSid,
    authSecret: apiSecret || authToken,
    fromNumber: process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "",
  };
}

export function isTwilioConfigured(): boolean {
  const { accountSid, authUser, authSecret, fromNumber } = getTwilioEnv();
  return !!(accountSid && authUser && authSecret && fromNumber);
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
  if (appUrl && !appUrl.includes("localhost")) return appUrl.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return appUrl.replace(/\/$/, "");
}

export async function placeTwilioOutboundCall(opts: {
  to: string;
  name: string;
  address: string;
  appUrl: string;
}): Promise<TwilioCallResult | null> {
  const { accountSid, authUser, authSecret, fromNumber } = getTwilioEnv();
  if (!accountSid || !authUser || !authSecret || !fromNumber) {
    console.error("[twilio] Missing credentials: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or TWILIO_API_SECRET, and TWILIO_FROM_NUMBER or TWILIO_PHONE_NUMBER");
    return null;
  }

  const baseUrl = resolveAppUrl(opts.appUrl);
  const params = new URLSearchParams({ name: opts.name, address: opts.address });
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
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${authUser}:${authSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[twilio] outbound call error:", res.status, err);
      return null;
    }

    const data: any = await res.json();
    return { sid: data.sid, status: data.status };
  } catch (err) {
    console.error("[twilio] outbound call exception:", err);
    return null;
  }
}
