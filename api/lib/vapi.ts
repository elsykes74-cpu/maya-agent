import { getDb } from "../queries/connection";
import { callingConfig, leads, dncList } from "../../db/schema";
import { eq } from "drizzle-orm";

export interface VapiCallRequest {
  assistantId?: string;
  assistant?: {
    name?: string;
    voice?: {
      provider?: string;
      voiceId?: string;
    };
    model?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      functions?: any[];
    };
    firstMessage?: string;
  };
  phoneNumberId?: string;
  customer?: {
    number?: string;
    name?: string;
  };
  maxDurationSeconds?: number;
}

export interface VapiCallResponse {
  id: string;
  status: string;
  createdAt: string;
  assistantId?: string;
  customer?: {
    number?: string;
    name?: string;
  };
}

export async function getCallingConfig() {
  const db = getDb();
  let config = await db.query.callingConfig.findFirst();
  if (!config) {
    await db.insert(callingConfig).values({
      provider: "vapi",
      maxDailyCalls: 100,
      callWindowStart: "09:00",
      callWindowEnd: "19:00",
      timezone: "America/New_York",
      voicemailEnabled: true,
      smsFollowUpEnabled: true,
      scrubDncBeforeCall: true,
      scrubLitigants: true,
    });
    config = await db.query.callingConfig.findFirst();
  }
  return config;
}

export async function getAIConfigForCall() {
  const db = getDb();
  let config = await db.query.aiConfig.findFirst();
  if (!config) {
    throw new Error("AI config not found");
  }
  return config;
}

export async function createVapiCall(leadId: number, phone: string, sellerName: string): Promise<VapiCallResponse | null> {
  const config = await getCallingConfig();
  if (!config || !config.apiKey) {
    console.error("Vapi API key not configured");
    return null;
  }

  const ai = await getAIConfigForCall();
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return null;

  const propertyAddress = lead.propertyAddress || "";
  const street = propertyAddress.split(",")[0] || propertyAddress;

  // Personalize the system prompt with lead data
  const personalizedPrompt = ai.systemPrompt
    .replace(/\[Name\]/g, sellerName)
    .replace(/\[Street Address\]/g, propertyAddress)
    .replace(/\[Street\]/g, street)
    .replace(/\[Agent Name\]/g, "Erick");

  const opener = ai.openerScript
    .replace(/\[Name\]/g, sellerName)
    .replace(/\[Street Address\]/g, propertyAddress)
    .replace(/\[Street\]/g, street)
    .replace(/\[Agent Name\]/g, "Erick");

  const body: VapiCallRequest = {
    phoneNumberId: config.fromPhoneNumber || undefined,
    customer: {
      number: phone,
      name: sellerName,
    },
    maxDurationSeconds: 300,
    assistant: {
      name: "Real Estate Acquisitions",
      voice: {
        provider: "11labs",
        voiceId: "josh",
      },
      model: {
        provider: "openai",
        model: "gpt-4o",
        systemPrompt: personalizedPrompt,
        functions: [
          {
            name: "setAppointment",
            description: "When the seller agrees to a walkthrough appointment",
            parameters: {
              type: "object",
              properties: {
                day: { type: "string", description: "Day of week" },
                time: { type: "string", description: "Time like 2pm" },
              },
              required: ["day", "time"],
            },
          },
          {
            name: "logPainSignal",
            description: "When seller mentions a pain signal",
            parameters: {
              type: "object",
              properties: {
                signal: { type: "string" },
              },
              required: ["signal"],
            },
          },
          {
            name: "logAskingPrice",
            description: "When seller mentions what they want for the property",
            parameters: {
              type: "object",
              properties: {
                price: { type: "string" },
              },
              required: ["price"],
            },
          },
          {
            name: "addToDNC",
            description: "If seller says do not call, stop calling, take me off the list",
            parameters: {
              type: "object",
              properties: {},
            },
          },
        ],
      },
      firstMessage: opener,
    },
  };

  const res = await fetch(config.apiEndpoint || "https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Vapi API error:", err);
    return null;
  }

  return res.json() as Promise<VapiCallResponse>;
}

export function isWithinCallWindow(start: string, end: string, timezone: string): boolean {
  const now = new Date();
  const tz = timezone || "America/New_York";
  const timeStr = now.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return timeStr >= start && timeStr <= end;
}

export async function scrubPhone(phone: string, scrubDnc: boolean, _scrubLitigants: boolean) {
  const db = getDb();
  const result = { pass: true, reason: "" as string };

  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    return { pass: false, reason: "Invalid phone number" };
  }

  if (scrubDnc) {
    const dnc = await db.query.dncList.findFirst({ where: eq(dncList.phone, cleanPhone) });
    if (dnc) {
      return { pass: false, reason: `DNC: ${dnc.reason}` };
    }
  }

  return result;
}
