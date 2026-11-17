"""Análisis complementario de H2: valor de las exógenas SIN la restricción de no fuga.

El LSTM con exógenas se reentrena con las macro rezagadas solo 1 día
(rezago < horizonte => usa información del futuro: "oráculo"). No es un
modelo desplegable: sirve como cota superior del aporte de las exógenas y
para cuantificar cuánto de ese aporte se pierde al exigir rezago >= 28 días.

    python scripts/05b_oraculo_exogenas.py
"""
import os
import pickle
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402

from pronostico.config import CFG_EXP, RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.evaluacion.metricas import evaluar  # noqa: E402
from pronostico.modelos.lstm_global import entrenar_y_predecir  # noqa: E402

D = cargar(rezago_macro=1)
h = CFG_EXP.horizonte
S = D.muestra
HILOS = int(os.environ.get("LSTM_HILOS", "0")) or None
registros = []
for t0 in D.origenes:
    P, inf = entrenar_y_predecir(D, S, t0, h, "lstm_exog", epocas=8, semilla=CFG_EXP.semilla % 1000, hilos=HILOS)
    P = np.clip(P, 0, None)
    print(inf)
    for k, i in enumerate(S):
        registros.append({"serie": int(i), "origen": int(t0), "modelo": "lstm_exog_oraculo", "pron": P[k].astype(np.float32),
                          **evaluar(D.Y[i, t0:t0 + h], P[k], D.Y[i, :t0])})
with open(RESULTADOS / "precision" / "oraculo.pkl", "wb") as fh:
    pickle.dump(registros, fh)
