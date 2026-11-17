#!/usr/bin/env bash
# OE3 – ETL distribuido: POS crudo -> serie producto-establecimiento-día (anonimizada).
# Uso: bash scripts/03_etl.sh [procesos]   (en clúster: HOSTFILE=nodos.txt bash scripts/03_etl.sh 4)
set -euo pipefail
cd "$(dirname "$0")/.."
NP=${1:-$(getconf _NPROCESSORS_ONLN)}
EXTRA=${HOSTFILE:+--hostfile $HOSTFILE}
PYTHONPATH=src OMP_NUM_THREADS=1 mpirun --allow-run-as-root --mca osc ^ucx $EXTRA -np "$NP" \
  python -W ignore -m pronostico.paralelo.etl_mpi
