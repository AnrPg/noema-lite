/* ===================== interactive activities — the P6 engines of sim-spec@1 (docs/INTERACTIVE_ENGINES.md, docs/INTERACTIVE.md §12.6–12.7) =====================
   Registers the engines of 39_engine_thermal.js (thermal@1: lumped thermal networks), 40_engine_pid.js (pid@1: control loops),
   41_engine_rf.js (rf@1: radio link budgets) and 42_engine_twin.js (twin@1: the digital twin of a battery-powered IoT node, which
   also runs fault-finding benches: bench: true) with ACT.registerEngine, exactly like circuit-mna@1 (36_engine_circuit_sim.js):
   each engine object is {id, check, prepare, create, workerSource} — its runs go to a Worker (the engine's own source, the same code
   as on the page), its expressions (bindings, transient times, `at`) are evaluated on the main thread with the app's NoemaExpr
   (prepare), so the worker gets numbers only. The validators check the same specs (engine/packcheck.js checkEngine, tools/activities.py). */
(() => {
  /* i18n-ignore-start */   // code: numbers in, numbers out
  if (typeof ACT === 'undefined') return;
  for (const g of ['NoemaThermal', 'NoemaPID', 'NoemaRF', 'NoemaTwin']) if (window[g] && window[g].engine) ACT.registerEngine(window[g].engine);
  /* i18n-ignore-end */
})();
