from fastapi import APIRouter

router = APIRouter(prefix='/daytrade')


@router.get('/watchlist')
def watchlist() -> dict:
    return {"symbols": []}
