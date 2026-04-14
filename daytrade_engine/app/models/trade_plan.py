from pydantic import BaseModel, ConfigDict

from app.core.enums import AssetType, Direction, RecommendationStatus, StrategyName


class TradePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy_name: StrategyName
    symbol: str | None = None
    pair_symbols: list[str] | None = None
    asset_type: AssetType | None = None
    direction: Direction
    entry_type: str
    entry_price: float | None = None
    stop_price: float | None = None
    target_1: float | None = None
    target_2: float | None = None
    max_hold_minutes: int
    risk_per_share: float | None = None
    risk_dollars: float | None = None
    position_size: int | None = None
    rr_ratio: float | None = None
    explanation_text: str
    invalidation_text: str
    status: RecommendationStatus
