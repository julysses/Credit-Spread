from datetime import datetime

from app.core.config_loader import RiskConfig
from app.core.enums import MarketRegime, RecommendationStatus
from app.models.account_state import AccountState
from app.models.market_state import MarketState
from app.models.trade_plan import TradePlan


class RiskService:
    def __init__(self, config: RiskConfig):
        self.config = config

    def apply(self, plan: TradePlan, account: AccountState, market_state: MarketState, spread_bps: float | None = None) -> TradePlan:
        if market_state.regime == MarketRegime.NO_TRADE or account.daily_drawdown_pct >= self.config.max_daily_drawdown_pct:
            plan.status = RecommendationStatus.REJECTED
            return plan
        if spread_bps and spread_bps > self.config.max_spread_bps:
            plan.status = RecommendationStatus.REJECTED
            return plan
        if plan.entry_price is None or plan.stop_price is None:
            plan.status = RecommendationStatus.REJECTED
            return plan
        risk_per_share = abs(plan.entry_price - plan.stop_price)
        risk_dollars = account.account_equity * min(self.config.risk_per_trade_pct, self.config.hard_max_risk_per_trade_pct)
        size = int(risk_dollars // risk_per_share) if risk_per_share > 0 else 0
        if size <= 0:
            plan.status = RecommendationStatus.REJECTED
            return plan
        plan.risk_per_share = risk_per_share
        plan.risk_dollars = risk_dollars
        plan.position_size = size
        plan.status = RecommendationStatus.ACTIVE
        return plan
