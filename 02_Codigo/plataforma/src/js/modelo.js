/* DemandAI — modelo de datos derivado.
   Solo transforma el paquete `window.DEMANDAI` que exporta el pipeline
   (pronostico.visualizacion.plataforma); no genera cifras propias. */
(function () {
  "use strict";
  const D = window.DEMANDAI;
  const M = (window.M = { D, ok: !!D });
  if (!D) return;

  const meta = D.meta;
  M.meta = meta;
  M.politica = meta.politica;
  M.H = meta.horizonte;
  M.nDias = meta.dias;
  /** fechas de la historia completa */
  M.fechas = Array.from({ length: meta.dias }, (_, k) => U.sumarDias(meta.inicio, k));
  M.ultimaFecha = meta.fin;
  M.fechasPron = D.pronostico ? D.pronostico.fechas : Array.from({ length: M.H }, (_, k) => U.sumarDias(meta.fin, k + 1));
  M.sectores = ["abarrotes", "ropa", "calzado"];
  M.colorSector = { abarrotes: "var(--serie-1)", ropa: "var(--serie-2)", calzado: "var(--serie-3)" };
  M.hexSector = { abarrotes: "#2563EB", ropa: "#DB2777", calzado: "#7C3AED" };
  M.tiendas = D.tiendas.map((t, i) => ({ ...t, i, nombre: "Establecimiento " + t.id.replace("T0", "") }));
  M.nombreTienda = (i) => M.tiendas[i].nombre + " · " + M.tiendas[i].id;

  /* ---------------------------------------------------------- productos */
  const P = D.productos;
  const inv = D.inventario;
  const pr = D.pronostico;
  const h0 = meta.historia_sku_desde;
  M.h0 = h0;
  M.productos = P.sku.map((sku, i) => {
    const num = sku.split("-").pop();
    return {
      i, sku, tienda: P.tienda[i], sector: P.sector[i], precio: P.precio[i],
      nombre: P.nombre ? P.nombre[i] : U.cap(P.sector[i]) + " ref. " + num,
      clase: P.clase ? P.clase[i] : null, adi: P.adi ? P.adi[i] : null, cv2: P.cv2 ? P.cv2[i] : null,
      ventasTotal: P.ventas_total[i], hist: P.historia[i], inv: null, pron: null,
    };
  });
  if (inv) {
    inv.i.forEach((pi, k) => {
      M.productos[pi].inv = {
        stock: inv.inventario[k], demanda7: inv.demanda_7d[k], pr: inv.punto_reorden[k], s: inv.nivel_objetivo[k],
        cobertura: inv.cobertura[k], alerta: inv.alerta[k], pedido: inv.pedido[k],
        prioridad: inv.prioridad[k], agotado: inv.agotado[k],
      };
    });
  }
  if (pr) {
    pr.i.forEach((pi, k) => {
      M.productos[pi].pron = pr.valores[k];
      M.productos[pi].pron28 = U.suma(pr.valores[k]);
    });
  }
  M.porSku = Object.fromEntries(M.productos.map((p) => [p.sku, p]));

  M.PRIORIDAD = {
    critica: { txt: "Crítica", cls: "e-critica", orden: 0, desc: "Cobertura menor que el tiempo de entrega" },
    alta: { txt: "Alta", cls: "e-alta", orden: 1, desc: "Inventario por debajo del punto de reorden" },
    media: { txt: "Media", cls: "e-media", orden: 2, desc: "Cobertura menor que un ciclo de revisión + entrega" },
    baja: { txt: "Baja", cls: "e-baja", orden: 3, desc: "Cobertura suficiente" },
  };
  M.estado = (p) => {
    if (!p.inv) return { txt: "Sin pronóstico", cls: "e-gris" };
    if (p.inv.agotado) return { txt: "Agotado", cls: "e-agotado" };
    if (p.inv.prioridad === "critica") return { txt: "Crítico", cls: "e-critica" };
    if (p.inv.prioridad === "alta") return { txt: "Stock bajo", cls: "e-alta" };
    if (p.inv.prioridad === "media") return { txt: "Reponer pronto", cls: "e-media" };
    return { txt: "Disponible", cls: "e-baja" };
  };
  M.etiquetaPrioridad = (k) => {
    const p = M.PRIORIDAD[k];
    return p ? `<span class="etiqueta ${p.cls}"><span class="pto"></span>${p.txt}</span>` : "";
  };
  M.etiquetaEstado = (p) => { const e = M.estado(p); return `<span class="etiqueta ${e.cls}">${e.txt}</span>`; };

  /** Explicación en lenguaje llano de por qué un SKU necesita reposición */
  M.razon = (p) => {
    const v = p.inv; const L = M.politica.L; const R = M.politica.R;
    if (!v) return "Sin pronóstico de producción para este producto.";
    if (v.agotado) return `Sin existencias y se esperan ${U.n1(v.demanda7)} u. de demanda en 7 días.`;
    if (v.prioridad === "critica") return `Alcanza para ${U.n1(v.cobertura)} días y el proveedor tarda ${L}: habrá quiebre antes de recibir el pedido.`;
    if (v.prioridad === "alta") return `Hay ${U.n0(v.stock)} u., por debajo del punto de reorden (${U.n1(v.pr)} u. = demanda de ${L} días + stock de seguridad).`;
    if (v.prioridad === "media") return `Cobertura de ${U.n1(v.cobertura)} días, menor que un ciclo de revisión más entrega (${R + L} días).`;
    return `Cobertura de ${U.n1(v.cobertura)} días: suficiente para el próximo ciclo.`;
  };

  /* ---------------------------------------------------------- filtros globales */
  M.estado_global = { tienda: U.prefs.tienda ?? "todas", periodo: U.prefs.periodo || 28 };
  M.enTienda = (p, t = M.estado_global.tienda) => t === "todas" || p.tienda === +t;
  M.productosFiltrados = (t = M.estado_global.tienda) => M.productos.filter((p) => M.enTienda(p, t));
  M.tiendasSel = (t = M.estado_global.tienda) => (t === "todas" ? M.tiendas.map((x) => x.i) : [+t]);

  /** Serie diaria agregada (unidades o ingresos) para un conjunto de tiendas */
  M.serieAgregada = (tipo = "ingresos", tiendas = M.tiendasSel()) => {
    const out = new Array(M.nDias).fill(0);
    for (const t of tiendas) { const s = D.agregados[tipo][t]; for (let k = 0; k < s.length; k++) out[k] += s[k]; }
    return out;
  };
  /** Suma en los últimos `dias` días, con desplazamiento hacia atrás `desp` */
  M.sumaVentana = (serie, dias, desp = 0) => {
    const fin = serie.length - desp; let s = 0;
    for (let k = Math.max(0, fin - dias); k < fin; k++) s += serie[k];
    return s;
  };
  /** Pronóstico agregado (unidades/día) de los SKU en las tiendas seleccionadas */
  M.pronAgregado = (productos = M.productosFiltrados()) => {
    const out = new Array(M.H).fill(0);
    for (const p of productos) if (p.pron) for (let k = 0; k < M.H; k++) out[k] += p.pron[k];
    return out;
  };
  M.porSector = (tipo, dias, desp = 0, tiendas = M.tiendasSel()) => {
    const r = { abarrotes: 0, ropa: 0, calzado: 0 };
    for (const t of tiendas) r[M.tiendas[t].sector] += M.sumaVentana(D.agregados[tipo][t], dias, desp);
    return r;
  };

  /* ---------------------------------------------------------- precisión y simulación */
  const MAPA_SIM = { "Ingenuo estacional": "ingenuo_s7", "Media móvil 28": "media_movil28", TSB: "tsb", SARIMAX: "sarimax",
    "SARIMAX + exóg.": "sarimax_exog", Prophet: "prophet", "Prophet + exóg.": "prophet_exog", LSTM: "lstm",
    "LSTM + exóg.": "lstm_exog", "Híbrido Prophet-LSTM": "hibrido" };
  M.claveModelo = MAPA_SIM;
  M.nombreModelo = (k) => meta.nombres_modelo[k] || k;
  M.precision = D.precision ? D.precision.tabla.map((f) => ({ ...f, clave: MAPA_SIM[f.modelo], sim: D.simulacion ? D.simulacion[MAPA_SIM[f.modelo]] : null })) : [];
  M.precisionDe = (clave) => M.precision.find((f) => f.clave === clave) || null;
  M.modeloProduccion = meta.produccion ? meta.produccion.modelo : "lstm_exog";

  M.DESCRIPCION_MODELO = {
    sarimax: { t: "SARIMAX", ic: "chart-line", d: "Modelo estadístico (1,0,1)(1,0,1)₇ por serie. Captura estacionalidad semanal; con exógenas incorpora TRM, tasa COP/VES, IPC y calendario.", par: "MPI · dinámico" },
    prophet: { t: "Prophet", ic: "calendar-range", d: "Modelo aditivo con tendencia por tramos, estacionalidad semanal/anual y festivos colombianos.", par: "MPI · dinámico" },
    tsb: { t: "TSB", ic: "split", d: "Teunter–Syntetos–Babai para demanda intermitente: actualiza por separado la probabilidad y el tamaño de la demanda.", par: "OpenMP (C) · Numba" },
    lstm: { t: "LSTM global", ic: "brain-circuit", d: "Una red recurrente para todas las series (ventana 56 días, salida MIMO de 28). Variante con exógenas en producción.", par: "CUDA / CPU multihilo" },
    hibrido: { t: "Híbrido Prophet-LSTM", ic: "layers", d: "Prophet modela tendencia y calendario; una LSTM global aprende los residuos no lineales.", par: "MPI + CUDA" },
  };
  M.variantesModelo = { sarimax: ["sarimax", "sarimax_exog"], prophet: ["prophet", "prophet_exog"], tsb: ["tsb"], lstm: ["lstm", "lstm_exog"], hibrido: ["hibrido"] };

  /* ---------------------------------------------------------- backtest */
  const B = D.backtest;
  M.backtest = B;
  if (B) {
    M.posBacktest = Object.fromEntries(B.series.map((s, k) => [s, k]));
    M.enBacktest = (p) => p && M.posBacktest[p.i] != null;
    M.serieBacktest = (p, modelo) => (M.enBacktest(p) && B.pron[modelo] ? B.pron[modelo][M.posBacktest[p.i]] : null);
  } else {
    M.enBacktest = () => false;
    M.serieBacktest = () => null;
  }

  /* ---------------------------------------------------------- utilidades de series */
  /** Media móvil centrada (tendencia) con ventana k */
  M.mediaMovil = (v, k = 28) => {
    const out = new Array(v.length).fill(null); const m = Math.floor(k / 2);
    for (let i = 0; i < v.length; i++) {
      const a = i - m, b = i + (k - m);
      if (a < 0 || b > v.length) continue;
      let s = 0; for (let j = a; j < b; j++) s += v[j];
      out[i] = s / k;
    }
    return out;
  };
  /** Índice estacional semanal (lun…dom) = media del día / media general */
  M.perfilSemanal = (v, fechaInicio) => {
    const s = new Array(7).fill(0), c = new Array(7).fill(0);
    const d0 = U.fecha(fechaInicio).getUTCDay();
    v.forEach((x, k) => { const dw = (d0 + k) % 7; const idx = (dw + 6) % 7; s[idx] += x; c[idx]++; });
    const med = U.suma(v) / v.length;
    return s.map((x, k) => (med > 0 && c[k] ? x / c[k] / med : null));
  };
  M.historiaSku = (p) => ({ fechas: M.fechas.slice(h0), valores: p.hist });

  /* ---------------------------------------------------------- notificaciones */
  M.notificaciones = () => {
    const prods = M.productos.filter((p) => p.inv);
    const crit = prods.filter((p) => p.inv.prioridad === "critica").length;
    const agot = prods.filter((p) => p.inv.agotado).length;
    const alta = prods.filter((p) => p.inv.prioridad === "alta").length;
    const out = [];
    if (crit) out.push({ ic: "octagon-alert", c: "ib-rojo", t: `${crit} productos en prioridad crítica`, d: `${agot} sin existencias. Se agotarán antes de recibir un pedido.`, ruta: "inventario?prioridad=critica" });
    if (alta) out.push({ ic: "triangle-alert", c: "ib-naranja", t: `${alta} productos bajo el punto de reorden`, d: "Requieren pedido en esta revisión.", ruta: "inventario?prioridad=alta" });
    if (meta.produccion) out.push({ ic: "sparkles", c: "ib-azul", t: "Pronóstico de 28 días actualizado", d: `${meta.produccion.modelo_nombre} · ${U.hace(meta.produccion.ejecutado)}`, ruta: "prediccion" });
    const lstm = D.benchmark && D.benchmark.lstm;
    if (lstm && !lstm.cuda) out.push({ ic: "microchip", c: "ib-gris", t: "CUDA pendiente de medición", d: "El entrenamiento se midió en CPU; falta ejecutar en GPU.", ruta: "rendimiento" });
    if (meta.datos_sinteticos) out.push({ ic: "database", c: "ib-gris", t: "Datos sintéticos de demostración", d: "Sustituir por exportaciones POS reales del comercio.", ruta: "configuracion" });
    return out;
  };
})();
