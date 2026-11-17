/* DemandAI — estructura de la aplicación: barra lateral, barra superior,
   enrutador por hash, búsqueda global, notificaciones y detalle de producto. */
(function () {
  "use strict";
  const VISTAS = (window.VISTAS = window.VISTAS || {});
  const NAV = [
    { ruta: "dashboard", t: "Inicio", ic: "layout-dashboard" },
    { ruta: "inventario", t: "Inventario", ic: "package" },
    { ruta: "prediccion", t: "Predicción de demanda", ic: "trending-up" },
    { ruta: "productos", t: "Productos", ic: "boxes" },
    { ruta: "establecimientos", t: "Establecimientos", ic: "store" },
    { ruta: "analisis", t: "Análisis y reportes", ic: "chart-column" },
    { ruta: "rendimiento", t: "Rendimiento del sistema", ic: "cpu" },
  ];
  const CONF = [
    { ruta: "configuracion", t: "Configuración", ic: "settings" },
    { ruta: "perfil", t: "Perfil de usuario", ic: "user" },
  ];
  const PERIODOS = [[7, "Últimos 7 días"], [28, "Últimos 28 días"], [90, "Últimos 90 días"], [365, "Últimos 12 meses"]];

  const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 17l5-5 4 3 6-7"/><path d="M14 8h4v4" /><path d="M3 21h18" opacity=".55"/></svg>`;

  function navItem(n, activa, extra = "") {
    return `<button class="nav-item${activa ? " activo" : ""}" data-ruta="${n.ruta}" title="${U.esc(n.t)}" ${activa ? 'aria-current="page"' : ""}>
      ${U.ic(n.ic)}<span class="txt">${U.esc(n.t)}</span>${extra}</button>`;
  }

  function esqueleto() {
    const app = document.getElementById("app");
    if (!window.M || !M.ok) {
      app.innerHTML = `<div style="padding:60px;max-width:640px;margin:auto">
        <h2>No se encontraron los datos de la plataforma</h2>
        <p class="texto-2">Ejecute <code>python scripts/13_plataforma_web.py</code> desde <code>02_Codigo/</code> para exportar los resultados del pipeline.</p></div>`;
      return false;
    }
    const nAlertas = M.productos.filter((p) => p.inv && (p.inv.prioridad === "critica")).length;
    app.className = "app" + (U.prefs.contraida ? " contraida" : "");
    app.innerHTML = `
    <aside class="sidebar" aria-label="Navegación principal">
      <div class="marca"><div class="logo">${LOGO}</div>
        <div class="textos"><div class="nombre">DemandAI</div><div class="sub">Demand Forecasting System</div></div></div>
      <nav class="nav" id="nav-principal">
        <div class="nav-grupo">Principal</div>
        ${NAV.map((n) => navItem(n, false, n.ruta === "inventario" && nAlertas ? `<span class="cont" title="Prioridad crítica">${nAlertas}</span>` : "")).join("")}
        <div class="nav-grupo">Configuración</div><div class="nav-grupo-sep"></div>
        ${CONF.map((n) => navItem(n, false)).join("")}
        <button class="nav-item" data-accion="salir" title="Cerrar sesión">${U.ic("log-out")}<span class="txt">Cerrar sesión</span></button>
      </nav>
      <div class="pie">
        <div class="tarjeta-datos"><div class="flex" style="gap:8px;margin-bottom:4px">${U.ic("database", "xs")}<b>Fuente de datos</b></div>
          ${M.meta.datos_sinteticos ? "POS sintético calibrado a Cúcuta" : "POS del comercio"} · ${U.n0(M.productos.length)} SKU · ${M.tiendas.length} establecimientos</div>
        <button class="nav-item btn-contraer" data-accion="contraer" title="Contraer menú">${U.ic(U.prefs.contraida ? "panel-left-open" : "panel-left-close")}<span class="txt">Contraer menú</span></button>
      </div>
    </aside>
    <div class="velo" data-accion="cerrar-menu"></div>
    <div class="principal">
      <header class="topbar">
        <button class="btn-ic btn-menu" data-accion="menu" aria-label="Abrir menú">${U.ic("menu")}</button>
        <div class="titulo"><span class="miga" id="miga">DemandAI</span><h1 id="titulo-seccion">Inicio</h1></div>
        <div class="filtros-top flex">
          <label class="sel-ic" title="Establecimiento">${U.ic("store", "s")}<span class="sr">Establecimiento</span>
            <select class="ctrl" id="sel-tienda"><option value="todas">Todos los establecimientos</option>
              ${M.tiendas.map((t) => `<option value="${t.i}">${U.esc(t.nombre)} · ${U.cap(t.sector)}</option>`).join("")}</select></label>
          <label class="sel-ic" title="Período">${U.ic("calendar", "s")}<span class="sr">Período</span>
            <select class="ctrl" id="sel-periodo">${PERIODOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
        </div>
        <div class="buscador" id="buscador">${U.ic("search", "s")}
          <input class="ctrl" id="busqueda" type="search" placeholder="Buscar producto, SKU o sección" autocomplete="off" aria-label="Buscar">
          <kbd>Ctrl K</kbd></div>
        <button class="btn-ic btn-buscar-movil" data-accion="buscar-movil" aria-label="Buscar">${U.ic("search")}</button>
        <div style="position:relative"><button class="btn-ic" id="btn-notif" aria-label="Notificaciones">${U.ic("bell")}<span class="punto" id="punto-notif"></span></button></div>
        <div style="position:relative"><button class="avatar" id="btn-usuario" aria-label="Menú de usuario">AD</button></div>
      </header>
      <main class="contenido" id="contenido" tabindex="-1"></main>
    </div>`;
    U.$("#sel-tienda").value = String(M.estado_global.tienda);
    U.$("#sel-periodo").value = String(M.estado_global.periodo);
    return true;
  }

  /* ------------------------------------------------------------ enrutador */
  let rutaActual = null;
  function parsear() {
    const h = location.hash.replace(/^#\/?/, "") || "dashboard";
    const [ruta, q] = h.split("?");
    const params = Object.fromEntries(new URLSearchParams(q || ""));
    return { ruta: VISTAS[ruta] ? ruta : "dashboard", params };
  }
  function render() {
    const { ruta, params } = parsear();
    rutaActual = ruta;
    const v = VISTAS[ruta];
    U.$$(".nav-item[data-ruta]").forEach((b) => {
      const a = b.dataset.ruta === ruta; b.classList.toggle("activo", a);
      if (a) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    U.$("#titulo-seccion").textContent = v.titulo;
    U.$("#miga").textContent = "DemandAI / " + (v.grupo || "Principal");
    document.title = v.titulo + " · DemandAI";
    const c = U.$("#contenido");
    c.innerHTML = "";
    v.render(c, params);
    document.getElementById("app").classList.remove("menu-abierto");
  }
  window.ir = (ruta) => { if (location.hash === "#" + ruta) render(); else location.hash = "#" + ruta; };
  window.refrescar = () => render();

  /* ------------------------------------------------------------ menús flotantes */
  function cerrarFlotantes() { U.$$(".flotante").forEach((f) => f.remove()); }
  function abrirFlotante(ancla, html, cls = "") {
    const ya = ancla.parentElement.querySelector(".flotante");
    cerrarFlotantes();
    if (ya) return null;
    const f = document.createElement("div");
    f.className = "flotante " + cls;
    f.innerHTML = html;
    ancla.parentElement.appendChild(f);
    return f;
  }
  function menuNotificaciones(btn) {
    const ns = M.notificaciones();
    const f = abrirFlotante(btn, `<div class="encab">Notificaciones <span class="chip">${ns.length}</span></div>
      ${ns.map((n) => `<div class="item" data-ir="${n.ruta}"><div class="icono-burbuja ${n.c}" style="width:34px;height:34px">${U.ic(n.ic, "s")}</div>
        <div><div class="t">${U.esc(n.t)}</div><div class="d">${U.esc(n.d)}</div></div></div>`).join("")}`);
    if (f) f.style.width = "360px";
  }
  function menuUsuario(btn) {
    abrirFlotante(btn, `<div class="encab"><div><div>Administrador</div><div class="texto-2 peq" style="font-weight:400">Sesión local · sin cuenta en la nube</div></div></div><hr>
      <div class="item" data-ir="perfil">${U.ic("user", "s")}<div class="t">Perfil de usuario</div></div>
      <div class="item" data-ir="configuracion">${U.ic("settings", "s")}<div class="t">Configuración</div></div><hr>
      <div class="item" data-accion="salir">${U.ic("log-out", "s")}<div class="t">Cerrar sesión</div></div>`);
  }

  /* ------------------------------------------------------------ búsqueda global */
  function buscar(q) {
    q = q.trim().toLowerCase();
    const cont = U.$("#buscador");
    let f = cont.querySelector(".flotante");
    if (!q) { if (f) f.remove(); return; }
    const secciones = [...NAV, ...CONF].filter((n) => n.t.toLowerCase().includes(q)).slice(0, 3);
    const prods = M.productos.filter((p) => p.sku.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q) || p.sector.includes(q)).slice(0, 8);
    const tiendas = M.tiendas.filter((t) => (t.nombre + " " + t.id + " " + t.sector).toLowerCase().includes(q)).slice(0, 3);
    let html = "";
    if (secciones.length) html += secciones.map((n) => `<div class="item" data-ir="${n.ruta}">${U.ic(n.ic, "s")}<div><div class="t">${n.t}</div><div class="d">Sección</div></div></div>`).join("");
    if (tiendas.length) html += tiendas.map((t) => `<div class="item" data-ir="establecimientos?t=${t.i}">${U.ic("store", "s")}<div><div class="t">${t.nombre}</div><div class="d">${t.id} · ${U.cap(t.sector)}</div></div></div>`).join("");
    if (prods.length) html += prods.map((p) => `<div class="item" data-sku="${p.sku}">${U.ic("package", "s")}<div><div class="t">${U.esc(p.nombre)}</div><div class="d">${p.sku} · ${M.tiendas[p.tienda].nombre}</div></div><div style="margin-left:auto">${M.etiquetaEstado(p)}</div></div>`).join("");
    if (!html) html = `<div class="vacio peq">Sin resultados para “${U.esc(q)}”</div>`;
    if (!f) { f = document.createElement("div"); f.className = "flotante resultados-busqueda"; cont.appendChild(f); }
    f.innerHTML = html;
  }

  /* ------------------------------------------------------------ detalle de producto */
  window.abrirProducto = (sku) => {
    const p = M.porSku[sku]; if (!p) return;
    cerrarFlotantes();
    const fondo = document.createElement("div"); fondo.className = "cajon-fondo";
    const c = document.createElement("aside"); c.className = "cajon"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", "Detalle de " + p.nombre);
    const v = p.inv; const t = M.tiendas[p.tienda];
    const ventas90 = U.suma(p.hist.slice(-90));
    c.innerHTML = `
      <div class="cab"><div class="icono-burbuja ib-azul">${U.ic("package")}</div>
        <div style="min-width:0"><h3 style="font-size:17px">${U.esc(p.nombre)}</h3>
        <div class="texto-2 peq">${p.sku} · ${t.nombre} · ${U.cap(p.sector)}${p.clase ? " · demanda " + p.clase : ""}</div></div>
        <div style="margin-left:auto" class="flex">${M.etiquetaEstado(p)}<button class="btn-ic" data-accion="cerrar-cajon" aria-label="Cerrar">${U.ic("x")}</button></div></div>
      <div class="cuerpo">
        ${v ? `<div class="dato-par">
          <div><span>Stock actual</span><b>${U.n0(v.stock)} u.</b></div>
          <div><span>Punto de reorden</span><b>${U.n1(v.pr)} u.</b></div>
          <div><span>Cobertura</span><b>${U.n1(v.cobertura)} días</b></div>
          <div><span>Pedido sugerido</span><b style="color:var(--azul)">${U.n0(v.pedido)} u.</b></div></div>
        <div class="aviso ${v.alerta ? "naranja" : "gris"}">${U.ic(v.alerta ? "triangle-alert" : "info", "s")}<div><b>${v.alerta ? "Necesita reposición. " : "Sin acción inmediata. "}</b>${U.esc(M.razon(p))}</div></div>` : `<div class="aviso gris">${U.ic("info", "s")}<div>Este producto no tiene suficiente historia de ventas para el pronóstico de producción (menos de 30 días con ventas).</div></div>`}
        <div class="card"><div class="card-h"><div><h3>Ventas y pronóstico</h3><div class="sub">Últimos 90 días y próximos ${M.H} días · unidades por día</div></div>
          ${G.leyenda([{ nombre: "Ventas reales", color: "var(--real)" }, { nombre: "Pronóstico " + (M.meta.produccion ? M.meta.produccion.modelo_nombre : ""), color: "var(--azul)" }])}</div>
          <div id="g-detalle"></div></div>
        <div class="card"><div class="card-h"><h3>Ficha del producto</h3></div>
          <div class="dato-par">
            <div><span>Precio</span><b>${U.cop(p.precio, false)}</b></div>
            <div><span>Ventas 90 días</span><b>${U.n0(ventas90)} u.</b></div>
            <div><span>Pronóstico 28 días</span><b>${p.pron ? U.n0(p.pron28) + " u." : "—"}</b></div>
            <div><span>Clase de demanda</span><b style="font-size:15px">${p.clase ? U.cap(p.clase) : "—"}</b></div>
            <div><span>ADI (intervalo medio)</span><b>${U.n2(p.adi)}</b></div>
            <div><span>CV² del tamaño</span><b>${U.n2(p.cv2)}</b></div>
            <div><span>Nivel objetivo S</span><b>${v ? U.n1(v.s) + " u." : "—"}</b></div>
            <div><span>Demanda 7 días</span><b>${v ? U.n1(v.demanda7) + " u." : "—"}</b></div></div></div>
        <div class="flex flex-w">
          <button class="btn" data-ir="prediccion?sku=${p.sku}">${U.ic("trending-up", "s")}Abrir en Predicción</button>
          ${M.enBacktest(p) ? `<span class="chip">${U.ic("flask-conical", "xs")}En la muestra de validación (comparación de modelos disponible)</span>` : ""}
        </div>
      </div>`;
    document.body.append(fondo, c);
    const cerrar = () => { fondo.remove(); c.remove(); document.removeEventListener("keydown", esc); };
    const esc = (e) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("keydown", esc);
    fondo.addEventListener("click", cerrar);
    c.addEventListener("click", (e) => {
      if (e.target.closest("[data-accion=cerrar-cajon]")) cerrar();
      const irA = e.target.closest("[data-ir]"); if (irA) { cerrar(); ir(irA.dataset.ir); }
    });
    const hist = p.hist.slice(-90);
    const fechas = [...M.fechas.slice(-90), ...M.fechasPron];
    G.lineas(c.querySelector("#g-detalle"), {
      x: fechas, alto: 240, corte: 90, etiquetaCorte: "Pronóstico", etiquetaAntes: "Histórico",
      formatoY: U.n0, formatoTooltip: (v) => U.n1(v) + " u.",
      series: [
        { nombre: "Ventas reales", color: "#263449", valores: [...hist, ...new Array(M.H).fill(null)], ancho: 1.6 },
        { nombre: "Pronóstico", color: "#2563EB", valores: p.pron ? [...new Array(89).fill(null), hist[89], ...p.pron] : [], area: true },
      ],
    });
    c.querySelector("[data-accion=cerrar-cajon]").focus();
  };

  /* ------------------------------------------------------------ eventos globales */
  let enlazadoGlobal = false;
  function enlazar() {
    const app = document.getElementById("app");
    if (!enlazadoGlobal) app.addEventListener("click", (e) => {
      const nav = e.target.closest(".nav-item[data-ruta]");
      if (nav) { ir(nav.dataset.ruta); return; }
      const acc = e.target.closest("[data-accion]");
      if (acc) {
        const a = acc.dataset.accion;
        if (a === "contraer") {
          U.prefs.contraida = !U.prefs.contraida; U.guardarPrefs();
          app.classList.toggle("contraida", U.prefs.contraida);
          acc.innerHTML = U.ic(U.prefs.contraida ? "panel-left-open" : "panel-left-close") + '<span class="txt">Contraer menú</span>';
        }
        if (a === "menu") app.classList.add("menu-abierto");
        if (a === "cerrar-menu") app.classList.remove("menu-abierto");
        if (a === "salir") salir();
        if (a === "buscar-movil") {
          const tb = U.$(".topbar"); tb.classList.toggle("buscando");
          if (tb.classList.contains("buscando")) U.$("#busqueda").focus();
        }
      }
      const irA = e.target.closest("[data-ir]");
      if (irA) { cerrarFlotantes(); U.$("#busqueda").value = ""; ir(irA.dataset.ir); return; }
      const sku = e.target.closest("[data-sku]");
      if (sku) { U.$("#busqueda").value = ""; abrirProducto(sku.dataset.sku); return; }
      if (e.target.closest("#btn-notif")) { menuNotificaciones(U.$("#btn-notif")); return; }
      if (e.target.closest("#btn-usuario")) { menuUsuario(U.$("#btn-usuario")); return; }
      if (!e.target.closest(".flotante") && !e.target.closest("#buscador")) cerrarFlotantes();
    });
    if (!enlazadoGlobal) {
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); const b = U.$("#busqueda"); if (b) b.focus(); }
      });
      window.addEventListener("hashchange", render);
      enlazadoGlobal = true;
    }
    U.$("#sel-tienda").addEventListener("change", (e) => {
      M.estado_global.tienda = e.target.value === "todas" ? "todas" : +e.target.value;
      U.prefs.tienda = M.estado_global.tienda; U.guardarPrefs(); render();
    });
    U.$("#sel-periodo").addEventListener("change", (e) => {
      M.estado_global.periodo = +e.target.value; U.prefs.periodo = M.estado_global.periodo; U.guardarPrefs(); render();
    });
    const inp = U.$("#busqueda");
    inp.addEventListener("input", () => buscar(inp.value));
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const p = M.productos.find((x) => x.sku.toLowerCase().includes(inp.value.trim().toLowerCase())); if (p) { abrirProducto(p.sku); inp.value = ""; buscar(""); } }
      if (e.key === "Escape") { inp.value = ""; buscar(""); inp.blur(); }
    });
    U.$("#punto-notif").style.display = M.productos.some((p) => p.inv && p.inv.prioridad === "critica") ? "" : "none";
  }

  function salir() {
    cerrarFlotantes();
    const app = document.getElementById("app");
    app.className = "";
    app.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:var(--azul-profundo)">
      <div class="card" style="max-width:420px;text-align:center;padding:36px">
        <div class="marca" style="justify-content:center"><div class="logo">${LOGO}</div></div>
        <h2 style="font-size:20px">Sesión cerrada</h2>
        <p class="texto-2">Esta instalación de DemandAI funciona en modo local y no tiene cuentas de usuario; sus preferencias se conservan en este navegador.</p>
        <button class="btn prim" id="reentrar">${U.ic("arrow-right", "s")}Volver a entrar</button></div></div>`;
    U.$("#reentrar").addEventListener("click", iniciar);
  }

  function iniciar() {
    if (!esqueleto()) return;
    enlazar();
    render();
  }
  window.VISTA = (ruta, def) => { VISTAS[ruta] = def; };
  document.addEventListener("DOMContentLoaded", iniciar);
})();
