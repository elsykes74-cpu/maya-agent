import { z } from "zod";
import { eq, desc, and, lte, isNull, or } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { tasks, activities } from "../../db/schema";

const TASK_TYPE = z.enum(["call_back","send_sms","send_email","follow_up","visit","contract","other"]);
const TASK_STATUS = z.enum(["pending","in_progress","completed","cancelled","snoozed"]);

export const tasksRouter = createRouter({
  list: publicQuery
    .input(z.object({
      leadId: z.number().optional(),
      status: TASK_STATUS.optional(),
      type: TASK_TYPE.optional(),
      dueBy: z.string().datetime().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      if (input?.leadId) filters.push(eq(tasks.leadId, input.leadId));
      if (input?.status) filters.push(eq(tasks.status, input.status));
      if (input?.type) filters.push(eq(tasks.type, input.type));
      if (input?.dueBy) filters.push(lte(tasks.dueAt, new Date(input.dueBy)));
      const items = await db.query.tasks.findMany({
        where: filters.length > 0 ? and(...filters) : undefined,
        orderBy: [desc(tasks.dueAt), desc(tasks.createdAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
      return { items };
    }),

  due: publicQuery.query(async () => {
    const db = getDb();
    const now = new Date();
    const items = await db.query.tasks.findMany({
      where: and(
        eq(tasks.status, "pending"),
        or(lte(tasks.dueAt, now), isNull(tasks.dueAt))
      ),
      orderBy: [desc(tasks.dueAt)],
      limit: 25,
    });
    return { items };
  }),

  create: publicQuery
    .input(z.object({
      leadId: z.number(),
      type: TASK_TYPE.default("call_back"),
      title: z.string().min(1),
      notes: z.string().optional(),
      dueAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [created] = await db.insert(tasks).values({
        ...input,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      } as any).returning({ id: tasks.id });
      return { id: created.id, success: true };
    }),

  complete: publicQuery
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const task = await db.query.tasks.findFirst({ where: eq(tasks.id, input.id) });
      if (!task) throw new Error("Task not found");
      await db.update(tasks)
        .set({ status: "completed", completedAt: new Date(), notes: input.notes ?? task.notes })
        .where(eq(tasks.id, input.id));
      await db.insert(activities).values({
        leadId: task.leadId,
        type: "system",
        body: `✅ Task completed: ${task.title}${input.notes ? ` — ${input.notes}` : ""}`,
        linkedTable: "tasks",
        linkedId: task.id,
      } as any);
      return { success: true };
    }),

  snooze: publicQuery
    .input(z.object({ id: z.number(), until: z.string().datetime() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(tasks)
        .set({ status: "snoozed", snoozedUntil: new Date(input.until), dueAt: new Date(input.until) })
        .where(eq(tasks.id, input.id));
      return { success: true };
    }),

  cancel: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(tasks).set({ status: "cancelled" }).where(eq(tasks.id, input.id));
      return { success: true };
    }),
});
