/*
 * kernel_omp.c — Núcleo de cómputo en C con OpenMP (memoria compartida).
 *
 * Paraleliza el bucle externo sobre SERIES (paralelismo de tareas
 * independientes, sin dependencias entre iteraciones). Se usa
 * schedule(dynamic, CHUNK) porque el costo por serie varía (series que
 * empiezan a mitad de muestra o con muchos ceros terminan antes).
 *
 * Funciones exportadas (llamadas desde Python vía ctypes):
 *   - tsb_rejilla : ajuste por búsqueda en rejilla del modelo TSB
 *                   (Teunter–Syntetos–Babai) para demanda intermitente.
 *   - ses_rejilla : ajuste por rejilla de suavizamiento exponencial simple.
 *   - caracteristicas_moviles : media móvil 7/28, desviación móvil 28 y
 *                   EWMA, insumos del LSTM y del análisis exploratorio.
 *   - clasificar_sbc : ADI y CV² (clasificación Syntetos–Boylan).
 *
 * Compilación: gcc -O3 -march=native -fopenmp -shared -fPIC kernel_omp.c -o libkernel_omp.so
 */
#include <math.h>
#include <float.h>
#include <omp.h>

#define CHUNK 8

void fijar_hilos(int n) { omp_set_num_threads(n); }
int hilos_maximos(void) { return omp_get_max_threads(); }

/* Error cuadrático medio de un paso adelante de TSB con (a, b) dados. */
static double tsb_mse(const float *y, int t0, int t_fin, float a, float b, float *nivel_final) {
    /* inicialización con el primer tramo no nulo */
    double p = 0.0, z = 0.0;
    int k, nz = 0;
    double s = 0.0;
    for (k = t0; k < t_fin && k < t0 + 28; k++) { if (y[k] > 0) { nz++; s += y[k]; } }
    p = (double)nz / 28.0;
    z = nz > 0 ? s / nz : 1.0;
    double sse = 0.0;
    int m = 0;
    for (k = t0; k < t_fin; k++) {
        double f = p * z;
        double e = y[k] - f;
        sse += e * e; m++;
        if (y[k] > 0) { p += b * (1.0 - p); z += a * (y[k] - z); }
        else          { p += b * (0.0 - p); }
    }
    *nivel_final = (float)(p * z);
    return m > 0 ? sse / m : DBL_MAX;
}

void tsb_rejilla(const float *Y, int n_series, int n_dias, int t_fin,
                 const int *inicio, const float *alfas, int na,
                 const float *betas, int nb,
                 float *mejor_a, float *mejor_b, float *mejor_mse, float *pronostico) {
    int i;
    #pragma omp parallel for schedule(dynamic, CHUNK)
    for (i = 0; i < n_series; i++) {
        const float *y = Y + (long)i * n_dias;
        double best = DBL_MAX; float ba = 0, bb = 0, nivel = 0, niv;
        for (int ia = 0; ia < na; ia++)
            for (int ib = 0; ib < nb; ib++) {
                double mse = tsb_mse(y, inicio[i], t_fin, alfas[ia], betas[ib], &niv);
                if (mse < best) { best = mse; ba = alfas[ia]; bb = betas[ib]; nivel = niv; }
            }
        mejor_a[i] = ba; mejor_b[i] = bb; mejor_mse[i] = (float)best; pronostico[i] = nivel;
    }
}

void ses_rejilla(const float *Y, int n_series, int n_dias, int t_fin,
                 const int *inicio, const float *alfas, int na,
                 float *mejor_a, float *mejor_mse, float *pronostico) {
    int i;
    #pragma omp parallel for schedule(dynamic, CHUNK)
    for (i = 0; i < n_series; i++) {
        const float *y = Y + (long)i * n_dias;
        double best = DBL_MAX; float ba = 0, nivel = 0;
        for (int ia = 0; ia < na; ia++) {
            double l = y[inicio[i]], sse = 0.0; int m = 0;
            for (int k = inicio[i] + 1; k < t_fin; k++) {
                double e = y[k] - l; sse += e * e; m++;
                l += alfas[ia] * e;
            }
            double mse = m ? sse / m : DBL_MAX;
            if (mse < best) { best = mse; ba = alfas[ia]; nivel = (float)l; }
        }
        mejor_a[i] = ba; mejor_mse[i] = (float)best; pronostico[i] = nivel;
    }
}

/* salida: [n_series][n_dias][4] = media7, media28, desv28, ewma(0.1) */
void caracteristicas_moviles(const float *Y, int n_series, int n_dias, float *out) {
    int i;
    #pragma omp parallel for schedule(static)
    for (i = 0; i < n_series; i++) {
        const float *y = Y + (long)i * n_dias;
        float *o = out + (long)i * n_dias * 4;
        double s7 = 0, s28 = 0, q28 = 0, ew = y[0];
        for (int k = 0; k < n_dias; k++) {
            s7 += y[k]; s28 += y[k]; q28 += (double)y[k] * y[k];
            if (k >= 7)  s7 -= y[k - 7];
            if (k >= 28) { s28 -= y[k - 28]; q28 -= (double)y[k - 28] * y[k - 28]; }
            int w7 = k < 7 ? k + 1 : 7, w28 = k < 28 ? k + 1 : 28;
            double m28 = s28 / w28, var = q28 / w28 - m28 * m28;
            ew = 0.1 * y[k] + 0.9 * ew;
            o[k * 4 + 0] = (float)(s7 / w7);
            o[k * 4 + 1] = (float)m28;
            o[k * 4 + 2] = (float)sqrt(var > 0 ? var : 0);
            o[k * 4 + 3] = (float)ew;
        }
    }
}

/* ADI = intervalo medio entre demandas no nulas; CV2 = (sd/media)^2 de tamaños no nulos */
void clasificar_sbc(const float *Y, int n_series, int n_dias, const int *inicio, float *adi, float *cv2) {
    int i;
    #pragma omp parallel for schedule(static)
    for (i = 0; i < n_series; i++) {
        const float *y = Y + (long)i * n_dias;
        int nz = 0; double s = 0, q = 0;
        for (int k = inicio[i]; k < n_dias; k++) if (y[k] > 0) { nz++; s += y[k]; q += (double)y[k] * y[k]; }
        int n = n_dias - inicio[i];
        adi[i] = nz ? (float)n / nz : (float)n;
        double m = nz ? s / nz : 0, v = nz ? q / nz - m * m : 0;
        cv2[i] = m > 0 ? (float)(v / (m * m)) : 0.0f;
    }
}
