/* Vista: Productos — catálogo, clases de demanda y concentración de ventas */
(function () {
  "use strict";
  const CLASES = {
    suave: { t: "Suave", d: "Ventas casi diarias y estables", c: "ib-verde" },
    erratica: { t: "Errática", d: "Ventas frecuentes, tamaño muy variable", c: "ib-naranja" },
    intermitente: { t: "Intermitente", d: "Muchos días sin venta, tamaño estable", c: "ib-azul" },
    irregular: { t: "Irregular", d: "Muchos días sin venta y tamaño variable", c: "ib-rojo" },
  };

  VISTA("productos", {
    titulo: "Productos", grupo: "Principal",
    render(c) {
      const prods = M.productosFiltrados();
      const v90 = (p) => U.suma(p.hist.slice(-90));
      const ing90 = (p) => v90(p) * p.precio;
      const ingresos = prods.map(ing90).sort((a, b) => b - a);
      const tot = U.suma(ingresos) || 1;
      const top20 = U.suma(ingresos.slice(0, Math.ceil(ingresos.length * 0.2))) / tot;
      const cuenta = (k) => prods.filter((p) => p.clase === k).length;

      c.innerHTML = `
      <section class="rejilla g-5">
        ${C.kpi({ etq: "Productos en catálogo", valor: U.n0(prods.length), ic: "boxes", color: "ib-azul", fuente: `${M.sectores.filter((s) => prods.some((p) => p.sector === s)).map(U.cap).join(", ")}` })}
        ${Object.entries(CLASES).map(([k, v]) => C.kpi({ etq: "Demanda " + v.t.toLowerCase(), valor: U.n0(cuenta(k)), ic: k === "suave" ? "activity" : k === "intermitente" ? "split" : "chart-bar", color: v.c, pie: `<span>${U.pct(cuenta(k) / (prods.length || 1))}</span>`, fuente: v.d })).join("")}
      </section>

      <section class="rejilla g-main mt">
        <div class="card p0">
          <div class="card-h" style="padding:20px 20px 0"><div><h3>Catálogo de productos</h3><div class="sub">Ventas de los últimos 90 días y pronóstico de 28 días</div></div>
            <div class="acciones"><button class="btn peq" id="exp-prod">${U.ic("download", "xs")}Exportar CSV</button></div></div>
          <div class="filtros">
            <div class="buscador">${U.ic("search", "s")}<input class="ctrl" id="pf-q" type="search" placeholder="Buscar producto o código" aria-label="Buscar producto"></div>
            <select class="ctrl" id="pf-sector" aria-label="Categoría"><option value="">Todas las categorías</option>${M.sectores.map((s) => `<option value="${s}">${U.cap(s)}</option>`).join("")}</select>
            <select class="ctrl" id="pf-clase" aria-label="Clase de demanda"><option value="">Todas las clases</option>${Object.entries(CLASES).map(([k, v]) => `<option value="${k}">${v.t}</option>`).join("")}</select>
          </div>
          <div id="t-prod"></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Concentración de ventas</h3><div class="sub">Ingresos de los últimos 90 días</div></div></div>
          <div class="metrica-grande">${U.pct(top20)}</div>
          <div class="texto-2 peq">de los ingresos los genera el 20 % de los productos con más ventas.</div>
          <div class="mt" id="g-pareto"></div>
          <div class="mt" style="border-top:1px solid var(--grilla);padding-top:14px">
            <div class="texto-2 peq" style="margin-bottom:10px">Productos con más ingresos (90 días)</div>
            <div id="top-prod"></div></div>
        </div>
      </section>`;

      const q = U.$("#pf-q", c), fs = U.$("#pf-sector", c), fc = U.$("#pf-clase", c);
      const filtrar = () => { const t = q.value.trim().toLowerCase(); return prods.filter((p) => (!fs.value || p.sector === fs.value) && (!fc.value || p.clase === fc.value) && (!t || p.sku.toLowerCase().includes(t) || p.nombre.toLowerCase().includes(t))); };
      const tabla = C.tabla(U.$("#t-prod", c), {
        filas: filtrar(), orden: "ing", dir: -1, clic: (p) => p.sku,
        columnas: [
          { k: "nombre", t: "Producto", fmt: (p) => `<div class="prod"><b>${U.esc(p.nombre)}</b><span>${p.sku}</span></div>` },
          { k: "sector", t: "Categoría", fmt: (p) => `<span class="chip"><span class="sw" style="background:${M.colorSector[p.sector]}"></span>${U.cap(p.sector)}</span>` },
          { k: "tienda", t: "Estab.", val: (p) => p.tienda, fmt: (p) => `<span title="${M.tiendas[p.tienda].nombre}">${M.tiendas[p.tienda].id}</span>` },
          { k: "precio", t: "Precio", n: true, fmt: (p) => U.cop(p.precio, false) },
          { k: "v90", t: "Ventas 90 d", n: true, val: v90, fmt: (p) => U.n0(v90(p)) },
          { k: "ing", t: "Ingresos 90 d", n: true, val: ing90, fmt: (p) => U.cop(ing90(p)) },
          { k: "pron", t: "Pronóstico 28 d", n: true, val: (p) => p.pron28, fmt: (p) => (p.pron ? U.n0(p.pron28) : "—") },
          { k: "clase", t: "Clase", fmt: (p) => (p.clase ? `<span title="ADI ${U.n2(p.adi)} · CV² ${U.n2(p.cv2)}">${CLASES[p.clase] ? CLASES[p.clase].t : p.clase}</span>` : "—") },
          { k: "estado", t: "Estado", val: (p) => (p.inv ? M.PRIORIDAD[p.inv.prioridad].orden : 9), fmt: (p) => M.etiquetaEstado(p) },
        ],
      });
      const act = () => tabla.actualizar(filtrar());
      q.addEventListener("input", act); fs.addEventListener("change", act); fc.addEventListener("change", act);
      U.$("#exp-prod", c).addEventListener("click", () => U.descargarCSV("productos_demandai.csv", [["sku", "producto", "categoria", "establecimiento", "precio", "ventas_90d", "ingresos_90d", "pronostico_28d", "clase_demanda", "adi", "cv2"],
        ...tabla.datos().map((p) => [p.sku, p.nombre, p.sector, M.tiendas[p.tienda].id, p.precio, v90(p), Math.round(ing90(p)), p.pron ? Math.round(p.pron28) : "", p.clase, p.adi, p.cv2])]));

      // curva de Pareto (porcentaje acumulado de ingresos vs % de productos)
      const pasos = 20, acum = [];
      let s = 0, k = 0;
      for (let j = 1; j <= pasos; j++) { const hasta = Math.round((j / pasos) * ingresos.length); while (k < hasta) s += ingresos[k++]; acum.push(s / tot); }
      G.barras(U.$("#g-pareto", c), {
        categorias: acum.map((_, j) => ((j + 1) * 5) % 20 === 0 ? `${(j + 1) * 5}%` : ""), titulosTooltip: acum.map((_, j) => `${(j + 1) * 5} % de los productos`), alto: 180, max: 1,
        formatoY: (v) => U.n0(v * 100) + " %", formatoTooltip: (v) => U.pct(v) + " de los ingresos",
        series: [{ nombre: "Ingresos acumulados", valores: acum, color: (j) => (j < 4 ? "#2563EB" : "#B9CCF7") }],
      });
      const top = [...prods].sort((a, b) => ing90(b) - ing90(a)).slice(0, 6);
      U.$("#top-prod", c).innerHTML = G.barrasH(top.map((p) => ({ etq: `<span class="enlace" data-sku="${p.sku}">${U.esc(p.nombre)}</span>`, v: ing90(p), txt: U.cop(ing90(p)), color: M.colorSector[p.sector] })));
    },
  });
})();
