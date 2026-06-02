import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { placeTwilioOutboundCall, getTwilioEnv } from "../lib/twilio";
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

export const mayaRouter = createRouter({
  listVoices: publicQuery.query(() => ({ voices: VOICES })),

  checkConfig: publicQuery.query(() => {
    const { accountSid, credentials, fromNumber } = getTwilioEnv();
    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !credentials.length && "TWILIO_AUTH_TOKEN",
      !fromNumber && "TWILIO_FROM_NUMBER",
    ].filter(Boolean) as string[];
    return { twilioConfigured: missing.length === 0, missingVars: missing };
  }),

  placeCall: publicQuery
    .input(z.object({
      to: z.string(),
      name: z.string().default(""),
      address: z.string().default(""),
      voice: z.string().default("Polly.Joanna"),
    }))
    .mutation(async ({ input }) => {
      const result = await placeTwilioOutboundCall({
        to: input.to,
        name: input.name,
        address: input.address,
        appUrl: env.appUrl,
        voice: input.voice,
      });

      if (!result.sid) {
        throw new TRPCError({
          code: result.error?.includes("Missing env vars") ? "PRECONDITION_FAILED" : "BAD_GATEWAY",
          message: result.error ?? "Twilio call failed.",
        });
      }

      activeCalls.set(result.sid, { to: input.to, status: "ringing", startedAt: new Date() });
      return { sid: result.sid, status: "ringing" };
    }),

  hangUp: publicQuery
    .input(z.object({ sid: z.string() }))
    .mutation(async ({ input }) => {
      const { getTwilioEnv } = await import("../lib/twilio");
      const { accountSid, authUser, authSecret } = getTwilioEnv();
      if (!accountSid || !authUser || !authSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Twilio not configured" });
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${input.sid}.json`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${authUser}:${authSecret}`).toString("base64")}`,
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
