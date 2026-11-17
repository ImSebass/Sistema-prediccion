# Sistema de Predicción de Demanda para el Comercio Minorista Fronterizo mediante Machine Learning y Cómputo Paralelo

Proyecto final de **167411 – Fundamentos de Computación Paralela y Distribuida**, Universidad de Pamplona.

**Autores:** Asly Valentina Acuña Palencia · Juan Sebastián Cárdenas Acevedo · Julio Sebastián Carrillo Reyes

Motor de pronóstico de demanda por producto y establecimiento para MIPYMES de Cúcuta y su área metropolitana.
Combina modelos estadísticos y de aprendizaje profundo (SARIMAX, Prophet, TSB, LSTM global e híbrido
Prophet-LSTM) con los tres paradigmas de la asignatura: **OpenMP** (kernel en C con `#pragma omp` y Numba-omp),
**MPI** (mpi4py/OpenMPI: ETL distribuido y motor de tareas con planificación estática y dinámica) y **CUDA**
(PyTorch), más una configuración híbrida MPI + OpenMP.

## Contenido del repositorio

| Carpeta | Contenido |
|---|---|
| [`01_Documento/`](01_Documento) | Artículo IEEE: versión original (V1), versión corregida y completa (V2, .docx y .pdf) y registro de cambios V1 → V2 |
| [`02_Codigo/`](02_Codigo) | Código fuente, scripts del pipeline (01–13), pruebas, Dockerfile, datos procesados, resultados, figuras y la plataforma web **DemandAI** ([`02_Codigo/plataforma/`](02_Codigo/plataforma)). Ver su [README](02_Codigo/README.md) |
| [`03_Documentacion/`](03_Documentacion) | Carta de presentación del software, manual de usuario, manual de instalación, carta de perfil de los autores y carta de declaración de uso de IA |
| [`04_Presentacion/`](04_Presentacion) | Presentación para la sustentación (16 diapositivas, con notas del orador) |

## Inicio rápido

```bash
cd 02_Codigo
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt            # requiere OpenMPI
PYTHONPATH=src pytest -q                   # 11 pruebas
bash scripts/run_all.sh                    # pipeline completo en la máquina local
```

**Plataforma web:** abra `02_Codigo/plataforma/dist/DemandAI.html` en el navegador (funciona sin conexión),
o ejecute `python scripts/13_plataforma_web.py --servir` desde `02_Codigo/`.

El manual de instalación (`03_Documentacion/03_Manual_de_instalacion.docx`) cubre la instalación en Linux,
Windows (WSL2), Docker con GPU y el clúster de 4 nodos.

## Notas

- **Datos sintéticos.** El proyecto no cuenta todavía con exportaciones POS reales; los datos se generan con
  `02_Codigo/src/pronostico/datos/generador_sintetico.py`, calibrado al contexto fronterizo. El POS crudo
  (≈71 MB) no se versiona porque se regenera de forma determinista con `scripts/01_generar_datos.py`.
- **Medición de rendimiento.** Los resultados incluidos se obtuvieron en una sola máquina multinúcleo;
  las mediciones en el clúster de 4 nodos y en GPU se reproducen con `scripts/run_all.sh` usando
  `HOSTFILE` y `NP` (ver el manual de instalación).
