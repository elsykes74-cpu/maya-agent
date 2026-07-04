import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isWithinCallWindow } from "./vapi";

// isWithinCallWindow compares "HH:MM" strings in the configured timezone.
// 2026-01-15 is in EST (UTC-5), so 17:00Z = 12:00 in America/New_York.
describe("isWithinCallWindow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows calls in the middle of the window", () => {
    vi.setSystemTime(new Date("2026-01-15T17:00:00Z")); // 12:00 EST
    expect(isWithinCallWindow("09:00", "19:00", "America/New_York")).toBe(true);
  });

  it("blocks calls after the window closes", () => {
    vi.setSystemTime(new Date("2026-01-16T01:30:00Z")); // 20:30 EST on Jan 15
    expect(isWithinCallWindow("09:00", "19:00", "America/New_York")).toBe(false);
  });

  it("blocks early-morning calls before the window opens", () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z")); // 07:00 EST
    expect(isWithinCallWindow("09:00", "19:00", "America/New_York")).toBe(false);
  });

  it("treats the window boundaries as inclusive", () => {
    vi.setSystemTime(new Date("2026-01-15T14:00:00Z")); // 09:00 EST exactly
    expect(isWithinCallWindow("09:00", "19:00", "America/New_York")).toBe(true);
  });

  it("respects the configured timezone", () => {
    vi.setSystemTime(new Date("2026-01-15T17:00:00Z")); // 09:00 PST / 12:00 EST
    expect(isWithinCallWindow("10:00", "19:00", "America/Los_Angeles")).toBe(false);
    expect(isWithinCallWindow("10:00", "19:00", "America/New_York")).toBe(true);
  });
});
