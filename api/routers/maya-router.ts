import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { placeTwilioOutboundCall, isTwilioConfigured } from "../lib/twilio";
import { env } from "../lib/env";

const VOICES = [
  { id: "Polly.Joanna", label: "Joanna", gender: "Female", style: "Warm & Professional" },
  { id: "Polly.Kendra", label: "Kendra", gender: "Female", style: "Bright & Clear" },
  { id: "Polly.Kimberly", label: "Kimberly", gender: "Female", style: "Friendly & Warm" },
  { id: "Polly.Salli", label: "Salli", gender: "Female", style: "Youthful & Casual" },
  { id: "Polly.Ivy", label: "Ivy", gender: "Female", style: "Soft & Gentle" },
  { id: "Polly.Matthew", label: "Matthew", gender: "Male", style: "Professional & Confident" },
  { id: "Polly.Joey", label: "Joey", gender: "Male", style: "Casual & Conversational" },
];

const activeCalls = new Map<string, { to: string; status: string; startedAt: Date }>();

export const mayaRouter = createRouter({
  listVoices: publicQuery.query(() => ({ voices: VOICES })),

  placeCall: publicQuery
    .input(z.object({
      to: z.string(),
      name: z.string().default(""),
      address: z.string().default(""),
      voice: z.string().default("Polly.Joanna"),
    }))
    .mutation(async ({ input }) => {
      if (!isTwilioConfigured()) {
        throw new Error("Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in Settings.");
      }
      const result = await placeTwilioOutboundCall({
        to: input.to,
        name: input.name,
        address: input.address,
        appUrl: env.appUrl,
      });
      if (!result?.sid) throw new Error("Call failed — no SID returned");
      activeCalls.set(result.sid, { to: input.to, status: "ringing", startedAt: new Date() });
      return { sid: result.sid, status: "ringing" };
    }),

  hangUp: publicQuery
    .input(z.object({ sid: z.string() }))
    .mutation(async ({ input }) => {
      const { getTwilioEnv } = await import("../lib/twilio");
      const { accountSid, authToken } = getTwilioEnv();
      if (!accountSid || !authToken) throw new Error("Twilio not configured");
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${input.sid}.json`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "Status=completed",
      });
      if (!resp.ok) throw new Error(`Twilio hangup failed: ${resp.status}`);
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
