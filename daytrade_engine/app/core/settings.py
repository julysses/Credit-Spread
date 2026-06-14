from pydantic_settings import BaseSettings, SettingsConfigDict


class ProviderSecrets(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    alpaca_api_key: str | None = None
    alpaca_api_secret: str | None = None
    finnhub_api_key: str | None = None
    twelvedata_api_key: str | None = None
    alphavantage_api_key: str | None = None
