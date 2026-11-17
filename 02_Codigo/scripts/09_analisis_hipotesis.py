"""Contraste de hipótesis H1–H3 y tablas de precisión.

Entradas: resultados/precision/{locales,globales}.pkl y resultados/benchmark/*.json
Salidas : resultados/precision/tabla_precision.csv, hipotesis.json

    python scripts/09_analisis_hipotesis.py
"""
import json
import os
import pickle
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pronostico.benchmark.medicion import karp_flatt  # noqa: E402
from pronostico.config import RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.evaluacion.estadistica import (bootstrap_mediana_razon, friedman_nemenyi, holm,  # noqa: E402
                                               mann_whitney_menor, wilcoxon_mejora)

D = cargar()
P = RESULTADOS / "precision"
with open(P / "locales.pkl", "rb") as fh:
    loc = pickle.load(fh)
with open(P / "globales.pkl", "rb") as fh:
    glo = pickle.load(fh)["registros"]
df = pd.DataFrame([{k: v for k, v in r.items() if k not in ("pron", "ajuste")} for r in loc + glo])
df = df[df["modelo"] != "prophet_hibrido"]          # solo insumo del híbrido
sect = D.catalogo["sector"].to_numpy()
df["sector"] = sect[df["serie"]]
sbc = pd.read_csv(RESULTADOS / "eda" / "clasificacion_sbc.csv")
df["clase"] = sbc["clase"].to_numpy()[df["serie"]]
NOMBRES = {"ingenuo_s7": "Ingenuo estacional", "media_movil28": "Media móvil 28", "tsb": "TSB",
           "sarimax": "SARIMAX", "sarimax_exog": "SARIMAX + exóg.", "prophet": "Prophet",
           "prophet_exog": "Prophet + exóg.", "lstm": "LSTM", "lstm_exog": "LSTM + exóg.",
           "hibrido": "Híbrido Prophet-LSTM"}


def resumen(d):
    g = d.groupby("modelo")
    t = pd.DataFrame({"WAPE": g["abs_err"].sum() / g["suma_y"].sum(),
                      "MASE_media": g["mase"].mean(), "MASE_mediana": g["mase"].median(),
                      "RMSE_media": g["rmse"].mean(),
                      "Sesgo": (g.apply(lambda x: (x["sesgo"] * x["suma_y"]).sum() / x["suma_y"].sum(), include_groups=False))})
    return t.sort_values("WAPE")


tab = resumen(df)
tab_sector = {s: resumen(df[df["sector"] == s]) for s in ("abarrotes", "ropa", "calzado")}
tab.rename(index=NOMBRES).to_csv(P / "tabla_precision.csv", float_format="%.4f")
pd.concat({s: t.rename(index=NOMBRES) for s, t in tab_sector.items()}).to_csv(P / "tabla_precision_sector.csv", float_format="%.4f")
print(tab.round(4))

# MASE por serie (promedio de los 3 orígenes) en formato ancho
ancho = df.groupby(["serie", "modelo"])["mase"].mean().unstack()
hip = {"n_series": int(len(ancho)), "n_origenes": int(df["origen"].nunique())}

# ---- H2: exógenas vs univariante y vs ingenuo
pares = {"SARIMAX+exog < SARIMAX": ("sarimax_exog", "sarimax"),
         "Prophet+exog < Prophet": ("prophet_exog", "prophet"),
         "LSTM+exog < LSTM": ("lstm_exog", "lstm"),
         "SARIMAX+exog < Ingenuo": ("sarimax_exog", "ingenuo_s7"),
         "Prophet+exog < Ingenuo": ("prophet_exog", "ingenuo_s7"),
         "LSTM+exog < Ingenuo": ("lstm_exog", "ingenuo_s7")}
h2 = {k: wilcoxon_mejora(ancho[a].to_numpy(), ancho[b].to_numpy()) for k, (a, b) in pares.items()}
adj = holm({k: v["p"] for k, v in h2.items()})
for k in h2:
    h2[k]["p_holm"] = adj[k]
hip["H2"] = h2
# Cota superior (oráculo, con fuga deliberada): ¿cuánto aportarían las exógenas si se conocieran?
if (P / "oraculo.pkl").exists():
    with open(P / "oraculo.pkl", "rb") as fh:
        ora = pd.DataFrame([{k: v for k, v in r.items() if k != "pron"} for r in pickle.load(fh)])
    mo = ora.groupby("serie")["mase"].mean().reindex(ancho.index)
    hip["H2_oraculo"] = {"wape": float(ora["abs_err"].sum() / ora["suma_y"].sum()),
                         "mase_media": float(ora["mase"].mean()),
                         "vs_lstm": wilcoxon_mejora(mo.to_numpy(), ancho["lstm"].to_numpy()),
                         "vs_lstm_exog": wilcoxon_mejora(mo.to_numpy(), ancho["lstm_exog"].to_numpy())}
# H2 por sector (MASE medio)
hip["H2_por_sector"] = {s: {m: float(df[(df["sector"] == s) & (df["modelo"] == m)]["mase"].mean())
                            for m in ["sarimax", "sarimax_exog", "prophet", "prophet_exog", "lstm", "lstm_exog"]}
                        for s in ("abarrotes", "ropa", "calzado")}

# ---- H3: híbrido vs individuales en series volátiles con estacionalidad múltiple
# Subconjunto: series NO intermitentes (ADI < 1,32) con CV² >= mediana del grupo
# (abarrotes de alta rotación y volatilidad; estacionalidad semanal + anual).
cls = sbc.set_index(np.arange(len(sbc)))
noint = cls.index[(cls["adi"] < 1.32)]
umbral = cls.loc[noint, "cv2"].median()
volat = set(cls.index[(cls["adi"] < 1.32) & (cls["cv2"] >= umbral)])
sub = ancho[ancho.index.isin(volat)]
comp = ["hibrido", "prophet_exog", "lstm_exog", "sarimax_exog", "prophet", "lstm", "sarimax"]
h3 = {f"Híbrido < {NOMBRES[m]}": wilcoxon_mejora(sub["hibrido"].to_numpy(), sub[m].to_numpy()) for m in comp[1:]}
adj = holm({k: v["p"] for k, v in h3.items()})
for k in h3:
    h3[k]["p_holm"] = adj[k]
hip["H3"] = {"n_series_volatiles": int(len(sub)), "umbral_cv2": float(umbral), "pruebas": h3,
             "friedman": friedman_nemenyi(sub[comp].to_numpy(), [NOMBRES[c] for c in comp]),
             "wape_subconjunto": resumen(df[df["serie"].isin(volat)]).rename(index=NOMBRES)["WAPE"].to_dict()}
# también sobre todas las series (para discusión)
hip["H3_todas"] = {f"Híbrido < {NOMBRES[m]}": wilcoxon_mejora(ancho["hibrido"].to_numpy(), ancho[m].to_numpy())
                   for m in comp[1:]}
hip["friedman_todos"] = friedman_nemenyi(ancho[list(NOMBRES)].to_numpy(), list(NOMBRES.values()))

# ---- H1: tiempos
B = RESULTADOS / "benchmark"
h1 = {}
if (B / "openmp.json").exists():
    o = json.loads((B / "openmp.json").read_text())
    f = [r for r in o["fuerte"] if r["impl"] == "C_OpenMP"]
    ref = f[0]
    h1["openmp"] = [{"hilos": r["hilos"], "speedup_ic95": bootstrap_mediana_razon(ref["tiempos"], r["tiempos"]),
                     "p_mann_whitney": mann_whitney_menor(r["tiempos"], ref["tiempos"]) if r["hilos"] > 1 else None,
                     "karp_flatt": karp_flatt(ref["mediana"] / r["mediana"], r["hilos"]),
                     "max_dif": r["max_dif_vs_1hilo_C"]} for r in f]
if (B / "mpi.json").exists():
    m = json.loads((B / "mpi.json").read_text())
    ref = m["etl"][0]
    h1["mpi_etl"] = [{"p": r["p"], "speedup_ic95": bootstrap_mediana_razon(ref["tiempos"], r["tiempos"]),
                      "p_mann_whitney": mann_whitney_menor(r["tiempos"], ref["tiempos"]) if r["p"] > 1 else None}
                     for r in m["etl"]]
    ref = [r for r in m["motor_fuerte"] if r["p"] == 1][0]
    h1["mpi_motor"] = [{"p": r["p"], "estrategia": r["estrategia"],
                        "speedup_ic95": bootstrap_mediana_razon(ref["tiempos"], r["tiempos"]),
                        "p_mann_whitney": mann_whitney_menor(r["tiempos"], ref["tiempos"]) if r["p"] > 1 else None,
                        "desbalance": r["desbalance_mediana"]} for r in m["motor_fuerte"]]
    h1["equivalencia_mpi_max_dif"] = m["equivalencia_max_dif_abs"]
if (B / "lstm.json").exists():
    l = json.loads((B / "lstm.json").read_text())
    ref = l["cpu"][0]
    h1["lstm_cpu"] = [{"hilos": r["hilos"], "speedup_ic95": bootstrap_mediana_razon(ref["tiempos"], r["tiempos"]),
                       "p_mann_whitney": mann_whitney_menor(r["tiempos"], ref["tiempos"]) if r["hilos"] > 1 else None}
                      for r in l["cpu"]]
    h1["lstm_equivalencia"] = l["equivalencia"]
hip["H1"] = h1
(P / "hipotesis.json").write_text(json.dumps(hip, indent=2, default=float))
print(json.dumps({k: hip[k] for k in ("H2",)}, indent=1, default=float)[:3000])
print(json.dumps(hip["H3"], indent=1, default=float)[:3000])
