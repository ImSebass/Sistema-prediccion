"""OE1 – Genera el conjunto POS SINTÉTICO (30 meses, 1.280 series, ~3,3 M líneas).

    python scripts/01_generar_datos.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from pronostico.datos.generador_sintetico import escribir_pos_crudo  # noqa: E402

if __name__ == "__main__":
    escribir_pos_crudo()
