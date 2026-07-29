# Maya Pipecat voice agent

This service replaces Twilio `<Gather>/<Play>` turn-taking with a continuous,
bidirectional Twilio Media Stream handled by Pipecat.

## Why it is separate

Maya's control plane runs on Vercel. Vercel Functions do not host the persistent
WebSocket required for a full telephone call, so this agent must run on Pipecat
Cloud or another container host with public `wss://` support.

## Required environment variables

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `ANTHROPIC_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`

Optional: `ANTHROPIC_MODEL`.

Never commit those values. The agent uses realtime ElevenLabs transcription,
streaming Anthropic responses, and direct 8 kHz PCM ElevenLabs output. It queues
its greeting as soon as Twilio connects rather than waiting for a first transcript.

## Why the live path does not use local Whisper

OpenAI Whisper is MIT-licensed and is a strong option for offline call recording
transcription. The upstream implementation processes audio in sliding 30-second
windows, while Pipecat's local Whisper adapter is a `SegmentedSTTService` that
runs only after VAD closes an utterance. It therefore does not provide the native
streaming interim/final transcript behavior needed to capture short first turns
and support low-latency interruption on live telephone calls.

Keep realtime ElevenLabs STT in the live pipeline. Whisper can be added later as
an asynchronous post-call transcript or audit fallback without delaying callers
or adding a GPU requirement to every active media worker.

## Turn detection

The Pipecat path explicitly combines Silero VAD (`stop_secs=0.2`) with the bundled
`LocalSmartTurnAnalyzerV3`. Smart Turn analyzes the caller's recent waveform after
a pause and distinguishes a completed turn from hesitation such as “um…” before
Maya responds. Pipecat automatically resamples Twilio's 8 kHz media for the model.

## Local verification

```bash
uv sync
uv run ruff check .
uv run pyright
uv run bot.py -t twilio -x YOUR_PUBLIC_TUNNEL_HOST
```

## Activation gate

After deploying the agent, set Maya's `PIPECAT_WEBSOCKET_URL` to its public
`wss://.../ws` endpoint in Preview only. Until that variable is present and
valid, Maya keeps its existing Twilio flow. Do not activate Production before a
controlled call verifies first-greeting capture, barge-in, DNC persistence,
latency, and audio quality.
