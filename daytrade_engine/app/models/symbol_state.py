from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import AssetType
from app.models.bar import IntradayBar
from app.models.daily_bar import DailyBar
from app.models.quote import Quote
from app.models.snapshot import Snapshot
from app.models.symbol_metadata import SymbolMetadata


class SymbolState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    asset_type: AssetType
    intraday_bars_1m: list[IntradayBar]
    intraday_bars_5m: list[IntradayBar]
    daily_bars: list[DailyBar]
    snapshot: Snapshot | None = None
    quote: Quote | None = None
    metadata: SymbolMetadata
    features: dict[str, float | int | str | bool | None] = Field(default_factory=dict)
    tradable: bool = True
    tradability_reasons: list[str] = Field(default_factory=list)
