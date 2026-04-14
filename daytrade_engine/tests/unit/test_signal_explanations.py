from datetime import datetime, timezone

from app.core.enums import Direction, SignalGrade, StrategyName
from app.models.signal import SignalCandidate
from app.utils.signal_explanations import build_explanation


def test_explanation_contains_strategy():
    c = SignalCandidate(strategy_name=StrategyName.VWAP_TREND_CONTINUATION, symbol='AMD', direction=Direction.LONG, timestamp=datetime.now(timezone.utc), grade=SignalGrade.B)
    assert 'VWAP_TREND_CONTINUATION' in build_explanation(c, 'TREND_UP')
