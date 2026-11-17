"""Variables exógenas y calendario del contexto fronterizo Cúcuta – Venezuela.

IMPORTANTE: las series macroeconómicas (TRM, tasa peso-bolívar, IPC y tráfico
fronterizo) se GENERAN SINTÉTICAMENTE con rangos y dinámicas plausibles para
2024–2026. No son datos oficiales del Banco de la República, del BCV, del DANE
ni de Migración Colombia. El módulo `cargar_exogenas_reales` documenta el
esquema esperado para sustituirlas por las series oficiales sin tocar el resto
del sistema.

El calendario (festivos de Colombia, quincenas, primas, temporada escolar y
temporada navideña) sí es real: usa la librería `holidays` (Ley 51 de 1983).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

try:
    import holidays
except ImportError:  # pragma: no cover
    holidays = None


def calendario(fechas: pd.DatetimeIndex) -> pd.DataFrame:
    """Variables de calendario conocidas a futuro (sin riesgo de fuga)."""
    df = pd.DataFrame(index=fechas)
    df.index.name = "fecha"
    anios = sorted(set(fechas.year))
    fest = holidays.Colombia(years=anios) if holidays else {}
    df["festivo"] = np.array([d in fest for d in fechas.date], dtype=np.int8)
    dia = fechas.day
    fin_mes = fechas.is_month_end
    # Pago quincenal: días 15-17 y último día del mes + días 1-2 del siguiente
    df["quincena"] = (((dia >= 15) & (dia <= 17)) | fin_mes | (dia <= 2)).astype(np.int8)
    mes = fechas.month
    # Prima de servicios (junio y diciembre, segunda quincena)
    df["prima"] = (((mes == 6) | (mes == 12)) & (dia >= 15)).astype(np.int8)
    # Temporada escolar calendario A (Norte de Santander): ene 10 – feb 10 y julio 1-20
    doy = fechas.dayofyear
    df["temporada_escolar"] = (((doy >= 10) & (doy <= 41)) | ((mes == 7) & (dia <= 20))).astype(np.int8)
    df["navidad"] = ((mes == 12) & (dia <= 24)).astype(np.int8)
    df["dia_semana"] = fechas.dayofweek.astype(np.int8)
    return df


def generar_exogenas(fechas: pd.DatetimeIndex, rng: np.random.Generator) -> pd.DataFrame:
    """Genera TRM, tasa COP/VES, IPC y tráfico fronterizo SINTÉTICOS (diarios)."""
    n = len(fechas)
    # TRM (COP por USD): paseo aleatorio log con reversión a la media y un choque.
    log_trm = np.empty(n)
    log_trm[0] = np.log(3950.0)
    media = np.log(4100.0)
    for t in range(1, n):
        log_trm[t] = log_trm[t - 1] + 0.01 * (media - log_trm[t - 1]) + rng.normal(0, 0.0055)
    choque = (fechas >= "2025-04-07") & (fechas < "2025-05-20")
    log_trm += np.where(choque, np.log(1.075), 0.0) * np.clip(
        (np.cumsum(choque) / 10.0), 0, 1)
    trm = np.exp(log_trm)

    # VES por USD: devaluación persistente con saltos discretos (régimen cambiario).
    log_ves = np.empty(n)
    log_ves[0] = np.log(36.0)
    for t in range(1, n):
        salto = rng.random() < 0.012
        log_ves[t] = log_ves[t - 1] + 0.0028 + rng.normal(0, 0.006) + (rng.uniform(0.04, 0.12) if salto else 0)
    ves_usd = np.exp(log_ves)
    cop_ves = trm / ves_usd                  # COP por bolívar

    # IPC (base dic-2023 = 100): inflación anual que cede de ~5,5 % a ~4,6 %.
    meses = fechas.to_period("M")
    uniq = meses.unique()
    infl_anual = np.linspace(0.055, 0.046, len(uniq))
    ipc_m = 100 * np.cumprod((1 + infl_anual) ** (1 / 12) + rng.normal(0, 0.0008, len(uniq)))
    ipc = pd.Series(ipc_m, index=uniq).reindex(meses).to_numpy()

    # Tráfico fronterizo diario (personas): tendencia, patrón semanal, cierre temporal.
    t = np.arange(n)
    dow = fechas.dayofweek.to_numpy()
    patron = np.array([0.92, 0.88, 0.90, 0.95, 1.05, 1.22, 1.08])[dow]
    tendencia = 1 + 0.18 * t / n
    trafico = 32000 * tendencia * patron * np.exp(rng.normal(0, 0.07, n))
    cierre = (fechas >= "2025-01-08") & (fechas < "2025-01-22")
    trafico = np.where(cierre, trafico * 0.35, trafico)

    return pd.DataFrame(
        {"trm": trm, "cop_ves": cop_ves, "ipc": ipc, "trafico_fronterizo": trafico},
        index=pd.Index(fechas, name="fecha"),
    )


def matriz_exogena(exo: pd.DataFrame, cal: pd.DataFrame, rezago: int = 7) -> pd.DataFrame:
    """Construye regresores SIN fuga de información.

    - Calendario: conocido a futuro, se usa en t.
    - Macroeconómicas: solo valores rezagados >= `rezago` días (>= horizonte
      operativo de reabastecimiento), de modo que en producción están
      disponibles al momento de pronosticar.
    """
    x = pd.DataFrame(index=exo.index)
    x["trm_var28_l"] = np.log(exo["trm"]).diff(28).shift(rezago)
    x["copves_var28_l"] = np.log(exo["cop_ves"]).diff(28).shift(rezago)
    x["trafico_rel_l"] = np.log(exo["trafico_fronterizo"] / exo["trafico_fronterizo"].rolling(56, min_periods=7).mean()).shift(rezago)
    x["ipc_var12_l"] = np.log(exo["ipc"]).diff(365).shift(rezago)
    for c in ["festivo", "quincena", "prima", "temporada_escolar", "navidad"]:
        x[c] = cal[c].astype(float)
    return x.bfill().fillna(0.0)


def cargar_exogenas_reales(ruta_csv: str) -> pd.DataFrame:
    """Punto de sustitución por series oficiales.

    Esquema esperado (CSV diario): fecha, trm, cop_ves, ipc, trafico_fronterizo.
    Fuentes sugeridas: TRM – Banco de la República (serie oficial diaria);
    COP/VES – casas de cambio de Cúcuta / BCV; IPC – DANE (mensual, se
    replica a diario); tráfico – Migración Colombia (flujos migratorios).
    """
    df = pd.read_csv(ruta_csv, parse_dates=["fecha"]).set_index("fecha").asfreq("D")
    return df.ffill()
