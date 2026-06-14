from app.utils.liquidity import liquidity_score


def test_liquidity_score_bounds():
    s = liquidity_score(10, 100_000_000)
    assert 0 <= s <= 100
