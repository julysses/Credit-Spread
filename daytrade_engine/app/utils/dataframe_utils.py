import pandas as pd


def bars_to_df(bars: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(bars)
