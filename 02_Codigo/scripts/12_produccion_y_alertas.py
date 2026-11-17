"""Despliegue: pronóstico de producción (28 días desde el último dato) y tablero de alertas.

1. Entrena el modelo de producción (LSTM global con exógenas, el de menor
   costo de inventario/mayor precisión en la validación; ver hipotesis.json)
   sobre TODAS las series y pronostica desde la fecha de corte.
2. El inventario actual se toma de la simulación (R, S) del último periodo
   (en operación real vendría del POS/ERP del comercio).
3. Genera `resultados/alertas_reabastecimiento.html` y un CSV de pedidos.

    python scripts/12_produccion_y_alertas.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pronostico.config import CFG_EXP, RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.inventario.simulacion import LT, R, Z  # noqa: E402
from pronostico.modelos.lstm_global import entrenar_y_predecir  # noqa: E402
from pronostico.visualizacion.dashboard import alertas, generar_html  # noqa: E402

D = cargar()
h = CFG_EXP.horizonte
n = D.Y.shape[1]
todas = np.arange(len(D.Y))
activas = todas[(D.Y[:, :n] > 0).sum(1) >= 30]
# El último día observado es n-1; para pronosticar desde n se requieren regresores
# futuros: calendario conocido y macro con rezago >= 28 (disponibles).
P, info = entrenar_y_predecir(D, activas, n, h, "lstm_exog", epocas=8, semilla=CFG_EXP.semilla % 1000)
P = np.clip(P, 0, None)
# inventario actual simulado: cobertura aleatoria entre 0 y 3 semanas de la demanda reciente
rng = np.random.default_rng(CFG_EXP.semilla)
reciente = D.Y[activas, n - 28:].mean(1)
inventario = np.round(reciente * rng.uniform(0, 21, len(activas)))
hist = D.Y[activas, n - 112:]
sigma = (hist - pd.DataFrame(hist.T).rolling(28, min_periods=7).mean().to_numpy().T)[:, 28:].std(1)
cat = D.catalogo.iloc[activas].reset_index(drop=True)
df = alertas(P, inventario, sigma, cat)
df.to_csv(RESULTADOS / "inventario" / "pedidos_sugeridos.csv", index=False)
hip = json.loads((RESULTADOS / "precision" / "hipotesis.json").read_text()) if (RESULTADOS / "precision" / "hipotesis.json").exists() else {}
tab = pd.read_csv(RESULTADOS / "precision" / "tabla_precision.csv", index_col=0) if (RESULTADOS / "precision" / "tabla_precision.csv").exists() else None
met = {"Modelo en producción": "LSTM global + exógenas", "Series pronosticadas": len(activas),
       "Entrenamiento (s)": round(info["t_entrenamiento"], 1), "Dispositivo": info["dispositivo"]}
if tab is not None:
    met["WAPE validación (LSTM + exóg.)"] = f"{tab.loc['LSTM + exóg.', 'WAPE']:.3f}"
    met["WAPE validación (ingenuo)"] = f"{tab.loc['Ingenuo estacional', 'WAPE']:.3f}"
fecha = (D.fechas[-1] + pd.Timedelta(days=1)).date().isoformat()
generar_html(df, P, met, RESULTADOS / "alertas_reabastecimiento.html", fecha)
print({"alertas": int(df["alerta"].sum()), "criticas": int((df["prioridad"] == "CRÍTICA").sum()), **info})
