import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../queries/connection", () => ({
  getDb: vi.fn(() => { throw new Error("database should not be reached by blocked calls"); }),
}));
vi.mock("../../db/schema", () => ({
  callingConfig: {},
  leads: { id: {} },
  dncList: { phone: {} },
}));

import { createVapiCall } from "./vapi";
import type { OutboundCallSafetyConfig } from "./call-safety";

const destination = "+12125550100";
const enabledPreview: OutboundCallSafetyConfig = {
  enabled: true,
  deployment: "preview",
  previewAllowlist: [destination],
  callWindowStart: "09:00",
  callWindowEnd: "19:00",
  timezone: "America/New_York",
};
const baseOptions = {
  appUrl: "https://preview.example.com",
  now: new Date("2026-07-29T16:00:00Z"),
  safetyConfig: enabledPreview,
};

function expectBlocked(
  promise: Promise<unknown>,
  reason: string,
) {
  return expect(promise).rejects.toMatchObject({
    name: "OutboundCallBlockedError",
    reason,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Vapi outbound safety boundary", () => {
  it("makes no provider request when outbound calling is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expectBlocked(createVapiCall(1, destination, "Test", {
      ...baseOptions,
      safetyConfig: { ...enabledPreview, enabled: false },
    }), "outbound_calls_disabled");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes no provider request for a non-allowlisted Preview destination", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expectBlocked(createVapiCall(1, "+12125550101", "Test", baseOptions),
      "preview_destination_not_allowlisted");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes no provider request outside the calling window", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expectBlocked(createVapiCall(1, destination, "Test", {
      ...baseOptions,
      now: new Date("2026-07-29T03:00:00Z"),
    }), "outside_call_window");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes no provider request for a durable DNC match", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expectBlocked(createVapiCall(1, destination, "Test", {
      ...baseOptions,
      dncChecker: async () => true,
    }), "dnc");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an approved Preview call with the normalized destination", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "call_test", status: "queued", createdAt: "2026-07-29T16:00:00Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createVapiCall(1, "(212) 555-0100", "Test", {
      ...baseOptions,
      dncChecker: async () => false,
      callingConfig: {
        apiKey: "test-key",
        assistantId: "assistant-test",
        fromPhoneNumber: "phone-test",
        apiEndpoint: "https://api.vapi.ai/call",
      },
      lead: { propertyAddress: "1 Main Street, Boston, MA" },
      aiCallConfig: { elevenLabsVoiceId: null },
    });

    expect(result).toMatchObject({ id: "call_test", status: "queued" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.vapi.ai/call");
    const body = JSON.parse(String(request.body));
    expect(body.customer.number).toBe(destination);
    expect(body.assistantId).toBe("assistant-test");
  });

  it("fails closed without a provider request when DNC verification fails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expectBlocked(createVapiCall(1, destination, "Test", {
      ...baseOptions,
      dncChecker: async () => { throw new Error("database unavailable"); },
    }), "dnc_check_failed");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
