from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from app.core.exceptions import ConfigError
from app.core.settings import ProviderSecrets


class AppConfig(BaseModel):
    timezone: str
    session_start: str
    session_end: str
    enable_paper_mode: bool = True
    default_intraday_timeframe: str = "1m"
    default_structure_timeframe: str = "5m"
    daily_lookback: int = 60
    intraday_lookback: int = 390


class ProvidersConfig(BaseModel):
    active_provider: str
    fallback_providers: list[str] = Field(default_factory=list)
    cache_path: str = "./data_cache"
    use_cache: bool = True
    providers: dict[str, dict[str, Any]] = Field(default_factory=dict)


class UniverseConfig(BaseModel):
    min_price: float
    min_avg_daily_dollar_volume: float
    etfs: list[str]
    stocks: list[str]


class RiskConfig(BaseModel):
    risk_per_trade_pct: float
    hard_max_risk_per_trade_pct: float
    max_open_risk_pct: float
    max_daily_drawdown_pct: float
    max_sector_exposure_pct: float
    max_notional_per_trade_pct: float
    max_leveraged_etf_exposure_pct: float
    block_first_n_minutes: int
    block_last_n_minutes: int
    max_spread_bps: float
    liquidity_participation_cap: float = 0.02
    allow_multi_recommendation_per_symbol: bool = False


class LoggingConfig(BaseModel):
    level: str = "INFO"
    serialize: bool = True
    retention_days: int = 7


class StrategyConfig(BaseModel):
    enabled: bool = True
    allowed_regimes: list[str] = Field(default_factory=list)


class ConfigBundle(BaseModel):
    app: AppConfig
    providers: ProvidersConfig
    universe: UniverseConfig
    risk: RiskConfig
    strategies: dict[str, StrategyConfig | dict[str, Any]]
    logging: LoggingConfig


class ConfigLoader:
    def __init__(self, config_dir: str | Path = "config") -> None:
        self.config_dir = Path(config_dir)
        self.secrets = ProviderSecrets()

    def _load_yaml(self, name: str) -> dict[str, Any]:
        path = self.config_dir / name
        if not path.exists():
            raise ConfigError(f"Missing config file: {path}")
        with path.open("r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        if not isinstance(data, dict):
            raise ConfigError(f"Invalid YAML object in {path}")
        return data

    def load(self) -> ConfigBundle:
        app = AppConfig.model_validate(self._load_yaml("app.yaml"))
        providers_dict = self._load_yaml("providers.yaml")
        providers = ProvidersConfig.model_validate(providers_dict)
        universe = UniverseConfig.model_validate(self._load_yaml("universe.yaml"))
        risk = RiskConfig.model_validate(self._load_yaml("risk.yaml"))
        strategies_raw = self._load_yaml("strategies.yaml")
        logging = LoggingConfig.model_validate(self._load_yaml("logging.yaml"))

        if self.secrets.alpaca_api_key:
            providers.providers.setdefault("alpaca", {})["api_key"] = self.secrets.alpaca_api_key
            providers.providers.setdefault("alpaca", {})["api_secret"] = self.secrets.alpaca_api_secret
        return ConfigBundle(
            app=app,
            providers=providers,
            universe=universe,
            risk=risk,
            strategies=strategies_raw,
            logging=logging,
        )
