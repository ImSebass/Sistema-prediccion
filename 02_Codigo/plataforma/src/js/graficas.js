/* DemandAI — gráficas SVG sin dependencias.
   Reglas: un solo eje Y, líneas de 2 px, barras ≤ 24 px con extremo redondeado,
   grilla recesiva, leyenda para ≥ 2 series, tooltip en toda gráfica. */
(function () {
  "use strict";
  const G = (window.G = {});
  const NS = "http://www.w3.org/2000/svg";

  /** Ticks "bonitos" para un rango [a, b] */
  G.ticks = (a, b, n = 5) => {
    if (!(b > a)) { b = a + 1; }
    const paso0 = (b - a) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(paso0)));
    const f = paso0 / mag;
    const paso = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const out = [];
    let v = Math.floor(a / paso) * paso;
    out.push(+v.toFixed(10));
    while (v < b - paso * 1e-9) { v += paso; out.push(+v.toFixed(10)); }
    return out;
  };

  /** Monta una gráfica que se vuelve a dibujar al cambiar el ancho del contenedor */
  G.montar = (el, dibujar) => {
    if (!el) return;
    el.classList.add("grafica");
    let ancho = 0;
    const pintar = () => {
      const w = Math.round(el.clientWidth);
      if (!w || w === ancho) return;
      ancho = w;
      dibujar(w);
    };
    if (el._ro) el._ro.disconnect();
    el._ro = new ResizeObserver(pintar);
    el._ro.observe(el);
    ancho = 0; pintar();
  };

  function tooltip(el) {
    let t = el.querySelector(".tooltip");
    if (!t) { t = document.createElement("div"); t.className = "tooltip"; el.appendChild(t); }
    return t;
  }
  function moverTooltip(el, t, x, y) {
    const w = el.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
    let left = x + 14; if (left + tw > w) left = x - tw - 14; if (left < 0) left = 0;
    let top = y - th / 2; if (top < 0) top = 0;
    t.style.left = left + "px"; t.style.top = top + "px";
  }
  const fila = (color, nombre, valor) =>
    `<div class="tt-f"><span><i style="background:${color}"></i>${U.esc(nombre)}</span><b>${valor}</b></div>`;

  /* ================================================================ LÍNEAS */
  G.lineas = (el, o) => {
    G.montar(el, (W) => {
      const H = o.alto || 300;
      const m = { t: o.corte != null ? 30 : 16, r: 18, b: 30, l: o.margenIzq || 56 };
      const w = W - m.l - m.r, h = H - m.t - m.b;
      const n = o.x.length;
      const fy = o.formatoY || U.compacto;
      let ymin = Infinity, ymax = -Infinity;
      for (const s of o.series) for (const v of s.valores) if (v != null) { ymin = Math.min(ymin, v); ymax = Math.max(ymax, v); }
      if (o.banda) for (const v of o.banda.sup) if (v != null) ymax = Math.max(ymax, v);
      if (o.desdeCero !== false) ymin = Math.min(0, ymin);
      if (!isFinite(ymax)) { ymin = 0; ymax = 1; }
      const tk = G.ticks(ymin, ymax * 1.06, 4);
      const y0 = tk[0], y1 = tk[tk.length - 1];
      const X = (i) => m.l + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
      const Y = (v) => m.t + h - ((v - y0) / (y1 - y0 || 1)) * h;
      let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${U.esc(o.titulo || "Gráfica de líneas")}">`;
      // zona de pronóstico
      if (o.corte != null && o.corte < n) {
        const xc = X(o.corte) - (n > 1 ? w / (n - 1) / 2 : 0);
        s += `<rect x="${xc}" y="${m.t}" width="${m.l + w - xc}" height="${h}" fill="#EFF4FF" opacity=".75"/>`;
        s += `<line x1="${xc}" x2="${xc}" y1="${m.t}" y2="${m.t + h}" stroke="#93A8C9" stroke-width="1"/>`;
        const et = o.etiquetaCorte || "Pronóstico", cabe = xc + 8 + et.length * 6.6 <= m.l + w;
        s += `<text x="${cabe ? xc + 8 : m.l + w}" y="${m.t - 10}" font-size="11.5" font-weight="600" fill="#1D4ED8" text-anchor="${cabe ? "start" : "end"}">${U.esc(et)}</text>`;
        if (o.etiquetaAntes && cabe) s += `<text x="${xc - 8}" y="${m.t - 10}" font-size="11.5" font-weight="600" fill="#718096" text-anchor="end">${U.esc(o.etiquetaAntes)}</text>`;
      }
      s += `<g class="grilla">`;
      for (const v of tk) s += `<line x1="${m.l}" x2="${m.l + w}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      s += `</g><g class="eje">`;
      for (const v of tk) s += `<text x="${m.l - 10}" y="${Y(v) + 4}" text-anchor="end">${fy(v)}</text>`;
      const nt = n <= (o.ticksX || 7) && w / n >= 40 ? n : Math.max(2, Math.min(o.ticksX || 7, Math.floor(w / 90)));
      const fx = o.formatoX || U.fCorta;
      for (let k = 0; k < nt; k++) {
        const i = Math.round((k / (nt - 1)) * (n - 1));
        s += `<text x="${X(i)}" y="${H - 8}" text-anchor="${k === 0 ? "start" : k === nt - 1 ? "end" : "middle"}">${fx(o.x[i])}</text>`;
      }
      s += `</g><line class="base" x1="${m.l}" x2="${m.l + w}" y1="${Y(Math.max(y0, 0))}" y2="${Y(Math.max(y0, 0))}"/>`;
      if (o.banda) {
        let up = "", dn = "";
        o.banda.sup.forEach((v, i) => { if (v != null) up += (up ? "L" : "M") + X(i) + "," + Y(v); });
        for (let i = o.banda.inf.length - 1; i >= 0; i--) if (o.banda.inf[i] != null) dn += "L" + X(i) + "," + Y(Math.max(o.banda.inf[i], y0));
        if (up) s += `<path d="${up + dn}Z" fill="${o.banda.color || "#2563EB"}" opacity=".12"/>`;
      }
      for (const se of o.series) {
        let d = "", pen = false;
        se.valores.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); pen = true; });
        if (se.area && d) {
          const idx = se.valores.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
          s += `<path d="${d}L${X(idx[idx.length - 1])},${Y(Math.max(y0, 0))}L${X(idx[0])},${Y(Math.max(y0, 0))}Z" fill="${se.color}" opacity=".08"/>`;
        }
        s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.ancho || 2}" stroke-linejoin="round" stroke-linecap="round"${se.guion ? ' stroke-dasharray="5 4"' : ""}${se.opacidad ? ` opacity="${se.opacidad}"` : ""}/>`;
      }
      s += `<g class="cursor" style="display:none"><line y1="${m.t}" y2="${m.t + h}" stroke="#94A3B8" stroke-width="1"/>`;
      o.series.forEach((se) => { s += `<circle r="4.5" fill="${se.color}" stroke="#fff" stroke-width="2"/>`; });
      s += `</g><rect class="zona" x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="transparent"/></svg>`;
      el.innerHTML = s;
      const t = tooltip(el);
      const svg = el.querySelector("svg"), cur = svg.querySelector(".cursor"), zona = svg.querySelector(".zona");
      const mover = (ev) => {
        const r = svg.getBoundingClientRect();
        const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / w) * (n - 1))));
        cur.style.display = "";
        cur.querySelector("line").setAttribute("x1", X(i)); cur.querySelector("line").setAttribute("x2", X(i));
        const cs = cur.querySelectorAll("circle");
        let filas = "";
        o.series.forEach((se, k) => {
          const v = se.valores[i];
          cs[k].style.display = v == null ? "none" : "";
          if (v != null) { cs[k].setAttribute("cx", X(i)); cs[k].setAttribute("cy", Y(v)); }
          if (v != null && !se.sinTooltip) filas += fila(se.color, se.nombre, (o.formatoTooltip || fy)(v));
        });
        if (o.banda && o.banda.sup[i] != null) filas += `<div class="tt-n">Banda: ${(o.formatoTooltip || fy)(Math.max(0, o.banda.inf[i]))} – ${(o.formatoTooltip || fy)(o.banda.sup[i])}</div>`;
        const zonaTxt = o.corte != null ? (i >= o.corte ? `<div class="tt-n">${U.esc(o.etiquetaCorte || "Pronóstico")}</div>` : `<div class="tt-n">${U.esc(o.etiquetaAntes || "Histórico")}</div>`) : "";
        t.innerHTML = `<div class="tt-t">${(o.formatoXTooltip || U.fLarga)(o.x[i])}</div>${filas}${zonaTxt}`;
        t.classList.add("visible");
        moverTooltip(el, t, X(i), Math.min(...o.series.map((se) => (se.valores[i] == null ? Infinity : Y(se.valores[i])))));
      };
      zona.addEventListener("mousemove", mover);
      zona.addEventListener("touchmove", mover, { passive: true });
      zona.addEventListener("mouseleave", () => { cur.style.display = "none"; t.classList.remove("visible"); });
    });
  };

  /* ================================================================ BARRAS (verticales, agrupadas) */
  G.barras = (el, o) => {
    G.montar(el, (W) => {
      const H = o.alto || 260;
      const m = { t: 14, r: 14, b: o.margenInf || 30, l: o.margenIzq || 52 };
      const w = W - m.l - m.r, h = H - m.t - m.b;
      const nc = o.categorias.length, ns = o.series.length;
      const fy = o.formatoY || U.compacto;
      let vmax = 0, vmin = 0;
      for (const se of o.series) for (const v of se.valores) if (v != null) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); }
      if (o.referencia != null) vmax = Math.max(vmax, o.referencia);
      const techo = o.max != null && vmax <= o.max ? o.max : vmax * 1.08;
      const tk = G.ticks(vmin, techo, 4);
      const y0 = tk[0], y1 = tk[tk.length - 1];
      const Y = (v) => m.t + h - ((v - y0) / (y1 - y0 || 1)) * h;
      const banda = w / nc;
      const bw = Math.min(24, (banda * 0.72 - (ns - 1) * 2) / ns);
      const grupo = bw * ns + (ns - 1) * 2;
      let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${U.esc(o.titulo || "Gráfica de barras")}"><g class="grilla">`;
      for (const v of tk) s += `<line x1="${m.l}" x2="${m.l + w}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      s += `</g><g class="eje">`;
      for (const v of tk) s += `<text x="${m.l - 10}" y="${Y(v) + 4}" text-anchor="end">${fy(v)}</text>`;
      const salto = Math.ceil(nc / Math.max(1, Math.floor(w / 46)));
      o.categorias.forEach((c, k) => {
        if (k % salto) return;
        s += `<text x="${m.l + banda * k + banda / 2}" y="${H - (o.margenInf ? o.margenInf - 16 : 8)}" text-anchor="middle">${U.esc(c)}</text>`;
      });
      s += `</g>`;
      const base = Y(Math.max(0, y0));
      o.categorias.forEach((c, k) => {
        const x0 = m.l + banda * k + (banda - grupo) / 2;
        o.series.forEach((se, j) => {
          const v = se.valores[k]; if (v == null) return;
          const x = x0 + j * (bw + 2), y = Y(v), hh = Math.abs(base - y);
          const r = Math.min(4, hh, bw / 2);
          const col = typeof se.color === "function" ? se.color(k, v) : se.color;
          if (v >= 0) s += `<path d="M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${base}Z" fill="${col}"${se.opacidad ? ` opacity="${se.opacidad}"` : ""}/>`;
          else s += `<path d="M${x},${base}V${y - r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y - r}V${base}Z" fill="${col}"/>`;
          if (o.etiquetas) s += `<text x="${x + bw / 2}" y="${v >= 0 ? y - 6 : y + 14}" text-anchor="middle" font-size="11" font-weight="600" fill="#263449">${(o.formatoEtiqueta || fy)(v)}</text>`;
        });
      });
      s += `<line class="base" x1="${m.l}" x2="${m.l + w}" y1="${base}" y2="${base}"/>`;
      if (o.referencia != null) {
        s += `<line x1="${m.l}" x2="${m.l + w}" y1="${Y(o.referencia)}" y2="${Y(o.referencia)}" stroke="#263449" stroke-width="1.5" stroke-dasharray="4 4"/>`;
        if (o.etiquetaReferencia) s += `<text x="${m.l + w}" y="${Y(o.referencia) - 6}" text-anchor="end" font-size="11.5" font-weight="600" fill="#263449">${U.esc(o.etiquetaReferencia)}</text>`;
      }
      o.categorias.forEach((c, k) => { s += `<rect class="hit" data-k="${k}" x="${m.l + banda * k}" y="${m.t}" width="${banda}" height="${h}" fill="transparent"/>`; });
      s += `</svg>`;
      el.innerHTML = s;
      const t = tooltip(el);
      el.querySelectorAll(".hit").forEach((r) => {
        r.addEventListener("mousemove", (ev) => {
          const k = +r.dataset.k;
          let f = "";
          o.series.forEach((se) => { const v = se.valores[k]; if (v != null) f += fila(typeof se.color === "function" ? se.color(k, v) : se.color, se.nombre, (o.formatoTooltip || fy)(v)); });
          t.innerHTML = `<div class="tt-t">${U.esc(o.titulosTooltip ? o.titulosTooltip[k] : o.categorias[k])}</div>${f}${o.notaTooltip ? `<div class="tt-n">${o.notaTooltip(k)}</div>` : ""}`;
          t.classList.add("visible");
          const rr = el.getBoundingClientRect();
          moverTooltip(el, t, ev.clientX - rr.left, ev.clientY - rr.top);
          r.setAttribute("fill", "rgba(37,99,235,.05)");
        });
        r.addEventListener("mouseleave", () => { t.classList.remove("visible"); r.setAttribute("fill", "transparent"); });
      });
    });
  };

  /* ================================================================ DISPERSIÓN */
  G.dispersion = (el, o) => {
    G.montar(el, (W) => {
      const H = o.alto || 300;
      const m = { t: 16, r: 22, b: 44, l: o.margenIzq || 64 };
      const w = W - m.l - m.r, h = H - m.t - m.b;
      const xs = o.puntos.map((p) => p.x), ys = o.puntos.map((p) => p.y);
      const pad = (a, b) => (b - a) * 0.12 || 1;
      let xa = Math.min(...xs), xb = Math.max(...xs), ya = Math.min(...ys), yb = Math.max(...ys);
      if (o.limX) { xa = o.limX[0]; xb = o.limX[1]; } else { xa -= pad(xa, xb); xb += pad(xa, xb); }
      if (o.limY) { ya = o.limY[0]; yb = o.limY[1]; } else { ya -= pad(ya, yb); yb += pad(ya, yb); }
      const tx = G.ticks(xa, xb, 5), ty = G.ticks(ya, yb, 4);
      xa = tx[0]; xb = tx[tx.length - 1]; ya = ty[0]; yb = ty[ty.length - 1];
      const X = (v) => m.l + ((v - xa) / (xb - xa)) * w;
      const Y = (v) => m.t + h - ((v - ya) / (yb - ya)) * h;
      const fx = o.formatoX || U.n2, fy = o.formatoY || U.compacto;
      let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${U.esc(o.titulo || "Dispersión")}"><g class="grilla">`;
      for (const v of ty) s += `<line x1="${m.l}" x2="${m.l + w}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      for (const v of tx) s += `<line y1="${m.t}" y2="${m.t + h}" x1="${X(v)}" x2="${X(v)}"/>`;
      s += `</g><g class="eje">`;
      for (const v of ty) s += `<text x="${m.l - 10}" y="${Y(v) + 4}" text-anchor="end">${fy(v)}</text>`;
      for (const v of tx) s += `<text x="${X(v)}" y="${m.t + h + 18}" text-anchor="middle">${fx(v)}</text>`;
      s += `<text x="${m.l + w / 2}" y="${H - 4}" text-anchor="middle" font-weight="600">${U.esc(o.ejeX || "")}</text>`;
      s += `<text transform="translate(12 ${m.t + h / 2}) rotate(-90)" text-anchor="middle" font-weight="600">${U.esc(o.ejeY || "")}</text></g>`;
      if (o.refX != null) s += `<line x1="${X(o.refX)}" x2="${X(o.refX)}" y1="${m.t}" y2="${m.t + h}" stroke="#94A3B8" stroke-dasharray="4 4"/>`;
      if (o.refY != null) s += `<line y1="${Y(o.refY)}" y2="${Y(o.refY)}" x1="${m.l}" x2="${m.l + w}" stroke="#94A3B8" stroke-dasharray="4 4"/>`;
      o.puntos.forEach((p, k) => {
        s += `<circle class="pt" data-k="${k}" cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r || 6}" fill="${p.color || "#2563EB"}" fill-opacity="${p.opacidad ?? 0.9}" stroke="#fff" stroke-width="2"/>`;
        if (p.etq) s += `<text x="${X(p.x) + (p.etqIzq ? -10 : 10)}" y="${Y(p.y) + 4}" font-size="11.5" font-weight="${p.resaltar ? 700 : 500}" fill="#263449" text-anchor="${p.etqIzq ? "end" : "start"}">${U.esc(p.etq)}</text>`;
      });
      o.puntos.forEach((p, k) => { s += `<circle class="hit" data-k="${k}" cx="${X(p.x)}" cy="${Y(p.y)}" r="${Math.max(12, (p.r || 6) + 6)}" fill="transparent"/>`; });
      s += `</svg>`;
      el.innerHTML = s;
      const t = tooltip(el);
      el.querySelectorAll(".hit").forEach((c) => {
        c.addEventListener("mousemove", (ev) => {
          const p = o.puntos[+c.dataset.k];
          t.innerHTML = o.tooltip ? o.tooltip(p) : `<div class="tt-t">${U.esc(p.etq || "")}</div>${fila(p.color || "#2563EB", o.ejeX, fx(p.x))}${fila(p.color || "#2563EB", o.ejeY, fy(p.y))}`;
          t.classList.add("visible");
          const rr = el.getBoundingClientRect();
          moverTooltip(el, t, ev.clientX - rr.left, ev.clientY - rr.top);
        });
        c.addEventListener("mouseleave", () => t.classList.remove("visible"));
      });
    });
  };

  /* ================================================================ BARRAS HORIZONTALES (HTML) */
  G.barrasH = (filas, o = {}) => {
    const max = o.max || Math.max(...filas.map((f) => f.v), 1e-9);
    return `<div class="barras-h">${filas.map((f) => `
      <div class="f" title="${U.esc(f.titulo || "")}"><span class="e">${f.etq}</span>
        <span class="pista"><i style="width:${Math.max(0, (f.v / max) * 100).toFixed(2)}%;background:${f.color || "var(--azul)"}"></i></span>
        <span class="v">${f.txt}</span></div>`).join("")}</div>`;
  };

  /** Leyenda HTML */
  G.leyenda = (items) => `<div class="leyenda">${items.map((it) => `<span><i class="${it.caja ? "caja" : ""}" style="background:${it.color}${it.guion ? `;background:repeating-linear-gradient(90deg,${it.color} 0 5px,transparent 5px 8px)` : ""}"></i>${U.esc(it.nombre)}</span>`).join("")}</div>`;
})();
