"""Simulación de inventario para evaluar el impacto operativo del pronóstico (OE4).

Política de revisión periódica "order-up-to" (R, S):
  * revisión cada R = 7 días; tiempo de entrega L = 3 días;
  * nivel objetivo S_t = sum(pronóstico de los próximos R+L días)
                         + z * sigma_e * sqrt(R+L),
    con z = 1,645 (nivel de servicio objetivo 95 %) y sigma_e la desviación
    del error de pronóstico de un día estimada en entrenamiento;
  * ventas perdidas (sin pedidos pendientes): lo no atendido se pierde.

Indicadores: nivel de servicio por unidades (fill rate), días con quiebre,
inventario promedio (días de cobertura) y costo total = costo de mantener
(25 % anual sobre el precio) + costo de venta perdida (margen 30 %).
Las 28 jornadas de cada ventana de prueba se simulan con la demanda real
(sintética) y el pronóstico de cada modelo; vectorizado sobre series.
"""
from __future__ import annotations

import numpy as np

R, LT, Z = 7, 3, 1.645
TASA_MANTENER_DIA = 0.25 / 365
MARGEN = 0.30


def simular(demanda: np.ndarray, pronostico: np.ndarray, sigma: np.ndarray,
            precio: np.ndarray, inv_inicial: np.ndarray | None = None) -> dict:
    """demanda, pronostico: [N, H]; sigma, precio: [N]."""
    N, H = demanda.shape
    inv = (pronostico[:, :R + LT].sum(1) if inv_inicial is None else inv_inicial).astype(float)
    pendientes = np.zeros((N, H + LT + 1))
    vendidas = np.zeros(N); perdidas = np.zeros(N); inv_acum = np.zeros(N); dias_quiebre = np.zeros(N)
    for t in range(H):
        inv += pendientes[:, t]
        if t % R == 0:
            ventana = pronostico[:, t:t + R + LT]
            # si la ventana se sale del horizonte se extiende con la media del pronóstico
            falta = R + LT - ventana.shape[1]
            obj = ventana.sum(1) + falta * pronostico.mean(1) + Z * sigma * np.sqrt(R + LT)
            posicion = inv + pendientes[:, t + 1:].sum(1)
            pedido = np.maximum(obj - posicion, 0).round()
            pendientes[:, t + LT] += pedido
        d = demanda[:, t]
        v = np.minimum(inv, d)
        vendidas += v
        perdidas += d - v
        dias_quiebre += (d > inv)
        inv -= v
        inv_acum += inv
    total = demanda.sum(1)
    costo_mant = inv_acum * precio * TASA_MANTENER_DIA
    costo_perd = perdidas * precio * MARGEN
    return {
        "fill_rate": float(vendidas.sum() / max(total.sum(), 1)),
        "dias_quiebre_prom": float(dias_quiebre.mean()),
        "inventario_prom_unid": float((inv_acum / H).mean()),
        "cobertura_dias": float((inv_acum / H).sum() / max(total.sum() / H, 1e-9)),
        "costo_mantener": float(costo_mant.sum()),
        "costo_venta_perdida": float(costo_perd.sum()),
        "costo_total": float((costo_mant + costo_perd).sum()),
    }
