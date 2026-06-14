# Day Trade Engine

Production-oriented intraday stocks/ETF engine with provider abstraction, strategies, risk controls, recommendations, APIs, backtesting hooks, and test coverage.

## Install
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Config
Edit YAML files under `config/` and `.env` for provider keys.

## Run API
```bash
uvicorn app.main:app --reload
```

## Smoke test
```bash
python scripts/smoke_test.py
```

## Backtest
```bash
python scripts/run_backtest.py --strategy all
```

## Provider switching
Set `active_provider` in `config/providers.yaml`.

## Free-data limits
yfinance may have delayed/partial intraday data and occasional missing bars.

## Upgrade path
Swap active provider to Alpaca/Finnhub/TwelveData and keep strategy logic unchanged.
