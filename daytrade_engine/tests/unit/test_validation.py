from datetime import date, datetime, timezone

from app.models.bar import IntradayBar
from app.utils.validation import bars_are_ordered


def test_ordered_bars():
    bars = [IntradayBar(symbol='A', ts=datetime(2024,1,1,tzinfo=timezone.utc), open=1, high=1, low=1, close=1, volume=1, bar_index=0, session_date=date(2024,1,1), is_regular_session=True)]
    assert bars_are_ordered(bars)
