"""LSTM GLOBAL (un único modelo para todas las series) en PyTorch, con CUDA.

Por qué global: con ~730 días por serie, un LSTM por serie sobreajusta; un
modelo global aprende patrones compartidos entre productos y, además,
concentra el cómputo en grandes lotes de tensores, que es donde la GPU
(CUDA, cuDNN) aporta aceleración.

Arquitectura (salida directa multi-horizonte, MIMO):
    ventana pasada [L=56 días x F] --LSTM(64)--> h_T
    concat(h_T, futuro conocido [H x Ff] aplanado, sector one-hot)
    --> MLP(128) --> H=28 valores escalados.
Escala por serie: media de la demanda de entrenamiento desde el inicio de
ventas (s_i). Pérdida: Huber sobre y/s_i.

Variantes:
  * 'lstm'       : solo la historia de la serie + día de la semana;
  * 'lstm_exog'  : + calendario (festivos, quincenas, primas, temporada
                   escolar, navidad) + macro rezagadas (sin fuga);
  * 'hibrido'    : Prophet (con regresores) explica tendencia/estacionalidad/
                   festivos y el LSTM corrige los RESIDUOS no lineales.
Dispositivo: 'cuda' si torch.cuda.is_available(), si no 'cpu' (con N hilos).
"""
from __future__ import annotations

import time

import numpy as np

L = 56
OCULTA = 64


def _torch():
    import torch
    return torch


def construir_red(f_in: int, f_fut: int, h: int, n_estat: int):
    torch = _torch()
    nn = torch.nn

    class Red(nn.Module):
        def __init__(self):
            super().__init__()
            self.lstm = nn.LSTM(f_in, OCULTA, batch_first=True)
            self.mlp = nn.Sequential(nn.Linear(OCULTA + f_fut * h + n_estat, 128), nn.ReLU(),
                                     nn.Linear(128, h))

        def forward(self, x, fut, est):
            _, (hT, _) = self.lstm(x)
            z = torch.cat([hT[-1], fut.flatten(1), est], dim=1)
            return self.mlp(z)

    return Red()


def _cal_feats(X, nombres_x, dias, con_exog: bool):
    dow = dias % 7
    base = [np.sin(2 * np.pi * dow / 7), np.cos(2 * np.pi * dow / 7)]
    if con_exog:
        base += [X[dias, j] for j in range(X.shape[1])]
    return np.stack(base, -1).astype(np.float32)


def preparar(D, series, t0, h, variante, residuos=None):
    """Construye tensores de entrenamiento (ventanas < t0) y de predicción (en t0)."""
    con_exog = variante in ("lstm_exog", "hibrido")
    Y = D.Y[series, :t0]
    ini = np.array([np.flatnonzero(y > 0)[0] if (y > 0).any() else 0 for y in Y])
    esc = np.array([max(Y[k, ini[k]:].mean(), 0.05) for k in range(len(series))], np.float32)
    sect = D.catalogo["sector"].to_numpy()[series]
    est = np.stack([(sect == s).astype(np.float32) for s in ("abarrotes", "ropa", "calzado")], 1)
    dias_idx = np.arange(D.X.shape[0])                                # incluye h días futuros
    cal = _cal_feats(D.X, D.nombres_x, dias_idx, con_exog)            # [días + h, Fc]
    ys = (Y / esc[:, None]).astype(np.float32)
    rs = None if residuos is None else (residuos[:, :t0] / esc[:, None]).astype(np.float32)

    xs, fs, es, ts = [], [], [], []
    for k in range(len(series)):
        for t in range(max(ini[k], 0) + L, t0 - h + 1, 7):
            obj = ys[k, t:t + h] if rs is None else rs[k, t:t + h]
            pas = [ys[k, t - L:t, None]] + ([rs[k, t - L:t, None]] if rs is not None else [])
            xs.append(np.concatenate(pas + [cal[t - L:t]], 1))
            fs.append(cal[t:t + h]); es.append(est[k]); ts.append(obj)
    Xtr = np.stack(xs); Ftr = np.stack(fs); Etr = np.stack(es); Ttr = np.stack(ts)
    pas = [ys[:, t0 - L:t0, None]] + ([rs[:, t0 - L:t0, None]] if rs is not None else [])
    Xpr = np.concatenate(pas + [np.repeat(cal[None, t0 - L:t0], len(series), 0)], 2)
    Fpr = np.repeat(cal[None, t0:t0 + h], len(series), 0)
    return (Xtr, Ftr, Etr, Ttr), (Xpr.astype(np.float32), Fpr, est), esc


def entrenar_y_predecir(D, series, t0, h, variante="lstm", residuos=None, epocas=6,
                        lote=512, semilla=0, dispositivo=None, hilos=None, max_pasos=None):
    torch = _torch()
    if hilos:
        torch.set_num_threads(hilos)
    torch.manual_seed(semilla)
    np.random.seed(semilla)
    dev = dispositivo or ("cuda" if torch.cuda.is_available() else "cpu")
    (Xtr, Ftr, Etr, Ttr), (Xpr, Fpr, Epr), esc = preparar(D, series, t0, h, variante, residuos)
    red = construir_red(Xtr.shape[2], Ftr.shape[2], h, Etr.shape[1]).to(dev)
    opt = torch.optim.Adam(red.parameters(), lr=2e-3)
    perdida = torch.nn.HuberLoss(delta=1.0)
    tens = [torch.from_numpy(a).to(dev) for a in (Xtr, Ftr, Etr, Ttr)]
    n = len(Xtr)
    gen = torch.Generator(device="cpu").manual_seed(semilla)
    pasos = 0
    if dev == "cuda":
        torch.cuda.synchronize()
    t_ini = time.perf_counter()
    red.train()
    for _ in range(epocas):
        perm = torch.randperm(n, generator=gen).to(dev)
        for b in range(0, n, lote):
            idx = perm[b:b + lote]
            opt.zero_grad(set_to_none=True)
            out = red(tens[0][idx], tens[1][idx], tens[2][idx])
            loss = perdida(out, tens[3][idx])
            loss.backward()
            opt.step()
            pasos += 1
            if max_pasos and pasos >= max_pasos:
                break
        if max_pasos and pasos >= max_pasos:
            break
    if dev == "cuda":
        torch.cuda.synchronize()
    t_entr = time.perf_counter() - t_ini
    red.eval()
    with torch.no_grad():
        pr = red(*(torch.from_numpy(a).to(dev) for a in (Xpr, Fpr, Epr))).cpu().numpy()
    pron = pr * esc[:, None]
    return pron, {"t_entrenamiento": t_entr, "pasos": pasos, "ventanas": n, "dispositivo": dev,
                  "seg_por_paso": t_entr / max(pasos, 1)}
