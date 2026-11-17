"""Figuras del artículo (formato IEEE, 300 ppp).

fig3_arquitectura.png      – arquitectura del sistema y mapa de paralelismo
fig4_escalabilidad.png     – (a) speedup fuerte medido + proyección Amdahl; (b) eficiencia débil + Gustafson
fig5_estrategias_mpi.png   – tiempo y desbalance por estrategia de planificación MPI
fig6_precision.png         – WAPE y MASE por modelo
fig7_inventario.png        – costo total vs nivel de servicio por modelo

    python scripts/11_figuras.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pronostico.benchmark.medicion import amdahl, gustafson, karp_flatt  # noqa: E402
from pronostico.config import FIGURAS, RESULTADOS  # noqa: E402
from pronostico.visualizacion import estilo  # noqa: E402

estilo.aplicar()
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch  # noqa: E402

FIGURAS.mkdir(parents=True, exist_ok=True)
B = RESULTADOS / "benchmark"
C = estilo.SERIES


# ------------------------------------------------------------ Fig. 3 arquitectura
def caja(ax, x, y, w, h, texto, color, sub=None):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.04",
                                fc=color + "22", ec=color, lw=1.0))
    ax.text(x + w / 2, y + h / 2 + (0.07 if sub else 0), texto, ha="center", va="center", fontsize=7, weight="bold")
    if sub:
        ax.text(x + w / 2, y + h / 2 - 0.11, sub, ha="center", va="center", fontsize=6, color=estilo.SECUNDARIO)


def flecha(ax, x0, y0, x1, y1):
    ax.annotate("", (x1, y1), (x0, y0), arrowprops=dict(arrowstyle="->", lw=0.9, color=estilo.SECUNDARIO))


fig, ax = plt.subplots(figsize=(estilo.ANCHO_COL, 3.3))
ax.set_xlim(0, 3.4); ax.set_ylim(0, 3.2); ax.axis("off")
caja(ax, 0.05, 2.65, 1.5, 0.45, "POS crudo (Parquet)", C[1], "tienda × mes, con PII")
caja(ax, 1.85, 2.65, 1.5, 0.45, "Exógenas", C[1], "TRM, COP/VES, IPC, tráfico")
caja(ax, 0.05, 1.95, 1.5, 0.48, "ETL + anonimización", C[0], "MPI: LPT + Gather")
caja(ax, 1.85, 1.95, 1.5, 0.48, "Rasgos y TSB/SES", C[0], "OpenMP (C) / Numba-omp")
caja(ax, 0.05, 1.22, 1.5, 0.5, "Motor de tareas", C[0], "MPI: SARIMAX, Prophet")
caja(ax, 1.85, 1.22, 1.5, 0.5, "LSTM global / híbrido", C[0], "PyTorch CUDA (o CPU)")
caja(ax, 0.05, 0.5, 3.3, 0.48, "Evaluación (origen móvil) · pruebas H1–H3 · simulación (R,S)", C[2])
caja(ax, 0.45, 0.0, 2.5, 0.36, "Plataforma web DemandAI · alertas y pedidos", C[2])
flecha(ax, 0.8, 2.65, 0.8, 2.43); flecha(ax, 2.6, 2.65, 2.6, 2.43); flecha(ax, 1.55, 2.19, 1.85, 2.19)
flecha(ax, 0.8, 1.95, 0.8, 1.72); flecha(ax, 2.6, 1.95, 2.6, 1.72); flecha(ax, 1.55, 2.05, 1.85, 1.6)
flecha(ax, 0.8, 1.22, 0.8, 0.98); flecha(ax, 2.6, 1.22, 2.6, 0.98); flecha(ax, 1.7, 0.5, 1.7, 0.36)
fig.savefig(FIGURAS / "fig3_arquitectura.png")
plt.close(fig)

# ------------------------------------------------------------ Fig. 4 escalabilidad
o = json.loads((B / "openmp.json").read_text())
m = json.loads((B / "mpi.json").read_text())
l = json.loads((B / "lstm.json").read_text())


def serie_speedup(filas, clave):
    ref = [f for f in filas if f[clave] == 1][0]["mediana"]
    ps = [f[clave] for f in filas]
    return np.array(ps), np.array([ref / f["mediana"] for f in filas])


curvas = {
    "OpenMP (C), TSB": serie_speedup([f for f in o["fuerte"] if f["impl"] == "C_OpenMP"], "hilos"),
    "Numba-omp, TSB": serie_speedup([f for f in o["fuerte"] if f["impl"] == "Numba_omp"], "hilos"),
    "MPI, ETL": serie_speedup(m["etl"], "p"),
    "MPI dinámico, SARIMAX": serie_speedup([f for f in m["motor_fuerte"] if f["estrategia"] in ("bloque",) and f["p"] == 1]
                                           + [f for f in m["motor_fuerte"] if f["estrategia"] == "dinamico"], "p"),
    "LSTM CPU (hilos)": serie_speedup(l["cpu"], "hilos"),
}
fig, ax = plt.subplots(1, 2, figsize=(estilo.ANCHO_COL, 1.95))
pp = np.array([1, 2, 4, 8, 16])
ax[0].plot(pp, pp, ls=":", color=estilo.SECUNDARIO, lw=1, label="Ideal")
for j, (nom, (ps, s)) in enumerate(curvas.items()):
    ax[0].plot(ps, s, marker="o", color=C[j], lw=1.2, label=nom)
# proyección Amdahl con la fracción serial estimada (Karp–Flatt) del motor MPI
ps, s = curvas["MPI dinámico, SARIMAX"]
f = max(karp_flatt(s[-1], ps[-1]), 0.005)
ax[0].plot(pp, amdahl(pp, f), ls="--", color=C[3], lw=1, label=f"Amdahl f = {estilo.c(f, 3)} (proy.)")
ax[0].set_xscale("log", base=2); ax[0].set_yscale("log", base=2)
ax[0].set_xticks(pp, [str(x) for x in pp]); ax[0].set_yticks(pp, [str(x) for x in pp])
ax[0].set_xlabel("Unidades de procesamiento p"); ax[0].set_ylabel("Speedup S(p)")
ax[0].set_title("(a) Escalabilidad fuerte", loc="left")
d = m["motor_debil"]
ps_d = np.array([x["p"] for x in d]); e_mpi = d[0]["mediana"] / np.array([x["mediana"] for x in d])
dd = o["debil"]
ps_o = np.array([x["hilos"] for x in dd]); e_omp = dd[0]["mediana"] / np.array([x["mediana"] for x in dd])
ax[1].plot(ps_o, e_omp, marker="o", color=C[0], label="OpenMP (C)")
ax[1].plot(ps_d, e_mpi, marker="o", color=C[3], label="MPI dinámico")
fg = f       # misma fracción secuencial (Karp–Flatt del motor) para la proyección débil
ax[1].plot(pp, gustafson(pp, fg) / pp, ls="--", color=C[3], lw=1, label=f"Gustafson f = {estilo.c(fg, 3)} (proy.)")
ax[1].set_xscale("log", base=2); ax[1].set_xticks(pp, [str(x) for x in pp]); ax[1].set_ylim(0, 1.15)
estilo.comas(ax[1], "y")
ax[1].set_xlabel("p (carga crece con p)"); ax[1].set_ylabel("Eficiencia débil T(1)/T(p)")
ax[1].axvspan(2.2, 16.5, color=estilo.GRILLA, alpha=0.35, lw=0)
ax[0].axvspan(2.2, 16.5, color=estilo.GRILLA, alpha=0.35, lw=0)
ax[0].text(5.5, 1.15, "proyección", fontsize=6, color=estilo.SECUNDARIO, ha="center")
ax[1].set_title("(b) Escalabilidad débil", loc="left")
h0, l0 = ax[0].get_legend_handles_labels()
h1, l1 = ax[1].get_legend_handles_labels()
fig.legend(h0 + h1[-1:], l0 + l1[-1:], loc="lower center", ncol=2, fontsize=5.6, bbox_to_anchor=(0.5, -0.30))
fig.tight_layout()
fig.savefig(FIGURAS / "fig4_escalabilidad.png")
plt.close(fig)

# ------------------------------------------------------------ Fig. 5 estrategias MPI
mf = [f for f in m["motor_fuerte"] if f["p"] == max(x["p"] for x in m["motor_fuerte"])]
t1 = [f for f in m["motor_fuerte"] if f["p"] == 1][0]["mediana"]
fig, ax = plt.subplots(1, 2, figsize=(estilo.ANCHO_COL, 1.55))
nom = [f["estrategia"].capitalize().replace("Ciclico", "Cíclico").replace("Dinamico", "Dinámico") for f in mf]
ax[0].barh(nom, [t1 / f["mediana"] for f in mf], color=C[0], height=0.55)
for k, f in enumerate(mf):
    ax[0].text(t1 / f["mediana"] + 0.02, k, estilo.c(t1 / f["mediana"]), va="center", fontsize=6.5)
ax[0].set_xlabel(f"Speedup (p = {mf[0]['p']})"); ax[0].set_title("(a)", loc="left")
ax[0].set_xlim(0, max(t1 / f["mediana"] for f in mf) * 1.25)
ax[1].barh(nom, [(f["desbalance_mediana"] - 1) * 100 for f in mf], color=C[1], height=0.55)
for k, f in enumerate(mf):
    ax[1].text((f["desbalance_mediana"] - 1) * 100 + 0.1, k, estilo.c((f["desbalance_mediana"] - 1) * 100, 1) + " %", va="center", fontsize=6.5)
ax[1].set_xlabel("Desbalance de carga (%)"); ax[1].set_title("(b)", loc="left"); ax[1].set_yticklabels([])
ax[1].set_xlim(0, max((f["desbalance_mediana"] - 1) * 100 for f in mf) * 1.35 + 0.5)
estilo.comas(ax[0], "x"); estilo.comas(ax[1], "x")
fig.tight_layout()
fig.savefig(FIGURAS / "fig5_estrategias_mpi.png")
plt.close(fig)

# ------------------------------------------------------------ Fig. 6 precisión
tab = pd.read_csv(RESULTADOS / "precision" / "tabla_precision.csv", index_col=0).sort_values("WAPE", ascending=False)
fig, ax = plt.subplots(figsize=(estilo.ANCHO_COL, 2.2))
colores = [C[2] if "Híbrido" in i else (C[0] if ("exóg" in i) else "#9a9893") for i in tab.index]
ax.barh(tab.index, tab["WAPE"], color=colores, height=0.6)
for k, (i, r) in enumerate(tab.iterrows()):
    ax.text(r["WAPE"] + 0.005, k, f"{estilo.c(r['WAPE'], 3)}  (MASE {estilo.c(r['MASE_media'])})", va="center", fontsize=6.3)
ax.set_xlim(0, tab["WAPE"].max() * 1.45)
ax.set_xlabel("WAPE (3 orígenes × 480 series; menor es mejor)")
ax.grid(axis="y", visible=False)
estilo.comas(ax, "x")
fig.tight_layout()
fig.savefig(FIGURAS / "fig6_precision.png")
plt.close(fig)

# ------------------------------------------------------------ Fig. 7 inventario
inv = pd.read_csv(RESULTADOS / "inventario" / "simulacion_inventario.csv", index_col=0)
NOMBRES = {"ingenuo_s7": "Ingenuo", "media_movil28": "Media 28", "tsb": "TSB", "sarimax": "SARIMAX",
           "sarimax_exog": "SARIMAX+x", "prophet": "Prophet", "prophet_exog": "Prophet+x", "lstm": "LSTM",
           "lstm_exog": "LSTM+x", "hibrido": "Híbrido"}
fig, ax = plt.subplots(figsize=(estilo.ANCHO_COL, 2.0))
ax.scatter(inv["fill_rate"] * 100, inv["costo_total"] / 1e6, s=18, color=C[0], zorder=3, edgecolor="white", linewidth=0.6)
DESPL = {"lstm": (4, -8), "hibrido": (4, 2), "prophet": (-14, 5), "tsb": (-8, -10)}
for i, r in inv.iterrows():
    ax.annotate(NOMBRES.get(i, i), (r["fill_rate"] * 100, r["costo_total"] / 1e6), xytext=DESPL.get(i, (3, 2)),
                textcoords="offset points", fontsize=6)
ax.margins(x=0.08, y=0.1)
ax.set_xlabel("Nivel de servicio (fill rate, %)")
ax.set_ylabel("Costo total (millones COP)")
estilo.comas(ax, "x"); estilo.comas(ax, "y")
fig.tight_layout()
fig.savefig(FIGURAS / "fig7_inventario.png")
plt.close(fig)
print("figuras ok")
