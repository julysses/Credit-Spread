from app.services.backtest_service import BacktestService


def test_backtest_empty():
    r = BacktestService().run([])
    assert r.total_return == 0
