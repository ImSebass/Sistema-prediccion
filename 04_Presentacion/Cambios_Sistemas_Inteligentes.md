# Cambios para la exposición en Sistemas Inteligentes

El proyecto se presenta en dos asignaturas: Fundamentos de Computación Paralela y Distribuida (los tres autores)
y Sistemas Inteligentes (solo el expositor). Esta versión agrega los temas de Sistemas Inteligentes sin quitar
nada del contenido de paralelismo.

- Presentación nueva: `Presentacion_Proyecto_Final_V2.pptx` (20 diapositivas; la original queda intacta).
- Artículo nuevo: `01_Documento/Proyecto_FinalV3_Acuna_Cardenas_Carrillo.docx` y su `.pdf` (V2 queda intacta).
- Todas las diapositivas nuevas tienen notas del orador con el guion.

## Temas del programa y dónde quedan

| Tema de Sistemas Inteligentes | Diapositiva | Artículo V3 |
|---|---|---|
| Definición del problema, aplicaciones y métricas | 15 | VIII-D.1 y Tabla XII (PEAS) |
| Clustering básico: k-means y jerárquico | 16 | VIII-D.2, Tabla XIII y Fig. 8 |
| Aprendizaje profundo y comparación con métodos clásicos | 17 | VIII-D.3 y Tabla XIV |
| Percepción artificial y visión artificial | 18 | VIII-D.4 |

## Cambios en la presentación

| # | Diapositiva | Cambio |
|---|---|---|
| 1 | Portada | Se agregó «Sistemas Inteligentes» en la línea de asignaturas |
| 15 | **Nueva.** El sistema como agente inteligente (PEAS) | Sensores → aprendizaje → actuadores; tres problemas (regresión, agrupamiento, decisión), cada uno con sus métricas |
| 16 | **Nueva.** Clustering: k-means y Ward encuentran dos perfiles | Fig. 8 y cifras: 2 grupos, silueta 0,21, ARI 0,92 entre métodos, ARI 0,73 con el sector frente a 0,37 con Syntetos–Boylan; el mejor modelo cambia por grupo |
| 17 | **Nueva.** Aprendizaje profundo frente a métodos clásicos | Definiciones básicas y comparación con los resultados: LSTM WAPE 0,517 frente a SARIMAX 0,520; TSB tiene el menor costo (14,7 M COP) |
| 18 | **Nueva.** Percepción y visión artificial: próximos sensores | Hoy la percepción es transaccional (POS + exógenas, el ETL); la visión se presenta como **propuesta no implementada** (conteo de existencias, quiebres en góndola, conteo de personas en la frontera) |
| 19 | Conclusiones y recomendaciones | +1 conclusión (clustering: 2 perfiles con distinto mejor modelo) y +1 recomendación (visión artificial); «elegir el modelo por sector» pasa a «por perfil de demanda» |

Las diapositivas 2 a 14 y la de cierre no cambiaron. Las cuatro nuevas van después de «Inventario» y antes
de las conclusiones, así que en Fundamentos se pueden ocultar (clic derecho → Ocultar diapositiva) sin romper
el hilo.

## Cambios en el artículo (V2 → V3)

- **Resumen / Abstract y palabras clave:** una frase sobre el agrupamiento; se agregan «agrupamiento»,
  «aprendizaje profundo» y «sistemas inteligentes» (y sus equivalentes en inglés).
- **I. Introducción:** la organización del documento menciona la nueva Sección VIII-D.
- **III-B. Justificación disciplinar:** una frase que vincula los contenidos de Sistemas Inteligentes.
- **V-D. Marco conceptual:** pasa de cinco a seis ejes, con cuatro definiciones nuevas: sistema inteligente
  (PEAS), percepción artificial, agrupamiento (k-means, Ward, silueta, ARI) y aprendizaje profundo.
- **VII:** el pipeline va de 01 a 14.
- **VIII-D (nueva): Análisis desde la perspectiva de los sistemas inteligentes**, con cuatro apartados, las
  Tablas XII a XIV y la Fig. 8. La antigua VIII-D (Discusión) pasa a VIII-E.
- **IX:** +1 conclusión y +1 recomendación.
- **Referencias [35]–[42]:** Russell y Norvig; MacQueen (k-means); Ward; Rousseeuw (silueta); Hubert y
  Arabie (ARI); LeCun, Bengio y Hinton; Goodfellow et al.; Szeliski (visión).
- La tabla de contenido se actualizó. No cambió la numeración de las tablas I–XI ni de las figuras 1–7.

## De dónde salen las cifras nuevas

El agrupamiento es un análisis real sobre los datos del proyecto, no un ejemplo:
`02_Codigo/scripts/14_clustering.py` (ejecutarlo con `PYTHONPATH=src`). Escribe
`resultados/clustering/clustering.json`, `asignacion.csv` y `figuras/fig8_clustering.png`. Los rasgos usan
solo días anteriores al día 800, así que no hay fuga hacia las ventanas de prueba. El WAPE por grupo sale
de los mismos pronósticos de la Tabla IX.

## Preguntas probables y respuesta corta

- **¿Por qué k = 2 si la silueta es baja (0,21)?** Es el máximo en ambos métodos y los dos coinciden
  (ARI 0,92). La silueta moderada indica grupos reales con frontera difusa, y lo decimos así.
- **¿No es lo mismo que el sector?** Casi (ARI 0,73), pero no del todo: 16 series quedan en el grupo de su
  comportamiento y no en el de su sector, y el agrupamiento separa mejor que la regla fija de Syntetos–Boylan
  (ARI 0,37).
- **¿El sistema usa visión artificial?** No. Es una propuesta de ampliación y así se presenta en la diapositiva
  18 y en VIII-D.4.
- **Si el LSTM es el más preciso, ¿por qué no es el mejor?** Subpronostica un 21 % (pérdida de Huber →
  mediana), y en inventario una venta perdida cuesta 30 % del precio frente a 0,07 % por día de inventario.
