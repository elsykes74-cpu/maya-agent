/**
 * One-shot setup script — run once after deploy:
 *   npx tsx scripts/setup-bots.ts
 *
 * It will:
 *   1. Apply the bot-upgrade DB migration
 *   2. Register Telegram webhooks for both bots
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 1. Database migration ────────────────────────────────────────────────────

async function runMigration() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error("[setup] ❌ DATABASE_URL not set — skipping migration");
    return;
  }

  const sql = postgres(dbUrl, { max: 1 });
  const migrationPath = path.resolve(__dirname, "../db/migrations/0001_bot_upgrades.sql");

  try {
    const migrationSql = readFileSync(migrationPath, "utf-8");
    await sql.unsafe(migrationSql);
    console.log("[setup] ✅ Migration applied: 0001_bot_upgrades.sql");
  } catch (err: any) {
    console.error("[setup] ❌ Migration failed:", err.message);
  } finally {
    await sql.end();
  }
}

// ── 2. Telegram webhook registration ────────────────────────────────────────

async function registerWebhook(token: string, url: string, name: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, drop_pending_updates: true }),
    });
    const data = await res.json() as any;
    if (data?.ok) {
      console.log(`[setup] ✅ ${name} webhook registered: ${url}`);
    } else {
      console.error(`[setup] ❌ ${name} webhook failed:`, data?.description);
    }
  } catch (err: any) {
    console.error(`[setup] ❌ ${name} webhook error:`, err.message);
  }
}

async function registerWebhooks() {
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (!appUrl || appUrl.includes("localhost")) {
    console.error("[setup] ❌ APP_URL not set or is localhost — skipping webhook registration");
    console.log("[setup]    Set APP_URL=https://your-domain.railway.app and re-run");
    return;
  }

  const qkToken = process.env.TELEGRAM_BOT_TOKEN;
  const ljToken = process.env.TELEGRAM_BOT_TOKEN_LADYJAYE;

  if (qkToken) {
    await registerWebhook(qkToken, `${appUrl}/api/telegram/webhook`, "QuickKickBot");
  } else {
    console.warn("[setup] ⚠️  TELEGRAM_BOT_TOKEN not set — skipping QuickKickBot");
  }

  if (ljToken) {
    await registerWebhook(ljToken, `${appUrl}/api/telegram/ladyjaye`, "LadyJayeBot");
  } else {
    console.warn("[setup] ⚠️  TELEGRAM_BOT_TOKEN_LADYJAYE not set — skipping LadyJayeBot");
  }
}

// ── 3. Verify Brave + Anthropic keys ────────────────────────────────────────

function checkApiKeys() {
  const keys = [
    ["BRAVE_API_KEY",    "QuickKickBot lead research"],
    ["ANTHROPIC_API_KEY","LadyJayeBot message generation"],
    ["APP_URL",          "Telegram webhook auto-registration"],
  ];
  console.log("\n[setup] API key status:");
  for (const [key, purpose] of keys) {
    const set = Boolean(process.env[key]);
    console.log(`  ${set ? "✅" : "❌"} ${key.padEnd(25)} — ${purpose}`);
  }
  console.log();
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Maya Bot Setup ===\n");
  checkApiKeys();
  await runMigration();
  await registerWebhooks();
  console.log("\n=== Setup complete ===\n");
}

main().catch((err) => {
  console.error("[setup] Fatal:", err);
  process.exit(1);
});
