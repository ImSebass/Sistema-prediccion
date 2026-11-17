"""ETL distribuido con MPI: POS crudo -> serie producto-establecimiento-día.

Paralelismo de DATOS: cada rango MPI procesa un subconjunto de particiones
(tienda, mes) del Parquet crudo. La asignación es estática pero balanceada
por tamaño de archivo (heurística LPT: la partición más grande va al rango
con menos carga acumulada), lo que reduce el desbalance frente al reparto
cíclico simple.

Etapas por partición:
  1. limpieza: duplicados exactos, SKU inexistentes, devoluciones
     (cantidad < 0, se excluyen de la demanda bruta y se contabilizan aparte),
     precios faltantes (se imputan con el precio de catálogo);
  2. anonimización (Ley 1581 de 2012): el documento del cliente se sustituye
     por una clave sustituta HMAC-SHA256 con sal secreta (irreversible sin la
     sal) y se eliminan nombre y teléfono;
  3. agregación a unidades por SKU y día.

Comunicación: `comm.gather` de los agregados parciales al rango 0 (patrón
reducción), que ensambla la matriz [series x días] y la escribe en Parquet.

Uso:
    mpirun -np 4 python -m pronostico.paralelo.etl_mpi
    python -m pronostico.paralelo.etl_mpi            # secuencial, p = 1
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from pathlib import Path

from pronostico.config import fijar_hilos

fijar_hilos(1)

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pronostico.config import CRUDOS, EXOGENAS, PROCESADOS, RESULTADOS  # noqa: E402

try:
    from mpi4py import MPI
    COMM = MPI.COMM_WORLD
except Exception:  # pragma: no cover - ejecución sin MPI
    MPI, COMM = None, None

SAL = os.environ.get("SAL_ANONIMIZACION", "cambiar-esta-sal-en-produccion").encode()
COLUMNAS_PII = ["cliente_documento", "cliente_nombre", "cliente_telefono"]


def asignar_lpt(archivos: list[Path], p: int) -> list[list[Path]]:
    """Reparto Longest-Processing-Time por tamaño de archivo."""
    carga = np.zeros(p)
    asign: list[list[Path]] = [[] for _ in range(p)]
    for f in sorted(archivos, key=lambda x: x.stat().st_size, reverse=True):
        r = int(np.argmin(carga))
        asign[r].append(f)
        carga[r] += f.stat().st_size
    return asign


def anonimizar(df: pd.DataFrame) -> pd.DataFrame:
    doc = df["cliente_documento"].fillna("")
    unicos = doc[doc != ""].unique()
    mapa = {d: hmac.new(SAL, d.encode(), hashlib.sha256).hexdigest()[:16] for d in unicos}
    df = df.drop(columns=COLUMNAS_PII)
    df["cliente_clave"] = doc.map(mapa).fillna("")
    return df


def procesar_particion(ruta: Path, precios: pd.Series, skus_validos: set) -> tuple[pd.DataFrame, dict]:
    df = pd.read_parquet(ruta)
    n0 = len(df)
    df = df.drop_duplicates()
    n_dup = n0 - len(df)
    invalido = ~df["sku"].isin(skus_validos)
    n_inv = int(invalido.sum())
    df = df[~invalido]
    devol = df["cantidad"] < 0
    n_dev = int(devol.sum())
    df = df[~devol]
    falt = df["precio_unitario"].isna()
    df.loc[falt, "precio_unitario"] = df.loc[falt, "sku"].map(precios)
    df = anonimizar(df)
    df["fecha"] = df["fecha_hora"].dt.normalize()
    agg = df.groupby(["sku", "fecha"], as_index=False)["cantidad"].sum()
    stats = {"lineas": n0, "duplicados": n_dup, "sku_invalidos": n_inv,
             "devoluciones": n_dev, "precios_imputados": int(falt.sum()),
             "clientes_anonimizados": int((df["cliente_clave"] != "").sum())}
    return agg, stats


def ejecutar(escribir: bool = True) -> dict:
    rank = COMM.Get_rank() if COMM else 0
    p = COMM.Get_size() if COMM else 1
    t_inicio = time.perf_counter()
    catalogo = pd.read_parquet(EXOGENAS / "catalogo.parquet")
    precios = catalogo.set_index("sku")["precio"]
    skus = set(catalogo["sku"])
    archivos = sorted(CRUDOS.glob("tienda=*/mes=*.parquet"))
    mis_archivos = asignar_lpt(archivos, p)[rank]

    t0 = time.perf_counter()
    partes, stats = [], []
    for f in mis_archivos:
        a, s = procesar_particion(f, precios, skus)
        partes.append(a)
        stats.append(s)
    local = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=["sku", "fecha", "cantidad"])
    t_comp = time.perf_counter() - t0

    t1 = time.perf_counter()
    if COMM:
        todas = COMM.gather(local, root=0)
        todas_stats = COMM.gather(stats, root=0)
        tiempos = COMM.gather(t_comp, root=0)
    else:
        todas, todas_stats, tiempos = [local], [stats], [t_comp]
    t_comm = time.perf_counter() - t1

    if rank != 0:
        return {}
    largo = pd.concat(todas, ignore_index=True)
    fechas = pd.date_range(largo["fecha"].min(), largo["fecha"].max(), freq="D")
    matriz = (largo.pivot_table(index="sku", columns="fecha", values="cantidad", aggfunc="sum")
              .reindex(index=catalogo["sku"], columns=fechas).fillna(0).astype(np.int32))
    t_total = time.perf_counter() - t_inicio
    resumen = {k: int(sum(s[k] for lst in todas_stats for s in lst)) for k in stats[0]} if stats else {}
    resumen.update({
        "procesos": p, "t_total": t_total, "t_comp_max": max(tiempos), "t_comp_min": min(tiempos),
        "desbalance": (max(tiempos) / (np.mean(tiempos) + 1e-12)), "t_comunicacion": t_comm,
    })
    if escribir:
        PROCESADOS.mkdir(parents=True, exist_ok=True)
        matriz.columns = matriz.columns.strftime("%Y-%m-%d")
        matriz.to_parquet(PROCESADOS / "demanda_diaria.parquet")
        (RESULTADOS / "eda").mkdir(parents=True, exist_ok=True)
        (RESULTADOS / "eda" / "etl_resumen.json").write_text(json.dumps(resumen, indent=2))
    return resumen


if __name__ == "__main__":
    r = ejecutar(escribir=os.environ.get("ETL_NO_ESCRIBIR") is None)
    if r:
        print(json.dumps(r))
