/* noema-lite — NoemaEngineRequests: asking for a NEW engine of interactive activities (docs/INTERACTIVE_LIBRARY.md §3).
   The hexagon of this feature:
     • the domain (no DOM, no network; also run by the connector, src/connector): FIELDS and their limits, normalize(input) →
       {row, problems}, the statuses and their order, brief(row) — the markdown a developer (or Claude) builds the engine from;
     • the port: store = { submit(row), mine(), all(status), update(id, patch), isAdmin() };
     • the adapters: cloud (Supabase REST, table noema_engine_requests, cloud/supabase.sql §16) and local (a profile without a cloud
       account keeps its requests on this device, localStorage noema1:<profile>:enginereq, and can download one as JSON);
     • the UI: engine/src/49_lib_view.js (#/engines) and the connector's noema_request_engine / noema_engine_requests /
       noema_engine_request_update.
   A request is suggested against the catalogue first (NoemaEngineCatalog.suggest): what the library may already do is shown before
   anything is sent, and stored with the request (suggested). */
(function (root) {
  'use strict';
  /* i18n-ignore-start */   // field names, codes and the English brief for developers; every word a learner reads is in i18n/engine (engine.engines.*)
  const FIELDS = Object.freeze({
    title:    { max: 120, min: 4, need: true },     // a name for it: "Chemical equilibrium and Le Chatelier"
    field:    { max: 120 },                          // the subject area: "physical chemistry"
    what:     { max: 4000, min: 40, need: true },   // what should be simulated, the phenomenon or the model, as precisely as possible
    learner:  { max: 2000 },                         // what the learner changes, and what they should see happen
    measure:  { max: 2000 },                         // what is measured, graded or found (a value to reach, a fault to find)
    sources:  { max: 2000 },                         // books, papers, standards the model should follow
    examples: { max: 2000 },                         // one or two concrete exercises it should make possible
  });
  const ACCURACY = Object.freeze(['teaching', 'quantitative', 'research']);   // qualitative behaviour · numbers a course checks · research-grade
  const STATUSES = Object.freeze(['new', 'seen', 'planned', 'building', 'available', 'declined', 'duplicate']);
  const OPEN = Object.freeze(['new', 'seen', 'planned', 'building']);
  const VIA = Object.freeze(['app', 'claude']);
  const ENGINE_RE = /^[a-z][a-z0-9-]*@\d+$/, SUBJ_RE = /^[a-z0-9][a-z0-9_-]{0,80}$/i;
  const clip = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);

  /** normalize(input, {catalog?}) → {row, problems: [{field, code}]}; codes: missing, short, long, value. The row is what is stored. */
  function normalize(input, opts) {
    const o = input && typeof input === 'object' ? input : {}, P = [], row = {};
    for (const [k, f] of Object.entries(FIELDS)) {
      const raw = String(o[k] == null ? '' : o[k]).trim();
      if (!raw) { if (f.need) P.push({ field: k, code: 'missing' }); row[k] = null; continue; }
      if (raw.length > f.max) P.push({ field: k, code: 'long' });
      else if (f.min && raw.length < f.min) P.push({ field: k, code: 'short' });
      row[k] = clip(raw, f.max);
    }
    row.accuracy = ACCURACY.includes(o.accuracy) ? o.accuracy : 'teaching';
    if (o.accuracy != null && !ACCURACY.includes(o.accuracy)) P.push({ field: 'accuracy', code: 'value' });
    row.subject = typeof o.subject === 'string' && SUBJ_RE.test(o.subject) ? o.subject : null;
    row.via = VIA.includes(o.via) ? o.via : 'app';
    row.locale = typeof o.locale === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/.test(o.locale) ? o.locale : null;
    const cat = (opts && opts.catalog) || root.NoemaEngineCatalog;
    row.suggested = cat && typeof cat.suggest === 'function' ? cat.suggest([row.title, row.field, row.what, row.learner, row.measure].filter(Boolean).join(' ')).map(s => s.id) : [];
    return { row, problems: P };
  }
  /** the fields an admin may change, cleaned: {status?, engine_id?, answer?, fixed_in?} or {error} */
  function cleanPatch(p) {
    const out = {};
    if (p.status != null) { if (!STATUSES.includes(p.status)) return { error: 'status: one of ' + STATUSES.join(', ') }; out.status = p.status; }
    if (p.engine_id != null) { const e = String(p.engine_id).trim(); if (e && !ENGINE_RE.test(e)) return { error: 'engine_id: an engine id such as chem@1' }; out.engine_id = e || null; }
    if (p.answer != null) out.answer = clip(p.answer, 4000) || null;
    if (p.fixed_in != null) out.fixed_in = clip(p.fixed_in, 300) || null;
    return out;
  }
  /** brief(row) → the English markdown a developer or Claude builds the engine from (the contract: docs/INTERACTIVE_LIBRARY.md §1) */
  function brief(r) {
    const L = [`# Engine request: ${r.title || '(no title)'}`, '',
      `- id: ${r.id || '—'} · status: ${r.status || 'new'} · asked ${r.created_at ? String(r.created_at).slice(0, 16).replace('T', ' ') : '—'} by ${r.requester_name || '—'} (${r.via || 'app'}${r.locale ? ', writes in ' + r.locale : ''})`,
      `- field: ${r.field || '—'} · accuracy wanted: ${r.accuracy || 'teaching'}${r.subject ? ' · for the subject ' + r.subject : ''}`,
      `- the library may already cover it: ${(r.suggested || []).length ? r.suggested.join(', ') + ' (check these first: extend an engine of the library before adding one)' : 'nothing matched'}`, ''];
    for (const [k, h] of [['what', 'What should be simulated'], ['learner', 'What the learner changes and sees'], ['measure', 'What is measured, graded or found'], ['sources', 'Sources it should follow'], ['examples', 'Exercises it should make possible']])
      if (r[k]) L.push(`## ${h}`, '', String(r[k]), '');
    L.push('## How to build it', '', 'Follow docs/INTERACTIVE_LIBRARY.md §1 (AnrPg/noema-lite): first decide whether an engine of the library can be EXTENDED (additive, the same id) — a new engine only when the model is a new family. A new engine is `engine/src/48_lib_<name>.js` on NoemaLibCore with its Python twin `tools/lib_<name>.py`, its chapter `docs/library/<name>.md` (every model with its source), tests with published reference values and edge cases, fixtures for the JS ↔ Python parity, a reference activity, its words in every UI locale, and its entry in the catalogue. Then answer the request with noema_engine_request_update (status available, engine_id, fixed_in).');
    return L.join('\n');
  }
  /* i18n-ignore-end */

  /* ---------- the adapters ---------- */
  const COLS = 'id,title,field,what,learner,measure,sources,examples,accuracy,subject,via,locale,suggested,status,engine_id,answer,fixed_in,requester_name,created_at,updated_at';
  function cloudStore(CL) {
    const api = (p, o) => CL.api(p, o);
    let adminP = null, adminFor = null;
    return {
      kind: 'cloud',
      submit: row => api('/rest/v1/noema_engine_requests', { method: 'POST', body: [row], headers: { Prefer: 'return=representation' } }).then(r => (r || [])[0] || row),
      mine: () => api(`/rest/v1/noema_engine_requests?select=${COLS}&requester=eq.${encodeURIComponent(CL.uid())}&order=created_at.desc&limit=200`).then(r => r || []),
      all: st => api(`/rest/v1/noema_engine_requests?select=${COLS}${st && st !== 'all' ? '&status=in.(' + (st === 'open' ? OPEN : [st]).join(',') + ')' : ''}&order=created_at.desc&limit=300`).then(r => r || []),
      update: (id, patch) => api(`/rest/v1/noema_engine_requests?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' } }),
      isAdmin() {
        const me = CL.uid(); if (adminFor !== me) { adminFor = me; adminP = null; }
        return adminP || (adminP = api('/rest/v1/noema_admins?select=user_id&limit=1').then(r => Array.isArray(r) && r.length > 0).catch(() => { adminP = null; return false; }));
      },
    };
  }
  function localStore(key) {
    const read = () => { try { return JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (e) { return []; } };
    const write = l => { try { localStorage.setItem(key, JSON.stringify(l.slice(-100))); } catch (e) { } };
    return {
      kind: 'local',
      async submit(row) { const r = { ...row, id: (root.crypto && crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now()), status: 'new', created_at: new Date().toISOString() }; const l = read(); l.push(r); write(l); return r; },
      async mine() { return read().slice().reverse(); },
      async all() { return read().slice().reverse(); },
      async update() { },
      async isAdmin() { return false; },
    };
  }
  /** store(account) → the adapter for this account: the cloud when signed in, else this device */
  function store(acc) {
    const CL = root.NoemaCloud;
    if (acc && acc.kind === 'cloud' && CL && CL.session && CL.session() && CL.api) return cloudStore(CL);
    return localStore(`noema1:${(acc && acc.id) || 'local'}:enginereq`);
  }

  root.NoemaEngineRequests = Object.freeze({ FIELDS, ACCURACY, STATUSES, OPEN, VIA, ENGINE_RE, normalize, cleanPatch, brief, store, cloudStore, localStore, COLS });
})(typeof window !== 'undefined' ? window : globalThis);
