/* ---------- P8 — Through Claude: ✨ new language courses, the task queue, refills (docs/LANGUAGES.md §7.4, §8, §10.1) ----------
   The tasks, their checks and merges are engine/langcore.js (P8 section) — the same code as the connector. Here: where an
   account course lives (record a:langcourse:<id> synced; content in IndexedDB + the private cloud storage langs/<id>.json,
   written by this app only), the three ways (the key on this device · the Claude app with the connector · copy / paste),
   the inbox the connector fills (a:langin:<id>:<seq>), the ✨ dialog, the #/claude page and the refill card. */
(() => {
  const LJ = N.LANGJOBS, K = LJ.KIND;
  const jparse = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
  const PRE = acc => `noema1:${acc}:a:langcourse:`;
  const kvSet = (k, v) => { const s = JSON.stringify(v); if (window.Noema?.kv) Noema.kv.set(k, s); else localStorage.setItem(k, s); };
  const getRec = (acc, cid) => jparse(localStorage.getItem(PRE(acc) + cid));
  const putRec = (acc, rec) => kvSet(PRE(acc) + rec.id, rec);
  function records(acc) {
    const p = PRE(acc), out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(p)) { const r = jparse(localStorage.getItem(k)); if (r?.format === LJ.FORMAT) out.push(r); } }
    return out.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  }
  const cloudAcc = acc => { try { const s = window.NoemaCloud?.session?.(); return !!s && acc === 'u_' + s.user.id; } catch (e) { return false; } };
  const toast = (m, ms = 3000) => window.Noema?.toast ? Noema.toast(m, ms) : console.log(m);

  /* ---------- device + cloud storage of the content ---------- */
  const ownDb = { db: null, open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('noema-lite', 1); r.onupgradeneeded = () => { const d = r.result; ['packs', 'handles', 'restore', 'convos'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); }; r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); } };
  const IDB = () => window.Noema?.idb || { get: (s, k) => ownDb.open().then(d => new Promise((res, rej) => { const r = d.transaction(s).objectStore(s).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })), put: (s, k, v) => ownDb.open().then(d => new Promise((res, rej) => { const t = d.transaction(s, 'readwrite'); t.objectStore(s).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); })) };
  const devKey = (acc, kind, cid) => `${kind}|${acc}|${cid}`;   // never “<acc>|…”: those keys are the account's subject packs (loader importedPacks)
  const devGet = async k => { try { return await Promise.race([IDB().get('packs', k), new Promise(r => setTimeout(() => r(null), 4000))]); } catch (e) { return null; } };
  const devPut = async (k, v) => { try { await IDB().put('packs', k, v); } catch (e) { console.warn('[langjobs] device storage', e); } };
  const cloudGet = async path => { try { const r = await NoemaCloud.downloadObject(path); return await r.json(); } catch (e) { return null; } };
  const cloudPut = (path, obj) => NoemaCloud.uploadObject(path, new Blob([JSON.stringify(obj)], { type: 'application/json' }), 'application/json');
  /** The content of an account course: the device copy, or the cloud copy when it is newer (another device merged more). */
  async function loadContent(acc, cid) {
    const rec = getRec(acc, cid); let d = await devGet(devKey(acc, 'langcourse', cid));
    if (cloudAcc(acc) && (!d || (rec && (d.rev || 0) < (rec.rev || 0)))) { const c = await cloudGet(`langs/${cid}.json`); if (c && (!d || (c.rev || 0) > (d.rev || 0))) { d = c; await devPut(devKey(acc, 'langcourse', cid), d); } }
    if (!d) throw new Error('This course is not on this device yet' + (cloudAcc(acc) ? ' (and not in the cloud).' : ' — sign in to the cloud account it was made with.'));
    return d;
  }
  async function saveContent(acc, rec, data) {
    await devPut(devKey(acc, 'langcourse', rec.id), data);
    if (cloudAcc(acc)) await cloudPut(`langs/${rec.id}.json`, data).catch(e => console.warn('[langjobs] upload', e));
    rec.rev = data.rev; putRec(acc, rec);
  }
  async function loadPatch(acc, cid) {
    let p = await devGet(devKey(acc, 'langpatch', cid));
    if (cloudAcc(acc)) { const c = await cloudGet(`langs/${cid}.patch.json`); if (c && (!p || (c.rev || 0) > (p.rev || 0))) { p = c; await devPut(devKey(acc, 'langpatch', cid), p); } }
    return p || N.langEmptyPatch(cid);
  }
  async function savePatch(acc, patch) { await devPut(devKey(acc, 'langpatch', patch.course), patch); if (cloudAcc(acc)) await cloudPut(`langs/${patch.course}.patch.json`, patch).catch(e => console.warn('[langjobs] upload', e)); }
  /** The built library courses (their language.json, typology and the common order, D13). */
  async function libraryData() {
    const out = [];
    for (const m of window.NOEMA_REGISTRY?.languages || []) {
      if (!(window.NOEMA_LANGPACKS || {})[m.id]) await new Promise(res => { const s = document.createElement('script'); s.src = m.path; s.onload = res; s.onerror = res; document.head.append(s); });
      if ((window.NOEMA_LANGPACKS || {})[m.id]) out.push(window.NOEMA_LANGPACKS[m.id]);
    }
    return out;
  }
  /** The content a task of this record works on: the account course, or a library course with the learner's patch. */
  async function contentFor(acc, rec) {
    if (rec.origin === 'account') return { data: await loadContent(acc, rec.id) };
    const lib = (await libraryData()).find(d => d.course.id === rec.id); if (!lib) throw new Error(`The library course “${rec.id}” is not available here.`);
    const patch = await loadPatch(acc, rec.id);
    return { data: N.langApplyPatch(JSON.parse(JSON.stringify(lib)), patch), patch };
  }

  /* ---------- the course that is open: rebuilt after a merge ---------- */
  function refresh(acc, cid, data) {
    if (UI.acc !== acc || UI.id !== cid || !UI.C) return;
    UI.C = N.course(data); const prof = (window.NOEMA_LANGPROFILES || {})[cid]; if (prof) N.addProfiles(UI.C, prof);
    UI.L = N.fromKV(UI.C, N.toKV(UI.C, UI.L));
    if (!document.querySelector('.lx-session')) render();
  }
  /** Apply one checked answer and store everything → the log line. */
  async function applyAndSave(acc, rec, ctx, task, ans) {
    const line = N.applyLangAnswer(rec, ctx.data, task, ans, { patch: ctx.patch || null });
    if (ctx.patch) { await savePatch(acc, ctx.patch); putRec(acc, rec); } else await saveContent(acc, rec, ctx.data);
    refresh(acc, rec.id, ctx.data);
    return line;
  }

  /* ---------- the three ways ---------- */
  /** ▶ With the Claude key on this device: one task (Claude repairs its answer when the check finds problems). */
  async function runTask(acc, cid, taskId, { onLog = () => { }, signal } = {}) {
    const rec = getRec(acc, cid), task = rec && N.langTaskById(rec, taskId); if (!task) throw new Error('This task is not open any more.');
    const ctx = await contentFor(acc, rec), peers = task.kind === K.core ? await libraryData() : [];
    const sp = N.langTaskSpec(rec, ctx.data, task, { peers });
    onLog(`✨ ${sp.title}…`);
    const r = await NoemaLLM.json({ acc, provider: 'claude', name: 'answer', system: sp.system, prompt: sp.prompt, schema: sp.schema, maxTokens: 32000, signal, repairs: 2,
      validate: d => N.checkLangAnswer(rec, ctx.data, task, d, { peers }), onRepair: (errs) => onLog(`↻ Claude fixes ${errs.length} problem(s)…`) });
    const line = await applyAndSave(acc, rec, ctx, task, r.data);
    onLog('✓ ' + line); return line;
  }
  /** ▶ The whole queue (🌙 a night with the device left open): one task after another until it is empty or stopped. */
  async function runQueue(acc, cid, { onLog = () => { }, signal, max = 999 } = {}) {
    let n = 0;
    for (; n < max; n++) {
      if (signal?.aborted) break;
      const t = N.langNext(getRec(acc, cid) || { tasks: [] }); if (!t || t.error) break;
      try { await runTask(acc, cid, t.id, { onLog, signal }); }
      catch (e) { onLog('⚠️ ' + t.id + ': ' + e.message); const rec = getRec(acc, cid), x = N.langTaskById(rec, t.id); if (x && !signal?.aborted) { x.status = 'refused'; x.error = String(e.message).slice(0, 300); putRec(acc, rec); } if (/key|credit|401|Stopped/i.test(e.message)) break; }
    }
    return n;
  }
  /** 📋 Without the connector: the task to copy, and the pasted answer. */
  async function copyTask(acc, cid, taskId) {
    const rec = getRec(acc, cid), task = N.langTaskById(rec, taskId); const ctx = await contentFor(acc, rec);
    return N.langTaskText(rec, ctx.data, task, { mode: 'paste', peers: task.kind === K.core ? await libraryData() : [] });
  }
  async function paste(acc, cid, taskId, text) {
    const rec = getRec(acc, cid), task = rec && N.langTaskById(rec, taskId); if (!task) return { errors: ['This task is not open any more — copy the current task again.'] };
    let ans; try { ans = NoemaLLM.parseJSON(text); } catch (e) { return { errors: ['That is not a JSON answer — paste exactly what Claude answered (the JSON object).'] }; }
    const ctx = await contentFor(acc, rec), errs = N.checkLangAnswer(rec, ctx.data, task, ans, { peers: task.kind === K.core ? await libraryData() : [] });
    if (errs.length) return { errors: errs };
    return { ok: true, line: await applyAndSave(acc, rec, ctx, task, ans) };
  }
  /** 💬 The connector's answers: fetch the inbox, check each answer again, merge it, then empty the inbox. → how many were merged */
  let chain = Promise.resolve();
  /** One poll at a time: a second call waits for the running one, then looks again. */
  const poll = (acc, opts) => (chain = chain.catch(() => 0).then(() => poll1(acc, opts)));
  async function poll1(acc, { only = null } = {}) {
    const CL = window.NoemaCloud; if (!cloudAcc(acc) || !CL?.kvRows) return 0;
    let n = 0;
    try {
      const rows = (await CL.kvRows(LJ.IN)).filter(r => !only || r.key.startsWith(LJ.IN + only + ':')).sort((a, b) => a.key.localeCompare(b.key)); if (!rows.length) return 0;
      if (CL.pull) await CL.pull(acc).catch(() => { });   // the newest record (another device may have merged some of them)
      const ctxs = {}, done = [];
      for (const r of rows) {
        const cid = r.key.slice(LJ.IN.length).split(':')[0], e = jparse(r.value);
        const rec = getRec(acc, cid); if (!rec || !e) { if (!e || Date.now() - (Date.parse(r.updated_at) || 0) > 7 * 864e5) done.push(r.key); continue; }
        const task = N.langTaskById(rec, e.task);
        if (!task) { done.push(r.key); continue; }   // merged already (here or on another device)
        try {
          const ctx = ctxs[cid] = ctxs[cid] || await contentFor(acc, rec);
          const errs = N.checkLangAnswer(rec, ctx.data, task, e.data, { peers: task.kind === K.core ? await libraryData() : [] });
          if (errs.length) { console.warn('[langjobs] answer refused', errs); task.status = 'refused'; task.error = errs.slice(0, 5).join('; '); putRec(acc, rec); }
          else { await applyAndSave(acc, rec, ctx, task, e.data); n++; }
          done.push(r.key);
        } catch (x) { console.warn('[langjobs]', x); }
      }
      if (n) await CL.push(acc).catch(() => { });   // the records reach the cloud before their answers leave the inbox
      for (const k of done) await CL.kvDelete(k).catch(() => { });
      if (n) toast(`✨ ${n} answer(s) from your Claude app merged into your course`, 3500);
    } catch (x) { console.warn('[langjobs] poll', x); }
    return n;
  }
  let timer = null;
  function startPolling(acc) {
    clearTimeout(timer);
    const loop = async () => { if (document.visibilityState === 'visible' && records(acc).some(r => N.langWork(r).queued.length || N.langWork(r).claimed.length)) await poll(acc).catch(() => { }); timer = setTimeout(loop, 20000); };
    timer = setTimeout(loop, 1500);
  }

  /* ---------- for the loader: an account course to open, a library course with the learner's patch ---------- */
  async function loadCourse(acc, cid) { await poll(acc, { only: cid }).catch(() => { }); return loadContent(acc, cid); }
  async function withPatch(acc, cid, data) {
    const rec = getRec(acc, cid); if (!rec || rec.origin !== 'library') return data;   // no refills yet: the course as built
    await poll(acc, { only: cid }).catch(() => { });
    return N.langApplyPatch(data, await loadPatch(acc, cid));
  }
  /** ✨ Create an account course → {record, data} (stored on the device and in the cloud). */
  async function create(acc, opts) {
    const { record, data } = N.langNewCourse({ ...opts, library: await libraryData() });
    await saveContent(acc, record, data);
    if (cloudAcc(acc)) await window.NoemaCloud?.push?.(acc).catch(() => { });
    return { record, data };
  }
  /** ✨ Ask Claude for more sentences with what I know (§7.4) → the queued task. */
  function queueRefill(acc, C, L, code, fid) {
    let rec = getRec(acc, C.id) || N.langLibraryRecord(C);
    const t = N.langQueue(rec, K.refill, N.langRefillRequest(C, L, code, fid)); putRec(acc, rec); return t;
  }

  /* ---------- small UI helpers ---------- */
  const LANGS = ['ar', 'he', 'zh', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'tr', 'ja', 'ko', 'el', 'en', 'hi', 'fa', 'nl', 'pl', 'sw', 'vi'];
  const EXPLAIN = [['en', 'English'], ['el', 'Ελληνικά'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['ru', 'Русский'], ['tr', 'Türkçe']];
  const copy = async (t, btn) => { try { await navigator.clipboard.writeText(t); if (btn) { const o = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = o, 1600); } } catch (e) { } };
  const hasKey = acc => !!window.NoemaClaude?.Key?.get(acc);
  const STATUS = { queued: '⏳ queued', done: '✅ done', refused: '⚠️ refused' };
  const kindLabel = { [K.core]: '🧱 the core', [K.node]: '📖 a node', [K.function]: '🧩 grammar', [K.compare]: '⇄ comparison', [K.refill]: '✨ more sentences' };
  function overlay(build) {
    const o = h('div', { class: 'noema-overlay lj-ov', role: 'dialog', 'aria-modal': 'true' }), box = h('div', { class: 'noema-ovbox lj-box' }); o.append(box);
    const close = () => { o.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    o.addEventListener('click', e => { if (e.target === o) close(); }); document.addEventListener('keydown', esc);
    build(box, close); document.body.append(o); setTimeout(() => box.querySelector('input,button')?.focus(), 30); return close;
  }
  function textBox(text) { return h('textarea', { class: 'lj-text', readonly: true, rows: 8, 'aria-label': 'Text to copy' }, text); }

  /* ---------- ✨ New language course (from the subject picker's 🌍 Languages overlay) ---------- */
  function newCourse(acc, { onCreated = () => { } } = {}) {
    overlay((box, close) => {
      const chosen = new Set(), depth = {};
      const title = h('input', { class: 'noema-input lj-in', placeholder: 'e.g. Spanish and Japanese for travelling', 'aria-label': 'Title' });
      const more = h('input', { class: 'noema-input lj-in', placeholder: 'other codes, e.g. uk, ta', 'aria-label': 'Other language codes' });
      const known = h('input', { class: 'noema-input lj-in', placeholder: 'e.g. el, en', 'aria-label': 'Languages you know' });
      const explain = h('select', { class: 'noema-input lj-in', 'aria-label': 'Explanation language' }, ...EXPLAIN.map(([v, t]) => h('option', { value: v }, t)));
      const depths = h('div', { class: 'lj-depths' });
      const langsNow = () => [...chosen, ...more.value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /^[a-z]{2,3}$/.test(x))].filter((x, i, a) => a.indexOf(x) === i);
      const drawDepth = () => { depths.innerHTML = ''; for (const c of langsNow()) depths.append(h('label', { class: 'lj-depth' }, info(c).flag, ' ', info(c).name, ' ', h('select', { 'aria-label': 'Depth ' + c, 'data-lang': c, onchange: e => { depth[c] = +e.target.value; } }, ...[[3, 'everything (tiers 1–3)'], [2, 'common + intermediate'], [1, 'the common words']].map(([v, t]) => h('option', { value: v, selected: (depth[c] || 3) === v ? '' : null }, t))))); };
      more.addEventListener('input', drawDepth);
      const chips = h('div', { class: 'lj-chips' }, ...LANGS.map(c => h('button', { class: 'chip lj-lang', type: 'button', 'data-lang': c, 'aria-pressed': 'false', onclick: e => { const b = e.currentTarget; if (chosen.has(c)) chosen.delete(c); else chosen.add(c); b.setAttribute('aria-pressed', chosen.has(c) ? 'true' : 'false'); b.classList.toggle('on', chosen.has(c)); drawDepth(); } }, info(c).flag, ' ', info(c).name)));
      let way = 'claudeapp';
      const ways = h('div', { class: 'cg-choices lj-ways', role: 'radiogroup', 'aria-label': 'Who writes it' }, ...[
        ['claudeapp', '💬 The Claude app — recommended', 'With the noema-lite connector: your Claude plan writes the course task by task (scheduled runs at night); the app merges every answer by itself.'],
        ['claude', '▶ Here, with your Claude key', hasKey(acc) ? 'The app asks Claude now (paid per use on your API account); the key stays on this device.' : 'Needs a Claude API key on this device (⚙️ Settings → Claude).'],
        ['cowork', '🧑‍💻 Claude here in Cowork', 'For the shared library of the app: Claude writes the course into library/languages/ of the repository and validates it.'],
      ].map(([v, t, d]) => h('button', { class: 'cg-choice lj-way' + (v === way ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': v === way ? 'true' : 'false', 'data-way': v, disabled: v === 'claude' && !hasKey(acc) ? '' : null, onclick: e => { way = v; ways.querySelectorAll('.lj-way').forEach(b => { const on = b.dataset.way === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); } }, h('b', {}, t), h('span', { class: 'tiny' }, d))));
      const msg = h('div', { class: 'lj-msg', role: 'status' });
      const go1 = h('button', { class: 'btn primary lj-create', type: 'button', onclick: async () => {
        const langs = langsNow(), opts = { title: title.value.trim(), languages: langs, explainLang: explain.value || 'en', depth: Object.fromEntries(langs.map(c => [c, depth[c] || 3])), knownLanguages: known.value.split(/[\s,;]+/).filter(Boolean), provider: way };
        if (!opts.title) { msg.textContent = '⚠️ Give the course a title.'; title.focus(); return; }
        if (!langs.length) { msg.textContent = '⚠️ Choose at least one language.'; return; }
        if (way === 'cowork') { box.innerHTML = ''; box.append(h('h2', {}, '🧑‍💻 A course for the shared library'), h('p', {}, 'Give Claude (Claude Code / Cowork, in the noema-lite repository) this brief. The course is written into library/languages/, validated (validate_lang.py --strict, lang_refcheck.py, lang_phenomena.py) and appears for everybody after the next build.'), textBox(coworkBrief(opts)), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: e => copy(coworkBrief(opts), e.currentTarget) }, '📋 Copy'), h('button', { class: 'btn ghost', onclick: close }, 'Close'))); return; }
        go1.disabled = true; msg.textContent = '⏳ Creating the course…';
        try {
          const { record } = await create(acc, opts);
          if (way === 'claude') {
            msg.textContent = '✨ Claude writes the core of the course…';
            try { await runTask(acc, record.id, 'core', { onLog: t => { msg.textContent = t; } }); } catch (e) { msg.textContent = '⚠️ ' + e.message + ' — the task stays in the queue (✨ Through Claude).'; }
            close(); onCreated(record); return;
          }
          box.innerHTML = '';
          box.append(h('h2', {}, `✨ “${record.title}” is waiting for your Claude app`), h('p', {}, 'Paste this into a chat in the Claude app (with the noema-lite connector). Claude writes the core first, then the nodes in each language; every answer reaches this app by itself. On the course page ✨ Through Claude shows the queue.'),
            textBox(N.langMessage(record)), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: e => copy(N.langMessage(record), e.currentTarget) }, '📋 Copy the message'), h('button', { class: 'btn primary', onclick: () => { close(); onCreated(record); } }, 'Open the course')));
        } catch (e) { go1.disabled = false; msg.textContent = '⚠️ ' + e.message; }
      } }, '✨ Create the course');
      box.append(h('h2', {}, '✨ New language course'), h('p', { class: 'tiny' }, 'A private course in your account, written by Claude to the rules of the language courses (correct forms, the common order of every language, sentences from what you know).'),
        h('label', { class: 'lj-field' }, h('b', {}, 'Title'), title),
        h('div', { class: 'lj-field' }, h('b', {}, 'Languages'), chips, more),
        h('label', { class: 'lj-field' }, h('b', {}, 'Explanations in'), explain),
        h('div', { class: 'lj-field' }, h('b', {}, 'Depth per language'), depths),
        h('label', { class: 'lj-field' }, h('b', {}, 'Languages you already know'), known),
        h('div', { class: 'lj-field' }, h('b', {}, 'Who writes it'), ways),
        msg, h('div', { class: 'row' }, go1, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel')));
      drawDepth();
    });
  }
  const coworkBrief = o => `Create a new language course for the shared library of noema-lite: “${o.title}” — languages ${o.languages.join(', ')}, explanations in ${o.explainLang}, depth ${Object.entries(o.depth).map(([k, v]) => k + ' ' + v).join(', ')}, known languages ${o.knownLanguages.join(', ') || '—'}.\nRead docs/LANGUAGE_RULES.md first (binding), then docs/LANGUAGES.md §4, §10 and §11. A language without a catalogue starts with its typological profile and its catalogue of phenomena (library/languages/_phenomena/<code>.json) and its wordFeatures. Place every node on the common order of all the courses (D13). Write it in library/languages/<id>/, ground every form (tools/lang_refcheck.py), and leave python3 tools/validate_lang.py <dir> --strict, tools/lang_phenomena.py and python3 tools/build.py clean.`;

  /* ---------- #/claude — the course's task queue ---------- */
  const busy = { ctl: null };
  VIEWS.claude = (v) => {
    const acc = UI.acc, C = UI.C, rec = getRec(acc, C.id);
    const account = !!C.data.course.account;
    v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← The course')),
      h('h1', { class: 'lj-h1' }, '✨ Through Claude'), h('p', { class: 'lx-sub' }, account ? 'Your own course: Claude writes it task by task, every answer is checked before it joins the course.' : 'This course is from the library: here Claude writes more sentences with the words you know (✨ on a grammar page).'));
    if (!rec) { v.append(h('p', { class: 'lx-note' }, 'Nothing queued for Claude yet. On a grammar page, “✨ Ask Claude for more sentences” queues a task.')); return; }
    const data = C.data, nd = account ? N.langNeeds(rec, data) : null, w = N.langWork(rec);
    const log = h('div', { class: 'lj-log', role: 'log', 'aria-live': 'polite' });
    const say = t => { log.prepend(h('div', {}, t)); };
    const queueBtns = account ? h('div', { class: 'row lj-queue' },
      nd.core ? null : h('button', { class: 'btn small', disabled: nd.nodes.length ? null : '', onclick: () => { const r = getRec(acc, C.id); const per = {}; for (const x of nd.nodes) if (!per[x.lang]) per[x.lang] = x; Object.values(per).forEach(x => N.langQueue(r, K.node, x)); putRec(acc, r); render(); } }, '🧱 Queue the next node in each language'),
      nd.core ? null : h('button', { class: 'btn small lj-night', disabled: nd.nodes.length || nd.functions.length ? null : '', onclick: () => { const r = getRec(acc, C.id); const n = N.langQueueNight(r, data); putRec(acc, r); toast(`🌙 ${n} task(s) queued — a scheduled Claude run (or ▶ here) works through them`); render(); } }, `🌙 Queue every unwritten node (${nd.nodes.length + nd.functions.length})`),
      nd.core ? null : h('button', { class: 'btn small', disabled: nd.compare.length ? null : '', onclick: () => { const r = getRec(acc, C.id); nd.compare.forEach(fn => N.langQueue(r, K.compare, { fn })); putRec(acc, r); render(); } }, `⇄ Queue comparisons (${nd.compare.length})`)) : null;
    const runAll = hasKey(acc) && w.queued.length ? h('button', { class: 'btn primary lj-runall', onclick: async e => {
      if (busy.ctl) { busy.ctl.abort(); return; }
      busy.ctl = new AbortController(); e.currentTarget.textContent = '■ Stop';
      try { await runQueue(acc, C.id, { onLog: say, signal: busy.ctl.signal }); } finally { busy.ctl = null; render(); }
    } }, `▶ Write the queue with my Claude key (${w.queued.length})`) : null;
    v.append(h('div', { class: 'lx-card lj-ways2' },
      h('div', { class: 'lj-stats' }, h('span', { class: 'lx-badge' }, `${w.queued.length} queued`), w.claimed.length ? h('span', { class: 'lx-badge ctx' }, `${w.claimed.length} being written`) : null, h('span', { class: 'lx-badge reg' }, `${w.done} done`), w.refused ? h('span', { class: 'lx-badge new' }, `${w.refused} refused`) : null),
      queueBtns,
      h('div', { class: 'row' }, runAll,
        w.queued.length ? h('button', { class: 'btn small lj-msgbtn', onclick: e => copy(N.langMessage(getRec(acc, C.id), { count: Math.min(5, w.queued.length) }), e.currentTarget) }, '💬 Copy the message for the Claude app') : null,
        cloudAcc(acc) ? h('button', { class: 'btn small lj-poll', onclick: async () => { const n = await poll(acc); say(n ? `✓ ${n} answer(s) merged` : 'No answers waiting.'); if (n) render(); } }, '🔄 Fetch answers') : null,
        account ? h('button', { class: 'btn small ghost', onclick: () => { const blob = new Blob([JSON.stringify(C.data)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `course-${C.id}.json` }); document.body.append(a); a.click(); a.remove(); } }, '⬇️ The course file') : null),
      !hasKey(acc) ? h('p', { class: 'tiny' }, '▶ With a Claude API key on this device (⚙️ Settings → Claude) the app writes the queue itself.') : null,
      log));
    const open = N.langOpenTasks(rec), past = (rec.tasks || []).filter(t => t.status !== 'queued').slice(-12).reverse();
    v.append(h('h2', { class: 'lx-h2' }, 'The queue'), open.length ? h('div', { class: 'lj-tasks' }, ...open.map(t => taskRow(acc, C, t, say))) : h('p', { class: 'tiny' }, account && !nd.core && !nd.nodes.length ? '🎉 Every node is written.' : 'Nothing queued.'));
    if (past.length) v.append(h('details', { class: 'lx-sec' }, h('summary', {}, 'Done and refused ', h('span', { class: 'tiny' }, past.length)), h('ul', { class: 'lx-list' }, ...past.map(t => h('li', { 'data-task': t.id }, STATUS[t.status] || t.status, ' ', h('code', {}, t.id), t.error ? h('div', { class: 'tiny' }, t.error) : null)))));
    if ((rec.log || []).length) v.append(h('details', { class: 'lx-sec' }, h('summary', {}, 'What Claude wrote'), h('ul', { class: 'lx-list' }, ...rec.log.slice(-15).reverse().map(l => h('li', {}, new Date(l.t).toLocaleString(), ' — ', l.m)))));
  };
  function taskRow(acc, C, t, say) {
    const row = h('div', { class: 'lx-card lj-task', 'data-task': t.id },
      h('div', { class: 'lj-taskhead' }, h('b', {}, kindLabel[t.kind] || t.kind), ' ', h('code', {}, t.id), t.night ? h('span', { class: 'lx-badge' }, '🌙') : null, t.claimedAt ? h('span', { class: 'lx-badge ctx' }, '✍️ being written by a run') : null),
      h('div', { class: 'row' },
        hasKey(acc) ? h('button', { class: 'btn small primary lj-run', onclick: async e => { e.currentTarget.disabled = true; try { await runTask(acc, C.id, t.id, { onLog: say }); } catch (x) { say('⚠️ ' + x.message); } render(); } }, '▶ Write it now') : null,
        h('button', { class: 'btn small lj-copy', onclick: async e => copy(await copyTask(acc, C.id, t.id), e.currentTarget) }, '📋 Copy the task'),
        h('button', { class: 'btn small lj-paste', onclick: () => pasteBox(acc, C, t, row) }, '📥 Paste the answer')));
    return row;
  }
  function pasteBox(acc, C, t, row) {
    row.querySelector('.lj-pastebox')?.remove();
    const ta = h('textarea', { class: 'lj-text lj-answer', rows: 8, placeholder: 'Paste Claude’s answer (the JSON object) here', 'aria-label': 'Claude’s answer' }), out = h('div', { class: 'lj-errs', role: 'status' });
    const box = h('div', { class: 'lj-pastebox' }, ta, h('div', { class: 'row' }, h('button', { class: 'btn small primary lj-check', onclick: async () => {
      const r = await paste(acc, C.id, t.id, ta.value);
      if (r.errors) { out.innerHTML = ''; out.append(h('b', {}, `❌ ${r.errors.length} problem(s) — give them to Claude to fix:`), h('ul', { class: 'lx-list' }, ...r.errors.slice(0, 30).map(e => h('li', {}, e)))); return; }
      toast('✓ ' + r.line); render();
    } }, '✓ Check and add')), out);
    row.append(box); ta.focus();
  }

  /* ---------- hooks: the home of a course made through Claude, the refill card on a grammar page ---------- */
  const home0 = VIEWS.home;
  VIEWS.home = (v, r) => {
    const rec = getRec(UI.acc, UI.id);
    if (UI.C.data.course.account && !UI.C.data.nodes.length) return VIEWS.claude(v, r);   // nothing to learn before the core is written
    home0(v, r);
    if (rec) { const w = N.langWork(rec); v.prepend(h('div', { class: 'row lj-homebar' }, h('button', { class: 'btn small ghost lj-open', onclick: () => go('#/claude') }, `✨ Through Claude${w.queued.length + w.claimed.length ? ` — ${w.queued.length + w.claimed.length} task(s) waiting` : ''}`))); }
    else if (UI.C.data.course.account) v.prepend(h('div', { class: 'row lj-homebar' }, h('button', { class: 'btn small ghost lj-open', onclick: () => go('#/claude') }, '✨ Through Claude')));
  };
  const fn0 = VIEWS.fn;
  VIEWS.fn = (v, r) => {
    fn0(v, r);
    const fid = r.arg, c = r.arg2 && UI.C.lang[r.arg2] ? r.arg2 : UI.lang; if (!UI.C.functions[fid] || !LX(c).grammar[fid] || UI.C.functions[fid].category === 'overview') return;
    const cmp = (UI.C.data.compare || {})[fid];
    if (cmp) {
      const head = h('thead', {}, h('tr', {}, h('th', {}, ''), ...UI.C.languages.map(x => h('th', {}, info(x).flag, ' ', info(x).name))));
      const body = h('tbody', {}, ...cmp.rows.map(row => h('tr', {}, h('th', {}, row.aspect), ...UI.C.languages.map(x => h('td', { lang: x, dir: LX(x).language.dir || 'ltr' }, row.cells[x] ? wordsIn(x, row.cells[x]) : '—')))));
      v.append(h('div', { class: 'lx-card lj-cmp' }, h('h3', {}, '⇄ ', UI.C.functions[fid].title, ' across the languages'), h('div', { class: 'lx-compare' }, h('table', {}, head, body))));
    }
    const f = N.feasibility(UI.C, UI.L, c, fid), rec = getRec(UI.acc, UI.id), open = rec && (rec.tasks || []).find(t => t.kind === K.refill && t.fn === fid && t.lang === c && t.status === 'queued');
    const light = { ready: '🟢 ready', thin: `🟡 thin (${f.sentences} sentences)`, locked: '🔒 needs ' + (f.unlockBy.slice(0, 2).map(n => UI.C.nodes[n]?.title || n).join(', ') || 'more words'), absent: '—' }[f.state];
    v.append(h('div', { class: 'lx-card lj-refill', 'data-state': f.state },
      h('div', {}, h('b', {}, 'Sentences with the words you know: '), light, h('span', { class: 'tiny' }, ` · ${f.sentences} usable`)),
      open ? h('p', { class: 'tiny lj-queued' }, `⏳ Asked already (${open.id}) — ✨ Through Claude shows how it gets written.`) : null,
      f.state === 'absent' ? null : h('div', { class: 'row' }, h('button', { class: 'btn small ai lj-askmore', onclick: () => {
        const t = queueRefill(UI.acc, UI.C, UI.L, c, fid);
        toast(`✨ Asked: ${t.id}`); go('#/claude');
      } }, f.state === 'ready' ? '✨ Ask Claude for even more sentences' : '✨ Ask Claude for more sentences with what I know'))));
  };

  Object.assign(window.NoemaLangUI, { newCourse, claude: { records, getRec, putRec, loadCourse, withPatch, loadContent, saveContent, loadPatch, create, runTask, runQueue, copyTask, paste, poll, startPolling, queueRefill, libraryData } });
  addEventListener('noema:remote', e => { if (UI.C && e.detail?.acc === UI.acc && (e.detail.keys || []).some(k => k.includes(':a:langcourse:' + UI.id)) && UI.view === 'claude') render(); });
})();
