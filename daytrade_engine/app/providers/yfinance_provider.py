from __future__ import annotations

from datetime import datetime

import yfinance as yf
from tenacity import retry, stop_after_attempt, wait_fixed

from app.core.constants import NY_TZ
from app.core.enums import AssetType
from app.models.bar import IntradayBar
from app.models.daily_bar import DailyBar
from app.models.quote import Quote
from app.models.snapshot import Snapshot
from app.models.symbol_metadata import SymbolMetadata
from app.providers.base_provider import BaseMarketDataProvider
from app.utils.indicators import compute_spread_bps


class YFinanceProvider(BaseMarketDataProvider):
    name = "yfinance"

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    def get_intraday_bars(self, symbol: str, timeframe: str, lookback: int) -> list[IntradayBar]:
        period = "5d" if timeframe == "1m" else "1mo"
        df = yf.Ticker(symbol).history(interval=timeframe, period=period).tail(lookback)
        bars: list[IntradayBar] = []
        for idx, row in df.reset_index().iterrows():
            ts = row["Datetime"].tz_convert(NY_TZ) if getattr(row["Datetime"], "tzinfo", None) else row["Datetime"].tz_localize(NY_TZ)
            bars.append(IntradayBar(symbol=symbol, ts=ts.to_pydatetime(), open=float(row["Open"]), high=float(row["High"]), low=float(row["Low"]), close=float(row["Close"]), volume=int(row["Volume"]), bar_index=int(idx), session_date=ts.date(), is_regular_session=True))
        unique = {b.ts: b for b in bars}
        return [unique[k] for k in sorted(unique)]

    def get_daily_bars(self, symbol: str, lookback: int) -> list[DailyBar]:
        df = yf.Ticker(symbol).history(interval="1d", period="6mo").tail(lookback)
        return [DailyBar(symbol=symbol, date=i.date(), open=float(r.Open), high=float(r.High), low=float(r.Low), close=float(r.Close), volume=int(r.Volume), adj_close=float(r.get("Adj Close", r.Close))) for i, r in df.iterrows()]

    def get_snapshot(self, symbol: str) -> Snapshot | None:
        fi = yf.Ticker(symbol).fast_info
        last = float(fi.get("lastPrice") or 0)
        prev_close = fi.get("previousClose")
        change_pct = ((last / prev_close) - 1) if prev_close else None
        now = datetime.now(tz=NY_TZ)
        return Snapshot(symbol=symbol, last=last, day_volume=fi.get("lastVolume"), prev_close=prev_close, change_pct=change_pct, timestamp=now)

    def get_quotes(self, symbol: str) -> Quote | None:
        s = self.get_snapshot(symbol)
        if not s:
            return None
        bid = s.last * 0.999
        ask = s.last * 1.001
        return Quote(symbol=symbol, bid=bid, ask=ask, timestamp=s.timestamp)

    def get_market_status(self) -> dict:
        return {"open": True, "provider": self.name}

    def get_symbol_metadata(self, symbol: str) -> SymbolMetadata:
        info = yf.Ticker(symbol).info
        asset_type = AssetType.ETF if info.get("quoteType") == "ETF" else AssetType.STOCK
        return SymbolMetadata(symbol=symbol, asset_type=asset_type, exchange=info.get("exchange"), sector=info.get("sector"), industry=info.get("industry"), avg_daily_dollar_volume_20d=None, is_leveraged_etf=symbol in {"TQQQ", "SQQQ", "UPRO", "SPXU", "SDS", "UVXY", "SVXY"})

    def get_universe_snapshots(self, symbols: list[str]) -> list[Snapshot]:
        return [s for s in (self.get_snapshot(symbol) for symbol in symbols) if s]

    def stream_bars(self, symbols: list[str]) -> None:
        return None

    def stream_quotes(self, symbols: list[str]) -> None:
        return None
