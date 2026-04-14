from pydantic import BaseModel, ConfigDict, Field

from app.models.symbol_state import SymbolState


class PairState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    leg_a: SymbolState
    leg_b: SymbolState
    features: dict[str, float | int | str | bool | None] = Field(default_factory=dict)
    tradable: bool = True
    tradability_reasons: list[str] = Field(default_factory=list)
