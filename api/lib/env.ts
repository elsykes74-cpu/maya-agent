import "dotenv/config";

/** Cache raw values so we can test them without side-effects */
function _raw(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Return value OR empty string without throwing. */
function soft(name: string): string {
  return process.env[name] ?? "";
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

/** Run once at boot – returns list of bad / missing vars. */
export function validateEnv(): string[] {
  const required_keys = [
    "APP_ID",
    "APP_SECRET",
    "DATABASE_URL",
    "KIMI_AUTH_URL",
    "KIMI_OPEN_URL",
    "NODE_ENV",
  ] as const;
  return required_keys.filter((k) => !process.env[k]);
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: required("KIMI_AUTH_URL"),
  kimiOpenUrl: required("KIMI_OPEN_URL"),
  ownerUnionId: soft("OWNER_UNION_ID"),
  appUrl: soft("APP_URL") || "http://localhost:3000",
  googleClientId: soft("GOOGLE_CLIENT_ID"),
  googleClientSecret: soft("GOOGLE_CLIENT_SECRET"),
};
