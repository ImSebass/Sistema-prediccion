#!/usr/bin/env bash
# Ejecuta el pipeline completo, de los datos al tablero de alertas.
# Variables opcionales: NP (procesos MPI), HOSTFILE (nodos del clúster), P_MAX.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=src OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 PYTHONWARNINGS=ignore
NP=${NP:-$(getconf _NPROCESSORS_ONLN)}
EXTRA=${HOSTFILE:+--hostfile $HOSTFILE}
MPI="mpirun --allow-run-as-root --mca osc ^ucx $EXTRA -np $NP"

python scripts/01_generar_datos.py                       # OE1: datos sintéticos
bash scripts/03_etl.sh "$NP"                             # OE3: ETL MPI + anonimización
python scripts/04_eda.py                                 # OE1: patrones de consumo
$MPI python scripts/02_seleccion_modelos.py              # OE2: selección (validación)
bash scripts/03b_modelos_locales.sh            # OE3/OE4: modelos locales (MPI, con puntos de control)
python scripts/05_precision_global.py                    # OE3/OE4: LSTM / híbrido (CUDA si existe)
python scripts/06_benchmark_openmp.py                    # H1: OpenMP
python scripts/07_benchmark_mpi.py                       # H1: MPI, híbrido MPI+OpenMP, equivalencia
python scripts/08_benchmark_lstm.py                      # H1: LSTM CPU/GPU, equivalencia
python scripts/09_analisis_hipotesis.py                  # H1–H3
python scripts/10_inventario.py                          # OE4: inventario
python scripts/11_figuras.py                             # figuras del artículo
python scripts/12_produccion_y_alertas.py                # despliegue: pronóstico de producción y alertas
python scripts/13_plataforma_web.py                      # plataforma web DemandAI (plataforma/dist/DemandAI.html)
