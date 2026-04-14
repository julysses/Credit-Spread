from pydantic import BaseModel, ConfigDict

from app.core.enums import AssetType


class SymbolMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    asset_type: AssetType
    exchange: str | None = None
    sector: str | None = None
    industry: str | None = None
    avg_daily_dollar_volume_20d: float | None = None
    is_leveraged_etf: bool = False
