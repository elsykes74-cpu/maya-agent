import { getDb } from "../api/queries/connection";
import { leadProfiles, smsTemplates, objectionResponses, leadSources } from "./schema";

async function seed() {
  const db = getDb();

  // Seed lead sources
  const sources = await db.select().from(leadSources);
  if (sources.length === 0) {
    await db.insert(leadSources).values([
      { name: "PropStream", description: "Distressed property lists from PropStream" },
      { name: "BatchLeads", description: "Batch skip tracing and lead lists" },
      { name: "Direct Mail", description: "Direct mail campaign responses" },
      { name: "Website", description: "Website form submissions" },
      { name: "Referral", description: "Referrals from other investors or agents" },
      { name: "Driving for Dollars", description: "Self-sourced driving for dollars" },
    ]);
    console.log("Lead sources seeded");
  }

  // Seed lead profiles (target profiles from the PDF)
  const profiles = await db.select().from(leadProfiles);
  if (profiles.length === 0) {
    await db.insert(leadProfiles).values([
      { name: "Pre-foreclosure / NOD Filed", description: "Notice of Default filed, facing foreclosure", priority: 100 },
      { name: "Probate / Inherited Property", description: "Property in probate or recently inherited", priority: 90 },
      { name: "Tax Delinquent (2+ years)", description: "Behind on property taxes for 2+ years", priority: 80 },
      { name: "Tired Landlords", description: "Non-paying or vacant tenants, landlord fatigue", priority: 70 },
      { name: "Code Violation Properties", description: "Multiple code violations from city", priority: 60 },
      { name: "Long-term Owners (20+ years)", description: "Owned 20+ years, no mortgage, likely equity rich", priority: 50 },
      { name: "Distressed Condition / Heavy Deferred Maintenance", description: "Visible distress, major repairs needed", priority: 40 },
      { name: "Expired / Withdrawn MLS Listings", description: "Failed MLS listing, still wants to sell", priority: 30 },
      { name: "FSBOs Priced Above Market", description: "For sale by owner, motivated but mispriced", priority: 20 },
    ]);
    console.log("Lead profiles seeded");
  }

  // Seed SMS templates from the PDF
  const templates = await db.select().from(smsTemplates);
  if (templates.length === 0) {
    await db.insert(smsTemplates).values([
      {
        name: "Day 0 - Initial Follow-up",
        day: 0,
        content: "Hey [Name] — this is [Agent Name]. Just left you a voicemail about [Street Address]. No rush, just wanted to connect when you have a minute. — [Number]",
        description: "Send within 5 minutes of a voicemail or no-answer",
        isActive: true,
      },
      {
        name: "Day 3 - Soft Follow-up",
        day: 3,
        content: "Hey [Name] — following up real quick. Are you open to a quick conversation about [Street]? Even just to hear what we'd offer. Zero pressure.",
        description: "Sent 3 days after initial contact if no reply",
        isActive: true,
      },
      {
        name: "Day 7 - Final Touch",
        day: 7,
        content: "Last reach out — we're wrapping up our buying window in this area. If you've had any interest in selling [Street], happy to give you a number this week. If not, totally understand.",
        description: "Final touch before moving to cold drip",
        isActive: true,
      },
    ]);
    console.log("SMS templates seeded");
  }

  // Seed objection responses from the PDF
  const objections = await db.select().from(objectionResponses);
  if (objections.length === 0) {
    await db.insert(objectionResponses).values([
      {
        objection: "I'm not interested.",
        response: "Totally fair — out of curiosity, is it because you're not thinking about selling, or just not right now?",
        category: "General",
        priority: 100,
      },
      {
        objection: "I already have an agent.",
        response: "No problem at all. Are they actively marketing it, or is that more down the road?",
        category: "Agent",
        priority: 90,
      },
      {
        objection: "I want full / market value.",
        response: "Makes sense. Can I ask — have you gotten any offers yet, or is this more exploratory?",
        category: "Price",
        priority: 80,
      },
      {
        objection: "I need to talk to my family.",
        response: "Absolutely. Would it make sense for all of you to be there for the walkthrough so everyone can ask questions?",
        category: "Decision Maker",
        priority: 70,
      },
      {
        objection: "How did you get my number?",
        response: "Public records — property ownership is public info. I wanted to reach out directly instead of going through a third party.",
        category: "Privacy",
        priority: 60,
      },
      {
        objection: "Send me something in writing.",
        response: "Of course — what's the best email? I'll shoot over a quick overview and we can go from there.",
        category: "Information",
        priority: 50,
      },
    ]);
    console.log("Objection responses seeded");
  }

  console.log("Seeding complete!");
}

seed().catch(console.error);
