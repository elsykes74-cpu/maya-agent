import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { aiConfig, objectionResponses } from "../../db/schema";

export const aiConfigRouter = createRouter({
  get: publicQuery.query(async () => {
    const db = getDb();
    const config = await db.query.aiConfig.findFirst();
    
    if (!config) {
      const defaultPrompt = `ROLE:
You are a real estate acquisitions representative working on behalf of a local investment group in Western Massachusetts. You have deep knowledge of distressed property situations, seller psychology, and how to identify motivated sellers.

OBJECTIVE:
Call property owners, identify motivation and distress, pre-qualify deal viability, and set appointments for a property walkthrough. You are not closing a sale — you are opening a relationship.

COMPLIANCE RULES:
- Never represent yourself or Erick as the guaranteed end buyer
- Never discuss contract terms in detail
- Never make price guarantees on the call
- Position the team as 'local buyers working with a network of investment partners'
- If asked if you are an agent: 'I work with a buyer group directly — we're not listing it, we're looking to buy.'
- Stay conversational. Never sound scripted.

TONE:
Calm, confident, empathetic. You are solving a problem, not selling a product. Never rush. Never argue. Always end by moving the conversation forward.`;

      await db.insert(aiConfig).values({
        systemPrompt: defaultPrompt,
        openerScript: `Hey — is this [Name]? This is [Agent Name] — sorry if this is out of nowhere, I was actually calling about the property on [Street Address]. Did I catch you at a bad time?\n\nIF BAD TIME: "No worries at all — when's a better time to reach you? I'll call back then."\n\nIF GO AHEAD: "Perfect. So I'll be straight with you — we work with a small group of investors in the Springfield area, and [Street] came up on our radar. We're looking to buy in that area and wanted to reach out directly before going any other route."`,
        discoveryQuestions: `1. "Have you thought at all about selling it at some point?"\n2. "What's the condition like right now — is it move-in ready or does it need some work?"\n3. "Is anyone living there currently?"\n4. "If you did sell — what would your timeline look like?"\n5. "What's got you even open to the conversation?"`,
        positioningScript: `"Yeah, that makes a lot of sense. Honestly, most of the people we work with are in similar situations — they just want something simple, without dealing with repairs, listings, or waiting around. That's kind of what we specialize in."`,
        priceAnchorScript: `"Do you have a number in mind that would make this worth it for you?"\n\nIF REALISTIC: "Got it — that's helpful to know. We'd need to look at it in person before we can give you anything firm, but that's in the right ballpark."\n\nIF TOO HIGH: "I appreciate you being straight with me. We have to factor in condition and what it takes to get it market-ready — so we'd need to be somewhere that works on both ends. But that's exactly what the walkthrough is for."`,
        closeScript: `"Honestly, the best next step is just a quick walkthrough — takes maybe 20 minutes. We give you a real number, no pressure, no obligation. If it works for both sides, great. If not, no worries at all."\n\n"Would [Day] or [Day] work better for you?"\n\nLock the day first. Then the time.`,
        voicemailScript: `"Hey [Name], this is [Agent Name] calling about the property on [Street]. Nothing urgent — just wanted to reach out directly about something that might be worth a quick conversation. You can call me back at [Number], or I'll try you again in a day or two. Thanks."`,
        complianceDisclaimer: "Selling equitable interest — not the property. No brokerage implication. AI never says 'we'll buy your house' as a guarantee. AI positions Erick as 'a local buyer working with a network of investment partners'. Never deceptive language. Disclose RE license when required.",
      });
      
      return await db.query.aiConfig.findFirst()!;
    }
    
    return config;
  }),

  update: publicQuery
    .input(z.object({
      id: z.number(),
      systemPrompt: z.string().min(1).optional(),
      openerScript: z.string().optional(),
      discoveryQuestions: z.string().optional(),
      positioningScript: z.string().optional(),
      priceAnchorScript: z.string().optional(),
      closeScript: z.string().optional(),
      voicemailScript: z.string().optional(),
      complianceDisclaimer: z.string().optional(),
      elevenLabsApiKey: z.string().optional(),
      elevenLabsVoiceId: z.string().optional(),
      elevenLabsVoiceName: z.string().optional(),
      twilioAccountSid: z.string().optional(),
      twilioAuthToken: z.string().optional(),
      twilioFromNumber: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(aiConfig).set(data).where(eq(aiConfig.id, id));
      return { success: true };
    }),

  objections: publicQuery.query(async () => {
    const db = getDb();
    return db.query.objectionResponses.findMany({
      orderBy: [desc(objectionResponses.priority)],
    });
  }),

  createObjection: publicQuery
    .input(z.object({
      objection: z.string().min(1),
      response: z.string().min(1),
      category: z.string().optional(),
      priority: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(objectionResponses).values(input);
      return { id: Number(result[0].insertId), success: true };
    }),

  updateObjection: publicQuery
    .input(z.object({
      id: z.number(),
      objection: z.string().min(1).optional(),
      response: z.string().min(1).optional(),
      category: z.string().optional(),
      priority: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(objectionResponses).set(data).where(eq(objectionResponses.id, id));
      return { success: true };
    }),

  deleteObjection: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(objectionResponses).where(eq(objectionResponses.id, input.id));
      return { success: true };
    }),
});
