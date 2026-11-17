"""Benchmark OpenMP (memoria compartida): kernel C vs Numba(omp) vs NumPy.

Escalabilidad FUERTE: 1.280 series fijas, T = 1..Tmax hilos.
Escalabilidad DÉBIL : 1.280 x T series con T hilos (carga ∝ hilos).
Verificación de precisión: los pronósticos con T hilos deben ser idénticos
a los de 1 hilo (cada serie es independiente; no hay reducciones flotantes
compartidas), lo que se comprueba elemento a elemento.

    python scripts/06_benchmark_openmp.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pronostico.benchmark.medicion import medir  # noqa: E402
from pronostico.config import CFG_EXP, PROCESADOS, RESULTADOS  # noqa: E402
from pronostico.features import omp  # noqa: E402

HILOS = [h for h in range(1, (os.cpu_count() or 2) + 1) if h in (1, 2, 4, 8, 16, 32)]
Y = pd.read_parquet(PROCESADOS / "demanda_diaria.parquet").to_numpy(np.float32)
R = CFG_EXP.repeticiones
out = {"hilos_disponibles": os.cpu_count(), "series": int(len(Y)), "repeticiones_validas": R - 1}

omp.compilar()
ref = omp.tsb_rejilla_omp(Y, hilos=1)["pronostico"]
fuerte = []
for impl, fn in (("C_OpenMP", omp.tsb_rejilla_omp), ("Numba_omp", omp.tsb_rejilla_numba)):
    for h in HILOS:
        m = medir(lambda: fn(Y, hilos=h), R)
        dif = float(np.abs(fn(Y, hilos=h)["pronostico"] - ref).max())
        fuerte.append({"impl": impl, "hilos": h, **m, "max_dif_vs_1hilo_C": dif})
        print(impl, h, round(m["mediana"], 3), dif)
# NumPy (referencia ingenua): 1 repetición sobre 160 series, extrapolada
import time  # noqa: E402
t = time.perf_counter(); omp.tsb_rejilla_numpy(Y[:160]); tn = (time.perf_counter() - t) * len(Y) / 160
out["numpy_ref_seg_estimado"] = tn
out["fuerte"] = fuerte

debil = []
for h in HILOS:
    Yh = np.ascontiguousarray(np.tile(Y, (h, 1)))
    m = medir(lambda: omp.tsb_rejilla_omp(Yh, hilos=h), R)
    debil.append({"hilos": h, "series": int(len(Yh)), **m})
    print("debil", h, round(m["mediana"], 3))
out["debil"] = debil

car = []
for h in HILOS:
    m = medir(lambda: omp.caracteristicas_omp(Y, hilos=h), R)
    car.append({"hilos": h, **m})
out["caracteristicas_moviles"] = car

(RESULTADOS / "benchmark").mkdir(parents=True, exist_ok=True)
(RESULTADOS / "benchmark" / "openmp.json").write_text(json.dumps(out, indent=2))
