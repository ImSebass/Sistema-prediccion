"""Benchmark del entrenamiento del LSTM global (PyTorch: CPU multihilo / CUDA).

* CPU: T = 1..Tmax hilos intra-operación (BLAS/OpenMP de PyTorch), mismo
  número fijo de pasos de optimización (150), R repeticiones (1.ª descartada).
* GPU: si torch.cuda.is_available(), se mide el mismo entrenamiento en CUDA
  y se reporta S_GPU = T_CPU(Tmax hilos) / T_GPU (no hay "p" variable con
  una sola GPU).
* Precisión: entrenamiento completo (8 épocas) con 1 hilo vs Tmax hilos;
  diferencia de WAPE por serie sometida a TOST (margen ±1 punto).

    python scripts/08_benchmark_lstm.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np  # noqa: E402
import torch  # noqa: E402

from pronostico.benchmark.medicion import medir  # noqa: E402
from pronostico.config import CFG_EXP, RESULTADOS  # noqa: E402
from pronostico.datos.carga import cargar  # noqa: E402
from pronostico.evaluacion.estadistica import tost  # noqa: E402
from pronostico.evaluacion.metricas import wape  # noqa: E402
from pronostico.modelos.lstm_global import entrenar_y_predecir  # noqa: E402

D = cargar()
t0 = D.origenes[-1]
h = CFG_EXP.horizonte
R = CFG_EXP.repeticiones
HILOS = [x for x in (1, 2, 4, 8, 16) if x <= (os.cpu_count() or 2)]
out = {"cuda": torch.cuda.is_available(), "torch": torch.__version__, "hilos": HILOS}
if out["cuda"]:
    out["gpu"] = torch.cuda.get_device_name(0)

cpu = []
for th in HILOS:
    m = medir(lambda: entrenar_y_predecir(D, D.muestra, t0, h, "lstm_exog", dispositivo="cpu",
                                          hilos=th, max_pasos=150), R)
    cpu.append({"hilos": th, **m})
    print("cpu", th, round(m["mediana"], 2))
out["cpu"] = cpu
if out["cuda"]:
    m = medir(lambda: entrenar_y_predecir(D, D.muestra, t0, h, "lstm_exog", dispositivo="cuda", max_pasos=150), R)
    out["gpu_medicion"] = m
    out["speedup_gpu_vs_cpu"] = cpu[-1]["mediana"] / m["mediana"]

# Equivalencia de precisión 1 hilo vs Tmax hilos (entrenamiento completo)
P1, _ = entrenar_y_predecir(D, D.muestra, t0, h, "lstm_exog", epocas=8, hilos=1, dispositivo="cpu")
Pn, _ = entrenar_y_predecir(D, D.muestra, t0, h, "lstm_exog", epocas=8, hilos=HILOS[-1], dispositivo="cpu")
Yt = D.Y[D.muestra, t0:t0 + h]
w1 = np.array([wape(Yt[k], P1[k]) for k in range(len(Yt))])
wn = np.array([wape(Yt[k], Pn[k]) for k in range(len(Yt))])
out["equivalencia"] = {"wape_1hilo": wape(Yt, P1), "wape_nhilos": wape(Yt, Pn),
                       "max_dif_pronostico": float(np.abs(P1 - Pn).max()),
                       **tost(w1 - wn, CFG_EXP.margen_equivalencia_wape)}
print(out["equivalencia"])
(RESULTADOS / "benchmark").mkdir(parents=True, exist_ok=True)
(RESULTADOS / "benchmark" / "lstm.json").write_text(json.dumps(out, indent=2, default=float))
