from fastapi import APIRouter

router = APIRouter(prefix='/daytrade')


@router.get('/regime')
def regime() -> dict:
    return {"regime": "RANGE"}


@router.get('/recommendations')
def recommendations() -> list[dict]:
    return []


@router.get('/recommendations/{symbol}')
def recommendation_by_symbol(symbol: str) -> dict:
    return {"symbol": symbol}


@router.get('/symbol/{symbol}')
def symbol_detail(symbol: str) -> dict:
    return {"symbol": symbol}


@router.get('/provider-status')
def provider_status() -> dict:
    return {"provider": "yfinance", "status": "ok"}
