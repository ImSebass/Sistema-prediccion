/* DemandAI — utilidades: formato es-CO, DOM, iconos y estado global. */
(function () {
  "use strict";
  const U = (window.U = {});

  const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf3 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  U.n0 = (v) => (v == null || !isFinite(v) ? "—" : nf0.format(v));
  U.n1 = (v) => (v == null || !isFinite(v) ? "—" : nf1.format(v));
  U.n2 = (v) => (v == null || !isFinite(v) ? "—" : nf2.format(v));
  U.n3 = (v) => (v == null || !isFinite(v) ? "—" : nf3.format(v));
  U.pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : (d === 0 ? nf0 : nf1).format(v * 100) + " %");
  /** Pesos colombianos en forma compacta: $ 245,3 M · $ 18,2 mil */
  U.cop = (v, compacto = true) => {
    if (v == null || !isFinite(v)) return "—";
    const a = Math.abs(v);
    if (!compacto || a < 1e4) return "$ " + nf0.format(v);
    if (a >= 1e8) return "$ " + nf0.format(v / 1e6) + " M";
    if (a >= 1e6) return "$ " + nf1.format(v / 1e6) + " M";
    return "$ " + nf1.format(v / 1e3) + " mil";
  };
  U.compacto = (v) => {
    if (v == null || !isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return nf1.format(v / 1e6) + " M";
    if (a >= 1e4) return nf1.format(v / 1e3) + " mil";
    return nf0.format(v);
  };
  U.seg = (s) => (s == null ? "—" : s < 0.9995 ? nf0.format(s * 1000) + " ms" : nf2.format(s) + " s");

  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  U.MES = MES;
  U.DIA_L = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  /** Fecha ISO (AAAA-MM-DD) → objeto Date en UTC sin desplazamientos de zona */
  U.fecha = (iso) => new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  U.iso = (d) => d.toISOString().slice(0, 10);
  U.sumarDias = (iso, n) => { const d = U.fecha(iso); d.setUTCDate(d.getUTCDate() + n); return U.iso(d); };
  U.fCorta = (iso) => { const d = U.fecha(iso); return d.getUTCDate() + " " + MES[d.getUTCMonth()]; };
  U.fMedia = (iso) => { const d = U.fecha(iso); return d.getUTCDate() + " " + MES[d.getUTCMonth()] + " " + d.getUTCFullYear(); };
  U.fLarga = (iso) => { const d = U.fecha(iso); return DIA[d.getUTCDay()] + " " + d.getUTCDate() + " de " + MES_L[d.getUTCMonth()] + " de " + d.getUTCFullYear(); };
  U.fMes = (iso) => { const d = U.fecha(iso); return MES[d.getUTCMonth()] + " " + String(d.getUTCFullYear()).slice(2); };
  /** Marca de tiempo ISO con zona → "17 nov 2026, 09:49" en hora local */
  U.fHora = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.getDate() + " " + MES[d.getMonth()] + " " + d.getFullYear() + ", " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  U.hace = (ts) => {
    if (!ts) return "—";
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 90) return "hace un momento";
    if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
    const d = Math.round(s / 86400);
    return "hace " + d + (d === 1 ? " día" : " días");
  };

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  U.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  U.ic = (nombre, cls = "") =>
    `<svg class="ic ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.ICONOS || {})[nombre] || ""}</svg>`;
  U.$ = (sel, raiz = document) => raiz.querySelector(sel);
  U.$$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
  U.html = (el, s) => { el.innerHTML = s; return el; };
  U.suma = (a) => { let s = 0; for (const v of a) s += v || 0; return s; };
  U.media = (a) => (a.length ? U.suma(a) / a.length : NaN);
  U.cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  U.var = (a, b) => (b ? (a - b) / b : null);

  /** Tendencia: etiqueta con flecha. `bueno` indica si subir es favorable. */
  U.tendencia = (cambio, bueno = true, texto) => {
    if (cambio == null || !isFinite(cambio)) return "";
    const sube = cambio >= 0;
    const clase = Math.abs(cambio) < 0.005 ? "neutra" : sube === bueno ? "sube" : "baja";
    return `<span class="tendencia ${clase}">${U.ic(sube ? "arrow-up-right" : "arrow-down-right", "xs")}${U.n1(Math.abs(cambio) * 100)} %</span>${texto ? `<span>${texto}</span>` : ""}`;
  };

  U.descargarCSV = (nombre, filas) => {
    const sep = ";";
    const txt = filas.map((f) => f.map((v) => {
      const s = v == null ? "" : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(sep)).join("\r\n");
    const blob = new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    U.toast("Descargado " + nombre);
  };

  U.toast = (msg, icono = "circle-check") => {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = U.ic(icono, "s") + U.esc(msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };

  /* ---------------------------------------------------------- preferencias */
  const CLAVE = "demandai.preferencias.v1";
  U.prefs = (() => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(CLAVE) || "{}"); } catch (e) { p = {}; }
    return p;
  })();
  U.guardarPrefs = () => { try { localStorage.setItem(CLAVE, JSON.stringify(U.prefs)); } catch (e) { /* sin almacenamiento */ } };
})();
