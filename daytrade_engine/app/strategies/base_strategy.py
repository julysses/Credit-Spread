from __future__ import annotations

from abc import ABC, abstractmethod

from app.core.enums import MarketRegime, StrategyName
from app.models.account_state import AccountState
from app.models.market_state import MarketState
from app.models.signal import SignalCandidate
from app.models.symbol_state import SymbolState
from app.models.trade_plan import TradePlan


class BaseStrategy(ABC):
    name: StrategyName
    enabled: bool
    required_regimes: set[MarketRegime]

    @abstractmethod
    def scan(self, universe_state: dict[str, SymbolState], market_state: MarketState) -> list[SignalCandidate]: ...

    @abstractmethod
    def score(self, candidate: SignalCandidate, universe_state: dict[str, SymbolState], market_state: MarketState) -> float: ...

    @abstractmethod
    def build_trade_plan(self, candidate: SignalCandidate, universe_state: dict[str, SymbolState], market_state: MarketState, account_state: AccountState) -> TradePlan: ...

    @abstractmethod
    def invalidate(self, candidate: SignalCandidate, symbol_state: SymbolState, market_state: MarketState) -> bool: ...
