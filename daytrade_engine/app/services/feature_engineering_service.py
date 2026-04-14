from __future__ import annotations

import pandas as pd

from app.models.symbol_state import SymbolState
from app.utils.indicators import compute_atr, compute_ema, compute_opening_range, compute_session_features, compute_vwap
from app.utils.liquidity import liquidity_score


class FeatureEngineeringService:
    def enrich(self, state: SymbolState, spy_return_intraday: float = 0.0) -> SymbolState:
        df = pd.DataFrame([b.model_dump() for b in state.intraday_bars_1m])
        if df.empty:
            state.tradable = False
            state.tradability_reasons.append("NO_INTRADAY_DATA")
            return state
        session = compute_session_features(df)
        vwap = compute_vwap(df)
        df5 = pd.DataFrame([b.model_dump() for b in state.intraday_bars_5m])
        or5h, or5l = compute_opening_range(df, 5)
        or15h, or15l = compute_opening_range(df, min(15, len(df)))
        atr_d = compute_atr(pd.DataFrame([d.model_dump() for d in state.daily_bars]).rename(columns={"date": "ts"}))
        last = float(df["close"].iloc[-1])
        spread_bps = None if not state.quote else ((state.quote.ask - state.quote.bid) / last) * 10000
        state.features.update({
            **session,
            "prev_close": float(state.daily_bars[-2].close) if len(state.daily_bars) > 1 else last,
            "gap_pct": ((session["session_open"] / float(state.daily_bars[-1].close)) - 1) if state.daily_bars else 0.0,
            "elapsed_minutes": len(df),
            "or_5_high": or5h,
            "or_5_low": or5l,
            "or_5_width": or5h - or5l,
            "or_15_high": or15h,
            "or_15_low": or15l,
            "or_30_high": float(df.head(min(30, len(df)))["high"].max()),
            "session_vwap": float(vwap.iloc[-1]),
            "distance_from_vwap_pct": (last / float(vwap.iloc[-1])) - 1,
            "vwap_slope_5": float(vwap.diff().tail(5).mean()),
            "vwap_slope_10": float(vwap.diff().tail(10).mean()),
            "ema_9_1m": float(compute_ema(df["close"], 9).iloc[-1]),
            "ema_20_1m": float(compute_ema(df["close"], 20).iloc[-1]),
            "ema_9_5m": float(compute_ema(df5["close"], 9).iloc[-1]) if not df5.empty else last,
            "ema_20_5m": float(compute_ema(df5["close"], 20).iloc[-1]) if not df5.empty else last,
            "cumulative_volume": int(df["volume"].sum()),
            "rvol": float(df["volume"].sum() / (df["volume"].rolling(20).mean().iloc[-1] * len(df))) if len(df) > 20 else 1.0,
            "atr_14_daily": float(atr_d.iloc[-1]) if not atr_d.dropna().empty else 0.0,
            "return_vs_spy_intraday": (last / session["session_open"] - 1) - spy_return_intraday,
            "spread_bps": spread_bps,
            "liquidity_score": liquidity_score(spread_bps, last * float(df["volume"].sum())),
        })
        return state
