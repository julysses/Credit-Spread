from app.models.backtest_models import BacktestReport


def report_to_dict(report: BacktestReport) -> dict:
    return report.model_dump()
