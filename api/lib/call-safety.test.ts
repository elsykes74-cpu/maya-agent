import { describe, expect, it } from "vitest";

import {
  checkOutboundCallSafety,
  isWithinCallWindow,
  normalizeE164,
  type OutboundCallSafetyConfig,
} from "./call-safety";

const config: OutboundCallSafetyConfig = {
  enabled: true,
  deployment: "production",
  previewAllowlist: [],
  callWindowStart: "09:00",
  callWindowEnd: "19:00",
  timezone: "America/New_York",
};

const allowedNow = new Date("2026-01-15T15:00:00Z");

describe("outbound call safety", () => {
  it("normalizes supported US numbers", () => {
    expect(normalizeE164("(212) 555-1212")).toBe("+12125551212");
    expect(normalizeE164("+1 212 555 1212")).toBe("+12125551212");
    expect(normalizeE164("555")).toBe("");
  });

  it("fails closed when outbound calling is disabled", () => {
    const result = checkOutboundCallSafety({
      to: "2125551212",
      appUrl: "https://preview.example.com",
      now: allowedNow,
      config: { ...config, enabled: false },
    });
    expect(result).toMatchObject({ allowed: false, reason: "outbound_calls_disabled" });
  });

  it("rejects insecure public webhook URLs", () => {
    const result = checkOutboundCallSafety({
      to: "2125551212",
      appUrl: "http://preview.example.com",
      now: allowedNow,
      config,
    });
    expect(result).toMatchObject({ allowed: false, reason: "insecure_webhook_url" });
  });

  it("allows localhost HTTP only for local development", () => {
    const result = checkOutboundCallSafety({
      to: "2125551212",
      appUrl: "http://localhost:3000",
      now: allowedNow,
      config,
    });
    expect(result).toEqual({ allowed: true, destination: "+12125551212" });
  });

  it("requires a Preview destination allowlist", () => {
    const denied = checkOutboundCallSafety({
      to: "2125551212",
      appUrl: "https://preview.example.com",
      now: allowedNow,
      config: { ...config, deployment: "preview" },
    });
    expect(denied).toMatchObject({ allowed: false, reason: "preview_destination_not_allowlisted" });

    const allowed = checkOutboundCallSafety({
      to: "2125551212",
      appUrl: "https://preview.example.com",
      now: allowedNow,
      config: { ...config, deployment: "preview", previewAllowlist: ["+12125551212"] },
    });
    expect(allowed).toEqual({ allowed: true, destination: "+12125551212" });
  });

  it("blocks calls outside the configured local window", () => {
    const result = checkOutboundCallSafety({
      to: "2125551212",
      appUrl: "https://maya.example.com",
      now: new Date("2026-01-15T13:00:00Z"),
      config,
    });
    expect(result).toMatchObject({ allowed: false, reason: "outside_call_window" });
  });

  it("supports overnight windows and fails closed on invalid timezones", () => {
    expect(isWithinCallWindow(new Date("2026-01-15T04:00:00Z"), "20:00", "08:00", "America/New_York")).toBe(true);
    expect(isWithinCallWindow(allowedNow, "09:00", "19:00", "Invalid/Timezone")).toBe(false);
  });
});
