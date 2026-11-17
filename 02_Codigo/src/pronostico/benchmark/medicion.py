"""Protocolo de medición y modelos de escalabilidad.

Protocolo (Sección VI-G del documento):
  * >= 5 repeticiones válidas por configuración + 1 de calentamiento que se
    DESCARTA (carga de librerías, compilación JIT, caché de disco);
  * se reporta la MEDIANA y el rango intercuartílico (RIC);
  * T(1) es la versión secuencial OPTIMIZADA (mismo código compilado/
    vectorizado con 1 proceso o 1 hilo).

Escalabilidad:
  * fuerte (Amdahl):     S(p) = 1 / (f + (1 - f)/p)
  * débil  (Gustafson):  S(p) = p - f (p - 1)        (carga proporcional a p)
  donde f es la fracción secuencial, estimada a partir de la métrica de
  Karp–Flatt:  e(p) = (1/S - 1/p) / (1 - 1/p).
"""
from __future__ import annotations

import time
from typing import Callable

import numpy as np


def medir(fn: Callable[[], object], repeticiones: int = 6) -> dict:
    tiempos = []
    for _ in range(repeticiones):
        t = time.perf_counter()
        fn()
        tiempos.append(time.perf_counter() - t)
    validos = np.array(tiempos[1:])
    return {"tiempos": validos.tolist(), "calentamiento": tiempos[0],
            "mediana": float(np.median(validos)),
            "ric": float(np.percentile(validos, 75) - np.percentile(validos, 25))}


def karp_flatt(S: float, p: int) -> float:
    return float((1 / S - 1 / p) / (1 - 1 / p)) if p > 1 else float("nan")


def amdahl(p, f):
    p = np.asarray(p, float)
    return 1.0 / (f + (1 - f) / p)


def gustafson(p, f):
    p = np.asarray(p, float)
    return p - f * (p - 1)
