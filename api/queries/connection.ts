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
    const client = postgres(assertDatabaseUrl(env.databaseUrl), {
      // prepare: false is required for Supabase's transaction-mode pooler
      // (statement caching breaks when the pooler multiplexes connections).
      prepare: false,
      // Bounded pool — keep the app's connection count well under the
      // Supabase pooler ceiling. Raise deliberately if concurrency grows.
      max: Number(process.env.PG_POOL_MAX ?? 10),
      // Release idle server connections so the pooler can reclaim them.
      idle_timeout: Number(process.env.PG_IDLE_TIMEOUT ?? 20),
      // Fail fast instead of hanging a request when the DB is unreachable.
      connect_timeout: Number(process.env.PG_CONNECT_TIMEOUT ?? 10),
      // Surface connection-level errors to logs (observability) without
      // crashing the process; the driver reconnects on the next query.
      onnotice: () => {},
      connection: { application_name: "maya-agent" },
    });
    client`select 1`.catch((err) =>
      console.error("[db] initial connectivity check failed:", err?.message ?? err),
    );
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
