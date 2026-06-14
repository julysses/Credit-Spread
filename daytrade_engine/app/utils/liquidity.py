def liquidity_score(spread_bps: float | None, dollar_volume: float | None) -> float:
    if spread_bps is None or dollar_volume is None:
        return 0.0
    spread_component = max(0.0, 1 - spread_bps / 50)
    volume_component = min(1.0, dollar_volume / 100_000_000)
    return (spread_component * 0.5 + volume_component * 0.5) * 100
