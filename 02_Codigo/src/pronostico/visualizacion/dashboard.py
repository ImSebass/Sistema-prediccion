"""Módulo de visualización: tablero HTML autocontenido con alertas de reabastecimiento.

Entradas: pronóstico de producción (próximos 28 días por serie), inventario
actual por SKU y parámetros de la política (R, S). Una ALERTA se emite cuando
la posición de inventario no cubre la demanda pronosticada durante el tiempo
de entrega más el stock de seguridad (punto de reorden):

    PR_i = sum_{k=1..L} f_i,k + z * sigma_i * sqrt(L)
    alerta_i  <=>  inventario_i < PR_i
    cantidad sugerida = S_i - inventario_i,  S_i = sum_{k=1..R+L} f_i,k + z sigma_i sqrt(R+L)

El HTML no tiene dependencias externas (tablas + SVG en línea), de modo que
el comerciante puede abrirlo sin conexión.
"""
from __future__ import annotations

import html
from datetime import date

import numpy as np
import pandas as pd

from pronostico.inventario.simulacion import LT, R, Z


def alertas(pron: np.ndarray, inventario: np.ndarray, sigma: np.ndarray, catalogo: pd.DataFrame) -> pd.DataFrame:
    pr = pron[:, :LT].sum(1) + Z * sigma * np.sqrt(LT)
    s = pron[:, :R + LT].sum(1) + Z * sigma * np.sqrt(R + LT)
    cobertura = inventario / np.maximum(pron.mean(1), 1e-6)
    df = catalogo[["sku", "tienda", "sector", "precio"]].copy()
    df["inventario"] = inventario.round()
    df["demanda_7d"] = pron[:, :7].sum(1).round(1)
    df["punto_reorden"] = pr.round(1)
    df["cobertura_dias"] = cobertura.round(1)
    df["alerta"] = inventario < pr
    df["pedido_sugerido"] = np.where(df["alerta"], np.maximum(s - inventario, 0).round(), 0)
    df["prioridad"] = np.where(cobertura < LT, "CRÍTICA", np.where(df["alerta"], "ALTA", "—"))
    return df


def _sparkline(v: np.ndarray, w=120, h=24) -> str:
    v = np.asarray(v, float)
    if v.max() <= 0:
        return ""
    x = np.linspace(0, w, len(v))
    y = h - 2 - (h - 4) * v / v.max()
    pts = " ".join(f"{a:.1f},{b:.1f}" for a, b in zip(x, y))
    return (f'<svg width="{w}" height="{h}" role="img" aria-label="pronóstico 28 días">'
            f'<polyline fill="none" stroke="#2a78d6" stroke-width="1.5" points="{pts}"/></svg>')


def generar_html(df: pd.DataFrame, pron: np.ndarray, metricas: dict, ruta, fecha_corte: str) -> None:
    filas = []
    orden = df.assign(_i=np.arange(len(df))).sort_values(["prioridad", "cobertura_dias"],
                                                          key=lambda c: c.map({"CRÍTICA": 0, "ALTA": 1, "—": 2}) if c.name == "prioridad" else c)
    top = orden[orden["alerta"]].head(150)
    for _, r in top.iterrows():
        filas.append(
            f"<tr><td>{html.escape(r.sku)}</td><td>{r.tienda}</td><td>{r.sector}</td>"
            f"<td class=n>{r.inventario:.0f}</td><td class=n>{r.demanda_7d:.1f}</td>"
            f"<td class=n>{r.punto_reorden:.1f}</td><td class=n>{r.cobertura_dias:.1f}</td>"
            f"<td class=n><b>{r.pedido_sugerido:.0f}</b></td>"
            f"<td><span class='p {'c' if r.prioridad == 'CRÍTICA' else 'a'}'>{'▲ ' if r.prioridad == 'CRÍTICA' else '● '}{r.prioridad}</span></td>"
            f"<td>{_sparkline(pron[int(r._i)])}</td></tr>")
    resumen_t = df.groupby("tienda").agg(skus=("sku", "size"), alertas=("alerta", "sum"),
                                         criticas=("prioridad", lambda s: (s == "CRÍTICA").sum()),
                                         unidades_sugeridas=("pedido_sugerido", "sum"))
    tarjetas = "".join(
        f"<div class=card><div class=k>{t}</div><div class=v>{int(r.alertas)}</div>"
        f"<div class=s>alertas · {int(r.criticas)} críticas · {int(r.unidades_sugeridas)} u. sugeridas</div></div>"
        for t, r in resumen_t.iterrows())
    met = "".join(f"<li>{html.escape(k)}: <b>{v}</b></li>" for k, v in metricas.items())
    doc = f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Alertas de reabastecimiento – {fecha_corte}</title>
<style>
.viz-root{{--surface-1:#fcfcfb;--text-primary:#0b0b0b;--text-secondary:#52514e;--grid:#d9d8d4;
--critical:#c62828;--serious:#b85c00;font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif;color:var(--text-primary);
background:var(--surface-1);margin:0;padding:24px}}
@media (prefers-color-scheme:dark){{.viz-root{{--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--grid:#3a3a37;--critical:#ef6b6b;--serious:#e59a3a}}}}
h1{{font-size:20px;margin:0 0 4px}} .sub{{color:var(--text-secondary);margin-bottom:16px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:12px 0 20px}}
.card{{border:1px solid var(--grid);border-radius:8px;padding:12px}} .k{{color:var(--text-secondary)}} .v{{font-size:28px;font-weight:600}}
.s{{color:var(--text-secondary);font-size:12px}} table{{border-collapse:collapse;width:100%;font-size:13px}}
th,td{{border-bottom:1px solid var(--grid);padding:6px 8px;text-align:left}} th{{color:var(--text-secondary);font-weight:600;position:sticky;top:0;background:var(--surface-1)}}
td.n{{text-align:right;font-variant-numeric:tabular-nums}} .p.c{{color:var(--critical);font-weight:600}} .p.a{{color:var(--serious)}}
input{{padding:6px 10px;border:1px solid var(--grid);border-radius:6px;background:transparent;color:inherit;margin-bottom:10px;width:260px}}
</style></head><body class="viz-root">
<h1>Alertas de reabastecimiento</h1>
<div class=sub>Corte: {fecha_corte} · Política (R={R} días, L={LT} días, nivel de servicio 95 %) · Datos SINTÉTICOS de demostración · generado {date.today()}</div>
<div class=cards>{tarjetas}</div>
<details><summary>Desempeño del motor en validación</summary><ul>{met}</ul></details>
<h2 style="font-size:16px">SKU con alerta (máx. 150, ordenados por prioridad y cobertura)</h2>
<input id=f placeholder="Filtrar por SKU, tienda o sector" oninput="filtrar(this.value)">
<table id=t><thead><tr><th>SKU</th><th>Tienda</th><th>Sector</th><th>Inventario</th><th>Demanda 7 d</th>
<th>Punto de reorden</th><th>Cobertura (días)</th><th>Pedido sugerido</th><th>Prioridad</th><th>Pronóstico 28 d</th></tr></thead>
<tbody>{''.join(filas)}</tbody></table>
<script>function filtrar(q){{q=q.toLowerCase();for(const r of document.querySelectorAll('#t tbody tr'))r.style.display=r.textContent.toLowerCase().includes(q)?'':'none'}}</script>
</body></html>"""
    with open(ruta, "w", encoding="utf-8") as fh:
        fh.write(doc)
