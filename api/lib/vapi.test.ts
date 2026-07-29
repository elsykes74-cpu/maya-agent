import { describe, expect, it } from "vitest";

import { buildVapiAssistantOverrides } from "./vapi-config";


describe("Vapi live-call overrides", () => {
  it("uses responsive endpointing and allows interruption of the opener", () => {
    const overrides = buildVapiAssistantOverrides(
      { sellerName: "Sam", street: "Main Street" },
      "Hi Sam, this is Maya.",
    );

    expect(overrides.firstMessage).toBe("Hi Sam, this is Maya.");
    expect(overrides.firstMessageInterruptionsEnabled).toBe(true);
    expect(overrides.backgroundSound).toBe("off");
    expect(overrides.startSpeakingPlan.waitSeconds).toBe(0.2);
    expect(overrides.startSpeakingPlan.transcriptionEndpointingPlan.onNoPunctuationSeconds).toBe(0.8);
    expect(overrides.stopSpeakingPlan).toMatchObject({
      numWords: 2,
      voiceSeconds: 0.2,
      backoffSeconds: 0.8,
    });
  });

  it("uses ElevenLabs Flash when a Maya voice ID is configured", () => {
    const overrides = buildVapiAssistantOverrides(
      { sellerName: "Sam" },
      "Hi Sam, this is Maya.",
      "configured-voice-id",
    );

    expect(overrides.voice).toEqual({
      provider: "11labs",
      voiceId: "configured-voice-id",
      model: "eleven_flash_v2_5",
      autoMode: true,
      optimizeStreamingLatency: 4,
      enableSsmlParsing: false,
    });
  });

  it("keeps the saved assistant voice when Maya has no voice ID", () => {
    const overrides = buildVapiAssistantOverrides({}, "Hi, this is Maya.");

    expect(overrides.voice).toBeUndefined();
  });
});
