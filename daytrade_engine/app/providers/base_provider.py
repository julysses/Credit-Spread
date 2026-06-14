from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.bar import IntradayBar
from app.models.daily_bar import DailyBar
from app.models.quote import Quote
from app.models.snapshot import Snapshot
from app.models.symbol_metadata import SymbolMetadata


class BaseMarketDataProvider(ABC):
    name: str

    @abstractmethod
    def get_intraday_bars(self, symbol: str, timeframe: str, lookback: int) -> list[IntradayBar]: ...

    @abstractmethod
    def get_daily_bars(self, symbol: str, lookback: int) -> list[DailyBar]: ...

    @abstractmethod
    def get_snapshot(self, symbol: str) -> Snapshot | None: ...

    @abstractmethod
    def get_quotes(self, symbol: str) -> Quote | None: ...

    @abstractmethod
    def get_market_status(self) -> dict: ...

    @abstractmethod
    def get_symbol_metadata(self, symbol: str) -> SymbolMetadata: ...

    @abstractmethod
    def get_universe_snapshots(self, symbols: list[str]) -> list[Snapshot]: ...

    @abstractmethod
    def stream_bars(self, symbols: list[str]) -> None: ...

    @abstractmethod
    def stream_quotes(self, symbols: list[str]) -> None: ...
