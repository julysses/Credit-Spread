from app.models.bar import IntradayBar


def bars_are_ordered(bars: list[IntradayBar]) -> bool:
    return all(bars[i].ts <= bars[i + 1].ts for i in range(len(bars) - 1))
