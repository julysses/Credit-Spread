from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import AssetType, Direction, SignalGrade, StrategyName


class SignalCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy_name: StrategyName
    symbol: str | None = None
    pair_symbols: list[str] | None = None
    asset_type: AssetType | None = None
    direction: Direction
    timestamp: datetime
    setup_quality_score: float = 0.0
    regime_score: float = 0.0
    liquidity_score: float = 0.0
    confidence_score: float = 0.0
    raw_score: float = 0.0
    final_score: float = 0.0
    grade: SignalGrade = SignalGrade.SUPPRESSED
    supporting_metrics: dict[str, float | int | str | bool | None] = Field(default_factory=dict)
    rejection_reasons: list[str] = Field(default_factory=list)
    explanation_seed: list[str] = Field(default_factory=list)
