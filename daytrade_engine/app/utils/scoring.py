from app.core.enums import SignalGrade


def score_candidate(setup_quality: float, regime_fit: float, liquidity_quality: float, volume_confirmation: float, relative_strength: float, reward_to_risk: float, execution_confidence: float) -> tuple[float, SignalGrade]:
    final = (
        0.25 * setup_quality
        + 0.20 * regime_fit
        + 0.15 * liquidity_quality
        + 0.15 * volume_confirmation
        + 0.10 * relative_strength
        + 0.10 * reward_to_risk
        + 0.05 * execution_confidence
    )
    if final >= 85:
        grade = SignalGrade.A
    elif final >= 75:
        grade = SignalGrade.B
    elif final >= 65:
        grade = SignalGrade.C
    else:
        grade = SignalGrade.SUPPRESSED
    return round(final, 4), grade
