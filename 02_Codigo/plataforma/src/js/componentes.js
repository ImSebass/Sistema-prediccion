/* DemandAI — componentes reutilizables: tabla con orden y paginación, KPI. */
(function () {
  "use strict";
  const C = (window.C = {});

  /** Tarjeta de indicador */
  C.kpi = ({ etq, valor, unidad = "", ic, color, pie = "", fuente = "", titulo = "" }) => `
    <div class="card kpi" title="${U.esc(titulo)}">
      <div class="arriba"><span class="etq">${etq}</span><div class="icono-burbuja ${color}">${U.ic(ic)}</div></div>
      <div class="valor num">${valor}${unidad ? `<small>${unidad}</small>` : ""}</div>
      <div class="pie">${pie}</div>${fuente ? `<div class="fuente">${fuente}</div>` : ""}</div>`;

  /**
   * Tabla con ordenamiento por columna y paginación.
   * columnas: [{ k, t, n (numérica), val(p) para ordenar, fmt(p) html }]
   */
  C.tabla = (el, { columnas, filas, porPagina = 15, orden = null, dir = 1, clic = null, destacar = null, vacio = "Sin resultados" }) => {
    const st = { filas, pag: 0, orden, dir };
    const ordenar = () => {
      if (!st.orden) return st.filas;
      const col = columnas.find((c) => c.k === st.orden);
      const v = col.val || ((p) => p[col.k]);
      return [...st.filas].sort((a, b) => {
        const x = v(a), y = v(b);
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y, "es") : x - y) * st.dir;
      });
    };
    const pintar = () => {
      const datos = ordenar();
      const np = Math.max(1, Math.ceil(datos.length / porPagina));
      st.pag = Math.min(st.pag, np - 1);
      const vis = datos.slice(st.pag * porPagina, (st.pag + 1) * porPagina);
      const pags = [];
      for (let k = 0; k < np; k++) if (k < 2 || k >= np - 2 || Math.abs(k - st.pag) <= 1) pags.push(k); else if (pags[pags.length - 1] !== -1) pags.push(-1);
      el.innerHTML = `<div class="tabla-env"><table class="tabla"><thead><tr>${columnas.map((c) =>
        `<th class="ord${c.n ? " n" : ""}${st.orden === c.k ? " activo" : ""}" data-k="${c.k}" scope="col" aria-sort="${st.orden === c.k ? (st.dir > 0 ? "ascending" : "descending") : "none"}">${c.t}${U.ic(st.orden === c.k ? (st.dir > 0 ? "arrow-up-right" : "arrow-down-right") : "arrow-up-down", "xs flecha")}</th>`).join("")}</tr></thead>
        <tbody>${vis.length ? vis.map((p) => `<tr class="${clic ? "clic" : ""}${destacar && destacar(p) ? " destacada" : ""}" ${clic ? `data-fila="${U.esc(clic(p))}"` : ""}>${columnas.map((c) =>
          `<td class="${c.n ? "n" : ""}">${c.fmt ? c.fmt(p) : U.esc(p[c.k])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columnas.length}" class="vacio">${vacio}</td></tr>`}</tbody></table></div>
        <div class="paginacion"><span>${datos.length ? `${U.n0(st.pag * porPagina + 1)}–${U.n0(Math.min(datos.length, (st.pag + 1) * porPagina))} de ${U.n0(datos.length)}` : "0 resultados"}</span>
          <div class="pags"><button data-p="${st.pag - 1}" ${st.pag === 0 ? "disabled" : ""} aria-label="Anterior">${U.ic("chevron-left", "xs")}</button>
          ${pags.map((k) => (k === -1 ? `<span style="padding:6px">…</span>` : `<button data-p="${k}" class="${k === st.pag ? "activo" : ""}">${k + 1}</button>`)).join("")}
          <button data-p="${st.pag + 1}" ${st.pag >= np - 1 ? "disabled" : ""} aria-label="Siguiente">${U.ic("chevron-right", "xs")}</button></div></div>`;
    };
    el.onclick = (e) => {
      const th = e.target.closest("th[data-k]");
      if (th) { const k = th.dataset.k; if (st.orden === k) st.dir = -st.dir; else { st.orden = k; st.dir = columnas.find((c) => c.k === k).n ? -1 : 1; } pintar(); return; }
      const b = e.target.closest("button[data-p]");
      if (b && !b.disabled) { st.pag = +b.dataset.p; pintar(); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
      const tr = e.target.closest("tr[data-fila]");
      if (tr) abrirProducto(tr.dataset.fila);
    };
    pintar();
    return { actualizar(f) { st.filas = f; st.pag = 0; pintar(); }, datos: () => ordenar() };
  };
})();
