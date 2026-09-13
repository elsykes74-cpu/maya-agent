import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import {
  createVapiTestCall,
  endVapiCall,
  getVapiCallStatus,
  isVapiConfigured,
} from "../lib/vapi";

// Legacy voice list kept for API compatibility; VAPI test calls use Maya's
// configured assistant voice, so the dashboard no longer offers a selector.
const VOICES = [
  { id: "maya-default", label: "Maya", gender: "Female", style: "Configured VAPI voice" },
];

const activeCalls = new Map<string, { to: string; status: string; startedAt: Date }>();

function mapVapiStatus(s: string): "idle" | "ringing" | "in_progress" | "completed" {
  const v = s.toLowerCase();
  if (v === "in-progress" || v === "forwarding") return "in_progress";
  if (v === "ended") return "completed";
  if (v === "queued" || v === "ringing") return "ringing";
  return "idle";
}

export const mayaRouter = createRouter({
  listVoices: publicQuery.query(() => ({ voices: VOICES })),

  checkConfig: publicQuery.query(async () => {
    const vapiConfigured = await isVapiConfigured();
    return {
      vapiConfigured,
      // Kept for older clients that read twilioConfigured.
      twilioConfigured: vapiConfigured,
      missingVars: vapiConfigured ? [] : ["VAPI_API_KEY"],
    };
  }),

  placeCall: publicQuery
    .input(z.object({
      to: z.string(),
      name: z.string().default(""),
      address: z.string().default(""),
      voice: z.string().default("maya-default"),
    }))
    .mutation(async ({ input }) => {
      const digits = input.to.replace(/\D/g, "");
      if (digits.length < 10) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid 10-digit phone number." });
      }
      const call = await createVapiTestCall(input.to, input.name);
      if (!call) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "VAPI call failed — check the VAPI API key and assistant in calling config.",
        });
      }
      activeCalls.set(call.id, { to: input.to, status: "ringing", startedAt: new Date() });
      return { sid: call.id, status: "ringing" };
    }),

  hangUp: publicQuery
    .input(z.object({ sid: z.string() }))
    .mutation(async ({ input }) => {
      // Best-effort: VAPI DELETE cancels queued calls; a live test call ends
      // on its own via maxDurationSeconds if this misses.
      await endVapiCall(input.sid).catch(() => false);
      activeCalls.delete(input.sid);
      return { success: true };
    }),

  getTranscript: publicQuery
    .input(z.object({ sid: z.string().optional() }))
    .query(async ({ input }) => {
      if (!input.sid) return { transcript: null, status: "idle" as const };
      const live = await getVapiCallStatus(input.sid).catch(() => null);
      if (!live) {
        const call = activeCalls.get(input.sid);
        return { transcript: null, status: call?.status ?? "idle" };
      }
      if (live.status.toLowerCase() === "ended") activeCalls.delete(input.sid);
      return { transcript: live.transcript, status: mapVapiStatus(live.status) };
    }),
});
