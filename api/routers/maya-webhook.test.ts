import { describe, expect, it } from "vitest";

import { guardedGather, isDncRequest } from "./maya-webhook";

describe("Maya voice safety policy", () => {
  it("keeps the gather open for short greetings and permits barge-in", () => {
    const xml = guardedGather("https://maya.example.com/respond?a=1&b=2", "<Pause length=\"1\"/>");
    expect(xml).toContain('input="speech"');
    expect(xml).toContain('speechModel="experimental_utterances"');
    expect(xml).toContain('speechTimeout="2"');
    expect(xml).toContain('bargeIn="true"');
    expect(xml).toContain('action="https://maya.example.com/respond?a=1&amp;b=2"');
  });

  it.each([
    "Do not call me again",
    "don't call this number",
    "Please remove me",
    "take me off your list",
    "I want to opt out",
    "stop calling",
    "never call again",
  ])("detects DNC request: %s", (speech) => {
    expect(isDncRequest(speech)).toBe(true);
  });

  it.each(["hello", "yeah", "not right now", "call me tomorrow"])(
    "does not misclassify normal speech as DNC: %s",
    (speech) => {
      expect(isDncRequest(speech)).toBe(false);
    },
  );
});
