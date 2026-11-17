"""Pruebas estadísticas para H1–H3.

H1 (tiempo):     IC bootstrap al 95 % de la mediana del speedup y prueba
                 de Mann–Whitney unilateral T(p) < T(1) sobre las repeticiones.
H1 (precisión):  prueba de EQUIVALENCIA TOST (dos pruebas t unilaterales)
                 sobre la diferencia de WAPE por serie entre la ejecución
                 secuencial y la paralela, con margen ±delta.
H2 y H3:         Wilcoxon de rangos con signo (pareada por serie) sobre MASE,
                 con corrección de Holm por comparaciones múltiples; Friedman
                 + diferencia crítica de Nemenyi para comparar k modelos
                 sobre N series (Demšar, 2006).
"""
from __future__ import annotations

import numpy as np
from scipy import stats


def bootstrap_mediana_razon(t_ref: np.ndarray, t_par: np.ndarray, B: int = 5000, semilla: int = 0):
    rng = np.random.default_rng(semilla)
    a, b = np.asarray(t_ref), np.asarray(t_par)
    s = np.median(rng.choice(a, (B, len(a)), True), 1) / np.median(rng.choice(b, (B, len(b)), True), 1)
    return float(np.median(a) / np.median(b)), float(np.percentile(s, 2.5)), float(np.percentile(s, 97.5))


def mann_whitney_menor(t_par, t_ref) -> float:
    return float(stats.mannwhitneyu(t_par, t_ref, alternative="less").pvalue)


def tost(diferencias: np.ndarray, delta: float) -> dict:
    d = np.asarray(diferencias, float)
    d = d[np.isfinite(d)]
    n, m, s = len(d), d.mean(), d.std(ddof=1)
    if s == 0:
        return {"n": n, "media": m, "p_tost": 0.0 if abs(m) < delta else 1.0, "equivalente": bool(abs(m) < delta),
                "nota": "diferencias idénticas (varianza cero)"}
    se = s / np.sqrt(n)
    p1 = 1 - stats.t.cdf((m + delta) / se, n - 1)    # H0: m <= -delta
    p2 = stats.t.cdf((m - delta) / se, n - 1)        # H0: m >= +delta
    p = max(p1, p2)
    return {"n": n, "media": float(m), "p_tost": float(p), "equivalente": bool(p < 0.05)}


def wilcoxon_mejora(a: np.ndarray, b: np.ndarray) -> dict:
    """H1: el modelo `a` tiene MENOR error que `b` (pareado por serie)."""
    ok = np.isfinite(a) & np.isfinite(b)
    a, b = a[ok], b[ok]
    r = stats.wilcoxon(a, b, alternative="less", zero_method="wilcox")
    dif = a - b
    return {"n": int(ok.sum()), "mediana_a": float(np.median(a)), "mediana_b": float(np.median(b)),
            "mediana_dif": float(np.median(dif)), "p": float(r.pvalue),
            "victorias_a": float((dif < 0).mean())}


def holm(pvals: dict) -> dict:
    claves = sorted(pvals, key=pvals.get)
    m = len(claves)
    ajust, prev = {}, 0.0
    for k, c in enumerate(claves):
        v = min(1.0, max(prev, (m - k) * pvals[c]))
        ajust[c] = v
        prev = v
    return ajust


# Valores críticos q_alpha (alfa = 0,05) de Nemenyi para k = 2..10 (Demšar, 2006)
Q05 = {2: 1.960, 3: 2.343, 4: 2.569, 5: 2.728, 6: 2.850, 7: 2.949, 8: 3.031, 9: 3.102, 10: 3.164}


def friedman_nemenyi(M: np.ndarray, nombres: list[str]) -> dict:
    """M: [N series x k modelos] de errores. Devuelve rangos medios y diferencia crítica."""
    M = M[np.all(np.isfinite(M), 1)]
    N, k = M.shape
    rangos = np.apply_along_axis(stats.rankdata, 1, M).mean(0)
    chi, p = stats.friedmanchisquare(*[M[:, j] for j in range(k)])
    cd = Q05[k] * np.sqrt(k * (k + 1) / (6.0 * N))
    return {"N": int(N), "rangos": dict(zip(nombres, map(float, rangos))), "chi2": float(chi),
            "p": float(p), "diferencia_critica": float(cd)}
