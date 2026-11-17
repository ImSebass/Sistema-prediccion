/* Vista: Análisis y reportes */
(function () {
  "use strict";
  const PESTANAS = [
    ["ventas", "Ventas por período", "chart-line"], ["sectores", "Comparación de sectores", "chart-pie"],
    ["semanal", "Patrones semanales", "calendar"], ["intermitente", "Demanda intermitente", "split"],
    ["productos", "Análisis de productos", "boxes"], ["modelos", "Comparación de modelos", "brain-circuit"],
    ["simulacion", "Simulación de inventario", "package"],
  ];
  const CLASE_COLOR = { suave: "#16A36A", erratica: "#F59E0B", intermitente: "#2563EB", irregular: "#EF4444" };
  const NOM_EFECTO = { quincena: "Quincena", prima: "Prima de servicios", festivo: "Festivo", temporada_escolar: "Temporada escolar", navidad: "Navidad" };

  function mensual(tipo) {
    const meses = [], idx = {};
    M.fechas.forEach((f, k) => { const m = f.slice(0, 7); if (idx[m] == null) { idx[m] = meses.length; meses.push(m); } });
    const out = { meses, sector: {} };
    M.sectores.forEach((s) => (out.sector[s] = new Array(meses.length).fill(0)));
    M.tiendas.forEach((t) => { const serie = M.D.agregados[tipo][t.i]; serie.forEach((v, k) => (out.sector[t.sector][idx[M.fechas[k].slice(0, 7)]] += v)); });
    return out;
  }
  const cab = (t, sub, acciones = "") => `<div class="card-h"><div><h3>${t}</h3><div class="sub">${sub}</div></div><div class="acciones no-imprimir">${acciones}</div></div>`;
  const btnCSV = (id) => `<button class="btn peq" data-csv="${id}">${U.ic("download", "xs")}CSV</button>`;

  VISTA("analisis", {
    titulo: "Análisis y reportes", grupo: "Principal",
    render(c, params) {
      let tab = params.tab || "ventas";
      c.innerHTML = `
        <div class="flex entre flex-w" style="margin-bottom:6px">
          <p class="texto-2" style="margin:0">Reportes calculados a partir de los resultados del pipeline. Cada sección se puede exportar a CSV o imprimir como PDF.</p>
          <button class="btn no-imprimir" id="a-imprimir">${U.ic("printer", "s")}Imprimir / PDF</button></div>
        <nav class="pestanas no-imprimir" role="tablist">${PESTANAS.map(([k, t, ic]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}" class="${k === tab ? "activo" : ""}">${U.ic(ic, "s")}${t}</button>`).join("")}</nav>
        <div id="a-cuerpo"></div>`;
      const cuerpo = U.$("#a-cuerpo", c);
      const csv = {};

      const vistas = {
        ventas() {
          const m = mensual("ingresos"), mu = mensual("unidades");
          const tot = m.meses.map((_, k) => U.suma(M.sectores.map((s) => m.sector[s][k])));
          const ult12 = U.suma(tot.slice(-12)), prev12 = U.suma(tot.slice(-24, -12));
          cuerpo.innerHTML = `
            <section class="rejilla g-4">
              ${C.kpi({ etq: "Ventas últimos 12 meses", valor: U.cop(ult12), ic: "banknote", color: "ib-azul", pie: U.tendencia(U.var(ult12, prev12), true, "vs 12 meses previos") })}
              ${C.kpi({ etq: "Mejor mes", valor: U.fMes(m.meses[tot.indexOf(Math.max(...tot))] + "-01"), ic: "trending-up", color: "ib-verde", pie: `<span>${U.cop(Math.max(...tot))}</span>` })}
              ${C.kpi({ etq: "Mes más bajo", valor: U.fMes(m.meses[tot.indexOf(Math.min(...tot))] + "-01"), ic: "trending-down", color: "ib-naranja", pie: `<span>${U.cop(Math.min(...tot))}</span>` })}
              ${C.kpi({ etq: "Historia analizada", valor: U.n0(M.nDias), unidad: "días", ic: "calendar-range", color: "ib-gris", fuente: `${U.fMedia(M.meta.inicio)} – ${U.fMedia(M.meta.fin)}` })}
            </section>
            <div class="card mt">${cab("Ventas mensuales por sector", "Ingresos a precio de venta", btnCSV("ventas"))}
              <div id="g-mes"></div><div style="margin-top:10px">${G.leyenda(M.sectores.map((s) => ({ nombre: U.cap(s), color: M.hexSector[s] })))}</div></div>`;
          G.lineas(U.$("#g-mes", cuerpo), {
            x: m.meses.map((x) => x + "-01"), alto: 320, formatoY: U.cop, formatoX: U.fMes, formatoXTooltip: (iso) => U.cap(U.fMes(iso)), ticksX: 10,
            series: M.sectores.map((s) => ({ nombre: U.cap(s), color: M.hexSector[s], valores: m.sector[s] })),
          });
          csv.ventas = () => [["mes", ...M.sectores.map((s) => "ingresos_" + s), ...M.sectores.map((s) => "unidades_" + s)], ...m.meses.map((mm, k) => [mm, ...M.sectores.map((s) => m.sector[s][k]), ...M.sectores.map((s) => mu.sector[s][k])])];
        },
        sectores() {
          const e = M.D.eda;
          const r = M.porSector("ingresos", 365), u = M.porSector("unidades", 365);
          const ef = e ? Object.keys(e.efectos_calendario) : [];
          cuerpo.innerHTML = `
            <div class="card">${cab("Indicadores por sector", "Últimos 12 meses y caracterización de la demanda", btnCSV("sectores"))}
              <div class="tabla-env"><table class="tabla"><thead><tr><th>Sector</th><th class="n">Ventas 12 m</th><th class="n">Unidades 12 m</th><th class="n">Precio medio</th><th class="n">% días sin venta</th><th class="n">Fuerza estacional semanal</th><th class="n">Fuerza de tendencia</th></tr></thead>
              <tbody>${M.sectores.map((s) => `<tr><td><span class="chip"><span class="sw" style="background:${M.hexSector[s]}"></span>${U.cap(s)}</span></td>
                <td class="n">${U.cop(r[s])}</td><td class="n">${U.n0(u[s])}</td><td class="n">${U.cop(r[s] / (u[s] || 1), false)}</td>
                <td class="n">${e ? U.pct(e.ceros_por_sector[s]) : "—"}</td><td class="n">${e ? U.n2(e.stl[s].fuerza_estacional_semanal) : "—"}</td><td class="n">${e ? U.n2(e.stl[s].fuerza_tendencia) : "—"}</td></tr>`).join("")}</tbody></table></div></div>
            <div class="card mt">${cab("Efectos de calendario", "Multiplicador de la demanda frente a un día normal (1,0 = sin efecto)")}
              <div id="g-efectos"></div><div style="margin-top:10px">${G.leyenda(M.sectores.map((s) => ({ nombre: U.cap(s), color: M.hexSector[s], caja: true })))}</div>
              <div class="texto-2 peq mt">La prima de servicios, la temporada escolar y la Navidad elevan mucho la demanda de ropa y calzado; la quincena afecta por igual a los tres sectores.</div></div>`;
          if (e) G.barras(U.$("#g-efectos", cuerpo), {
            categorias: ef.map((k) => NOM_EFECTO[k] || k), alto: 260, referencia: 1, etiquetaReferencia: "sin efecto", formatoY: U.n1, formatoTooltip: (v) => "×" + U.n2(v),
            series: M.sectores.map((s) => ({ nombre: U.cap(s), color: M.hexSector[s], valores: ef.map((k) => e.efectos_calendario[k][s]) })),
          });
          csv.sectores = () => [["sector", "ingresos_12m", "unidades_12m", "pct_dias_sin_venta", ...ef.map((k) => "efecto_" + k)], ...M.sectores.map((s) => [s, r[s], u[s], e ? e.ceros_por_sector[s] : "", ...ef.map((k) => e.efectos_calendario[k][s])])];
        },
        semanal() {
          const e = M.D.eda;
          if (!e) { cuerpo.innerHTML = `<div class="card vacio">Sin análisis exploratorio.</div>`; return; }
          const dias = ["0", "1", "2", "3", "4", "5", "6"];
          cuerpo.innerHTML = `<div class="card">${cab("Patrón semanal de consumo", "Índice por día de la semana (1,0 = día promedio)", btnCSV("semanal"))}
            <div id="g-sem"></div><div style="margin-top:10px">${G.leyenda(M.sectores.map((s) => ({ nombre: U.cap(s), color: M.hexSector[s], caja: true })))}</div>
            <div class="rejilla g-3 mt">${M.sectores.map((s) => { const v = dias.map((d) => e.perfil_semanal[s][d]); const mx = v.indexOf(Math.max(...v)), mn = v.indexOf(Math.min(...v));
              return `<div class="aviso gris"><div><b>${U.cap(s)}:</b> el ${U.DIA_L[mx].toLowerCase()} vende ×${U.n2(v[mx])} y el ${U.DIA_L[mn].toLowerCase()} ×${U.n2(v[mn])} del promedio.</div></div>`; }).join("")}</div></div>`;
          G.barras(U.$("#g-sem", cuerpo), {
            categorias: ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"], titulosTooltip: U.DIA_L, alto: 280, referencia: 1, formatoY: U.n1, formatoTooltip: (v) => "×" + U.n2(v),
            series: M.sectores.map((s) => ({ nombre: U.cap(s), color: M.hexSector[s], valores: dias.map((d) => e.perfil_semanal[s][d]) })),
          });
          csv.semanal = () => [["dia", ...M.sectores], ...dias.map((d, k) => [U.DIA_L[k], ...M.sectores.map((s) => e.perfil_semanal[s][d])])];
        },
        intermitente() {
          const e = M.D.eda;
          const clases = ["suave", "erratica", "intermitente", "irregular"];
          const ps = M.productos.filter((p) => p.adi != null && p.cv2 != null && isFinite(p.adi) && isFinite(p.cv2));
          cuerpo.innerHTML = `<div class="rejilla g-main-r">
            <div class="card">${cab("Clasificación de Syntetos-Boylan-Croston", "Número de productos por clase y sector", btnCSV("sbc"))}
              <div id="g-sbc"></div><div style="margin-top:10px">${G.leyenda(M.sectores.map((s) => ({ nombre: U.cap(s), color: M.hexSector[s], caja: true })))}</div>
              <div class="texto-2 peq mt">La demanda intermitente predomina en ropa y calzado: muchos días sin venta. Por eso se usan métricas robustas a ceros (WAPE, MASE) en lugar de MAPE, y el modelo TSB.</div></div>
            <div class="card">${cab("Mapa de intermitencia", `ADI (días entre ventas) frente a CV² del tamaño · ${U.n0(ps.length)} productos`)}
              <div id="g-adi"></div>
              <div style="margin-top:8px">${G.leyenda(clases.map((k) => ({ nombre: U.cap(k === "erratica" ? "errática" : k), color: CLASE_COLOR[k], caja: true })))}</div>
              <div class="texto-2 peq">Umbrales: ADI = 1,32 y CV² = 0,49. Eje X en escala logarítmica.</div></div></div>`;
          if (e) G.barras(U.$("#g-sbc", cuerpo), {
            categorias: ["Suave", "Errática", "Intermitente", "Irregular"], alto: 280, formatoY: U.n0, formatoTooltip: (v) => U.n0(v) + " productos",
            series: M.sectores.map((s) => ({ nombre: U.cap(s), color: M.hexSector[s], valores: clases.map((k) => e.sbc[k][s] || 0) })),
          });
          const lg = (v) => Math.log10(Math.max(v, 1));
          G.dispersion(U.$("#g-adi", cuerpo), {
            alto: 300, ejeX: "ADI (log)", ejeY: "CV²", formatoX: (v) => U.n1(Math.pow(10, v)), formatoY: U.n1, refX: lg(1.32), refY: 0.49, limY: [0, Math.min(3, Math.max(...ps.map((p) => p.cv2)) * 1.05)],
            puntos: ps.map((p) => ({ x: lg(p.adi), y: Math.min(p.cv2, 3), r: 3, opacidad: 0.55, color: CLASE_COLOR[p.clase] || "#94A3B8", nombre: p.sku, p })),
            tooltip: (pt) => `<div class="tt-t">${U.esc(pt.p.nombre)}</div><div class="tt-f"><span>${pt.p.sku}</span></div><div class="tt-f"><span>ADI</span><b>${U.n2(pt.p.adi)}</b></div><div class="tt-f"><span>CV²</span><b>${U.n2(pt.p.cv2)}</b></div><div class="tt-f"><span>Clase</span><b>${U.cap(pt.p.clase)}</b></div>`,
          });
          csv.sbc = () => [["sku", "sector", "adi", "cv2", "clase"], ...ps.map((p) => [p.sku, p.sector, p.adi, p.cv2, p.clase])];
        },
        productos() {
          const ps = M.productosFiltrados();
          const ing = (p) => U.suma(p.hist.slice(-90)) * p.precio;
          const top = [...ps].sort((a, b) => ing(b) - ing(a)).slice(0, 10);
          const crec = ps.filter((p) => U.suma(p.hist.slice(-56, -28)) >= 20).map((p) => ({ p, v: U.var(U.suma(p.hist.slice(-28)), U.suma(p.hist.slice(-56, -28))) })).sort((a, b) => b.v - a.v);
          cuerpo.innerHTML = `<div class="rejilla g-2">
            <div class="card">${cab("Top 10 por ingresos", "Últimos 90 días", btnCSV("top"))}${G.barrasH(top.map((p) => ({ etq: `<span class="enlace" data-sku="${p.sku}">${U.esc(p.nombre)}</span>`, v: ing(p), txt: U.cop(ing(p)), color: M.hexSector[p.sector] })))}</div>
            <div class="card">${cab("Mayor crecimiento y mayor caída", "Últimos 28 días vs 28 días previos (productos con ≥ 20 u.)")}
              <div class="texto-2 peq" style="margin-bottom:8px">Crecen</div>${G.barrasH(crec.slice(0, 5).map((x) => ({ etq: `<span class="enlace" data-sku="${x.p.sku}">${U.esc(x.p.nombre)}</span>`, v: x.v, txt: "+" + U.pct(x.v), color: "#16A36A" })))}
              <div class="texto-2 peq" style="margin:16px 0 8px">Caen</div>${G.barrasH(crec.slice(-5).reverse().map((x) => ({ etq: `<span class="enlace" data-sku="${x.p.sku}">${U.esc(x.p.nombre)}</span>`, v: -x.v, txt: U.pct(x.v), color: "#EF4444" })))}</div></div>`;
          csv.top = () => [["sku", "producto", "establecimiento", "ingresos_90d"], ...top.map((p) => [p.sku, p.nombre, M.tiendas[p.tienda].id, Math.round(ing(p))])];
        },
        modelos() {
          const P = M.D.precision;
          if (!P) { cuerpo.innerHTML = `<div class="card vacio">Sin resultados de precisión.</div>`; return; }
          const fr = P.hipotesis.friedman_todos;
          const rangos = Object.entries(fr.rangos).sort((a, b) => a[1] - b[1]);
          const prueba = (nombre, r) => `<tr><td>${U.esc(nombre)}</td><td class="n">${U.n0(r.n)}</td><td class="n">${U.n3(r.mediana_a)}</td><td class="n">${U.n3(r.mediana_b)}</td><td class="n">${U.pct(r.victorias_a, 0)}</td>
            <td class="n">${r.p_holm != null ? (r.p_holm < 0.001 ? "&lt; 0,001" : U.n3(r.p_holm)) : (r.p < 0.001 ? "&lt; 0,001" : U.n3(r.p))}</td>
            <td><span class="etiqueta ${(r.p_holm ?? r.p) < 0.05 ? "e-baja" : "e-gris"}">${(r.p_holm ?? r.p) < 0.05 ? "Significativa" : "No significativa"}</span></td></tr>`;
          cuerpo.innerHTML = `<div class="rejilla g-main-r">
            <div class="card">${cab("Ranking de Friedman", `Rango medio de MASE en ${fr.N} series (menor es mejor) · diferencia crítica ${U.n2(fr.diferencia_critica)}`, btnCSV("friedman"))}
              ${G.barrasH(rangos.map(([m, v], k) => ({ etq: m, v, txt: U.n2(v), color: k === 0 ? "#2563EB" : "#B9CCF7" })))}
              <div class="texto-2 peq mt">Dos modelos cuya diferencia de rango es menor que la diferencia crítica no se distinguen estadísticamente (Nemenyi, α = 0,05).</div></div>
            <div class="card">${cab("Pruebas de hipótesis H2 y H3", "Wilcoxon de una cola sobre MASE por serie, corrección de Holm")}
              <div class="tabla-env"><table class="tabla"><thead><tr><th>Comparación (A &lt; B)</th><th class="n">n</th><th class="n">Mediana A</th><th class="n">Mediana B</th><th class="n">A gana</th><th class="n">p (Holm)</th><th>Resultado</th></tr></thead>
              <tbody><tr><td colspan="7" class="texto-2 peq" style="background:var(--superficie-2)"><b>H2 · variables exógenas</b></td></tr>
              ${Object.entries(P.hipotesis.H2 || {}).map(([k, r]) => prueba(k, r)).join("")}
              <tr><td colspan="7" class="texto-2 peq" style="background:var(--superficie-2)"><b>H3 · híbrido en series volátiles (${P.hipotesis.H3 ? P.hipotesis.H3.n_series_volatiles : "—"} series)</b></td></tr>
              ${Object.entries((P.hipotesis.H3 || {}).pruebas || {}).map(([k, r]) => prueba(k, r)).join("")}</tbody></table></div></div></div>`;
          csv.friedman = () => [["modelo", "rango_medio"], ...rangos];
        },
        simulacion() {
          const S = M.D.simulacion;
          if (!S) { cuerpo.innerHTML = `<div class="card vacio">Sin simulación de inventario.</div>`; return; }
          const filas = Object.entries(S).map(([k, v]) => ({ k, n: M.nombreModelo(k), ...v })).sort((a, b) => a.costo_total - b.costo_total);
          cuerpo.innerHTML = `
            <div class="aviso gris" style="margin-bottom:18px">${U.ic("info", "s")}<div>Simulación de la política (R = ${M.politica.R}, S) con tiempo de entrega de ${M.politica.L} días sobre ${M.D.precision ? M.D.precision.hipotesis.n_series : "las"} series de validación y ${M.D.precision ? M.D.precision.hipotesis.n_origenes : ""} ventanas de ${M.H} días. Todos los modelos usan la misma σ de seguridad: la diferencia proviene solo del pronóstico.</div></div>
            <div class="card">${cab("Costo del inventario por modelo", "Costo de mantener + margen de la venta perdida", btnCSV("sim"))}
              <div id="g-sim"></div><div style="margin-top:10px">${G.leyenda([{ nombre: "Costo de mantener", color: "#2563EB", caja: true }, { nombre: "Venta perdida", color: "#DB2777", caja: true }])}</div></div>
            <div class="card p0 mt"><div class="tabla-env" style="border:0"><table class="tabla"><thead><tr><th>Modelo</th><th class="n">Fill rate</th><th class="n">Días de quiebre</th><th class="n">Inventario medio (u.)</th><th class="n">Cobertura (días)</th><th class="n">Costo mantener</th><th class="n">Venta perdida</th><th class="n">Costo total</th><th class="n">Ahorro vs ingenuo</th></tr></thead>
              <tbody>${filas.map((f, j) => `<tr class="${f.k === M.modeloProduccion ? "destacada" : ""}"><td><b style="font-weight:600">${U.esc(f.n)}</b>${j === 0 ? ` <span class="etiqueta e-baja" style="height:20px">menor costo</span>` : ""}${f.k === M.modeloProduccion ? ` <span class="etiqueta e-media" style="height:20px">producción</span>` : ""}</td>
                <td class="n">${U.pct(f.fill_rate)}</td><td class="n">${U.n2(f.dias_quiebre_prom)}</td><td class="n">${U.n1(f.inventario_prom_unid)}</td><td class="n">${U.n1(f.cobertura_dias)}</td>
                <td class="n">${U.cop(f.costo_mantener)}</td><td class="n">${U.cop(f.costo_venta_perdida)}</td><td class="n"><b>${U.cop(f.costo_total)}</b></td>
                <td class="n"><span style="font-weight:600;color:${f["ahorro_vs_ingenuo_%"] >= 0 ? "#0E7A50" : "var(--rojo-texto)"}">${U.n1(f["ahorro_vs_ingenuo_%"])} %</span></td></tr>`).join("")}</tbody></table></div></div>`;
          G.barras(U.$("#g-sim", cuerpo), {
            categorias: filas.map((f) => f.n.replace("Prophet-LSTM", "P-LSTM").replace("Ingenuo estacional", "Ingenuo")), titulosTooltip: filas.map((f) => f.n), alto: 300, margenInf: 34, formatoY: U.cop,
            series: [{ nombre: "Costo de mantener", color: "#2563EB", valores: filas.map((f) => f.costo_mantener) }, { nombre: "Venta perdida", color: "#DB2777", valores: filas.map((f) => f.costo_venta_perdida) }],
            notaTooltip: (k) => "Costo total " + U.cop(filas[k].costo_total),
          });
          csv.sim = () => [["modelo", "fill_rate", "dias_quiebre", "inventario_medio", "cobertura_dias", "costo_mantener", "costo_venta_perdida", "costo_total", "ahorro_vs_ingenuo_pct"], ...filas.map((f) => [f.n, f.fill_rate, f.dias_quiebre_prom, f.inventario_prom_unid, f.cobertura_dias, Math.round(f.costo_mantener), Math.round(f.costo_venta_perdida), Math.round(f.costo_total), f["ahorro_vs_ingenuo_%"]])];
        },
      };

      const mostrar = (k) => {
        tab = k;
        U.$$(".pestanas button", c).forEach((b) => { const a = b.dataset.tab === k; b.classList.toggle("activo", a); b.setAttribute("aria-selected", a); });
        vistas[k]();
      };
      U.$(".pestanas", c).addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) mostrar(b.dataset.tab); });
      cuerpo.addEventListener("click", (e) => { const b = e.target.closest("[data-csv]"); if (b && csv[b.dataset.csv]) U.descargarCSV(`reporte_${b.dataset.csv}_demandai.csv`, csv[b.dataset.csv]()); });
      U.$("#a-imprimir", c).addEventListener("click", () => window.print());
      mostrar(tab);
    },
  });
})();
