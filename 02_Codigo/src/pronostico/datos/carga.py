"""Carga de la serie producto-establecimiento-día y de sus regresores."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import pandas as pd

from pronostico.config import CFG_EXP, EXOGENAS, PROCESADOS
from pronostico.datos.exogenas import calendario, matriz_exogena

NOMBRES_X = ["trm_var28_l", "copves_var28_l", "trafico_rel_l", "ipc_var12_l",
             "festivo", "quincena", "prima", "temporada_escolar", "navidad"]


@dataclass
class Datos:
    Y: np.ndarray                 # [series, días] float
    fechas: pd.DatetimeIndex
    catalogo: pd.DataFrame
    X: np.ndarray                 # [días + h, k] regresores sin fuga (incluye h días futuros)
    nombres_x: list
    origenes: list                # índices t0 (primer día de cada ventana de prueba)
    muestra: np.ndarray           # índices de series de evaluación (estratificada)


@lru_cache(maxsize=2)
def cargar(rezago_macro: int = CFG_EXP.horizonte, n_muestra: int = 480) -> Datos:
    m = pd.read_parquet(PROCESADOS / "demanda_diaria.parquet")
    fechas = pd.to_datetime(m.columns)
    cat = pd.read_parquet(EXOGENAS / "catalogo.parquet").set_index("sku").loc[m.index].reset_index()
    exo = pd.read_parquet(EXOGENAS / "macro_sintetica.parquet")
    h = CFG_EXP.horizonte
    # Se extiende h días hacia el futuro: el calendario es conocido y las macro
    # entran con rezago >= h, por lo que sus valores futuros ya están observados.
    ext = pd.date_range(fechas[0], fechas[-1] + pd.Timedelta(days=h), freq="D")
    cal = calendario(ext)
    X = matriz_exogena(exo.reindex(ext), cal, rezago=rezago_macro)[NOMBRES_X].to_numpy(float)
    n = len(fechas)
    origenes = [n - h * k for k in range(CFG_EXP.n_origenes, 0, -1)]
    rng = np.random.default_rng(CFG_EXP.semilla)
    # muestra estratificada: mitad abarrotes, mitad ropa/calzado; con ventas antes del 1er origen
    activo = (m.to_numpy()[:, :origenes[0]] > 0).sum(1) >= 60
    aba = np.flatnonzero((cat["sector"] == "abarrotes").to_numpy() & activo)
    otr = np.flatnonzero((cat["sector"] != "abarrotes").to_numpy() & activo)
    k = n_muestra // 2
    muestra = np.sort(np.r_[rng.choice(aba, k, replace=False), rng.choice(otr, k, replace=False)])
    return Datos(m.to_numpy(float), fechas, cat, X, NOMBRES_X, origenes, muestra)
