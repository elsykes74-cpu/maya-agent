import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { smsLogs, smsTemplates } from "../../db/schema";
import { leads, campaignLeads, dncList } from "../../db/schema";

export const smsRouter = createRouter({
  list: authedQuery
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
      if (input?.leadId) { filters.push(eq(smsLogs.leadId, input.leadId)); }
      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      const items = await db.query.smsLogs.findMany({
        where: whereClause,
        orderBy: [desc(smsLogs.createdAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
      return { items };
    }),

  create: authedQuery
    .input(z.object({
      leadId: z.number(),
      sequenceDay: z.number().default(0),
      messageContent: z.string().min(1),
      direction: z.enum(["outbound", "inbound"]).default("outbound"),
      status: z.enum(["sent", "delivered", "failed", "replied"]).default("sent"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [created] = await db.insert(smsLogs).values(input).returning({ id: smsLogs.id });
      if (!created) throw new Error("Insert failed");
      return { id: created.id, success: true };
    }),

  updateReply: authedQuery
    .input(z.object({
      id: z.number(),
      replyContent: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(smsLogs)
        .set({ replyContent: input.replyContent, status: "replied", repliedAt: new Date() })
        .where(eq(smsLogs.id, input.id));
      return { success: true };
    }),

  templates: authedQuery.query(async () => {
    const db = getDb();
    return db.query.smsTemplates.findMany({
      orderBy: [desc(smsTemplates.day)],
    });
  }),

  createTemplate: authedQuery
    .input(z.object({
      name: z.string().min(1),
      day: z.number().default(0),
      content: z.string().min(1),
      description: z.string().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [created] = await db.insert(smsTemplates).values(input).returning({ id: smsTemplates.id });
      if (!created) throw new Error("Insert failed");
      return { id: created.id, success: true };
    }),

  updateTemplate: authedQuery
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

  deleteTemplate: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(smsTemplates).where(eq(smsTemplates.id, input.id));
      return { success: true };
    }),

  // ── Absorbed from Kimi automated_outreach_agent ──────────────────────────────
  // 1. Bulk-send SMS to all pending campaign_leads for a campaign.
  //    day=0 → "Initial Outreach", day=2 → "Day 2 – Follow-up",
  //    day=5 → "Day 5 – Second Follow-up", day=10 → "Day 10 – Breakup / Final Message"
  sendCampaignSms: authedQuery
    .input(z.object({ campaignId: z.number(), templateDay: z.number().default(0) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { campaignId, templateDay } = input;

      let tplName: string;
      if      (templateDay >= 10)  tplName = "Day 10 - Breakup / Final Message";
      else if (templateDay >= 5)   tplName = "Day 5 - Second Follow-up";
      else if (templateDay >= 2)   tplName = "Day 2 - Follow-up";
      else                         tplName = "Day 0 - Initial Outreach";

      const template = await db.query.smsTemplates.findFirst({
        where: eq(smsTemplates.name, tplName),
      });
      if (!template) throw new Error(`SMS template not found: ${tplName}`);

      const clRows = await db.query.campaignLeads.findMany({
        where: and(
          eq(campaignLeads.campaignId, campaignId),
          eq(campaignLeads.status, "pending")
        ),
        with: { lead: { columns: { id: true, phone: true, sellerName: true } } },
      });

      let sent = 0;
      for (const cl of clRows) {
        if (!cl.lead?.phone) continue;
        const name    = (cl.lead.sellerName || "there").split(" ")[0];
        const content = (template as any).content
          .replace(/{name}/g, name)
          .replace(/{address}/g, "");

        await db.insert(smsLogs).values({
          leadId:        cl.lead.id,
          sequenceDay:   templateDay,
          messageContent: content,
          direction:     "outbound",
          status:        "sent",
        });
        await db.update(campaignLeads)
          .set({ lastAttemptAt: new Date() })
          .where(eq(campaignLeads.id, cl.id));
        sent++;
      }
      return { sent, template: tplName };
    }),

  // 2. Handle inbound SMS reply — auto-categorise lead status.
  //    STOP / unsubscribe → DNC list + cold_drip
  //    positive keywords   → outreach
  //    negative keywords   → cold_drip
  handleReply: authedQuery
    .input(z.object({
      leadId:    z.number(),
      fromPhone: z.string().min(10),
      body:      z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { leadId, fromPhone, body } = input;
      const lower = body.toLowerCase().trim();
      const cleanPhone = fromPhone.replace(/\D/g, "");

      // Classify
      let category: "dnc" | "responded" | "not_interested";
      if (/\bstop\b|\bunsubscribe\b|\bremove me\b/.test(lower)) {
        category = "dnc";
        await db.update(leads)
          .set({ pipelineStage: "cold_drip" })
          .where(eq(leads.id, leadId));
        await db.insert(dncList).values({
          phone: cleanPhone,
          reason: "seller_request",
          source: "sms_reply",
          notes: `SMS STOP reply from lead ${leadId}`,
        }).onConflictDoUpdate({
          target: dncList.phone,
          set: { notes: `SMS STOP reply from lead ${leadId}` },
        });
      } else if (/\b(yes|interested|call me|sounds good|sure|great|let's talk|when can|available)\b/.test(lower)) {
        category = "responded";
        await db.update(leads)
          .set({ pipelineStage: "outreach", notes: `SMS reply: ${body}` })
          .where(eq(leads.id, leadId));
      } else if (/\b(no|not interested|wrong|delete|remove|nope|nah)\b/.test(lower)) {
        category = "not_interested";
        await db.update(leads)
          .set({ pipelineStage: "cold_drip" })
          .where(eq(leads.id, leadId));
      } else {
        category = "responded";
        await db.update(leads)
          .set({ pipelineStage: "outreach", notes: `SMS reply: ${body}` })
          .where(eq(leads.id, leadId));
      }

      // Log inbound message
      await db.insert(smsLogs).values({
        leadId:        leadId,
        sequenceDay:   0,
        messageContent: body,
        direction:     "inbound",
        status:        "replied",
        repliedAt:     new Date(),
        replyContent:  body,
      });

      return { success: true, category };
    }),
});
