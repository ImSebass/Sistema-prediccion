"""Motor de pronóstico distribuido con MPI (paralelismo de TAREAS).

Una tarea = (serie, origen de validación, modelo local). Las tareas son
independientes ("embarrassingly parallel"), pero su costo varía mucho
(un SARIMAX tarda entre 0,3 s y más de 1 s según la serie). Por eso el motor
implementa tres estrategias de planificación comparables experimentalmente:

  * 'bloque'   : reparto estático por bloques contiguos;
  * 'ciclico'  : reparto estático cíclico (round-robin);
  * 'dinamico' : auto-planificación dinámica. Un contador global de tareas
                 vive en una ventana RMA de MPI (memoria remota) del rango 0;
                 cada proceso toma el siguiente lote con
                 MPI_Fetch_and_op(+CHUNK) atómico. Todos los rangos trabajan
                 (no hay maestro ocioso) y no se requiere sondeo activo.

Al final, `gather` reúne los pronósticos en el rango 0 (patrón reducción).

Uso:
  mpirun -np 4 python -m pronostico.paralelo.motor_mpi --modelos sarimax --estrategia dinamico
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import time

from pronostico.config import fijar_hilos

fijar_hilos(1)

import numpy as np  # noqa: E402

from pronostico.config import CFG_EXP, RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.evaluacion.metricas import evaluar  # noqa: E402
from pronostico.modelos import locales  # noqa: E402

try:
    from mpi4py import MPI
    COMM = MPI.COMM_WORLD
except Exception:  # pragma: no cover
    MPI, COMM = None, None

CHUNK = 4


def ejecutar_tarea(D, i: int, t0: int, modelo: str, h: int):
    y_tr = D.Y[i, :t0]
    y_te = D.Y[i, t0:t0 + h]
    kw = {}
    if modelo.endswith("_exog") or modelo == "prophet_hibrido":
        kw = {"X": D.X[:t0], "Xf": D.X[t0:t0 + h], "nombres_x": D.nombres_x}
    if modelo.startswith("prophet"):
        kw["fechas"] = D.fechas
    if modelo == "prophet_hibrido":
        f, ajuste = locales.prophet(y_tr, h, devolver_ajuste=True, **kw)
        return f, ajuste, evaluar(y_te, f, y_tr)
    f = locales.MODELOS_LOCALES[modelo](y_tr, h, **kw)
    return f, None, evaluar(y_te, f, y_tr)


def planificar(n_tareas: int, p: int, rank: int, estrategia: str):
    if estrategia == "bloque":
        lim = np.linspace(0, n_tareas, p + 1).astype(int)
        return iter(range(lim[rank], lim[rank + 1]))
    if estrategia == "ciclico":
        return iter(range(rank, n_tareas, p))
    raise ValueError(estrategia)


def correr(modelos: list[str], estrategia: str = "dinamico", series=None,
           guardar: str | None = None, max_series: int | None = None,
           n_origenes: int | None = None, desplazamiento: int = 0) -> dict | None:
    rank = COMM.Get_rank() if COMM else 0
    p = COMM.Get_size() if COMM else 1
    D = cargar()
    h = CFG_EXP.horizonte
    series = D.muestra if series is None else np.asarray(series)
    if max_series:
        series = series[desplazamiento:desplazamiento + max_series]
    origenes = D.origenes[-n_origenes:] if n_origenes else D.origenes
    tareas = [(int(i), int(t0), m) for m in modelos for t0 in origenes for i in series]
    n = len(tareas)
    resultados = []
    t_ini = time.perf_counter()

    def hacer(k):
        i, t0, m = tareas[k]
        tt = time.perf_counter()
        f, ajuste, met = ejecutar_tarea(D, i, t0, m, h)
        resultados.append({"serie": i, "origen": t0, "modelo": m, "pron": f.astype(np.float32),
                           "ajuste": None if ajuste is None else ajuste.astype(np.float32),
                           "seg": time.perf_counter() - tt, "rank": rank, **met})

    if estrategia == "dinamico" and COMM is not None and p > 1:
        itemsize = MPI.INT64_T.Get_size()
        win = MPI.Win.Allocate(itemsize if rank == 0 else 0, itemsize, comm=COMM)
        if rank == 0:
            buf = np.frombuffer(win.tomemory(), dtype=np.int64)
            buf[0] = 0
        COMM.Barrier()
        uno = np.array([CHUNK], dtype=np.int64)
        sig = np.zeros(1, dtype=np.int64)
        while True:
            win.Lock(0, MPI.LOCK_SHARED)
            win.Fetch_and_op(uno, sig, 0, 0, MPI.SUM)
            win.Unlock(0)
            k0 = int(sig[0])
            if k0 >= n:
                break
            for k in range(k0, min(k0 + CHUNK, n)):
                hacer(k)
        COMM.Barrier()
        win.Free()
    else:
        est = "bloque" if estrategia == "dinamico" else estrategia   # p = 1
        for k in planificar(n, p, rank, est):
            hacer(k)
    t_comp = time.perf_counter() - t_ini
    t_trabajo = float(sum(r["seg"] for r in resultados))     # trabajo útil del rango (sin esperas)

    t1 = time.perf_counter()
    todos = COMM.gather(resultados, root=0) if COMM else [resultados]
    tiempos = COMM.gather(t_comp, root=0) if COMM else [t_comp]
    trabajos = COMM.gather(t_trabajo, root=0) if COMM else [t_trabajo]
    t_comm = time.perf_counter() - t1
    if rank != 0:
        return None
    plano = [r for lst in todos for r in lst]
    t_total = time.perf_counter() - t_ini
    resumen = {"procesos": p, "estrategia": estrategia, "modelos": modelos, "tareas": n,
               "t_total": t_total, "t_comp_max": max(tiempos), "t_comp_media": float(np.mean(tiempos)),
               "desbalance": max(trabajos) / (np.mean(trabajos) + 1e-12),
               "trabajo_por_rango": trabajos, "t_comunicacion": t_comm,
               "seg_tarea_mediana": float(np.median([r["seg"] for r in plano]))}
    if guardar:
        ruta = RESULTADOS / "precision" / guardar
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with open(ruta, "wb") as fh:
            pickle.dump(plano, fh)
    return resumen


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelos", nargs="+", default=["sarimax"])
    ap.add_argument("--estrategia", default="dinamico", choices=["bloque", "ciclico", "dinamico"])
    ap.add_argument("--guardar", default=None)
    ap.add_argument("--max-series", type=int, default=None)
    ap.add_argument("--n-origenes", type=int, default=None)
    ap.add_argument("--desplazamiento", type=int, default=0)
    a = ap.parse_args()
    r = correr(a.modelos, a.estrategia, guardar=a.guardar, max_series=a.max_series,
               n_origenes=a.n_origenes, desplazamiento=a.desplazamiento)
    if r:
        print(json.dumps(r))
