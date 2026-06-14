from fastapi import APIRouter

router = APIRouter(prefix='/daytrade/backtest')


@router.post('/strategy')
def backtest_strategy() -> dict:
    return {"status": "queued"}


@router.post('/portfolio')
def backtest_portfolio() -> dict:
    return {"status": "queued"}
