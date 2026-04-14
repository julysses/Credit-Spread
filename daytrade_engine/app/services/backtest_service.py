from __future__ import annotations

from collections import defaultdict

from app.models.backtest_models import BacktestReport, BacktestTrade


class BacktestService:
    def run(self, trades: list[BacktestTrade]) -> BacktestReport:
        if not trades:
            return BacktestReport(total_return=0, win_rate=0, expectancy=0, average_win=0, average_loss=0, profit_factor=0, max_drawdown=0, average_hold_time_minutes=0, trades_per_day=0)
        pnls = [t.pnl for t in trades]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]
        by_symbol = defaultdict(float)
        by_regime = defaultdict(float)
        for t in trades:
            by_symbol[t.symbol] += t.pnl
            by_regime[t.regime] += t.pnl
        return BacktestReport(
            total_return=sum(pnls),
            win_rate=len(wins) / len(pnls),
            expectancy=sum(pnls) / len(pnls),
            average_win=sum(wins) / len(wins) if wins else 0,
            average_loss=sum(losses) / len(losses) if losses else 0,
            profit_factor=(sum(wins) / abs(sum(losses))) if losses and sum(losses) != 0 else 0,
            max_drawdown=min(0.0, min(pnls)),
            average_hold_time_minutes=sum((t.exit_ts - t.entry_ts).total_seconds() for t in trades) / len(trades) / 60,
            trades_per_day=len(trades),
            performance_by_regime=dict(by_regime),
            performance_by_symbol=dict(by_symbol),
        )
