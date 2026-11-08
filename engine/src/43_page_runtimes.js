/* ===================== interactive activities — the runtimes the page loaded before engine.js join the activity core =====================
   44_activity_wasm.js (wasm@1 and wasm-module@1) and 45_activity_embed.js (external-embed@1) are loaded by the page itself, before
   engine.js (tools/build.py PAGE_SRC: the content checks (NoemaCore.content) check their items before any subject is open); the activity core (ACT) exists
   only now. The engines of sim-spec@1 need no registration: they are the engine library (src/engines, window.NoemaCore.engines),
   which ACT asks for an engine and loads it when an activity needs it. */
(() => {
  /* i18n-ignore-start */   // code: no words
  if (typeof ACT === 'undefined') return;
  window.NoemaWasm?.registerWith(ACT);            // wasm@1 and wasm-module@1
  window.NoemaEmbed?.register(ACT);               // external-embed@1
  /* i18n-ignore-end */
})();
