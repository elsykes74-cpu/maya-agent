import { describe, it, expect } from "vitest";
import {
  isRetryableOutcome,
  clampBatchSize,
  computeNextAttemptAt,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
} from "./dialer";

describe("isRetryableOutcome", () => {
  it("retries transient outcomes", () => {
    for (const outcome of ["no_answer", "busy", "voicemail", "failed"]) {
      expect(isRetryableOutcome(outcome)).toBe(true);
    }
  });

  it("never retries terminal outcomes", () => {
    for (const outcome of ["answered", "appointment_set", "not_interested", "dnc"]) {
      expect(isRetryableOutcome(outcome)).toBe(false);
    }
  });

  it("treats missing outcomes as non-retryable", () => {
    expect(isRetryableOutcome(null)).toBe(false);
    expect(isRetryableOutcome(undefined)).toBe(false);
    expect(isRetryableOutcome("")).toBe(false);
  });
});

describe("clampBatchSize", () => {
  it("defaults when unset or invalid", () => {
    expect(clampBatchSize(undefined)).toBe(DEFAULT_BATCH_SIZE);
    expect(clampBatchSize(null)).toBe(DEFAULT_BATCH_SIZE);
    expect(clampBatchSize("nope")).toBe(DEFAULT_BATCH_SIZE);
    expect(clampBatchSize(0)).toBe(DEFAULT_BATCH_SIZE);
    expect(clampBatchSize(-3)).toBe(DEFAULT_BATCH_SIZE);
  });

  it("caps at the maximum so one tick can't dial a whole campaign", () => {
    expect(clampBatchSize(500)).toBe(MAX_BATCH_SIZE);
  });

  it("accepts sane values, flooring fractions", () => {
    expect(clampBatchSize(3)).toBe(3);
    expect(clampBatchSize("7")).toBe(7);
    expect(clampBatchSize(2.9)).toBe(2);
  });
});

describe("computeNextAttemptAt", () => {
  const now = new Date("2026-07-04T12:00:00Z");

  it("uses the campaign's cadence", () => {
    expect(computeNextAttemptAt(now, 48).toISOString()).toBe("2026-07-06T12:00:00.000Z");
    expect(computeNextAttemptAt(now, 24).toISOString()).toBe("2026-07-05T12:00:00.000Z");
  });

  it("defaults to 48h when the campaign has no interval", () => {
    expect(computeNextAttemptAt(now, null).toISOString()).toBe("2026-07-06T12:00:00.000Z");
    expect(computeNextAttemptAt(now, undefined).toISOString()).toBe("2026-07-06T12:00:00.000Z");
  });

  it("enforces a minimum spacing so a bad config can't hammer a seller", () => {
    const next = computeNextAttemptAt(now, 0);
    expect(next.getTime() - now.getTime()).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});
