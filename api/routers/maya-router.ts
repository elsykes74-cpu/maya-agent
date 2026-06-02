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

async function getTwilioConfig() {
  const { data } = await supabase
    .from("ai_config")
    .select("twilio_account_sid, twilio_auth_token, twilio_from_number")
    .order("id")
    .limit(1)
    .single();
  const accountSid = data?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = data?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || "";
  const fromNumber = data?.twilio_from_number || process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "";
  return { accountSid, authToken, fromNumber };
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
    .mutation(async ({ input }) => {
      const { accountSid, authToken, fromNumber } = await getTwilioConfig();
      if (!accountSid || !authToken || !fromNumber) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Twilio not configured — add Account SID, Auth Token, and From Number in AI Config.",
        });
      }
      const result = await placeTwilioOutboundCall({
        to: input.to,
        name: input.name,
        address: input.address,
        appUrl: env.appUrl,
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
      const call = activeCalls.get(input.sid);
      return { transcript: null, status: call?.status ?? "completed" };
    }),
});
