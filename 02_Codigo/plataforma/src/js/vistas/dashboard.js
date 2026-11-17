/* Vista: Inicio / Dashboard */
(function () {
  "use strict";

  function saludo() {
    const h = new Date().getHours();
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  }

  function kpi({ etq, valor, unidad = "", ic, color, pie = "", fuente = "", titulo = "" }) {
    return `<div class="card kpi" title="${U.esc(titulo)}">
      <div class="arriba"><span class="etq">${etq}</span><div class="icono-burbuja ${color}">${U.ic(ic)}</div></div>
      <div class="valor num">${valor}${unidad ? `<small>${unidad}</small>` : ""}</div>
      <div class="pie">${pie}</div>${fuente ? `<div class="fuente">${fuente}</div>` : ""}</div>`;
  }

  VISTA("dashboard", {
    titulo: "Inicio", grupo: "Principal",
    render(c) {
      const g = M.estado_global;
      const per = g.periodo;
      const prods = M.productosFiltrados();
      const conInv = prods.filter((p) => p.inv);
      const ing = M.serieAgregada("ingresos");
      const uni = M.serieAgregada("unidades");
      const ventas = M.sumaVentana(ing, per), ventasPrev = M.sumaVentana(ing, per, per);
      const unid = M.sumaVentana(uni, per);
      const pron = M.pronAgregado(prods), pron28 = U.suma(pron);
      const real28 = M.sumaVentana(uni, 28);
      const bajo = conInv.filter((p) => p.inv.alerta);
      const stockBajo = conInv.filter((p) => p.inv.prioridad !== "baja");
      const agotados = conInv.filter((p) => p.inv.agotado).length;
      const criticas = conInv.filter((p) => p.inv.prioridad === "critica").length;
      const unidSug = U.suma(bajo.map((p) => p.inv.pedido));
      const valorSug = U.suma(bajo.map((p) => p.inv.pedido * p.precio));
      const valorInv = U.suma(conInv.map((p) => p.inv.stock * p.precio));
      const mantener28 = valorInv * M.politica.tasa_mantener_anual / 365 * 28;
      const simP = M.D.simulacion ? M.D.simulacion[M.modeloProduccion] : null;
      const prod = M.meta.produccion;
      const nomPer = { 7: "7 días", 28: "28 días", 90: "90 días", 365: "12 meses" }[per] || per + " días";
      const ambito = g.tienda === "todas" ? "todos los establecimientos" : M.tiendas[g.tienda].nombre;

      c.innerHTML = `
      <section class="bienvenida">
        <div><h2>${saludo()}, bienvenido a DemandAI</h2>
          <p>Panel de inteligencia y predicción de demanda de tu negocio · ${U.esc(ambito)}.</p></div>
        <div class="estado-sync">
          <span class="pastilla"><span class="led"></span>Datos hasta <b>${U.fMedia(M.ultimaFecha)}</b></span>
          <span class="pastilla">${U.ic("refresh-cw", "xs")}Pronóstico actualizado <b>${prod ? U.hace(prod.ejecutado) : "—"}</b></span>
          ${M.meta.datos_sinteticos ? `<span class="pastilla" title="${U.esc(M.meta.nota_datos)}"><span class="led naranja"></span>Datos sintéticos de demostración</span>` : ""}
        </div>
      </section>

      <section class="rejilla g-kpi" aria-label="Indicadores clave">
        ${kpi({ etq: "Ventas totales", valor: U.cop(ventas), ic: "banknote", color: "ib-azul",
          pie: U.tendencia(U.var(ventas, ventasPrev), true, `vs ${nomPer} anteriores`),
          fuente: `${U.n0(unid)} unidades · ${nomPer}`, titulo: "Ingresos = unidades vendidas × precio de lista, POS procesado por el ETL MPI" })}
        ${kpi({ etq: "Demanda pronosticada", valor: U.n0(pron28), unidad: "u.", ic: "sparkles", color: "ib-violeta",
          pie: U.tendencia(U.var(pron28, real28), true, "vs últimos 28 días reales"),
          fuente: `Próximos ${M.H} días · ${prod ? prod.modelo_nombre : ""}` })}
        ${kpi({ etq: "Productos con stock bajo", valor: U.n0(stockBajo.length), unidad: `de ${U.n0(conInv.length)}`, ic: "package-x", color: "ib-naranja",
          pie: `<span class="etiqueta e-critica" style="height:22px">${U.n0(agotados)} agotados</span>`,
          fuente: `Cobertura menor que revisión + entrega (${M.politica.R + M.politica.L} días)` })}
        ${kpi({ etq: "Alertas de reabastecimiento", valor: U.n0(bajo.length), ic: "bell", color: "ib-rojo",
          pie: `<span class="etiqueta e-critica" style="height:22px"><span class="pto"></span>${U.n0(criticas)} críticas</span><span>${U.n0(unidSug)} u. sugeridas</span>`,
          fuente: `Bajo el punto de reorden · pedido ≈ ${U.cop(valorSug)} a precio de venta` })}
        ${kpi({ etq: "Nivel de servicio", valor: simP ? U.pct(simP.fill_rate) : "—", ic: "shield-check", color: "ib-verde",
          pie: simP ? `<span class="tendencia ${simP.fill_rate >= M.politica.nivel_servicio ? "sube" : "baja"}">${U.ic(simP.fill_rate >= M.politica.nivel_servicio ? "circle-check" : "triangle-alert", "xs")}meta ${U.pct(M.politica.nivel_servicio, 0)}</span>` : "",
          fuente: "Fill rate del modelo en producción · simulación de validación (480 series)" })}
        ${kpi({ etq: "Costo estimado de inventario", valor: U.cop(valorInv), ic: "wallet", color: "ib-gris",
          pie: `<span>Mantenerlo ${M.H} días ≈ <b>${U.cop(mantener28)}</b></span>`,
          fuente: `Stock actual × precio · tasa de mantener ${U.pct(M.politica.tasa_mantener_anual, 0)} anual`, titulo: "El stock actual es simulado hasta conectar el POS/ERP" })}
      </section>

      <section class="rejilla g-main mt">
        <div class="card">
          <div class="card-h"><div><h3>Ventas y predicción de demanda</h3><div class="sub" id="sub-principal"></div></div>
            <div class="acciones">
              <label class="sel-ic">${U.ic("store", "s")}<select class="ctrl" id="d-tienda" aria-label="Establecimiento de la gráfica">
                <option value="todas">Todos</option>${M.tiendas.map((t) => `<option value="${t.i}">${t.nombre}</option>`).join("")}</select></label>
              <label class="sel-ic">${U.ic("package", "s")}<input class="ctrl" id="d-prod" list="d-prods" placeholder="Total (todos los productos)" style="width:230px;padding-left:34px" aria-label="Producto"></label>
              <datalist id="d-prods"></datalist>
            </div></div>
          <div id="g-principal"></div>
          <div class="flex entre flex-w mt" style="margin-top:10px">
            ${G.leyenda([{ nombre: "Demanda histórica", color: "var(--real)" }, { nombre: "Demanda pronosticada", color: "var(--azul)" }, { nombre: `Período futuro (${M.H} días)`, color: "#DBE6FE", caja: true }])}
            <span class="texto-2 peq" id="resumen-principal"></span></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Distribución de la demanda</h3><div class="sub">Participación por sector en ventas · ${nomPer}</div></div>
            <div class="segmentado" id="d-medida"><button class="activo" data-m="ingresos">Ventas $</button><button data-m="unidades">Unidades</button></div></div>
          <div id="dist-sector"></div>
        </div>
      </section>

      <section class="rejilla g-main mt">
        <div class="card">
          <div class="card-h"><div><h3>Alertas recientes</h3><div class="sub">Productos que necesitan atención, por prioridad y cobertura</div></div>
            <div class="acciones"><button class="btn peq" data-ir="inventario">Ver inventario${U.ic("arrow-right", "xs")}</button></div></div>
          <div class="tabla-env" style="border-top:0">
            <table class="tabla"><thead><tr><th>Producto</th><th>Est.</th><th class="n">Stock</th><th class="n">P. reorden</th>
              <th class="n">Cobertura</th><th class="n">Reabastecer</th><th>Prioridad</th></tr></thead>
              <tbody id="t-alertas"></tbody></table></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Resumen de actividad</h3><div class="sub">Estado del motor de procesamiento</div></div></div>
          <div class="actividad" id="actividad"></div>
        </div>
      </section>`;

      /* --- gráfica principal --- */
      const selT = U.$("#d-tienda", c), inP = U.$("#d-prod", c), dl = U.$("#d-prods", c);
      selT.value = String(g.tienda);
      const opciones = () => {
        const t = selT.value;
        const lista = M.productosFiltrados(t === "todas" ? "todas" : +t).filter((p) => p.pron).sort((a, b) => b.ventasTotal - a.ventasTotal);
        dl.innerHTML = lista.map((p) => `<option value="${p.sku}">${U.esc(p.nombre)}</option>`).join("");
      };
      const dibujar = () => {
        const t = selT.value === "todas" ? "todas" : +selT.value;
        const p = M.porSku[inP.value.trim().toUpperCase()];
        let hist, fechas, pr, nombre;
        if (p && M.enTienda(p, t)) {
          const n = Math.min(Math.max(per, 28), p.hist.length);
          hist = p.hist.slice(-n); fechas = M.fechas.slice(-n); pr = p.pron || []; nombre = p.nombre + " · " + p.sku;
        } else {
          const n = Math.max(per, 28);
          const u = M.serieAgregada("unidades", M.tiendasSel(t));
          hist = u.slice(-n); fechas = M.fechas.slice(-n); pr = M.pronAgregado(M.productosFiltrados(t)); nombre = "Total de productos";
        }
        const n = hist.length;
        U.$("#sub-principal", c).textContent = `${nombre} · unidades por día · ${t === "todas" ? "todos los establecimientos" : M.tiendas[t].nombre}`;
        const sh = U.suma(hist.slice(-28)), sp = U.suma(pr);
        U.$("#resumen-principal", c).innerHTML = `Próximos ${M.H} días: <b>${U.n0(sp)} u.</b> · últimos 28 días: <b>${U.n0(sh)} u.</b>`;
        G.lineas(U.$("#g-principal", c), {
          x: [...fechas, ...M.fechasPron], alto: 300, corte: n, etiquetaCorte: `Pronóstico ${M.H} días`, etiquetaAntes: "Histórico",
          formatoY: U.compacto, formatoTooltip: (v) => U.n1(v) + " u.",
          series: [
            { nombre: "Demanda histórica", color: "#263449", ancho: n > 120 ? 1.4 : 1.8, valores: [...hist, ...new Array(M.H).fill(null)] },
            { nombre: "Demanda pronosticada", color: "#2563EB", area: true, valores: pr.length ? [...new Array(n - 1).fill(null), hist[n - 1], ...pr] : [] },
          ],
        });
      };
      selT.addEventListener("change", () => { inP.value = ""; opciones(); dibujar(); });
      inP.addEventListener("change", dibujar);
      inP.addEventListener("input", () => { if (!inP.value || M.porSku[inP.value.trim().toUpperCase()]) dibujar(); });
      opciones(); dibujar();

      /* --- distribución por sector --- */
      const pintarDist = (medida) => {
        const r = M.porSector(medida, per);
        const tot = U.suma(Object.values(r)) || 1;
        const fmt = medida === "ingresos" ? U.cop : (v) => U.n0(v) + " u.";
        const prev = M.porSector(medida, per, per);
        U.$("#dist-sector", c).innerHTML = `
          <div class="participacion" role="img" aria-label="Participación por sector">${M.sectores.filter((s) => r[s] > 0).map((s) => `<i style="width:${(r[s] / tot) * 100}%;background:${M.colorSector[s]}" title="${U.cap(s)} ${U.pct(r[s] / tot)}"></i>`).join("")}</div>
          <div class="particip-lista">${M.sectores.map((s) => `<div class="f"><span class="sw" style="background:${M.colorSector[s]}"></span>
            <span><b style="font-weight:600">${U.cap(s)}</b> ${r[s] > 0 && prev[s] > 0 ? U.tendencia(U.var(r[s], prev[s])) : ""}</span>
            <span class="abs">${r[s] > 0 ? fmt(r[s]) : "—"}</span><span class="pct">${U.pct(r[s] / tot)}</span></div>`).join("")}</div>
          <div class="mt" style="border-top:1px solid var(--grilla);padding-top:14px">
            <div class="texto-2 peq" style="margin-bottom:10px">Pronóstico de los próximos ${M.H} días por sector</div>
            ${G.barrasH(M.sectores.map((s) => { const v = U.suma(M.pronAgregado(prods.filter((p) => p.sector === s))); return { etq: U.cap(s), v, txt: U.n0(v) + " u.", color: M.colorSector[s] }; }))}
          </div>
          ${g.tienda !== "todas" ? `<div class="aviso gris mt peq">${U.ic("info", "s")}<div>Cada establecimiento vende un solo sector; seleccione «Todos los establecimientos» para comparar sectores.</div></div>` : ""}`;
      };
      U.$("#d-medida", c).addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        U.$$("#d-medida button", c).forEach((x) => x.classList.toggle("activo", x === b)); pintarDist(b.dataset.m);
      });
      pintarDist("ingresos");

      /* --- alertas --- */
      const top = conInv.filter((p) => p.inv.alerta)
        .sort((a, b) => M.PRIORIDAD[a.inv.prioridad].orden - M.PRIORIDAD[b.inv.prioridad].orden || a.inv.cobertura - b.inv.cobertura || b.inv.pedido * b.precio - a.inv.pedido * a.precio)
        .slice(0, 8);
      U.$("#t-alertas", c).innerHTML = top.length ? top.map((p) => `<tr class="clic" data-sku="${p.sku}">
        <td><div class="prod"><b>${U.esc(p.nombre)}</b><span>${p.sku}</span></div></td><td title="${M.tiendas[p.tienda].nombre}">${M.tiendas[p.tienda].id}</td>
        <td class="n">${U.n0(p.inv.stock)}</td><td class="n">${U.n1(p.inv.pr)}</td><td class="n">${U.n1(p.inv.cobertura)} d</td>
        <td class="n"><b>${U.n0(p.inv.pedido)} u.</b></td><td>${M.etiquetaPrioridad(p.inv.prioridad)}</td></tr>`).join("")
        : `<tr><td colspan="7" class="vacio">Sin alertas para la selección actual.</td></tr>`;

      /* --- actividad --- */
      const etl = M.meta.etl, bm = M.D.benchmark || {};
      const mpiOk = bm.mpi && bm.mpi.equivalencia_max_dif === 0;
      const filaAct = (ic, col, t, d, v) => `<div class="fila"><div class="icono-burbuja ${col}" style="width:34px;height:34px">${U.ic(ic, "s")}</div>
        <div><div class="t">${t}</div><div class="d">${d}</div></div><div class="v">${v}</div></div>`;
      U.$("#actividad", c).innerHTML =
        filaAct("database", "ib-azul", "Último procesamiento de datos", etl ? `ETL MPI · ${etl.procesos} procesos · ${U.compacto(etl.lineas)} líneas POS` : "—", `${U.fHora(M.meta.etl_fecha)}`) +
        filaAct("sparkles", "ib-violeta", "Última ejecución de predicciones", prod ? `${prod.modelo_nombre} · ${prod.dispositivo.toUpperCase()} · ${U.n0(prod.t_entrenamiento_s)} s` : "—", prod ? U.fHora(prod.ejecutado) : "—") +
        filaAct("server", mpiOk ? "ib-verde" : "ib-naranja", "Estado del motor de procesamiento", mpiOk ? "MPI + OpenMP operativos · resultados idénticos al secuencial" : "Sin verificación de equivalencia",
          `<span class="etiqueta ${mpiOk ? "e-baja" : "e-alta"}"><span class="pto"></span>${mpiOk ? "Operativo" : "Revisar"}</span>`) +
        filaAct("boxes", "ib-gris", "Productos analizados", `de ${U.n0(prod ? prod.series_totales : M.productos.length)} SKU (el resto sin historia suficiente)`, `${U.n0(prod ? prod.series_pronosticadas : 0)}`);
    },
  });
})();
