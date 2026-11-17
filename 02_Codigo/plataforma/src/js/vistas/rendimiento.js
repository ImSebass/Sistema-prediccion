/* Vista: Rendimiento del sistema — cómputo paralelo (MPI, OpenMP, CUDA) */
(function () {
  "use strict";

  /** Fracción serial experimental de Karp–Flatt a partir del speedup medido con p unidades */
  const karpFlatt = (S, p) => (p > 1 && S > 0 ? (1 / S - 1 / p) / (1 - 1 / p) : null);
  const amdahl = (f, p) => 1 / (f + (1 - f) / p);

  VISTA("rendimiento", {
    titulo: "Rendimiento del sistema", grupo: "Principal",
    render(c) {
      const B = M.D.benchmark || {};
      const omp = B.openmp, mpi = B.mpi, lstm = B.lstm;
      const filas = [];
      const add = (carga, tec, unidad, base, par, extra = {}) => {
        if (!base || !par) return;
        const p = par[unidad === "hilos" ? "hilos" : "p"] || par.hilos;
        const S = base.mediana / par.mediana;
        filas.push({ carga, tec, unidad, p, t1: base.mediana, tp: par.mediana, ric: par.ric, S, E: S / p, f: karpFlatt(S, p), ...extra });
      };
      if (mpi) {
        add("ETL de datos POS (limpieza + anonimización)", "MPI", "procesos", mpi.etl.find((e) => e.p === 1), mpi.etl.find((e) => e.p === 2), { desb: mpi.etl.find((e) => e.p === 2).desbalance_mediana });
        const b1 = mpi.motor_fuerte.find((e) => e.p === 1);
        ["bloque", "ciclico", "dinamico"].forEach((est) => {
          const e = mpi.motor_fuerte.find((x) => x.p === 2 && x.estrategia === est);
          add(`Motor SARIMAX + Prophet · reparto ${est === "ciclico" ? "cíclico" : est === "dinamico" ? "dinámico" : "en bloque"}`, "MPI", "procesos", b1, e, { desb: e && e.desbalance_mediana });
        });
        const h11 = mpi.hibrido.find((e) => e.p === 1 && e.hilos === 1);
        const h12 = mpi.hibrido.find((e) => e.p === 1 && e.hilos === 2);
        const h21 = mpi.hibrido.find((e) => e.p === 2 && e.hilos === 1);
        if (h11 && h12) add("Rasgos TSB · híbrido (1 proceso × 2 hilos)", "MPI + OpenMP", "hilos", h11, h12);
        if (h11 && h21) add("Rasgos TSB · híbrido (2 procesos × 1 hilo)", "MPI + OpenMP", "procesos", h11, { ...h21, hilos: 2 });
      }
      if (omp) {
        const f = (impl, h) => omp.fuerte.find((e) => e.impl === impl && e.hilos === h);
        add("Ajuste TSB por rejilla · kernel C #pragma omp", "OpenMP", "hilos", f("C_OpenMP", 1), f("C_OpenMP", 2));
        add("Ajuste TSB por rejilla · Numba (capa omp)", "OpenMP", "hilos", f("Numba_omp", 1), f("Numba_omp", 2));
      }
      if (lstm && lstm.cpu) add("Entrenamiento LSTM global · CPU multihilo", "PyTorch CPU", "hilos", lstm.cpu.find((e) => e.hilos === 1), lstm.cpu.find((e) => e.hilos === 2));

      const gpu = lstm && lstm.cuda && lstm.gpu;
      const hw = omp ? omp.hilos_disponibles : null;
      const mejor = filas.length ? filas.reduce((a, b) => (b.S > a.S ? b : a)) : null;
      const etl = filas.find((f) => f.tec === "MPI" && f.carga.startsWith("ETL"));
      const dinam = filas.find((f) => f.carga.includes("dinámico"));
      const ompC = filas.find((f) => f.carga.includes("kernel C"));
      const tec = { MPI: "#2563EB", OpenMP: "#7C3AED", "MPI + OpenMP": "#DB2777", "PyTorch CPU": "#94A3B8" };

      c.innerHTML = `
      <div class="aviso" style="margin-bottom:18px">${U.ic("info", "s")}<div>
        <b>Resultados medidos</b> en una máquina de ${hw ?? "—"} núcleos: mediana de ${omp ? omp.repeticiones : 5} repeticiones tras descartar la de calentamiento; T(1) es el secuencial optimizado.
        Las cifras para 4, 8 y 16 unidades son <b>proyecciones teóricas</b> (Amdahl con la fracción serial de Karp–Flatt) y se muestran con línea discontinua.
        El clúster de 4 nodos y la GPU están <b>pendientes de medición</b>.</div></div>

      <section class="rejilla g-kpi">
        ${C.kpi({ etq: "Tiempo secuencial · ETL", valor: etl ? U.seg(etl.t1) : "—", ic: "timer", color: "ib-gris", fuente: "1 proceso MPI · 3,3 M líneas POS" })}
        ${C.kpi({ etq: "Tiempo paralelo · ETL", valor: etl ? U.seg(etl.tp) : "—", ic: "zap", color: "ib-azul", pie: etl ? `<span class="tendencia sube">${U.ic("arrow-down-right", "xs")}${U.pct(1 - etl.tp / etl.t1, 0)} menos</span>` : "", fuente: etl ? `${etl.p} procesos MPI` : "" })}
        ${C.kpi({ etq: "Mejor speedup medido", valor: mejor ? "×" + U.n2(mejor.S) : "—", ic: "rocket", color: "ib-verde", fuente: mejor ? mejor.carga : "" })}
        ${C.kpi({ etq: "Eficiencia · motor dinámico", valor: dinam ? U.pct(dinam.E, 0) : "—", ic: "gauge", color: "ib-violeta", fuente: dinam ? `S = ×${U.n2(dinam.S)} con ${dinam.p} procesos · desbalance ${U.n2(dinam.desb)}` : "" })}
        ${C.kpi({ etq: "Procesos e hilos", valor: `${mpi ? Math.max(...mpi.procesos) : "—"} × ${omp ? omp.hilos_disponibles : "—"}`, ic: "network", color: "ib-gris", fuente: "Máx. procesos MPI × hilos OpenMP medidos" })}
        ${C.kpi({ etq: "Estado CUDA", valor: gpu ? "Medido" : "Pendiente", ic: "microchip", color: gpu ? "ib-verde" : "ib-naranja", pie: `<span class="etiqueta ${gpu ? "e-baja" : "e-alta"}">${gpu ? "GPU" : "Sin GPU en la medición"}</span>`, fuente: lstm ? `PyTorch ${lstm.torch}` : "" })}
      </section>

      <section class="rejilla g-main mt">
        <div class="card">
          <div class="card-h"><div><h3>Secuencial vs. paralelo</h3><div class="sub">Tiempo relativo de cada carga (secuencial = 100 %) con el máximo de unidades medido</div></div></div>
          <div id="g-rel"></div>
          <div style="margin-top:10px">${G.leyenda([{ nombre: "Secuencial T(1)", color: "#CBD5E1", caja: true }, { nombre: "Paralelo T(p)", color: "#2563EB", caja: true }])}</div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Escalabilidad fuerte</h3><div class="sub">Speedup S(p) del kernel OpenMP en C y del motor MPI dinámico</div></div></div>
          <div id="g-esc"></div>
          <div style="margin-top:10px" id="ley-esc"></div>
        </div>
      </section>

      <section class="card p0 mt">
        <div class="card-h" style="padding:20px 20px 0"><div><h3>Resultados por carga de trabajo</h3><div class="sub">Speedup S(p) = T(1)/T(p) · eficiencia E(p) = S(p)/p · fracción serial e de Karp–Flatt</div></div>
          <div class="acciones"><button class="btn peq" id="exp-bm">${U.ic("download", "xs")}CSV</button></div></div>
        <div class="tabla-env" style="margin-top:14px"><table class="tabla"><thead><tr><th>Carga</th><th>Tecnología</th><th class="n">Unidades</th><th class="n">T(1)</th><th class="n">T(p)</th><th class="n">RIC T(p)</th><th class="n">Speedup</th><th class="n">Eficiencia</th><th class="n">e (Karp–Flatt)</th><th>Estado</th></tr></thead>
        <tbody>${filas.map((f) => `<tr><td style="white-space:normal;min-width:230px">${U.esc(f.carga)}</td><td><span class="chip"><span class="sw" style="background:${tec[f.tec]}"></span>${f.tec}</span></td>
          <td class="n">${f.p} ${f.unidad}</td><td class="n">${U.seg(f.t1)}</td><td class="n">${U.seg(f.tp)}</td><td class="n">${U.seg(f.ric)}</td>
          <td class="n"><b>×${U.n2(f.S)}</b></td><td class="n"><span class="barra-mini"><i style="width:${Math.min(100, f.E * 100)}%;background:${f.E >= 0.8 ? "#16A36A" : f.E >= 0.6 ? "#F59E0B" : "#EF4444"}"></i></span> ${U.pct(f.E, 0)}</td>
          <td class="n">${f.f != null ? U.n3(f.f) : "—"}</td><td><span class="etiqueta e-baja"><span class="pto"></span>Medido</span></td></tr>`).join("")}
          <tr><td style="white-space:normal;min-width:230px">Entrenamiento LSTM global · GPU (CUDA)</td><td><span class="chip"><span class="sw" style="background:#16A36A"></span>CUDA</span></td><td class="n">1 GPU</td><td class="n">${lstm && lstm.cpu ? U.seg(lstm.cpu[0].mediana) : "—"}</td>
            <td class="n">${gpu ? U.seg(gpu[0].mediana) : "—"}</td><td class="n">—</td><td class="n">${gpu ? "×" + U.n2(lstm.cpu[0].mediana / gpu[0].mediana) : "—"}</td><td class="n">—</td><td class="n">—</td>
            <td><span class="etiqueta ${gpu ? "e-baja" : "e-alta"}"><span class="pto"></span>${gpu ? "Medido" : "Pendiente de GPU"}</span></td></tr>
        </tbody></table></div>
        <div class="texto-2 peq" style="padding:12px 16px">Equivalencia numérica: diferencia máxima entre resultados paralelos y secuenciales = ${mpi ? U.n0(mpi.equivalencia_max_dif) : "—"} (MPI), ${omp ? U.n0(Math.max(...omp.fuerte.map((e) => e.max_dif_vs_1hilo_C || 0))) : "—"} (OpenMP)${lstm && lstm.equivalencia ? `; LSTM 1 vs ${lstm.hilos ? Math.max(...lstm.hilos) : 2} hilos con WAPE idéntico (${U.n3(lstm.equivalencia.wape_1hilo)})` : ""}.
          Un speedup ligeramente superior a p (OpenMP en C) se explica por mejor uso de caché al repartir los datos.</div>
      </section>

      <section class="rejilla g-2 mt">
        <div class="card">
          <div class="card-h"><div><h3>Escalabilidad débil (Gustafson)</h3><div class="sub">El trabajo crece con las unidades: lo ideal es que el tiempo se mantenga</div></div></div>
          <div id="g-debil"></div>
        </div>
        <div class="card">
          <div class="card-h"><div><h3>Reparto de tareas en el motor MPI</h3><div class="sub">Tiempo con 2 procesos y desbalance de carga (máx./media)</div></div></div>
          <div id="g-estr"></div>
          <div class="texto-2 peq mt">Los ajustes SARIMAX y Prophet tienen costos muy distintos por serie: el reparto dinámico (contador RMA <code>Fetch_and_op</code>) equilibra la carga mejor que el reparto en bloque.</div>
        </div>
      </section>

      <h3 class="mt-l" style="font-size:17px">Arquitectura de procesamiento</h3>
      <p class="texto-2" style="margin:4px 0 14px">Cómo se distribuye el trabajo entre las tres tecnologías de cómputo paralelo del sistema.</p>
      <section class="arq">
        <div class="paso"><div class="icono-burbuja ib-azul">${U.ic("network")}</div><h4>1 · MPI — datos y tareas distribuidos</h4>
          <p>mpi4py / OpenMPI. Un proceso por núcleo o por nodo del clúster.</p>
          <ul><li>ETL: particiones tienda × mes repartidas con LPT; anonimización HMAC (Ley 1581).</li><li>Motor de modelos: una tarea por (serie, modelo, origen) con reparto dinámico.</li><li>Recolección con Gather / Gatherv.</li></ul>
          <div class="flecha-arq">${U.ic("arrow-right", "xs")}</div></div>
        <div class="paso"><div class="icono-burbuja ib-violeta">${U.ic("cpu")}</div><h4>2 · OpenMP — multinúcleo con memoria compartida</h4>
          <p>Kernel en C con <code>#pragma omp parallel for schedule(dynamic)</code> llamado vía ctypes, y Numba con capa <code>omp</code>.</p>
          <ul><li>Ajuste TSB por rejilla de parámetros.</li><li>Rasgos móviles por serie.</li><li>Híbrido: 1 proceso MPI por nodo × T hilos OpenMP.</li></ul>
          <div class="flecha-arq">${U.ic("arrow-right", "xs")}</div></div>
        <div class="paso"><div class="icono-burbuja" style="background:var(--verde-50);color:var(--verde)">${U.ic("microchip")}</div><h4>3 · CUDA — redes neuronales en GPU</h4>
          <p>PyTorch con cuDNN; respaldo en CPU multihilo cuando no hay GPU.</p>
          <ul><li>LSTM global y residuos del híbrido Prophet-LSTM.</li><li>Lotes de ventanas de 56 días, salida de 28.</li><li>Estado: <b class="${gpu ? "estado-ok" : "estado-pend"}">${gpu ? "medido en GPU" : "pendiente de ejecutar en GPU"}</b>.</li></ul></div>
      </section>`;

      /* secuencial vs paralelo (tiempo relativo) */
      const fr = filas.filter((f) => !f.carga.includes("en bloque") && !f.carga.includes("cíclico"));
      G.barras(U.$("#g-rel", c), {
        categorias: fr.map((f) => f.tec === "PyTorch CPU" ? "LSTM CPU" : f.carga.includes("ETL") ? "ETL MPI" : f.carga.includes("dinámico") ? "Motor MPI" : f.carga.includes("kernel C") ? "OpenMP C" : f.carga.includes("Numba") ? "Numba" : f.carga.includes("1 proceso × 2") ? "Híbrido 1×2" : "Híbrido 2×1"),
        titulosTooltip: fr.map((f) => f.carga), alto: 290, max: 1, formatoY: (v) => U.n0(v * 100) + " %",
        formatoTooltip: (v) => U.pct(v, 0), notaTooltip: (k) => `T(1) = ${U.seg(fr[k].t1)} · T(${fr[k].p}) = ${U.seg(fr[k].tp)} · S = ×${U.n2(fr[k].S)}`,
        series: [{ nombre: "Secuencial", color: "#CBD5E1", valores: fr.map(() => 1) }, { nombre: "Paralelo", color: "#2563EB", valores: fr.map((f) => f.tp / f.t1) }],
      });

      /* escalabilidad fuerte: medido + proyección */
      const ps = [1, 2, 4, 8, 16];
      const serie = (f, color, nombre) => {
        if (!f) return [];
        const e = Math.max(0, f.f ?? 0);
        return [{ nombre: nombre + " (medido)", color, valores: ps.map((p) => (p === 1 ? 1 : p === f.p ? f.S : null)) },
          { nombre: nombre + " (proyección Amdahl)", color, guion: true, opacidad: 0.8, valores: ps.map((p) => (p < f.p ? null : p === f.p ? f.S : amdahl(e, p))) }];
      };
      const sEsc = [{ nombre: "Ideal S(p) = p", color: "#CBD5E1", ancho: 1.5, valores: ps }, ...serie(ompC, "#7C3AED", "OpenMP C"), ...serie(dinam, "#2563EB", "Motor MPI dinámico")];
      G.lineas(U.$("#g-esc", c), { x: ps.map(String), alto: 290, desdeCero: true, formatoX: (v) => "p = " + v, formatoXTooltip: (v) => v + " unidades de procesamiento", formatoY: U.n0, formatoTooltip: (v) => "×" + U.n2(v), series: sEsc, ticksX: 5 });
      U.$("#ley-esc", c).innerHTML = G.leyenda([{ nombre: "Ideal", color: "#CBD5E1" }, { nombre: "OpenMP C", color: "#7C3AED" }, { nombre: "Motor MPI dinámico", color: "#2563EB" }, { nombre: "Proyección teórica", color: "#94A3B8", guion: true }]);

      /* escalabilidad débil */
      const deb = [];
      if (omp && omp.debil.length > 1) deb.push({ n: "OpenMP C", d: `${omp.debil[0].series} → ${omp.debil[1].series} series`, e: omp.debil[0].mediana / omp.debil[1].mediana, t: `${U.seg(omp.debil[0].mediana)} → ${U.seg(omp.debil[1].mediana)}` });
      if (mpi && mpi.motor_debil.length > 1) deb.push({ n: "Motor MPI", d: `${mpi.motor_debil[0].series} → ${mpi.motor_debil[1].series} series`, e: mpi.motor_debil[0].mediana / mpi.motor_debil[1].mediana, t: `${U.seg(mpi.motor_debil[0].mediana)} → ${U.seg(mpi.motor_debil[1].mediana)}` });
      U.$("#g-debil", c).innerHTML = deb.length ? G.barrasH(deb.map((d) => ({ etq: d.n, v: d.e, txt: U.pct(d.e, 0), color: d.e >= 0.9 ? "#16A36A" : "#F59E0B", titulo: d.t })), { max: 1.1 }) +
        `<div class="texto-2 peq mt">${deb.map((d) => `<b>${d.n}</b>: ${d.d} con 1 → 2 unidades (${d.t})`).join(" · ")}.</div><div class="texto-2 peq mt">Eficiencia débil = T(1, N) / T(p, p·N). Con 2 unidades y el doble de trabajo, el tiempo casi no cambia: el sistema escala con el volumen de datos, como predice la ley de Gustafson.</div>` : `<div class="vacio">Sin mediciones.</div>`;

      /* estrategias */
      if (mpi) {
        const est = ["bloque", "ciclico", "dinamico"].map((k) => mpi.motor_fuerte.find((e) => e.p === 2 && e.estrategia === k)).filter(Boolean);
        G.barras(U.$("#g-estr", c), {
          categorias: ["En bloque", "Cíclico", "Dinámico"], alto: 230, formatoY: (v) => U.n0(v) + " s", formatoTooltip: U.seg, etiquetas: true, formatoEtiqueta: (v) => U.n1(v) + " s",
          notaTooltip: (k) => `Desbalance ${U.n2(est[k].desbalance_mediana)} · S = ×${U.n2(mpi.motor_fuerte.find((e) => e.p === 1).mediana / est[k].mediana)}`,
          series: [{ nombre: "Tiempo con 2 procesos", valores: est.map((e) => e.mediana), color: (k) => (k === 2 ? "#2563EB" : "#93B4F5") }],
        });
      }
      U.$("#exp-bm", c).addEventListener("click", () => U.descargarCSV("benchmark_demandai.csv", [["carga", "tecnologia", "unidades", "t1_s", "tp_s", "iqr_s", "speedup", "eficiencia", "karp_flatt"],
        ...filas.map((f) => [f.carga, f.tec, f.p, f.t1, f.tp, f.ric, f.S, f.E, f.f])]));
    },
  });
})();
