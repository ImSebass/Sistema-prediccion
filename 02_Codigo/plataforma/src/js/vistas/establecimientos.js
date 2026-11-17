/* Vista: Establecimientos — comparación entre tiendas y detalle */
(function () {
  "use strict";

  VISTA("establecimientos", {
    titulo: "Establecimientos", grupo: "Principal",
    render(c, params) {
      const per = M.estado_global.periodo;
      const nomPer = { 7: "7 días", 28: "28 días", 90: "90 días", 365: "12 meses" }[per];
      const datos = M.tiendas.map((t) => {
        const ps = M.productos.filter((p) => p.tienda === t.i);
        const conInv = ps.filter((p) => p.inv);
        const ing = M.D.agregados.ingresos[t.i], uni = M.D.agregados.unidades[t.i];
        return {
          t, ps, ventas: M.sumaVentana(ing, per), prev: M.sumaVentana(ing, per, per), unidades: M.sumaVentana(uni, per),
          pron: U.suma(M.pronAgregado(ps)), real28: M.sumaVentana(uni, 28),
          alertas: conInv.filter((p) => p.inv.alerta).length, criticas: conInv.filter((p) => p.inv.prioridad === "critica").length,
          valorInv: U.suma(conInv.map((p) => p.inv.stock * p.precio)),
        };
      });
      let sel = params.t != null ? +params.t : (M.estado_global.tienda === "todas" ? 0 : +M.estado_global.tienda);

      c.innerHTML = `
      <section class="rejilla g-5" id="e-cards">${datos.map((d) => `
        <div class="card tienda-card" data-t="${d.t.i}" tabindex="0" role="button" aria-pressed="${d.t.i === sel}" style="${d.t.i === sel ? "border-color:var(--azul);box-shadow:0 0 0 3px var(--azul-100)" : ""}">
          <div class="cab"><div><h4>${d.t.nombre}</h4><div class="texto-2 peq"><span class="chip" style="height:20px"><span class="sw" style="background:${M.colorSector[d.t.sector]}"></span>${U.cap(d.t.sector)}</span> ${d.t.id} · ${d.t.productos} SKU</div></div></div>
          <div><div class="texto-2 peq">Ventas · ${nomPer}</div><div class="flex" style="gap:8px"><span class="metrica-grande" style="font-size:22px">${U.cop(d.ventas)}</span>${U.tendencia(U.var(d.ventas, d.prev))}</div></div>
          <div class="stats"><div><span>Pronóstico 28 d</span><b>${U.compacto(d.pron)}</b></div><div><span>Alertas</span><b>${d.alertas}</b></div><div><span>Críticas</span><b style="color:var(--rojo-texto)">${d.criticas}</b></div></div>
        </div>`).join("")}</section>

      <section class="rejilla g-main mt">
        <div class="card">
          <div class="card-h"><div><h3 id="e-titulo"></h3><div class="sub">Unidades por día: histórico y pronóstico de ${M.H} días</div></div>
            <div class="acciones"><button class="btn peq" id="e-filtrar">${U.ic("filter", "xs")}Filtrar el panel por este establecimiento</button></div></div>
          <div id="g-tienda"></div>
          <div style="margin-top:10px">${G.leyenda([{ nombre: "Ventas reales", color: "var(--real)" }, { nombre: "Pronóstico", color: "var(--azul)" }])}</div>
          <div class="dato-par mt" id="e-datos"></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Comparación de establecimientos</h3><div class="sub">Ventas de ${nomPer} a precio de venta</div></div></div>
          ${G.barrasH(datos.map((d) => ({ etq: d.t.nombre, v: d.ventas, txt: U.cop(d.ventas), color: M.colorSector[d.t.sector] })))}
          <div class="mt" style="border-top:1px solid var(--grilla);padding-top:14px">
            <div class="texto-2 peq" style="margin-bottom:10px">Alertas de reabastecimiento</div>
            ${G.barrasH(datos.map((d) => ({ etq: d.t.nombre, v: d.alertas, txt: `${d.alertas} (${d.criticas} crít.)`, color: "#F59E0B" })))}</div>
          <div class="mt">${G.leyenda(M.sectores.map((s) => ({ nombre: U.cap(s), color: M.colorSector[s], caja: true })))}</div>
        </div>
      </section>`;

      const pintar = () => {
        const d = datos[sel];
        U.$$("#e-cards .tienda-card", c).forEach((el) => {
          const a = +el.dataset.t === sel; el.setAttribute("aria-pressed", a);
          el.style.borderColor = a ? "var(--azul)" : ""; el.style.boxShadow = a ? "0 0 0 3px var(--azul-100)" : "";
        });
        U.$("#e-titulo", c).textContent = `${d.t.nombre} · ${U.cap(d.t.sector)}`;
        const n = Math.max(per, 28);
        const u = M.D.agregados.unidades[d.t.i].slice(-n);
        const pr = M.pronAgregado(d.ps);
        G.lineas(U.$("#g-tienda", c), {
          x: [...M.fechas.slice(-n), ...M.fechasPron], alto: 280, corte: n, etiquetaCorte: "Pronóstico", etiquetaAntes: "Histórico", formatoY: U.compacto, formatoTooltip: (v) => U.n0(v) + " u.",
          series: [{ nombre: "Ventas reales", color: "#263449", ancho: n > 120 ? 1.4 : 1.8, valores: [...u, ...new Array(M.H).fill(null)] },
            { nombre: "Pronóstico", color: "#2563EB", area: true, valores: [...new Array(n - 1).fill(null), u[n - 1], ...pr] }],
        });
        U.$("#e-datos", c).innerHTML = `<div><span>Unidades · ${nomPer}</span><b>${U.n0(d.unidades)}</b></div>
          <div><span>Pronóstico vs 28 d reales</span><b>${U.tendencia(U.var(d.pron, d.real28)) || "—"}</b></div>
          <div><span>Inventario valorizado</span><b>${U.cop(d.valorInv)}</b></div>
          <div><span>Productos</span><b>${U.n0(d.ps.length)}</b></div>`;
      };
      U.$("#e-cards", c).addEventListener("click", (e) => { const k = e.target.closest("[data-t]"); if (k) { sel = +k.dataset.t; pintar(); } });
      U.$("#e-cards", c).addEventListener("keydown", (e) => { const k = e.target.closest("[data-t]"); if (k && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sel = +k.dataset.t; pintar(); } });
      U.$("#e-filtrar", c).addEventListener("click", () => {
        M.estado_global.tienda = sel; U.prefs.tienda = sel; U.guardarPrefs();
        U.$("#sel-tienda").value = String(sel); U.toast("Panel filtrado por " + M.tiendas[sel].nombre, "filter"); ir("dashboard");
      });
      pintar();
    },
  });
})();
