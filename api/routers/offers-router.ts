import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { offers, activities, leads } from "../../db/schema";

const OFFER_STATUS = z.enum(["draft","submitted","countered","accepted","rejected","expired","withdrawn"]);

export const offersRouter = createRouter({
  list: publicQuery
    .input(z.object({
      leadId: z.number().optional(),
      status: OFFER_STATUS.optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      if (input?.leadId) filters.push(eq(offers.leadId, input.leadId));
      if (input?.status) filters.push(eq(offers.status, input.status));
      const items = await db.query.offers.findMany({
        where: filters.length > 0 ? (filters.length === 1 ? filters[0] : undefined) : undefined,
        orderBy: [desc(offers.createdAt)],
        limit: input?.limit ?? 50,
      });
      return { items };
    }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const offer = await db.query.offers.findFirst({ where: eq(offers.id, input.id) });
      if (!offer) throw new Error("Offer not found");
      return offer;
    }),

  create: publicQuery
    .input(z.object({
      leadId: z.number(),
      offerAmount: z.number(),
      arvUsed: z.number().optional(),
      repairEstimate: z.number().optional(),
      assignmentFee: z.number().optional(),
      notes: z.string().optional(),
      expiresAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, input.leadId) });
      if (!lead) throw new Error("Lead not found");
      const [created] = await db.insert(offers).values({
        leadId: input.leadId,
        offerAmount: String(input.offerAmount),
        arvUsed: input.arvUsed ? String(input.arvUsed) : undefined,
        repairEstimate: input.repairEstimate ? String(input.repairEstimate) : undefined,
        assignmentFee: input.assignmentFee ? String(input.assignmentFee) : undefined,
        notes: input.notes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        status: "draft",
      } as any).returning({ id: offers.id });
      await db.insert(activities).values({
        leadId: input.leadId,
        type: "offer",
        body: `💰 Offer created: $${input.offerAmount.toLocaleString()}${input.arvUsed ? ` (ARV $${input.arvUsed.toLocaleString()})` : ""}`,
        linkedTable: "offers",
        linkedId: created.id,
        metadata: JSON.stringify({ offerAmount: input.offerAmount, arvUsed: input.arvUsed, assignmentFee: input.assignmentFee }),
      } as any);
      return { id: created.id, success: true };
    }),

  updateStatus: publicQuery
    .input(z.object({
      id: z.number(),
      status: OFFER_STATUS,
      counterAmount: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const offer = await db.query.offers.findFirst({ where: eq(offers.id, input.id) });
      if (!offer) throw new Error("Offer not found");
      const now = new Date();
      await db.update(offers).set({
        status: input.status,
        counterAmount: input.counterAmount ? String(input.counterAmount) : offer.counterAmount,
        notes: input.notes ?? offer.notes,
        submittedAt: input.status === "submitted" ? now : offer.submittedAt,
        respondedAt: ["accepted","rejected","countered"].includes(input.status) ? now : offer.respondedAt,
      } as any).where(eq(offers.id, input.id));
      const statusLabels: Record<string, string> = {
        submitted: "📤 Offer submitted",
        accepted: "🎉 Offer ACCEPTED",
        rejected: "❌ Offer rejected",
        countered: `🔄 Seller countered at $${input.counterAmount?.toLocaleString() ?? "?"}`,
        withdrawn: "↩️ Offer withdrawn",
        expired: "⏰ Offer expired",
      };
      await db.insert(activities).values({
        leadId: offer.leadId,
        type: "offer",
        body: statusLabels[input.status] ?? `Offer status → ${input.status}`,
        linkedTable: "offers",
        linkedId: offer.id,
        metadata: JSON.stringify({ status: input.status, counterAmount: input.counterAmount }),
      } as any);
      return { success: true };
    }),
});
