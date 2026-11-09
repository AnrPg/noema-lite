/* ===================== xAPI 1.0.3 / cmi5 export of the learner's activity attempts (docs/activities-dev/xapi.md, docs/adr/001 D12) =====================
   Pure functions: no network, no LRS. The app (later) offers the result as a JSON file to download.
     NoemaXAPI.statements(input, opts) → [statement]      input: { attempts, answers?, pack?: {id, title}, chapters?: [chapter] }
        attempts: [{ exercise, id, seed, t, t0?, hints, result: {score, passed, detail, t}, events: [{t, name, data}] }] (each attempt
        at an interactive exercise, in its last version) · answers: [{ id, exercise, ok, t, conf?, n?, okCount? }] (each answer to
        an ordinary exercise; n / okCount: one entry that stands for several, counted before the learning log). Both come from the
        learning log: NoemaCore.learning.xapi(subject) (src/features/study/domain/events/xapi.ts).
     NoemaXAPI.exportFile(input, opts) → { format: 'noema.xapi-export/v1', … statements }   (src/contracts/schemas/noema.xapi-export.v1.schema.json)
     NoemaXAPI.cmi5Package(course, opts) → { files: { 'cmi5.xml': xml }, aus: [{id, chapter, exercise?}] }
     NoemaXAPI.validate(stmt) → [problem]   ·   NoemaXAPI.validateAll(list) → [problem] (also the cmi5 rules across statements)
     NoemaXAPI.subjectRecord({ attempts, answers, pack, chapters, accountId, site, now }) → { name: '<id>.xapi.json', file } | null (nothing recorded)
     NoemaXAPI.subjectCmi5({ pack, chapters, site }) → { name: '<id>.cmi5.zip', files: { 'cmi5.xml': xml } }   (what the app's two menus download:
       the subject's ⋮ in the engine and the shell's "My subjects" ⋮; the same ids and AUs either way)
   opts: { actor: { name?, account: { homePage, name } } (never an email: mbox / mbox_sha1sum / openid are never written),
           activityBase: 'https://noema-lite.netlify.app/xapi/<packId>/', registration?: UUID | registrationSeed?: any,
           locale?: 'en', profile?: 'xapi' | 'cmi5', granularity?: 'chapter' | 'activity' (cmi5: the AU of a statement) }
   Every id is a UUID v5 of the content (re-export gives the same statements: idempotent at the LRS). */
/* i18n-ignore-start */   // IRIs, verbs and protocol words, not text for learners
var NoemaXAPI = (() => {   // the page loads this file on its own (the shell's "My subjects" ⋮); engine.js leaves it out (tools/build.py PAGE_SRC)
  const VERSION = '1.0.3';
  const ADL = 'http://adlnet.gov/expapi/verbs/';
  const VERBS = {
    attempted: ADL + 'attempted', interacted: 'http://adlnet.gov/expapi/verbs/interacted', answered: ADL + 'answered',
    passed: ADL + 'passed', failed: ADL + 'failed', completed: ADL + 'completed', initialized: ADL + 'initialized', terminated: ADL + 'terminated',
  };
  const CMI5_CAT = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
  const MOVEON_CAT = 'https://w3id.org/xapi/cmi5/context/categories/moveon';
  const CMI5_SESSION = 'https://w3id.org/xapi/cmi5/context/extensions/sessionid';
  const CMI5_DEFINED = new Set(['launched', 'initialized', 'completed', 'passed', 'failed', 'abandoned', 'waived', 'terminated', 'satisfied']);
  const ACT_TYPE = { course: 'https://w3id.org/xapi/cmi5/activitytype/course', block: 'https://w3id.org/xapi/cmi5/activitytype/block',
    sim: 'http://adlnet.gov/expapi/activities/simulation', interaction: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    chapter: 'http://adlnet.gov/expapi/activities/module', lesson: 'http://adlnet.gov/expapi/activities/lesson' };
  const INTERACTION = { mcq: 'choice', odd: 'choice', predict: 'choice', inquiry: 'choice', tf: 'true-false', cloze: 'fill-in', match: 'matching',
    order: 'sequencing', bucket: 'matching', calc: 'numeric', free: 'long-fill-in', write: 'long-fill-in', spotbug: 'choice', img_hotspot: 'choice',
    img_sequence: 'sequencing', img_drag: 'matching', img_label: 'fill-in', img_select: 'matching' };
  const EXT_BASE = 'https://noema-lite.netlify.app/xapi/ext/';
  const NS = '6f1d4a52-7c1e-5b0a-9e43-2a8d1c7b3f60';   // the noema-lite namespace of every UUID v5 here
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const IRI_RE = /^[a-z][a-z0-9+.-]*:\/\/[^\s<>"{}|\\^`]+$/i;
  const LANG_RE = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/;
  const DUR_RE = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
  const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

  /* ---------- SHA-1 and UUID v5 (RFC 4122 §4.3), synchronous and dependency-free ---------- */
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    const out = []; const e = unescape(encodeURIComponent(s)); for (let i = 0; i < e.length; i++) out.push(e.charCodeAt(i)); return Uint8Array.from(out);
  }
  function sha1(bytes) {
    const ml = bytes.length, nb = ((ml + 9 + 63) >> 6) << 6, m = new Uint8Array(nb);
    m.set(bytes); m[ml] = 0x80;
    const bits = ml * 8, dv = new DataView(m.buffer);
    dv.setUint32(nb - 4, bits >>> 0); dv.setUint32(nb - 8, Math.floor(bits / 4294967296));
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const w = new Uint32Array(80), rol = (x, n) => (x << n) | (x >>> (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? ((b & c) | (~b & d)) + 0x5a827999 : i < 40 ? (b ^ c ^ d) + 0x6ed9eba1 : i < 60 ? ((b & c) | (b & d) | (c & d)) + 0x8f1bbcdc : (b ^ c ^ d) + 0xca62c1d6;
        const t = (rol(a, 5) + f + e + w[i]) >>> 0; e = d; d = c; c = rol(b, 30) >>> 0; b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    const out = new Uint8Array(20), ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((x, i) => ov.setUint32(i * 4, x));
    return out;
  }
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  function uuid5(name, ns = NS) {
    const nsb = Uint8Array.from(ns.replace(/-/g, '').match(/../g).map(x => parseInt(x, 16)));
    const nb = utf8(String(name)), all = new Uint8Array(16 + nb.length); all.set(nsb); all.set(nb, 16);
    const h = sha1(all).slice(0, 16); h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
    const x = hex(h); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  }

  /* ---------- small helpers ---------- */
  /** a stable JSON (sorted keys): the name of a UUID v5 must not depend on the order of the keys */
  function stable(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  const num = v => typeof v === 'number' && isFinite(v);
  const iso = t => (num(t) && t > 0 && t < 8.64e15) ? new Date(t).toISOString() : null;
  /** ISO 8601 duration of `ms` milliseconds, to 0.01 s (cmi5 §9.5.4.1): PT1H2M3.45S */
  function duration(ms) {
    if (!num(ms) || ms < 0) ms = 0;
    const cs = Math.round(ms / 10), h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = (cs % 6000) / 100;
    let out = 'PT'; if (h) out += h + 'H'; if (m) out += m + 'M';
    if (s || (!h && !m)) out += (Number.isInteger(s) ? s : s.toFixed(2).replace(/0$/, '')) + 'S';
    return out;
  }
  /** plain text of an exercise prompt for an activity name: the inline format's marks removed, at most 120 characters */
  function plain(s) {
    let t = String(s || '').replace(/\$\$?([^$]*)\$\$?/g, '$1').replace(/\[\[([^\]|]*)[^\]]*\]\]/g, '___').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
    return t.length > 120 ? t.slice(0, 119) + '…' : t;
  }
  const lang = l => (typeof l === 'string' && LANG_RE.test(l)) ? l : 'en';
  const langMap = (l, s) => ({ [l]: String(s) });
  const enc = s => encodeURIComponent(String(s));

  function setup(input, opts) {
    opts = opts || {};
    const a = opts.actor || {}, acc = a.account || {};
    if (!acc || typeof acc.homePage !== 'string' || !IRI_RE.test(acc.homePage) || typeof acc.name !== 'string' || !acc.name)
      throw new Error('NoemaXAPI: opts.actor.account {homePage (IRI), name} is required (an account, never an email)');
    const actor = { objectType: 'Agent', account: { homePage: acc.homePage, name: acc.name } };
    if (typeof a.name === 'string' && a.name && !/@/.test(a.name)) actor.name = a.name;   // a display name; an address is never written
    const pack = (input && input.pack) || {};
    let base = opts.activityBase || ('https://noema-lite.netlify.app/xapi/' + enc(pack.id || 'pack') + '/');
    if (!base.endsWith('/')) base += '/';
    if (!IRI_RE.test(base)) throw new Error('NoemaXAPI: opts.activityBase must be an absolute IRI');
    const registration = (typeof opts.registration === 'string' && UUID_RE.test(opts.registration)) ? opts.registration.toLowerCase()
      : uuid5('registration|' + stable(opts.registrationSeed !== undefined ? opts.registrationSeed : [acc.homePage, acc.name, base]));
    const ext = opts.extBase || EXT_BASE;
    const X = k => ext + k;
    // what the exercises are: id → { ex, chapter }
    const EXS = {}, CHS = {};
    for (const c of (input && Array.isArray(input.chapters) ? input.chapters : [])) {
      if (!c || typeof c.id !== 'string') continue;
      CHS[c.id] = c;
      for (const e of Array.isArray(c.exercises) ? c.exercises : []) if (e && typeof e.id === 'string') EXS[e.id] = { ex: e, chapter: c.id };
    }
    const chapterOf = id => (EXS[id] && EXS[id].chapter) || ((/^(ch\d+)-/.exec(id) || [])[1]) || null;
    return { opts, actor, base, registration, X, EXS, CHS, chapterOf, locale: lang(opts.locale || pack.language), pack,
      profile: opts.profile === 'cmi5' ? 'cmi5' : 'xapi', granularity: opts.granularity === 'activity' ? 'activity' : 'chapter' };
  }

  const verb = v => ({ id: VERBS[v], display: { 'en-US': v } });
  function exerciseObject(C, exId, fallbackType) {
    const info = C.EXS[exId], ex = info ? info.ex : null, type = (ex && ex.type) || fallbackType || null;
    const def = { type: type === 'sim' ? ACT_TYPE.sim : ACT_TYPE.interaction, name: langMap(C.locale, (ex && plain(ex.q)) || exId) };
    if (type && type !== 'sim') def.interactionType = INTERACTION[type] || 'other';
    if (type) def.extensions = { [C.X('exercise-type')]: type };
    return { objectType: 'Activity', id: C.base + 'exercise/' + enc(exId), definition: def };
  }
  const chapterRef = (C, ch) => ({ objectType: 'Activity', id: C.base + 'chapter/' + enc(ch), definition: { type: ACT_TYPE.chapter, name: langMap(C.locale, (C.CHS[ch] && C.CHS[ch].title) || ch) } });
  const courseRef = C => ({ objectType: 'Activity', id: C.base, definition: { type: ACT_TYPE.course, name: langMap(C.locale, C.pack.title || C.pack.id || 'noema-lite pack') } });
  const auId = (C, ch, exId) => C.base + 'au/' + enc(C.granularity === 'activity' && exId ? exId : (ch || 'pack'));
  const auObject = (C, ch, exId) => ({ objectType: 'Activity', id: auId(C, ch, exId), definition: { type: ACT_TYPE.lesson, name: langMap(C.locale, C.granularity === 'activity' && exId ? ((C.EXS[exId] && plain(C.EXS[exId].ex.q)) || exId) : ((C.CHS[ch] && C.CHS[ch].title) || ch || 'pack')) } });

  /** the attempts: [{ exercise, id, seed, t, t0?, hints, result: {score, passed, detail, t}, events: [{t, name, data}] }] */
  function attemptsOf(input) {
    const src = input && input.attempts, out = [];
    if (Array.isArray(src)) for (const a of src) if (a && typeof a === 'object' && typeof a.exercise === 'string') out.push([a.exercise, a]);
    const t0 = a => { const ev = Array.isArray(a.events) ? a.events.filter(e => e && num(e.t)) : []; return num(a.t0) ? a.t0 : ev.length ? Math.min(...ev.map(e => e.t)) : num(a.result && a.result.t) ? a.result.t : num(a.t) ? a.t : 0; };
    return out.map(([k, a]) => ({ exId: k, a, t0: t0(a) })).sort((x, y) => (x.t0 - y.t0) || (x.exId < y.exId ? -1 : x.exId > y.exId ? 1 : 0));
  }

  /** what a result says beyond its score: the detail text and, for the checks grader, every check met or not ({label, ok}) */
  function resultExt(C, r, ext) {
    if (typeof r.detail === 'string' && r.detail) ext[C.X('detail')] = r.detail;
    if (Array.isArray(r.checks)) ext[C.X('checks')] = r.checks.filter(c => c && typeof c === 'object').map(c => ({ label: typeof c.label === 'string' ? c.label : null, ok: !!c.ok }));
    return ext;
  }
  function statements(input, opts) {
    const C = setup(input, opts), out = [];
    const cmi5 = C.profile === 'cmi5';
    const auState = {};   // cmi5: per AU, what it said already (passed / completed once per registration; failed never after passed)
    function push(v, object, { t, result, ctxExt, parents, category, session, key }) {
      const ctx = { registration: C.registration, contextActivities: {}, language: C.locale };
      if (parents && parents.length) ctx.contextActivities.parent = parents;
      ctx.contextActivities.grouping = [courseRef(C)];
      if (category && category.length) ctx.contextActivities.category = category.map(id => ({ objectType: 'Activity', id }));
      const ex = Object.assign({}, ctxExt || {}); if (session) ex[CMI5_SESSION] = session;
      if (Object.keys(ex).length) ctx.extensions = ex;
      const st = { id: uuid5('statement|' + C.registration + '|' + v + '|' + object.id + '|' + key), actor: C.actor, verb: verb(v), object, context: ctx };
      if (result) st.result = result;
      const ts = iso(t); if (ts) st.timestamp = ts;
      st.version = VERSION;
      out.push(st); return st;
    }

    for (const { exId, a, t0 } of attemptsOf(input)) {
      const ch = C.chapterOf(exId), obj = exerciseObject(C, exId, 'sim');
      const att = typeof a.id === 'string' && a.id ? a.id : uuid5('attempt|' + exId + '|' + stable([a.seed, t0]));
      const events = (Array.isArray(a.events) ? a.events : []).filter(e => e && typeof e.name === 'string');
      const r = a.result && typeof a.result === 'object' && num(a.result.score) ? a.result : null;
      const end = r && num(r.t) ? r.t : events.length && num(events[events.length - 1].t) ? events[events.length - 1].t : num(a.t) ? a.t : t0;
      const hints = Number.isInteger(a.hints) && a.hints >= 0 ? a.hints : 0;
      const base = { [C.X('attempt-id')]: att }; if (a.seed != null) base[C.X('seed')] = a.seed;
      const parents = ch ? [chapterRef(C, ch)] : [];
      const key = k => att + '|' + k;
      if (!cmi5) {
        push('attempted', obj, { t: t0, parents, ctxExt: Object.assign({}, base, { [C.X('hints-used')]: hints }), key: key('start') });
        events.forEach((e, i) => push('interacted', obj, { t: e.t, parents, key: key('ev' + i),
          ctxExt: Object.assign({}, base, { [C.X('event-name')]: e.name, [C.X('event-index')]: i }, e.data !== undefined ? { [C.X('event-data')]: e.data } : {}) }));
        if (r) {
          const score = Math.max(0, Math.min(1, r.score));
          const res = { score: { scaled: score, raw: score, min: 0, max: 1 }, success: !!r.passed, completion: true, duration: duration(end - t0), extensions: { [C.X('hints-used')]: hints } };
          resultExt(C, r, res.extensions);
          push(r.passed ? 'passed' : 'failed', obj, { t: r.t || end, parents, ctxExt: base, result: res, key: key('result') });
        }
        continue;
      }
      // cmi5: a session per attempt; the defined statements are about the AU, the interactions about the exercise inside it
      const au = auObject(C, ch, exId), session = uuid5('session|' + C.registration + '|' + att), st = auState[au.id] = auState[au.id] || {};
      const auParents = C.granularity === 'activity' && ch ? [chapterRef(C, ch)] : [];
      push('initialized', au, { t: t0, parents: auParents, category: [CMI5_CAT], session, ctxExt: base, key: key('init') });
      events.forEach((e, i) => push('interacted', obj, { t: e.t, parents: [au], session, key: key('ev' + i),
        ctxExt: Object.assign({}, base, { [C.X('event-name')]: e.name, [C.X('event-index')]: i }, e.data !== undefined ? { [C.X('event-data')]: e.data } : {}) }));
      if (r) {
        const score = Math.max(0, Math.min(1, r.score)), dur = duration(end - t0);
        const ext = resultExt(C, r, { [C.X('hints-used')]: hints });
        // the exercise's own outcome, as a cmi5 "allowed" statement (no cmi5 category)
        push('answered', obj, { t: r.t || end, parents: [au], session, ctxExt: base, key: key('answer'),
          result: { score: { scaled: score, raw: score, min: 0, max: 1 }, success: !!r.passed, completion: true, duration: dur, extensions: ext } });
        if (r.passed && !st.passed) {
          st.passed = true;
          push('passed', au, { t: r.t || end, parents: auParents, category: [CMI5_CAT, MOVEON_CAT], session, ctxExt: base, key: key('passed'),
            result: { score: { scaled: score, raw: score, min: 0, max: 1 }, success: true, duration: dur } });
        } else if (!r.passed && !st.passed && !st.failed) {
          st.failed = true;
          push('failed', au, { t: r.t || end, parents: auParents, category: [CMI5_CAT, MOVEON_CAT], session, ctxExt: base, key: key('failed'),
            result: { score: { scaled: score, raw: score, min: 0, max: 1 }, success: false, duration: dur } });
        }
        if (!st.completed) {
          st.completed = true;
          push('completed', au, { t: r.t || end, parents: auParents, category: [CMI5_CAT, MOVEON_CAT], session, ctxExt: base, key: key('completed'), result: { completion: true, duration: dur } });
        }
      }
      push('terminated', au, { t: end, parents: auParents, category: [CMI5_CAT], session, ctxExt: base, key: key('end'), result: { duration: duration(end - t0) } });
    }

    // the ordinary exercises: every answer → one "answered" at its own time (its id: the answer's, so the same answer is the same statement)
    const answers = (input && Array.isArray(input.answers) ? input.answers : [])
      .filter(r => r && typeof r === 'object' && typeof r.id === 'string' && typeof r.exercise === 'string' && typeof r.ok === 'boolean')
      .sort((a, b) => ((num(a.t) ? a.t : 0) - (num(b.t) ? b.t : 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const r of answers) {
      const exId = r.exercise;
      const ch = C.chapterOf(exId), obj = exerciseObject(C, exId, null);
      const ext = { [C.X('answers-count')]: Number.isInteger(r.n) ? r.n : 1, [C.X('correct-count')]: Number.isInteger(r.okCount) ? r.okCount : (r.ok ? 1 : 0) };
      if (typeof r.conf === 'string') ext[C.X('confidence')] = r.conf;
      const result = { success: r.ok, completion: true, extensions: ext };
      const k = 'ans|' + r.id;
      if (cmi5) push('answered', obj, { t: r.t, parents: [auObject(C, ch, exId)], session: uuid5('session|' + C.registration + '|answers|' + (C.granularity === 'activity' ? exId : ch)), result, key: k });
      else push('answered', obj, { t: r.t, parents: ch ? [chapterRef(C, ch)] : [], result, key: k });
    }
    return out;
  }

  /** the file the app offers to download (src/contracts/schemas/noema.xapi-export.v1.schema.json) */
  function exportFile(input, opts) {
    const C = setup(input, opts), list = statements(input, opts);
    const f = { format: 'noema.xapi-export/v1', xapiVersion: VERSION, profile: C.profile, pack: { id: String(C.pack.id || ''), activityBase: C.base }, registration: C.registration, statements: list };
    if (opts && num(opts.now)) f.generated = iso(opts.now);
    return f;
  }

  /* ---------- validation: the subset of xAPI 1.0.3 and cmi5 this file writes ---------- */
  function validate(st) {
    const P = [], bad = m => P.push(m);
    if (!st || typeof st !== 'object') return ['not an object'];
    if (!UUID_RE.test(st.id || '')) bad('id is not a UUID');
    const a = st.actor;
    if (!a || typeof a !== 'object') bad('no actor');
    else {
      for (const k of ['mbox', 'mbox_sha1sum', 'openid']) if (k in a) bad('actor has ' + k + ' (never an email or another personal identifier: use an account)');
      if (a.objectType && a.objectType !== 'Agent') bad('actor.objectType must be Agent');
      if (!a.account || !IRI_RE.test(a.account.homePage || '') || typeof a.account.name !== 'string' || !a.account.name) bad('actor.account needs homePage (IRI) and name');
      if (a.name != null && (typeof a.name !== 'string' || /@/.test(a.name))) bad('actor.name must be a display name, not an address');
      if (a.account && Object.keys(a.account).some(k => k !== 'homePage' && k !== 'name')) bad('actor.account: only homePage and name');
    }
    const v = st.verb;
    if (!v || !IRI_RE.test(v.id || '')) bad('verb.id is not an IRI');
    else if (!v.display || typeof v.display !== 'object' || !Object.keys(v.display).length) bad('verb.display is missing');
    const o = st.object;
    if (!o || !IRI_RE.test(o.id || '')) bad('object.id is not an IRI');
    else if (o.objectType && o.objectType !== 'Activity') bad('object.objectType must be Activity');
    else if (o.definition) {
      const d = o.definition;
      if (d.type != null && !IRI_RE.test(d.type)) bad('object.definition.type is not an IRI');
      if (d.name && Object.keys(d.name).some(l => !LANG_RE.test(l))) bad('object.definition.name: a key is not a language tag');
      if (d.interactionType && d.type !== ACT_TYPE.interaction) bad('interactionType needs the cmi.interaction type');
      for (const k of Object.keys(d.extensions || {})) if (!IRI_RE.test(k)) bad('definition extension key is not an IRI: ' + k);
    }
    const r = st.result;
    if (r != null) {
      if (typeof r !== 'object') bad('result is not an object');
      else {
        const s = r.score;
        if (s != null) {
          if (s.scaled != null && !(num(s.scaled) && s.scaled >= -1 && s.scaled <= 1)) bad('result.score.scaled must be in [-1, 1]');
          if (s.min != null && s.max != null && !(s.min < s.max)) bad('result.score: min must be < max');
          if (s.raw != null && ((s.min != null && s.raw < s.min) || (s.max != null && s.raw > s.max))) bad('result.score.raw outside [min, max]');
        }
        if (r.success != null && typeof r.success !== 'boolean') bad('result.success must be a boolean');
        if (r.completion != null && typeof r.completion !== 'boolean') bad('result.completion must be a boolean');
        if (r.duration != null && !DUR_RE.test(r.duration)) bad('result.duration is not an ISO 8601 duration');
        for (const k of Object.keys(r.extensions || {})) if (!IRI_RE.test(k)) bad('result extension key is not an IRI: ' + k);
      }
    }
    const c = st.context;
    if (c != null) {
      if (c.registration != null && !UUID_RE.test(c.registration)) bad('context.registration is not a UUID');
      if (c.language != null && !LANG_RE.test(c.language)) bad('context.language is not a language tag');
      for (const k of Object.keys(c.extensions || {})) if (!IRI_RE.test(k)) bad('context extension key is not an IRI: ' + k);
      for (const [k, list] of Object.entries(c.contextActivities || {})) {
        if (!['parent', 'grouping', 'category', 'other'].includes(k)) bad('contextActivities.' + k + ' is not allowed');
        else if (!Array.isArray(list) || !list.every(x => x && IRI_RE.test(x.id || ''))) bad('contextActivities.' + k + ' must be a list of activities');
      }
    }
    if (st.timestamp != null && !TS_RE.test(st.timestamp)) bad('timestamp is not ISO 8601 with a zone');
    if (st.version != null && !/^1\.0(\.\d+)?$/.test(st.version)) bad('version must be 1.0.x');
    // cmi5 (cmi5 spec §9): a defined statement carries the cmi5 category, a registration and the session id; the rest do not carry the category
    const name = v && typeof v.id === 'string' ? v.id.slice(v.id.lastIndexOf('/') + 1) : '';
    const cats = ((c && c.contextActivities && c.contextActivities.category) || []).map(x => x && x.id);
    const isCmi5 = cats.includes(CMI5_CAT), sess = c && c.extensions && c.extensions[CMI5_SESSION] != null;
    if (isCmi5) {
      if (!(v && v.id.startsWith(ADL) && CMI5_DEFINED.has(name))) bad('the cmi5 category on a verb cmi5 does not define (' + name + ')');
      if (!c.registration) bad('cmi5: a registration is required');
      if (!sess) bad('cmi5: the sessionid extension is required');
      if (name === 'passed' && !(r && r.success === true)) bad('cmi5 passed: result.success must be true');
      if (name === 'failed' && !(r && r.success === false)) bad('cmi5 failed: result.success must be false');
      if (name === 'completed' && !(r && r.completion === true)) bad('cmi5 completed: result.completion must be true');
      if (['passed', 'failed', 'completed', 'terminated'].includes(name) && !(r && r.duration)) bad('cmi5 ' + name + ': result.duration is required');
      if ((name === 'passed' || name === 'failed') && r && r.completion != null) bad('cmi5 ' + name + ': no result.completion');
      if (cats.includes(MOVEON_CAT) && !['passed', 'failed', 'completed'].includes(name)) bad('cmi5: the moveOn category only on passed, failed, completed');
      if (['passed', 'failed', 'completed'].includes(name) && !cats.includes(MOVEON_CAT)) bad('cmi5 ' + name + ': the moveOn category is required');
    } else if (cats.includes(MOVEON_CAT)) bad('the moveOn category without the cmi5 category');
    return P;
  }
  /** every statement, plus the rules across them: unique ids; cmi5 per AU and registration: passed / completed at most once, no failed after passed */
  function validateAll(list) {
    const P = []; if (!Array.isArray(list)) return ['not a list'];
    const ids = new Set(), seen = {};
    list.forEach((st, i) => {
      for (const p of validate(st)) P.push('#' + i + ': ' + p);
      if (st && st.id) { if (ids.has(st.id)) P.push('#' + i + ': duplicate id ' + st.id); ids.add(st.id); }
      const cats = ((st && st.context && st.context.contextActivities && st.context.contextActivities.category) || []).map(x => x && x.id);
      if (!cats.includes(CMI5_CAT)) return;
      const name = st.verb.id.slice(st.verb.id.lastIndexOf('/') + 1), k = st.context.registration + ' ' + st.object.id, s = seen[k] = seen[k] || {};
      if ((name === 'passed' || name === 'completed') && s[name]) P.push('#' + i + ': cmi5: a second ' + name + ' for ' + st.object.id);
      if (name === 'failed' && s.passed) P.push('#' + i + ': cmi5: failed after passed for ' + st.object.id);
      s[name] = true;
    });
    return P;
  }

  /* ---------- cmi5.xml (cmi5 spec §13, the course structure) ---------- */
  const xesc = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const ls = (tag, l, s, pad) => `${pad}<${tag}>\n${pad}  <langstring lang="${xesc(l)}">${xesc(s)}</langstring>\n${pad}</${tag}>\n`;
  /** course: a pack ({ id, subject: {title, description, language}, chapters: [{id, title, subtitle, exercises}] } or a built pack.json);
      opts: { activityBase, launchBase ('https://noema-lite.netlify.app/'), granularity ('chapter': one AU per chapter; 'activity': one block per chapter,
      an AU per sim exercise, one AU for the rest of the chapter), moveOn ('CompletedOrPassed'), masteryScore (0–1), locale } */
  function cmi5Package(course, opts) {
    opts = opts || {};
    const subj = (course && course.subject) || {}, id = String((course && course.id) || subj.id || 'pack');
    const l = lang(opts.locale || subj.language), title = subj.title || (course && course.title) || id, desc = subj.description || title;
    let base = opts.activityBase || ('https://noema-lite.netlify.app/xapi/' + enc(id) + '/'); if (!base.endsWith('/')) base += '/';
    const launch = opts.launchBase || 'https://noema-lite.netlify.app/';
    const MOVEON = ['Passed', 'Completed', 'CompletedAndPassed', 'CompletedOrPassed', 'NotApplicable'];
    const moveOn = MOVEON.includes(opts.moveOn) ? opts.moveOn : 'CompletedOrPassed';
    const mastery = num(opts.masteryScore) && opts.masteryScore >= 0 && opts.masteryScore <= 1 ? ` masteryScore="${opts.masteryScore}"` : '';
    const url = ch => xesc(launch + (launch.includes('?') ? '&' : '?') + 'subject=' + enc(id) + '#/ch/' + enc(ch));
    const chapters = (course && Array.isArray(course.chapters) ? course.chapters : []).filter(c => c && typeof c.id === 'string');
    const aus = [];
    const au = (auid, t, d, ch, pad, ex) => {
      aus.push({ id: auid, chapter: ch, ...(ex ? { exercise: ex } : {}) });
      return `${pad}<au id="${xesc(auid)}" moveOn="${moveOn}"${mastery} launchMethod="AnyWindow">\n` + ls('title', l, t, pad + '  ') + ls('description', l, d, pad + '  ') + `${pad}  <url>${url(ch)}</url>\n${pad}</au>\n`;
    };
    let body = '';
    for (const c of chapters) {
      const ct = c.title || c.id, cd = c.subtitle || c.mantra || ct;
      if (opts.granularity !== 'activity') { body += au(base + 'au/' + enc(c.id), ct, cd, c.id, '  '); continue; }
      const sims = (c.exercises || []).filter(e => e && e.type === 'sim' && typeof e.id === 'string'), rest = (c.exercises || []).length - sims.length;
      let inner = '';
      for (const e of sims) inner += au(base + 'au/' + enc(e.id), plain(e.q) || e.id, plain(e.q) || e.id, c.id, '    ', e.id);
      if (rest > 0 || !sims.length) inner += au(base + 'au/' + enc(c.id), ct, cd, c.id, '    ');
      body += `  <block id="${xesc(base + 'block/' + enc(c.id))}">\n` + ls('title', l, ct, '    ') + ls('description', l, cd, '    ') + inner + '  </block>\n';
    }
    const xml = '<?xml version="1.0" encoding="utf-8"?>\n<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">\n'
      + `  <course id="${xesc(base)}">\n` + ls('title', l, title, '    ') + ls('description', l, desc, '    ') + '  </course>\n' + body + '</courseStructure>\n';
    return { files: { 'cmi5.xml': xml }, aus };
  }

  /** files {path: text} → a zip Blob, with the app's zip writer (JSZip, loaded on demand by NoemaViewer like the package export) */
  async function zip(files) {
    const W = typeof window !== 'undefined' ? window : globalThis;
    if (!W.JSZip && W.NoemaViewer && W.NoemaViewer.jszip) await W.NoemaViewer.jszip();
    if (!W.JSZip) throw Object.assign(new Error('The package writer is not available.'), { code: 'files.no_writer', params: {} });
    const z = new W.JSZip(); for (const [p, t] of Object.entries(files || {})) z.file(p, t);
    return z.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  }
  /* ---------- one subject, as the app exports it (the subject's ⋮ and the shell's "My subjects" ⋮) ---------- */
  const siteOf = s => String(s || 'https://noema-lite.netlify.app').replace(/\/+$/, '') + '/';
  const baseOf = (site, id) => site + 'xapi/' + encodeURIComponent(id) + '/';
  /** the learner's record of one subject: its activity attempts and answers (NoemaCore.learning.xapi); the actor is the account id, never an e-mail */
  function subjectRecord({ attempts, answers, pack, chapters, accountId, site, now } = {}) {
    attempts = Array.isArray(attempts) ? attempts : []; answers = Array.isArray(answers) ? answers : [];
    if (!attempts.length && !answers.length) return null;
    const S = siteOf(site), p = pack || {};
    const file = exportFile({ attempts, answers, pack: { id: p.id, title: p.title, language: p.language }, chapters: chapters || [] },
      { actor: { account: { homePage: S, name: String(accountId) } }, activityBase: baseOf(S, p.id), registrationSeed: [String(accountId), p.id], now });
    return { name: p.id + '.xapi.json', file };
  }
  /** the subject as a cmi5 course for an LMS: cmi5.xml (one AU per chapter; the AUs open the chapters on the site), zipped by the caller */
  function subjectCmi5({ pack, chapters, site } = {}) {
    const S = siteOf(site), p = pack || {};
    const course = { id: p.id, subject: { id: p.id, title: p.title, description: p.description, language: p.language }, chapters: chapters || [] };
    return { name: p.id + '.cmi5.zip', files: cmi5Package(course, { activityBase: baseOf(S, p.id), launchBase: S, locale: p.language }).files };
  }

  return { VERSION, VERBS, CMI5_CAT, MOVEON_CAT, CMI5_SESSION, EXT_BASE, statements, exportFile, cmi5Package, validate, validateAll, duration, uuid5, sha1: b => hex(sha1(b)),
    subjectRecord, subjectCmi5, zip };
})();
if (typeof window !== 'undefined') window.NoemaXAPI = NoemaXAPI;
if (typeof module !== 'undefined' && module.exports) module.exports = NoemaXAPI;
/* i18n-ignore-end */
