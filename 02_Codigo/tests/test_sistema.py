"""Pruebas unitarias (criterio de terminado de cada historia de usuario).

    PYTHONPATH=src pytest -q
"""
import numpy as np
import pandas as pd
import pytest

from pronostico.evaluacion import estadistica as est
from pronostico.evaluacion import metricas as met
from pronostico.features import omp
from pronostico.inventario.simulacion import simular
from pronostico.paralelo.etl_mpi import anonimizar, asignar_lpt


def test_wape_y_mase_robustos_a_ceros():
    y = np.array([0, 0, 3, 0, 5.0])
    f = np.array([1, 0, 2, 0, 5.0])
    assert met.wape(y, f) == pytest.approx(2 / 8)
    assert np.isfinite(met.mase(y, f, met.escala_mase(np.r_[np.zeros(10), np.arange(1, 30)], 7)))


def test_mase_ingenuo_igual_a_uno_en_muestra():
    rng = np.random.default_rng(0)
    y = rng.poisson(5, 200).astype(float)
    esc = met.escala_mase(y, 7)
    f = y[:-7]
    assert np.abs(y[7:] - f).mean() / esc == pytest.approx(1.0)


def test_kernel_openmp_coincide_con_numpy_y_es_determinista():
    rng = np.random.default_rng(1)
    Y = rng.negative_binomial(1, 0.6, (24, 200)).astype(np.float32)
    a = omp.tsb_rejilla_omp(Y, hilos=1)["pronostico"]
    b = omp.tsb_rejilla_omp(Y, hilos=2)["pronostico"]
    c = omp.tsb_rejilla_numpy(Y)["pronostico"]
    assert np.array_equal(a, b)
    assert np.allclose(a, c, atol=1e-4)


def test_caracteristicas_moviles():
    Y = np.arange(60, dtype=np.float32)[None, :]
    F = omp.caracteristicas_omp(Y, hilos=1)
    assert F[0, 30, 0] == pytest.approx(np.mean(np.arange(24, 31)))
    assert F[0, 40, 1] == pytest.approx(np.mean(np.arange(13, 41)))


def test_anonimizacion_elimina_pii_y_es_irreversible():
    df = pd.DataFrame({"cliente_documento": ["1090123456", "", "1090123456"],
                       "cliente_nombre": ["Ana Pérez", "", "Ana Pérez"],
                       "cliente_telefono": ["3001234567", "", "3001234567"], "x": [1, 2, 3]})
    out = anonimizar(df)
    assert not {"cliente_documento", "cliente_nombre", "cliente_telefono"} & set(out.columns)
    assert out["cliente_clave"][0] == out["cliente_clave"][2] != ""
    assert "1090123456" not in out["cliente_clave"][0]


def test_lpt_balancea(tmp_path):
    archivos = []
    for k, tam in enumerate([900, 500, 400, 300, 200, 100]):
        p = tmp_path / f"f{k}.bin"
        p.write_bytes(b"0" * tam)
        archivos.append(p)
    a = asignar_lpt(archivos, 2)
    cargas = [sum(f.stat().st_size for f in g) for g in a]
    assert max(cargas) - min(cargas) <= 100


def test_tost_y_holm():
    assert est.tost(np.zeros(50), 0.01)["equivalente"]
    r = est.tost(np.random.default_rng(0).normal(0.5, 0.01, 50), 0.01)
    assert not r["equivalente"]
    adj = est.holm({"a": 0.01, "b": 0.04, "c": 0.03})
    assert adj["a"] == pytest.approx(0.03) and adj["b"] == pytest.approx(0.06)


def test_simulacion_inventario_pronostico_perfecto_sirve_casi_todo():
    rng = np.random.default_rng(2)
    d = rng.poisson(10, (50, 28)).astype(float)
    r = simular(d, d.copy(), np.full(50, 3.0), np.full(50, 1000.0))
    assert r["fill_rate"] > 0.97
