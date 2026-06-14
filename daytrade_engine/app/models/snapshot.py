from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Snapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    last: float
    bid: float | None = None
    ask: float | None = None
    spread_abs: float | None = None
    spread_bps: float | None = None
    day_volume: int | None = None
    prev_close: float | None = None
    change_pct: float | None = None
    timestamp: datetime
