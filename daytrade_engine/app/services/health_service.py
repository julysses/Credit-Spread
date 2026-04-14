from app.providers.base_provider import BaseMarketDataProvider


class HealthService:
    def check(self, provider: BaseMarketDataProvider) -> dict:
        market = provider.get_market_status()
        return {
            "provider_reachable": bool(market),
            "market_status_known": "open" in market,
            "status": "ok" if market else "degraded",
            "provider": provider.name,
        }
