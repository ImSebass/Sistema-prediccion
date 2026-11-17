#!/usr/bin/env bash
# OE3/OE4 – Ajuste de todos los modelos locales con el motor MPI (planificación dinámica).
# Guarda un archivo por modelo (punto de control) y luego los une en resultados/precision/locales.pkl.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=src OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 PYTHONWARNINGS=ignore
NP=${NP:-$(getconf _NPROCESSORS_ONLN)}
EXTRA=${HOSTFILE:+--hostfile $HOSTFILE}
for M in ingenuo_s7 media_movil28 tsb prophet_hibrido prophet prophet_exog sarimax sarimax_exog; do
  if [ ! -f "resultados/precision/locales_${M}.pkl" ]; then
    mpirun --allow-run-as-root --mca osc ^ucx $EXTRA -np "$NP" python -W ignore -m pronostico.paralelo.motor_mpi \
      --modelos "$M" --estrategia dinamico --guardar "locales_${M}.pkl"
  fi
done
python - <<'PY'
import pickle, glob
todo = []
for f in sorted(glob.glob("resultados/precision/locales_*.pkl")):
    with open(f, "rb") as fh:
        todo += pickle.load(fh)
with open("resultados/precision/locales.pkl", "wb") as fh:
    pickle.dump(todo, fh)
print("tareas:", len(todo))
PY
