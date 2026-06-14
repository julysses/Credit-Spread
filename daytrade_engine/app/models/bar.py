from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class IntradayBar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    bar_index: int
    session_date: date
    is_regular_session: bool
