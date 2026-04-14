from fastapi import FastAPI

from app.api.routes_backtest import router as backtest_router
from app.api.routes_daytrade import router as daytrade_router
from app.api.routes_health import router as health_router
from app.api.routes_watchlist import router as watchlist_router

app = FastAPI(title="Day Trade Engine")
app.include_router(health_router)
app.include_router(daytrade_router)
app.include_router(watchlist_router)
app.include_router(backtest_router)
