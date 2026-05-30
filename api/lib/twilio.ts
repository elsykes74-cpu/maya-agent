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
  if (appUrl && !appUrl.includes("localhost")) return appUrl.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
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
}): Promise<TwilioCallResult | null> {
  const { accountSid, credentials, fromNumber } = getTwilioEnv();
  if (!accountSid || !credentials.length || !fromNumber) {
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
    for (const credential of credentials) {
      const res = await postTwilioCall(accountSid, credential, body);
      if (res.ok) {
        const data: any = await res.json();
        return { sid: data.sid, status: data.status };
      }

      const err = await res.text();
      console.error("[twilio] outbound call error:", credential.label, res.status, err);
      if (res.status !== 401) return null;
    }
    return null;
  } catch (err) {
    console.error("[twilio] outbound call exception:", err);
    return null;
  }
}
