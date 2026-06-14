from app.models.signal import SignalCandidate


class RecommendationService:
    def rank(self, candidates: list[SignalCandidate], min_score: float = 65.0) -> list[SignalCandidate]:
        approved = [c for c in candidates if c.final_score >= min_score]
        return sorted(approved, key=lambda x: x.final_score, reverse=True)
