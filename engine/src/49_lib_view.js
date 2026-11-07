/* ---------- ⚙ #/engines: the engines of interactive activities and requests for new ones (docs/INTERACTIVE_LIBRARY.md §2–§3) ----------
   The catalogue in the order an author should consider it: the library (general engines, grouped by field), the free way (a mini-app,
   Python), the field plugins. Only engines this app has are listed. "Request a new engine" opens a short form: what should be
   simulated (required), the field, what the learner changes and sees, what is measured, the accuracy wanted, sources and examples (folded).
   While the learner writes, the catalogue suggests what may already do it (NoemaEngineCatalog.suggest). Sending stores the request
   (NoemaEngineRequests: the cloud table noema_engine_requests, or this device for a local profile). "Your requests" shows each with its
   status and answer; the app's admins see every request and answer it here (status, the engine that now does it, a note, the PR) or
   through the connector (noema_engine_requests, noema_engine_request_update). */
const ENGINE_GROUPS = [   // the library's engines by field (catalogue ids); i18n-ignore (ids)
  ['math', ['formula@1', 'ode@1', 'prob@1', 'graph@1', 'geom@1', 'logic@1', 'des@1', 'field@1']],
  ['life', ['genetics@1', 'seq@1', 'med@1', 'clinic@1', 'anatomy@1', 'agents@1']],
  ['arts', ['timeline@1', 'music@1', 'map@1', 'text@1', 'craft@1']],
  ['thought', [, 'rhetoric@1', 'philo@1', 'law@1']],
];
const engName = e => tE('engine.engines.' + e.slug + '.name');
const engWhat = e => tE('engine.engines.' + e.slug + '.what');
/** an engine (or runtime) this app can run */
function engineHere(e) {
  if (typeof ACT === 'undefined') return false;
  if (e.runtime) return !!(ACT.runtime(typeof e.runtime === 'string' ? e.runtime : e.id) || ACT.runtime(e.id));
  return !!ACT.engine(e.id);
}
function engineRow(e) {
  return h('li', { class: 'eng-row', 'data-engine': e.id, title: engWhat(e) }, h('b', {}, engName(e)), h('code', { class: 'eng-id' }, e.id), h('span', { class: 'eng-what' }, engWhat(e)));
}
async function enginesView(sub) {
  shellChrome({ sub: true, crumbs: [[tE('engine.engines.title')]], back: HOME() });
  const K = window.NoemaEngineCatalog, R = window.NoemaEngineRequests;
  const v = view(SHL() ? null : backBtn('← ' + SUBJ.title, HOME()));
  if (!K || !R) { v.append(h('p', {}, tE('engine.engines.unavailable'))); return; }
  const store = R.store(ACCOUNT);
  const ask = h('button', { class: 'btn primary', type: 'button', 'data-act': 'request', onclick: () => requestEngineDialog(store, () => paintMine()) }, tE('engine.engines.request'));
  v.append(h('div', { class: 'eng-head' }, h('h2', {}, tE('engine.engines.title')), ask), h('p', { class: 'muted eng-intro' }, tE('engine.engines.intro')));
  const sec = (title, list, note) => list.length ? h('section', { class: 'eng-sec' }, h('h3', {}, title), note ? h('p', { class: 'tiny muted' }, note) : null, h('ul', { class: 'eng-list' }, ...list.map(engineRow))) : null;
  const have = K.CATALOG.filter(engineHere), byId = id => have.find(e => e.id === id);
  for (const [g, ids] of ENGINE_GROUPS) v.append(sec(tE('engine.engines.group.' + g), ids.map(byId).filter(Boolean)));
  v.append(sec(tE('engine.engines.free'), have.filter(e => e.layer === 'free'), tE('engine.engines.freeNote')));
  v.append(sec(tE('engine.engines.plugins'), have.filter(e => e.layer === 'plugin'), tE('engine.engines.pluginsNote')));
  const mine = h('section', { class: 'eng-sec eng-mine' });
  v.append(mine);
  const admin = await store.isAdmin().catch(() => false);
  async function paintMine() {
    let rows = [];
    try { rows = admin ? await store.all('all') : await store.mine(); } catch (e) { mine.replaceChildren(h('p', { class: 'tiny muted' }, tE('engine.engines.listFailed'))); return; }
    if (!rows.length) { mine.replaceChildren(); return; }
    mine.replaceChildren(h('h3', {}, admin ? tE('engine.engines.allRequests', { n: rows.length }) : tE('engine.engines.mine')),
      store.kind === 'local' ? h('p', { class: 'tiny muted' }, tE('engine.engines.localNote')) : null,
      h('ul', { class: 'eng-reqs' }, ...rows.map(r => requestRow(r, store, admin, paintMine))));
  }
  paintMine();
  if (sub === 'new') requestEngineDialog(store, paintMine);
}
function requestRow(r, store, admin, again) {
  const R = NoemaEngineRequests;
  const st = h('span', { class: 'pill eng-st eng-st-' + r.status }, tE('engine.engines.status.' + (R.STATUSES.includes(r.status) ? r.status : 'new')));
  const li = h('li', { class: 'eng-req', 'data-req': r.id }, h('div', { class: 'eng-req-h' }, h('b', {}, r.title), st,
    h('span', { class: 'tiny muted' }, (r.created_at || '').slice(0, 10))));
  if (r.engine_id) li.append(h('p', { class: 'tiny' }, tE('engine.engines.doneBy', { id: r.engine_id })));
  if (r.answer) li.append(h('p', { class: 'tiny eng-answer' }, r.answer));
  const brief = h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(R.brief(r)); toast('📋 ' + tE('engine.engines.copied')); } catch (e) { saveBlob(`engine-request-${String(r.id).slice(0, 8)}.md`, new Blob([R.brief(r)], { type: 'text/markdown' })); } } }, tE('engine.engines.copyBrief'));
  const tools = h('div', { class: 'row eng-req-tools' }, brief);
  if (store.kind === 'local') tools.append(h('button', { class: 'btn ghost small', type: 'button', onclick: () => saveBlob(`engine-request-${String(r.id).slice(0, 8)}.json`, new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' })) }, tE('engine.engines.download')));
  if (admin) {   // the app's admins answer here (the same fields as noema_engine_request_update)
    const sel = h('select', { class: 'sim-sel', 'aria-label': tE('engine.engines.statusLabel') }, ...R.STATUSES.map(s => h('option', { value: s }, tE('engine.engines.status.' + s))));
    sel.value = r.status;
    const eid = h('input', { type: 'text', value: r.engine_id || '', placeholder: 'chem@1', 'aria-label': tE('engine.engines.engineIdLabel'), size: 10 });   // i18n-ignore (an example id)
    const note = h('input', { type: 'text', value: r.answer || '', 'aria-label': tE('engine.engines.answerLabel'), placeholder: tE('engine.engines.answerLabel') });
    const pr = h('input', { type: 'text', value: r.fixed_in || '', 'aria-label': tE('engine.engines.fixedInLabel'), placeholder: tE('engine.engines.fixedInLabel'), size: 14 });
    const save = h('button', { class: 'btn small', type: 'button', onclick: async () => {
      const p = R.cleanPatch({ status: sel.value, engine_id: eid.value, answer: note.value, fixed_in: pr.value });
      if (p.error) { toast('⚠️ ' + p.error, 4000); return; }
      try { await store.update(r.id, p); toast('✓ ' + tE('engine.engines.saved')); again(); } catch (e) { toast('⚠️ ' + errText(e), 4000); }
    } }, tE('engine.engines.save'));
    li.append(h('details', { class: 'eng-admin' }, h('summary', {}, tE('engine.engines.answer')), h('p', { class: 'tiny' }, r.what || ''),
      h('div', { class: 'row' }, sel, eid, pr), note, h('div', { class: 'row' }, save)));
  }
  li.append(tools);
  return li;
}
/** the request form: one required field first, the rest folded; the catalogue's suggestions as the learner writes */
function requestEngineDialog(store, onSent) {
  const R = NoemaEngineRequests, K = NoemaEngineCatalog;
  modal((box, close) => {
    const F = {};
    const field = (k, multi, rows) => {
      const id = 'engreq-' + k, lim = R.FIELDS[k].max;
      F[k] = multi ? h('textarea', { id, rows: rows || 3, maxlength: lim, 'data-f': k }) : h('input', { id, type: 'text', maxlength: lim, 'data-f': k });
      return h('label', { class: 'eng-f', for: id }, h('span', {}, tE('engine.engines.f.' + k)), F[k]);
    };
    const acc = h('select', { id: 'engreq-accuracy', 'data-f': 'accuracy' }, ...R.ACCURACY.map(a => h('option', { value: a }, tE('engine.engines.acc.' + a))));
    const sug = h('div', { class: 'eng-sug', 'aria-live': 'polite' });
    const err = h('p', { class: 'tiny bad', 'aria-live': 'assertive' });
    const send = h('button', { class: 'btn primary', type: 'button', 'data-act': 'send' }, tE('engine.engines.send'));
    box.append(h('h3', {}, tE('engine.engines.request')), h('p', { class: 'tiny muted' }, tE('engine.engines.requestIntro')),
      field('title'), field('what', true, 5), sug,
      h('details', { class: 'eng-more' }, h('summary', {}, tE('engine.engines.more')),
        field('field'), field('learner', true), field('measure', true),
        h('label', { class: 'eng-f', for: 'engreq-accuracy' }, h('span', {}, tE('engine.engines.f.accuracy')), acc),
        field('sources', true), field('examples', true)),
      err, h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn', type: 'button', onclick: close }, tE('engine.core.cancel')), send));
    let t = 0;
    const suggest = () => {
      clearTimeout(t); t = setTimeout(() => {
        const s = K.suggest([F.title.value, F.what.value, F.field.value, F.learner.value].join(' ')).filter(x => K.byId(x.id) && engineHere(K.byId(x.id))).slice(0, 3);
        sug.replaceChildren(...(s.length ? [h('p', { class: 'tiny' }, tE('engine.engines.maybe')), h('ul', { class: 'eng-list' }, ...s.map(x => engineRow(K.byId(x.id))))] : []));
      }, 250);
    };
    for (const k of ['title', 'what', 'field', 'learner']) F[k].addEventListener('input', suggest);
    send.onclick = async () => {
      const input = Object.fromEntries(Object.keys(R.FIELDS).map(k => [k, F[k].value]));
      const { row, problems } = R.normalize({ ...input, accuracy: acc.value, subject: SUBJ?.id, via: 'app', locale: uiLang() });
      if (problems.length) { const p = problems[0]; err.textContent = tE('engine.engines.err.' + p.code, { field: tE('engine.engines.f.' + p.field), min: R.FIELDS[p.field]?.min || 0, max: R.FIELDS[p.field]?.max || 0 }); F[p.field]?.focus?.(); return; }
      send.disabled = true;
      try { await store.submit(row); close(); toast('✓ ' + tE(store.kind === 'local' ? 'engine.engines.sentLocal' : 'engine.engines.sent'), 4000); onSent?.(); }
      catch (e) { send.disabled = false; err.textContent = errText(e); }
    };
    setTimeout(() => F.title.focus(), 30);
  });
}
