from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


class CacheService:
    def __init__(self, base_path: str = "data_cache") -> None:
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _path(self, provider: str, symbol: str, timeframe: str, kind: str) -> Path:
        p = self.base_path / provider / symbol / kind
        p.mkdir(parents=True, exist_ok=True)
        return p / f"{timeframe}.parquet"

    def load_cached_intraday(self, provider: str, symbol: str, timeframe: str) -> pd.DataFrame | None:
        path = self._path(provider, symbol, timeframe, "intraday")
        return pd.read_parquet(path) if path.exists() else None

    def save_cached_intraday(self, provider: str, symbol: str, timeframe: str, df: pd.DataFrame) -> None:
        df.to_parquet(self._path(provider, symbol, timeframe, "intraday"), index=False)

    def load_cached_daily(self, provider: str, symbol: str) -> pd.DataFrame | None:
        path = self._path(provider, symbol, "1d", "daily")
        return pd.read_parquet(path) if path.exists() else None

    def save_cached_daily(self, provider: str, symbol: str, df: pd.DataFrame) -> None:
        df.to_parquet(self._path(provider, symbol, "1d", "daily"), index=False)

    def is_cache_fresh(self, path: Path, max_age_minutes: int) -> bool:
        if not path.exists():
            return False
        mtime = datetime.fromtimestamp(path.stat().st_mtime)
        return datetime.now() - mtime < timedelta(minutes=max_age_minutes)

    def invalidate_cache(self, provider: str, symbol: str) -> None:
        dir_path = self.base_path / provider / symbol
        if dir_path.exists():
            for p in dir_path.rglob("*.parquet"):
                p.unlink()
