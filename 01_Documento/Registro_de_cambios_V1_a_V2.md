# Registro de cambios: Proyecto Final V1 → V2

Documento: *Sistema de Predicción de Demanda para el Comercio Minorista Fronterizo mediante Machine Learning y Cómputo Paralelo*.
La V2 conserva la estructura, la plantilla y el formato IEEE de la V1 (portada, tabla de contenido, dos columnas,
encabezados y pie de página). Estos son los cambios y su justificación.

## 1. Correcciones de fondo (paralelismo, foco de la asignatura)

| # | Problema en V1 | Corrección en V2 | Sección |
|---|---|---|---|
| 1 | OpenMP prometido, pero implementado con Numba `prange` y `multiprocessing` (que no es OpenMP) | Núcleo en C con `#pragma omp parallel for schedule(dynamic)` llamado vía ctypes, y Numba con `NUMBA_THREADING_LAYER='omp'`; OE3 incluye OpenMP | IV-B, VI-F, VI-G, VII-C |
| 2 | Justificación por "volumen masivo" de datos (no se sostiene para pocas MIPYMES) | Cuello de botella combinatorio: series × modelos × orígenes × hiperparámetros, con cálculo de orden de magnitud y problema de balanceo de carga | I, II-C, III-C |
| 3 | No había mapa de qué se paraleliza con qué | Tabla IV: mapa de paralelización por etapa | VI-G |
| 4 | Solo ley de Amdahl, aunque se medía escalabilidad débil | Leyes de Amdahl y Gustafson y métrica de Karp–Flatt (ecuaciones 1–3) | V-D |
| 5 | Speedup de GPU indefinido (una sola GPU) | S_GPU = T_CPU(p máx.) / T_GPU con igual número de pasos | VI-G |
| 6 | Estrategia "híbrida" sin implementación | MPI (Scatterv/Gatherv) + OpenMP, 1 rango por nodo × T hilos | VI-G, VII-C |
| 7 | Sobresuscripción de núcleos no considerada | `OMP_NUM_THREADS=1` por proceso MPI salvo en la estrategia híbrida | VI-G |

## 2. Rigor de la investigación

| # | Problema en V1 | Corrección en V2 |
|---|---|---|
| 8 | La pregunta afirmaba que paralelizar "influye en la precisión" | Pregunta reformulada: reducción de tiempo sin degradar precisión, y precisión alcanzable con modelos más ricos |
| 9 | H1 sin prueba definida; "sin degradar precisión" era trivial o indefinido | H1a (Mann–Whitney + IC bootstrap) y H1b (equivalencia TOST, ±1 pt de WAPE) |
| 10 | H2 y H3 sin pruebas | Wilcoxon pareado + Holm (H2); Friedman–Nemenyi + Wilcoxon (H3); Tabla V |
| 11 | "Error de pronóstico" sin métrica definida (riesgo de usar MAPE con ceros) | WAPE, MASE (escala ingenuo estacional s = 7), RMSE y sesgo; ecuaciones 4–5 |
| 12 | Variables exógenas con riesgo de fuga de información | Macro con rezago ≥ horizonte (28 días); calendario conocido de antemano |
| 13 | Diseño llamado "cuasi-experimental" | Experimental: todas las condiciones computacionales son controladas |
| 14 | Factorial completo con celdas sin sentido (CUDA × ARIMA) | Factorial con celdas válidas según el mapa de paralelización |
| 15 | OE4 sin métrica de inventario | Simulación de política (R, S): nivel de servicio, días de quiebre y costo |
| 16 | Demanda intermitente no considerada | Clasificación Syntetos–Boylan, línea base TSB, LSTM global |
| 17 | Sin plan si no hay datos reales; "no se entrena en un ambiente simulado" | Datos sintéticos calibrados, declarados explícitamente; esquema para sustituir por datos reales |
| 18 | Muestra exige POS de 24 meses, en contradicción con la informalidad descrita | Se explicita el sesgo de selección y la no generalización |
| 19 | Objetivo general "Norte de Santander" vs. población "Cúcuta AM" | Unificado: Cúcuta y su área metropolitana |
| 20 | Selección de modelos podía usar los datos de prueba | Origen de validación previo a los de prueba |

## 3. Redacción y alcance

- Se eliminaron afirmaciones absolutas ("suprimir", "erradicar", "validación definitiva", "la única forma").
- "Tiempo real" → actualización periódica (diaria o semanal), coherente con el reabastecimiento.
- "Democratizar el HPC" → modelo de servicio centralizado (las MIPYMES no tienen clúster propio).
- Resumen/Abstract coherentes (peso-bolívar-dólar en ambos), con resultados y declaración de datos sintéticos.
- Se eliminó el párrafo duplicado entre la Introducción y la Situación problema.
- ODS 12 precisado por sector (perecederos en abarrotes; obsolescencia en ropa y calzado).
- Fecha actualizada a noviembre de 2026.

## 4. Referencias

| Ref. V1 | Problema | Acción |
|---|---|---|
| [1], [2] | Sin revista ni DOI, no verificables | Eliminadas; reemplazadas por CEPAL (Dini y Stumpo) y Fildes et al. |
| [3], [4] | Literatura gris (enciclopedia, blog comercial) | Eliminadas |
| [5] | Revista incorrecta (no es *Applied Sciences*) | Corregida: *Processes*, vol. 9, n.º 7, art. 1157, 2021 (Wang, Chien y Trappey) |
| [6] | Año y autor incorrectos | Corregida: X. Zheng, *Informatica*, vol. 50, n.º 5, pp. 37–52, 2026 |
| [7] | Contenido mal representado (no trata de HPC) | Reemplazada por la competencia M5 (Makridakis et al., IJF 2022) |
| [8] | No verificable | Reemplazada por Sarmiento Suárez et al. (2024) y Posada Haddad (2025, Cúcuta) |
| [9] | Irrelevante (MILP de biorrefinerías) | Eliminada |
| [12] | TensorFlow, con un stack en PyTorch | Reemplazada por PyTorch (Paszke et al.), mpi4py y Numba |
| [15] | No es la fuente primaria de CRISP-DM | Reemplazada por Chapman et al. (2000) |
| [21] | Ley 1480: relación forzada | Eliminada |
| [22] | Ley 527: artículo incorrecto | Artículo 10 (admisibilidad y fuerza probatoria) |
| [23] | PL 043/2025 presentado como "en trámite" | Actualizado: reportado como archivado por tránsito de legislatura |
| — | Faltaban | Amdahl, Gustafson, Karp–Flatt, Hyndman–Koehler, Syntetos et al., Teunter et al., Taylor–Letham, Hochreiter–Schmidhuber, Montero-Manso–Hyndman, Lakens (TOST), Demšar, Silver et al. |

## 5. Secciones nuevas

- **VII. Desarrollo de los objetivos específicos** (OE1–OE4), con la implementación real.
- **VIII. Resultados**: rendimiento paralelo (H1), precisión (H2, H3), inventario y amenazas a la validez.
- **IX. Conclusiones y recomendaciones.**

## 6. Pendientes para el equipo (no se pueden resolver desde el entorno de desarrollo)

1. Repetir `scripts/06–08` en el clúster de 4 nodos (`HOSTFILE=config/nodos_ejemplo.txt`) y en la estación con
   GPU para completar las curvas con p = 4…32 y el speedup CUDA real. Los guiones ya generan las tablas y figuras.
2. Sustituir los datos sintéticos por exportaciones POS reales y las series macro por las oficiales
   (`cargar_exogenas_reales`), firmar los acuerdos de confidencialidad y repetir el pipeline.
3. Revisar en Word la tabla de contenido (clic derecho → *Actualizar campos*) si se edita el documento.

## 7. Actualización del 17 de noviembre de 2026: plataforma web DemandAI

El tablero HTML de alertas se reemplazó por la plataforma web DemandAI como módulo de visualización. El artículo se
ajustó en consecuencia, sin cambiar ningún resultado ni la estructura:

| Sección | Cambio |
| --- | --- |
| III-B Situación deseada | El servicio centralizado devuelve una plataforma web con pronósticos y alertas, no un tablero |
| VI Metodología (fase de despliegue) y Tabla VI (OE3) | El entregable pasa a ser «Motor distribuido y plataforma web DemandAI» |
| VII (introducción) | Pipeline numerado de 01 a 13 y carpeta `plataforma` |
| VII-C Despliegue y visualización | Descripción de DemandAI (exportador, archivo autocontenido, siete módulos, separación entre medido y proyectado) y 11 pruebas unitarias |
| Fig. 3 | La capa de presentación se rotula «Plataforma web DemandAI · alertas y pedidos» |
| IX Conclusión 1 y recomendación de operación | Entrega por DemandAI; conectar la plataforma a PostgreSQL con cuentas por establecimiento |
