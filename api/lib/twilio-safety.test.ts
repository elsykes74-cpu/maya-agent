import { afterEach, describe, expect, it, vi } from "vitest";

import { placeTwilioOutboundCall } from "./twilio";
import type { OutboundCallSafetyConfig } from "./call-safety";

const enabledPreview: OutboundCallSafetyConfig = {
  enabled: true,
  deployment: "preview",
  previewAllowlist: ["+12125550100"],
  callWindowStart: "09:00",
  callWindowEnd: "20:00",
  timezone: "America/New_York",
};

const base = {
  to: "+12125550100",
  name: "Preview Test",
  address: "123 Test Street",
  appUrl: "https://preview.example.com",
  accountSid: "ACtest",
  authToken: "test-token",
  fromNumber: "+12125550199",
  now: new Date("2026-01-15T15:00:00Z"),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Twilio outbound safety boundary", () => {
  it("does not contact Twilio when the kill switch is off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await placeTwilioOutboundCall({
      ...base,
      safetyConfig: { ...enabledPreview, enabled: false },
    });

    expect(result).toMatchObject({ status: "blocked", blockedReason: "outbound_calls_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not contact Twilio for a DNC-listed number", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await placeTwilioOutboundCall({
      ...base,
      safetyConfig: enabledPreview,
      dncChecker: async () => true,
    });

    expect(result).toMatchObject({ status: "blocked", blockedReason: "dnc" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when DNC verification is unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await placeTwilioOutboundCall({
      ...base,
      safetyConfig: enabledPreview,
      dncChecker: async () => { throw new Error("database unavailable"); },
    });

    expect(result).toMatchObject({ status: "blocked", blockedReason: "dnc_check_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a call only after all checks pass", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "CA123", status: "queued" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await placeTwilioOutboundCall({
      ...base,
      safetyConfig: enabledPreview,
      dncChecker: async () => false,
    });

    expect(result).toEqual({ sid: "CA123", status: "queued" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(request.body)).toContain("To=%2B12125550100");
    const params = new URLSearchParams(String(request.body));
    expect(params.get("StatusCallbackEvent")).toBe("initiated ringing answered completed");
  });
});
