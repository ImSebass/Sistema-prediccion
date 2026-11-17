"""Estrategia HÍBRIDA MPI + OpenMP.

Nivel 1 (MPI, memoria distribuida): cada rango recibe un bloque de series
(`Scatterv` de filas de la matriz de demanda).
Nivel 2 (OpenMP, memoria compartida): dentro de cada rango, el kernel C
`tsb_rejilla` reparte sus series entre T hilos.
Resultado: `Gatherv` de los pronósticos al rango 0.

Es el patrón que se usaría en el clúster: 1 rango MPI por nodo y tantos
hilos OpenMP como núcleos tenga el nodo, lo que evita duplicar datos en
memoria y reduce mensajes frente a "1 rango por núcleo".

    mpirun -np 2 -x OMP_NUM_THREADS=1 python -m pronostico.paralelo.hibrido_mpi_omp --hilos 1
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np
import pandas as pd
from mpi4py import MPI

from pronostico.config import PROCESADOS
from pronostico.features.omp import tsb_rejilla_omp


def main(hilos: int, replicas: int = 1) -> dict | None:
    comm = MPI.COMM_WORLD
    rank, p = comm.Get_rank(), comm.Get_size()
    if rank == 0:
        Y = pd.read_parquet(PROCESADOS / "demanda_diaria.parquet").to_numpy(np.float32)
        Y = np.ascontiguousarray(np.tile(Y, (replicas, 1)))
        n, d = Y.shape
    else:
        Y, n, d = None, 0, 0
    n, d = comm.bcast((n, d), root=0)
    filas = np.diff(np.linspace(0, n, p + 1).astype(int))
    local = np.empty((filas[rank], d), np.float32)
    comm.Barrier()
    t0 = time.perf_counter()
    comm.Scatterv([Y, filas * d, np.r_[0, np.cumsum(filas)[:-1]] * d, MPI.FLOAT], local, root=0)
    r = tsb_rejilla_omp(local, hilos=hilos)
    salida = np.empty(n, np.float32) if rank == 0 else None
    comm.Gatherv(r["pronostico"], [salida, filas, np.r_[0, np.cumsum(filas)[:-1]], MPI.FLOAT], root=0)
    t = time.perf_counter() - t0
    if rank == 0:
        return {"procesos": p, "hilos": hilos, "unidades": p * hilos, "series": int(n), "t": t,
                "suma_control": float(salida.sum())}
    return None


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--hilos", type=int, default=1)
    ap.add_argument("--replicas", type=int, default=1)
    a = ap.parse_args()
    res = main(a.hilos, a.replicas)
    if res:
        print(json.dumps(res))
