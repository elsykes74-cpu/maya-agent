import { TRPCError } from "@trpc/server";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { placeTwilioOutboundCall } from "../lib/twilio";
import { supabase } from "../lib/supabase";
import { env } from "../lib/env";

const VOICES = [
  { id: "Google.en-US-Neural2-F", label: "Aria", gender: "Female", style: "Most Natural (Recommended)" },
  { id: "Google.en-US-Neural2-H", label: "Emma", gender: "Female", style: "Expressive & Warm" },
  { id: "Google.en-US-Neural2-C", label: "Clara", gender: "Female", style: "Bright & Clear" },
  { id: "Polly.Ruth-Neural", label: "Ruth", gender: "Female", style: "Natural & Conversational" },
  { id: "Polly.Joanna-Neural", label: "Joanna", gender: "Female", style: "Warm & Polished" },
  { id: "Polly.Matthew-Neural", label: "Matthew", gender: "Male", style: "Professional & Natural" },
];

const activeCalls = new Map<string, { to: string; status: string; startedAt: Date }>();

// Clean up stale activeCalls entries older than 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [sid, call] of activeCalls) {
    if (call.startedAt.getTime() < cutoff) activeCalls.delete(sid);
  }
}, 60_000);

let _configCache: { v: { accountSid: string; authToken: string; fromNumber: string }; exp: number } | null = null;

async function getTwilioConfig() {
  const now = Date.now();
  if (_configCache && _configCache.exp > now) return _configCache.v;
  const { data } = await supabase
    .from("ai_config")
    .select("twilio_account_sid, twilio_auth_token, twilio_from_number")
    .order("id")
    .limit(1)
    .single();
  const v = {
    accountSid: data?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || "",
    authToken:  data?.twilio_auth_token  || process.env.TWILIO_AUTH_TOKEN  || "",
    fromNumber: data?.twilio_from_number || process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "",
  };
  _configCache = { v, exp: now + 60_000 };
  return v;
}

export const mayaRouter = createRouter({
  listVoices: publicQuery.query(() => ({ voices: VOICES })),

  checkConfig: publicQuery.query(async () => {
    const { accountSid, authToken, fromNumber } = await getTwilioConfig();
    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !authToken && "TWILIO_AUTH_TOKEN",
      !fromNumber && "TWILIO_FROM_NUMBER",
    ].filter(Boolean) as string[];
    return { twilioConfigured: missing.length === 0, missingVars: missing };
  }),

  placeCall: publicQuery
    .input(z.object({
      to: z.string(),
      name: z.string().default(""),
      address: z.string().default(""),
      voice: z.string().default("Google.en-US-Neural2-F"),
    }))
    .mutation(async ({ input, ctx }) => {
      const { accountSid, authToken, fromNumber } = await getTwilioConfig();
      if (!accountSid || !authToken || !fromNumber) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Twilio not configured — add Account SID, Auth Token, and From Number in AI Config.",
        });
      }
      // Use the actual incoming request host so Twilio webhooks hit the right URL
      const proto = ctx.req.headers.get("x-forwarded-proto") ?? "https";
      const host = ctx.req.headers.get("x-forwarded-host") ?? ctx.req.headers.get("host") ?? "";
      const appUrl = host ? `${proto}://${host}` : env.appUrl;
      const result = await placeTwilioOutboundCall({
        to: input.to,
        name: input.name,
        address: input.address,
        appUrl,
        voice: input.voice,
        accountSid,
        authToken,
        fromNumber,
      });

      if (!result.sid) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: result.error ?? "Twilio call failed.",
        });
      }

      activeCalls.set(result.sid, { to: input.to, status: "ringing", startedAt: new Date() });
      return { sid: result.sid, status: "ringing" };
    }),

  hangUp: publicQuery
    .input(z.object({ sid: z.string() }))
    .mutation(async ({ input }) => {
      const { accountSid, authToken } = await getTwilioConfig();
      if (!accountSid || !authToken) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Twilio not configured" });
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${input.sid}.json`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "Status=completed",
      });
      if (!resp.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: `Twilio hangup failed: ${resp.status}` });
      activeCalls.delete(input.sid);
      return { success: true };
    }),

  getTranscript: publicQuery
    .input(z.object({ sid: z.string().optional() }))
    .query(async ({ input }) => {
      if (!input.sid) return { transcript: null, status: "idle" };
      // Ask Twilio directly so the UI auto-hangs-up when the far end disconnects
      try {
        const { accountSid, authToken } = await getTwilioConfig();
        if (accountSid && authToken) {
          const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${input.sid}.json`;
          const resp = await fetch(url, {
            headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
          });
          if (resp.ok) {
            const data = await resp.json() as { status: string };
            const done = ["completed", "busy", "failed", "no-answer", "canceled"].includes(data.status);
            return { transcript: null, status: done ? "completed" : data.status };
          }
        }
      } catch { /* fall through to local map */ }
      const call = activeCalls.get(input.sid);
      return { transcript: null, status: call?.status ?? "completed" };
    }),

  getConversation: publicQuery
    .input(z.object({ callSid: z.string() }))
    .query(async ({ input }) => {
      const { data } = await supabase
        .from("maya_conversations")
        .select("turns, metadata, updated_at")
        .eq("call_sid", input.callSid)
        .single();
      if (!data) return null;
      return {
        turns: (data.turns ?? []) as Array<{ role: "assistant" | "user"; content: string }>,
        metadata: (data.metadata ?? {}) as Record<string, unknown>,
        updatedAt: data.updated_at as string,
      };
    }),
});
