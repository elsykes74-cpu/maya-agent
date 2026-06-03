import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

function assertDatabaseUrl(value: string): string {
  if (!value) {
    throw new Error(
      "Database URL is not configured. Set DATABASE_URL or POSTGRES_URL in Vercel.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "Database URL is invalid. Set DATABASE_URL or POSTGRES_URL to a full Postgres connection string.",
    );
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Database URL must use postgres:// or postgresql://.");
  }

  return value;
}

export function getDb() {
  if (!instance) {
    // prepare: false required for Supabase transaction-mode pooler
    const client = postgres(assertDatabaseUrl(env.databaseUrl), { prepare: false });
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
