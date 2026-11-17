"""Generador de datos POS SINTÉTICOS calibrado al comercio fronterizo de Cúcuta.

Se usa porque, a la fecha de esta versión, no se dispone de exportaciones POS
reales de los comercios aliados. Todo resultado obtenido con estos datos debe
declararse como obtenido sobre datos sintéticos.

Mecanismos incluidos (cada uno con un parámetro por serie):
  * nivel base heterogéneo por sector (abarrotes de alta rotación; ropa y
    calzado con demanda intermitente);
  * estacionalidad semanal y anual por sector (múltiple);
  * quincenas, primas, festivos, temporada escolar y navidad;
  * efecto del tráfico fronterizo (rezago 1 día) y de los choques cambiarios
    (variación de la TRM y de la tasa COP/VES con rezago de 7 a 14 días);
  * ruido multiplicativo heterocedástico y conteos Binomial Negativa;
  * ciclo de vida: parte del surtido de ropa/calzado entra a mitad de muestra.

Salida:
  datos/crudos/tienda=Txx/mes=YYYY-MM.parquet  (líneas de ticket POS con PII
  ficticia y errores típicos: duplicados, devoluciones, SKU inválidos, precios
  faltantes) + datos/exogenas/*.parquet + catálogo de productos.
"""
from __future__ import annotations

import argparse
import time

import numpy as np
import pandas as pd

from pronostico.config import CFG_DATOS, CRUDOS, EXOGENAS, ConfigDatos
from pronostico.datos.exogenas import calendario, generar_exogenas

SEMANAL = {  # lunes..domingo
    "abarrotes": np.array([0.90, 0.85, 0.88, 0.95, 1.10, 1.30, 1.02]),
    "ropa": np.array([0.75, 0.70, 0.75, 0.85, 1.10, 1.55, 1.30]),
    "calzado": np.array([0.78, 0.72, 0.78, 0.88, 1.08, 1.50, 1.26]),
}
PRECIO = {"abarrotes": (2500, 18000), "ropa": (25000, 120000), "calzado": (45000, 220000)}
NOMBRES = ["Ana", "Luis", "María", "José", "Carmen", "Jesús", "Rosa", "Carlos", "Yuli", "Andrés"]
APELLIDOS = ["Pérez", "Rodríguez", "Gómez", "Contreras", "Rincón", "Jaimes", "Ortega", "Suárez"]


def _anual(sector: str, doy: np.ndarray, amp: float) -> np.ndarray:
    ang = 2 * np.pi * doy / 365.25
    base = 1 + amp * 0.35 * np.sin(ang - 1.2)
    if sector in ("ropa", "calzado"):
        # pico de diciembre y de temporada escolar
        dic = np.exp(-((doy - 350) / 12.0) ** 2) * 1.2
        esc = np.exp(-((doy - 25) / 10.0) ** 2) * (0.9 if sector == "calzado" else 0.4)
        base = base + amp * (dic + esc)
    return base


def generar_demanda(cfg: ConfigDatos = CFG_DATOS):
    """Devuelve (catálogo, demanda_diaria[n_series, n_dias], fechas, exógenas, calendario)."""
    rng = np.random.default_rng(cfg.semilla)
    fechas = pd.date_range(cfg.fecha_inicio, cfg.fecha_fin, freq="D")
    n = len(fechas)
    exo = generar_exogenas(fechas, rng)
    cal = calendario(fechas)
    dow = fechas.dayofweek.to_numpy()
    doy = fechas.dayofyear.to_numpy()

    trafico_rel = np.log(exo["trafico_fronterizo"] / exo["trafico_fronterizo"].rolling(56, min_periods=7).mean()).bfill().to_numpy()
    trafico_l1 = np.r_[trafico_rel[:1], trafico_rel[:-1]]
    trm_var = np.log(exo["trm"]).diff(28).fillna(0).to_numpy()
    trm_l14 = np.r_[np.zeros(14), trm_var[:-14]]
    ves_var = np.log(exo["cop_ves"]).diff(28).fillna(0).to_numpy()
    ves_l7 = np.r_[np.zeros(7), ves_var[:-7]]

    filas, demanda = [], []
    for tienda, sector, n_prod in cfg.tiendas:
        for j in range(n_prod):
            sku = f"{sector[:3].upper()}-{tienda}-{j:04d}"
            if sector == "abarrotes":
                base = rng.lognormal(np.log(4.0), 0.9)
                k_disp = rng.uniform(3, 12)
            else:
                base = rng.lognormal(np.log(0.45), 0.9)
                k_disp = rng.uniform(0.6, 2.5)
            amp = rng.uniform(0.3, 1.0)
            b_quin = rng.uniform(0.05, 0.35)
            b_prima = rng.uniform(0.0, 0.25) * (2 if sector != "abarrotes" else 1)
            b_fest = rng.uniform(-0.25, 0.15) if sector == "abarrotes" else rng.uniform(-0.1, 0.3)
            g_traf = rng.uniform(0.3, 1.2) if sector == "abarrotes" else rng.uniform(0.1, 0.6)
            d_trm = rng.uniform(0.5, 3.0)
            d_ves = rng.uniform(0.2, 1.5)
            vol = rng.uniform(0.08, 0.35)
            tendencia = 1 + rng.normal(0, 0.15) * np.arange(n) / n
            inicio = 0
            if sector != "abarrotes" and rng.random() < 0.20:
                inicio = int(rng.integers(120, n - 240))  # producto nuevo
            sem = SEMANAL[sector] * rng.uniform(0.9, 1.1, 7)
            lam = (base * np.clip(tendencia, 0.3, None) * sem[dow] * _anual(sector, doy, amp)
                   * (1 + b_quin * cal["quincena"].to_numpy())
                   * (1 + b_prima * cal["prima"].to_numpy())
                   * (1 + b_fest * cal["festivo"].to_numpy())
                   * (1 + (0.6 if sector != "abarrotes" else 0.1) * cal["temporada_escolar"].to_numpy() * amp)
                   * np.exp(g_traf * trafico_l1)
                   * np.exp(-d_trm * trm_l14)
                   * np.exp(d_ves * ves_l7)
                   * np.exp(rng.normal(0, vol, n)))
            lam[:inicio] = 0.0
            p = k_disp / (k_disp + np.maximum(lam, 1e-9))
            y = rng.negative_binomial(k_disp, p)
            y[:inicio] = 0
            demanda.append(y.astype(np.int32))
            lo, hi = PRECIO[sector]
            filas.append({"sku": sku, "tienda": tienda, "sector": sector,
                          "precio": float(np.round(rng.uniform(lo, hi), -2)),
                          "inicio_venta": fechas[inicio].date().isoformat()})
    catalogo = pd.DataFrame(filas)
    return catalogo, np.vstack(demanda), fechas, exo, cal


def _tickets_particion(rng, fechas_mes, idx_dias, demanda, cat_t, tienda):
    """Expande unidades diarias a líneas de ticket con PII ficticia y errores."""
    sub = demanda[:, idx_dias]                       # [n_sku_tienda, dias]
    sku_i, dia_i = np.nonzero(sub)
    u = sub[sku_i, dia_i]
    n2 = rng.binomial(u // 2, 0.25)                  # líneas de 2 unidades
    n1 = u - 2 * n2
    rep = n1 + n2
    sku_l = np.repeat(sku_i, rep)
    dia_l = np.repeat(dia_i, rep)
    qty = np.ones(len(sku_l), dtype=np.int32)
    # marca las primeras n2 líneas de cada grupo como cantidad 2
    off = np.repeat(np.cumsum(rep) - rep, rep)
    pos = np.arange(len(sku_l)) - off
    qty[pos < np.repeat(n2, rep)] = 2
    m = len(qty)
    seg = rng.integers(8 * 3600, 20 * 3600, m)
    ts = fechas_mes[dia_l].to_numpy() + seg.astype("timedelta64[s]")
    precio = cat_t["precio"].to_numpy()[sku_l]
    ticket = np.array([f"{tienda}-{d:%Y%m%d}" for d in fechas_mes])[dia_l]
    ticket = np.char.add(ticket, np.char.add("-", (rng.integers(0, 400, m)).astype(str)))
    registrado = rng.random(m) < 0.30
    cedula = np.where(registrado, rng.integers(10_000_000, 1_299_999_999, m).astype(str), "")
    nombre = np.where(registrado, np.char.add(np.char.add(rng.choice(NOMBRES, m), " "), rng.choice(APELLIDOS, m)), "")
    telefono = np.where(registrado, np.char.add("3", rng.integers(100_000_000, 299_999_999, m).astype(str)), "")
    df = pd.DataFrame({
        "ticket_id": ticket, "fecha_hora": ts, "tienda": tienda,
        "sku": cat_t["sku"].to_numpy()[sku_l], "cantidad": qty,
        "precio_unitario": precio, "medio_pago": rng.choice(["efectivo", "tarjeta", "transferencia"], m, p=[.62, .2, .18]),
        "cliente_documento": cedula, "cliente_nombre": nombre, "cliente_telefono": telefono,
    })
    # --- errores típicos de exportaciones POS ---
    dup = df.sample(frac=0.005, random_state=int(rng.integers(1e9)))
    dev = df.sample(frac=0.003, random_state=int(rng.integers(1e9))).assign(cantidad=lambda d: -d["cantidad"])
    mal = df.sample(frac=0.002, random_state=int(rng.integers(1e9))).assign(sku="SKU-DESCONOCIDO")
    df = pd.concat([df, dup, dev, mal], ignore_index=True)
    faltan = rng.random(len(df)) < 0.004
    df.loc[faltan, "precio_unitario"] = np.nan
    return df.sort_values("fecha_hora", kind="stable").reset_index(drop=True)


def escribir_pos_crudo(cfg: ConfigDatos = CFG_DATOS, verbose: bool = True) -> dict:
    t0 = time.perf_counter()
    catalogo, demanda, fechas, exo, cal = generar_demanda(cfg)
    rng = np.random.default_rng(cfg.semilla + 1)
    CRUDOS.mkdir(parents=True, exist_ok=True)
    EXOGENAS.mkdir(parents=True, exist_ok=True)
    catalogo.to_parquet(EXOGENAS / "catalogo.parquet", index=False)
    exo.to_parquet(EXOGENAS / "macro_sintetica.parquet")
    cal.to_parquet(EXOGENAS / "calendario.parquet")
    # Verdad de terreno (demanda sin errores) solo para pruebas del ETL
    np.save(EXOGENAS / "demanda_verdad.npy", demanda)
    meses = fechas.to_period("M")
    n_lineas = 0
    for tienda in catalogo["tienda"].unique():
        filas = np.flatnonzero(catalogo["tienda"].to_numpy() == tienda)
        cat_t = catalogo.iloc[filas].reset_index(drop=True)
        for mes in meses.unique():
            idx = np.flatnonzero(meses == mes)
            df = _tickets_particion(rng, fechas[idx], idx, demanda[filas], cat_t, tienda)
            ruta = CRUDOS / f"tienda={tienda}" / f"mes={mes}.parquet"
            ruta.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(ruta, index=False)
            n_lineas += len(df)
    info = {"series": int(demanda.shape[0]), "dias": int(demanda.shape[1]),
            "lineas_pos": int(n_lineas), "unidades": int(demanda.sum()),
            "segundos": round(time.perf_counter() - t0, 1)}
    if verbose:
        print(info)
    return info


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    escribir_pos_crudo()
