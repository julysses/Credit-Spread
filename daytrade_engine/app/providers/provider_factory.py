from app.core.config_loader import ConfigBundle
from app.providers.alpaca_provider import AlpacaProvider
from app.providers.alphavantage_provider import AlphavantageProvider
from app.providers.base_provider import BaseMarketDataProvider
from app.providers.finnhub_provider import FinnhubProvider
from app.providers.twelvedata_provider import TwelvedataProvider
from app.providers.yfinance_provider import YFinanceProvider


def build_provider(config: ConfigBundle) -> BaseMarketDataProvider:
    mapping = {
        "yfinance": YFinanceProvider,
        "alpaca": AlpacaProvider,
        "finnhub": FinnhubProvider,
        "twelvedata": TwelvedataProvider,
        "alphavantage": AlphavantageProvider,
    }
    cls = mapping.get(config.providers.active_provider, YFinanceProvider)
    return cls()
