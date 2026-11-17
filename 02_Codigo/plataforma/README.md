# DemandAI — plataforma web del sistema de predicción de demanda

Interfaz SaaS del proyecto (Modern SaaS Dashboard + Business Intelligence). Muestra los resultados
**reales** del pipeline paralelo; no calcula pronósticos ni inventa cifras.

```
python scripts/13_plataforma_web.py            # exportar datos y empaquetar
python scripts/13_plataforma_web.py --servir   # además, abrir http://localhost:8765/DemandAI.html
```

`dist/DemandAI.html` es un único archivo autocontenido (CSS, JavaScript, fuente Inter, iconos Lucide y
datos en línea): se abre con doble clic, sin servidor y sin conexión a Internet.

## Arquitectura

```
pipeline (scripts 01-12: MPI · OpenMP · CUDA)
   └─ resultados/  datos/procesados/            artefactos reales (Parquet, CSV, JSON)
        └─ src/pronostico/visualizacion/plataforma.py   exportador  → plataforma/datos/datos.js
             └─ plataforma/src/  (HTML + CSS + JS sin dependencias)  → plataforma/dist/DemandAI.html
```

No existe servidor web ni base de datos en esta versión: la "capa backend" es el pipeline, que escribe
archivos. El exportador es el único punto de integración; si un artefacto falta, la sección muestra
"sin datos" en lugar de un valor de relleno.

| Carpeta / archivo | Contenido |
|---|---|
| `src/index.html` | Estructura de la página (modo desarrollo: carga `../datos/datos.js`) |
| `src/css/app.css` | Sistema de diseño: paleta, tipografía, componentes, responsive, impresión |
| `src/js/util.js` | Formato es-CO, fechas, iconos, CSV, preferencias (localStorage) |
| `src/js/modelo.js` | Modelo de datos derivado del paquete exportado (sin cifras propias) |
| `src/js/graficas.js` | Gráficas SVG con tooltip: líneas, barras, dispersión |
| `src/js/componentes.js` | Tabla con orden y paginación, tarjetas KPI |
| `src/js/app.js` | Barra lateral, barra superior, rutas, búsqueda, notificaciones, detalle de producto |
| `src/js/vistas/*.js` | Un archivo por módulo |
| `src/js/iconos.js` | Iconos Lucide (ISC) |
| `src/fuentes/` | Inter (SIL OFL 1.1) |

## Módulos y origen de cada dato

| Módulo | Qué muestra | Fuente |
|---|---|---|
| Inicio | KPI, ventas + pronóstico 28 d, distribución por sector, alertas, actividad | `demanda_diaria.parquet`, `produccion/`, `pedidos_sugeridos.csv`, `simulacion_inventario.json`, `etl_resumen.json` |
| Inventario | Existencias, punto de reorden, cobertura, pedido sugerido y motivo | `pedidos_sugeridos.csv` (política R, S del script 12) |
| Predicción | Pronóstico de producción, backtest por modelo, tendencia, estacionalidad, métricas y costo | `produccion/`, `precision/*.pkl`, `tabla_precision*.csv`, `simulacion_inventario.json` |
| Productos | Catálogo, clase de demanda (SBC), concentración de ventas | `catalogo.parquet`, `clasificacion_sbc.csv` |
| Establecimientos | Comparación y detalle por tienda | agregados de `demanda_diaria.parquet` |
| Análisis y reportes | Ventas mensuales, sectores, patrón semanal, intermitencia, modelos (Friedman, H2-H3), simulación | `eda.json`, `hipotesis.json`, `simulacion_inventario.json` |
| Rendimiento | T(1), T(p), speedup, eficiencia, Karp–Flatt, escalabilidad fuerte y débil, arquitectura | `benchmark/openmp.json`, `mpi.json`, `lstm.json` |

### Reglas de honestidad de los datos

- Los resultados de CUDA solo aparecen como medidos si `lstm.json` contiene una ejecución en GPU; si no,
  se muestran como **pendientes**.
- Las cifras para 4, 8 y 16 unidades de procesamiento son **proyecciones teóricas** (Amdahl con la
  fracción serial de Karp–Flatt) y se dibujan con línea discontinua.
- El "nivel de servicio" es el fill rate del modelo en producción en la simulación de validación.
- El stock actual es simulado por el script 12 hasta conectar el POS/ERP; la interfaz lo indica.
- La comparación de modelos separa el rendimiento predictivo (WAPE, MASE, RMSE, sesgo) del impacto
  económico (fill rate, costo de mantener y de venta perdida).

## Prioridades de reabastecimiento

| Prioridad | Regla |
|---|---|
| Crítica | cobertura < tiempo de entrega L (igual que el tablero del script 12) |
| Alta | inventario < punto de reorden |
| Media | cobertura < R + L (pedirá en el próximo ciclo) |
| Baja | resto |

## Licencias de terceros

Iconos [Lucide](https://lucide.dev) (ISC) y fuente [Inter](https://rsms.me/inter/) (SIL Open Font License 1.1),
incluidos en `src/js/iconos.js` y `src/fuentes/`.
