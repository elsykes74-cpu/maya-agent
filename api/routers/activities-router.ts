import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { activities, leads } from "../../db/schema";

export const activitiesRouter = createRouter({
  list: publicQuery
    .input(z.object({
      leadId: z.number(),
      type: z.enum(["call","sms","email","note","visit","offer","appointment","status_change","system"]).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [eq(activities.leadId, input.leadId)];
      if (input.type) filters.push(eq(activities.type, input.type));
      const items = await db.query.activities.findMany({
        where: and(...filters),
        orderBy: [desc(activities.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });
      return { items };
    }),

  create: publicQuery
    .input(z.object({
      leadId: z.number(),
      type: z.enum(["call","sms","email","note","visit","offer","appointment","status_change","system"]).default("note"),
      body: z.string().min(1),
      linkedTable: z.string().optional(),
      linkedId: z.number().optional(),
      metadata: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, input.leadId) });
      if (!lead) throw new Error("Lead not found");
      const [created] = await db.insert(activities).values(input as any).returning({ id: activities.id });
      return { id: created.id, success: true };
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(activities).where(eq(activities.id, input.id));
      return { success: true };
    }),
});
