"""Precisión de los modelos GLOBALES: LSTM, LSTM con exógenas e híbrido Prophet-LSTM.

Requiere `resultados/precision/locales.pkl` (generado por el motor MPI), del
que toma el AJUSTE dentro de muestra de Prophet-con-regresores
('prophet_hibrido') para construir los residuos que corrige el LSTM.

    python scripts/05_precision_global.py
"""
import os
import pickle
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402

from pronostico.config import CFG_EXP, RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.evaluacion.metricas import evaluar  # noqa: E402
from pronostico.modelos.lstm_global import entrenar_y_predecir  # noqa: E402

EPOCAS = 8          # seleccionado en OE2 (validación)
HILOS = int(os.environ.get("LSTM_HILOS", "0")) or None   # None = valor por defecto de PyTorch
D = cargar()
h = CFG_EXP.horizonte
S = D.muestra
_f = RESULTADOS / "precision" / "locales_prophet_hibrido.pkl"
with open(_f if _f.exists() else RESULTADOS / "precision" / "locales.pkl", "rb") as fh:
    locales = pickle.load(fh)
ph = {(r["serie"], r["origen"]): r for r in locales if r["modelo"] == "prophet_hibrido"}

registros, info = [], []
for t0 in D.origenes:
    for var in ("lstm", "lstm_exog", "hibrido"):
        t = time.perf_counter()
        if var == "hibrido":
            ajuste = np.zeros((len(S), D.Y.shape[1]))
            pf = np.zeros((len(S), h))
            for k, i in enumerate(S):
                r = ph[(int(i), int(t0))]
                ajuste[k, :t0] = r["ajuste"][:t0]
                pf[k] = r["pron"]
            resid = np.zeros_like(D.Y[S])
            resid[:, :t0] = D.Y[S, :t0] - ajuste[:, :t0]
            P, inf = entrenar_y_predecir(D, S, t0, h, "hibrido", residuos=resid, epocas=EPOCAS,
                                         semilla=CFG_EXP.semilla % 1000, hilos=HILOS)
            P = np.clip(pf + P, 0, None)
        else:
            P, inf = entrenar_y_predecir(D, S, t0, h, var, epocas=EPOCAS, semilla=CFG_EXP.semilla % 1000, hilos=HILOS)
            P = np.clip(P, 0, None)
        inf.update({"origen": int(t0), "variante": var, "t_total": time.perf_counter() - t})
        info.append(inf)
        print(inf)
        for k, i in enumerate(S):
            registros.append({"serie": int(i), "origen": int(t0), "modelo": var, "pron": P[k].astype(np.float32),
                              **evaluar(D.Y[i, t0:t0 + h], P[k], D.Y[i, :t0])})
with open(RESULTADOS / "precision" / "globales.pkl", "wb") as fh:
    pickle.dump({"registros": registros, "info": info}, fh)
