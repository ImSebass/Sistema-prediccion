"""Benchmark MPI (memoria distribuida): ETL de datos y motor de tareas.

1) ETL MPI: escalabilidad fuerte, p = 1..P procesos.
2) Motor de pronóstico (SARIMAX): estrategias bloque / cíclico / dinámico.
   - fuerte: 80 series x 1 origen fijas;
   - débil : 40 series por proceso.
3) Híbrido MPI + OpenMP (kernel TSB): (p x T) en {1x1, 2x1, 1x2, ...}.
4) Equivalencia de resultados: pronósticos con p = 1 vs p = P (dinámico).

Cada configuración se lanza R veces con mpirun; la primera se descarta.
Se registra el tiempo interno (cómputo + comunicación) y el de pared
(incluye arranque de MPI e intérpretes).

    python scripts/07_benchmark_mpi.py
"""
import json
import os
import pickle
import subprocess
import sys
import time

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(RAIZ, "src"))
import numpy as np  # noqa: E402

from pronostico.config import CFG_EXP, RESULTADOS  # noqa: E402

P_MAX = int(os.environ.get("P_MAX", os.cpu_count() or 2))
PROCS = [p for p in (1, 2, 4, 8, 16) if p <= P_MAX]
R = CFG_EXP.repeticiones
ENV = {**os.environ, "PYTHONPATH": os.path.join(RAIZ, "src"), "OMP_NUM_THREADS": "1",
       "OPENBLAS_NUM_THREADS": "1", "ETL_NO_ESCRIBIR": "1", "PYTHONWARNINGS": "ignore"}
MPIRUN = ["mpirun", "--allow-run-as-root", "--mca", "osc", "^ucx"]
HOSTFILE = os.environ.get("HOSTFILE")          # en el clúster: archivo de nodos
if HOSTFILE:
    MPIRUN += ["--hostfile", HOSTFILE]


def lanzar(p, args, opciones_mpi=()):
    t = time.perf_counter()
    r = subprocess.run(MPIRUN + list(opciones_mpi) + ["-np", str(p), sys.executable, "-W", "ignore"] + args,
                       capture_output=True, text=True, env=ENV, cwd=RAIZ)
    pared = time.perf_counter() - t
    linea = [l for l in r.stdout.splitlines() if l.startswith("{")]
    if not linea:
        raise RuntimeError(r.stderr[-2000:])
    d = json.loads(linea[-1])
    d["t_pared"] = pared
    return d


def repetir(p, args, clave="t_total", opciones_mpi=()):
    corridas = [lanzar(p, args, opciones_mpi) for _ in range(R)][1:]
    t = np.array([c[clave] for c in corridas])
    return {"p": p, "tiempos": t.tolist(), "mediana": float(np.median(t)),
            "ric": float(np.percentile(t, 75) - np.percentile(t, 25)),
            "pared_mediana": float(np.median([c["t_pared"] for c in corridas])),
            "desbalance_mediana": float(np.median([c.get("desbalance", 1) for c in corridas])),
            "t_comunicacion_mediana": float(np.median([c.get("t_comunicacion", 0) for c in corridas]))}


PARTES = os.environ.get("PARTES", "etl,motor,debil,hibrido,equivalencia").split(",")
_previo = RESULTADOS / "benchmark" / "mpi.json"
out = json.loads(_previo.read_text()) if _previo.exists() and len(PARTES) < 5 else {}
out.update({"procesos": PROCS, "repeticiones_validas": R - 1})
if "etl" in PARTES:
    out["etl"] = [repetir(p, ["-m", "pronostico.paralelo.etl_mpi"]) for p in PROCS]
    print("ETL", [(e["p"], round(e["mediana"], 2)) for e in out["etl"]])

# Carga mixta y ordenada por modelo (SARIMAX lento seguido de Prophet rápido), como la
# genera el motor en producción: es el caso en que el reparto por bloques se desbalancea.
CARGA = ["--modelos", "sarimax", "prophet", "--max-series", "40", "--n-origenes", "1"]
if "motor" in PARTES:
    motor = []
    for est in ("bloque", "ciclico", "dinamico"):
        for p in PROCS:
            if p == 1 and est != "bloque":
                continue
            r = repetir(p, ["-m", "pronostico.paralelo.motor_mpi"] + CARGA + ["--estrategia", est])
            r["estrategia"] = est
            motor.append(r)
            print("motor", est, p, round(r["mediana"], 2), round(r["desbalance_mediana"], 3))
    out["motor_fuerte"] = motor
    out["motor_carga"] = "SARIMAX + Prophet, 40 series x 1 origen = 80 tareas, ordenadas por modelo"

debil = out.get("motor_debil", []) if "debil" not in PARTES else []
for p in (PROCS if "debil" in PARTES else []):
    r = repetir(p, ["-m", "pronostico.paralelo.motor_mpi", "--modelos", "sarimax", "--max-series", str(40 * p),
                    "--n-origenes", "1", "--estrategia", "dinamico"])
    r["series"] = 40 * p
    debil.append(r)
    print("motor debil", p, round(r["mediana"], 2))
out["motor_debil"] = debil

hib = out.get("hibrido_mpi_omp", []) if "hibrido" not in PARTES else []
for p in (PROCS if "hibrido" in PARTES else []):
    for h in [x for x in (1, 2, 4, 8) if p * x <= P_MAX]:
        # sin --bind-to none, mpirun fija cada proceso a un núcleo y los hilos OpenMP lo comparten
        r = repetir(p, ["-m", "pronostico.paralelo.hibrido_mpi_omp", "--hilos", str(h)], clave="t",
                    opciones_mpi=["--bind-to", "none"])
        r["hilos"] = h
        hib.append(r)
        print("hibrido", p, h, round(r["mediana"], 3))
out["hibrido_mpi_omp"] = hib

# Equivalencia de pronósticos (p = 1 vs p = P_MAX)
eq = {}
for p in ((1, PROCS[-1]) if "equivalencia" in PARTES else ()):
    lanzar(p, ["-m", "pronostico.paralelo.motor_mpi", "--modelos", "sarimax", "--max-series", "80",
               "--n-origenes", "1", "--estrategia", "dinamico", "--guardar", f"equiv_p{p}.pkl"])
    with open(RESULTADOS / "precision" / f"equiv_p{p}.pkl", "rb") as fh:
        eq[p] = {(r["serie"], r["origen"]): r["pron"] for r in pickle.load(fh)}
if eq:
    claves = sorted(eq[1])
    out["equivalencia_max_dif_abs"] = float(max(np.abs(eq[1][k] - eq[PROCS[-1]][k]).max() for k in claves))
    print("equivalencia", out["equivalencia_max_dif_abs"])

(RESULTADOS / "benchmark").mkdir(parents=True, exist_ok=True)
(RESULTADOS / "benchmark" / "mpi.json").write_text(json.dumps(out, indent=2))
