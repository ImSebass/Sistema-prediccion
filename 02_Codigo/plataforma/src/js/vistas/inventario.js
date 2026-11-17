/* Vista: Inventario — supervisión de existencias y recomendaciones de reabastecimiento */
(function () {
  "use strict";

  VISTA("inventario", {
    titulo: "Inventario", grupo: "Principal",
    render(c, params) {
      const g = M.estado_global;
      const base = M.productosFiltrados().filter((p) => p.inv);
      const pol = M.politica;
      const disp = base.filter((p) => p.inv.stock > 0).length;
      const bajo = base.filter((p) => p.inv.prioridad !== "baja").length;
      const agot = base.filter((p) => p.inv.agotado).length;
      const alertas = base.filter((p) => p.inv.alerta);
      const valorPedido = U.suma(alertas.map((p) => p.inv.pedido * p.precio));

      c.innerHTML = `
      <div class="aviso gris" style="margin-bottom:18px">${U.ic("info", "s")}<div>
        Política de inventario <b>(R, S)</b>: revisión cada <b>${pol.R} días</b>, tiempo de entrega <b>${pol.L} días</b>, nivel de servicio objetivo <b>${U.pct(pol.nivel_servicio, 0)}</b> (z = ${U.n2(pol.z)}).
        Pronóstico: ${M.meta.produccion ? M.meta.produccion.modelo_nombre : "—"}. ${M.meta.produccion ? "Stock actual " + U.esc(M.meta.produccion.inventario_actual) + "." : ""}</div></div>

      <section class="rejilla g-5">
        ${C.kpi({ etq: "Total de productos", valor: U.n0(base.length), ic: "boxes", color: "ib-azul", fuente: "SKU con pronóstico de producción" })}
        ${C.kpi({ etq: "Productos disponibles", valor: U.n0(disp), ic: "package-check", color: "ib-verde", pie: `<span>${U.pct(disp / (base.length || 1))} del catálogo</span>`, fuente: "Con existencias > 0" })}
        ${C.kpi({ etq: "Con stock bajo", valor: U.n0(bajo), ic: "package-x", color: "ib-naranja", fuente: `Cobertura < ${pol.R + pol.L} días` })}
        ${C.kpi({ etq: "Productos agotados", valor: U.n0(agot), ic: "octagon-alert", color: "ib-rojo", fuente: "Existencias = 0" })}
        ${C.kpi({ etq: "Alertas pendientes", valor: U.n0(alertas.length), ic: "bell", color: "ib-violeta", pie: `<span>Pedido ≈ <b>${U.cop(valorPedido)}</b></span>`, fuente: "Bajo el punto de reorden" })}
      </section>

      <section class="card p0 mt">
        <div class="card-h" style="padding:20px 20px 0"><div><h3>Inventario por producto</h3><div class="sub">Haga clic en una fila para ver el detalle y el pronóstico</div></div>
          <div class="acciones"><button class="btn peq" id="exp-inv">${U.ic("download", "xs")}Exportar CSV</button></div></div>
        <div class="filtros">
          <div class="buscador">${U.ic("search", "s")}<input class="ctrl" id="f-q" type="search" placeholder="Buscar producto o código" aria-label="Buscar en inventario"></div>
          <select class="ctrl" id="f-sector" aria-label="Categoría"><option value="">Todas las categorías</option>${M.sectores.map((s) => `<option value="${s}">${U.cap(s)}</option>`).join("")}</select>
          <select class="ctrl" id="f-tienda" aria-label="Establecimiento"><option value="todas">Todos los establecimientos</option>${M.tiendas.map((t) => `<option value="${t.i}">${t.nombre}</option>`).join("")}</select>
          <select class="ctrl" id="f-prio" aria-label="Prioridad"><option value="">Todas las prioridades</option>${Object.entries(M.PRIORIDAD).map(([k, v]) => `<option value="${k}">${v.txt}</option>`).join("")}</select>
          <span class="texto-2 peq" id="f-cuenta" style="margin-left:auto"></span>
        </div>
        <div id="t-inv"></div>
      </section>

      <section class="rejilla g-main mt">
        <div class="card">
          <div class="card-h"><div><h3>Recomendaciones de reabastecimiento</h3>
            <div class="sub">Qué pedir, por qué y cuánto · generado por el sistema de predicción y la política (R, S)</div></div>
            <div class="acciones"><button class="btn prim peq" id="exp-ped">${U.ic("file-down", "xs")}Descargar pedido</button></div></div>
          <div id="recom"></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Pedido sugerido por establecimiento</h3><div class="sub">Unidades y valor a precio de venta</div></div></div>
          <div id="ped-tienda"></div>
          <div class="mt" style="border-top:1px solid var(--grilla);padding-top:14px">
            <div class="texto-2 peq" style="margin-bottom:10px">Cómo se calcula</div>
            <div class="peq" style="line-height:1.65">
              <b>Punto de reorden</b> = demanda pronosticada de ${pol.L} días + z·σ·√${pol.L}<br>
              <b>Nivel objetivo S</b> = demanda de ${pol.R + pol.L} días + z·σ·√${pol.R + pol.L}<br>
              <b>Cantidad sugerida</b> = S − stock, si stock &lt; punto de reorden</div></div>
        </div>
      </section>`;

      const fq = U.$("#f-q", c), fs = U.$("#f-sector", c), ft = U.$("#f-tienda", c), fp = U.$("#f-prio", c);
      ft.value = String(g.tienda);
      if (params.prioridad) fp.value = params.prioridad;
      if (params.q) fq.value = params.q;
      const todos = M.productos.filter((p) => p.inv);
      const filtrar = () => {
        const q = fq.value.trim().toLowerCase();
        return todos.filter((p) => (ft.value === "todas" || p.tienda === +ft.value) && (!fs.value || p.sector === fs.value) &&
          (!fp.value || p.inv.prioridad === fp.value) && (!q || p.sku.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q)));
      };
      // prioridad → cobertura → valor del pedido (mayor primero)
      const ordenPrio = (p) => M.PRIORIDAD[p.inv.prioridad].orden * 1e12 + p.inv.cobertura * 1e9 - Math.min(p.inv.pedido * p.precio, 1e9 - 1);
      const tabla = C.tabla(U.$("#t-inv", c), {
        filas: filtrar(), orden: "prioridad", dir: 1, clic: (p) => p.sku,
        columnas: [
          { k: "nombre", t: "Producto", fmt: (p) => `<b style="font-weight:600">${U.esc(p.nombre)}</b>` },
          { k: "sku", t: "Código", fmt: (p) => `<span class="num">${p.sku}</span>` },
          { k: "sector", t: "Categoría", fmt: (p) => `<span class="chip"><span class="sw" style="background:${M.colorSector[p.sector]}"></span>${U.cap(p.sector)}</span>` },
          { k: "tienda", t: "Estab.", val: (p) => p.tienda, fmt: (p) => `<span title="${M.tiendas[p.tienda].nombre}">${M.tiendas[p.tienda].id}</span>` },
          { k: "stock", t: "Stock", n: true, val: (p) => p.inv.stock, fmt: (p) => U.n0(p.inv.stock) },
          { k: "pr", t: "P. reorden", n: true, val: (p) => p.inv.pr, fmt: (p) => U.n1(p.inv.pr) },
          { k: "cob", t: "Cobertura", n: true, val: (p) => p.inv.cobertura, fmt: (p) => `${U.n1(p.inv.cobertura)} d` },
          { k: "pron", t: "Demanda 28 d", n: true, val: (p) => p.pron28, fmt: (p) => U.n0(p.pron28) },
          { k: "pedido", t: "Sugerido", n: true, val: (p) => p.inv.pedido, fmt: (p) => (p.inv.pedido ? `<b>${U.n0(p.inv.pedido)}</b>` : `<span class="texto-2">—</span>`) },
          { k: "prioridad", t: "Estado", val: ordenPrio, fmt: (p) => M.etiquetaEstado(p) },
        ],
      });
      const actualizar = () => { const f = filtrar(); tabla.actualizar(f); U.$("#f-cuenta", c).textContent = `${U.n0(f.length)} productos`; };
      [fs, ft, fp].forEach((s) => s.addEventListener("change", actualizar));
      fq.addEventListener("input", actualizar);
      actualizar();

      U.$("#exp-inv", c).addEventListener("click", () => {
        U.descargarCSV("inventario_demandai.csv", [["sku", "producto", "categoria", "establecimiento", "stock", "punto_reorden", "nivel_objetivo", "cobertura_dias", "demanda_28d", "cantidad_sugerida", "prioridad", "estado"],
          ...tabla.datos().map((p) => [p.sku, p.nombre, p.sector, M.tiendas[p.tienda].id, p.inv.stock, p.inv.pr, p.inv.s, p.inv.cobertura, Math.round(p.pron28), p.inv.pedido, p.inv.prioridad, M.estado(p).txt])]);
      });

      /* recomendaciones */
      const rec = alertas.sort((a, b) => M.PRIORIDAD[a.inv.prioridad].orden - M.PRIORIDAD[b.inv.prioridad].orden || a.inv.cobertura - b.inv.cobertura || b.inv.pedido * b.precio - a.inv.pedido * a.precio);
      const ver = (n) => {
        U.$("#recom", c).innerHTML = (rec.length ? rec.slice(0, n).map((p) => `<div class="razon clic" data-sku="${p.sku}" style="cursor:pointer">
            <div class="icono-burbuja ${p.inv.prioridad === "critica" ? "ib-rojo" : "ib-naranja"}" style="width:34px;height:34px">${U.ic(p.inv.prioridad === "critica" ? "octagon-alert" : "triangle-alert", "s")}</div>
            <div class="cnt"><div class="t">${U.esc(p.nombre)} <span class="texto-2 peq">· ${p.sku} · ${M.tiendas[p.tienda].nombre}</span></div>
              <div class="d">${U.esc(M.razon(p))}</div></div>
            <div class="q"><b>${U.n0(p.inv.pedido)} u.</b><span>${U.cop(p.inv.pedido * p.precio)}</span></div></div>`).join("")
          : `<div class="vacio">No hay productos por debajo del punto de reorden.</div>`) +
          (rec.length > n ? `<div style="text-align:center;margin-top:12px"><button class="btn peq" id="mas-rec">Ver ${Math.min(10, rec.length - n)} más de ${U.n0(rec.length - n)} restantes</button></div>` : "");
        const b = U.$("#mas-rec", c); if (b) b.addEventListener("click", () => ver(n + 10));
      };
      ver(8);
      U.$("#exp-ped", c).addEventListener("click", () => {
        U.descargarCSV("pedido_sugerido_" + M.fechasPron[0] + ".csv", [["sku", "producto", "establecimiento", "cantidad", "valor_precio_venta", "prioridad", "motivo"],
          ...rec.map((p) => [p.sku, p.nombre, M.tiendas[p.tienda].id, p.inv.pedido, Math.round(p.inv.pedido * p.precio), p.inv.prioridad, M.razon(p)])]);
      });

      const porT = M.tiendasSel().map((t) => {
        const r = rec.filter((p) => p.tienda === t);
        return { t, u: U.suma(r.map((p) => p.inv.pedido)), v: U.suma(r.map((p) => p.inv.pedido * p.precio)), n: r.length };
      });
      U.$("#ped-tienda", c).innerHTML = G.barrasH(porT.map((x) => ({ etq: `${M.tiendas[x.t].nombre}`, v: x.v, txt: U.cop(x.v), color: M.colorSector[M.tiendas[x.t].sector], titulo: `${x.n} productos · ${U.n0(x.u)} u.` }))) +
        `<div class="mt peq texto-2">${U.n0(U.suma(porT.map((x) => x.u)))} unidades en ${U.n0(rec.length)} productos.</div>`;
    },
  });
})();
