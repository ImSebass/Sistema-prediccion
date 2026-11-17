"""Plataforma web DemandAI: exporta los resultados del pipeline y empaqueta la app.

1. Lee los artefactos reales del pipeline (scripts 01-12) y escribe
   `plataforma/datos/datos.js` (ningún valor se inventa: lo que falte se
   muestra como "sin datos").
2. Empaqueta `plataforma/src/` en `plataforma/dist/DemandAI.html`, un único
   archivo que funciona sin servidor ni conexión a Internet.

    python scripts/13_plataforma_web.py            # exportar y empaquetar
    python scripts/13_plataforma_web.py --servir   # además, abrir en http://localhost:8765
"""
import argparse
import functools
import http.server
import os
import sys
import webbrowser

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from pronostico.visualizacion.plataforma import PLATAFORMA, construir_html, escribir  # noqa: E402

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--servir", action="store_true", help="servir la plataforma en localhost y abrir el navegador")
ap.add_argument("--puerto", type=int, default=8765)
a = ap.parse_args()

datos = escribir(PLATAFORMA / "datos" / "datos.js")
html = construir_html()
print(f"datos:      {datos}  ({datos.stat().st_size / 1e6:.2f} MB)")
print(f"plataforma: {html}  ({html.stat().st_size / 1e6:.2f} MB)")

if a.servir:
    raiz = PLATAFORMA / "dist"
    manejador = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(raiz))
    url = f"http://localhost:{a.puerto}/DemandAI.html"
    print(f"Sirviendo {raiz} en {url}  (Ctrl+C para detener)")
    webbrowser.open(url)
    http.server.ThreadingHTTPServer(("127.0.0.1", a.puerto), manejador).serve_forever()
