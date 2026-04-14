from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Quote(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    bid: float
    ask: float
    bid_size: int | None = None
    ask_size: int | None = None
    timestamp: datetime
