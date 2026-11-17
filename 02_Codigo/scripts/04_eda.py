"""OE1 – Exploración de patrones de consumo (análisis exploratorio).

* Clasificación Syntetos–Boylan (ADI = 1,32; CV² = 0,49) con el kernel OpenMP.
* Perfil semanal por sector y efectos de calendario (quincena, prima,
  festivo, temporada escolar, navidad) como razón de medias.
* Descomposición STL (periodo 7) de la demanda agregada por sector y
  fuerza de la estacionalidad F_S = max(0, 1 - Var(R)/Var(S+R)).
* Correlación cruzada entre la demanda agregada de abarrotes (variación
  logarítmica semanal) y las exógenas rezagadas (tráfico, TRM, COP/VES).

    python scripts/04_eda.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from statsmodels.tsa.seasonal import STL  # noqa: E402

from pronostico.config import EXOGENAS, FIGURAS, RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.features.omp import clasificar_sbc_omp  # noqa: E402
from pronostico.visualizacion import estilo  # noqa: E402

D = cargar()
cat = D.catalogo
sect = cat["sector"].to_numpy()
cal = pd.read_parquet(EXOGENAS / "calendario.parquet").loc[D.fechas]
exo = pd.read_parquet(EXOGENAS / "macro_sintetica.parquet").loc[D.fechas]
etl = json.loads((RESULTADOS / "eda" / "etl_resumen.json").read_text())
out = {"etl": etl, "series": int(len(D.Y)), "dias": int(D.Y.shape[1]),
       "desde": str(D.fechas[0].date()), "hasta": str(D.fechas[-1].date())}

# 1. Intermitencia (SBC)
adi, cv2 = clasificar_sbc_omp(D.Y)
clase = np.where(adi < 1.32, np.where(cv2 < 0.49, "suave", "erratica"),
                 np.where(cv2 < 0.49, "intermitente", "irregular"))
tabla = pd.crosstab(sect, clase)
out["sbc"] = tabla.to_dict()
out["ceros_por_sector"] = {s: float((D.Y[sect == s] == 0).mean()) for s in np.unique(sect)}
pd.DataFrame({"sku": cat["sku"], "sector": sect, "adi": adi, "cv2": cv2, "clase": clase}).to_csv(
    RESULTADOS / "eda" / "clasificacion_sbc.csv", index=False)

# 2. Perfil semanal y efectos de calendario
agg = pd.DataFrame({s: D.Y[sect == s].sum(0) for s in ("abarrotes", "ropa", "calzado")}, index=D.fechas)
dow = agg.groupby(agg.index.dayofweek).mean() / agg.mean()
out["perfil_semanal"] = dow.round(3).to_dict()
efectos = {}
for c in ("quincena", "prima", "festivo", "temporada_escolar", "navidad"):
    m = cal[c].astype(bool).to_numpy()
    efectos[c] = {s: float(agg.loc[m, s].mean() / agg.loc[~m, s].mean()) for s in agg}
out["efectos_calendario"] = efectos

# 3. STL
stl = {}
comp = {}
for s in agg:
    r = STL(np.log1p(agg[s]), period=7, robust=True).fit()
    fs = max(0.0, 1 - np.var(r.resid) / np.var(r.seasonal + r.resid))
    ft = max(0.0, 1 - np.var(r.resid) / np.var(r.trend + r.resid))
    stl[s] = {"fuerza_estacional_semanal": float(fs), "fuerza_tendencia": float(ft)}
    comp[s] = r
out["stl"] = stl

# 4. Correlación cruzada (abarrotes): variación log de 7 días
y = np.log(agg["abarrotes"].rolling(7).sum()).diff(7)
candidatas = {
    "trafico_fronterizo": np.log(exo["trafico_fronterizo"].rolling(7).sum()).diff(7),
    "trm": np.log(exo["trm"]).diff(28),
    "cop_ves": np.log(exo["cop_ves"]).diff(28),
}
ccf = {}
for nom, x in candidatas.items():
    cs = [float(y.corr(x.shift(k))) for k in range(0, 36)]
    k = int(np.nanargmax(np.abs(cs)))
    ccf[nom] = {"rezago_max": k, "corr_max": cs[k], "corr_por_rezago": cs}
out["correlacion_cruzada"] = {k: {kk: vv for kk, vv in v.items() if kk != "corr_por_rezago"} for k, v in ccf.items()}
(RESULTADOS / "eda" / "eda.json").write_text(json.dumps(out, indent=2, default=float))

# --- Figura 2: patrones (2 paneles, ancho de columna)
estilo.aplicar()
import matplotlib.pyplot as plt  # noqa: E402

fig, ax = plt.subplots(2, 1, figsize=(estilo.ANCHO_COL, 3.6))
dias = ["L", "M", "X", "J", "V", "S", "D"]
for j, s in enumerate(("abarrotes", "ropa", "calzado")):
    ax[0].plot(range(7), dow[s].to_numpy(), marker="o", color=estilo.SERIES[j], label=s.capitalize())
ax[0].set_xticks(range(7), dias)
ax[0].set_ylabel("Índice (media = 1)")
ax[0].set_title("(a) Perfil semanal por sector", loc="left")
ax[0].legend(ncol=1, loc="upper left")
semanal = agg.resample("W").sum().iloc[1:-1]          # sin semanas incompletas
for j, s in enumerate(("abarrotes", "ropa", "calzado")):
    ax[1].plot(semanal.index, semanal[s] / semanal[s].mean(), color=estilo.SERIES[j], lw=1.1)
ax[1].set_ylabel("Ventas semanales / media")
ax[1].set_title("(b) Demanda semanal agregada (dic. y temporada escolar)", loc="left")
ax[1].tick_params(axis="x", rotation=0)
estilo.formato_mes(ax[1])
estilo.comas(ax[0], "y"); estilo.comas(ax[1], "y")
fig.tight_layout()
FIGURAS.mkdir(parents=True, exist_ok=True)
fig.savefig(FIGURAS / "fig2_patrones_consumo.png")
print(json.dumps({k: out[k] for k in ("sbc", "efectos_calendario", "stl", "correlacion_cruzada")}, indent=1, default=float))
