from pydantic import BaseModel, ConfigDict, Field


class AccountState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account_equity: float
    buying_power: float | None = None
    open_risk_dollars: float
    realized_pnl_today: float
    unrealized_pnl_today: float
    daily_drawdown_pct: float
    open_positions_by_symbol: dict[str, int] = Field(default_factory=dict)
    open_positions_by_sector: dict[str, float] = Field(default_factory=dict)
