from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import MarketRegime


class MarketState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ts: datetime
    regime: MarketRegime
    spy_above_vwap: bool | None = None
    spy_vwap_slope: float | None = None
    breadth_score: float | None = None
    volatility_score: float | None = None
    notes: list[str] = Field(default_factory=list)
