import { z } from "zod";
import { eq, desc, and, lte, gte, like, or } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { buyers, buyerCriteria, leads } from "../../db/schema";
import { matchBuyersToLead } from "../lib/buyer-matcher";

export const buyersRouter = createRouter({
  list: publicQuery
    .input(z.object({
      status: z.enum(["active","inactive","closed"]).optional(),
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      if (input?.status) filters.push(eq(buyers.status, input.status));
      const items = await db.query.buyers.findMany({
        where: filters.length > 0 ? and(...filters) : eq(buyers.status, "active"),
        orderBy: [desc(buyers.totalPurchases), desc(buyers.lastPurchaseDate)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
      return { items };
    }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const buyer = await db.query.buyers.findFirst({ where: eq(buyers.id, input.id) });
      if (!buyer) throw new Error("Buyer not found");
      const criteria = await db.query.buyerCriteria.findMany({
        where: eq(buyerCriteria.buyerId, input.id),
      });
      return { buyer, criteria };
    }),

  create: publicQuery
    .input(z.object({
      name: z.string().min(1),
      company: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [created] = await db.insert(buyers).values(input as any).returning({ id: buyers.id });
      return { id: created.id, success: true };
    }),

  update: publicQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      company: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      status: z.enum(["active","inactive","closed"]).optional(),
      notes: z.string().optional(),
      totalPurchases: z.number().optional(),
      lastPurchaseDate: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, lastPurchaseDate, ...rest } = input;
      await db.update(buyers).set({
        ...rest,
        lastPurchaseDate: lastPurchaseDate ? new Date(lastPurchaseDate) : undefined,
      } as any).where(eq(buyers.id, id));
      return { success: true };
    }),

  setCriteria: publicQuery
    .input(z.object({
      buyerId: z.number(),
      zipCodes: z.string().optional(),
      cities: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      minBeds: z.number().optional(),
      maxBeds: z.number().optional(),
      minBaths: z.number().optional(),
      maxBaths: z.number().optional(),
      minSqft: z.number().optional(),
      maxSqft: z.number().optional(),
      propertyTypes: z.string().optional(),
      minArv: z.number().optional(),
      maxArv: z.number().optional(),
      prefersVacant: z.boolean().optional(),
      prefersOffMarket: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const buyer = await db.query.buyers.findFirst({ where: eq(buyers.id, input.buyerId) });
      if (!buyer) throw new Error("Buyer not found");
      const existing = await db.query.buyerCriteria.findFirst({
        where: eq(buyerCriteria.buyerId, input.buyerId),
      });
      const vals: any = {
        buyerId: input.buyerId,
        zipCodes: input.zipCodes,
        cities: input.cities,
        minPrice: input.minPrice ? String(input.minPrice) : undefined,
        maxPrice: input.maxPrice ? String(input.maxPrice) : undefined,
        minBeds: input.minBeds,
        maxBeds: input.maxBeds,
        minBaths: input.minBaths ? String(input.minBaths) : undefined,
        maxBaths: input.maxBaths ? String(input.maxBaths) : undefined,
        minSqft: input.minSqft,
        maxSqft: input.maxSqft,
        propertyTypes: input.propertyTypes,
        minArv: input.minArv ? String(input.minArv) : undefined,
        maxArv: input.maxArv ? String(input.maxArv) : undefined,
        prefersVacant: input.prefersVacant,
        prefersOffMarket: input.prefersOffMarket,
        notes: input.notes,
      };
      if (existing) {
        await db.update(buyerCriteria).set(vals).where(eq(buyerCriteria.id, existing.id));
        return { id: existing.id, success: true };
      }
      const [created] = await db.insert(buyerCriteria).values(vals).returning({ id: buyerCriteria.id });
      return { id: created.id, success: true };
    }),

  // Match a lead against all active buyers' buy boxes
  findMatches: publicQuery
    .input(z.object({ leadId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, input.leadId) });
      if (!lead) throw new Error("Lead not found");
      const matches = await matchBuyersToLead(input.leadId, db);
      return {
        matches: matches.map((m) => ({
          buyer: { id: m.buyerId, name: m.buyerName, company: m.company, phone: m.phone },
          score: m.score,
          reasons: m.reasons,
        })),
      };
    }),
});
