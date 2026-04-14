from app.models.market_state import MarketState
from app.models.signal import SignalCandidate
from app.models.symbol_state import SymbolState
from app.strategies.base_strategy import BaseStrategy


class StrategyEngine:
    def __init__(self, strategies: list[BaseStrategy]) -> None:
        self.strategies = strategies

    def scan(self, universe_state: dict[str, SymbolState], market_state: MarketState) -> list[SignalCandidate]:
        out: list[SignalCandidate] = []
        for strategy in self.strategies:
            if strategy.enabled and market_state.regime in strategy.required_regimes:
                out.extend(strategy.scan(universe_state, market_state))
        return out
