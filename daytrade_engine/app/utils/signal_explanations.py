from app.models.signal import SignalCandidate
from app.models.trade_plan import TradePlan


def build_explanation(candidate: SignalCandidate, regime: str) -> str:
    symbol = candidate.symbol or "/".join(candidate.pair_symbols or [])
    reasons = ", ".join(candidate.explanation_seed) or "rules satisfied"
    return f"{symbol} qualifies for {candidate.strategy_name.value} in {regime} because {reasons}."


def build_invalidation(plan: TradePlan) -> str:
    if plan.stop_price is None:
        return "Invalidate if structure degrades."
    return f"Invalidate if price breaches stop {plan.stop_price:.2f}."
