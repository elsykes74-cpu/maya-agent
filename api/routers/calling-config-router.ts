import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { callingConfig } from "../../db/schema";

export const callingConfigRouter = createRouter({
  get: publicQuery.query(async () => {
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
  }),

  update: publicQuery
    .input(z.object({
      id: z.number(),
      provider: z.enum(["vapi", "bland", "retell", "custom"]).optional(),
      apiKey: z.string().optional(),
      apiEndpoint: z.string().optional(),
      assistantId: z.string().optional(),
      fromPhoneNumber: z.string().optional(),
      maxDailyCalls: z.number().optional(),
      callWindowStart: z.string().optional(),
      callWindowEnd: z.string().optional(),
      timezone: z.string().optional(),
      voicemailEnabled: z.boolean().optional(),
      smsFollowUpEnabled: z.boolean().optional(),
      scrubDncBeforeCall: z.boolean().optional(),
      scrubLitigants: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(callingConfig).set(data).where(eq(callingConfig.id, id));
      return { success: true };
    }),
});
