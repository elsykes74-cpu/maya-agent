export interface VapiStartSpeakingPlan {
  waitSeconds: number;
  transcriptionEndpointingPlan: {
    onPunctuationSeconds: number;
    onNoPunctuationSeconds: number;
    onNumberSeconds: number;
  };
}

export interface VapiStopSpeakingPlan {
  numWords: number;
  voiceSeconds: number;
  backoffSeconds: number;
  acknowledgementPhrases: string[];
}

export interface VapiAssistantOverrides {
  variableValues: Record<string, string | number | boolean | null>;
  firstMessage: string;
  firstMessageInterruptionsEnabled: true;
  backgroundSound: "off";
  voice?: {
    provider: "11labs";
    voiceId: string;
    model: "eleven_flash_v2_5";
    autoMode: true;
    optimizeStreamingLatency: 4;
    enableSsmlParsing: false;
  };
  startSpeakingPlan: VapiStartSpeakingPlan;
  stopSpeakingPlan: VapiStopSpeakingPlan;
}

const NATURAL_VOICE_PIPELINE = {
  startSpeakingPlan: {
    waitSeconds: 0.2,
    transcriptionEndpointingPlan: {
      onPunctuationSeconds: 0.2,
      onNoPunctuationSeconds: 0.8,
      onNumberSeconds: 0.8,
    },
  },
  stopSpeakingPlan: {
    numWords: 2,
    voiceSeconds: 0.2,
    backoffSeconds: 0.8,
    acknowledgementPhrases: ["okay", "right", "uh-huh", "yeah", "mm-hmm", "got it"],
  },
} satisfies {
  startSpeakingPlan: VapiStartSpeakingPlan;
  stopSpeakingPlan: VapiStopSpeakingPlan;
};

export function buildVapiAssistantOverrides(
  variableValues: Record<string, string | number | boolean | null>,
  firstMessage: string,
  elevenLabsVoiceId?: string | null,
): VapiAssistantOverrides {
  const voiceId = elevenLabsVoiceId?.trim();
  return {
    variableValues,
    firstMessage,
    firstMessageInterruptionsEnabled: true,
    backgroundSound: "off",
    ...(voiceId
      ? {
          voice: {
            provider: "11labs" as const,
            voiceId,
            model: "eleven_flash_v2_5" as const,
            autoMode: true as const,
            optimizeStreamingLatency: 4 as const,
            enableSsmlParsing: false as const,
          },
        }
      : {}),
    ...NATURAL_VOICE_PIPELINE,
  };
}
