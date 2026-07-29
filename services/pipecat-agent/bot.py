import os

from loguru import logger
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.elevenlabs.stt import ElevenLabsRealtimeSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams
from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.workers.runner import WorkerRunner

SYSTEM_PROMPT = """You are Maya, an AI calling assistant for Erick's local property team.
Speak naturally in one or two short sentences maximum. Ask one question at a time.
Start substantive replies with a brief, varied acknowledgment when it fits. Never
list options, explain more than one thing, summarize the seller's answers back to
them, or force conversation stages in sequence. Treat stages as flexible goals.
Respond directly to what the caller said. Treat 'yeah', 'right', and 'uh-huh' as
acknowledgements. Never restart the script after an interruption or correction.
Identify yourself as an AI assistant when asked and never claim to be human.
If the caller is busy or uninterested, be polite and end the call without pressure.
Never discuss contract terms or guarantee a price. Do not use markdown.
If the caller asks not to be called, acknowledge the request and end immediately.
"""

TRANSPORT_PARAMS = {
    "twilio": lambda: FastAPIWebsocketParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
    ),
}


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def call_parameters(runner_args: RunnerArguments) -> dict[str, str]:
    call_data = getattr(runner_args, "call_data", None)
    body = getattr(call_data, "body", None) if call_data else None
    return {str(key): str(value) for key, value in (body or {}).items()}


def build_user_aggregator_params() -> LLMUserAggregatorParams:
    return LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
        user_turn_strategies=UserTurnStrategies(
            stop=[
                TurnAnalyzerUserTurnStopStrategy(
                    turn_analyzer=LocalSmartTurnAnalyzerV3(),
                )
            ]
        ),
    )


async def run_agent(transport: BaseTransport, runner_args: RunnerArguments) -> None:
    parameters = call_parameters(runner_args)
    name = parameters.get("name", "").strip()
    address = parameters.get("address", "").strip()
    property_reference = f"the property on {address}" if address else "your property"
    greeting = (
        f"Greet {name} and introduce yourself as Maya, an AI assistant calling for "
        f"Erick's local property team about {property_reference}. Ask whether now is an "
        "okay time for one quick question."
    )

    elevenlabs_key = required_env("ELEVENLABS_API_KEY")
    stt = ElevenLabsRealtimeSTTService(
        api_key=elevenlabs_key,
        sample_rate=8000,
        settings=ElevenLabsRealtimeSTTService.Settings(
            model="scribe_v2_realtime",
            language="en",
            keyterms=["Maya", "Erick", "property"],
        ),
    )
    llm = AnthropicLLMService(
        api_key=required_env("ANTHROPIC_API_KEY"),
        settings=AnthropicLLMService.Settings(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
            system_instruction=SYSTEM_PROMPT,
            max_tokens=80,
            temperature=0.65,
        ),
        retry_timeout_secs=4.0,
        retry_on_timeout=False,
    )
    tts = ElevenLabsTTSService(
        api_key=elevenlabs_key,
        sample_rate=8000,
        auto_mode=True,
        settings=ElevenLabsTTSService.Settings(
            voice=required_env("ELEVENLABS_VOICE_ID"),
            model="eleven_flash_v2_5",
            language="en",
            stability=0.45,
            similarity_boost=0.8,
            style=0.0,
            use_speaker_boost=True,
            speed=1.0,
        ),
    )

    context = LLMContext(messages=[{"role": "user", "content": greeting}])
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=build_user_aggregator_params(),
    )
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            aggregators.user(),
            llm,
            tts,
            transport.output(),
            aggregators.assistant(),
        ]
    )
    worker = PipelineWorker(
        pipeline,
        name="maya",
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )
    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport, _client):
        logger.info("Twilio media stream connected; starting Maya greeting")
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport, _client):
        logger.info("Twilio media stream disconnected")
        await worker.cancel()

    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments) -> None:
    transport = await create_transport(runner_args, TRANSPORT_PARAMS)
    await run_agent(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
