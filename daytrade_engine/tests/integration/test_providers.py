import pytest

pytest.importorskip('yfinance')

from app.providers.alpaca_provider import AlpacaProvider
from app.providers.yfinance_provider import YFinanceProvider


def test_provider_names():
    assert YFinanceProvider().name == 'yfinance'
    assert AlpacaProvider().name == 'alpaca'
