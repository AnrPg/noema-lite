/* ===================== interactive activities — the host core (docs/INTERACTIVE.md, docs/adr/001-interactive-activities.md) =====================
   A pack may carry activities (pack.activities, format noema.activities/v1): mini-apps, minigames and simulations. They appear as a
   theory block { t: 'interactive', activity } (an explorer, not graded) or as an exercise { type: 'sim', activity, task, grade, hints }.
   This file is the trusted core (ports & adapters): it knows only the RuntimeAdapter port, never a runtime by name.
     registerRuntime({ id, version, mount(slot, ctx) → port, autoHeight? })   a runtime (html-app@1 in 34_activity_html.js, sim-spec@1 in
                                                                       35_activity_sim.js; more in P3–P4). autoHeight: it renders in the
                                                                       app's own DOM and takes the height it needs (no frame)
     registerEngine({ id, check?(spec) → problems, create(spec, {seed, task}) → { run(inputs) → outputs }, workerSource? })
                                                                       an engine of sim-spec@1 (formula@1 built in; the circuit engine in P3)
     registerGrader({ id, grade(session, ex) → { ok, score } | null })   reported (the activity's own result), checks (rules the app evaluates)
   The anti-corruption layer is ACTP (below): the only code that reads what an activity sends. Everything an activity says is
   untrusted: checked by shape and size, rate-limited, never run, never put in the page as HTML. */

const ACTP = (() => {
  /* i18n-ignore-start */   // protocol names and limits, not text
  const P = 'noema.activity', V = 1;
  const LIM = { msg: 64 * 1024, state: 256 * 1024, eventData: 4096, eventsPerSec: 50, eventsPerAttempt: 2000, strikes: 5, text: 300, detail: 500 };
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const isInt = v => Number.isInteger(v);
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  const NAME = /^[a-z][a-z0-9_.:-]{0,63}$/, CODE = /^[a-z0-9_.-]{1,40}$/;
  const size = v => { try { return JSON.stringify(v).length; } catch (e) { return Infinity; } };
  /** the payload rules per message type an activity may send (docs/INTERACTIVE.md §8) */
  const IN = {
    ready: p => (p.protocols == null || (Array.isArray(p.protocols) && p.protocols.length <= 8 && p.protocols.every(isInt))) && (p.wants == null || (Array.isArray(p.wants) && p.wants.length <= 16 && p.wants.every(w => str(w, 40)))),
    resize: p => typeof p.h === 'number' && isFinite(p.h) && p.h >= 0 && p.h <= 20000,
    state: p => isInt(p.version) && p.version >= 1 && p.version <= 1e6 && 'data' in p && size(p.data) <= LIM.state,
    event: p => NAME.test(p.name || '') && (p.data === undefined || size(p.data) <= LIM.eventData),
    result: p => typeof p.score === 'number' && p.score >= 0 && p.score <= 1 && typeof p.passed === 'boolean' && (p.detail == null || str(p.detail, LIM.detail)),
    'hint:request': p => true,
    'a11y:announce': p => str(p.text, LIM.text) && p.text.trim().length > 0,
    error: p => CODE.test(p.code || '') && (p.message == null || str(p.message, LIM.detail)),
    pong: p => true, ack: p => true, nack: p => true,
    // py-module@1 (37_activity_py.js): the runner's own messages, checked in full by NoemaPy.protocol before they get here; the core only notes them
    'py:out': p => (p.outputs == null || isObj(p.outputs)) && (p.error == null || (isObj(p.error) && CODE.test(p.error.code || ''))),
    'py:status': p => typeof p.phase === 'string' && p.phase.length <= 20,
    // html-app@1: a mini-app asks for an engine of the library (34_activity_html.js engineBridge checks the rest: declared, the spec, the inputs)
    'engine:check': p => str(p.engine, 40) && isObj(p.spec),
    'engine:run': p => str(p.engine, 40) && isObj(p.spec) && (p.inputs == null || isObj(p.inputs)) && (p.seed == null || (isInt(p.seed) && p.seed >= 0 && p.seed <= 4294967295)),
    // html-app@1: several engines of the library in one spec (docs/INTERACTIVE.md §12.8: {consts?, derived?, parts, couple?}), noema.sim(spec).run(inputs)
    'sim:run': p => isObj(p.spec) && (p.inputs == null || isObj(p.inputs)) && (p.seed == null || (isInt(p.seed) && p.seed >= 0 && p.seed <= 4294967295)),
  };
  /** → { ok: true, msg } | { ok: false, why, ignore? } — ignore: an unknown type (counted, not a strike) */
  function check(data) {
    if (!isObj(data)) return { ok: false, why: 'not an object' };
    if (data.p !== P) return { ok: false, why: 'not this protocol' };
    if (data.v !== V) return { ok: false, why: 'protocol version ' + data.v, version: true };
    if (size(data) > LIM.msg + (data.type === 'state' ? LIM.state : 0)) return { ok: false, why: 'message too big' };
    if (!str(data.type, 40)) return { ok: false, why: 'no type' };
    if (data.id != null && !str(data.id, 64)) return { ok: false, why: 'bad id' };
    if (data.re != null && !str(data.re, 64)) return { ok: false, why: 'bad re' };
    const payload = data.payload == null ? {} : data.payload;
    if (!isObj(payload)) return { ok: false, why: 'payload is not an object' };
    const rule = Object.prototype.hasOwnProperty.call(IN, data.type) ? IN[data.type] : null;
    if (!rule) return { ok: false, why: 'unknown type ' + data.type, ignore: true };
    if (!rule(payload)) return { ok: false, why: 'bad ' + data.type };
    return { ok: true, msg: { type: data.type, id: data.id, re: data.re, payload } };
  }
  const out = (type, payload, extra) => ({ p: P, v: V, type, payload: payload || {}, ...(extra || {}) });
  /* i18n-ignore-end */
  return { P, V, LIM, check, out, size };
})();

const ACT = (() => {
  /* i18n-ignore-start */
  const reg = Noema.pack?.activities;
  const ITEMS = {}; for (const a of (reg && Array.isArray(reg.items) ? reg.items : [])) if (a && typeof a.id === 'string') ITEMS[a.id] = a;
  const PARTS = reg && reg.parts && typeof reg.parts === 'object' && !Array.isArray(reg.parts) ? reg.parts : {};   // activities/_parts: the parts a spec reuses ({use, with}, docs/INTERACTIVE.md §12.8)
  const RUNTIMES = {}, GRADERS = {}, ENGINES = {};
  // every runtime is on unless config.js switches it off (docs/adr/001 §4 "Feature flags"): NOEMA_CONFIG.activities['py-module@1'] = false;
  // py-module@1 still needs NoemaPy.available() (the website: never file:// or the one-file bundle)
  const flags = () => Object.assign({ 'html-app@1': true, 'py-module@1': true }, window.NOEMA_CONFIG?.activities || {});
  /** a runtime that is registered, switched on and can run here (available(): py-module@1 only on the website, never file:// or the one-file bundle) */
  const enabled = id => !!(Object.prototype.hasOwnProperty.call(RUNTIMES, id) && flags()[id] !== false && (typeof RUNTIMES[id].available !== 'function' || RUNTIMES[id].available()));
  /** the capabilities of this app (pack.requires): the core + every runtime that is registered and switched on */
  const caps = () => new Set(['activities/v1', ...Object.keys(RUNTIMES).filter(enabled).map(id => 'runtime:' + id), ...engines().map(id => 'engine:' + id)]);
  const canRun = a => !!(a && enabled(a.runtime));
  const LIVE = [];   // the activities running now (at most liveMax())
  const liveMax = () => innerWidth < 720 ? 1 : 2;
  const rnd32 = () => (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
  const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  /* i18n-ignore-end */

  /** The strings of an activity in the language the pack is shown in (then the pack's own, then English, then any). */
  function strings(a) {
    const all = a?.strings && typeof a.strings === 'object' ? a.strings : {};
    for (const l of [SUBJ.language, SUBJ.sourceLanguage, 'en', Object.keys(all)[0]]) if (l && all[l]) return { locale: l, table: all[l] };
    return { locale: SUBJ.language || 'en', table: {} };
  }
  /** The app's design tokens, sent in init / theme (CSS custom properties of the page right now). */
  function theme() {
    const cs = getComputedStyle(document.documentElement), tk = {};
    for (const k of ['bg', 'bg2', 'card', 'ink', 'ink2', 'ink3', 'line', 'ok', 'ok-bg', 'bad', 'bad-bg', 'warn', 'warn-bg', 'info', 'info-bg', 'c', 'c-bg', 'font', 'mono', 'r', 'r-sm']) { const v = cs.getPropertyValue('--' + k).trim(); if (v && v.length < 200) tk[k] = v; }
    const bg = cs.backgroundColor || '', m = bg.match(/\d+(\.\d+)?/g), lum = m ? (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 : 1;
    return { tokens: tk, scheme: lum < 0.5 ? 'dark' : 'light', reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, textScale: parseFloat(cs.fontSize) / 16 || 1, dir: document.documentElement.dir || 'ltr' };
  }
  /** a runtime: { id, version, mount(slot, ctx) → port, autoHeight?, available?() → false where it cannot run (its fallback shows, with unavailable?() as the note),
      failText?(code) → { text, restart } | null (its own words for a failure code; else the core's) } */
  function registerRuntime(def) { if (def && def.id && typeof def.mount === 'function') RUNTIMES[def.id] = def; }
  function registerGrader(def) { if (def && def.id && typeof def.grade === 'function') GRADERS[def.id] = def; }
  /** an engine of sim-spec@1: { id: 'name@N', check?(spec) → [problems], create(spec, {seed, task}) → { run(inputs) → outputs }, workerSource? }
      (workerSource: the engine's code as text, defining self.noemaEngine = { create }; it then runs in a Worker — docs/INTERACTIVE.md §12.6) */
  function registerEngine(def) { if (def && typeof def.id === 'string' && /^[a-z][a-z0-9-]*@\d+$/.test(def.id) && typeof def.create === 'function') ENGINES[def.id] = def; }
  /** the engine library (src/engines, NoemaCore.engines): its engines are known at once and loaded when an activity needs one */
  const LIBR = () => window.NoemaCore?.engines || null;
  /** an engine ready to run: one registered here, or one of the library once it is loaded (null before) */
  const engine = id => Object.prototype.hasOwnProperty.call(ENGINES, id) ? ENGINES[id] : LIBR()?.engine(id) || null;
  /** every engine this app has: the registered ones and the library's, loaded or not */
  const engines = () => [...new Set([...Object.keys(ENGINES), ...(LIBR()?.ids() || [])])];
  /** the library engines an activity needs (its spec's engine, its parts', a mini-app's) and not loaded yet */
  function unloaded(a) {
    const L = LIBR(), need = window.NoemaPackCheck?.needRequires ? NoemaPackCheck.needRequires([a], PARTS) : [];
    return L ? need.filter(r => r.startsWith('engine:')).map(r => r.slice(7)).filter(id => !Object.prototype.hasOwnProperty.call(ENGINES, id) && L.has(id) && !L.loaded(id)) : [];
  }

  /* ---------- persistence: S.act (explorer state per activity and place) and S.att (the last attempt of each sim exercise) ---------- */
  const STATE_MAX = ACTP.LIM.state, KEEP_EVENTS = 200;
  function loadState(key) { const s = S.act?.[key]; return s && typeof s === 'object' ? s : null; }
  function saveState(key, version, data) { S.act = S.act || {}; S.act[key] = { v: version, data, t: Date.now() }; save(); }
  function saveAttempt(sess) {
    if (!sess.ex) return;
    S.att = S.att || {};
    // the last attempt wins: a session that is torn down later (its card left the page) never overwrites an attempt begun after it
    const had = S.att[sess.ex.id]; if (had && had.id !== sess.attemptId && (had.t0 || 0) > sess.t0) return;
    S.att[sess.ex.id] = { id: sess.attemptId, seed: sess.seed, t0: sess.t0, t: Date.now(), hints: sess.hintsUsed, result: sess.result, events: sess.events.slice(-KEEP_EVENTS) };
    save();
  }

  /* ---------- graders (Strategy): reported — the activity reports its result; checks — host-side rules (P2, the expression language) ---------- */
  registerGrader({ id: 'reported', grade: sess => sess.result ? { ok: !!sess.result.passed, score: sess.result.score } : null });
  /** checks: { mode: 'checks', checks: [{ expr, label?, weight? }], pass? } — the app evaluates each expression on the activity's current
      values (params, derived, the engine's outputs; runtimes that expose them: sim-spec@1). score = the weighted share of checks met,
      × 0.85 per hint used (never below × 0.5); passed = share >= pass (default 1). Nothing done yet (no event) → null: Check waits. */
  const truthy = v => typeof v === 'boolean' ? v : (typeof v === 'number' && v !== 0 && v === v);
  registerGrader({ id: 'checks', grade(sess, ex) {
    const X = LIBR()?.expr, vals = sess.values?.(); if (!vals || !sess.events.length || !X) return null;
    const cs = Array.isArray(ex?.grade?.checks) ? ex.grade.checks : [];
    let tot = 0, got = 0; const per = [];
    for (const c of cs) {
      const w = typeof c?.weight === 'number' && c.weight > 0 ? c.weight : 1; let met = false;
      try { met = truthy(X.evaluate(String(c.expr), vals)); } catch (e) { met = false; }
      tot += w; if (met) got += w; per.push({ label: c?.label || null, ok: met });
    }
    const share = tot ? got / tot : 0, pass = typeof ex.grade.pass === 'number' ? ex.grade.pass : 1, factor = Math.max(0.5, Math.pow(0.85, sess.hintsUsed || 0));
    sess.result = { score: Math.round(share * factor * 1e4) / 1e4, passed: share >= pass - 1e-9, detail: per.map(x => (x.ok ? '+' : '-') + (x.label || '')).join(' ').slice(0, 500), checks: per, t: Date.now() };
    return { ok: sess.result.passed, score: sess.result.score, checks: per };
  } });

  /** Mount an activity into `el`. ctx: { ex?, task?, place, height?, aspect?, caption?, start? (mount now, not when seen) }.
      → the session (destroy, restart, grade) — always returns, even when the activity cannot run (it then shows its fallback). */
  function mount(el, actId, ctx = {}) {
    const a = ITEMS[actId];
    const root = h('div', { class: 'act' + (ctx.ex ? ' act-ex' : ''), 'data-activity': actId });
    const skipTarget = h('span', { class: 'act-after', tabindex: '-1' });
    const skip = h('a', { class: 'act-skip', href: '#', onclick: e => { e.preventDefault(); skipTarget.focus(); } }, tE('engine.act.skip'));
    const box = h('div', { class: 'act-box' });
    const bar = h('div', { class: 'act-bar' });
    const note = h('div', { class: 'act-note', role: 'status', 'aria-live': 'polite' });
    const live = h('div', { class: 'act-sr', 'aria-live': 'polite' });
    root.append(skip, box, bar, note, live, skipTarget);
    if (ctx.caption) root.append(h('div', { class: 'caption', html: fmt(ctx.caption) }));
    el.append(root);
    const sess = { act: a, ex: ctx.ex || null, root, attemptId: uid(), t0: Date.now(), seed: null, events: [], result: null, hintsUsed: 0, state: null, port: null, strikes: 0, alive: false, misses: 0, evWin: [], destroyed: false, onResult: null };
    sess.key = ctx.ex ? null : 'blk:' + (ctx.place || '') + ':' + actId;
    const seedOf = () => { const s = ctx.task?.seed; return Number.isInteger(s) ? s >>> 0 : rnd32(); };

    const fallback = (why) => {
      box.innerHTML = ''; box.classList.add('act-fallback'); box.style.height = '';
      const f = a?.fallback || {};
      if (f.media && MEDIA[f.media] && STUDY) box.append(STUDY.figure({ t: 'figure', media: f.media, explore: false }));   // the study area's figure (src/features/study/ui/exercise/visual.ts)
      if (f.text) box.append(h('p', { class: 'act-fbtext', html: fmt(f.text) }));
      if (why) note.textContent = why;
    };
    const setBar = (...btns) => { bar.innerHTML = ''; bar.append(...btns.filter(Boolean)); };
    const btn = (label, onclick, cls = 'btn small') => h('button', { class: cls, type: 'button', onclick }, label);

    if (!a) { fallback(tE('engine.act.missing')); return Object.assign(sess, { destroy() { }, grade: () => null }); }
    if (!canRun(a)) { const R0 = RUNTIMES[a.runtime], why = R0 && flags()[a.runtime] !== false && typeof R0.unavailable === 'function' ? R0.unavailable() : null; fallback(why || tE('engine.act.notHere')); return Object.assign(sess, { destroy() { }, grade: () => null }); }

    let timer = null, pingT = null, io = null, saveT = null;
    function stop(reason, offerRestart = true) {
      teardown();
      fallback(reason);
      setBar(offerRestart ? btn('↻ ' + tE('engine.act.restart'), () => start()) : null);
    }
    function teardown() {
      sess.alive = false; clearInterval(pingT); clearTimeout(timer); clearTimeout(saveT);
      try { sess.port?.send('destroy'); } catch (e) { }
      try { sess.port?.close(); } catch (e) { }
      sess.port = null;
      const i = LIVE.indexOf(sess); if (i >= 0) LIVE.splice(i, 1);
      box.innerHTML = ''; box.classList.remove('act-running');
    }
    function strike(why) {
      sess.strikes++; console.warn('[noema] activity', actId, why);
      if (sess.strikes >= ACTP.LIM.strikes) stop(tE('engine.act.misbehaved'));
    }
    function makeRoom() {
      while (LIVE.length >= liveMax()) { const old = LIVE.find(s => s !== sess && !s.ex) || LIVE.find(s => s !== sess); if (!old) break; old.park(); }
    }
    /** a message from the activity, already checked by ACTP */
    function onMessage(m) {
      const p = m.payload;
      switch (m.type) {
        case 'ready': sess.alive = true; note.textContent = ''; return;
        case 'pong': sess.misses = 0; return;
        case 'resize': { if ((ctx.height && ctx.height !== 'auto') || RUNTIMES[a.runtime]?.autoHeight) return; const hpx = Math.max(160, Math.min(Math.round(p.h), Math.round(innerHeight * 1.5), 2000)); box.style.height = hpx + 'px'; return; }
        case 'state': {
          if (!sess.key) { sess.state = { version: p.version, data: p.data }; return; }
          sess.state = { version: p.version, data: p.data };
          clearTimeout(saveT); saveT = setTimeout(() => saveState(sess.key, p.version, p.data), 400); return;
        }
        case 'event': {
          const now = Date.now(); sess.evWin = sess.evWin.filter(t => now - t < 1000); sess.evWin.push(now);
          if (sess.evWin.length > ACTP.LIM.eventsPerSec) return strike('too many events');
          if (sess.events.length >= ACTP.LIM.eventsPerAttempt) return;
          sess.events.push({ t: now, name: p.name, data: p.data }); return;
        }
        case 'result': sess.result = { score: p.score, passed: p.passed, detail: p.detail || null, t: Date.now() }; sess.onResult?.(sess.result); return;
        case 'hint:request': { const r = sess.nextHint?.(); sess.port?.send('hint', { text: r || null }, { re: m.id }); return; }
        case 'a11y:announce': live.textContent = ''; setTimeout(() => { live.textContent = p.text; }, 30); return;
        case 'py:out': case 'py:status': return;   // the Python runtime's own traffic (37_activity_py_ui.js reads it)
        case 'error':
          if (p.code === 'runaway') return stop(tE('engine.act.stopped'));
          note.textContent = tE('engine.act.error', { code: p.code }); console.warn('[noema] activity error', actId, p.code, p.message || ''); return;
      }
    }
    // a runtime that first shows a card and no frame (external-embed@1 before consent) does not count toward the live activities
    // until it says so (ctx.onLive): a card holds no slot and parks nothing (docs/INTERACTIVE_EMBED.md)
    const waits = () => { try { return !!RUNTIMES[a.runtime].waits?.(a); } catch (e) { return false; } };
    function goLive() { if (sess.destroyed || !sess.port || LIVE.includes(sess)) return; makeRoom(); LIVE.push(sess); }
    /** start: first the library engines the activity needs (each loaded once, on demand), then the runtime. A failed load shows as
        the runtime's own failure (its engine is missing) */
    function start() {
      if (sess.destroyed) return;
      const want = unloaded(a);
      if (!want.length) return begin();
      teardown(); box.classList.remove('act-fallback'); note.textContent = tE('engine.act.loading');
      const tok = sess.loading = {};
      LIBR().load(want).then(() => { if (sess.loading === tok && !sess.destroyed) begin(); });
    }
    function begin() {
      sess.loading = null;
      if (sess.destroyed) return;
      const waiting = waits();
      teardown(); if (!waiting) makeRoom();
      box.classList.remove('act-fallback'); box.classList.add('act-running'); note.textContent = tE('engine.act.loading');
      setBar(btn('↻ ' + tE('engine.act.restart'), () => { sess.attemptId = uid(); sess.events = []; sess.result = null; start(); }, 'btn ghost small'),
        document.fullscreenEnabled ? btn('⛶ ' + tE('engine.act.fullscreen'), () => { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().catch(() => { }); }, 'btn ghost small') : null);
      if (RUNTIMES[a.runtime].autoHeight) { box.style.height = ''; box.style.aspectRatio = ''; }   // rendered by the app itself: as tall as it needs
      else if (ctx.height && ctx.height !== 'auto') box.style.height = Math.max(120, Math.min(+ctx.height || 360, 2000)) + 'px';
      else if (ctx.aspect && /^\d+:\d+$/.test(ctx.aspect)) { const [w, hh] = ctx.aspect.split(':').map(Number); box.style.aspectRatio = w + ' / ' + hh; }
      else box.style.height = (a.height && +a.height) ? Math.min(+a.height, 2000) + 'px' : '360px';
      if (sess.seed == null || !ctx.ex) sess.seed = seedOf();
      const st = strings(a), saved = sess.key ? loadState(sess.key) : null;
      let state = null, notice = null;
      if (saved) {
        const want = a.stateVersion || 1;
        if (saved.v === want) state = { version: saved.v, data: saved.data };
        else if (saved.v < want) state = { version: saved.v, data: saved.data, migrateFrom: saved.v };
        else notice = tE('engine.act.newerState');   // kept untouched for the newer app; this one starts clean
      }
      const init = { activityId: a.id, exerciseId: sess.ex?.id || null, attemptId: sess.attemptId, seed: sess.seed, task: ctx.task?.params || {},
        locale: st.locale, strings: st.table, theme: theme(), state, stateVersion: a.stateVersion || 1, capabilities: (a.capabilities || []).filter(c => ['state', 'events', 'resize', 'result', 'hints', 'announce'].includes(c)),
        limits: { msgBytes: ACTP.LIM.msg, stateBytes: ACTP.LIM.state, eventsPerSec: ACTP.LIM.eventsPerSec } };
      sess.misses = 0;
      try {
        sess.port = RUNTIMES[a.runtime].mount(box, { act: a, init, title: tE('engine.act.frameTitle', { id: a.id }),
          onLive: () => Promise.resolve().then(goLive),
          onMessage: raw => { const r = ACTP.check(raw); if (r.ok) onMessage(r.msg); else if (r.version) stop(tE('engine.act.newerProtocol'), false); else if (!r.ignore) strike(r.why); },
          onFail: why => { const own = RUNTIMES[a.runtime].failText?.(why); return own ? stop(own.text, !!own.restart) : why === 'unsupported' ? stop(tE('engine.act.notHere'), false) : why === 'spec' ? stop(tE('engine.act.failed'), false)
            : why === 'runaway' ? stop(tE('engine.act.stopped'))
            // external-embed@1 (docs/INTERACTIVE_EMBED.md): refused or mounted as an exercise → the fallback for good; offline or not loaded → Restart retries
            : why === 'embed-refused' || why === 'embed-graded' ? stop(tE('engine.act.embed.refused'), false)
            : why === 'embed-offline' ? stop(tE('engine.act.embed.offline'))
            : why === 'embed-timeout' ? stop(tE('engine.act.embed.timeout', { provider: (window.NoemaEmbed?.PROVIDERS || []).find(p => p.id === a.provider)?.name || String(a.provider || '') }))
            : stop(why === 'navigated' ? tE('engine.act.misbehaved') : tE('engine.act.failed')); } });
      } catch (e) { console.warn('[noema] activity mount failed', e); return stop(tE('engine.act.failed')); }
      if (notice) note.textContent = notice;
      if (!waiting) LIVE.push(sess);
      // watchdog: ping every 2 s; three missed answers → stopped, with Restart (the loop guard trips sooner, 34_activity_html.js)
      pingT = setInterval(() => {
        if (!root.isConnected) return destroy();
        if (!sess.port) return;
        if (sess.misses >= 3) return stop(tE('engine.act.stopped'));
        sess.misses++; sess.port.send('ping');
      }, 2000);
      // a frame that never says hello: its start timed out
      timer = setTimeout(() => { if (!sess.alive) stop(tE('engine.act.failed')); }, 15000);
    }
    sess.park = () => { if (!sess.port) return; teardown(); fallback(''); setBar(btn('▶ ' + tE('engine.act.start'), () => start(), 'btn primary small')); };
    function destroy() { if (sess.destroyed) return; if (sess.ex && (sess.events.length || sess.result)) saveAttempt(sess); teardown(); sess.destroyed = true; io?.disconnect(); }
    sess.destroy = destroy; sess.restart = () => start();
    sess.grade = () => { const g = GRADERS[sess.ex?.grade?.mode || 'reported']; return g ? g.grade(sess, sess.ex) : null; };
    sess.saveAttempt = () => saveAttempt(sess);
    sess.send = (type, payload) => sess.port?.send(type, payload);
    sess.values = () => (sess.port && typeof sess.port.values === 'function' ? sess.port.values() : null);   // what the checks grader reads
    // lazy: an explorer starts when it comes into view (and only while there is room); offscreen it is paused
    if (ctx.start || !('IntersectionObserver' in window)) start();
    else {
      fallback(''); setBar(btn('▶ ' + tE('engine.act.start'), () => start(), 'btn primary small'));
      io = new IntersectionObserver(es => {
        for (const e of es) {
          if (e.isIntersecting && !sess.port && !sess.parked && (LIVE.length < liveMax() || waits())) start();
          else if (sess.port && sess.alive) sess.port.send(e.isIntersecting ? 'resume' : 'pause');
        }
      }, { threshold: 0.15 });
      io.observe(root);
    }
    return sess;
  }
  /** Leaving a page: every activity whose element left the page is destroyed. */
  function sweep() { for (const s of [...LIVE]) if (!s.root.isConnected) s.destroy(); }
  addEventListener('hashchange', () => setTimeout(sweep, 0));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTimeout(() => LIVE.forEach(s => s.send('theme', theme())), 50));

  /* ---------- content the app cannot show: never a crash (docs/adr/001 D1) ---------- */
  const knownType = t => !!(window.NoemaPackCheck?.TYPES?.has(t));
  /** A chapter's exercises without the ones this app cannot run (an unknown type from a newer app, a sim whose runtime is off here):
      they stay in the pack and come back once the app can show them. */
  const runnable = e => knownType(e.type) && (e.type !== 'sim' || canRun(ITEMS[e.activity]));
  function keepRunnable(c) {
    const keep = [], hidden = [];
    for (const e of c.exercises || []) (runnable(e) ? keep : hidden).push(e);
    if (hidden.length) { c.exercises = keep; c._hidden = (c._hidden || 0) + hidden.length; }
    return hidden;
  }
  return { ITEMS, PARTS, mount, sweep, registerRuntime, runtime: id => RUNTIMES[id] || null, enabled, registerGrader, registerEngine, engine, engines, caps, canRun, runnable, keepRunnable, strings, theme, LIVE };
})();

/* the exercises already indexed (10_core.js) that this app cannot run leave the indexes; the pack is unchanged */
function dropUnrunnable() {
  for (const c of COURSE) for (const e of ACT.keepRunnable(c)) { delete EX[e.id]; const i = ALL_EX.indexOf(e); if (i >= 0) ALL_EX.splice(i, 1); }
}

/** A pack that needs what this app lacks (pack.requires): a newer build of the website may have it — the open tab reloads when it
    comes back to the front (engine/curjobs.js App.stale); meanwhile every activity shows its fallback. */
function checkRequires() {
  const req = Array.isArray(Noema.pack?.requires) ? Noema.pack.requires.filter(x => typeof x === 'string') : [];
  const have = ACT.caps(), lack = req.filter(x => !have.has(x));
  if (lack.length) { console.warn('[noema] this pack needs', lack.join(', ')); window.NoemaCurJobs?.App?.stale?.(); }
  return lack;
}

/* ---------- the theory block and the exercise type ---------- */
/** { t: 'interactive', activity, caption?, height?, aspect? } — an explorer in the theory (not graded). */
function interactiveBlock(b) {
  const wrap = h('div', { class: 'act-blk' });
  const sid = (typeof b._sec === 'string' && b._sec) || '';
  ACT.mount(wrap, b.activity, { place: sid, height: b.height, aspect: b.aspect, caption: b.caption });
  return wrap;
}
/** The text of an interactive block for the AI and for search: its fallback text (what it shows and teaches). */
function interactiveAsText(b) { const a = ACT.ITEMS[b.activity]; return `[Interactive activity ${b.activity}] ${a?.fallback?.text || ''}${b.caption ? '\nCaption: ' + b.caption : ''}`; }   // i18n-ignore (AI context)

/** exercise type sim: the activity + a hint ladder; Check grades with the exercise's grader (reported: the activity's own result).
    The study area's exercise card shows it (its host's activities.exercise, engine/src/40_views.js). */
function simWidget(ex, api) {
  const holder = h('div', { class: 'act-exwrap' });
  const sess = ACT.mount(holder, ex.activity, { ex, task: ex.task, start: true });
  const hints = Array.isArray(ex.hints) ? ex.hints.filter(x => typeof x === 'string') : [];
  let used = 0;
  const hintBox = h('div', { class: 'act-hints' });
  const hintBtn = hints.length ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => showHint() }) : null;
  const label = () => { if (hintBtn) { hintBtn.textContent = '💡 ' + tE('engine.act.hint', { left: hints.length - used }); hintBtn.disabled = used >= hints.length || api.locked(); } };
  function showHint() { if (used >= hints.length || api.locked()) return null; const t = hints[used++]; sess.hintsUsed = used; hintBox.append(h('div', { class: 'fb', html: fmt(t) })); label(); return t; }
  sess.nextHint = showHint;
  label();
  const checksBox = h('div', { class: 'act-checks' });
  const el = h('div', {}, holder, hintBtn ? h('div', { class: 'row', style: { marginTop: '8px' } }, hintBtn) : null, hintBox, checksBox);
  /** the checks grader's verdict per check (its label from the activity's strings), so the learner sees which condition failed */
  function showChecks(per) {
    const T = ACT.strings(ACT.ITEMS[ex.activity]).table || {}, met = per.filter(x => x.ok).length;
    checksBox.replaceChildren(h('div', { class: 'act-checks-sum' }, tE('engine.act.sim.checks', { met, total: per.length })),
      h('ul', {}, per.filter(x => x.label && T[x.label]).map(x => h('li', { class: x.ok ? 'ok' : 'bad' }, (x.ok ? '✓ ' : '✗ ') + T[x.label]))));   // i18n-ignore (marks)
  }
  return {
    el,
    answer: () => { const g = sess.grade?.(); return g ? { ok: g.ok, score: g.score } : {}; },
    check() { const g = sess.grade?.(); if (!g) return null; if (Array.isArray(g.checks)) showChecks(g.checks); sess.saveAttempt?.(); return NoemaCore.study.grade(ex, { ok: !!g.ok, ...(typeof g.score === 'number' ? { score: g.score } : {}) }).ok; },
    reveal() { if (hintBtn) hintBtn.disabled = true; try { sess.port?.reveal?.(); } catch (e) { } if (sess.result?.passed && ex.reveal) el.append(h('div', { class: 'explain' }, h('div', { html: fmt(ex.reveal) }))); },
    bonus: () => -Math.round((4 + (ex.difficulty || 1) * 4) * (1 - Math.max(0.5, Math.pow(0.85, used)))),   // each hint used: score × 0.85, never below × 0.5 (docs/adr/001 D8)
    given: () => sess.result ? `(the activity reported: ${sess.result.passed ? 'passed' : 'not passed'}, score ${sess.result.score}${sess.result.detail ? ', ' + sess.result.detail : ''})` : '',   // i18n-ignore (AI context)
  };
}
