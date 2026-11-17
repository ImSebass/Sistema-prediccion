# Sistema de Predicción de Demanda para el Comercio Minorista Fronterizo

Proyecto final de **167411 – Fundamentos de Computación Paralela y Distribuida** (Universidad de Pamplona).
Autores: Asly Valentina Acuña Palencia, Juan Sebastián Cárdenas Acevedo y Julio Sebastián Carrillo Reyes.

Motor de pronóstico de demanda por producto y establecimiento que combina modelos estadísticos y de
aprendizaje profundo con los tres paradigmas de cómputo paralelo de la asignatura:

| Etapa | Paralelismo | Tecnología | Código |
|---|---|---|---|
| Limpieza, anonimización y agregación de POS | Datos (particiones tienda × mes, reparto LPT) | **MPI** | `src/pronostico/paralelo/etl_mpi.py` |
| Ajuste TSB/SES por rejilla y rasgos móviles | Bucle sobre series, memoria compartida | **OpenMP** (C `#pragma omp`) y Numba-omp | `src/pronostico/features/kernel_omp.c`, `omp.py` |
| SARIMAX y Prophet por serie y origen | Tareas independientes, costo variable | **MPI** bloque / cíclico / dinámico (RMA `Fetch_and_op`) | `src/pronostico/paralelo/motor_mpi.py` |
| LSTM global e híbrido Prophet-LSTM | Datos en lotes de tensores | **CUDA** (PyTorch/cuDNN); CPU multihilo de respaldo | `src/pronostico/modelos/lstm_global.py` |
| Ejecución en clúster | 1 rango MPI por nodo × T hilos | **MPI + OpenMP** (Scatterv/Gatherv) | `src/pronostico/paralelo/hibrido_mpi_omp.py` |

> **Datos sintéticos.** Esta versión no cuenta con exportaciones POS reales. `datos/generador_sintetico.py`
> genera 5 establecimientos, 1 280 productos y 30 meses (≈3,3 M líneas de ticket con PII ficticia y errores
> típicos), calibrados al contexto de Cúcuta: quincenas, primas, festivos colombianos, temporada escolar,
> choques cambiarios (TRM y COP/VES), tráfico fronterizo y demanda intermitente. Las series macro también son
> sintéticas; `datos/exogenas.py::cargar_exogenas_reales` define el esquema para usar las oficiales.

## Estructura

```
src/pronostico/
  config.py                 rutas, semillas y parámetros experimentales
  datos/                    generador sintético, exógenas y calendario, carga
  features/                 kernel C/OpenMP + envoltorio ctypes + versión Numba
  modelos/                  locales (ingenuo, media móvil, TSB, SARIMAX, Prophet) y LSTM global / híbrido
  paralelo/                 ETL MPI, motor de tareas MPI, híbrido MPI+OpenMP
  evaluacion/               métricas (WAPE, MASE, RMSE, sesgo) y pruebas estadísticas
  inventario/               simulación de política (R, S)
  benchmark/                protocolo de medición, Amdahl, Gustafson, Karp–Flatt
  visualizacion/            estilo de figuras, tablero HTML de alertas y exportador de la plataforma web
scripts/                    01…12: pipeline completo (ver run_all.sh)
tests/                      pruebas unitarias (pytest)
resultados/                 JSON/CSV de benchmarks, precisión, inventario, producción; tablero de alertas
plataforma/                 plataforma web DemandAI (src/ y dist/DemandAI.html autocontenido)
figuras/                    figuras del artículo (300 ppp)
docker/Dockerfile           imagen CUDA + OpenMPI + Python
config/nodos_ejemplo.txt    hostfile para el clúster de 4 nodos
```

## Instalación

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # requiere OpenMPI instalado (o: pip install openmpi)
gcc -O3 -march=native -fopenmp -shared -fPIC src/pronostico/features/kernel_omp.c \
    -o src/pronostico/features/libkernel_omp.so -lm   # (se compila solo si falta)
PYTHONPATH=src pytest -q                 # 11 pruebas
```

Con Docker y GPU: `docker build -f docker/Dockerfile -t pronostico . && docker run --gpus all pronostico`.

## Ejecución

```bash
bash scripts/run_all.sh                         # todo el pipeline en la máquina local
NP=8 HOSTFILE=config/nodos_ejemplo.txt P_MAX=32 bash scripts/run_all.sh   # en el clúster
```

Pasos individuales (todos con `PYTHONPATH=src`):

| Script | Qué hace | Objetivo |
|---|---|---|
| `01_generar_datos.py` | POS sintético crudo particionado | OE1 |
| `03_etl.sh [p]` | ETL MPI + anonimización → `datos/procesados/demanda_diaria.parquet` | OE3 |
| `04_eda.py` | Clasificación SBC, perfiles, STL, correlación cruzada, Fig. 2 | OE1 |
| `02_seleccion_modelos.py` | Selección en origen de validación (SARIMAX, épocas LSTM) | OE2 |
| `03b_modelos_locales.sh` | 8 modelos locales × 480 series × 3 orígenes sobre el motor MPI dinámico, con un punto de control por modelo | OE3/OE4 |
| `05_precision_global.py` | LSTM, LSTM+exógenas, híbrido Prophet-LSTM | OE3/OE4 |
| `05b_oraculo_exogenas.py` | Cota superior de H2: exógenas con rezago de 1 día (fuga deliberada, no desplegable) | H2 |
| `06_benchmark_openmp.py` | Escalabilidad fuerte/débil OpenMP vs Numba vs NumPy | H1 |
| `07_benchmark_mpi.py` | ETL, estrategias del motor, débil, híbrido, equivalencia | H1 |
| `08_benchmark_lstm.py` | LSTM CPU (hilos) / GPU, equivalencia TOST | H1 |
| `09_analisis_hipotesis.py` | Tablas de precisión y pruebas H1–H3 | OE4 |
| `10_inventario.py` | Simulación (R, S): nivel de servicio y costo | OE4 |
| `11_figuras.py` | Figuras 3–7 | — |
| `12_produccion_y_alertas.py` | Pronóstico de producción (`resultados/produccion/`) y `resultados/alertas_reabastecimiento.html` | Despliegue |
| `13_plataforma_web.py` | Plataforma web DemandAI: exporta los resultados y genera `plataforma/dist/DemandAI.html` (`--servir` para abrirla en localhost) | Despliegue |
| `14_clustering.py` | Agrupamiento de las 1 280 series (k-means y jerárquico de Ward, silueta, ARI) y mejor modelo por grupo → `resultados/clustering/`, Fig. 8 | Sistemas Inteligentes |

## Protocolo experimental

6 repeticiones por configuración, se descarta la primera (calentamiento), se reporta mediana y RIC.
T(1) = secuencial **optimizado** (mismo código con 1 proceso/hilo). Validación con origen móvil:
3 orígenes × 28 días sobre 480 series estratificadas; la selección de modelos usa un origen previo.
Pruebas: Mann–Whitney + IC bootstrap (H1a), TOST ±1 pt WAPE (H1b), Wilcoxon + Holm (H2),
Friedman–Nemenyi + Wilcoxon (H3).

## Licencia y datos personales

Los identificadores de cliente se reemplazan por HMAC-SHA256 con sal secreta (`SAL_ANONIMIZACION`) y se eliminan
nombre y teléfono (Ley 1581 de 2012). Los datos incluidos son sintéticos.

## Resultados de esta versión (entorno de 2 vCPU, sin GPU; datos sintéticos)

| Etapa | S(2) |
|---|---|
| TSB por rejilla, OpenMP en C | 2,07 |
| ETL MPI (3,3 M líneas) | 1,86 |
| Motor MPI con carga mixta: bloques / cíclico / dinámico | 1,35 / 1,83 / 1,89 |
| Híbrido 1 proceso × 2 hilos (con `--bind-to none`) | 1,98 |
| LSTM en CPU (2 hilos) | 1,69 |

Precisión (WAPE): LSTM 0,517 · SARIMAX 0,520 · Prophet 0,535 · TSB 0,542 · ingenuo 0,705.
Menor costo de inventario: TSB (−25,2 % frente al ingenuo). Detalle en `resultados/` y en la Sección VIII del artículo.
