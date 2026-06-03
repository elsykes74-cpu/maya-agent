import { z } from "zod";
import { eq, desc, sql, and, gte, lt } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { leads } from "../../db/schema";
import {
  computeLeadScore,
  scoreToMotivation,
  generateCallOpening,
  generateSMSOpener,
  generateOutreachAngle,
} from "../lib/lead-scorer";
import { sendAlert, formatLeadCard } from "../lib/telegram";

export const leadFinderRouter = createRouter({
  getStats: publicQuery.query(async () => {
    const db = getDb();

    const [hot, warm, nurture, low, byType] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(gte(leads.leadScore, 80)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(and(gte(leads.leadScore, 60), lt(leads.leadScore, 80))),
      db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(and(gte(leads.leadScore, 40), lt(leads.leadScore, 60))),
      db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(lt(leads.leadScore, 40)),
      db
        .select({ type: leads.leadType, count: sql<number>`count(*)` })
        .from(leads)
        .groupBy(leads.leadType)
        .orderBy(desc(sql<number>`count(*)`)),
    ]);

    return {
      hot: Number(hot[0]?.count ?? 0),
      warm: Number(warm[0]?.count ?? 0),
      nurture: Number(nurture[0]?.count ?? 0),
      low: Number(low[0]?.count ?? 0),
      byType,
    };
  }),

  getPriorityQueue: publicQuery
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
        minScore: z.number().optional(),
        leadType: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];

      if (input.minScore != null) {
        filters.push(gte(leads.leadScore, input.minScore));
      }
      if (input.leadType && input.leadType !== "all") {
        filters.push(
          eq(leads.leadType, input.leadType as NonNullable<typeof leads.$inferSelect.leadType>)
        );
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const [items, countResult] = await Promise.all([
        db.query.leads.findMany({
          where: whereClause,
          orderBy: [desc(leads.leadScore), desc(leads.updatedAt)],
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ count: sql<number>`count(*)` })
          .from(leads)
          .where(whereClause ?? sql`1=1`),
      ]);

      return { items, total: Number(countResult[0]?.count ?? 0) };
    }),

  recomputeScore: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, input.id) });
      if (!lead) throw new Error("Lead not found");

      const score = computeLeadScore(lead);
      const motivation = scoreToMotivation(score);

      await db
        .update(leads)
        .set({ leadScore: score, motivationLevel: motivation })
        .where(eq(leads.id, input.id));

      if (score >= 80) {
        const updated = await db.query.leads.findFirst({ where: eq(leads.id, input.id) });
        if (updated) {
          sendAlert(`🔥 <b>HOT LEAD SCORED</b>\n\n${formatLeadCard(updated)}`).catch(() => {});
        }
      }

      return { id: input.id, score, motivation };
    }),

  recomputeAllScores: publicQuery.mutation(async () => {
    const db = getDb();
    const allLeads = await db.query.leads.findMany();
    let hotCount = 0;
    let warmCount = 0;

    for (const lead of allLeads) {
      const score = computeLeadScore(lead);
      const motivation = scoreToMotivation(score);
      await db
        .update(leads)
        .set({ leadScore: score, motivationLevel: motivation })
        .where(eq(leads.id, lead.id));
      if (score >= 80) hotCount++;
      else if (score >= 60) warmCount++;
    }

    if (allLeads.length > 0) {
      sendAlert(
        `🔄 <b>Re-scored ${allLeads.length} leads</b>\n🔥 HOT: ${hotCount}  ⚡ WARM: ${warmCount}`
      ).catch(() => {});
    }

    return { updated: allLeads.length };
  }),

  generateOutreach: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, input.id) });
      if (!lead) throw new Error("Lead not found");

      const callOpening = generateCallOpening(lead.propertyAddress);
      const smsOpener = generateSMSOpener(lead.sellerName, lead.propertyAddress);
      const outreachAngle = generateOutreachAngle(lead.leadType);

      await db
        .update(leads)
        .set({ callOpening, smsOpener, outreachAngle })
        .where(eq(leads.id, input.id));

      return { callOpening, smsOpener, outreachAngle };
    }),

  generateAllOutreach: publicQuery.mutation(async () => {
    const db = getDb();
    // Only generate for leads that don't have outreach yet
    const pending = await db.query.leads.findMany({
      where: sql`${leads.callOpening} IS NULL`,
    });

    for (const lead of pending) {
      await db
        .update(leads)
        .set({
          callOpening: generateCallOpening(lead.propertyAddress),
          smsOpener: generateSMSOpener(lead.sellerName, lead.propertyAddress),
          outreachAngle: generateOutreachAngle(lead.leadType),
        })
        .where(eq(leads.id, lead.id));
    }

    return { generated: pending.length };
  }),

  exportCRM: publicQuery
    .input(
      z
        .object({
          minScore: z.number().optional(),
          leadType: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];

      if (input?.minScore != null) {
        filters.push(gte(leads.leadScore, input.minScore));
      }
      if (input?.leadType && input.leadType !== "all") {
        filters.push(
          eq(leads.leadType, input.leadType as NonNullable<typeof leads.$inferSelect.leadType>)
        );
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const items = await db.query.leads.findMany({
        where: whereClause,
        orderBy: [desc(leads.leadScore)],
        limit: 500,
      });

      return items.map((lead) => ({
        first_name: lead.sellerName.split(" ")[0] ?? lead.sellerName,
        last_name: lead.sellerName.split(" ").slice(1).join(" ") || "",
        property_address: lead.propertyAddress,
        mailing_address: lead.ownerMailingAddress ?? lead.propertyAddress,
        phone: lead.phone ?? "Needs skip trace.",
        email: lead.email ?? "Needs skip trace.",
        lead_type: lead.leadType ?? "other",
        lead_score: lead.leadScore ?? 0,
        lead_source: "Western Mass Bot",
        motivation: lead.motivationLevel ?? "cold",
        property_condition: lead.condition ?? "",
        estimated_value: lead.estimatedValue ?? "",
        estimated_arv: lead.arv ?? "",
        estimated_repairs: lead.estimatedRepairs ?? "",
        call_opening: lead.callOpening ?? "",
        sms_opener: lead.smsOpener ?? "",
        notes: lead.notes ?? "",
        next_follow_up_date: lead.nextFollowUpDate?.toISOString() ?? "",
        status: lead.pipelineStage ?? "lead",
      }));
    }),
});
