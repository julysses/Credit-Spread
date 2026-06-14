from datetime import datetime

from pydantic import BaseModel, Field


class BacktestTrade(BaseModel):
    symbol: str
    entry_ts: datetime
    exit_ts: datetime
    pnl: float
    regime: str
    grade: str


class BacktestReport(BaseModel):
    total_return: float
    win_rate: float
    expectancy: float
    average_win: float
    average_loss: float
    profit_factor: float
    max_drawdown: float
    average_hold_time_minutes: float
    trades_per_day: float
    performance_by_regime: dict[str, float] = Field(default_factory=dict)
    performance_by_symbol: dict[str, float] = Field(default_factory=dict)
    performance_by_hour_of_day: dict[str, float] = Field(default_factory=dict)
    longs_vs_shorts: dict[str, float] = Field(default_factory=dict)
    grade_buckets: dict[str, int] = Field(default_factory=dict)
