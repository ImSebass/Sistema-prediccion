"""Modelos LOCALES (uno por serie): líneas base, SARIMAX y Prophet.

Cada función recibe la historia de entrenamiento de UNA serie y devuelve el
pronóstico de `h` días. Son tareas independientes entre sí, por lo que se
distribuyen con MPI (ver `paralelo/motor_mpi.py`).
"""
from __future__ import annotations

import logging
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
logging.getLogger("cmdstanpy").setLevel(logging.ERROR)
logging.getLogger("prophet").setLevel(logging.ERROR)

ORDEN_SARIMAX = (1, 0, 1)
ORDEN_ESTACIONAL = (1, 0, 1, 7)      # seleccionado en OE2 (ver scripts/02_seleccion_modelos.py)


def ingenuo_estacional(y: np.ndarray, h: int, s: int = 7, **_) -> np.ndarray:
    ult = y[-s:]
    return np.tile(ult, int(np.ceil(h / s)))[:h].astype(float)


def media_movil(y: np.ndarray, h: int, w: int = 28, **_) -> np.ndarray:
    return np.full(h, y[-w:].mean())


def tsb(y: np.ndarray, h: int, **_) -> np.ndarray:
    from pronostico.features.omp import tsb_rejilla_omp
    r = tsb_rejilla_omp(y[None, :], hilos=1)
    return np.full(h, float(r["pronostico"][0]))


def _inicio(y):
    nz = np.flatnonzero(y > 0)
    return int(nz[0]) if len(nz) else 0


def sarimax(y: np.ndarray, h: int, X: np.ndarray | None = None, Xf: np.ndarray | None = None,
            orden=ORDEN_SARIMAX, orden_est=ORDEN_ESTACIONAL, **_) -> np.ndarray:
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    i0 = _inicio(y)
    y_ = y[i0:].astype(float)
    X_ = None if X is None else X[i0:]
    if len(y_) < 60 or y_.sum() == 0:
        return ingenuo_estacional(y, h)
    try:
        warnings.simplefilter("ignore")
        m = SARIMAX(y_, exog=X_, order=orden, seasonal_order=orden_est,
                    enforce_stationarity=False, enforce_invertibility=False)
        r = m.fit(disp=False, maxiter=60)
        f = r.forecast(h, exog=Xf)
        return np.clip(np.asarray(f, float), 0, None)
    except Exception:
        return ingenuo_estacional(y, h)


def prophet(y: np.ndarray, h: int, fechas: pd.DatetimeIndex, X: np.ndarray | None = None,
            Xf: np.ndarray | None = None, nombres_x: list | None = None,
            devolver_ajuste: bool = False, **_):
    from prophet import Prophet
    for nombre in ("cmdstanpy", "prophet"):
        logging.getLogger(nombre).disabled = True
    i0 = _inicio(y)
    df = pd.DataFrame({"ds": fechas[i0:len(y)], "y": y[i0:].astype(float)})
    fut = pd.DataFrame({"ds": pd.date_range(fechas[len(y)], periods=h, freq="D")})
    m = Prophet(weekly_seasonality=True, yearly_seasonality=len(df) > 400,
                daily_seasonality=False, seasonality_mode="additive", uncertainty_samples=0)
    m.add_country_holidays(country_name="CO")
    if X is not None:
        for j, c in enumerate(nombres_x):
            df[c] = X[i0:, j]
            fut[c] = Xf[:, j]
            m.add_regressor(c)
    m.fit(df)
    pf = np.clip(m.predict(fut)["yhat"].to_numpy(), 0, None)
    if devolver_ajuste:
        ajuste = np.zeros(len(y))
        ajuste[i0:] = m.predict(df.drop(columns="y"))["yhat"].to_numpy()
        return pf, ajuste
    return pf


MODELOS_LOCALES = {
    "ingenuo_s7": ingenuo_estacional,
    "media_movil28": media_movil,
    "tsb": tsb,
    "sarimax": sarimax,
    "sarimax_exog": sarimax,
    "prophet": prophet,
    "prophet_exog": prophet,
}
