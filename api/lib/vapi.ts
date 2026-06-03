import { getDb } from "../queries/connection";
import { callingConfig, leads, dncList } from "../../db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_VAPI_ASSISTANT_ID = "8f0c5749-74f5-4757-8377-10e10f47dd25";

export interface VapiCallRequest {
  assistantId?: string;
  assistantOverrides?: {
    variableValues?: Record<string, string | number | boolean | null>;
  };
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
      assistantId: DEFAULT_VAPI_ASSISTANT_ID,
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

function resolveVapiCallEndpoint(endpoint?: string | null): string {
  const trimmed = endpoint?.trim();
  if (!trimmed) return "https://api.vapi.ai/call";
  return trimmed.endsWith("/call") ? trimmed : `${trimmed.replace(/\/$/, "")}/call`;
}

function buildAssistantVariables(lead: any, sellerName: string) {
  const propertyAddress = lead.propertyAddress || "";
  const street = propertyAddress.split(",")[0] || propertyAddress;

  return {
    name: sellerName,
    sellerName,
    propertyAddress,
    street,
    agentName: "Erick",
    city: lead.city || "",
    state: lead.state || "MA",
    zipCode: lead.zipCode || "",
    motivationLevel: lead.motivationLevel || "",
    timeline: lead.timeline || "",
    condition: lead.condition || "",
    askingPrice: lead.askingPrice || "",
    arv: lead.arv || "",
    leadScore: lead.leadScore || 0,
    leadType: lead.leadType || "",
    outreachAngle: lead.outreachAngle || "",
  };
}

function personalize(text: string, variables: ReturnType<typeof buildAssistantVariables>): string {
  return text
    .replace(/\[Name\]/g, String(variables.sellerName || ""))
    .replace(/\[Street Address\]/g, String(variables.propertyAddress || ""))
    .replace(/\[Street\]/g, String(variables.street || ""))
    .replace(/\[Agent Name\]/g, "Erick");
}

export async function createVapiCall(leadId: number, phone: string, sellerName: string): Promise<VapiCallResponse | null> {
  const config = await getCallingConfig();
  if (!config || !config.apiKey) {
    console.error("Vapi API key not configured");
    return null;
  }

  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return null;

  const variables = buildAssistantVariables(lead, sellerName);
  const assistantId = config.assistantId || process.env.VAPI_ASSISTANT_ID || DEFAULT_VAPI_ASSISTANT_ID;

  const body: VapiCallRequest = {
    phoneNumberId: config.fromPhoneNumber || undefined,
    customer: {
      number: phone,
      name: sellerName,
    },
    maxDurationSeconds: 300,
  };

  if (assistantId) {
    body.assistantId = assistantId;
    body.assistantOverrides = {
      variableValues: variables,
    };
  } else {
    const ai = await getAIConfigForCall();
    const personalizedPrompt = personalize(ai.systemPrompt, variables);
    const opener = personalize(ai.openerScript, variables);

    body.assistant = {
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
    };
  }

  const res = await fetch(resolveVapiCallEndpoint(config.apiEndpoint), {
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
