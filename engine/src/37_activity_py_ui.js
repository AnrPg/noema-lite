/* ===================== py-module@1 in the app: the spec view computed by Python, the learner's notes, Settings (docs/INTERACTIVE_PYTHON.md) =====================
   The runner (37_activity_py.js, NoemaPy.mountRunner) computes; the app renders. A py-module@1 item carries Python (act.python, a function
   step(inputs, state) → outputs) and a spec in the sim-spec@1 format (params, derived, outputs, readouts, plots — no engine, no bench):
   the sim-spec view of 35_activity_sim.js (ACT.simView) draws the controls, readouts and plots and asks Python for the outputs of the
   latest inputs (one step at a time, the latest inputs win; the view's rev gate keeps the checks grader on the latest results).
   So the checks grader works on Python's scalar outputs exactly as on an engine's, and noema.result() still reports ('reported').
   The learner sees one quiet line above the controls: the first-use download (sizes from the manifest), the network an extra package
   needs (requiresNetwork), the loading progress; offline without the files → the fallback with what to do. Settings › Data and sync:
   "Prepare Python for offline" (37 MB with scipy), with progress and what is on the device (pyOfflineSection). */
(() => {
  if (typeof ACT === 'undefined' || !window.NoemaPy) return;
  const PY = window.NoemaPy, RUNNER = PY.mountRunner;
  /* i18n-ignore-start */
  const ID = 'py-module@1';
  const roundMB = n => tE('engine.common.sizeMB', { size: nf(Math.max(1, Math.round(n / 1e6))) });   // "about 17 MB"
  const metered = () => { const c = navigator.connection; return !!(c && (c.saveData || c.type === 'cellular')); };
  /* i18n-ignore-end */

  function mount(box, ctx) {
    const { act, init, onMessage, onFail } = ctx;
    let closed = false, R = null, view = null, firstUse = false, latest = null, busy = false;
    const sv = init.state && init.state.data && typeof init.state.data === 'object' ? init.state.data : null;
    let pyState = sv && 'py' in sv ? sv.py : undefined;   // what Python saved with noema.save_state (kept beside the controls' values)
    const pyInit = { ...init, state: pyState === undefined ? null : { version: init.state.version, data: pyState, ...(init.state.migrateFrom ? { migrateFrom: init.state.migrateFrom } : {}) } };
    const line = h('div', { class: 'act-pyline', role: 'status', 'aria-live': 'polite' });
    const holder = h('div', { class: 'act-pyrun' });   // the hidden runner frame
    /** the view's engine: Python's step() for the latest inputs, one at a time */
    const runner = { run(inputs, done) { latest = { inputs, done }; pump(); }, measure() { }, close() { latest = null; } };
    function pump() {
      if (closed || !R || busy || !latest) return;
      const job = latest; latest = null; busy = true;
      R.step(job.inputs).then(r => {
        busy = false; if (closed) return;
        if (r && r.outputs) { if (line.dataset.k === 'err') say('', ''); job.done(r.outputs); }
        else {
          const code = (r && r.error && r.error.code) || 'python';
          if (!['superseded', 'closed', 'stopped', 'runaway'].includes(code)) { console.warn('[noema] python step', act.id, code, r?.error?.message || ''); say(tE('engine.act.py.stepError', { code }), 'err'); job.done(null); }
        }
        pump();
      });
    }
    function say(text, k) { line.textContent = text; line.dataset.k = k || ''; line.hidden = !text; }
    function fromPy(raw) {
      if (closed) return;
      const t = raw && raw.type;
      if (t === 'ready' || t === 'pong' || (typeof t === 'string' && t.startsWith('py:'))) return;   // the view speaks for the activity; py:* are read below
      if (t === 'state') { pyState = raw.payload ? raw.payload.data : null; view?.saveSoon?.(); return; }
      onMessage(raw);   // event, result, a11y:announce, error (runaway → the core stops it, with Restart): the core checks each with ACTP
    }
    function progress(p) {
      if (closed || !p) return;
      if (p.phase === 'loading' && firstUse && p.totalBytes) say(tE('engine.act.py.loading', { done: fmtBytes(p.bytes || 0), total: fmtBytes(p.totalBytes) }), 'load');
      else if (p.phase === 'starting' || (p.phase === 'loading' && !firstUse)) say(tE('engine.act.py.starting'), 'start');
      else if (p.phase === 'ready') say('', '');
    }
    function go() {
      if (closed || R) return;
      R = RUNNER(holder, { act, init: pyInit, title: ctx.title, onMessage: fromPy, onFail: why => { if (!closed) onFail(why); } });
      R.on('py:status', progress);
      pump();
    }
    async function boot() {
      let n = null; try { n = await PY.need(act.packages || []); } catch (e) { n = null; }   // no manifest: the runner says offline
      if (closed) return;
      if (n && n.missing) {
        firstUse = true;
        const size = roundMB(n.missingBytes), net = act.requiresNetwork === true && n.extrasMissing.length;
        say(tE('engine.act.py.firstUse', { size }) + (net ? ' ' + tE('engine.act.py.network', { packages: n.extrasMissing.join(', ') }) : ''), 'first');
        if (metered()) { line.append(' ', h('button', { class: 'btn small', type: 'button', onclick: e => { e.target.remove(); go(); } }, tE('engine.act.py.download', { size }))); return; }   // never by itself on mobile data
      }
      go();
    }
    view = ACT.simView(box, { act, init, onMessage: m => { if (!closed) onMessage(m); }, onFail }, {
      engine: { id: ID }, check: { python: true },
      runner: () => runner,
      stateExtra: () => pyState === undefined ? {} : { py: pyState },
      decorate: root => { say('', ''); root.prepend(line); root.append(holder); Promise.resolve().then(boot); },   // only once the spec has passed its check
    });
    function close() { if (closed) return; closed = true; latest = null; try { R?.close(); } catch (e) { } view.close(); }
    return {
      send(type, payload, extra) { if (type === 'locale') R?.send('locale', payload); view.send(type, payload, extra); if (type === 'destroy') close(); },
      close, values: () => (closed ? null : view.values()), reveal: () => view.reveal?.(),
    };
  }
  ACT.registerRuntime({
    id: ID, version: 1, autoHeight: true, startTimeoutMs: 120000, mount,
    available: () => PY.available(),
    unavailable: () => tE('engine.act.py.noHere'),
    failText: code => code === 'offline' || code === 'fetch' ? { text: tE('engine.act.py.offline'), restart: true }
      : code === 'unavailable' ? { text: tE('engine.act.py.noHere'), restart: false }
        : code === 'timeout' ? { text: tE('engine.act.py.slow'), restart: true } : null,
  });

  /** Settings › Data and sync: "Prepare Python for offline" — the core, numpy, scipy and the allow-listed extras, with progress and what is
      on the device (one line; the details per part in its ⓘ). Only where Python activities can run (the website, the runtime switched on). */
  window.pyOfflineSection = function pyOfflineSection() {
    if (!ACT.enabled(ID)) return null;
    const line = h('span', { class: 'tiny' }, tE('engine.py.checking'));
    const info = h('span', {});
    const bar = h('progress', { class: 'act-pybar', max: '1', value: '0', hidden: true });
    const btn = h('button', { class: 'btn small', type: 'button', 'data-py': 'prepare', hidden: true, onclick: () => prepare(false) });
    const body = h('div', { class: 'act-pyset' }, h('div', { class: 'row' }, line, info), h('div', { class: 'row' }, btn, bar));
    const sec = accSection({ line: 'download' }, tE('engine.py.title'), { status: { ok: false, text: '…' }, info: tE('engine.py.info'), body });   // i18n-ignore (a placeholder)
    const pill = sec.querySelector('summary .pill');
    let all = null;
    const setPill = (ok, text) => { pill.className = 'pill ' + (ok ? 'c' : 'warnpill'); pill.textContent = text; };
    async function draw() {
      let n = null, st = null;
      try { const man = await PY._manifest(); all = ['numpy', 'scipy', ...Object.keys(man.wheels || {})]; n = await PY.need(all); st = await PY.status(); } catch (e) { n = null; }
      if (!sec.isConnected && n === null) return;
      if (!n) { setPill(false, tE('engine.py.notReady')); line.textContent = tE('engine.py.noFiles'); btn.hidden = true; info.replaceChildren(); return; }
      const ready = n.missing === 0;
      setPill(ready, ready ? tE('engine.py.ready') : n.missing < n.files ? tE('engine.py.partly') : tE('engine.py.notReady'));
      line.textContent = ready ? tE('engine.py.have', { size: fmtBytes(n.bytes) }) : tE('engine.py.part', { have: fmtBytes(n.bytes - n.missingBytes), total: fmtBytes(n.bytes) });
      const G = st && st.groups ? st.groups : {};
      const parts = Object.entries(G).map(([k, g]) => `${k === 'core' ? 'Python' : k} ${fmtBytes(g.bytes)} ${g.ready ? '✓' : '—'}`).join(' · ');   // i18n-ignore (names and marks)
      info.replaceChildren(tip(parts + '\n' + (st && st.persisted ? tE('engine.py.kept') : tE('engine.py.mayEvict'))));
      btn.textContent = tE('engine.py.prepare', { size: fmtBytes(n.missingBytes) }); btn.hidden = ready; btn.disabled = false;
    }
    async function prepare(force) {
      btn.disabled = true; bar.hidden = false; bar.value = 0;
      const onProgress = d => { if (d.totalBytes) { bar.value = d.bytes / d.totalBytes; line.textContent = tE('engine.py.progress', { done: fmtBytes(d.bytes), total: fmtBytes(d.totalBytes) }); } };
      let r; try { r = await PY.prepareOffline({ include: all || ['numpy', 'scipy'], onProgress, force }); } catch (e) { r = { ok: false, failed: [{}], code: e.code }; }
      bar.hidden = true;
      if (r.code === 'save-data') {
        line.textContent = tE('engine.py.saveData'); btn.disabled = false;
        btn.replaceWith(h('button', { class: 'btn small', type: 'button', 'data-py': 'anyway', onclick: e => { e.target.replaceWith(btn); prepare(true); } }, tE('engine.py.anyway')));
        return;
      }
      await draw();
      if (!r.ok) line.textContent = tE('engine.py.failed', { n: (r.failed || []).length || 1 });
    }
    draw();
    return sec;
  };
})();
