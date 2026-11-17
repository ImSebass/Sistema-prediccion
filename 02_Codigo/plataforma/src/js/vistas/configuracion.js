/* Vistas: Configuración general y Perfil de usuario */
(function () {
  "use strict";

  const fila = (t, d, ctrl) => `<div class="config-fila"><div><div class="t">${t}</div><div class="d">${d}</div></div><div>${ctrl}</div></div>`;

  VISTA("configuracion", {
    titulo: "Configuración", grupo: "Configuración",
    render(c) {
      const pol = M.politica, me = M.meta, pr = me.produccion || {};
      c.innerHTML = `
      <section class="rejilla g-2">
        <div class="card">
          <div class="card-h"><div><h3>Preferencias de la interfaz</h3><div class="sub">Se guardan en este navegador</div></div></div>
          ${fila("Establecimiento por defecto", "Filtro inicial del panel", `<select class="ctrl" id="c-tienda"><option value="todas">Todos los establecimientos</option>${M.tiendas.map((t) => `<option value="${t.i}">${t.nombre}</option>`).join("")}</select>`)}
          ${fila("Período por defecto", "Ventana para ventas y comparaciones", `<select class="ctrl" id="c-periodo"><option value="7">Últimos 7 días</option><option value="28">Últimos 28 días</option><option value="90">Últimos 90 días</option><option value="365">Últimos 12 meses</option></select>`)}
          ${fila("Menú lateral contraído", "Muestra solo los iconos para ganar espacio", `<button class="interruptor${U.prefs.contraida ? " on" : ""}" id="c-contraida" role="switch" aria-checked="${!!U.prefs.contraida}" aria-label="Menú contraído"></button>`)}
          ${fila("Restablecer preferencias", "Vuelve a la configuración inicial", `<button class="btn peq" id="c-reset">${U.ic("refresh-cw", "xs")}Restablecer</button>`)}
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Política de inventario</h3><div class="sub">Parámetros del motor (definidos en <code>inventario/simulacion.py</code>)</div></div><span class="chip">${U.ic("lock", "xs")}Solo lectura</span></div>
          ${fila("Revisión periódica R", "Cada cuántos días se revisa y se pide", `<b>${pol.R} días</b>`)}
          ${fila("Tiempo de entrega L", "Días entre el pedido y la recepción", `<b>${pol.L} días</b>`)}
          ${fila("Nivel de servicio", "Probabilidad objetivo de no quedarse sin stock", `<b>${U.pct(pol.nivel_servicio, 0)}</b> (z = ${U.n3(pol.z)})`)}
          ${fila("Costo de mantener", "Tasa anual sobre el precio", `<b>${U.pct(pol.tasa_mantener_anual, 0)}</b>`)}
          ${fila("Margen de venta perdida", "Costo por unidad no vendida", `<b>${U.pct(pol.margen, 0)}</b> del precio`)}
        </div>
      </section>
      <section class="rejilla g-2 mt">
        <div class="card">
          <div class="card-h"><div><h3>Fuente de datos</h3><div class="sub">Artefactos que alimentan la plataforma</div></div></div>
          ${fila("Datos de ventas", me.datos_sinteticos ? "Sintéticos calibrados al comercio fronterizo" : "POS del comercio", `${U.fMedia(me.inicio)} – ${U.fMedia(me.fin)} · ${U.n0(me.dias)} días`)}
          ${fila("Catálogo", "Productos × establecimientos", `${U.n0(M.productos.length)} SKU · ${M.tiendas.length} establecimientos`)}
          ${fila("Pronóstico de producción", pr.modelo_nombre || "—", `${U.fHora(pr.ejecutado)} · horizonte ${me.horizonte} días`)}
          ${fila("Paquete de datos", "Generado por scripts/13_plataforma_web.py", U.fHora(me.generado))}
          ${fila("Semilla", "Reproducibilidad de todos los experimentos", `<code>${me.semilla}</code>`)}
          ${me.datos_sinteticos ? `<div class="aviso naranja mt">${U.ic("database", "s")}<div>${U.esc(me.nota_datos)} El esquema de entrada está documentado en el manual de usuario.</div></div>` : ""}
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Actualizar los datos</h3><div class="sub">La plataforma se regenera a partir del pipeline paralelo</div></div></div>
          <ol class="peq" style="line-height:1.9;padding-left:18px;margin:0">
            <li>Cargar las exportaciones POS en <code>datos/crudos/</code> y ejecutar el ETL MPI: <code>bash scripts/03_etl.sh</code></li>
            <li>Pronóstico de producción y alertas: <code>python scripts/12_produccion_y_alertas.py</code></li>
            <li>Exportar y empaquetar la plataforma: <code>python scripts/13_plataforma_web.py</code></li>
            <li>Abrir <code>plataforma/dist/DemandAI.html</code> (o usar <code>--servir</code>).</li></ol>
          <div class="aviso gris mt">${U.ic("info", "s")}<div>El pipeline completo (benchmarks incluidos) se ejecuta con <code>bash scripts/run_all.sh</code>; en el clúster: <code>NP=8 HOSTFILE=config/nodos_ejemplo.txt bash scripts/run_all.sh</code>.</div></div>
        </div>
      </section>`;
      const sT = U.$("#c-tienda", c), sP = U.$("#c-periodo", c);
      sT.value = String(U.prefs.tienda ?? "todas"); sP.value = String(U.prefs.periodo || 28);
      sT.addEventListener("change", () => { U.prefs.tienda = sT.value === "todas" ? "todas" : +sT.value; M.estado_global.tienda = U.prefs.tienda; U.guardarPrefs(); U.$("#sel-tienda").value = sT.value; U.toast("Preferencia guardada"); });
      sP.addEventListener("change", () => { U.prefs.periodo = +sP.value; M.estado_global.periodo = U.prefs.periodo; U.guardarPrefs(); U.$("#sel-periodo").value = sP.value; U.toast("Preferencia guardada"); });
      U.$("#c-contraida", c).addEventListener("click", (e) => {
        U.prefs.contraida = !U.prefs.contraida; U.guardarPrefs();
        e.currentTarget.classList.toggle("on", U.prefs.contraida); e.currentTarget.setAttribute("aria-checked", U.prefs.contraida);
        document.getElementById("app").classList.toggle("contraida", U.prefs.contraida);
      });
      U.$("#c-reset", c).addEventListener("click", () => {
        for (const k of Object.keys(U.prefs)) delete U.prefs[k];
        U.guardarPrefs(); M.estado_global.tienda = "todas"; M.estado_global.periodo = 28;
        document.getElementById("app").classList.remove("contraida");
        U.$("#sel-tienda").value = "todas"; U.$("#sel-periodo").value = "28";
        U.toast("Preferencias restablecidas"); refrescar();
      });
    },
  });

  VISTA("perfil", {
    titulo: "Perfil de usuario", grupo: "Configuración",
    render(c) {
      const vistos = M.productos.filter((p) => p.inv && p.inv.alerta).length;
      c.innerHTML = `
      <section class="rejilla g-main-r">
        <div class="card" style="text-align:center">
          <div class="avatar" style="width:84px;height:84px;font-size:28px;margin:10px auto 14px;cursor:default">AD</div>
          <h3 style="font-size:18px">Administrador</h3>
          <div class="texto-2">Gestión de inventario y compras</div>
          <div class="flex" style="justify-content:center;margin-top:12px"><span class="etiqueta e-media">Acceso total</span><span class="etiqueta e-gris">Sesión local</span></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Cuenta y acceso</h3><div class="sub">Esta instalación funciona en modo local, sin servidor de autenticación</div></div></div>
          ${fila("Rol", "Permisos sobre los módulos", "Administrador · todos los módulos")}
          ${fila("Establecimientos asignados", "Ámbito de los datos visibles", `${M.tiendas.length} de ${M.tiendas.length}`)}
          ${fila("Alertas a su cargo", "Productos bajo el punto de reorden", `${U.n0(vistos)}`)}
          ${fila("Preferencias", "Establecimiento y período por defecto", `${U.prefs.tienda != null && U.prefs.tienda !== "todas" ? M.tiendas[U.prefs.tienda].nombre : "Todos"} · ${U.prefs.periodo || 28} días · <span class="enlace" data-ir="configuracion">editar</span>`)}
          <div class="aviso gris mt">${U.ic("info", "s")}<div>Las cuentas con usuarios y permisos por establecimiento requieren desplegar la plataforma con un servidor y la base PostgreSQL prevista en la arquitectura; están fuera del alcance de esta versión.</div></div>
        </div>
      </section>
      <section class="card mt">
        <div class="card-h"><div><h3>Equipo del proyecto</h3><div class="sub">167411 – Fundamentos de Computación Paralela y Distribuida · Universidad de Pamplona</div></div></div>
        <div class="rejilla g-3">${["Asly Valentina Acuña Palencia", "Juan Sebastián Cárdenas Acevedo", "Julio Sebastián Carrillo Reyes"].map((n) => `
          <div class="flex"><div class="avatar" style="cursor:default">${n.split(" ").filter((_, k) => k === 0 || k === 2).map((x) => x[0]).join("")}</div><div><b style="font-weight:600">${n}</b><div class="texto-2 peq">Autor del proyecto</div></div></div>`).join("")}</div>
      </section>`;
    },
  });
})();
