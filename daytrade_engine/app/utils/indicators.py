from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd


def compute_vwap(df: pd.DataFrame) -> pd.Series:
    pv = (df["close"] * df["volume"]).cumsum()
    v = df["volume"].cumsum().replace(0, np.nan)
    return pv / v


def compute_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    tr = pd.concat([(df["high"] - df["low"]), (df["high"] - df["close"].shift(1)).abs(), (df["low"] - df["close"].shift(1)).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def compute_rvol(current_volume: float, avg_volume: float) -> float:
    return float(current_volume / avg_volume) if avg_volume > 0 else 0.0


def compute_zscore(values: Iterable[float]) -> np.ndarray:
    arr = np.array(list(values), dtype=float)
    std = arr.std()
    return (arr - arr.mean()) / (std if std else 1.0)


def compute_opening_range(df: pd.DataFrame, bars: int = 5) -> tuple[float, float]:
    rng = df.head(bars)
    return float(rng["high"].max()), float(rng["low"].min())


def compute_trend_consistency_score(highs: pd.Series, lows: pd.Series) -> float:
    hh = (highs.diff() > 0).mean()
    hl = (lows.diff() > 0).mean()
    return float((hh + hl) * 50)


def compute_relative_strength(symbol_return: float, benchmark_return: float) -> float:
    return float(symbol_return - benchmark_return)


def compute_spread_bps(bid: float | None, ask: float | None, last: float | None = None) -> float | None:
    if bid is None or ask is None:
        return None
    mid = ((bid + ask) / 2) if last is None else last
    return ((ask - bid) / mid) * 10000 if mid else None


def compute_rolling_correlation(a: pd.Series, b: pd.Series, window: int = 30) -> pd.Series:
    return a.rolling(window).corr(b)


def compute_rolling_beta(a: pd.Series, b: pd.Series, window: int = 30) -> pd.Series:
    cov = a.rolling(window).cov(b)
    var = b.rolling(window).var()
    return cov / var.replace(0, np.nan)


def compute_pair_spread(a: pd.Series, b: pd.Series, hedge_ratio: float) -> pd.Series:
    return a - hedge_ratio * b


def compute_session_features(df: pd.DataFrame) -> dict[str, float]:
    return {
        "session_open": float(df["open"].iloc[0]),
        "current_last": float(df["close"].iloc[-1]),
        "session_high": float(df["high"].max()),
        "session_low": float(df["low"].min()),
        "session_range": float(df["high"].max() - df["low"].min()),
    }
