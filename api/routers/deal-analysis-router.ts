import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { leads } from "../../db/schema";

export const dealAnalysisRouter = createRouter({
  calculateMAO: publicQuery
    .input(z.object({
      arv: z.number().positive(),
      estimatedRepairs: z.number().min(0),
      assignmentFee: z.number().min(0).default(5000),
      profitPercentage: z.number().min(0).max(1).default(0.70),
    }))
    .query(({ input }) => {
      const mao = (input.arv * input.profitPercentage) - input.estimatedRepairs - input.assignmentFee;
      const maxOffer = Math.max(0, mao);
      
      return {
        arv: input.arv,
        estimatedRepairs: input.estimatedRepairs,
        assignmentFee: input.assignmentFee,
        profitPercentage: input.profitPercentage,
        mao: maxOffer,
        formula: `(${input.arv} × ${input.profitPercentage}) - ${input.estimatedRepairs} - ${input.assignmentFee} = ${maxOffer}`,
      };
    }),

  updateLeadDeal: publicQuery
    .input(z.object({
      leadId: z.number(),
      arv: z.string().optional(),
      estimatedRepairs: z.string().optional(),
      mao: z.string().optional(),
      assignmentFee: z.string().optional(),
      askingPrice: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { leadId, ...data } = input;
      await db.update(leads).set(data).where(eq(leads.id, leadId));
      return { success: true };
    }),

  getLeadAnalysis: publicQuery
    .input(z.object({ leadId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, input.leadId),
      });
      if (!lead) throw new Error("Lead not found");
      
      const arv = Number(lead.arv ?? 0);
      const repairs = Number(lead.estimatedRepairs ?? 0);
      const assignmentFee = Number(lead.assignmentFee ?? 5000);
      const mao = (arv * 0.70) - repairs - assignmentFee;
      const askingPrice = Number(lead.askingPrice ?? 0);
      
      return {
        lead,
        analysis: {
          arv,
          estimatedRepairs: repairs,
          assignmentFee,
          mao: Math.max(0, mao),
          askingPrice,
          spread: askingPrice > 0 ? askingPrice - mao : null,
          viable: askingPrice > 0 ? mao >= askingPrice * 0.5 : null,
        },
      };
    }),
});
