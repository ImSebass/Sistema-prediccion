"""Métricas de error robustas a ceros (no se usa MAPE).

* WAPE  = sum|y - f| / sum|y|                      (escala agregada, robusta a ceros)
* MASE  = MAE_h / MAE_insample(ingenuo estacional s=7)   (Hyndman y Koehler, 2006)
* RMSE  = sqrt(mean((y - f)^2))
* Sesgo = sum(f - y) / sum(y)                      (positivo = sobrepronóstico)
"""
from __future__ import annotations

import numpy as np


def wape(y: np.ndarray, f: np.ndarray) -> float:
    den = np.abs(y).sum()
    return float(np.abs(y - f).sum() / den) if den > 0 else np.nan


def escala_mase(y_train: np.ndarray, s: int = 7) -> float:
    y_train = np.asarray(y_train, float)
    nz = np.flatnonzero(y_train > 0)
    if len(nz):
        y_train = y_train[nz[0]:]          # desde el inicio de ventas
    if len(y_train) <= s:
        return np.nan
    d = np.abs(y_train[s:] - y_train[:-s]).mean()
    return float(d) if d > 0 else np.nan


def mase(y: np.ndarray, f: np.ndarray, escala: float) -> float:
    return float(np.abs(y - f).mean() / escala) if escala and np.isfinite(escala) else np.nan


def rmse(y: np.ndarray, f: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y - f) ** 2)))


def sesgo(y: np.ndarray, f: np.ndarray) -> float:
    den = y.sum()
    return float((f - y).sum() / den) if den > 0 else np.nan


def evaluar(y: np.ndarray, f: np.ndarray, y_train: np.ndarray, s: int = 7) -> dict:
    esc = escala_mase(y_train, s)
    return {"mae": float(np.abs(y - f).mean()), "rmse": rmse(y, f), "mase": mase(y, f, esc),
            "abs_err": float(np.abs(y - f).sum()), "suma_y": float(y.sum()), "sesgo": sesgo(y, f)}


def wape_global(abs_err: np.ndarray, suma_y: np.ndarray) -> float:
    return float(np.nansum(abs_err) / np.nansum(suma_y))
