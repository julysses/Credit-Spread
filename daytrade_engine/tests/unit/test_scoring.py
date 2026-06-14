from app.core.enums import SignalGrade
from app.utils.scoring import score_candidate


def test_grade_mapping():
    score, grade = score_candidate(90, 90, 90, 90, 90, 90, 90)
    assert score >= 85
    assert grade == SignalGrade.A
