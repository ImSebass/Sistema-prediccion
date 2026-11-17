"""Configuración central del sistema de pronóstico de demanda.

Todas las rutas, semillas y parámetros experimentales se definen aquí para
garantizar la reproducibilidad (mismas semillas => mismos datos y resultados).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# --- Rutas -----------------------------------------------------------------
RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "datos"
CRUDOS = DATOS / "crudos"            # POS crudo particionado (tienda/mes)
PROCESADOS = DATOS / "procesados"    # serie producto-establecimiento-día
EXOGENAS = DATOS / "exogenas"
RESULTADOS = RAIZ / "resultados"
FIGURAS = RAIZ / "figuras"

SEMILLA_GLOBAL = 20260916

# Evita la sobresuscripción de núcleos: cada proceso MPI usa un solo hilo de
# BLAS/OpenMP salvo que el experimento indique lo contrario.
HILOS_POR_DEFECTO = {
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
}


def fijar_hilos(n: int | None = None) -> None:
    """Fija las variables de entorno de hilos (debe llamarse antes de importar numpy)."""
    for k, v in HILOS_POR_DEFECTO.items():
        os.environ[k] = str(n) if n is not None else os.environ.get(k, v)


@dataclass(frozen=True)
class ConfigDatos:
    """Parámetros del generador sintético calibrado al comercio fronterizo."""
    fecha_inicio: str = "2024-01-01"
    fecha_fin: str = "2026-06-30"          # 30 meses (>= 24 exigidos)
    # (id_tienda, sector, n_productos)
    tiendas: tuple = (
        ("T01", "abarrotes", 320),
        ("T02", "abarrotes", 280),
        ("T03", "ropa", 260),
        ("T04", "ropa", 220),
        ("T05", "calzado", 200),
    )
    semilla: int = SEMILLA_GLOBAL


@dataclass(frozen=True)
class ConfigExperimento:
    horizonte: int = 28                 # días a pronosticar
    n_origenes: int = 3                 # validación con origen móvil
    paso_origen: int = 28               # días entre orígenes
    estacionalidad: int = 7             # semanal (MASE con ingenuo estacional)
    repeticiones: int = 6               # >=5 + 1 de calentamiento descartada
    semilla: int = SEMILLA_GLOBAL
    procesos: tuple = (1, 2)
    hilos: tuple = (1, 2)
    margen_equivalencia_wape: float = 0.01  # ±1 punto de WAPE (prueba TOST)
    alfa: float = 0.05
    extra: dict = field(default_factory=dict)


CFG_DATOS = ConfigDatos()
CFG_EXP = ConfigExperimento()
