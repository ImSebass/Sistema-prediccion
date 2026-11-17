"""Exportador de datos de la plataforma web DemandAI.

La plataforma (carpeta `plataforma/`) es una aplicación de una sola página que
NO calcula pronósticos ni inventa cifras: todo lo que muestra sale de este
paquete, que se arma exclusivamente con los artefactos que produce el pipeline:

    datos/procesados/demanda_diaria.parquet     ventas diarias por SKU (ETL MPI)
    datos/exogenas/catalogo.parquet             catálogo SKU-tienda-sector-precio
    resultados/produccion/*                     pronóstico de producción 28 d (script 12)
    resultados/inventario/pedidos_sugeridos.csv alertas y pedidos (política R, S)
    resultados/inventario/simulacion_*.json     impacto económico por modelo (script 10)
    resultados/precision/*                      precisión y pruebas H1-H3 (scripts 05, 09)
    resultados/eda/*                            patrones de consumo (script 04)
    resultados/benchmark/*.json                 OpenMP, MPI, LSTM CPU/GPU (scripts 06-08)

Si un artefacto falta, la sección correspondiente queda en `None` y la interfaz
muestra "sin datos" en lugar de un valor de relleno.
"""
from __future__ import annotations

import json
import math
import pickle
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from pronostico.config import CFG_DATOS, CFG_EXP, EXOGENAS, PROCESADOS, RESULTADOS
from pronostico.inventario.simulacion import LT, MARGEN, R, TASA_MANTENER_DIA, Z

DIAS_HISTORIA_SKU = 182          # historia por SKU enviada a la interfaz (detalle y gráficas)

NOMBRES_MODELO = {
    "ingenuo_s7": "Ingenuo estacional", "media_movil28": "Media móvil 28", "tsb": "TSB",
    "sarimax": "SARIMAX", "sarimax_exog": "SARIMAX + exóg.", "prophet": "Prophet",
    "prophet_exog": "Prophet + exóg.", "lstm": "LSTM", "lstm_exog": "LSTM + exóg.",
    "hibrido": "Híbrido Prophet-LSTM",
}


# ---------------------------------------------------------------- utilidades
def _limpio(x):
    """Convierte a tipos JSON y reemplaza NaN/inf por None (JSON estricto)."""
    if isinstance(x, dict):
        return {str(k): _limpio(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_limpio(v) for v in x]
    if isinstance(x, np.ndarray):
        return _limpio(x.tolist())
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        x = float(x)
        return None if (math.isnan(x) or math.isinf(x)) else x
    if isinstance(x, np.bool_):
        return bool(x)
    return x


def _json(ruta: Path):
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else None


def _r(a, d=2):
    return np.round(np.asarray(a, float), d)


def _mtime(ruta: Path):
    return (datetime.fromtimestamp(ruta.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")
            if ruta.exists() else None)


# ---------------------------------------------------------------- secciones
def _inventario(cat: pd.DataFrame, pron: pd.DataFrame | None, sigma: pd.DataFrame | None) -> dict | None:
    ruta = RESULTADOS / "inventario" / "pedidos_sugeridos.csv"
    if not ruta.exists():
        return None
    p = pd.read_csv(ruta)
    idx = cat.reset_index().set_index("sku").loc[p["sku"], "index"].to_numpy()
    # nivel objetivo S de la política (R, S): mismo cálculo que dashboard.alertas
    nivel = np.full(len(p), np.nan)
    if pron is not None and sigma is not None:
        f = pron.loc[p["sku"]].to_numpy()
        s = sigma.set_index("sku").loc[p["sku"], "sigma"].to_numpy()
        nivel = f[:, :R + LT].sum(1) + Z * s * np.sqrt(R + LT)
    inv = p["inventario"].to_numpy(float)
    cob = p["cobertura_dias"].to_numpy(float)
    alerta = p["alerta"].astype(bool).to_numpy()
    # Prioridad en 4 niveles (las dos primeras coinciden con el tablero del script 12):
    #   critica: cobertura < tiempo de entrega L      alta: inventario < punto de reorden
    #   media:   cobertura < R + L (pedirá en el próximo ciclo)      baja: resto
    prev = p["prioridad"].astype(str).to_numpy()   # CRÍTICA / ALTA del script 12 (fuente de verdad)
    prioridad = np.where(prev == "CRÍTICA", "critica", np.where(prev == "ALTA", "alta",
                         np.where(cob < R + LT, "media", "baja")))
    return {
        "i": idx.tolist(), "inventario": _r(inv, 0).tolist(),
        "demanda_7d": _r(p["demanda_7d"], 1).tolist(), "punto_reorden": _r(p["punto_reorden"], 1).tolist(),
        "nivel_objetivo": _r(nivel, 1).tolist(), "cobertura": _r(cob, 1).tolist(),
        "alerta": alerta.tolist(), "pedido": _r(p["pedido_sugerido"], 0).tolist(),
        "prioridad": prioridad.tolist(), "agotado": (inv <= 0).tolist(),
    }


def _backtest(D) -> dict | None:
    P = RESULTADOS / "precision"
    if not (P / "locales.pkl").exists():
        return None
    with open(P / "locales.pkl", "rb") as fh:
        regs = [r for r in pickle.load(fh) if r["modelo"] in NOMBRES_MODELO]
    if (P / "globales.pkl").exists():
        with open(P / "globales.pkl", "rb") as fh:
            regs += pickle.load(fh)["registros"]
    t0 = int(D.origenes[-1])                       # último origen de validación
    modelos = [m for m in NOMBRES_MODELO if any(r["modelo"] == m for r in regs)]
    pos = {int(s): k for k, s in enumerate(D.muestra)}
    F = {m: np.full((len(D.muestra), CFG_EXP.horizonte), np.nan) for m in modelos}
    for r in regs:
        if int(r["origen"]) == t0 and int(r["serie"]) in pos:
            F[r["modelo"]][pos[int(r["serie"])]] = r["pron"]
    return {"origen": D.fechas[t0].date().isoformat(), "origen_idx": t0,
            "series": [int(s) for s in D.muestra], "modelos": modelos,
            "pron": {m: _r(F[m], 2).tolist() for m in modelos}}


def _benchmark() -> dict:
    B = RESULTADOS / "benchmark"
    omp, mpi, lstm = _json(B / "openmp.json"), _json(B / "mpi.json"), _json(B / "lstm.json")
    hip = _json(RESULTADOS / "precision" / "hipotesis.json") or {}

    def quitar(lista, claves=("tiempos",)):
        return [{k: v for k, v in e.items() if k not in claves} for e in (lista or [])]
    out = {"openmp": None, "mpi": None, "lstm": None, "h1": hip.get("H1")}
    if omp:
        out["openmp"] = {"hilos_disponibles": omp.get("hilos_disponibles"), "series": omp.get("series"),
                         "repeticiones": omp.get("repeticiones_validas"),
                         "numpy_ref_s": omp.get("numpy_ref_seg_estimado"),
                         "fuerte": quitar(omp.get("fuerte")), "debil": quitar(omp.get("debil")),
                         "moviles": quitar(omp.get("caracteristicas_moviles"))}
    if mpi:
        out["mpi"] = {"procesos": mpi.get("procesos"), "repeticiones": mpi.get("repeticiones_validas"),
                      "etl": quitar(mpi.get("etl")), "motor_fuerte": quitar(mpi.get("motor_fuerte")),
                      "motor_debil": quitar(mpi.get("motor_debil")),
                      "hibrido": quitar(mpi.get("hibrido_mpi_omp")),
                      "equivalencia_max_dif": mpi.get("equivalencia_max_dif_abs"),
                      "carga_motor": mpi.get("motor_carga")}
    if lstm:
        out["lstm"] = {"cuda": bool(lstm.get("cuda")), "torch": lstm.get("torch"),
                       "cpu": quitar(lstm.get("cpu")), "gpu": quitar(lstm.get("gpu")) if lstm.get("gpu") else None,
                       "equivalencia": lstm.get("equivalencia")}
    out["fechas"] = {k: _mtime(B / f"{k}.json") for k in ("openmp", "mpi", "lstm")}
    return out


def _precision() -> dict | None:
    P = RESULTADOS / "precision"
    if not (P / "tabla_precision.csv").exists():
        return None
    t = pd.read_csv(P / "tabla_precision.csv")
    ts = pd.read_csv(P / "tabla_precision_sector.csv").rename(columns={"Unnamed: 0": "sector"}) \
        if (P / "tabla_precision_sector.csv").exists() else None
    hip = _json(P / "hipotesis.json") or {}
    return {"tabla": t.to_dict(orient="records"),
            "por_sector": ts.to_dict(orient="records") if ts is not None else None,
            "hipotesis": {k: hip.get(k) for k in ("n_series", "n_origenes", "H2", "H2_oraculo", "H3", "friedman_todos")},
            "seleccion": _json(P / "seleccion_oe2.json")}


# ---------------------------------------------------------------- paquete
def construir_paquete() -> dict:
    from pronostico.datos.carga import cargar
    D = cargar()
    Y = D.Y
    cat = D.catalogo.reset_index(drop=True)
    n = Y.shape[1]
    fechas = D.fechas
    tiendas = [{"id": t, "sector": s, "productos": int(k)} for t, s, k in CFG_DATOS.tiendas]
    tienda_idx = {t["id"]: i for i, t in enumerate(tiendas)}
    precio = cat["precio"].to_numpy(float)

    # agregados diarios por tienda (unidades e ingresos) en toda la historia
    agreg_u, agreg_v = [], []
    for t in tiendas:
        m = (cat["tienda"] == t["id"]).to_numpy()
        agreg_u.append(Y[m].sum(0).round().astype(int).tolist())
        agreg_v.append((Y[m] * precio[m, None]).sum(0).round().astype(int).tolist())

    sbc = pd.read_csv(RESULTADOS / "eda" / "clasificacion_sbc.csv") if (RESULTADOS / "eda" / "clasificacion_sbc.csv").exists() else None
    clase = sbc.set_index("sku").reindex(cat["sku"]) if sbc is not None else None

    prod_dir = RESULTADOS / "produccion"
    pron = pd.read_parquet(prod_dir / "pronostico_28d.parquet") if (prod_dir / "pronostico_28d.parquet").exists() else None
    sigma = pd.read_parquet(prod_dir / "sigma.parquet") if (prod_dir / "sigma.parquet").exists() else None
    meta_prod = _json(prod_dir / "meta.json")

    pron_sec = None
    if pron is not None:
        idx = cat.reset_index().set_index("sku").loc[pron.index, "index"].to_numpy()
        pron_sec = {"i": idx.tolist(), "fechas": list(pron.columns), "valores": _r(pron.to_numpy(), 2).tolist()}

    h0 = n - DIAS_HISTORIA_SKU
    paquete = {
        "meta": {
            "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "datos_sinteticos": True,
            "nota_datos": ("Datos SINTÉTICOS calibrados al comercio fronterizo de Cúcuta "
                           "(generador del proyecto). Sustituir por exportaciones POS reales."),
            "inicio": fechas[0].date().isoformat(), "fin": fechas[-1].date().isoformat(), "dias": int(n),
            "historia_sku_desde": int(h0),
            "politica": {"R": R, "L": LT, "z": Z, "nivel_servicio": 0.95,
                         "tasa_mantener_anual": round(TASA_MANTENER_DIA * 365, 4), "margen": MARGEN},
            "produccion": meta_prod,
            "etl": _json(RESULTADOS / "eda" / "etl_resumen.json"),
            "etl_fecha": _mtime(PROCESADOS / "demanda_diaria.parquet"),
            "semilla": CFG_EXP.semilla, "horizonte": CFG_EXP.horizonte,
            "nombres_modelo": NOMBRES_MODELO,
        },
        "tiendas": tiendas,
        "productos": {
            "sku": cat["sku"].tolist(), "tienda": [tienda_idx[t] for t in cat["tienda"]],
            "sector": cat["sector"].tolist(), "precio": _r(precio, 0).tolist(),
            "nombre": cat["nombre"].tolist() if "nombre" in cat else None,
            "clase": clase["clase"].fillna("").tolist() if clase is not None else None,
            "adi": _r(clase["adi"], 2).tolist() if clase is not None else None,
            "cv2": _r(clase["cv2"], 2).tolist() if clase is not None else None,
            "ventas_total": Y.sum(1).round().astype(int).tolist(),
            "historia": Y[:, h0:].round().astype(int).tolist(),
        },
        "agregados": {"unidades": agreg_u, "ingresos": agreg_v},
        "pronostico": pron_sec,
        "inventario": _inventario(cat, pron, sigma),
        "backtest": _backtest(D),
        "precision": _precision(),
        "simulacion": _json(RESULTADOS / "inventario" / "simulacion_inventario.json"),
        "eda": _json(RESULTADOS / "eda" / "eda.json"),
        "benchmark": _benchmark(),
    }
    return _limpio(paquete)


def escribir(destino: Path) -> Path:
    """Escribe `datos.js` (asignación a window.DEMANDAI) para abrir la app sin servidor."""
    paquete = construir_paquete()
    destino.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(paquete, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    destino.write_text("window.DEMANDAI=" + txt + ";\n", encoding="utf-8")
    return destino


# ---------------------------------------------------------------- empaquetado
PLATAFORMA = RESULTADOS.parent / "plataforma"


def construir_html(fuente: Path = PLATAFORMA / "src", datos: Path = PLATAFORMA / "datos" / "datos.js",
                   destino: Path = PLATAFORMA / "dist" / "DemandAI.html") -> Path:
    """Empaqueta la aplicación en UN archivo HTML autocontenido (CSS, JS, fuente,
    iconos y datos en línea): se abre con doble clic, sin servidor ni Internet."""
    import base64
    import re

    html = (fuente / "index.html").read_text(encoding="utf-8")

    def css(m):
        txt = (fuente / m.group(1)).read_text(encoding="utf-8")
        def fuente_b64(f):
            ruta = (fuente / "css" / f.group(1)).resolve()
            return "url(data:font/woff2;base64," + base64.b64encode(ruta.read_bytes()).decode() + ")"
        txt = re.sub(r'url\("(\.\./fuentes/[^"]+\.woff2)"\)', fuente_b64, txt)
        return "<style>\n" + txt + "\n</style>"

    def js(m):
        ruta = (fuente / m.group(1)).resolve()
        if ruta == datos.resolve() or m.group(1).endswith("datos/datos.js"):
            ruta = datos
        txt = ruta.read_text(encoding="utf-8").replace("</script", "<\\/script")
        return "<script>\n" + txt + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(html, encoding="utf-8")
    return destino
