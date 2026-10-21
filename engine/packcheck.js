/* noema-lite — pack checks shared by the app (in-browser generators) and the Claude connector (cloud/mcp).
   checkPack(p, expectId, { strict }) → { errors, warnings, counts }
   strict = also check every exercise's own fields (used for packs generated in the browser, where nothing
   else validated them; the Python validator in the skill is the full check for skill-built packs).
   i18n (docs/i18n.md): every message here stays English — they are diagnostics with the pack's own field names, read by
   the AI that repairs its chapter (engine/packgen.js), by Claude through the connector, and by the learner only as the
   technical detail after a translated sentence (“The pack has 3 error(s): …”, engine/curjobs.js, engine/packgen.js). */
(function (root) {
  /* i18n-ignore-start */
  const TYPES = new Set(['mcq', 'tf', 'odd', 'order', 'match', 'bucket', 'cloze', 'spotbug', 'calc', 'scenario', 'free', 'write', 'img_hotspot', 'img_sequence', 'img_reveal', 'img_drag', 'img_label', 'img_select', 'img_occlusion']);
  const BLOCKS = new Set(['p', 'list', 'code', 'diagram', 'table', 'callout', 'compare', 'flow', 'reveal', 'ask', 'terms', 'figure']);
  const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
  const isStr = v => typeof v === 'string' && v.trim().length > 0;
  const strs = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every(isStr);
  const intIn = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

  /** The quantity rules every new pack meets, per chapter — the SAME list as tools/pack_rules.json (validate.py / make_pack.py read
      that file; tests/pack_rules.js checks the two agree). Add a rule there and here. */
  const RULES = [{id: 'balance.type', what: 'every exercise type', field: 'type', min: 3, always: ['mcq', 'tf', 'odd', 'order', 'match', 'bucket', 'cloze', 'scenario', 'free'], features: {'code': ['spotbug', 'write'], 'math': ['calc'], 'pictures': ['img_hotspot', 'img_sequence', 'img_reveal', 'img_drag', 'img_label', 'img_select', 'img_occlusion']}}, {id: 'balance.difficulty', what: 'every difficulty', field: 'difficulty', min: 3, always: [1, 2, 3], features: {}}, {id: 'balance.tag', what: 'every focus tag', field: 'tags', min: 3, always: ['concept', 'pitfall', 'debug', 'exam', 'interview', 'compare'], features: {'code': ['syntax'], 'math': ['calc']}}];
  /** checkBalance(chapter, subject, { min }) → [{ rule, chapter, value, have, need, msg }]: every required value of every rule (and
      every optional one the chapter uses) at least `min` times (default: each rule's own min). subject.features.code / .math make
      the rules' `features` values required; 'pictures' when the chapter has a picture (docs/VISUAL.md §5: only pictures that teach). The caller decides whether the issues are errors or warnings (checkPack). */
  function checkBalance(c, subject, { min } = {}) {
    const ex = c?.exercises || [], out = [];
    const pics = ex.some(e => String(e.type).startsWith('img_')) || (c?.sections || []).some(s => (s.blocks || []).some(b => b.t === 'figure'));
    const on = [...Object.entries(subject?.features || {}).filter(([, v]) => v).map(([k]) => k), ...(pics ? ['pictures'] : [])];   // pictures: only a chapter that has one
    for (const r of RULES) {
      const n = min ?? r.min, have = new Map();
      for (const e of ex) for (const v of r.field === 'tags' ? (e.tags || []) : [e[r.field]]) have.set(v, (have.get(v) || 0) + 1);
      const optional = new Set(Object.values(r.features).flat());
      const need = new Set([...r.always, ...on.flatMap(f => r.features[f] || []), ...[...have.keys()].filter(v => optional.has(v))]);
      for (const v of need) if ((have.get(v) || 0) < n) out.push({ rule: r.id, chapter: c.id, value: v, have: have.get(v) || 0, need: n, msg: `${c.id}: [${r.id}] ${v}: ${have.get(v) || 0} exercise(s), need >= ${n} per chapter (${r.what}, tools/pack_rules.json)` });
    }
    return out;
  }

  /** The fields one exercise needs so the engine can show and grade it. */
  function checkExercise(e, media) {
    const E = []; const t = e.type; const bad = m => E.push(`${e.id}: ${m}`);
    if (!isStr(e.q) && t !== 'cloze' && t !== 'scenario') bad('missing "q"');
    switch (t) {
      case 'mcq': case 'odd': {
        if (!strs(e.options, t === 'odd' ? 4 : 2)) { bad('"options" must be a list of texts'); break; }
        const ans = Array.isArray(e.answer) ? e.answer : [e.answer];
        if (!ans.length || !ans.every(a => intIn(a, e.options.length))) bad('"answer" must be the index of an option');
        if (Array.isArray(e.answer) && !e.multi) bad('a list "answer" needs "multi": true');
        if (e.why && (!Array.isArray(e.why) || e.why.length !== e.options.length)) bad('"why" needs one text per option');
        break;
      }
      case 'tf': if (typeof e.answer !== 'boolean') bad('"answer" must be true or false'); break;
      case 'order': if (!strs(e.items, 3)) bad('"items" needs ≥ 3 texts in the correct order'); break;
      case 'match': if (!Array.isArray(e.pairs) || e.pairs.length < 3 || !e.pairs.every(p => Array.isArray(p) && p.length === 2 && isStr(p[0]) && isStr(p[1]))) bad('"pairs" needs ≥ 3 [left, right] pairs');
        else if (new Set(e.pairs.map(p => p[1])).size !== e.pairs.length) bad('the right sides of "pairs" must be distinct');
        break;
      case 'bucket': if (!strs(e.buckets, 2) || !Array.isArray(e.items) || e.items.length < 3 || !e.items.every(i => isStr(i?.text) && intIn(i.bucket, e.buckets.length))) bad('"buckets" (≥ 2) and "items" [{text, bucket: index}] (≥ 3) needed'); break;
      case 'cloze': if (!isStr(e.text) || !/\[\[[^\]]+\]\]/.test(e.text)) bad('"text" needs at least one [[blank|alternative]]'); break;
      case 'spotbug': if (!strs(e.lines, 2) || !Array.isArray(e.bugs) || !e.bugs.length || !e.bugs.every(b => intIn(b, e.lines.length))) bad('"lines" and "bugs" (line indexes) needed'); break;
      case 'calc': if (typeof e.answer !== 'number' || !isFinite(e.answer)) bad('"answer" must be a number'); break;
      case 'scenario': if (!Array.isArray(e.steps) || !e.steps.length || !e.steps.every(s => isStr(s.prompt) && Array.isArray(s.options) && s.options.length >= 2 && s.options.filter(o => o.ok === true).length === 1 && s.options.every(o => isStr(o.text) && isStr(o.fb)))) bad('"steps": each with a prompt and options [{text, ok, fb}], exactly one ok'); break;
      case 'free': if (!isStr(e.model)) bad('"model" (model answer) needed'); break;
      case 'write': if (!isStr(e.solution) || !strs(e.keywords, 1)) bad('"solution" and "keywords" needed'); break;
      default:
        if (String(t).startsWith('img_')) {
          const m = media[e.media]; if (!m) { bad(`media "${e.media}" not in pack.media`); break; }
          const regs = Array.isArray(e.regions) ? e.regions : (m.regions || []); const R = new Map(regs.map(r => [r.id, r]));
          if (!R.size && t !== 'img_reveal') bad('the picture has no regions');
          const targets = e.targets || [...R.keys()];
          if ((t === 'img_hotspot' || t === 'img_sequence') && (!Array.isArray(e.answer) || !e.answer.length)) bad('"answer" must list region ids');
          if (['img_drag', 'img_label', 'img_select', 'img_occlusion'].includes(t)) for (const id of targets) if (R.has(id) && !isStr(R.get(id).label)) bad(`region "${id}" needs a label`);
          if (t === 'img_reveal') { if (!strs(e.options, 2)) bad('"options" needed'); else { const ans = Array.isArray(e.answer) ? e.answer : [e.answer]; if (!ans.every(a => intIn(a, e.options.length))) bad('"answer" must be an option index'); } }
          for (const r of regs) {
            const inside = r.shape === 'circle' ? r.cx >= 0 && r.cy >= 0 && r.cx <= m.w && r.cy <= m.h : r.shape === 'poly' ? Array.isArray(r.points) && r.points.length >= 3 : r.x >= 0 && r.y >= 0 && r.x + r.w <= m.w + 1 && r.y + r.h <= m.h + 1;
            if (!inside) { bad(`region "${r.id}" lies outside the picture`); break; }
          }
        }
    }
    return E;
  }

  /* ---- a pack in several languages (pack schema v2, tools/CONTENT_SPEC.md "Packs in several languages"): optional, additive ---- */
  const LOCALE_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;
  const I18N_TEXT = ['title', 'appTitle', 'description', 'searchExamples'], I18N_OBJ = ['hero', 'tutor'];
  /** What a translated exercise must keep (only the words may change): the type, section, picture and everything that decides the answer. */
  const shape = e => JSON.stringify([e.type, e.section, e.media || null, e.answer ?? null, e.targets || null, e.bugs || null, e.grid || null,
    ...['options', 'items', 'pairs', 'buckets', 'lines', 'steps'].map(k => Array.isArray(e[k]) ? e[k].length : null),
    e.type === 'bucket' ? (e.items || []).map(x => x && x.bucket) : null, e.type === 'scenario' ? (e.steps || []).map(st => (st.options || []).map(o => !!o.ok)) : null]);
  function checkI18n(p, chapters, E, W) {
    const s = p.subject || {}, own = s.language || 'en';
    const locOK = (where, loc) => { if (!LOCALE_RE.test(loc)) { E.push(`${where}: "${loc}" is not a locale code (e.g. el, fr, pt-PT, zh-Hant)`); return false; } if (loc === own) { E.push(`${where}: "${loc}" is the pack's own language`); return false; } return true; };
    if (s.i18n != null) {
      if (typeof s.i18n !== 'object' || Array.isArray(s.i18n)) E.push('subject.i18n must be an object {locale: {title, description, …}}');
      else for (const [loc, m] of Object.entries(s.i18n)) {
        const where = `subject.i18n.${loc}`; if (!locOK(where, loc)) continue;
        if (!m || typeof m !== 'object') { E.push(`${where} must be an object`); continue; }
        for (const [k, v] of Object.entries(m)) {
          if (I18N_TEXT.includes(k)) { if (!isStr(v)) E.push(`${where}.${k} must be a non-empty string`); }
          else if (I18N_OBJ.includes(k)) { if (!v || typeof v !== 'object' || Object.values(v).some(x => typeof x !== 'string')) E.push(`${where}.${k} must be an object of strings like subject.${k}`); }
          else E.push(`${where}.${k}: unknown field (allowed: ${[...I18N_TEXT, ...I18N_OBJ].join(', ')})`);
        }
      }
    }
    if (p.translations == null) return;
    if (typeof p.translations !== 'object' || Array.isArray(p.translations)) { E.push('translations must be an object {locale: {chapters: [...]}}'); return; }
    const byId = new Map(chapters.map(c => [c.id, c]));
    for (const [loc, t] of Object.entries(p.translations)) {
      const where = `translations.${loc}`; if (!locOK(where, loc)) continue;
      if (!t || !Array.isArray(t.chapters)) { E.push(`${where}.chapters must be a list of chapters`); continue; }
      if (!(s.i18n && s.i18n[loc])) W.push(`${where}: add subject.i18n.${loc} (title, description) so the picker shows the translated name`);
      for (const c of t.chapters) {
        const src = byId.get(c && c.id); if (!src) { E.push(`${where}: chapter "${c && c.id}" is not a chapter of the pack`); continue; }
        const ids = (x, k) => (x[k] || []).map(y => y && y.id);
        if (ids(c, 'sections').join() !== ids(src, 'sections').join()) E.push(`${where}/${c.id}: sections must be the source's (${ids(src, 'sections').join(', ')}), same order`);
        for (const k of ['exercises', 'flashcards', 'debug']) {
          const a = new Set(ids(src, k)), b = new Set(ids(c, k)), miss = [...a].filter(x => !b.has(x)), extra = [...b].filter(x => !a.has(x));
          if (miss.length) E.push(`${where}/${c.id}: ${k} missing: ${miss.slice(0, 8).join(', ')}`);
          if (extra.length) E.push(`${where}/${c.id}: ${k} not in the source: ${extra.slice(0, 8).join(', ')}`);
        }
        const se = new Map((src.exercises || []).map(e => [e.id, e]));
        for (const e of c.exercises || []) if (se.has(e.id) && shape(e) !== shape(se.get(e.id))) E.push(`${where}/${e.id}: type, section, picture or answer differs from the source (only the words may change)`);
      }
    }
  }

  /** balance: the minimum of RULES per chapter. Default: the pack's own subject.authoring.minPerKind (make_pack.py writes 3);
      a pack that does not say gets the issues as warnings; 0 = off. A number → errors. */
  function checkPack(p, expectId, { strict = false, balance } = {}) {
    const E = [], W = [];
    if (!p || p.format !== 'noema-pack') E.push('format must be "noema-pack"');
    const s = p?.subject || {};
    if (!ID_RE.test(s.id || '')) E.push('subject.id must be lowercase letters/digits/hyphens');
    if (expectId && s.id !== expectId) E.push(`subject.id is "${s.id}" but you uploaded it as "${expectId}"`);
    if (!s.title) E.push('subject.title missing');
    const media = p?.media || {};
    for (const [mid, m] of Object.entries(media)) {
      if (m.fetch === 'app' && !m.data) { if (!/^https?:\/\//.test(m.url || '')) E.push(`media ${mid}: a "fetch": "app" picture needs its image url`); }
      else if (!/^data:image\//.test(m.data || '')) E.push(`media ${mid}: data must be a data:image/… URI`);
      if (!(m.w > 0 && m.h > 0)) E.push(`media ${mid}: w/h missing`);
      if (!m.alt) W.push(`media ${mid}: no alt text`);
      if (m.origin === 'web' && !m.url) E.push(`media ${mid}: web picture needs its source url`);
    }
    const srcIds = new Set();
    for (const x of (p?.sources?.sources || [])) {   // sources whose original file travels in the package (make_pack.py)
      if (!x || !x.id) { E.push('a source without id'); continue; }
      if (srcIds.has(x.id)) E.push(`duplicate source ${x.id}`); srcIds.add(x.id);
      if (x.sha256 != null) {
        if (!/^sources\/[^/].*/.test(String(x.file || '')) || String(x.file).split('/').includes('..')) E.push(`source ${x.id}: a packaged file must be "sources/<name>"`);
        if (!/^[0-9a-f]{64}$/.test(String(x.sha256))) E.push(`source ${x.id}: sha256 is not a SHA-256 hex digest`);
        if (!(x.size > 0)) E.push(`source ${x.id}: size must be a positive number of bytes`);
      }
      if (x.firstPage != null && !Number.isInteger(x.firstPage)) E.push(`source ${x.id}: firstPage must be a whole number`);
    }
    const chapters = Array.isArray(p?.chapters) ? p.chapters : [];
    if (!chapters.length) E.push('no chapters');
    for (const c of chapters) for (const r of (Array.isArray(c.sources) ? c.sources : [])) if (r && r.id && srcIds.size && !srcIds.has(r.id)) W.push(`${c.id}: cites unknown source "${r.id}"`);
    const exIds = new Set(), secIds = new Set(); let ex = 0, vis = 0, secN = 0;
    const used = {};
    for (const c of chapters) {
      if (!/^ch\d\d$/.test(c.id || '')) E.push(`chapter id "${c.id}" must be chNN`);
      if (strict && !isStr(c.title)) E.push(`${c.id}: title missing`);
      const mySecs = new Set();
      for (const sec of c.sections || []) {
        secN++; if (secIds.has(sec.id)) E.push(`duplicate section ${sec.id}`); secIds.add(sec.id); mySecs.add(sec.id);
        if (strict && (!isStr(sec.title) || !Array.isArray(sec.blocks) || !sec.blocks.length)) E.push(`${sec.id}: needs a title and blocks`);
        for (const b of sec.blocks || []) {
          if (b.t === 'figure' && !media[b.media]) E.push(`${sec.id}: figure media "${b.media}" not in pack.media`);
          if (strict && !BLOCKS.has(b.t)) E.push(`${sec.id}: unknown block type "${b.t}"`);
        }
      }
      if (strict && !(c.sections || []).length) E.push(`${c.id}: no sections`);
      for (const e of c.exercises || []) {
        ex++;
        if (exIds.has(e.id)) E.push(`duplicate exercise ${e.id}`); exIds.add(e.id);
        if (!TYPES.has(e.type)) { E.push(`${e.id}: unknown type ${e.type}`); continue; }
        if (!secIds.has(e.section) || (strict && !mySecs.has(e.section))) E.push(`${e.id}: section ${e.section} not found in its chapter`);
        if (String(e.type).startsWith('img_')) {
          vis++; used[e.media] = (used[e.media] || 0) + 1;
          const m = media[e.media]; if (!m) { E.push(`${e.id}: media "${e.media}" not in pack.media`); continue; }
          const regs = Array.isArray(e.regions) ? e.regions : (m.regions || []); const R = new Set(regs.map(r => r.id));
          for (const a of [].concat(e.type === 'img_hotspot' || e.type === 'img_sequence' ? e.answer || [] : [], e.targets || [])) if (!R.has(a)) E.push(`${e.id}: region "${a}" not found`);
        }
        if (strict) E.push(...checkExercise(e, media));
      }
      if (strict) for (const f of c.flashcards || []) if (!isStr(f.q) || !isStr(f.a)) { E.push(`${c.id}: a flashcard needs "q" and "a"`); break; }
          }
    const per = balance ?? s.authoring?.minPerKind;
    if (per !== 0) for (const c of chapters) for (const i of checkBalance(c, s, { min: per ?? undefined })) (per ? E : W).push(i.msg);
    checkI18n(p, chapters, E, W);
    for (const mid of Object.keys(media)) if ((used[mid] || 0) < 3) W.push(`picture ${mid} has ${used[mid] || 0} exercises (aim for >= 3)`);
    return { errors: E, warnings: W, counts: { chapters: chapters.length, sections: secN, exercises: ex, visual: vis, media: Object.keys(media).length } };
  }

  /* ---------- language bridges (docs/BRIDGE.md): a sidecar dictionary for one pack and one native language ---------- */
  const POS = new Set(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV', 'NUM', 'X', 'SYM', 'INTJ', 'PHRASE']);
  const FUNCTION_POS = new Set(['DET', 'ADP', 'CCONJ', 'SCONJ', 'PRON', 'AUX', 'PART']);
  const LOC_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
  const MARKUP = /<\s*[a-z!\/]|javascript:|data:text\/html/i;   // translations are plain text: never markup or script
  const BRIDGE_MAX = 3 * 1024 * 1024;
  /** checkBridge(b, pack?) → { errors, warnings, counts }. With the pack: the bridge belongs to it and its sections exist. */
  function checkBridge(b, pack) {
    const E = [], W = [];
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { errors: ['not a JSON object'], warnings: W, counts: {} };
    let size = 0; try { size = JSON.stringify(b).length; } catch (e) { E.push('not serialisable'); }
    if (size > BRIDGE_MAX) E.push(`too big (${Math.round(size / 1024)} KB, at most ${BRIDGE_MAX / 1024} KB)`);
    if (b.format !== 'noema-bridge') E.push('format must be "noema-bridge"');
    if (b.v !== 1) E.push('v must be 1');
    if (!ID_RE.test(String(b.pack || ''))) E.push('pack: the subject id the bridge belongs to (pack.subject.id)');
    if (!LOC_RE.test(String(b.source || ''))) E.push('source: the language of the pack\'s content (BCP 47, e.g. "el")');
    if (!LOC_RE.test(String(b.native || ''))) E.push('native: the learner\'s language the words are translated into (BCP 47, e.g. "ru")');
    if (b.source && b.native && String(b.source).split('-')[0] === String(b.native).split('-')[0]) E.push('native must differ from source');
    if (!['draft', 'reviewed'].includes(b.status)) E.push('status must be "draft" or "reviewed"');
    const plainOk = (v, max, where) => { if (v == null) return; if (typeof v !== 'string') return E.push(`${where}: must be text`); if (v.length > max) E.push(`${where}: longer than ${max} characters`); if (MARKUP.test(v)) E.push(`${where}: plain text only (no HTML or links)`); };
    const entries = Array.isArray(b.entries) ? b.entries : (E.push('entries must be a list'), []);
    if (entries.length > 20000) E.push(`entries: ${entries.length} (at most 20000)`);
    const keys = new Map(); let senses = 0, stale = 0;
    entries.forEach((e, n) => {
      const at = `entries[${n}]${e && isStr(e.k) ? ' "' + e.k + '"' : ''}`;
      if (!e || typeof e !== 'object') return E.push(`${at}: not an object`);
      if (!isStr(e.k) || e.k.length > 80) return E.push(`${at}: k (the word or phrase as the pack writes it) is required, at most 80 characters`);
      if (keys.has(e.k)) E.push(`${at}: k appears twice`);
      if (e.forms != null && (!Array.isArray(e.forms) || e.forms.length > 40 || !e.forms.every(f => isStr(f) && f.length <= 80))) E.push(`${at}: forms must be a list of at most 40 texts`);
      if (e.pos != null && FUNCTION_POS.has(e.pos)) E.push(`${at}: ${e.pos} — function words (articles, prepositions, conjunctions, pronouns, auxiliaries, particles) are not part of a bridge`);
      else if (e.pos != null && !POS.has(e.pos)) W.push(`${at}: unknown pos "${e.pos}" (Universal Dependencies: NOUN, PROPN, VERB, ADJ, ADV, NUM, X, SYM, INTJ, or PHRASE)`);
      if (e.band != null && ![1, 2, 3].includes(e.band)) E.push(`${at}: band must be 1 (everyday), 2 (academic) or 3 (rare or technical)`);
      const ss = Array.isArray(e.senses) ? e.senses : [];
      if (!ss.length) E.push(`${at}: at least one sense (the meaning in this pack)`);
      const ids = new Set();
      ss.forEach((x, q) => {
        const w = `${at} sense ${q + 1}`;
        if (!x || typeof x !== 'object') return E.push(`${w}: not an object`);
        if (!isStr(String(x.id ?? ''))) E.push(`${w}: id is required`); else if (ids.has(String(x.id))) E.push(`${w}: id "${x.id}" twice`); else ids.add(String(x.id));
        if (!isStr(x.t)) E.push(`${w}: t (the translation) is required`);
        plainOk(x.t, 200, w + ' t'); plainOk(x.note, 400, w + ' note'); plainOk(x.gloss, 300, w + ' gloss');
        if (x.st != null && !['draft', 'reviewed', 'stale'].includes(x.st)) E.push(`${w}: st must be draft, reviewed or stale`);
        if (x.st === 'stale') stale++; senses++;
      });
      keys.set(e.k, ids);
    });
    const secIds = pack ? new Set((pack.chapters || []).flatMap(c => (c.sections || []).map(s => s.id))) : null;
    const secs = b.sections == null ? {} : (typeof b.sections === 'object' && !Array.isArray(b.sections) ? b.sections : (E.push('sections must be an object { sectionId: { terms, preview } }'), {}));
    let previews = 0;
    for (const [sid, v] of Object.entries(secs)) {
      if (secIds && !secIds.has(sid)) W.push(`sections.${sid}: no such section in the pack`);
      if (!v || typeof v !== 'object') { E.push(`sections.${sid}: not an object`); continue; }
      if (v.terms != null && (!Array.isArray(v.terms) || v.terms.length > 30)) E.push(`sections.${sid}.terms: a list of at most 30 entry keys`);
      for (const k of v.terms || []) if (!keys.has(k)) E.push(`sections.${sid}.terms: "${k}" is not an entry`);
      plainOk(v.preview, 1500, `sections.${sid}.preview`); if (isStr(v.preview)) previews++;
    }
    const anchors = b.anchors == null ? [] : (Array.isArray(b.anchors) ? b.anchors : (E.push('anchors must be a list'), []));
    anchors.forEach((a, n) => {
      const at = `anchors[${n}]`;
      if (!a || typeof a !== 'object') return E.push(`${at}: not an object`);
      if (!/^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9_-]+$/.test(String(a.at || ''))) E.push(`${at}: at must be "<section id>/<block id>" (the search address, docs/SEARCH.md)`);
      else if (secIds && !secIds.has(a.at.split('/')[0])) W.push(`${at}: section ${a.at.split('/')[0]} is not in the pack`);
      if (!isStr(a.quote)) E.push(`${at}: quote (the words exactly as the text writes them) is required`);
      if (!keys.has(a.k)) E.push(`${at}: k "${a.k}" is not an entry`);
      else if (!keys.get(a.k).has(String(a.sense))) E.push(`${at}: entry "${a.k}" has no sense "${a.sense}"`);
    });
    if (pack) {
      if (pack.subject?.id && b.pack && pack.subject.id !== b.pack) E.push(`pack: "${b.pack}" — this bridge belongs to another subject (this one is "${pack.subject.id}")`);
      const own = pack.subject?.language || 'en';
      if (b.source && String(own).split('-')[0] !== String(b.source).split('-')[0]) E.push(`source: "${b.source}" — the pack is written in "${own}"`);
    }
    if (!entries.length) W.push('no entries yet');
    return { errors: E, warnings: W, counts: { entries: entries.length, senses, stale, sections: Object.keys(secs).length, previews, anchors: anchors.length } };
  }
  /* i18n-ignore-end */
  root.NoemaPackCheck = { checkPack, checkExercise, checkBalance, checkBridge, RULES, TYPES, BLOCKS, ID_RE };
})(typeof window !== 'undefined' ? window : globalThis);
