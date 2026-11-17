"""OE2 – Selección de configuración de algoritmos SIN tocar las ventanas de prueba.

Se usa un origen de VALIDACIÓN anterior a los tres orígenes de prueba
(t_val = primer_origen - 28). Candidatos:
  * SARIMAX: cuatro especificaciones (p,d,q)(P,D,Q)_7;
  * LSTM global: 4 vs 8 épocas.
Criterio: MASE medio sobre 60 series (30 abarrotes + 30 ropa/calzado).
Las tareas SARIMAX se distribuyen con MPI (motor de tareas, reparto cíclico).

    mpirun -np 2 python scripts/02_seleccion_modelos.py
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from pronostico.config import fijar_hilos  # noqa: E402

fijar_hilos(1)
import numpy as np  # noqa: E402
from mpi4py import MPI  # noqa: E402

from pronostico.config import RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.evaluacion.metricas import evaluar  # noqa: E402
from pronostico.modelos.locales import sarimax  # noqa: E402

CANDIDATOS = {
    "(1,0,1)(1,0,1)7": ((1, 0, 1), (1, 0, 1, 7)),
    "(1,1,1)(0,1,1)7": ((1, 1, 1), (0, 1, 1, 7)),
    "(2,1,1)(0,1,1)7": ((2, 1, 1), (0, 1, 1, 7)),
    "(0,1,1)(0,1,1)7": ((0, 1, 1), (0, 1, 1, 7)),
}

comm = MPI.COMM_WORLD
rank, p = comm.Get_rank(), comm.Get_size()
D = cargar()
h = 28
t_val = D.origenes[0] - h
sel = np.r_[D.muestra[:30], D.muestra[-30:]]
tareas = [(n, i) for n in CANDIDATOS for i in sel]
loc = []
t = time.perf_counter()
for k in range(rank, len(tareas), p):
    nom, i = tareas[k]
    o, so = CANDIDATOS[nom]
    f = sarimax(D.Y[i, :t_val], h, orden=o, orden_est=so)
    loc.append((nom, int(i), evaluar(D.Y[i, t_val:t_val + h], f, D.Y[i, :t_val])))
todo = comm.gather(loc, root=0)
if rank == 0:
    plano = [x for l in todo for x in l]
    res = {}
    for nom in CANDIDATOS:
        m = [r["mase"] for n, _, r in plano if n == nom and np.isfinite(r["mase"])]
        w = sum(r["abs_err"] for n, _, r in plano if n == nom) / sum(r["suma_y"] for n, _, r in plano if n == nom)
        res[nom] = {"mase_medio": float(np.mean(m)), "wape": float(w)}
    mejor = min(res, key=lambda k: res[k]["mase_medio"])
    # LSTM: épocas
    from pronostico.modelos.lstm_global import entrenar_y_predecir
    from pronostico.evaluacion.metricas import wape
    lstm = {}
    for ep in (4, 8):
        P, info = entrenar_y_predecir(D, D.muestra, t_val, h, "lstm", epocas=ep, hilos=p)
        lstm[ep] = {"wape": wape(D.Y[D.muestra, t_val:t_val + h], P), "t": info["t_entrenamiento"]}
    salida = {"origen_validacion": int(t_val), "sarimax": res, "sarimax_elegido": mejor,
              "lstm_epocas": lstm, "segundos": time.perf_counter() - t}
    (RESULTADOS / "precision").mkdir(parents=True, exist_ok=True)
    (RESULTADOS / "precision" / "seleccion_oe2.json").write_text(json.dumps(salida, indent=2))
    print(json.dumps(salida, indent=2))
