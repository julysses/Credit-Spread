from app.strategies.vwap_trend_continuation import VWAPTrendContinuationStrategy


def test_strategy_enabled():
    assert VWAPTrendContinuationStrategy().enabled
