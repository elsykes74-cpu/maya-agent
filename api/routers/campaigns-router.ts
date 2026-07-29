import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { campaigns, campaignLeads, leads, dncList, callQueue } from "../../db/schema";
import {
  createVapiCall,
  getAIConfigForCall,
  getCallingConfig,
  isWithinCallWindow,
  scrubPhone,
} from "../lib/vapi";
import { placeTwilioOutboundCall, isTwilioConfigured } from "../lib/twilio";
import { env } from "../lib/env";

export const campaignsRouter = createRouter({
  list: authedQuery
    .input(z.object({ status: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      if (input?.status && input.status !== "all") {
        filters.push(eq(campaigns.status, input.status as NonNullable<typeof campaigns.$inferSelect.status>));
      }
      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      const items = await db.query.campaigns.findMany({
        where: whereClause,
        orderBy: [desc(campaigns.createdAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
      return { items };
    }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const campaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, input.id),
        with: { campaignLeads: { with: { lead: true } } },
      });
      if (!campaign) throw new Error("Campaign not found");
      return campaign;
    }),

  create: authedQuery
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      motivationFilter: z.enum(["all", "hot", "warm", "cold"]).default("all"),
      profileFilter: z.number().optional(),
      stageFilter: z.enum(["all", "lead", "outreach", "scoring", "hot_routing", "warm_nurture", "cold_drip", "appointment", "close"]).default("all"),
      maxCallsPerLead: z.number().default(3),
      callIntervalHours: z.number().default(48),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [created] = await db.insert(campaigns).values({ ...input, status: "draft" }).returning({ id: campaigns.id });
      if (!created) throw new Error("Insert failed");
      return { id: created.id, success: true };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      status: z.enum(["draft", "active", "paused", "completed", "archived"]).optional(),
      motivationFilter: z.enum(["all", "hot", "warm", "cold"]).optional(),
      profileFilter: z.number().optional(),
      stageFilter: z.enum(["all", "lead", "outreach", "scoring", "hot_routing", "warm_nurture", "cold_drip", "appointment", "close"]).optional(),
      maxCallsPerLead: z.number().optional(),
      callIntervalHours: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(campaigns).set(data).where(eq(campaigns.id, id));
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(campaigns).where(eq(campaigns.id, input.id));
      return { success: true };
    }),

  populate: authedQuery
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, input.campaignId) });
      if (!campaign) throw new Error("Campaign not found");

      const leadFilters = [];
      if (campaign.motivationFilter && campaign.motivationFilter !== "all") {
        leadFilters.push(eq(leads.motivationLevel, campaign.motivationFilter as NonNullable<typeof leads.$inferSelect.motivationLevel>));
      }
      if (campaign.stageFilter && campaign.stageFilter !== "all") {
        leadFilters.push(eq(leads.pipelineStage, campaign.stageFilter as NonNullable<typeof leads.$inferSelect.pipelineStage>));
      }
      if (campaign.profileFilter) {
        leadFilters.push(eq(leads.profileId, campaign.profileFilter));
      }

      const whereClause = leadFilters.length > 0 ? and(...leadFilters) : undefined;
      const campaignLeadsList = await db.query.leads.findMany({ where: whereClause });

      const existingCampaignLeadIds = await db.query.campaignLeads.findMany({
        where: eq(campaignLeads.campaignId, input.campaignId),
      });
      const existingLeadIds = new Set(existingCampaignLeadIds.map(cl => cl.leadId));

      let added = 0;
      for (const lead of campaignLeadsList) {
        if (!existingLeadIds.has(lead.id)) {
          // Check DNC
          const cleanPhone = (lead.phone || "").replace(/\D/g, "");
          const dncEntry = cleanPhone.length >= 10
            ? await db.query.dncList.findFirst({ where: eq(dncList.phone, cleanPhone) })
            : null;
          const scrubStatus = dncEntry ? "fail_dnc" : "pending";
          
          await db.insert(campaignLeads).values({
            campaignId: input.campaignId,
            leadId: lead.id,
            status: scrubStatus === "fail_dnc" ? "skipped_dnc" : "pending",
            scrubStatus,
            scrubDetails: dncEntry ? `Found on DNC list: ${dncEntry.reason}` : null,
          });
          added++;
        }
      }

      await db.update(campaigns)
        .set({ totalLeads: existingCampaignLeadIds.length + added })
        .where(eq(campaigns.id, input.campaignId));

      return { added, total: existingCampaignLeadIds.length + added };
    }),

  // Activate campaign → queue calls → dial via Twilio (falls back to Vapi)
  activate: authedQuery
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const campaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, input.campaignId),
      });
      if (!campaign) throw new Error("Campaign not found");

      // Derive app URL from the incoming request headers so campaign webhooks
      // always point at the real host, not the APP_URL env var fallback (which
      // defaults to http://localhost:3000 if unset).
      const proto = ctx.req.headers.get("x-forwarded-proto") ?? "https";
      const host = ctx.req.headers.get("x-forwarded-host") ?? ctx.req.headers.get("host") ?? "";
      const appUrl = host ? `${proto}://${host}` : env.appUrl;


      const config = await getCallingConfig();
      let aiCallConfig: Awaited<ReturnType<typeof getAIConfigForCall>> | null = null;
      try {
        aiCallConfig = await getAIConfigForCall();
      } catch {
        // Vapi may still be configured independently of the shared AI row.
      }
      const databaseTwilioReady = !!(
        aiCallConfig?.twilioAccountSid &&
        aiCallConfig?.twilioAuthToken &&
        aiCallConfig?.twilioFromNumber
      );
      const twilioReady = isTwilioConfigured() || databaseTwilioReady;
      const vapiReady = !!config?.apiKey;
      if (!twilioReady && !vapiReady) {
        throw new Error("No calling provider configured. Add your Twilio credentials (or Vapi API key) in Settings.");
      }

      // Check call window
      if (!isWithinCallWindow(config?.callWindowStart || "09:00", config?.callWindowEnd || "19:00", config?.timezone || "America/New_York")) {
        throw new Error(`Outside call window (${config?.callWindowStart}–${config?.callWindowEnd} ${config?.timezone}). Calls will resume during business hours.`);
      }

      // Update campaign status
      await db.update(campaigns)
        .set({ status: "active", startedAt: new Date() })
        .where(eq(campaigns.id, input.campaignId));

      // Get pending campaign leads
      const pendingLeads = await db.query.campaignLeads.findMany({
        where: and(
          eq(campaignLeads.campaignId, input.campaignId),
          eq(campaignLeads.status, "pending")
        ),
        with: { lead: true },
      });

      let queued = 0;
      let scrubFailed = 0;
      let dialed = 0;
      let failed = 0;

      for (const cl of pendingLeads) {
        if (!cl.lead || !cl.lead.phone) {
          await db.update(campaignLeads)
            .set({ status: "skipped_invalid", scrubStatus: "fail_invalid", scrubDetails: "No phone number" })
            .where(eq(campaignLeads.id, cl.id));
          scrubFailed++;
          continue;
        }

        // Scrub
        const scrub = await scrubPhone(cl.lead.phone, config?.scrubDncBeforeCall ?? true, config?.scrubLitigants ?? true);
        if (!scrub.pass) {
          await db.update(campaignLeads)
            .set({ status: "skipped_dnc", scrubStatus: "fail_dnc", scrubDetails: scrub.reason })
            .where(eq(campaignLeads.id, cl.id));
          scrubFailed++;
          continue;
        }

        // Update scrub status
        await db.update(campaignLeads)
          .set({ scrubStatus: "pass", scrubDetails: "Clean" })
          .where(eq(campaignLeads.id, cl.id));

        // Create call queue entry
        const [queuedCall] = await db.insert(callQueue).values({
          campaignId: input.campaignId,
          campaignLeadId: cl.id,
          leadId: cl.leadId,
          phone: cl.lead.phone,
          status: "queued",
          scrubResult: "pass",
          scheduledAt: new Date(),
        }).returning({ id: callQueue.id });
        if (!queuedCall) throw new Error("Queue insert failed");
        queued++;

        // Honor the configured provider. Vapi supplies streaming endpointing,
        // interruption handling, and backchannel detection; Twilio remains a
        // fallback when Vapi is not selected or configured.
        try {
          let callId: string | null = null;
          const preferVapi = config?.provider === "vapi" && vapiReady;

          if (preferVapi) {
            const result = await createVapiCall(cl.leadId, cl.lead.phone, cl.lead.sellerName ?? "");
            callId = result?.id ?? null;
          } else if (twilioReady) {
            const result = await placeTwilioOutboundCall({
              to: cl.lead.phone,
              name: cl.lead.sellerName ?? "",
              address: cl.lead.propertyAddress ?? "",
              appUrl,
              accountSid: aiCallConfig?.twilioAccountSid || undefined,
              authToken: aiCallConfig?.twilioAuthToken || undefined,
              fromNumber: aiCallConfig?.twilioFromNumber || undefined,
            });
            callId = result?.sid ?? null;
          } else {
            const result = await createVapiCall(cl.leadId, cl.lead.phone, cl.lead.sellerName ?? "");
            callId = result?.id ?? null;
          }

          if (callId) {
            await db.update(callQueue)
              .set({ status: "dialing", externalCallId: callId, startedAt: new Date() })
              .where(eq(callQueue.id, queuedCall.id));
            await db.update(campaignLeads)
              .set({ status: "queued", externalCallId: callId })
              .where(eq(campaignLeads.id, cl.id));
            dialed++;
          } else {
            await db.update(callQueue)
              .set({ status: "failed", errorMessage: "Call provider returned no call ID" })
              .where(eq(callQueue.id, queuedCall.id));
            failed++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await db.update(callQueue)
            .set({ status: "failed", errorMessage: msg })
            .where(eq(callQueue.id, queuedCall.id));
          failed++;
        }
      }

      return {
        queued,
        scrubFailed,
        dialed,
        failed,
        totalPending: pendingLeads.length,
        message: dialed > 0
          ? `Campaign activated! ${dialed} calls placed. ${scrubFailed} numbers scrubbed. ${failed} failed.`
          : `No calls placed. ${scrubFailed} scrubbed. ${failed} failed.`,
      };
    }),

  stats: authedQuery
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const total = await db.select({ count: sql<number>`count(*)` }).from(campaignLeads).where(eq(campaignLeads.campaignId, input.campaignId));
      const completed = await db.select({ count: sql<number>`count(*)` }).from(campaignLeads).where(and(eq(campaignLeads.campaignId, input.campaignId), eq(campaignLeads.status, "completed")));
      const pending = await db.select({ count: sql<number>`count(*)` }).from(campaignLeads).where(and(eq(campaignLeads.campaignId, input.campaignId), eq(campaignLeads.status, "pending")));
      const failed = await db.select({ count: sql<number>`count(*)` }).from(campaignLeads).where(and(eq(campaignLeads.campaignId, input.campaignId), eq(campaignLeads.status, "failed")));
      const skippedDnc = await db.select({ count: sql<number>`count(*)` }).from(campaignLeads).where(and(eq(campaignLeads.campaignId, input.campaignId), eq(campaignLeads.status, "skipped_dnc")));
      const skippedInvalid = await db.select({ count: sql<number>`count(*)` }).from(campaignLeads).where(and(eq(campaignLeads.campaignId, input.campaignId), eq(campaignLeads.status, "skipped_invalid")));
      
      return {
        total: total[0]?.count ?? 0,
        completed: completed[0]?.count ?? 0,
        pending: pending[0]?.count ?? 0,
        failed: failed[0]?.count ?? 0,
        skippedDnc: skippedDnc[0]?.count ?? 0,
        skippedInvalid: skippedInvalid[0]?.count ?? 0,
      };
    }),

  callQueue: authedQuery
    .input(z.object({ campaignId: z.number(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = getDb();
      const items = await db.query.callQueue.findMany({
        where: eq(callQueue.campaignId, input.campaignId),
        orderBy: [desc(callQueue.createdAt)],
        limit: input.limit,
        with: { lead: true },
      });
      return { items };
    }),
});
