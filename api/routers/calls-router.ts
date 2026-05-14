import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { calls } from "../../db/schema";

export const callsRouter = createRouter({
  list: publicQuery
    .input(
      z.object({
        leadId: z.number().optional(),
        outcome: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      
      if (input?.leadId) {
        filters.push(eq(calls.leadId, input.leadId));
      }
      if (input?.outcome && input.outcome !== "all") {
        filters.push(eq(calls.callOutcome, input.outcome as NonNullable<typeof calls.$inferSelect.callOutcome>));
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const items = await db.query.calls.findMany({
        where: whereClause,
        orderBy: [desc(calls.createdAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });

      return { items };
    }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const call = await db.query.calls.findFirst({
        where: eq(calls.id, input.id),
      });
      if (!call) throw new Error("Call not found");
      return call;
    }),

  create: publicQuery
    .input(z.object({
      leadId: z.number(),
      callType: z.enum(["initial", "follow_up", "appointment_confirmation", "voicemail"]).default("initial"),
      callOutcome: z.enum(["answered", "voicemail", "no_answer", "busy", "wrong_number", "disconnected", "callback_requested", "appointment_set", "not_interested", "dnc"]),
      duration: z.number().optional(),
      scriptUsed: z.string().optional(),
      notes: z.string().optional(),
      painSignals: z.string().optional(),
      priceDiscussed: z.boolean().default(false),
      sellerAskingPrice: z.string().optional(),
      voicemailLeft: z.boolean().default(false),
      smsSent: z.boolean().default(false),
      appointmentSet: z.boolean().default(false),
      appointmentDate: z.date().optional(),
      callRecordingUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(calls).values({
        ...input,
        sellerAskingPrice: input.sellerAskingPrice ? String(input.sellerAskingPrice) : null,
      });
      return { id: Number(result[0].insertId), success: true };
    }),

  update: publicQuery
    .input(z.object({
      id: z.number(),
      callOutcome: z.enum(["answered", "voicemail", "no_answer", "busy", "wrong_number", "disconnected", "callback_requested", "appointment_set", "not_interested", "dnc"]).optional(),
      duration: z.number().optional(),
      notes: z.string().optional(),
      painSignals: z.string().optional(),
      priceDiscussed: z.boolean().optional(),
      sellerAskingPrice: z.string().optional(),
      voicemailLeft: z.boolean().optional(),
      smsSent: z.boolean().optional(),
      appointmentSet: z.boolean().optional(),
      appointmentDate: z.date().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(calls).set(data).where(eq(calls.id, id));
      return { success: true };
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(calls).where(eq(calls.id, input.id));
      return { success: true };
    }),

  stats: publicQuery.query(async () => {
    const db = getDb();
    const total = await db.select({ count: sql<number>`count(*)` }).from(calls);
    const answered = await db.select({ count: sql<number>`count(*)` }).from(calls).where(eq(calls.callOutcome, "answered"));
    const voicemail = await db.select({ count: sql<number>`count(*)` }).from(calls).where(eq(calls.callOutcome, "voicemail"));
    const appointments = await db.select({ count: sql<number>`count(*)` }).from(calls).where(eq(calls.appointmentSet, true));
    
    return {
      total: total[0]?.count ?? 0,
      answered: answered[0]?.count ?? 0,
      voicemail: voicemail[0]?.count ?? 0,
      appointments: appointments[0]?.count ?? 0,
    };
  }),
});
