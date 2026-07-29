export type OutboundCallSafetyConfig = {
  enabled: boolean;
  deployment: string;
  previewAllowlist: string[];
  callWindowStart: string;
  callWindowEnd: string;
  timezone: string;
};

export type OutboundCallSafetyResult =
  | { allowed: true; destination: string }
  | { allowed: false; reason: string; message: string };

export class OutboundCallBlockedError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "OutboundCallBlockedError";
    this.reason = reason;
  }
}

export function normalizePhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function normalizeE164(value: string): string {
  const digits = normalizePhoneDigits(value);
  return digits.length === 10 ? `+1${digits}` : "";
}

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isWithinCallWindow(
  now: Date,
  start: string,
  end: string,
  timezone: string,
): boolean {
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return false;
  }

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const current = hour * 60 + minute;

  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

export function getOutboundCallSafetyConfig(): OutboundCallSafetyConfig {
  const previewAllowlist = [
    process.env.MAYA_PREVIEW_CALL_ALLOWLIST ?? "",
    process.env.PREVIEW_TEST_CALL_TO ?? "",
  ]
    .flatMap((value) => value.split(","))
    .map(normalizeE164)
    .filter(Boolean);

  return {
    enabled: process.env.MAYA_OUTBOUND_CALLS_ENABLED === "true",
    deployment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    previewAllowlist: Array.from(new Set(previewAllowlist)),
    callWindowStart: process.env.MAYA_CALL_WINDOW_START || "09:00",
    callWindowEnd: process.env.MAYA_CALL_WINDOW_END || "19:00",
    timezone: process.env.MAYA_CALL_TIMEZONE || "America/New_York",
  };
}

export function checkOutboundCallSafety(input: {
  to: string;
  appUrl: string;
  now?: Date;
  config?: OutboundCallSafetyConfig;
}): OutboundCallSafetyResult {
  const config = input.config ?? getOutboundCallSafetyConfig();
  const destination = normalizeE164(input.to);

  if (!config.enabled) {
    return {
      allowed: false,
      reason: "outbound_calls_disabled",
      message: "Outbound calling is disabled. Set MAYA_OUTBOUND_CALLS_ENABLED=true only in an approved environment.",
    };
  }
  if (!destination) {
    return { allowed: false, reason: "invalid_destination", message: "Destination must be a valid US phone number." };
  }

  let webhookUrl: URL;
  try {
    webhookUrl = new URL(input.appUrl);
  } catch {
    return { allowed: false, reason: "invalid_webhook_url", message: "The public Maya webhook URL is invalid." };
  }
  const localHost = webhookUrl.hostname === "localhost" || webhookUrl.hostname === "127.0.0.1";
  if (webhookUrl.protocol !== "https:" && !localHost) {
    return { allowed: false, reason: "insecure_webhook_url", message: "The public Maya webhook must use HTTPS." };
  }

  if (config.deployment === "preview" && !config.previewAllowlist.includes(destination)) {
    return {
      allowed: false,
      reason: "preview_destination_not_allowlisted",
      message: "Preview deployments may call only explicitly allowlisted test numbers.",
    };
  }

  if (!isWithinCallWindow(input.now ?? new Date(), config.callWindowStart, config.callWindowEnd, config.timezone)) {
    return {
      allowed: false,
      reason: "outside_call_window",
      message: `Outside the configured call window (${config.callWindowStart}-${config.callWindowEnd} ${config.timezone}).`,
    };
  }

  return { allowed: true, destination };
}
