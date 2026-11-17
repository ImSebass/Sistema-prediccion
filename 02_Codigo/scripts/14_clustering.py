"""Agrupamiento (clustering) de las series de demanda: k-means y jerárquico de Ward.

Pregunta: ¿las series se agrupan de forma natural por su comportamiento (nivel,
intermitencia, perfil semanal y anual) y esos grupos coinciden con el sector o
con la clasificación de Syntetos–Boylan? ¿Cambia el mejor modelo de un grupo a otro?

Los rasgos se calculan solo con los días anteriores al origen de selección
(día 800), de modo que las ventanas de prueba no intervienen en el agrupamiento.

Entradas: datos/procesados/demanda_diaria.parquet, resultados/eda/clasificacion_sbc.csv,
          resultados/precision/{locales,globales}.pkl
Salidas : resultados/clustering/clustering.json, resultados/clustering/asignacion.csv,
          figuras/fig8_clustering.png

    python scripts/14_clustering.py
"""
import json
import os
import pickle
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.cluster.hierarchy import fcluster, linkage  # noqa: E402
from sklearn.cluster import KMeans  # noqa: E402
from sklearn.decomposition import PCA  # noqa: E402
from sklearn.metrics import adjusted_rand_score, silhouette_score  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

from pronostico.config import FIGURAS, RESULTADOS, SEMILLA_GLOBAL  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.visualizacion import estilo  # noqa: E402

T_CORTE = 800            # origen de selección (OE2): nada posterior entra en los rasgos
K_RANGO = range(2, 9)
SAL = RESULTADOS / "clustering"
SAL.mkdir(parents=True, exist_ok=True)

D = cargar()
Y = D.Y[:, :T_CORTE].astype(float)
fechas = D.fechas[:T_CORTE]
cat = D.catalogo
sbc = pd.read_csv(RESULTADOS / "eda" / "clasificacion_sbc.csv")


# ------------------------------------------------------------------ rasgos
def rasgos(y: np.ndarray) -> list[float]:
    nz = np.flatnonzero(y > 0)
    y = y[nz[0]:] if len(nz) else y                      # desde la primera venta
    f = fechas[len(fechas) - len(y):]
    media = y.mean() if y.mean() > 0 else 1e-9
    pos = y[y > 0]
    adi = len(y) / max(len(pos), 1)
    cv2 = (pos.std() / pos.mean()) ** 2 if len(pos) > 1 else 0.0
    semana = [y[f.dayofweek == d].mean() / media for d in range(7)]
    mes = [y[f.month == m].mean() / media if (f.month == m).any() else 1.0 for m in range(1, 13)]
    return [np.log1p(media), np.log(adi), np.log1p(cv2), (y == 0).mean(), *semana, *mes]


NOMBRES = (["log_media", "log_adi", "log_cv2", "frac_ceros"] + [f"sem_{d}" for d in range(7)]
           + [f"mes_{m}" for m in range(1, 13)])
F = np.array([rasgos(y) for y in Y])
Z = StandardScaler().fit_transform(F)

# ------------------------------------------------------------------ selección de k
sil_km, sil_ward, inercia = {}, {}, {}
L = linkage(Z, method="ward")
for k in K_RANGO:
    km = KMeans(n_clusters=k, n_init=20, random_state=SEMILLA_GLOBAL).fit(Z)
    sil_km[k] = float(silhouette_score(Z, km.labels_))
    inercia[k] = float(km.inertia_)
    sil_ward[k] = float(silhouette_score(Z, fcluster(L, k, criterion="maxclust")))
k_opt = max(sil_km, key=sil_km.get)

km = KMeans(n_clusters=k_opt, n_init=20, random_state=SEMILLA_GLOBAL).fit(Z)
et_km = km.labels_
et_ward = fcluster(L, k_opt, criterion="maxclust") - 1

# Se renumeran los grupos de k-means de menor a mayor fracción de ceros (lectura estable).
orden = np.argsort([F[et_km == g, 3].mean() for g in range(k_opt)])
mapa = {int(g): i for i, g in enumerate(orden)}
et_km = np.array([mapa[int(g)] for g in et_km])

ari = {
    "kmeans_vs_ward": float(adjusted_rand_score(et_km, et_ward)),
    "kmeans_vs_sector": float(adjusted_rand_score(et_km, cat["sector"])),
    "kmeans_vs_sbc": float(adjusted_rand_score(et_km, sbc["clase"])),
    "ward_vs_sector": float(adjusted_rand_score(et_ward, cat["sector"])),
    "ward_vs_sbc": float(adjusted_rand_score(et_ward, sbc["clase"])),
}

# ------------------------------------------------------------------ mejor modelo por grupo
P = RESULTADOS / "precision"
with open(P / "locales.pkl", "rb") as fh:
    loc = pickle.load(fh)
with open(P / "globales.pkl", "rb") as fh:
    glo = pickle.load(fh)["registros"]
df = pd.DataFrame([{k: v for k, v in r.items() if k in ("serie", "modelo", "abs_err", "suma_y", "sesgo")}
                   for r in loc + glo])
df = df[df["modelo"] != "prophet_hibrido"]
df["grupo"] = et_km[df["serie"]]
g = df.groupby(["grupo", "modelo"])
wape = (g["abs_err"].sum() / g["suma_y"].sum()).unstack()

grupos = []
for gi in range(k_opt):
    m = et_km == gi
    w = wape.loc[gi].sort_values()
    sectores = cat.loc[m, "sector"].value_counts().to_dict()
    clases = sbc.loc[m, "clase"].value_counts().to_dict()
    grupos.append({
        "grupo": gi + 1, "n_series": int(m.sum()),
        "n_series_evaluadas": int(df.loc[df["grupo"] == gi, "serie"].nunique()),
        "sectores": {k: int(v) for k, v in sectores.items()},
        "clases_sbc": {k: int(v) for k, v in clases.items()},
        "media_diaria": float(np.expm1(F[m, 0]).mean()),
        "adi_medio": float(np.exp(F[m, 1]).mean()),
        "frac_ceros": float(F[m, 3].mean()),
        "indice_sabado": float(F[m, 4 + 5].mean()),
        "indice_diciembre": float(F[m, 11 + 11].mean()),
        "wape": {k: float(v) for k, v in w.items()},
        "mejor_modelo": w.index[0], "wape_mejor": float(w.iloc[0]),
        "wape_lstm": float(w["lstm"]), "wape_sarimax": float(w["sarimax"]), "wape_tsb": float(w["tsb"]),
    })

res = {"t_corte": T_CORTE, "rasgos": NOMBRES, "k_optimo": int(k_opt),
       "silueta_kmeans": sil_km, "silueta_ward": sil_ward, "inercia_kmeans": inercia,
       "silueta_kmeans_k_opt": sil_km[k_opt], "silueta_ward_k_opt": sil_ward[k_opt],
       "ari": ari, "grupos": grupos}
with open(SAL / "clustering.json", "w", encoding="utf-8") as fh:
    json.dump(res, fh, ensure_ascii=False, indent=2)
pd.DataFrame({"sku": cat["sku"], "sector": cat["sector"], "clase_sbc": sbc["clase"],
              "grupo_kmeans": et_km + 1, "grupo_ward": et_ward + 1}).to_csv(SAL / "asignacion.csv", index=False)

# ------------------------------------------------------------------ figura
import matplotlib.pyplot as plt  # noqa: E402

estilo.aplicar()
fig, (a, b) = plt.subplots(2, 1, figsize=(estilo.ANCHO_COL, 4.6))   # una columna IEEE
ks = list(K_RANGO)
a.plot(ks, [sil_km[k] for k in ks], marker="o", label="k-means")
a.plot(ks, [sil_ward[k] for k in ks], marker="s", label="Jerárquico (Ward)")
a.axvline(k_opt, color=estilo.SECUNDARIO, lw=0.8, ls="--")
a.set_xlabel("Número de grupos k")
a.set_ylabel("Coeficiente de silueta")
a.set_title("(a) Selección de k", loc="left")
a.legend()
xy = PCA(n_components=2, random_state=SEMILLA_GLOBAL).fit_transform(Z)
for gi in range(k_opt):
    m = et_km == gi
    b.scatter(xy[m, 0], xy[m, 1], s=4, alpha=0.6, color=estilo.SERIES[gi], label=f"Grupo {gi + 1}", linewidths=0)
b.set_xlabel("Componente principal 1")
b.set_ylabel("Componente principal 2")
b.set_title("(b) Grupos k-means (proyección PCA)", loc="left")
b.legend(markerscale=2.5)
estilo.comas(a, "y")
fig.tight_layout()
fig.savefig(FIGURAS / "fig8_clustering.png")

print(f"k óptimo = {k_opt}  silueta k-means = {sil_km[k_opt]:.3f}  Ward = {sil_ward[k_opt]:.3f}")
print("ARI:", {k: round(v, 3) for k, v in ari.items()})
for gr in grupos:
    print(gr["grupo"], gr["n_series"], gr["sectores"], f"ceros={gr['frac_ceros']:.2f}",
          f"mejor={gr['mejor_modelo']} ({gr['wape_mejor']:.3f})",
          f"LSTM={gr['wape_lstm']:.3f} SARIMAX={gr['wape_sarimax']:.3f} TSB={gr['wape_tsb']:.3f}")
