import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { smsLogs, smsTemplates } from "../../db/schema";

export const smsRouter = createRouter({
  list: publicQuery
    .input(
      z.object({
        leadId: z.number().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      
      if (input?.leadId) {
        filters.push(eq(smsLogs.leadId, input.leadId));
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const items = await db.query.smsLogs.findMany({
        where: whereClause,
        orderBy: [desc(smsLogs.createdAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });

      return { items };
    }),

  create: publicQuery
    .input(z.object({
      leadId: z.number(),
      sequenceDay: z.number().default(0),
      messageContent: z.string().min(1),
      direction: z.enum(["outbound", "inbound"]).default("outbound"),
      status: z.enum(["sent", "delivered", "failed", "replied"]).default("sent"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(smsLogs).values(input);
      return { id: Number(result[0].insertId), success: true };
    }),

  updateReply: publicQuery
    .input(z.object({
      id: z.number(),
      replyContent: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(smsLogs)
        .set({
          replyContent: input.replyContent,
          status: "replied",
          repliedAt: new Date(),
        })
        .where(eq(smsLogs.id, input.id));
      return { success: true };
    }),

  templates: publicQuery.query(async () => {
    const db = getDb();
    return db.query.smsTemplates.findMany({
      orderBy: [desc(smsTemplates.day)],
    });
  }),

  createTemplate: publicQuery
    .input(z.object({
      name: z.string().min(1),
      day: z.number().default(0),
      content: z.string().min(1),
      description: z.string().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(smsTemplates).values(input);
      return { id: Number(result[0].insertId), success: true };
    }),

  updateTemplate: publicQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      day: z.number().optional(),
      content: z.string().min(1).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(smsTemplates).set(data).where(eq(smsTemplates.id, id));
      return { success: true };
    }),

  deleteTemplate: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(smsTemplates).where(eq(smsTemplates.id, input.id));
      return { success: true };
    }),
});
