import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { leads, leadSources, leadProfiles } from "../../db/schema";

export const leadsRouter = createRouter({
  list: publicQuery
    .input(
      z.object({
        stage: z.string().optional(),
        motivation: z.string().optional(),
        search: z.string().optional(),
        profileId: z.number().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      
      if (input?.stage && input.stage !== "all") {
        filters.push(eq(leads.pipelineStage, input.stage as NonNullable<typeof leads.$inferSelect.pipelineStage>));
      }
      if (input?.motivation && input.motivation !== "all") {
        filters.push(eq(leads.motivationLevel, input.motivation as NonNullable<typeof leads.$inferSelect.motivationLevel>));
      }
      if (input?.profileId) {
        filters.push(eq(leads.profileId, input.profileId));
      }
      if (input?.search) {
        const searchTerm = `%${input.search}%`;
        filters.push(
          sql`(${leads.sellerName} LIKE ${searchTerm} OR ${leads.propertyAddress} LIKE ${searchTerm} OR ${leads.phone} LIKE ${searchTerm})`
        );
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const items = await db.query.leads.findMany({
        where: whereClause,
        orderBy: [desc(leads.updatedAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(whereClause ?? sql`1=1`);

      return { items, total: countResult[0]?.count ?? 0 };
    }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, input.id),
      });
      if (!lead) throw new Error("Lead not found");
      return lead;
    }),

  create: publicQuery
    .input(z.object({
      sellerName: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      propertyAddress: z.string().min(1),
      city: z.string().optional(),
      state: z.string().default("MA"),
      zipCode: z.string().optional(),
      sourceId: z.number().optional(),
      profileId: z.number().optional(),
      motivationLevel: z.enum(["hot", "warm", "cold"]).default("cold"),
      timeline: z.string().optional(),
      occupancyStatus: z.enum(["owner_occupied", "tenant", "vacant"]).optional(),
      condition: z.enum(["light_rehab", "medium_rehab", "heavy_rehab", "move_in_ready"]).optional(),
      estimatedRepairs: z.string().optional(),
      beds: z.number().optional(),
      baths: z.string().optional(),
      squareFootage: z.number().optional(),
      askingPrice: z.string().optional(),
      arv: z.string().optional(),
      mao: z.string().optional(),
      assignmentFee: z.string().default("5000"),
      keyPainPoints: z.string().optional(),
      objectionsRaised: z.string().optional(),
      pipelineStage: z.enum(["lead", "outreach", "scoring", "hot_routing", "warm_nurture", "cold_drip", "appointment", "close"]).default("lead"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(leads).values({
        ...input,
        estimatedRepairs: input.estimatedRepairs ? String(input.estimatedRepairs) : "0",
        askingPrice: input.askingPrice ? String(input.askingPrice) : null,
        arv: input.arv ? String(input.arv) : null,
        mao: input.mao ? String(input.mao) : null,
        assignmentFee: input.assignmentFee ? String(input.assignmentFee) : "5000",
        callCount: 0,
        smsCount: 0,
      });
      return { id: Number(result[0].insertId), success: true };
    }),

  update: publicQuery
    .input(z.object({
      id: z.number(),
      sellerName: z.string().min(1).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      propertyAddress: z.string().min(1).optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
      sourceId: z.number().optional(),
      profileId: z.number().optional(),
      motivationLevel: z.enum(["hot", "warm", "cold"]).optional(),
      timeline: z.string().optional(),
      occupancyStatus: z.enum(["owner_occupied", "tenant", "vacant"]).optional(),
      condition: z.enum(["light_rehab", "medium_rehab", "heavy_rehab", "move_in_ready"]).optional(),
      estimatedRepairs: z.string().optional(),
      beds: z.number().optional(),
      baths: z.string().optional(),
      squareFootage: z.number().optional(),
      askingPrice: z.string().optional(),
      arv: z.string().optional(),
      mao: z.string().optional(),
      assignmentFee: z.string().optional(),
      keyPainPoints: z.string().optional(),
      objectionsRaised: z.string().optional(),
      pipelineStage: z.enum(["lead", "outreach", "scoring", "hot_routing", "warm_nurture", "cold_drip", "appointment", "close"]).optional(),
      appointmentSet: z.boolean().optional(),
      appointmentDate: z.date().optional(),
      appointmentTime: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(leads).set(data).where(eq(leads.id, id));
      return { success: true };
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(leads).where(eq(leads.id, input.id));
      return { success: true };
    }),

  stats: publicQuery.query(async () => {
    const db = getDb();
    
    const hot = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.motivationLevel, "hot"));
    const warm = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.motivationLevel, "warm"));
    const cold = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.motivationLevel, "cold"));
    const total = await db.select({ count: sql<number>`count(*)` }).from(leads);
    const appointmentsCount = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.appointmentSet, true));
    
    const byStage = await db
      .select({ stage: leads.pipelineStage, count: sql<number>`count(*)` })
      .from(leads)
      .groupBy(leads.pipelineStage);

    return {
      hot: hot[0]?.count ?? 0,
      warm: warm[0]?.count ?? 0,
      cold: cold[0]?.count ?? 0,
      total: total[0]?.count ?? 0,
      appointments: appointmentsCount[0]?.count ?? 0,
      byStage,
    };
  }),

  sources: publicQuery.query(async () => {
    const db = getDb();
    return db.query.leadSources.findMany({
      orderBy: [desc(leadSources.createdAt)],
    });
  }),

  profiles: publicQuery.query(async () => {
    const db = getDb();
    return db.query.leadProfiles.findMany({
      orderBy: [desc(leadProfiles.priority)],
    });
  }),
});
