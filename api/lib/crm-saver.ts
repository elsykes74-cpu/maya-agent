import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { leads, followUpMessages } from "../../db/schema";

export async function saveResearchToLead(
  leadId: number,
  data: {
    researchSummary?: string;
    callBriefing?: string;
    distressSignals?: string;
    webMentions?: string;
  }
): Promise<void> {
  const db = getDb();
  await db
    .update(leads)
    .set({
      ...(data.researchSummary !== undefined && { researchSummary: data.researchSummary }),
      ...(data.callBriefing !== undefined && { callBriefing: data.callBriefing }),
      ...(data.distressSignals !== undefined && { distressSignals: data.distressSignals }),
      ...(data.webMentions !== undefined && { webMentions: data.webMentions }),
    })
    .where(eq(leads.id, leadId));
}

export async function saveFollowUpMessage(
  leadId: number,
  type: string,
  content: string,
  tone: string
): Promise<void> {
  const db = getDb();
  await db.insert(followUpMessages).values({
    leadId,
    messageType: type,
    content,
    tone,
    createdBy: "ladyjaye",
  });
}

export async function getFollowUpHistory(
  leadId: number,
  limit = 5
): Promise<
  Array<{
    id: number;
    messageType: string;
    tone: string;
    content: string;
    createdAt: Date;
  }>
> {
  const db = getDb();
  const rows = await db.query.followUpMessages.findMany({
    where: eq(followUpMessages.leadId, leadId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit,
  });

  return rows.map((r) => ({
    id: r.id,
    messageType: r.messageType,
    tone: r.tone ?? "friendly",
    content: r.content,
    createdAt: r.createdAt,
  }));
}
