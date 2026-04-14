import numpy as np


def safe_mean(values: list[float]) -> float:
    return float(np.mean(values)) if values else 0.0
