from app.core.config_loader import ConfigBundle
from app.models.symbol_state import SymbolState
from app.providers.base_provider import BaseMarketDataProvider


class MarketDataService:
    def __init__(self, provider: BaseMarketDataProvider, config: ConfigBundle) -> None:
        self.provider = provider
        self.config = config

    def load_symbol_state(self, symbol: str) -> SymbolState:
        bars_1m = self.provider.get_intraday_bars(symbol, "1m", self.config.app.intraday_lookback)
        bars_5m = self.provider.get_intraday_bars(symbol, "5m", self.config.app.intraday_lookback // 5)
        daily = self.provider.get_daily_bars(symbol, self.config.app.daily_lookback)
        snapshot = self.provider.get_snapshot(symbol)
        quote = self.provider.get_quotes(symbol)
        meta = self.provider.get_symbol_metadata(symbol)
        return SymbolState(symbol=symbol, asset_type=meta.asset_type, intraday_bars_1m=bars_1m, intraday_bars_5m=bars_5m, daily_bars=daily, snapshot=snapshot, quote=quote, metadata=meta)
