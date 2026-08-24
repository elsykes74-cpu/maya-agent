import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { dncList, scrubLists, scrubListEntries } from "../../db/schema";

export const dncRouter = createRouter({
  list: publicQuery
    .input(z.object({ search: z.string().optional(), reason: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      if (input?.search) {
        filters.push(sql`${dncList.phone} LIKE ${`%${input.search}%`} OR ${dncList.name} LIKE ${`%${input.search}%`}`);
      }
      if (input?.reason && input.reason !== "all") {
        filters.push(eq(dncList.reason, input.reason as any));
      }
      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      const items = await db.query.dncList.findMany({
        where: whereClause,
        orderBy: [desc(dncList.createdAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
      const total = await db.select({ count: sql<number>`count(*)` }).from(dncList).where(whereClause ?? sql`1=1`);
      return { items, total: total[0]?.count ?? 0 };
    }),

  check: publicQuery
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const entry = await db.query.dncList.findFirst({ where: eq(dncList.phone, input.phone) });
      return { blocked: !!entry, entry };
    }),

  add: publicQuery
    .input(z.object({
      phone: z.string().min(1),
      name: z.string().optional(),
      reason: z.enum(["seller_request", "national_registry", "litigant", "disconnected", "manual"]).default("manual"),
      source: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      // Remove non-digits and format
      const cleanPhone = input.phone.replace(/\D/g, "");
      const [created] = await db
        .insert(dncList)
        .values({ ...input, phone: cleanPhone })
        .returning({ id: dncList.id });
      return { id: created.id, success: true };
    }),

  remove: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(dncList).where(eq(dncList.id, input.id));
      return { success: true };
    }),

  bulkImport: publicQuery
    .input(z.object({
      numbers: z.array(z.string()),
      reason: z.enum(["seller_request", "national_registry", "litigant", "disconnected", "manual"]).default("manual"),
      source: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      let added = 0;
      let skipped = 0;
      for (const phone of input.numbers) {
        const cleanPhone = phone.replace(/\D/g, "");
        if (cleanPhone.length < 10) { skipped++; continue; }
        const existing = await db.query.dncList.findFirst({ where: eq(dncList.phone, cleanPhone) });
        if (!existing) {
          await db.insert(dncList).values({ phone: cleanPhone, reason: input.reason, source: input.source });
          added++;
        } else {
          skipped++;
        }
      }
      return { added, skipped };
    }),

  stats: publicQuery.query(async () => {
    const db = getDb();
    const total = await db.select({ count: sql<number>`count(*)` }).from(dncList);
    const byReason = await db.select({ reason: dncList.reason, count: sql<number>`count(*)` }).from(dncList).groupBy(dncList.reason);
    return { total: total[0]?.count ?? 0, byReason };
  }),

  scrubLists: publicQuery.query(async () => {
    const db = getDb();
    return db.query.scrubLists.findMany({
      orderBy: [desc(scrubLists.createdAt)],
      with: { entries: true },
    });
  }),

  createScrubList: publicQuery
    .input(z.object({
      name: z.string().min(1),
      listType: z.enum(["dnc", "litigant", "disconnected", "custom"]).default("custom"),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [created] = await db
        .insert(scrubLists)
        .values(input)
        .returning({ id: scrubLists.id });
      return { id: created.id, success: true };
    }),

  addScrubEntry: publicQuery
    .input(z.object({
      scrubListId: z.number(),
      phone: z.string().min(1),
      name: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const cleanPhone = input.phone.replace(/\D/g, "");
      const [created] = await db
        .insert(scrubListEntries)
        .values({ ...input, phone: cleanPhone })
        .returning({ id: scrubListEntries.id });
      return { id: created.id, success: true };
    }),
});
