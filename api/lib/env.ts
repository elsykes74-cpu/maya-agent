import "dotenv/config";

const DATABASE_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_URL",
] as const;

function optional(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function required(name: string): string {
  const value = optional(name);
  if (!value && process.env.NODE_ENV === "production") {
    console.error(`[env] Missing required variable: ${name}`);
  }
  return value;
}

function isPostgresConnectionString(value: string): boolean {
  try {
    return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function resolveDatabaseUrl(): string {
  for (const name of DATABASE_ENV_KEYS) {
    const value = optional(name);
    if (value && isPostgresConnectionString(value)) return value;
    if (value && process.env.NODE_ENV === "production") {
      console.error(`[env] Ignoring invalid PostgreSQL URL in ${name}`);
    }
  }
  return "";
}

export function validateEnv(): string[] {
  const issues: string[] = [];
  const requiredNames = ["APP_SECRET", "NODE_ENV"];

  for (const name of requiredNames) {
    if (!optional(name)) issues.push(name);
  }
  if (!resolveDatabaseUrl()) issues.push("valid DATABASE_URL or POSTGRES_URL");
  if (optional("APP_SECRET").length > 0 && optional("APP_SECRET").length < 32) {
    issues.push("APP_SECRET must contain at least 32 characters");
  }
  return issues;
}

export const env = {
  appId: optional("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: resolveDatabaseUrl(),
  kimiAuthUrl: optional("KIMI_AUTH_URL"),
  kimiOpenUrl: optional("KIMI_OPEN_URL"),
  anthropicApiKey: optional("ANTHROPIC_API_KEY") || optional("ANTHROPIC_KEY"),
  braveApiKey: optional("BRAVE_API_KEY"),
  claudeEndpointSecret: optional("CLAUDE_ENDPOINT_SECRET"),
  ownerUnionId: optional("OWNER_UNION_ID"),
  ownerEmail: optional("OWNER_EMAIL").toLowerCase(),
  appUrl: optional("APP_URL") || "http://localhost:3000",
  pipecatWebsocketUrl: optional("PIPECAT_WEBSOCKET_URL"),
  googleClientId: optional("GOOGLE_CLIENT_ID"),
  googleClientSecret: optional("GOOGLE_CLIENT_SECRET"),
  telegramBotToken: optional("TELEGRAM_BOT_TOKEN"),
  telegramChatId: optional("TELEGRAM_CHAT_ID"),
  telegramBotTokenLadyJaye: optional("TELEGRAM_BOT_TOKEN_LADYJAYE"),
  telegramChatIdLadyJaye: optional("TELEGRAM_CHAT_ID_LADYJAYE"),
} as const;
