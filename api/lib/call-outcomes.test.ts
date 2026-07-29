import { describe, expect, it } from "vitest";

import { safeTwilioDiagnostic, terminalOutcomeForStatus } from "./call-outcomes";

describe("terminal call outcomes", () => {
  it.each([
    ["completed", 2, "conversation_completed"],
    ["completed", 1, "completed_without_conversation"],
    ["busy", 0, "busy"],
    ["no-answer", 0, "no_answer"],
    ["failed", 0, "failed"],
    ["canceled", 0, "canceled"],
  ])("maps %s with %i turns", (status, turns, expected) => {
    expect(terminalOutcomeForStatus(status, turns)).toBe(expected);
  });

  it("does not mark intermediate states terminal", () => {
    expect(terminalOutcomeForStatus("ringing", 0)).toBeNull();
    expect(terminalOutcomeForStatus("answered", 0)).toBeNull();
  });

  it("bounds provider diagnostics", () => {
    expect(safeTwilioDiagnostic("  error  ")).toBe("error");
    expect(safeTwilioDiagnostic("abcdef", 3)).toBe("abc");
    expect(safeTwilioDiagnostic({ secret: "hidden" })).toBeUndefined();
  });
});
