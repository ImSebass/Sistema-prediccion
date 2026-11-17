/* Vista: Predicción de demanda — series temporales, modelos y métricas */
(function () {
  "use strict";
  const COLORES = ["#2563EB", "#DB2777", "#7C3AED"];

  VISTA("prediccion", {
    titulo: "Predicción de demanda", grupo: "Principal",
    render(c, params) {
      const g = M.estado_global;
      const prod = M.meta.produccion || {};
      const B = M.backtest;
      const mods = B ? B.modelos : [];
      const pInicial = params.sku ? M.porSku[params.sku] : null;

      c.innerHTML = `
      <section class="card">
        <div class="card-h"><div><h3>Panel de selección</h3><div class="sub">Elija qué serie analizar y con qué modelo</div></div></div>
        <div class="panel-sel">
          <div class="campo"><label for="p-tienda">Establecimiento</label><select class="ctrl" id="p-tienda"><option value="todas">Todos</option>${M.tiendas.map((t) => `<option value="${t.i}">${t.nombre} · ${U.cap(t.sector)}</option>`).join("")}</select></div>
          <div class="campo"><label for="p-sector">Categoría</label><select class="ctrl" id="p-sector"><option value="">Todas</option>${M.sectores.map((s) => `<option value="${s}">${U.cap(s)}</option>`).join("")}</select></div>
          <div class="campo"><label for="p-prod">Producto</label><input class="ctrl" id="p-prod" list="p-prods" placeholder="Total de la selección"><datalist id="p-prods"></datalist></div>
          <div class="campo"><label for="p-modelo">Modelo de predicción</label><select class="ctrl" id="p-modelo">
            <option value="produccion">${U.esc(prod.modelo_nombre || "Producción")} · producción</option>
            ${B ? `<optgroup label="Validación (backtest desde ${U.fMedia(B.origen)})">${mods.map((m) => `<option value="${m}">${U.esc(M.nombreModelo(m))}</option>`).join("")}</optgroup>` : ""}</select></div>
          <div class="campo"><label for="p-h">Horizonte</label><select class="ctrl" id="p-h"><option value="7">7 días</option><option value="14">14 días</option><option value="28" selected>28 días</option></select></div>
          <button class="btn" id="p-reset" style="align-self:end">${U.ic("refresh-cw", "xs")}Restablecer</button>
        </div>
      </section>

      <section class="rejilla g-main mt">
        <div class="card">
          <div class="card-h"><div><h3 id="p-titulo">Pronóstico</h3><div class="sub" id="p-sub"></div></div>
            <div class="acciones"><div class="segmentado" id="p-capas"><button class="activo" data-c="tend">Tendencia</button><button data-c="nada">Solo datos</button></div></div></div>
          <div id="p-comparar" class="flex flex-w" style="margin-bottom:12px"></div>
          <div id="g-pron"></div>
          <div class="flex entre flex-w" style="margin-top:12px"><div id="p-leyenda"></div><div class="texto-2 peq" id="p-res"></div></div>
          <div id="p-aviso"></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Estacionalidad semanal</h3><div class="sub">Índice por día = venta media del día ÷ media general (últimos 182 días)</div></div></div>
          <div id="g-estac"></div>
          <div class="mt" id="p-tendencia"></div>
        </div>
      </section>

      <h3 class="mt-l" style="font-size:17px">Modelos disponibles</h3>
      <p class="texto-2" style="margin:4px 0 14px">Métricas de validación con origen móvil (${M.D.precision ? M.D.precision.hipotesis.n_series : "—"} series × ${M.D.precision ? M.D.precision.hipotesis.n_origenes : "—"} orígenes × ${M.H} días). Haga clic en un modelo para ver su pronóstico de validación.</p>
      <section class="rejilla g-5" id="p-modelos"></section>

      <section class="card mt">
        <div class="card-h"><div><h3>Métricas de precisión y su impacto en el inventario</h3>
          <div class="sub">El modelo con menor error no es necesariamente el que menos cuesta: se separa el rendimiento predictivo del económico</div></div>
          <div class="acciones"><div class="segmentado" id="p-sec"><button class="activo" data-s="">Global</button>${M.sectores.map((s) => `<button data-s="${s}">${U.cap(s)}</button>`).join("")}</div></div></div>
        <div class="rejilla g-2">
          <div><div class="texto-2 peq" style="margin-bottom:10px"><b style="color:var(--texto)">Precisión</b> · WAPE (menor es mejor)</div><div id="p-wape"></div></div>
          <div><div class="texto-2 peq" style="margin-bottom:4px"><b style="color:var(--texto)">Precisión vs. costo</b> · simulación (R, S) en las mismas series</div><div id="g-costo"></div><div id="p-ley-costo"></div></div>
        </div>
        <div id="p-hallazgo" class="mt"></div>
        <div class="mt" id="t-metricas"></div>
      </section>`;

      const sT = U.$("#p-tienda", c), sS = U.$("#p-sector", c), iP = U.$("#p-prod", c), dl = U.$("#p-prods", c), sM = U.$("#p-modelo", c), sH = U.$("#p-h", c);
      sT.value = String(g.tienda);
      let capa = "tend", comparar = [];
      if (pInicial) { sT.value = String(pInicial.tienda); iP.value = pInicial.sku; }

      const seleccion = () => {
        const t = sT.value === "todas" ? "todas" : +sT.value;
        return M.productos.filter((p) => M.enTienda(p, t) && (!sS.value || p.sector === sS.value));
      };
      const opciones = () => {
        const lista = seleccion().filter((p) => p.pron).sort((a, b) => b.ventasTotal - a.ventasTotal);
        const soloBT = sM.value !== "produccion";
        dl.innerHTML = lista.filter((p) => !soloBT || M.enBacktest(p)).map((p) => `<option value="${p.sku}">${U.esc(p.nombre)}${M.enBacktest(p) ? " · validación" : ""}</option>`).join("");
      };

      const dibujar = () => {
        const h = +sH.value;
        const sel = seleccion();
        const p = M.porSku[iP.value.trim().toUpperCase()];
        const unSku = p && sel.includes(p) ? p : null;
        const modelo = sM.value;
        const ambito = (sT.value === "todas" ? "Todos los establecimientos" : M.tiendas[+sT.value].nombre) + (sS.value ? " · " + U.cap(sS.value) : "");
        const aviso = U.$("#p-aviso", c);
        aviso.innerHTML = "";
        let hist, fechasH, series = [], corte, x, etCorte, resumen = "";
        const nH = 90;

        if (modelo === "produccion") {
          U.$("#p-comparar", c).innerHTML = "";
          hist = unSku ? unSku.hist.slice(-nH) : (() => { const out = new Array(nH).fill(0); sel.forEach((q) => q.hist.slice(-nH).forEach((v, k) => (out[k] += v))); return out; })();
          const pr = unSku ? (unSku.pron || []) : M.pronAgregado(sel);
          fechasH = M.fechas.slice(-nH);
          x = [...fechasH, ...M.fechasPron.slice(0, h)];
          corte = nH; etCorte = `Pronóstico ${h} días`;
          series.push({ nombre: "Ventas históricas", color: "#263449", ancho: 1.6, valores: [...hist, ...new Array(h).fill(null)] });
          if (pr.length) series.push({ nombre: "Predicción · " + (prod.modelo_nombre || ""), color: "#2563EB", area: true, valores: [...new Array(nH - 1).fill(null), hist[nH - 1], ...pr.slice(0, h)] });
          resumen = `Pronóstico ${h} días: <b>${U.n0(U.suma(pr.slice(0, h)))} u.</b> · mismos días previos: <b>${U.n0(U.suma(hist.slice(-h)))} u.</b>`;
          U.$("#p-titulo", c).textContent = "Pronóstico de producción";
          U.$("#p-sub", c).textContent = `${unSku ? unSku.nombre + " · " + unSku.sku : "Total de " + U.n0(sel.length) + " productos"} · ${ambito} · desde ${U.fMedia(M.fechasPron[0])}`;
          if (unSku && !unSku.pron) aviso.innerHTML = `<div class="aviso gris mt">${U.ic("info", "s")}<div>Este producto no tiene historia suficiente para el pronóstico de producción.</div></div>`;
        } else {
          // validación: pronóstico emitido en el último origen y comparado con lo ocurrido
          const t0 = B.origen_idx - M.h0;              // posición del origen en la historia por SKU
          const muestra = unSku ? (M.enBacktest(unSku) ? [unSku] : []) : sel.filter((q) => M.enBacktest(q));
          const largo = unSku ? unSku.hist.length : 182;
          const ini = Math.max(0, t0 - 62);
          const real = new Array(largo - ini).fill(0);
          muestra.forEach((q) => q.hist.slice(ini).forEach((v, k) => (real[k] += v)));
          x = M.fechas.slice(M.h0 + ini);
          corte = t0 - ini; etCorte = "Ventana de validación";
          const elegidos = [modelo, ...comparar.filter((m) => m !== modelo)].slice(0, 3);
          series.push({ nombre: "Ventas reales", color: "#263449", ancho: 1.6, valores: real });
          const resum = [];
          elegidos.forEach((m, j) => {
            const f = new Array(M.H).fill(0);
            muestra.forEach((q) => { const s = M.serieBacktest(q, m); if (s) s.forEach((v, k) => (f[k] += v)); });
            const fh = f.slice(0, h), rh = real.slice(corte, corte + h);
            const wape = U.suma(fh.map((v, k) => Math.abs(v - rh[k]))) / (U.suma(rh) || 1);
            resum.push(`<span class="chip"><span class="sw" style="background:${COLORES[j]}"></span>${U.esc(M.nombreModelo(m))}: WAPE ${U.n3(wape)}</span>`);
            series.push({ nombre: M.nombreModelo(m), color: COLORES[j], valores: [...new Array(corte).fill(null), ...fh, ...new Array(real.length - corte - h).fill(null)] });
          });
          U.$("#p-titulo", c).textContent = "Pronóstico de validación (backtest)";
          U.$("#p-sub", c).textContent = `${unSku ? unSku.nombre + " · " + unSku.sku : U.n0(muestra.length) + " productos de la muestra de validación"} · ${ambito} · emitido el ${U.fMedia(B.origen)}`;
          resumen = resum.join(" ");
          U.$("#p-comparar", c).innerHTML = `<span class="texto-2 peq">Comparar con:</span>` + mods.filter((m) => m !== modelo).map((m) =>
            `<button class="chip" data-cmp="${m}" style="cursor:pointer;border:1px solid ${comparar.includes(m) ? "var(--azul)" : "transparent"};${comparar.includes(m) ? "background:var(--azul-50);color:var(--azul-600)" : ""}">${U.esc(M.nombreModelo(m))}</button>`).join("");
          if (!muestra.length) aviso.innerHTML = `<div class="aviso naranja mt">${U.ic("info", "s")}<div>Este producto no está en la muestra de validación (${U.n0(B.series.length)} series). Elija otro producto o deje el campo vacío para ver el total de la muestra.</div></div>`;
          else aviso.innerHTML = `<div class="aviso gris mt">${U.ic("flask-conical", "s")}<div>Estos pronósticos se emitieron sin conocer la ventana sombreada; las ventas reales permiten medir el error. El pronóstico de producción (hacia el futuro) usa ${U.esc(prod.modelo_nombre || "el modelo en producción")}.</div></div>`;
        }
        if (capa === "tend") {
          const real = series[0].valores;
          const nReal = real.filter((v) => v != null).length;
          const mm = [...M.mediaMovil(real.slice(0, nReal), 28), ...new Array(real.length - nReal).fill(null)];
          series.push({ nombre: "Tendencia (media móvil 28 d)", color: "#F59E0B", ancho: 2, valores: mm, opacidad: 0.95 });
        }
        U.$("#p-res", c).innerHTML = resumen;
        U.$("#p-leyenda", c).innerHTML = G.leyenda(series.map((s) => ({ nombre: s.nombre, color: s.color })));
        G.lineas(U.$("#g-pron", c), { x, alto: 320, corte, etiquetaCorte: etCorte, etiquetaAntes: "Histórico", series, formatoY: U.compacto, formatoTooltip: (v) => U.n1(v) + " u." });

        /* estacionalidad y tendencia de la serie elegida */
        const base = unSku ? unSku.hist : (() => { const out = new Array(182).fill(0); sel.forEach((q) => q.hist.forEach((v, k) => (out[k] += v))); return out; })();
        const perfil = M.perfilSemanal(base, M.fechas[M.h0]);
        G.barras(U.$("#g-estac", c), {
          categorias: ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"], titulosTooltip: U.DIA_L, alto: 220, referencia: 1, etiquetaReferencia: "media = 1",
          formatoY: (v) => U.n1(v), formatoTooltip: U.n2,
          series: [{ nombre: "Índice estacional", valores: perfil, color: (k, v) => (v >= 1 ? "#2563EB" : "#93B4F5") }],
        });
        const ult = U.suma(base.slice(-28)), prev = U.suma(base.slice(-56, -28));
        const maxD = perfil.indexOf(Math.max(...perfil.filter((v) => v != null)));
        U.$("#p-tendencia", c).innerHTML = `<div class="dato-par" style="grid-template-columns:1fr 1fr">
          <div><span>Tendencia (28 d vs 28 d previos)</span><b>${U.tendencia(U.var(ult, prev)) || "—"}</b></div>
          <div><span>Día de mayor demanda</span><b style="font-size:15px">${U.DIA_L[maxD] || "—"} (×${U.n2(perfil[maxD])})</b></div></div>`;
      };

      /* tarjetas de modelos */
      const tarjetas = () => {
        U.$("#p-modelos", c).innerHTML = Object.entries(M.DESCRIPCION_MODELO).map(([k, d]) => {
          const vs = M.variantesModelo[k].map((v) => M.precisionDe(v)).filter(Boolean);
          const f = vs[0];
          const sel = M.variantesModelo[k].includes(sM.value);
          return `<div class="card modelo-card${sel ? " sel" : ""}" data-modelo="${M.variantesModelo[k][0]}" tabindex="0" role="button" aria-pressed="${sel}">
            <div class="cab"><div class="icono-burbuja ib-azul">${U.ic(d.ic)}</div>${M.variantesModelo[k].includes(M.modeloProduccion) ? `<span class="etiqueta e-media">En producción</span>` : `<span class="chip">${U.esc(d.par)}</span>`}</div>
            <h4>${d.t}</h4><p>${d.d}</p>
            ${f ? `<div class="mini-metricas"><div><span>WAPE</span><b>${U.n3(f.WAPE)}</b></div><div><span>MASE</span><b>${U.n2(f.MASE_media)}</b></div>
              <div><span>RMSE</span><b>${U.n2(f.RMSE_media)}</b></div><div><span>Sesgo</span><b>${U.pct(f.Sesgo)}</b></div></div>
              ${vs[1] ? `<div class="texto-2 peq">Con exógenas: WAPE ${U.n3(vs[1].WAPE)} · sesgo ${U.pct(vs[1].Sesgo)}</div>` : ""}` : `<div class="texto-2 peq">Sin métricas</div>`}</div>`;
        }).join("");
      };

      /* métricas y costo */
      const metricas = (sector) => {
        const P = M.D.precision;
        if (!P) { U.$("#t-metricas", c).innerHTML = `<div class="vacio">Sin métricas de precisión.</div>`; return; }
        const filas = (sector ? P.por_sector.filter((f) => f.sector === sector) : P.tabla).map((f) => ({ ...f, clave: M.claveModelo[f.modelo], sim: M.D.simulacion ? M.D.simulacion[M.claveModelo[f.modelo]] : null }));
        const orden = [...filas].sort((a, b) => a.WAPE - b.WAPE);
        U.$("#p-wape", c).innerHTML = G.barrasH(orden.map((f) => ({ etq: f.modelo + (f.clave === M.modeloProduccion ? " ★" : ""), v: f.WAPE, txt: U.n3(f.WAPE), color: f.clave === orden[0].clave ? "#2563EB" : "#93B4F5" })));
        const conSim = P.tabla.map((f) => ({ ...f, clave: M.claveModelo[f.modelo], sim: M.D.simulacion ? M.D.simulacion[M.claveModelo[f.modelo]] : null })).filter((f) => f.sim);
        if (conSim.length) {
          const minW = conSim.reduce((a, b) => (b.WAPE < a.WAPE ? b : a)), minC = conSim.reduce((a, b) => (b.sim.costo_total < a.sim.costo_total ? b : a));
          G.dispersion(U.$("#g-costo", c), {
            alto: 300, ejeX: "WAPE (global)", ejeY: "Costo total simulado", formatoX: U.n2, formatoY: U.cop,
            puntos: conSim.map((f) => ({ x: f.WAPE, y: f.sim.costo_total, nombre: f.modelo,
              etq: [minC.clave, minW.clave, M.modeloProduccion, "ingenuo_s7"].includes(f.clave) ? f.modelo + (f.clave === M.modeloProduccion ? " (producción)" : "") : "", etqIzq: f.WAPE > 0.6,
              color: f.clave === minC.clave ? "#16A36A" : f.clave === minW.clave ? "#2563EB" : "#94A3B8", r: f.clave === minC.clave || f.clave === minW.clave ? 7 : 5, resaltar: f.clave === minC.clave || f.clave === minW.clave })),
            tooltip: (p) => { const f = conSim.find((x) => x.modelo === p.nombre); return `<div class="tt-t">${U.esc(f.modelo)}</div><div class="tt-f"><span>WAPE</span><b>${U.n3(f.WAPE)}</b></div><div class="tt-f"><span>Sesgo</span><b>${U.pct(f.Sesgo)}</b></div><div class="tt-f"><span>Fill rate</span><b>${U.pct(f.sim.fill_rate)}</b></div><div class="tt-f"><span>Costo mantener</span><b>${U.cop(f.sim.costo_mantener)}</b></div><div class="tt-f"><span>Venta perdida</span><b>${U.cop(f.sim.costo_venta_perdida)}</b></div><div class="tt-f"><span>Costo total</span><b>${U.cop(f.sim.costo_total)}</b></div>`; },
          });
          U.$("#p-ley-costo", c).innerHTML = (`<div style="margin-top:6px">${G.leyenda([{ nombre: "Menor error", color: "#2563EB", caja: true }, { nombre: "Menor costo", color: "#16A36A", caja: true }, { nombre: "Otros modelos (pase el cursor)", color: "#94A3B8", caja: true }])}</div>`);
          U.$("#p-hallazgo", c).innerHTML = minW.clave !== minC.clave ? `<div class="aviso">${U.ic("target", "s")}<div><b>Menor error ≠ menor costo.</b>
            ${U.esc(minW.modelo)} logra el menor WAPE (${U.n3(minW.WAPE)}), pero su sesgo de ${U.pct(minW.Sesgo)} (subpronóstico) eleva la venta perdida y su costo simulado es ${U.cop(minW.sim.costo_total)}.
            ${U.esc(minC.modelo)} tiene el menor costo total (${U.cop(minC.sim.costo_total)}, ${U.n1(minC.sim["ahorro_vs_ingenuo_%"])} % menos que el ingenuo) con WAPE ${U.n3(minC.WAPE)}.
            Para decidir qué modelo opera el inventario conviene usar el costo, no solo el error.</div></div>` : "";
        }
        U.$("#t-metricas", c).innerHTML = `<div class="tabla-env" style="border:1px solid var(--borde);border-radius:12px"><table class="tabla"><thead>
          <tr><th rowspan="2">Modelo</th><th colspan="4" style="text-align:center;border-bottom:1px solid var(--borde)">Rendimiento predictivo${sector ? " · " + U.cap(sector) : ""}</th><th colspan="4" style="text-align:center;border-bottom:1px solid var(--borde);background:#F2FBF7">Impacto económico (global)</th></tr>
          <tr><th class="n">WAPE</th><th class="n">MASE</th><th class="n">RMSE</th><th class="n">Sesgo rel.</th><th class="n" style="background:#F2FBF7">Fill rate</th><th class="n" style="background:#F2FBF7">Días de quiebre</th><th class="n" style="background:#F2FBF7">Costo total</th><th class="n" style="background:#F2FBF7">Ahorro vs ingenuo</th></tr></thead>
          <tbody>${orden.map((f) => `<tr class="${f.clave === M.modeloProduccion ? "destacada" : ""}"><td><b style="font-weight:600">${U.esc(f.modelo)}</b>${f.clave === M.modeloProduccion ? ` <span class="etiqueta e-media" style="height:20px">producción</span>` : ""}</td>
            <td class="n">${U.n3(f.WAPE)}</td><td class="n">${U.n3(f.MASE_media)}</td><td class="n">${U.n2(f.RMSE_media)}</td><td class="n">${U.pct(f.Sesgo)}</td>
            <td class="n">${f.sim ? U.pct(f.sim.fill_rate) : "—"}</td><td class="n">${f.sim ? U.n2(f.sim.dias_quiebre_prom) : "—"}</td><td class="n">${f.sim ? U.cop(f.sim.costo_total) : "—"}</td>
            <td class="n">${f.sim ? `<span style="color:${f.sim["ahorro_vs_ingenuo_%"] >= 0 ? "#0E7A50" : "var(--rojo-texto)"};font-weight:600">${U.n1(f.sim["ahorro_vs_ingenuo_%"])} %</span>` : "—"}</td></tr>`).join("")}</tbody></table></div>
          <div class="texto-2 peq" style="margin-top:8px">WAPE = Σ|error| / Σ demanda · MASE frente al ingenuo estacional (s = 7) · sesgo relativo = Σ error / Σ demanda (negativo = subpronóstico).
          Costos: mantener ${U.pct(M.politica.tasa_mantener_anual, 0)} anual del precio y margen perdido ${U.pct(M.politica.margen, 0)} por unidad no vendida.</div>`;
      };

      /* eventos */
      sT.addEventListener("change", () => { iP.value = ""; opciones(); dibujar(); });
      sS.addEventListener("change", () => { iP.value = ""; opciones(); dibujar(); });
      sH.addEventListener("change", dibujar);
      sM.addEventListener("change", () => { comparar = []; opciones(); tarjetas(); dibujar(); });
      iP.addEventListener("change", dibujar);
      iP.addEventListener("input", () => { if (!iP.value || M.porSku[iP.value.trim().toUpperCase()]) dibujar(); });
      U.$("#p-reset", c).addEventListener("click", () => { sT.value = "todas"; sS.value = ""; iP.value = ""; sM.value = "produccion"; sH.value = "28"; comparar = []; opciones(); tarjetas(); dibujar(); });
      U.$("#p-capas", c).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; capa = b.dataset.c; U.$$("#p-capas button", c).forEach((x) => x.classList.toggle("activo", x === b)); dibujar(); });
      U.$("#p-comparar", c).addEventListener("click", (e) => {
        const b = e.target.closest("[data-cmp]"); if (!b) return;
        const m = b.dataset.cmp; comparar = comparar.includes(m) ? comparar.filter((x) => x !== m) : [...comparar, m].slice(-2); dibujar();
      });
      const elegirModelo = (e) => { const k = e.target.closest("[data-modelo]"); if (!k || !B) return; sM.value = k.dataset.modelo; comparar = []; opciones(); tarjetas(); dibujar(); U.$("#g-pron", c).scrollIntoView({ behavior: "smooth", block: "center" }); };
      U.$("#p-modelos", c).addEventListener("click", elegirModelo);
      U.$("#p-modelos", c).addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegirModelo(e); } });
      U.$("#p-sec", c).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; U.$$("#p-sec button", c).forEach((x) => x.classList.toggle("activo", x === b)); metricas(b.dataset.s); });
      opciones(); tarjetas(); dibujar(); metricas("");
    },
  });
})();
