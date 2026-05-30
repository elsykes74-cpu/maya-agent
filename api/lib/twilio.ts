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
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    fromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  };
}

export function isTwilioConfigured(): boolean {
  const { accountSid, authToken, fromNumber } = getTwilioEnv();
  return !!(accountSid && authToken && fromNumber);
}

export async function placeTwilioOutboundCall(opts: {
  to: string;
  name: string;
  address: string;
  appUrl: string;
}): Promise<TwilioCallResult | null> {
  const { accountSid, authToken, fromNumber } = getTwilioEnv();
  if (!accountSid || !authToken || !fromNumber) {
    console.error("[twilio] Missing credentials — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER");
    return null;
  }

  const params = new URLSearchParams({ name: opts.name, address: opts.address });
  const webhookUrl = `${opts.appUrl}/api/maya/outbound?${params}`;
  const statusUrl = `${opts.appUrl}/api/maya/status`;

  const body = new URLSearchParams({
    To: opts.to,
    From: fromNumber,
    Url: webhookUrl,
    StatusCallback: statusUrl,
    StatusCallbackMethod: "POST",
    // detect answering machines — if machine, hang up gracefully
    MachineDetection: "Enable",
    MachineDetectionTimeout: "30",
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[twilio] outbound call error:", err);
    return null;
  }

  const data: any = await res.json();
  return { sid: data.sid, status: data.status };
}
