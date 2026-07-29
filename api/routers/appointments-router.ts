import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { appointments } from "../../db/schema";

export const appointmentsRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        status: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      
      if (input?.status && input.status !== "all") {
        filters.push(eq(appointments.status, input.status as NonNullable<typeof appointments.$inferSelect.status>));
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const items = await db.query.appointments.findMany({
        where: whereClause,
        orderBy: [desc(appointments.scheduledDate)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });

      return { items };
    }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const appt = await db.query.appointments.findFirst({
        where: eq(appointments.id, input.id),
      });
      if (!appt) throw new Error("Appointment not found");
      return appt;
    }),

  create: authedQuery
    .input(z.object({
      leadId: z.number(),
      scheduledDate: z.date(),
      scheduledTime: z.string().min(1),
      duration: z.number().default(30),
      appointmentType: z.enum(["walkthrough", "phone_call", "video_call"]).default("walkthrough"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [created] = await db.insert(appointments).values(input).returning({ id: appointments.id });
      if (!created) throw new Error("Insert failed");
      return { id: created.id, success: true };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      scheduledDate: z.date().optional(),
      scheduledTime: z.string().optional(),
      duration: z.number().optional(),
      appointmentType: z.enum(["walkthrough", "phone_call", "video_call"]).optional(),
      status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
      notes: z.string().optional(),
      maoPresented: z.string().optional(),
      contractSigned: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(appointments).set(data).where(eq(appointments.id, id));
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(appointments).where(eq(appointments.id, input.id));
      return { success: true };
    }),

  stats: authedQuery.query(async () => {
    const db = getDb();
    const total = await db.select({ count: sql<number>`count(*)` }).from(appointments);
    const scheduled = await db.select({ count: sql<number>`count(*)` }).from(appointments).where(eq(appointments.status, "scheduled"));
    const completed = await db.select({ count: sql<number>`count(*)` }).from(appointments).where(eq(appointments.status, "completed"));
    const contracts = await db.select({ count: sql<number>`count(*)` }).from(appointments).where(eq(appointments.contractSigned, true));
    
    return {
      total: total[0]?.count ?? 0,
      scheduled: scheduled[0]?.count ?? 0,
      completed: completed[0]?.count ?? 0,
      contracts: contracts[0]?.count ?? 0,
    };
  }),
});
