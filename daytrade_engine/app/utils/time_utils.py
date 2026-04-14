from datetime import datetime
from zoneinfo import ZoneInfo


def to_ny(dt: datetime) -> datetime:
    return dt.astimezone(ZoneInfo("America/New_York"))
