from __future__ import annotations

from datetime import datetime

from app.core.enums import Direction, MarketRegime, RecommendationStatus, StrategyName
from app.models.account_state import AccountState
from app.models.market_state import MarketState
from app.models.signal import SignalCandidate
from app.models.symbol_state import SymbolState
from app.models.trade_plan import TradePlan
from app.strategies.base_strategy import BaseStrategy


class VWAPTrendContinuationStrategy(BaseStrategy):
    name = StrategyName.VWAP_TREND_CONTINUATION
    enabled = True
    required_regimes = {MarketRegime.TREND_UP, MarketRegime.TREND_DOWN, MarketRegime.BREAKOUT_EXPANSION}

    def scan(self, universe_state: dict[str, SymbolState], market_state: MarketState) -> list[SignalCandidate]:
        out: list[SignalCandidate] = []
        for symbol, state in universe_state.items():
            f = state.features
            if not state.tradable:
                continue
            if f.get("session_vwap",0) < f.get("current_last",0) and float(f.get("rvol",0))>=1.5:
                out.append(
                    SignalCandidate(
                        strategy_name=self.name,
                        symbol=symbol,
                        pair_symbols=None,
                        asset_type=state.asset_type,
                        direction=Direction.LONG,
                        timestamp=datetime.now().astimezone(),
                        setup_quality_score=80,
                        regime_score=80,
                        liquidity_score=float(f.get("liquidity_score", 70)),
                        confidence_score=75,
                        raw_score=0,
                        final_score=82,
                        supporting_metrics={"rvol": f.get("rvol"), "vwap_slope_5": f.get("vwap_slope_5")},
                        explanation_seed=["above rising VWAP", "RVOL confirms", "trend structure intact"],
                    )
                )
        return out

    def score(self, candidate: SignalCandidate, universe_state: dict[str, SymbolState], market_state: MarketState) -> float:
        return candidate.final_score

    def build_trade_plan(self, candidate: SignalCandidate, universe_state: dict[str, SymbolState], market_state: MarketState, account_state: AccountState) -> TradePlan:
        last = universe_state[candidate.symbol].features.get("current_last", 0.0) if candidate.symbol else 0.0
        entry = float(last)
        stop = entry * (0.995 if candidate.direction == Direction.LONG else 1.005)
        risk = abs(entry - stop)
        return TradePlan(
            strategy_name=self.name,
            symbol=candidate.symbol,
            pair_symbols=candidate.pair_symbols,
            asset_type=candidate.asset_type,
            direction=candidate.direction,
            entry_type="market",
            entry_price=entry,
            stop_price=stop,
            target_1=entry + risk if candidate.direction == Direction.LONG else entry - risk,
            target_2=entry + 2 * risk if candidate.direction == Direction.LONG else entry - 2 * risk,
            max_hold_minutes=90,
            rr_ratio=2.0,
            explanation_text=f"{candidate.symbol} met {self.name.value} criteria.",
            invalidation_text="Invalidate on stop breach.",
            status=RecommendationStatus.ACTIVE,
        )

    def invalidate(self, candidate: SignalCandidate, symbol_state: SymbolState, market_state: MarketState) -> bool:
        return bool(symbol_state.features.get("recent_vwap_cross_count", 0) > 6)
