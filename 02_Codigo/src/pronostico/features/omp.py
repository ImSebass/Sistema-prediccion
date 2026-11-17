"""Envoltorio ctypes del kernel C/OpenMP y versiones de referencia.

Tres implementaciones del MISMO cálculo (ajuste por rejilla TSB):
  * `tsb_rejilla_numpy`   : Python + NumPy, referencia legible (lenta);
  * `tsb_rejilla_numba`   : Numba @njit(parallel=True) con prange, ejecutada
                            sobre la capa de hilos OpenMP
                            (NUMBA_THREADING_LAYER='omp');
  * `tsb_rejilla_omp`     : kernel C con #pragma omp parallel for.

T(1) para el speedup = kernel C con 1 hilo (secuencial OPTIMIZADO), no la
versión NumPy, para no inflar artificialmente la aceleración.
"""
from __future__ import annotations

import ctypes
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np

os.environ.setdefault("NUMBA_THREADING_LAYER", "omp")

_DIR = Path(__file__).resolve().parent
_SRC = _DIR / "kernel_omp.c"
_WINDOWS = os.name == "nt"
_LIB = _DIR / ("kernel_omp.dll" if _WINDOWS else "libkernel_omp.so")
_lib = None

ALFAS = np.linspace(0.02, 0.50, 25).astype(np.float32)
BETAS = np.linspace(0.01, 0.40, 25).astype(np.float32)


def compilar(forzar: bool = False) -> Path:
    if forzar or not _LIB.exists() or _LIB.stat().st_mtime < _SRC.stat().st_mtime:
        # En Windows (MinGW-w64) no se usa -fPIC: todo el código de una DLL ya es reubicable.
        pic = [] if _WINDOWS else ["-fPIC"]
        subprocess.run(["gcc", "-O3", "-march=native", "-fopenmp", "-shared", *pic,
                        str(_SRC), "-o", str(_LIB), "-lm"], check=True)
    return _LIB


def _carpeta_runtime_gcc() -> None:
    """Windows: Python >= 3.8 no busca en PATH las DLL de las que depende la
    biblioteca (libgomp-1.dll, libwinpthread-1.dll); se añade la carpeta de gcc."""
    if _WINDOWS:
        gcc = shutil.which("gcc")
        if gcc:
            os.add_dll_directory(str(Path(gcc).parent))


def _cargar():
    global _lib
    if _lib is None:
        lib = compilar()
        _carpeta_runtime_gcc()
        _lib = ctypes.CDLL(str(lib))
        f32 = np.ctypeslib.ndpointer(np.float32, flags="C_CONTIGUOUS")
        i32 = np.ctypeslib.ndpointer(np.int32, flags="C_CONTIGUOUS")
        c_int = ctypes.c_int
        _lib.tsb_rejilla.argtypes = [f32, c_int, c_int, c_int, i32, f32, c_int, f32, c_int, f32, f32, f32, f32]
        _lib.ses_rejilla.argtypes = [f32, c_int, c_int, c_int, i32, f32, c_int, f32, f32, f32]
        _lib.caracteristicas_moviles.argtypes = [f32, c_int, c_int, f32]
        _lib.clasificar_sbc.argtypes = [f32, c_int, c_int, i32, f32, f32]
        _lib.fijar_hilos.argtypes = [c_int]
        _lib.hilos_maximos.restype = c_int
    return _lib


def fijar_hilos(n: int) -> None:
    _cargar().fijar_hilos(int(n))


def _inicio(Y: np.ndarray) -> np.ndarray:
    nz = Y > 0
    return np.where(nz.any(1), nz.argmax(1), 0).astype(np.int32)


def tsb_rejilla_omp(Y: np.ndarray, t_fin: int | None = None, hilos: int | None = None):
    lib = _cargar()
    if hilos:
        lib.fijar_hilos(hilos)
    Y = np.ascontiguousarray(Y, dtype=np.float32)
    n, d = Y.shape
    t_fin = d if t_fin is None else t_fin
    a, b, mse, f = (np.zeros(n, np.float32) for _ in range(4))
    lib.tsb_rejilla(Y, n, d, t_fin, _inicio(Y), ALFAS, len(ALFAS), BETAS, len(BETAS), a, b, mse, f)
    return {"alfa": a, "beta": b, "mse": mse, "pronostico": f}


def ses_rejilla_omp(Y: np.ndarray, t_fin: int | None = None, hilos: int | None = None):
    lib = _cargar()
    if hilos:
        lib.fijar_hilos(hilos)
    Y = np.ascontiguousarray(Y, dtype=np.float32)
    n, d = Y.shape
    t_fin = d if t_fin is None else t_fin
    a, mse, f = (np.zeros(n, np.float32) for _ in range(3))
    alfas = np.linspace(0.01, 0.6, 50).astype(np.float32)
    lib.ses_rejilla(Y, n, d, t_fin, _inicio(Y), alfas, len(alfas), a, mse, f)
    return {"alfa": a, "mse": mse, "pronostico": f}


def caracteristicas_omp(Y: np.ndarray, hilos: int | None = None) -> np.ndarray:
    lib = _cargar()
    if hilos:
        lib.fijar_hilos(hilos)
    Y = np.ascontiguousarray(Y, dtype=np.float32)
    out = np.zeros((*Y.shape, 4), np.float32)
    lib.caracteristicas_moviles(Y, Y.shape[0], Y.shape[1], out)
    return out


def clasificar_sbc_omp(Y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lib = _cargar()
    Y = np.ascontiguousarray(Y, dtype=np.float32)
    adi, cv2 = np.zeros(len(Y), np.float32), np.zeros(len(Y), np.float32)
    lib.clasificar_sbc(Y, Y.shape[0], Y.shape[1], _inicio(Y), adi, cv2)
    return adi, cv2


# ---------------------------------------------------------------- referencias
def tsb_rejilla_numpy(Y: np.ndarray, t_fin: int | None = None):
    """Referencia vectorizada sobre series (bucle Python sobre el tiempo)."""
    Y = Y.astype(np.float64)
    n, d = Y.shape
    t_fin = d if t_fin is None else t_fin
    ini = _inicio(Y)
    A, B = np.meshgrid(ALFAS.astype(np.float64), BETAS.astype(np.float64), indexing="ij")
    A, B = A.ravel(), B.ravel()
    mejor = {"alfa": np.zeros(n), "beta": np.zeros(n), "mse": np.full(n, np.inf), "pronostico": np.zeros(n)}
    for i in range(n):
        y = Y[i]
        w = y[ini[i]:ini[i] + 28]
        nz = (w > 0).sum()
        p = np.full(len(A), nz / 28.0)
        z = np.full(len(A), w[w > 0].mean() if nz else 1.0)
        sse = np.zeros(len(A))
        for k in range(ini[i], t_fin):
            e = y[k] - p * z
            sse += e * e
            if y[k] > 0:
                p += B * (1 - p)
                z += A * (y[k] - z)
            else:
                p -= B * p
        mse = sse / max(t_fin - ini[i], 1)
        j = int(np.argmin(mse))
        mejor["alfa"][i], mejor["beta"][i], mejor["mse"][i], mejor["pronostico"][i] = A[j], B[j], mse[j], p[j] * z[j]
    return mejor


def _numba_impl():
    from numba import njit, prange

    @njit(parallel=True, fastmath=False, cache=True)
    def _tsb(Y, t_fin, ini, alfas, betas, ma, mb, mm, mf):
        n = Y.shape[0]
        for i in prange(n):
            best = 1e300
            for ia in range(alfas.shape[0]):
                for ib in range(betas.shape[0]):
                    a = alfas[ia]; b = betas[ib]
                    nz = 0; s = 0.0
                    for k in range(ini[i], min(t_fin, ini[i] + 28)):
                        if Y[i, k] > 0:
                            nz += 1; s += Y[i, k]
                    p = nz / 28.0
                    z = s / nz if nz > 0 else 1.0
                    sse = 0.0; m = 0
                    for k in range(ini[i], t_fin):
                        e = Y[i, k] - p * z
                        sse += e * e; m += 1
                        if Y[i, k] > 0:
                            p += b * (1.0 - p); z += a * (Y[i, k] - z)
                        else:
                            p += b * (0.0 - p)
                    mse = sse / m if m > 0 else 1e300
                    if mse < best:
                        best = mse; ma[i] = a; mb[i] = b; mm[i] = mse; mf[i] = p * z
    return _tsb


_tsb_numba = None


def tsb_rejilla_numba(Y: np.ndarray, t_fin: int | None = None, hilos: int | None = None):
    global _tsb_numba
    import numba
    if _tsb_numba is None:
        _tsb_numba = _numba_impl()
    if hilos:
        numba.set_num_threads(hilos)
    Y = np.ascontiguousarray(Y, dtype=np.float32)
    n, d = Y.shape
    t_fin = d if t_fin is None else t_fin
    ma, mb, mm, mf = (np.zeros(n, np.float32) for _ in range(4))
    _tsb_numba(Y, t_fin, _inicio(Y), ALFAS, BETAS, ma, mb, mm, mf)
    return {"alfa": ma, "beta": mb, "mse": mm, "pronostico": mf}
