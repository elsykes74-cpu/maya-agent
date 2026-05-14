import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

export async function findUserByGoogleId(googleId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.googleId, googleId))
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    ...data,
  };

  if (
    values.role === undefined &&
    values.unionId &&
    values.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await getDb()
    .insert(schema.users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function upsertGoogleUser(data: { googleId: string; name?: string | null; email?: string | null; avatar?: string | null }) {
  const existing = await findUserByGoogleId(data.googleId);

  if (existing) {
    const updateSet: Partial<InsertUser> = {
      lastSignInAt: new Date(),
      name: data.name ?? existing.name,
      email: data.email ?? existing.email,
      avatar: data.avatar ?? existing.avatar,
    };
    await getDb()
      .update(schema.users)
      .set(updateSet)
      .where(eq(schema.users.id, existing.id));
    return;
  }

  await getDb()
    .insert(schema.users)
    .values({
      unionId: `google_${data.googleId}`,
      googleId: data.googleId,
      name: data.name ?? null,
      email: data.email ?? null,
      avatar: data.avatar ?? null,
      role: "user",
      lastSignInAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        lastSignInAt: new Date(),
        name: data.name ?? undefined,
        email: data.email ?? undefined,
        avatar: data.avatar ?? undefined,
      },
    });
}
