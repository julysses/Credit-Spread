from datetime import date

from pydantic import BaseModel, ConfigDict


class DailyBar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int
    adj_close: float | None = None
