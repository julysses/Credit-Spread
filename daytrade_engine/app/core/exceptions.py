class DayTradeError(Exception):
    pass


class ConfigError(DayTradeError):
    pass


class ProviderError(DayTradeError):
    pass
