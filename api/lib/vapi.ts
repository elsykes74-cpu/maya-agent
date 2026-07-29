import { getDb } from "../queries/connection";
import { callingConfig, leads, dncList } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  buildVapiAssistantOverrides,
  type VapiAssistantOverrides,
  type VapiStartSpeakingPlan,
  type VapiStopSpeakingPlan,
} from "./vapi-config";
import { env } from "./env";
import {
  checkOutboundCallSafety,
  OutboundCallBlockedError,
  type OutboundCallSafetyConfig,
} from "./call-safety";


export interface VapiCallRequest {
  assistantId?: string;
  assistantOverrides?: VapiAssistantOverrides;
  assistant?: {
    name?: string;
    transcriber?: {
      provider: "deepgram";
      model: "flux-general-en";
      language: "en";
      eotThreshold: number;
      eotTimeoutMs: number;
    };
    voice?: {
      provider?: string;
      voiceId?: string;
    };
    model?: {
      provider?: string;
      model?: string;
      messages?: Array<{ role: "system"; content: string }>;
      functions?: Array<Record<string, unknown>>;
    };
    firstMessage?: string;
    startSpeakingPlan?: VapiStartSpeakingPlan;
    stopSpeakingPlan?: VapiStopSpeakingPlan;
    backgroundSound?: "off" | "office";
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
  const config = await db.query.aiConfig.findFirst();
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

type AssistantLeadContext = Partial<{
  propertyAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  motivationLevel: string | null;
  timeline: string | null;
  condition: string | null;
  askingPrice: string | null;
  arv: string | null;
  leadScore: number | null;
  leadType: string | null;
  outreachAngle: string | null;
}>;

export type VapiCallOptions = {
  appUrl?: string;
  now?: Date;
  safetyConfig?: OutboundCallSafetyConfig;
  dncChecker?: (phone: string) => Promise<boolean>;
  callingConfig?: {
    apiKey: string;
    assistantId?: string | null;
    fromPhoneNumber?: string | null;
    apiEndpoint?: string | null;
  };
  lead?: AssistantLeadContext;
  aiCallConfig?: { elevenLabsVoiceId?: string | null };
};

function buildAssistantVariables(lead: AssistantLeadContext, sellerName: string) {
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


function buildNaturalOpener(variables: ReturnType<typeof buildAssistantVariables>): string {
  const nameCheck = variables.sellerName ? `Hi, is this ${variables.sellerName}? ` : "Hi, ";
  const propertyReference = variables.street ? ` about the property on ${variables.street}` : " about your property";
  return `${nameCheck}This is Maya, an AI assistant calling for Erick's local property team${propertyReference}. Is now an okay time for a quick question?`;
}

export async function createVapiCall(
  leadId: number,
  phone: string,
  sellerName: string,
  options: VapiCallOptions = {},
): Promise<VapiCallResponse | null> {
  const safety = checkOutboundCallSafety({
    to: phone,
    appUrl: options.appUrl ?? env.appUrl,
    now: options.now,
    config: options.safetyConfig,
  });
  if (!safety.allowed) {
    throw new OutboundCallBlockedError(safety.reason, safety.message);
  }

  try {
    const dncChecker = options.dncChecker ?? (async (destination: string) => {
      const { isPhoneOnDncList } = await import("./dnc-safety");
      return isPhoneOnDncList(destination);
    });
    if (await dncChecker(safety.destination)) {
      throw new OutboundCallBlockedError("dnc", "Destination is on the do-not-call list.");
    }
  } catch (error) {
    if (error instanceof OutboundCallBlockedError) throw error;
    console.error("Vapi pre-dial DNC check failed:", error);
    throw new OutboundCallBlockedError(
      "dnc_check_failed",
      "Call blocked because the do-not-call list could not be verified.",
    );
  }

  const config = options.callingConfig ?? await getCallingConfig();
  if (!config || !config.apiKey) {
    console.error("Vapi API key not configured");
    return null;
  }

  let lead: AssistantLeadContext | undefined = options.lead;
  let aiCallConfig = options.aiCallConfig;
  if (!lead) {
    const db = getDb();
    lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!lead) return null;
    aiCallConfig = await db.query.aiConfig.findFirst();
  }

  const variables = buildAssistantVariables(lead, sellerName);
  const assistantId = config.assistantId || process.env.VAPI_ASSISTANT_ID;
  if (!assistantId) {
    throw new Error("Vapi assistant is not configured; transient assistants are disabled until provider tools are authenticated");
  }

  const body: VapiCallRequest = {
    phoneNumberId: config.fromPhoneNumber || undefined,
    customer: {
      number: safety.destination,
      name: sellerName,
    },
    maxDurationSeconds: 300,
  };

  body.assistantId = assistantId;
  body.assistantOverrides = buildVapiAssistantOverrides(
    variables,
    buildNaturalOpener(variables),
    aiCallConfig?.elevenLabsVoiceId,
  );

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
  void _scrubLitigants;
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
