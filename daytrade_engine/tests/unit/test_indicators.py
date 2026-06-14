import pytest

pd = pytest.importorskip('pandas')

from app.utils.indicators import compute_ema, compute_vwap


def test_compute_vwap_nonempty():
    df = pd.DataFrame({"close": [10, 11], "volume": [100, 200]})
    assert compute_vwap(df).iloc[-1] > 0


def test_compute_ema_nonempty():
    s = pd.Series([1, 2, 3])
    assert compute_ema(s, 2).iloc[-1] > 0
