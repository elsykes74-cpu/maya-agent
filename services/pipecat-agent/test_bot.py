import unittest

from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy

from bot import build_user_aggregator_params


class TurnDetectionConfigurationTests(unittest.TestCase):
    def test_uses_smart_turn_v3_with_short_vad_stop(self) -> None:
        params = build_user_aggregator_params()

        self.assertIsNotNone(params.vad_analyzer)
        vad_analyzer = params.vad_analyzer
        assert vad_analyzer is not None
        self.assertEqual(vad_analyzer._params.stop_secs, 0.2)

        turn_strategies = params.user_turn_strategies
        assert turn_strategies is not None
        stop_strategies = turn_strategies.stop
        assert stop_strategies is not None
        self.assertEqual(len(stop_strategies), 1)

        strategy = stop_strategies[0]
        assert isinstance(strategy, TurnAnalyzerUserTurnStopStrategy)
        self.assertIsInstance(strategy._turn_analyzer, LocalSmartTurnAnalyzerV3)


if __name__ == "__main__":
    unittest.main()
