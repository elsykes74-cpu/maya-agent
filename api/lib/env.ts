import "dotenv/config";

const DATABASE_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_URL",
] as const;

/** Cache raw values so we can test them without side-effects */
function _raw(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Return value OR empty string without throwing. */
function soft(name: string): string {
  return process.env[name] ?? "";
}

function normalizeEnvValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isPostgresConnectionString(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ["postgres:", "postgresql:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Like required() but NO THROW.
 * Returns the raw value; logs a warning when production.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV === "production") {
    console.error(`[env] MISSING required var: ${name}`);
  }
  return v ?? "";
}

function databaseUrl(): string {
  const configuredNames: string[] = [];

  for (const name of DATABASE_ENV_KEYS) {
    const raw = process.env[name];
    if (!raw?.trim()) continue;

    configuredNames.push(name);
    const value = normalizeEnvValue(raw);
    if (isPostgresConnectionString(value)) return value;

    if (process.env.NODE_ENV === "production") {
      console.error(`[env] Ignoring invalid database URL var: ${name}`);
    }
  }

  if (process.env.NODE_ENV === "production") {
    const detail = configuredNames.length
      ? `No valid database URL found in: ${configuredNames.join(", ")}`
      : `MISSING database URL var: ${DATABASE_ENV_KEYS.join(" or ")}`;
    console.error(`[env] ${detail}`);
  }

  return "";
}

/** Run once at boot - returns list of bad / missing vars. */
export function validateEnv(): string[] {
  const required_keys = [
    "APP_ID",
    "APP_SECRET",
    "KIMI_AUTH_URL",
    "KIMI_OPEN_URL",
    "NODE_ENV",
  ] as const;
  const missing = required_keys.filter((k) => !process.env[k]);
  if (!databaseUrl()) missing.push("valid DATABASE_URL or POSTGRES_URL");
  return missing;
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: databaseUrl(),
  kimiAuthUrl: required("KIMI_AUTH_URL"),
  kimiOpenUrl: required("KIMI_OPEN_URL"),
  anthropicApiKey: soft("ANTHROPIC_API_KEY") || soft("ANTHROPIC_KEY"),
  braveApiKey: soft("BRAVE_API_KEY"),
  serpApiKey: soft("SERPAPI_KEY"),
  claudeEndpointSecret: soft("CLAUDE_ENDPOINT_SECRET"),
  ownerUnionId: soft("OWNER_UNION_ID"),
  appUrl: soft("APP_URL") || "http://localhost:3000",
  googleClientId: soft("GOOGLE_CLIENT_ID"),
  googleClientSecret: soft("GOOGLE_CLIENT_SECRET"),
  telegramBotToken: soft("TELEGRAM_BOT_TOKEN") || "8063610170:AAFvRIccv3tH0U5xjEdqtFYe5Wq_L08OBR0",
  telegramChatId: soft("TELEGRAM_CHAT_ID") || "8693969643",
  // LadyJaye — second bot
  telegramBotTokenLadyJaye: soft("TELEGRAM_BOT_TOKEN_LADYJAYE"),
  telegramChatIdLadyJaye: soft("TELEGRAM_CHAT_ID_LADYJAYE"),
  // Email notifications (Resend)
  resendApiKey: soft("RESEND_API_KEY"),
  resendFromEmail: soft("RESEND_FROM_EMAIL") || "Maya <onboarding@resend.dev>",
  notifyEmail: soft("NOTIFY_EMAIL") || "erick@jetsbuilds.com",
};
