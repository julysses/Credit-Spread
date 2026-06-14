from datetime import datetime

from app.core.enums import MarketRegime
from app.models.market_state import MarketState


class RegimeService:
    def classify(self, spy_features: dict[str, float | int | str | bool | None]) -> MarketState:
        slope = float(spy_features.get("vwap_slope_10") or 0)
        crosses = int(spy_features.get("recent_vwap_cross_count") or 0)
        vol = float(spy_features.get("realized_intraday_vol") or 0)
        above = bool(spy_features.get("current_last", 0) >= spy_features.get("session_vwap", 0))
        notes: list[str] = []
        if vol > 0.03:
            regime = MarketRegime.HIGH_VOL_UNSTABLE
            notes.append("High realized volatility")
        elif crosses > 8:
            regime = MarketRegime.MEAN_REVERTING
            notes.append("Frequent VWAP recrosses")
        elif slope > 0 and above:
            regime = MarketRegime.TREND_UP
            notes.append("SPY above rising VWAP")
        elif slope < 0 and not above:
            regime = MarketRegime.TREND_DOWN
            notes.append("SPY below falling VWAP")
        else:
            regime = MarketRegime.RANGE
            notes.append("Balanced intraday rotation")
        return MarketState(ts=datetime.now().astimezone(), regime=regime, spy_above_vwap=above, spy_vwap_slope=slope, notes=notes)
