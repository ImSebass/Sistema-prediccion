"""OE4 – Impacto en la gestión de inventarios (simulación (R, S)).

Para cada modelo se simulan las 3 ventanas de prueba de 28 días sobre las
480 series de evaluación, con la misma desviación de seguridad sigma por serie
(estimada en entrenamiento), de modo que la diferencia entre modelos proviene
solo del pronóstico puntual.

    python scripts/10_inventario.py
"""
import json
import os
import pickle
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pronostico.config import CFG_EXP, RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.inventario.simulacion import simular  # noqa: E402

D = cargar()
h = CFG_EXP.horizonte
P = RESULTADOS / "precision"
with open(P / "locales.pkl", "rb") as fh:
    regs = [r for r in pickle.load(fh) if r["modelo"] != "prophet_hibrido"]
with open(P / "globales.pkl", "rb") as fh:
    regs += pickle.load(fh)["registros"]
pron = {(r["modelo"], r["serie"], r["origen"]): r["pron"] for r in regs}
modelos = sorted({r["modelo"] for r in regs})
S = D.muestra
precio = D.catalogo["precio"].to_numpy()[S]
filas = []
for m in modelos:
    acum = []
    for t0 in D.origenes:
        F = np.stack([pron[(m, int(i), int(t0))] for i in S]).astype(float)
        Yt = D.Y[S, t0:t0 + h]
        hist = D.Y[S, t0 - 112:t0]
        sigma = (hist - pd.DataFrame(hist.T).rolling(28, min_periods=7).mean().to_numpy().T)[:, 28:].std(1)
        acum.append(simular(Yt, F, sigma, precio))
    fila = {k: float(np.mean([a[k] for a in acum])) for k in acum[0]}
    fila["modelo"] = m
    filas.append(fila)
tab = pd.DataFrame(filas).set_index("modelo").sort_values("costo_total")
ref = tab.loc["ingenuo_s7"]
tab["ahorro_vs_ingenuo_%"] = 100 * (1 - tab["costo_total"] / ref["costo_total"])
tab.to_csv(RESULTADOS / "inventario" / "simulacion_inventario.csv", float_format="%.4f")
print(tab.round(3))
(RESULTADOS / "inventario" / "simulacion_inventario.json").write_text(tab.to_json(orient="index", indent=2))
