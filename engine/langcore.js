/* noema-lite · langcore — the runtime of the language courses (docs/LANGUAGES.md §5, §7).
   Pure JavaScript: no DOM, no storage, no network. The same file runs in the app, in Node (tests) and in the connector.
   The Python twin of the shared helpers is tools/langlib.py; both are checked against tests/fixtures/lang-vectors.json.

   Overview
     NoemaLang.readCourse(read, list)   → course data from a folder (read(rel) → JSON, list(relDir) → [file names])
     NoemaLang.course(data)             → C, the indexed course (concepts, nodes, lexemes, sentences, form index per language)
     NoemaLang.newLearner(C, settings)  → L, the learner state (plain JSON; stored per node by toKV / fromKV)
     review(C, L, lang, lexId, track, grade, day)     one answer → the spaced-repetition state of one track
     itemState / nodeState / nodeStates / known / functionState / feasibility / selectSentences / tokenize / analyze / planSession
*/
(function (root) {
  'use strict';
  const nfc = s => String(s == null ? '' : s).normalize('NFC');

  /* ---------- feature cells ---------- */
  const cellParts = c => String(c || '').split(';').filter(Boolean);
  const canon = c => { const p = cellParts(c); return p.length ? [p[0], ...p.slice(1).sort()].join(';') : ''; };
  const cellHas = (c, tags) => { const p = cellParts(c); return tags.every(t => p.includes(t)); };

  /* ---------- vowel marks ---------- */
  const inRange = (o, a, b) => o >= a && o <= b;
  const AR_MARK = o => inRange(o, 0x064B, 0x0652) || o === 0x0670;
  const HE_MARK = o => inRange(o, 0x0591, 0x05BD) || o === 0x05BF || o === 0x05C1 || o === 0x05C2 || o === 0x05C4 || o === 0x05C5 || o === 0x05C7;
  const markTest = lang => lang === 'ar' ? AR_MARK : lang === 'he' ? HE_MARK : () => false;
  function stripMarks(lang, s) {
    const t = markTest(lang); let out = '';
    for (const ch of nfc(s)) if (!t(ch.codePointAt(0))) out += ch;
    return lang === 'ar' ? out.replace(/\u0671/g, '\u0627') : out;
  }
  const hasMarks = (lang, s) => { const t = markTest(lang); for (const ch of String(s)) if (t(ch.codePointAt(0))) return true; return false; };

  /* ---------- Chinese ---------- */
  const isHan = ch => { const o = ch.codePointAt(0); return inRange(o, 0x4E00, 0x9FFF) || inRange(o, 0x3400, 0x4DBF) || inRange(o, 0x20000, 0x2EBEF) || inRange(o, 0xF900, 0xFAFF); };
  const TONE = { 'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4], 'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4], 'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4], 'ǖ': ['ü', 1], 'ǘ': ['ü', 2], 'ǚ': ['ü', 3], 'ǜ': ['ü', 4] };
  const MARK_OF = {}; for (const [m, [v, t]] of Object.entries(TONE)) MARK_OF[v + t] = m;
  const FINALS = ['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er', 'i', 'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing',
    'iong', 'u', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ueng', 'ü', 'üe', 'üan', 'ün', 'ue'];
  const SYL = new RegExp('^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(' + [...FINALS].sort((a, b) => b.length - a.length).join('|') + ')$');
  const pinyinSplit = s => nfc(s).trim().toLowerCase().split(/[\s']+/).filter(Boolean);
  function pinyinTone(syl) {
    let base = '', tone = 5;
    for (const ch of nfc(syl).toLowerCase()) {
      if (TONE[ch]) { if (tone !== 5) return 'two tone marks'; base += TONE[ch][0]; tone = TONE[ch][1]; }
      else base += ch === 'v' ? 'ü' : ch;
    }
    return [base, tone];
  }
  function markPosition(base) {
    for (const v of 'ae') if (base.includes(v)) return base.indexOf(v);
    if (base.includes('ou')) return base.indexOf('o');
    for (let i = base.length - 1; i >= 0; i--) if ('iouü'.includes(base[i])) return i;
    return -1;
  }
  function pinyinSyllableErrors(syl) {
    const r = pinyinTone(syl);
    if (typeof r === 'string') return [`“${syl}”: ${r}`];
    const [base, tone] = r, m = base.match(SYL);
    if (!m) return [`“${syl}” is not a pinyin syllable`];
    const ini = m[1] || '', fin = m[2], err = [];
    if (['j', 'q', 'x'].includes(ini) && !(fin[0] === 'i' || fin[0] === 'u')) err.push(`“${syl}”: j/q/x go only with i or u (= ü)`);
    if (['j', 'q', 'x', 'y'].includes(ini) && fin[0] === 'ü') err.push(`“${syl}”: after ${ini} write u, not ü`);
    if (['g', 'k', 'h', 'f', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(ini) && ((fin[0] === 'i' && fin !== 'i') || fin[0] === 'ü')) err.push(`“${syl}”: impossible after ${ini}`);
    if (['g', 'k', 'h', 'f'].includes(ini) && fin === 'i') err.push(`“${syl}”: impossible after ${ini}`);
    if (fin === 'er' && ini) err.push(`“${syl}”: er takes no initial`);
    if (!ini && !['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'er'].includes(fin)) err.push(`“${syl}”: write it with y- or w-`);
    if (tone !== 5) {
      const want = markPosition(base), got = [...nfc(syl).toLowerCase()].findIndex(ch => TONE[ch]);
      if (want !== got) err.push(`“${syl}”: the tone mark belongs on “${base[want]}”`);
    }
    return err;
  }
  function pinyinNumbersToMarks(s) {
    return pinyinSplit(s).map(syl => {
      const m = syl.match(/^([a-zü:v]+)([0-5])?$/);
      if (!m) return syl;
      const base = m[1].replace(/u:/g, 'ü').replace(/v/g, 'ü'), t = +(m[2] || 5);
      if (t === 0 || t === 5) return base;
      const i = markPosition(base);
      return i >= 0 ? base.slice(0, i) + MARK_OF[base[i] + t] + base.slice(i + 1) : base;
    }).join(' ');
  }
  const pinyinMarksToNumbers = s => pinyinSplit(s).map(syl => { const r = pinyinTone(syl); return typeof r === 'string' ? syl : r[0] + r[1]; }).join(' ');

  /* ---------- sentences ---------- */
  function joinTokens(tokens, how) {
    let out = '', glueNext = true;
    for (const k of tokens) {
      if (how === 'none' || !out || glueNext || k.p === true) out += k.t; else out += ' ' + k.t;
      glueNext = k.p === 'open';
    }
    return out;
  }
  const capFirst = s => s.slice(0, 1).toUpperCase() + s.slice(1);
  const decapFirst = s => s.slice(0, 1).toLowerCase() + s.slice(1);

  /* ---------- reading a course folder ---------- */
  /** read(rel) → parsed JSON or null; list(relDir) → file names. Layout: docs/LANGUAGES.md §4.1. */
  function readCourse(read, list) {
    const course = read('course.json');
    const data = { course, typology: read('core/typology.json') || null, fields: list('core/fields').map(f => read('core/fields/' + f)), nodes: read('core/nodes.json').nodes,
      functions: list('core/functions').map(f => read('core/functions/' + f)), frames: (read('core/frames.json') || {}).frames || [], langs: {} };
    for (const code of course.languages) {
      const base = `lang/${code}/`, lexicon = {}, grammar = {};
      for (const n of data.nodes) { const f = read(`${base}lexicon/${n.id}.json`); if (f) lexicon[n.id] = f; }   // a node without its file is not prepared yet
      for (const f of data.functions) { const g = read(`${base}grammar/${f.id}.json`); if (g) grammar[f.id] = g; }
      const bank = []; for (const f of list(`${base}bank`)) bank.push(...((read(`${base}bank/${f}`) || {}).sentences || []));
      data.langs[code] = { language: read(base + 'language.json'), lexicon, grammar, bank, script: read(base + 'script.json'), chars: read(base + 'chars.json') };   // script modules (§4.9): ar/he letters, zh characters
    }
    const mj = read('core/media/media.json'); if (mj) { data.media = {}; for (const m of mj.items || []) data.media[m.id] = { file: m.file, alt: m.alt, credit: m.credit, license: m.license, url: m.url }; data.mediaBase = 'core/media/'; }
    // D16: the shared typological vocabulary, the profiles of the world's languages, the catalogues of the course languages
    const tf = read('../_typology/features.json'), tl = read('../_typology/languages.json');
    if (tf && tl) data.world = { features: tf.features, languages: tl.languages,
      phenomena: Object.fromEntries(course.languages.map(c => [c, ((read(`../_phenomena/${c}.json`) || {}).phenomena || []).map(trimPhenomenon)])) };
    return data;
  }

  /** What the app needs of a phenomenon (the catalogue keeps more: model, gaps …). */
  const trimPhenomenon = p => ({ id: p.id, title: p.title, area: p.area, kind: p.kind || 'has', typology: p.typology || [], what: p.what, examples: (p.examples || []).slice(0, 2), when: p.when || '', notes: p.notes || [], ...(p.specific ? { specific: true, alsoIn: p.alsoIn || [], alsoNote: p.alsoNote || '' } : {}) });
  /** D16 — what is new and what is familiar in a language for a learner who knows `knows` (language codes), computed from the
   *  shared typological profiles, never written from one point of view. → {knownProfiles, unknownLangs, new: [{p, notes}], familiar: [{p, from}]} */
  const UNKNOWN_SHARE = 0.3;   // D19
  /** The learner's languages (D18): settings.knows = [{code | name, level, type?, family?}] → the ones that decide what is familiar
   *  (native, C2) as profiles; a language without a profile gets the prototype of its family, else of its type. */
  function learnerProfiles(C, knows) {
    const W = C.data.world; if (!W) return [];
    const prof = Object.fromEntries(W.languages.map(l => [l.code, l]));
    const out = [];
    for (const k of (knows || []).map(x => typeof x === 'string' ? { code: x, level: 'native' } : x)) {
      if (!['native', 'C2'].includes(k.level || 'native')) continue;
      if (k.code && prof[k.code]) { out.push({ ...prof[k.code], level: k.level || 'native' }); continue; }
      const p = prototype(C, k.family ? { family: k.family } : null) || prototype(C, k.type ? { typology: k.type } : null);
      if (p) out.push({ code: k.code || k.name, name: k.name || k.code, typology: k.type || p.typology, family: k.family || p.family, values: p.values, inferred: k.family && prototype(C, { family: k.family }) ? 'family' : 'type', level: k.level || 'native' });
    }
    return out;
  }
  /** The prototype of a family or a type: the majority value of every feature among its profiled languages. */
  function prototype(C, by) {
    const W = C.data.world; if (!W || !by) return null;
    const [k, val] = Object.entries(by)[0], ls = W.languages.filter(l => l[k] === val);
    if (!ls.length) return null;
    const values = {};
    for (const f of W.features) {
      const n = {}; for (const l of ls) { const v = l.values[f.id]; if (v && v !== 'unknown') n[v] = (n[v] || 0) + 1; }
      const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; values[f.id] = best ? best[0] : 'unknown';
    }
    return { typology: k === 'typology' ? val : ls[0].typology, family: k === 'family' ? val : null, values };
  }
  /** Is a set of typological tags familiar to the learner? → the languages (names) that have every value, or [] */
  function familiarFrom(C, tags, knows) {
    const ps = learnerProfiles(C, knows); if (!tags?.length || !ps.length) return [];
    const from = ps.filter(p => tags.every(t => p.values[t.feature] === t.value));
    return from.map(p => p.name || p.code);
  }
  /** The comparison notes a learner sees (D18): those for one of their languages, its family or its type (any level). */
  function notesFor(C, notes, knows) {
    const W = C.data.world, prof = W ? Object.fromEntries(W.languages.map(l => [l.code, l])) : {};
    const ks = (knows || []).map(x => typeof x === 'string' ? { code: x } : x);
    const keys = new Set(ks.flatMap(k => [k.code, k.type && 'type:' + k.type, k.family && 'family:' + k.family, prof[k.code] && 'type:' + prof[k.code].typology, prof[k.code] && 'family:' + prof[k.code].family].filter(Boolean)));
    return (notes || []).filter(n => keys.has(n.for));
  }
  function forLearner(C, code, knows) {
    const W = C.data.world; if (!W) return null;
    const feat = Object.fromEntries(W.features.map(f => [f.id, f]));
    const ps = learnerProfiles(C, knows).filter(p => p.code !== code), prof = Object.fromEntries(ps.map(p => [p.code, p]));
    const mine = ps.map(p => p.code), unknownLangs = (knows || []).map(x => typeof x === 'string' ? x : x.code || x.name).filter(k => k && !prof[k] && !(W.languages.find(l => l.code === k)));
    const out = { knownProfiles: mine, unknownLangs, new: [], familiar: [] };
    for (const p of (W.phenomena[code] || [])) {
      const tags = (p.typology || []).filter(t => feat[t.feature]);
      if (!tags.length) continue;
      if (p.specific) {   // the tags only approximate it: familiar only to speakers of the languages that really have it
        const from = mine.filter(k => (p.alsoIn || []).includes(k));
        if (from.length) out.familiar.push({ p, from }); else out.new.push({ p, notes: p.alsoNote ? [{ feature: '', title: 'Specific to this language', value: '', note: p.alsoNote }] : [] });
        continue;
      }
      const from = new Set(), notes = []; let familiar = true;
      for (const t of tags) {
        const has = mine.filter(k => prof[k].values[t.feature] === t.value);
        if (has.length) has.forEach(k => from.add(k));
        else { familiar = false; const f = feat[t.feature]; notes.push({ feature: f.id, title: f.title, value: (f.values.find(v => v.id === t.value) || {}).title || t.value, note: f.learnerNote || '' }); }
      }
      if (familiar && mine.length) out.familiar.push({ p, from: [...from] }); else out.new.push({ p, notes });
    }
    return out;
  }

  /* ---------- paths by language type (D10): which nodes apply to which language ---------- */
  const TYPES = ['isolating', 'agglutinating', 'fusional', 'polysynthetic'];
  const applies = (n, code, typ) => (!n.path || n.path === typ) && (!n.langs || n.langs.includes(code));
  /** The grammar a lesson teaches in one language: its list, or "*" + the type's + the language's (§4.4.1). */
  function lessonFunctions(C, code, nid) {
    const f = C.nodes[nid]?.functions || [];
    if (Array.isArray(f)) return f.slice();
    const out = []; for (const k of ['*', C.lang[code]?.typology, code]) for (const x of f[k] || []) if (!out.includes(x)) out.push(x);
    return out;
  }
  /** The languages grouped by the path of their type, in course order: [{path, langs}] (D10: a polyglot course moves group by group). */
  function pathGroups(C, langs) {
    const out = [];
    for (const c of (langs || C.languages)) {
      const t = C.lang[c]?.typology || null, g = out.find(x => x.path === t);
      if (g) g.langs.push(c); else out.push({ path: t, langs: [c] });
    }
    return out;
  }

  /** The stated parameters of a word (features, D14) as plain fields; a parameter stated as {none: why} is left out. */
  function facade(x) {
    const out = {};
    for (const [k, v] of Object.entries(x.features || {})) if (!(v && typeof v === 'object' && !Array.isArray(v) && 'none' in v)) out[k] = v;
    return out;
  }

  /* ---------- the indexed course ---------- */
  function course(data) {
    const C = { data, id: data.course.id, explainLang: data.course.explainLang || 'en', languages: data.course.languages.slice(),
      concepts: {}, nodes: {}, order: [], owner: {}, functions: {}, frames: {}, lang: {}, typology: data.typology || null };
    for (const f of data.fields) for (const c of f.concepts) C.concepts[c.id] = { ...c, field: f.field };
    for (const n of data.nodes) { C.nodes[n.id] = n; for (const c of n.concepts) C.owner[c] = n.id; }
    // topological order (prerequisites first, stable by file order)
    const seen = {}; const visit = id => { if (seen[id]) return; seen[id] = 1; for (const p of C.nodes[id].prereqs || []) if (C.nodes[p]) visit(p); C.order.push(id); };
    data.nodes.forEach(n => visit(n.id));
    for (const f of data.functions) C.functions[f.id] = f;
    for (const f of data.frames) C.frames[f.id] = f;
    for (const code of C.languages) {
      const src = data.langs[code], X = { code, language: src.language || {}, typology: (src.language || {}).typology || null, lex: {}, byNode: {}, byConcept: {}, absent: {}, grammar: src.grammar || {}, prepared: {},
        applies: {}, owner: {}, sentences: [], sentenceById: {}, forms: new Map(), prefixes: [], maxWord: 1, maxWords: 1 };
      for (const nid of Object.keys(C.nodes)) {
        const n = C.nodes[nid];
        X.applies[nid] = applies(n, code, X.typology);
        if (X.applies[nid]) for (const c of n.concepts) if (!X.owner[c]) X.owner[c] = nid;
        X.prepared[nid] = X.applies[nid] && (!!src.lexicon[nid] || !n.concepts.length) && !(data.course.draft || []).includes(nid);   // a node still being written is not offered yet
        const file = src.lexicon[nid] || { lexemes: [], absent: [] };
        X.byNode[nid] = [];
        for (const x of file.lexemes || []) {
          const lx = { ...facade(x), ...x, node: nid }; X.lex[x.id] = lx; X.byNode[nid].push(x.id);   // the word's facade (features, D14) readable as fields: lx.root, lx.measure …
          for (const s of x.senses || []) (X.byConcept[s] = X.byConcept[s] || []).push(x.id);
        }
        for (const a of file.absent || []) X.absent[a.concept] = a;
      }
      // form index: every form (and the lemma of invariant words) → [{l, f}]; unvocalized spellings too (ar, he)
      const add = (form, l, f) => {
        for (const k of new Set([nfc(form), stripMarks(code, form)])) {
          if (!k) continue;
          const arr = X.forms.get(k) || []; if (!arr.some(m => m.l === l && m.f === f)) arr.push({ l, f }); X.forms.set(k, arr);
          X.maxWord = Math.max(X.maxWord, [...k].length); X.maxWords = Math.max(X.maxWords, k.split(' ').length);
        }
      };
      for (const lx of Object.values(X.lex)) {
        const forms = lx.forms || {};
        if (Object.keys(forms).length) for (const [c, f] of Object.entries(forms)) add(f, lx.id, c); else { add(lx.lemma, lx.id, null); for (const a of lx.alts || []) add(a, lx.id, null); }
        for (const [c, f] of Object.entries(lx.plene || {})) add(f, lx.id, c);   // he: the full unvocalized spelling (ktiv male)
        if (lx.prefix) for (const p of [lx.lemma, ...(lx.alts || [])]) X.prefixes.push({ t: nfc(p), plain: stripMarks(code, p), l: lx.id });   // וְ and its spellings וּ, וַ …
      }
      X.prefixes.sort((a, b) => b.t.length - a.t.length);
      for (const s of src.bank || []) {
        const req = new Set();
        const walk = ks => ks.forEach(k => { if (k.parts) walk(k.parts); else if (!k.p && k.l) req.add(k.l); });
        walk(s.tokens || []);
        if ([...req].some(l => !X.lex[l])) continue;   // a sentence with a word that is not in the course (yet) is never offered
        const nwords = (s.tokens || []).filter(k => !k.p).length;   // words of the sentence (a prefixed word is one word; names count)
        const S = { ...s, req: [...req], nwords, cap: Math.ceil(UNKNOWN_SHARE * nwords) }; X.sentences.push(S); X.sentenceById[s.id] = S;
      }
      C.lang[code] = X;
    }
    return C;
  }

  /* ---------- the learner ---------- */
  function newLearner(C, settings = {}) {
    const L = { course: C.id, settings: { languages: settings.languages || C.languages.slice(), depth: { ...(C.data.course.defaults?.depth || {}), ...(settings.depth || {}) },
      batch: settings.batch || C.data.course.defaults?.batch || 12, ...(settings.knows ? { knows: settings.knows } : {}), ...(settings.aiNotes ? { aiNotes: true } : {}) }, langs: {} };
    for (const code of C.languages) L.langs[code] = { items: {}, fns: {}, checks: {} };
    return L;
  }
  const ensureLang = (L, code) => { const S = L.langs[code] = L.langs[code] || { items: {}, fns: {}, checks: {} }; S.checks = S.checks || {}; return S; };
  /** The result of a lesson check (§6.7): score 0…1. The best result counts; ≥ 0.8 passes the lesson (§5.2). */
  function recordCheck(C, L, code, nid, score, day) {
    if (C.nodes[nid]?.kind !== 'lesson') throw new Error(`${nid} is not a lesson`);
    const S = ensureLang(L, code), old = S.checks[nid] || {};
    S.checks[nid] = { day, score: +score.toFixed(3), best: Math.max(old.best || 0, +score.toFixed(3)), tries: (old.tries || 0) + 1 };
    return S.checks[nid];
  }
  const PASS = 0.8;

  /* ---------- spaced repetition (SM-2, day granularity), two tracks per item ---------- */
  const GRADE = { true: 4, false: 1, again: 1, hard: 3, good: 4, easy: 5 };
  function sm2(t, grade, day) {
    const q = typeof grade === 'number' ? grade : GRADE[String(grade)];
    if (q == null) throw new Error('unknown grade ' + grade);
    const s = { reps: 0, ivl: 0, ease: 2.5, lapses: 0, streak: 0, due: day, ...(t || {}) };
    if (q < 3) { s.reps = 0; s.ivl = 1; s.streak = 0; if (t && t.reps > 0) s.lapses++; }
    else {
      s.reps++; s.streak++;
      s.ivl = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.max(s.ivl + 1, Math.round(s.ivl * s.ease));
    }
    s.ease = Math.max(1.3, +(s.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)).toFixed(3));
    s.due = day + s.ivl; s.last = day;
    return s;
  }
  /** Mark an item as introduced (seen) without a review. */
  function introduce(C, L, code, lexId, day) {
    const it = ensureLang(L, code).items[lexId] = ensureLang(L, code).items[lexId] || {};
    if (it.seen == null) it.seen = day;
    return it;
  }
  /** One answer. track: 'r' (recognition) | 'p' (production); grade: true/false or again|hard|good|easy or 0–5. */
  function review(C, L, code, lexId, track, grade, day) {
    if (!C.lang[code]?.lex[lexId]) throw new Error(`unknown word ${lexId} in ${code}`);
    if (track !== 'r' && track !== 'p') throw new Error('track must be r or p');
    const it = introduce(C, L, code, lexId, day);
    it[track] = sm2(it[track], grade, day);
    return it;
  }

  /* ---------- states (always derived from the tracks — nothing to drift) ---------- */
  const ITEM_STATES = ['locked', 'ready', 'seen', 'learning', 'known_r', 'known_p', 'mastered'];
  const rank = s => ITEM_STATES.indexOf(s);
  const trackOk = (t, minIvl, minStreak) => !!t && t.ivl >= minIvl && t.streak >= minStreak;
  function itemState(C, L, code, lexId, nodeStates) {
    const it = L.langs[code]?.items[lexId];
    const ns = (nodeStates || {})[C.lang[code].lex[lexId].node];
    if (!it || (it.seen == null && !it.r && !it.p)) return ns && !['locked', 'skipped', 'unprepared'].includes(ns) ? 'ready' : 'locked';   // above the depth (§9.6) or not written yet: still locked
    if (!it.r && !it.p) return 'seen';
    if (!trackOk(it.r, 3, 2)) return 'learning';
    if (!trackOk(it.p, 3, 2)) return 'known_r';
    if (!trackOk(it.p, 21, 1)) return 'known_p';
    return 'mastered';
  }
  const NODE_DONE = new Set(['known', 'mastered', 'skipped', 'passed']);
  /** States of every node in one language: locked · open · learning · passed (a lesson whose check is passed, §5.2) · known · mastered
      · skipped (tier above the chosen depth) · unprepared (its words are not written yet in this language — it blocks what follows)
      · na (the node does not apply to this language: another path or other languages, D10 — passed through: done when its prerequisites are). */
  function nodeStates(C, L, code) {
    const X = C.lang[code], out = {}, done = {}, depth = L.settings.depth?.[code] ?? 3, checks = L.langs[code]?.checks || {};
    for (const nid of C.order) {
      const n = C.nodes[nid], pre = (n.prereqs || []).filter(p => C.nodes[p]), ready = pre.every(p => done[p]);
      if (!X.applies[nid]) { out[nid] = 'na'; done[nid] = ready; continue; }
      if (n.kind === 'field' && n.tier > depth) { out[nid] = 'skipped'; done[nid] = true; continue; }
      if (!X.prepared[nid]) { out[nid] = 'unprepared'; done[nid] = false; continue; }
      if (!ready) { out[nid] = 'locked'; done[nid] = false; continue; }
      const ids = X.byNode[nid] || [], lesson = n.kind === 'lesson';
      const st = ids.map(id => itemState(C, L, code, id, { [nid]: 'open' }));
      const share = s => st.filter(x => rank(x) >= rank(s)).length / st.length;
      const passed = lesson && (checks[nid]?.best || 0) >= PASS && st.every(x => rank(x) >= rank('seen'));
      if (!ids.length) out[nid] = lesson ? (passed ? 'passed' : (checks[nid] ? 'learning' : 'open')) : 'known';   // nothing to learn (all absent) / a grammar-only lesson
      else if (share('mastered') >= 0.9 && (!lesson || passed)) out[nid] = 'mastered';
      else if (share('known_r') >= 0.9 && share('known_p') >= 0.7 && (!lesson || passed)) out[nid] = 'known';
      else if (passed) out[nid] = 'passed';
      else if (st.every(x => x === 'ready') && !checks[nid]) out[nid] = 'open';
      else out[nid] = 'learning';
      done[nid] = NODE_DONE.has(out[nid]);
    }
    return out;
  }
  const nodeState = (C, L, code, nid) => nodeStates(C, L, code)[nid];
  /** The known sets of one language (§5.3): R = state ≥ learning, P = state ≥ known_r. Sets of lexeme ids. */
  function known(C, L, code) {
    const ns = nodeStates(C, L, code), R = new Set(), P = new Set(), state = {};
    for (const id of Object.keys(C.lang[code].lex)) {
      const s = state[id] = itemState(C, L, code, id, ns);
      if (rank(s) >= rank('learning')) R.add(id);
      if (rank(s) >= rank('known_r')) P.add(id);
    }
    return { R, P, state, nodes: ns };
  }
  /** The state of a concept in a language (for the flag dot): the best state of its words; 'absent' when the language has no word. */
  function conceptState(C, L, code, cid, k) {
    const X = C.lang[code];
    if (X.absent[cid]) return 'absent';
    const ids = X.byConcept[cid] || []; k = k || known(C, L, code);
    return ids.reduce((best, id) => rank(k.state[id]) > rank(best) ? k.state[id] : best, 'locked');
  }

  /* ---------- grammar functions ---------- */
  /** Record a block of answers on a function: n answers, c correct, on a day. */
  function practiceFunction(C, L, code, fid, correct, total, day) {
    const f = ensureLang(L, code).fns[fid] = ensureLang(L, code).fns[fid] || { log: [] };
    const last = f.log[f.log.length - 1];
    if (last && last.day === day) { last.c += correct; last.n += total; } else f.log.push({ day, c: correct, n: total });
    if (f.log.length > 60) f.log.splice(0, f.log.length - 60);
    return f;
  }
  /** new → practicing → solid (≥ 2 days, ≥ 10 answers, ≥ 80 % over the last two days) → mastered (≥ 3 days over ≥ 7 days, ≥ 85 % on each of the last three). */
  function functionState(C, L, code, fid) {
    const log = L.langs[code]?.fns[fid]?.log || [];
    if (!log.length) return 'new';
    const acc = e => e.n ? e.c / e.n : 0;
    const last3 = log.slice(-3), last2 = log.slice(-2);
    if (last3.length === 3 && last3[2].day - last3[0].day >= 7 && last3.every(e => acc(e) >= 0.85 && e.n >= 5)) return 'mastered';
    const n2 = last2.reduce((a, e) => a + e.n, 0), c2 = last2.reduce((a, e) => a + e.c, 0);
    if (last2.length === 2 && n2 >= 10 && c2 / n2 >= 0.8) return 'solid';
    return 'practicing';
  }

  /* ---------- the sentence bank ---------- */
  /** Sentences whose words are all known (or at most maxUnknown unknown). opts: {known: Set, functions: [ids] (all of them), frame, maxUnknown = 0, variants = true} */
  /** Sentences for an exercise or an example. maxUnknown: a number, or 'auto' = at most ⌈30 %⌉ of the sentence's words
   *  unknown to the learner (D19: every aspect but vocabulary trains with any vocabulary). Fewest unknown words first. */
  function selectSentences(C, code, opts = {}) {
    const X = C.lang[code], K = opts.known || new Set(), max = opts.maxUnknown || 0;
    return X.sentences.filter(s => {
      if (opts.frame && s.frame !== opts.frame) return false;
      if (opts.variants === false && s.variantOf) return false;
      if ((opts.functions || []).some(f => !(s.functions || []).includes(f))) return false;
      return s.req.filter(l => !K.has(l)).length <= (max === 'auto' ? s.cap : max);
    }).map(s => ({ ...s, unknown: s.req.filter(l => !K.has(l)) })).sort((a, b) => a.unknown.length - b.unknown.length);
  }
  /** Can a function be trained now in this language? (§7.3) → {state: ready|thin|locked|absent, sentences, needs: {POS: [have, need]}, unlockBy: [node ids]} */
  function feasibility(C, L, code, fid, opts = {}) {
    const X = C.lang[code], g = X.grammar[fid], min = opts.minSentences || 12;
    if (!g) return { state: 'absent', reason: 'no realization file', sentences: 0, needs: {}, unlockBy: [] };
    if (g.status === 'absent') return { state: 'absent', reason: g.summary, sentences: 0, needs: {}, unlockBy: [] };
    const k = opts.k || known(C, L, code);
    const ok = selectSentences(C, code, { known: k.R, functions: [fid], maxUnknown: 'auto' });   // D19: the sentences the exercises really use
    const needs = {}; let needsMet = true;
    for (const [pos, n] of Object.entries(g.needs || {})) {
      const have = [...k.R].filter(id => X.lex[id].pos === pos).length;
      needs[pos] = [have, n]; if (have < n) needsMet = false;
    }
    // which nodes would help most: the nodes of the missing words of the function's sentences, and of words of the needed parts of speech
    const votes = {};
    for (const s of selectSentences(C, code, { known: k.R, functions: [fid], maxUnknown: 99 })) for (const l of s.unknown) { const n = X.lex[l].node; votes[n] = (votes[n] || 0) + 1; }
    for (const [pos, [have, n]] of Object.entries(needs)) if (have < n) for (const lx of Object.values(X.lex)) if (lx.pos === pos && !k.R.has(lx.id)) votes[lx.node] = (votes[lx.node] || 0) + 1;
    const unlockBy = Object.keys(votes).filter(n => !['known', 'mastered'].includes(k.nodes[n])).sort((a, b) => votes[b] - votes[a] || C.order.indexOf(a) - C.order.indexOf(b));
    const gens = g.generators?.length ? g.generators : [{ type: 'sentence_meaning' }], usesBank = gens.some(x => BANK_TYPES.has(x.type)) || !gens.some(x => x.type !== 'quiz');   // only paradigm drills: no sentence needed (a quiz alone is not training)
    const state = !needsMet || (usesBank && !ok.length) ? 'locked' : (!usesBank || ok.length >= min) ? 'ready' : 'thin';
    return { state, sentences: ok.length, needs, unlockBy, usesBank };
  }

  /* ---------- reading text: form index, clitics, segmentation ---------- */
  const PUNCT = /^[\p{P}\p{S}]+$/u;
  function lookup(C, code, w) {
    const X = C.lang[code], lj = X.language;
    // readings of a written word: as written (and, at the start of a sentence, with a small first letter: Sie / sie);
    // "loose" also without vowel marks. A vocalized word is first read exactly — so بِكَمْ is بِ + كَمْ, not بِكُمْ.
    const tryWord = (s, loose) => {
      const all = [];
      for (const k of new Set([s, ...(loose ? [stripMarks(code, s)] : []), ...(lj.capitalizeFirst ? [decapFirst(s)] : [])])) for (const m of X.forms.get(k) || []) if (!all.some(x => x.l === m.l && x.f === m.f)) all.push(m);
      return all.length ? all : null;
    };
    // prefix clitics (ar wa-/bi-…, he ve-/ha-/be-…): up to two, longest first; every written spelling (וּ, וַ …) before the plain letter
    const strip = (s, depth, loose) => {
      if (depth > 2) return null;
      for (const plainPass of [false, true]) for (const p of X.prefixes) {
        const pre = plainPass ? p.plain : p.t;
        if (!pre || (plainPass && pre === p.t) || !s.startsWith(pre) || s.length <= pre.length) continue;
        let head = pre, rest = s.slice(pre.length);
        if (plainPass) { const mk = rest.match(/^\p{M}+/u); if (mk) { head += mk[0]; rest = rest.slice(mk[0].length); } }   // the plain prefix letter carries vowel marks of its own (וָ before a number, וּ)
        if (!rest) continue;
        const pm = [{ t: head, matches: [{ l: p.l, f: null }] }];
        const m = tryWord(rest, loose) || (code === 'ar' && p.plain === 'ل' && rest[0] === 'ل' ? tryWord('ا' + rest, loose) : null);   // لِلْـ = لِ + الْـ (the alif of the article is not written)
        if (m) return [...pm, { t: rest, matches: m }];
        const deeper = strip(rest, depth + 1, loose);
        if (deeper) return [...pm, ...deeper];
      }
      return null;
    };
    const W = nfc(w);
    for (const loose of [false, true]) {
      const direct = tryWord(W, loose);
      if (direct) return { matches: direct };
      const parts = strip(W, 1, loose);
      if (parts) return { matches: [], parts };
    }
    return { matches: [] };
  }
  /** Text → tokens [{t, p?, matches:[{l,f}], parts?, unknown?}]. Spaces split words; Chinese is segmented by longest match over the course words. */
  function tokenize(C, code, text) {
    const X = C.lang[code], out = [];
    const pushWord = w => { const r = lookup(C, code, w); out.push({ t: w, matches: r.matches, ...(r.parts ? { parts: r.parts } : {}), unknown: !r.matches.length && !r.parts }); };
    if (X.language.tokenJoin === 'none') {
      const own = ownSegmentation(C, code, text); if (own) return own;   // a sentence of the bank: its own annotated words (P4)
      const chars = [...nfc(text)]; let i = 0;
      while (i < chars.length) {
        const ch = chars[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (PUNCT.test(ch)) { out.push({ t: ch, p: true, matches: [] }); i++; continue; }
        let hit = null;
        for (let n = Math.min(X.maxWord, chars.length - i); n >= 1; n--) { const w = chars.slice(i, i + n).join(''); if (X.forms.has(w)) { hit = w; break; } }
        const ks = knownSplit(C, code, chars, i, hit ? [...hit].length : 0);   // a longer span the bank always splits this way (P4)
        if (ks) { for (const w of ks) out.push({ t: w, matches: X.forms.get(w) || [] }); i += ks.join('').length; continue; }
        if (hit) { out.push({ t: hit, matches: X.forms.get(hit) }); i += [...hit].length; }
        else { const prev = out[out.length - 1]; if (prev && prev.unknown && !prev.p) prev.t += ch; else out.push({ t: ch, matches: [], unknown: true }); i++; }   // unknown characters stay together (a name: 小明)
      }
      return out;
    }
    // words with their punctuation split off; multi-word words (Rote Bete, תַּפּוּחַ אֲדָמָה) are matched first, longest first
    const items = [];
    for (const raw of nfc(text).split(/\s+/).filter(Boolean)) {
      const [, lead, core, trail] = raw.match(/^([\p{P}\p{S}]*)(.*?)([\p{P}\p{S}]*)$/u);
      items.push({ lead, core, trail });
    }
    for (let i = 0; i < items.length; i++) {
      for (const ch of items[i].lead) out.push({ t: ch, p: 'open', matches: [] });
      let used = 1;
      for (let n = Math.min(X.maxWords, items.length - i); n >= 2; n--) {
        const span = items.slice(i, i + n);
        if (span.slice(0, -1).some(x => x.trail) || span.slice(1).some(x => x.lead)) continue;   // punctuation inside: not one word
        const w = span.map(x => x.core).join(' '), r = lookup(C, code, w);
        if (r.matches.length || (r.parts && r.parts[r.parts.length - 1].t.includes(' '))) { out.push({ t: w, matches: r.matches, ...(r.parts ? { parts: r.parts } : {}) }); used = n; break; }
      }
      if (used === 1 && items[i].core) pushWord(items[i].core);
      for (const ch of items[i + used - 1].trail) out.push({ t: ch, p: true, matches: [] });
      i += used - 1;
    }
    return out;
  }
  /** Check a text against the known words (§7.2): {tokens, unknown: [words not in the course], unlearned: [course words not known yet]} */
  function analyze(C, code, text, knownSet) {
    const tokens = tokenize(C, code, text), unknown = [], unlearned = [];
    for (const k of tokens) {
      if (k.p) continue;
      if (k.unknown) { unknown.push(k.t); continue; }
      const ls = k.parts ? k.parts.map(p => p.matches.map(m => m.l)) : [k.matches.map(m => m.l)];
      if (knownSet && ls.some(alts => !alts.some(l => knownSet.has(l)))) unlearned.push(k.t);
    }
    return { tokens, unknown, unlearned };
  }

  /* ---------- the word card: everything about one word, in depth (§4.6) ---------- */
  const ARTICLE = { MASC: 'der', FEM: 'die', NEUT: 'das' };
  /** The forms a learner memorizes with the word, per language: [[label, value], …] */
  function principalParts(C, code, lx) {
    const f = lx.forms || {}, get = c => { const k = Object.keys(f).find(x => canon(x) === canon(c)); return k ? f[k] : null; }, out = [];
    const G = { MASC: 'masculine', FEM: 'feminine', NEUT: 'neuter' };
    // German: the article with the form used after it (der Gute Heinrich); plural-only nouns (die Edamame)
    if (code === 'de' && lx.pos === 'NOUN' && lx.class === 'plt') { out.push(['plural only', 'die ' + (get('N;NOM;PL') || lx.lemma)]); }
    else if (code === 'de' && lx.pos === 'NOUN') { out.push(['article', ARTICLE[lx.gender] + ' ' + (get('N;NOM;SG;DEF') || lx.lemma)]); if (get('N;GEN;SG')) out.push(['genitive', (lx.gender === 'FEM' ? 'der ' : 'des ') + get('N;GEN;SG')]); if (get('N;NOM;PL')) out.push(['plural', 'die ' + get('N;NOM;PL')]); }
    else if (code === 'de' && lx.pos === 'VERB') { for (const [l, c] of [['er/sie/es', 'V;PRS;3;SG'], ['du', 'V;PRS;2;SG']]) if (get(c)) out.push([l, get(c)]); if (lx.aux) out.push(['perfect with', lx.aux]); }
    else if (lx.pos === 'NOUN' && lx.class === 'collective') { out.push(['collective', lx.lemma]); if (lx.unit) out.push(['one (unit noun)', lx.unit]); if (get('N;NOM;PL;INDF')) out.push(['counted plural', get('N;NOM;PL;INDF')]); }
    else if (code === 'he' && lx.pos === 'NOUN') { if (get('N;SG;FEM;INDF')) out.push(['feminine', get('N;SG;FEM;INDF')]); if (get('N;PL;INDF')) out.push(['plural', get('N;PL;INDF')]); if (get('N;SG;DEF')) out.push(['with the article', get('N;SG;DEF')]); }
    else if (code === 'ar' && lx.pos === 'NOUN') {
      const pick = (...cs) => { for (const c of cs) { const f = get(c); if (f) return f; } return null; };
      const fem = pick('N;NOM;SG;FEM;INDF'), pl = pick('N;NOM;PL;INDF', 'N;NOM;PL;MASC;INDF'), plf = pick('N;NOM;PL;FEM;INDF'), def = pick('N;NOM;SG;DEF', 'N;NOM;SG;MASC;DEF');
      if (fem) out.push(['feminine', fem]); if (pl) out.push(['plural', pl]); if (plf) out.push(['feminine plural', plf]); if (def) out.push(['with the article', def]);
    }
    else if (lx.pos === 'VERB' && lx.root) { out.push(['root', lx.root]); if (lx.binyan) out.push(['binyan', lx.binyan]); if (lx.verbForm) out.push(['verb form', lx.verbForm]); }
    if (lx.gender && !(code === 'de' && lx.pos === 'NOUN')) out.push(['gender', G[lx.gender]]);
    if (lx.root && lx.pos !== 'VERB') out.push(['root', lx.root]);
    if (code === 'zh') { if (lx.pinyin) out.push(['pinyin', lx.pinyin.replace(/\s+/g, '')]); if (lx.trad && lx.trad !== lx.lemma) out.push(['traditional', lx.trad]); if (lx.measure) out.push(['measure word', lx.measure.join(' · ')]); }
    if (lx.translit && code !== 'zh') out.push(['transliteration', lx.translit]);
    return out;
  }
  /** → {lex, lemma, pos, parts, flags (the concept in every course language), meaning, register, examples (with their words checked against what the learner knows), sections} */
  function wordCard(C, L, code, lexId, opts = {}) {
    const X = C.lang[code], lx = X.lex[lexId];
    if (!lx) throw new Error(`unknown word ${lexId} in ${code}`);
    const p = lx.profile || {}, k = opts.k || known(C, L, code);
    const concept = opts.concept && (lx.senses || []).includes(opts.concept) ? opts.concept : (lx.senses || [])[0] || null;   // the meaning it is shown for (D15)
    const flags = concept
      ? C.languages.map(c => ({ lang: c, state: conceptState(C, L, c, concept), words: (C.lang[c].byConcept[concept] || []).map(id => ({ lex: id, lemma: C.lang[c].lex[id].lemma })), absent: C.lang[c].absent[concept] || null }))
      : [{ lang: code, state: k.state[lexId], words: [{ lex: lexId, lemma: lx.lemma }], absent: null }];
    const examples = (p.examples || []).map(e => {
      const a = analyze(C, code, e.text, k.R);
      return { ...e, plain: X.language.vowelMarks ? stripMarks(code, e.text) : e.text, unknown: a.unknown, unlearned: a.unlearned,
        senseDef: (p.senses || []).find(s => s.id === e.sense)?.def || '' };
    });
    const byRegister = {};
    for (const s of p.synonyms || []) for (const r of [].concat(s.register)) (byRegister[r] = byRegister[r] || []).push(s);
    const sec = (key, title, items) => (items && (Array.isArray(items) ? items.length : Object.keys(items).length)) ? { key, title, items } : null;
    const sections = [
      sec('senses', 'Meanings', meanings(C, code, lx, concept)),
      sec('facade', 'This word in ' + (X.language.name || code), facadeOf(C, code, lx)),
      sec('examples', 'In sentences — contexts and registers', examples),
      sec('collocations', 'Goes with', p.collocations),
      sec('particleVerbs', 'Verbs built on it', p.particleVerbs),
      sec('phrases', 'Idioms, sayings and quotes', p.phrases),
      sec('synonyms', 'Synonyms by register', byRegister),
      sec('antonyms', 'Opposites', p.antonyms),
      sec('pitfalls', '⚠️ Watch out', p.pitfalls),
      sec('subtleties', 'Subtleties', p.subtleties),
      sec('etymology', 'Where it comes from', p.etymology ? [p.etymology] : []),
      sec('funFacts', 'Fun facts', p.funFacts),
    ].filter(Boolean);
    return { lex: lexId, lang: code, lemma: lx.lemma, pos: lx.pos, concept, gloss: concept ? C.concepts[concept]?.gloss : (lx.role || ''), parts: principalParts(C, code, lx),
      state: k.state[lexId], flags, frequency: p.frequency || null, status: p.status || null, register: [].concat(p.register || []), connotation: p.connotation || null,
      intensity: p.intensity ?? null, feeling: p.feeling || '', synonymsNone: p.synonymsNone || '', examples, sections, hasProfile: !!lx.profile };
  }

  /** Every meaning of a word (D15): its concept, whether it is the meaning shown, its nuances, its own forms. */
  function meanings(C, code, lx, concept) {
    const ss = (lx.profile || {}).senses || [], X = C.lang[code];
    const forms = {};   // sense id → [label: form] from the parameters whose items name senses (another plural, reading …)
    const decl = ((X.language.wordFeatures || {})[lx.pos] || []);
    for (const d of decl) {
      const val = (lx.features || {})[d.id];
      if (!Array.isArray(val)) continue;
      for (const it of val) if (it && Array.isArray(it.senses)) {
        const txt = Object.entries(it).filter(([k2, v2]) => k2 !== 'senses' && typeof v2 === 'string').map(([, v2]) => v2).join(' · ');
        for (const sid of it.senses) (forms[sid] = forms[sid] || []).push({ label: d.title || d.id, text: txt });
      }
    }
    const one = s => {
      const c = s.concept || null, con = c ? C.concepts[c] : null;
      return { id: s.id, def: s.def, register: s.register, domains: s.domains, concept: c, gloss: con?.gloss || '', pending: !!con?.pending,
        current: !!c && c === concept, forms: forms[s.id] || [], contrast: c ? (lx.contrasts || []).find(t => t.concept === c) || null : null, words: c ? (X.byConcept[c] || []).filter(id => id !== lx.id).map(id => X.lex[id].lemma) : [],
        nuances: ss.filter(n => n.of === s.id).map(n => ({ id: n.id, def: n.def, register: n.register, forms: forms[n.id] || [] })) };
    };
    const main = ss.filter(s => !s.of).map(one);
    return main.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
  }
  /** The word's parameters as its language declares them (D14): [{title, text}] — what is stated, and what does not apply. */
  function facadeOf(C, code, lx) {
    const X = C.lang[code], key = lx.class ? lx.pos + '.' + lx.class : lx.pos, out = [];
    for (const d of ((X.language.wordFeatures || {})[lx.pos] || [])) {
      if (d.classes && !d.classes.includes(key)) continue;
      const val = d.at === 'top' ? lx[d.id] : (lx.features || {})[d.id];
      if (val == null) continue;
      const show = v => v == null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : Array.isArray(v) ? v.map(show).filter(Boolean).join(' · ')
        : typeof v === 'object' ? ('none' in v ? '— ' + v.none : Object.entries(v).filter(([k2]) => k2 !== 'senses').map(([, v2]) => show(v2)).filter(Boolean).join(' ')
          + (v.senses ? ' (' + v.senses.map(sid => ((lx.profile || {}).senses || []).find(x => x.id === sid)?.def?.split(/[;,(—]/)[0].trim() || sid).join(', ') + ')' : '')) : String(v);
      const text = show(val); if (text) out.push({ id: d.id, title: d.title || d.id, text, none: !!(val && typeof val === 'object' && 'none' in val) });
    }
    return out;
  }

  /* ---------- exercises made from stored data (§6.7 generators) — every answer comes from the course files ---------- */
  const TAG_LABEL = { NOM: 'nominative', ACC: 'accusative', DAT: 'dative', GEN: 'genitive', SG: 'singular', PL: 'plural', DU: 'dual', COLL: 'collective',
    MASC: 'masculine', FEM: 'feminine', NEUT: 'neuter', DEF: 'definite (“the”)', INDF: 'indefinite', PRS: 'present', PST: 'past', FUT: 'future',
    PFV: 'perfective', IPFV: 'imperfective', IND: 'indicative', SBJV: 'subjunctive', JUSS: 'jussive', IMP: 'imperative', NFIN: 'infinitive', CSTR: 'construct state',
    '1': '1st person', '2': '2nd person', '3': '3rd person' };
  Object.assign(TAG_LABEL, { STRG: 'strong ending (no article)', WEAK: 'weak ending (after der / die / das)', MIX: 'mixed ending (after ein / kein / mein)', SEP: 'the separated particle', PFX: 'after an attached preposition', ALT: 'before the article (another spelling)', CONST: 'construct state (“the … of”)', POSS: 'with an owner ending', INFM: 'informal', FORM: 'formal', CMPR: 'comparative', SPRL: 'superlative', NEG: 'negative', PTCP: 'participle', MSDR: 'verbal noun' });
  const OWNER = { '1S': 'my', '2S': 'your', '2SM': 'your (m.)', '2SF': 'your (f.)', '3S': 'his/her', '3SM': 'his', '3SF': 'her', '1P': 'our', '2P': 'your (pl.)', '2PM': 'your (pl. m.)', '2PF': 'your (pl. f.)', '3P': 'their', '3PM': 'their (m.)', '3PF': 'their (f.)', '2D': 'your (two)', '3D': 'their (two)' };
  /** A feature cell in words: V;PRS;3;SG → “present · 3rd person · singular”; possessed forms name the owner: N;NOM;SG;PSS1S → “nominative · singular · owner: my” */
  function cellLabel(cell) {
    const p = cellParts(canon(cell)).slice(1), pss = p.find(t => /^PSS\d/.test(t));
    if (pss) return [...p.filter(t => t !== pss && t !== 'POSS').map(t => TAG_LABEL[t] || t), 'owner: ' + (OWNER[pss.slice(3)] || pss.slice(3))].join(' · ');
    if (p.includes('POSS') && p[0] !== 'POSS') {   // N;POSS;3;PL;FEM — person, number and gender are the owner's
      const own = p.filter(t => ['1', '2', '3', 'SG', 'PL', 'DU', 'MASC', 'FEM'].includes(t)), key = (own.find(t => /\d/.test(t)) || '') + ((own.includes('PL') ? 'P' : own.includes('DU') ? 'D' : 'S')) + (own.includes('MASC') ? 'M' : own.includes('FEM') ? 'F' : '');
      const rest = p.filter(t => t !== 'POSS' && !own.includes(t)).map(t => TAG_LABEL[t] || t);
      return [...rest, 'owner: ' + (OWNER[key] || OWNER[key.slice(0, 2)] || own.join(' '))].join(' · ');
    }
    return p.map(t => TAG_LABEL[t] || t).join(' · ') || 'basic form';
  }
  const VARIANT_LABEL = { Polarity: { NEG: 'Make it negative', POS: 'Make it positive' }, Mood: { INT: 'Make it a question', IMP: 'Make it a command' },
    Number: { PL: 'Make it plural', SG: 'Make it singular', DU: 'Make it dual (two)' }, Definiteness: { DEF: 'Make it definite (“the”)', INDF: 'Make it indefinite' },
    Gender: { FEM: 'Say it about / to a woman', MASC: 'Say it about / to a man' }, Addressee: { FEM: 'Say it to a woman', MASC: 'Say it to a man' },
    Tense: { PST: 'Put it in the past', FUT: 'Put it in the future', PRS: 'Put it in the present' }, Aspect: { PFV: 'Say that it happened (completed)', IPFV: 'Say that it is going on' },
    Formality: { formal: 'Say it politely (formal)', informal: 'Say it informally' }, Address: { formal: 'Say it politely (formal)', informal: 'Say it informally' },
    Deixis: { FAR: 'Point to something farther away (that)', NEAR: 'Point to something near (this)' },
    QuestionForm: { 'A-not-A': 'Ask with A-not-A (是不是, 要不要)' }, QuestionMarker: { intonation: 'Ask with intonation only' } };
  const variantLabel = v => Object.entries(v || {}).map(([k, x]) => VARIANT_LABEL[k]?.[x] || VARIANT_LABEL[k]?.[String(x).split(' ')[0].toLowerCase()] || (/formal/i.test(x) ? (/informal/i.test(x) ? VARIANT_LABEL.Formality.informal : VARIANT_LABEL.Formality.formal) : `${k}: ${x}`)).join(' · ');
  const GENDER_WORD = { MASC: 'masculine', FEM: 'feminine', NEUT: 'neuter' };
  function shuffled(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const uniqStr = a => [...new Set(a)];
  /** The pieces of a sentence a learner puts in order: its written words (a word with attached prefixes stays one tile). */
  const sentenceTiles = s => (s.tokens || []).filter(k => !k.p).map(k => k.t);
  const endPunct = s => { const ps = (s.tokens || []).filter(k => k.p === true); const last = (s.tokens || [])[s.tokens.length - 1]; return last && last.p === true ? last.t : ''; };
  const cmpText = (code, t) => nfc(t).replace(/[\p{P}\s]+/gu, ' ').trim().toLowerCase();
  /** A wrong tile for a sentence: another form of one of its inflected words (never a form that is in the sentence). */
  function wrongTile(C, code, s, rng) {
    const X = C.lang[code], used = new Set(sentenceTiles(s).map(nfc)), cands = [];
    for (const k of s.tokens || []) {
      if (k.p || !k.l || !k.f) continue;
      const lx = X.lex[k.l]; if (!lx) continue;
      for (const f of Object.values(lx.forms || {})) if (!used.has(nfc(f)) && stripMarks(code, f).toLowerCase() !== stripMarks(code, k.t).toLowerCase()) cands.push(f);
    }
    const u = uniqStr(cands); return u.length ? u[Math.floor(rng() * u.length)] : null;
  }
  /** Generator registry: each phase adds its exercise types here (GEN.paradigm = ctx => items), keeping exercises() one place. */
  const GEN = {};
  /** Items for one grammar function in one language, from its generators. opts: {k (known), rng, max = 12}.
      Item kinds: {type:'choose', kind, prompt, ask, options, answer, why} · {type:'build', kind, source?, change?, tiles, answers, punct, gloss}. */
  function exercises(C, L, code, fid, opts = {}) {
    const X = C.lang[code], g = X.grammar[fid], rng = opts.rng || Math.random, max = opts.max ?? 12;
    if (!g || g.status === 'absent' && !(g.quiz || []).length) return [];
    const k = opts.k || known(C, L, code), K = k.R;
    const gens0 = (g.generators && g.generators.length) ? g.generators : [{ type: 'sentence_meaning' }, { type: 'build_sentence' }, { type: 'transform' }];
    const gens = opts.auto ? gens0.concat(autoGenerators(C, code, fid, gens0)) : gens0;   // P5: the types its data allows (grammar lane, function page, session)
    const fnsOf = gen => gen.bank?.functions || [fid];
    // the sentences a generator draws on: by functions (default: this one) or by frames (for points no word shows, e.g. a verbless “to be”)
    const U = opts.strictKnown ? 0 : 'auto';   // D19: up to ⌈30 %⌉ unknown words (marked 🆕); strictKnown: only known words
    const bankFor = gen => gen.bank?.frames ? selectSentences(C, code, { known: K, maxUnknown: U }).filter(s => gen.bank.frames.includes(s.frame)) : selectSentences(C, code, { known: K, functions: fnsOf(gen), maxUnknown: U });
    const pools = [];
    for (const gen of gens) {
      const items = [];
      if (['inflect', 'principal_parts'].includes(gen.type)) {
        for (const lx of Object.values(X.lex)) {
          if (!K.has(lx.id) || (gen.pos && lx.pos !== gen.pos) || (gen.class && lx.class !== gen.class) || (gen.lemmas && !gen.lemmas.includes(lx.id)) || (gen.exclude || []).includes(lx.id)) continue;
          if (gen.concepts && !(lx.senses || []).some(c => gen.concepts.some(p => c.startsWith(p)))) continue;
          if (lx.separable && !gen.lemmas) continue;   // a separable verb's stem alone is not its whole form (komme … an)
          const forms = lx.forms || {}, cells = (gen.cells || Object.keys(forms).filter(c => !/(^|;)(PFX|ALT|SEP)(;|$)/.test(c))).filter(c => Object.keys(forms).some(x => canon(x) === canon(c)));
          for (const c of cells) {
            const key = Object.keys(forms).find(x => canon(x) === canon(c)), ans = forms[key];
            const alsoRight = new Set([ans, ...((lx.formsAlt || {})[key] || [])].map(f => stripMarks(code, nfc(f)).toLowerCase()));   // e.g. Onkel / Onkels
            const wrong = uniqStr(Object.entries(forms).filter(([c2, f]) => !/(^|;)(PFX|ALT|SEP)(;|$)/.test(c2) && !alsoRight.has(stripMarks(code, nfc(f)).toLowerCase())).map(([, f]) => f));   // a spelling variant is never offered as wrong
            if (!wrong.length || key === Object.keys(forms).find(x => forms[x] === lx.lemma) && cells.length > 1) continue;   // asking for the lemma itself teaches nothing
            items.push({ type: 'choose', kind: 'inflect', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: cellLabel(c), cell: canon(c),
              options: shuffled([ans, ...shuffled(wrong, rng).slice(0, 3)], rng), answer: ans, why: `${lx.lemma} — ${cellLabel(c)}: ${ans}` });
          }
        }
      } else if (gen.type === 'gender_article') {
        for (const lx of Object.values(X.lex)) {
          if (!K.has(lx.id) || lx.pos !== 'NOUN' || !GENDER_WORD[lx.gender] || lx.class === 'plt' || (gen.concepts && !(lx.senses || []).some(c => gen.concepts.some(p => c.startsWith(p))))) continue;
          if (code === 'de') { const a = { MASC: 'der', FEM: 'die', NEUT: 'das' }[lx.gender], f = lx.forms || {}, after = f[Object.keys(f).find(x => canon(x) === canon('N;NOM;SG;DEF'))] || lx.lemma; items.push({ type: 'choose', kind: 'gender', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: 'Its article?', options: ['der', 'die', 'das'], answer: a, why: `${a} ${after} (${GENDER_WORD[lx.gender]})` }); }
          else { const opts2 = code === 'ar' || code === 'he' ? ['masculine', 'feminine'] : ['masculine', 'feminine', 'neuter']; items.push({ type: 'choose', kind: 'gender', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: 'Its gender?', options: opts2, answer: GENDER_WORD[lx.gender], why: `${lx.lemma}: ${GENDER_WORD[lx.gender]}` }); }
        }
      } else if (gen.type === 'measure_word') {
        const clf = Object.values(X.lex).filter(x => x.pos === 'CLF'), knownClf = clf.filter(x => K.has(x.id)).map(x => x.lemma), allClf = clf.map(x => x.lemma);
        for (const lx of Object.values(X.lex)) {
          if (!K.has(lx.id) || lx.pos !== 'NOUN' || !(lx.measure || []).length) continue;
          const ans = lx.measure[0], wrong = (knownClf.length >= 3 ? knownClf : allClf).filter(m => !lx.measure.includes(m) && m !== '个');   // 个 is never offered as wrong: it is often heard with anything
          if (wrong.length < 1) continue;
          items.push({ type: 'choose', kind: 'measure', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: 'one … — which measure word?', options: shuffled([ans, ...shuffled(wrong, rng).slice(0, 3)], rng).map(m => '一' + m), answer: '一' + ans, why: `一${lx.measure.join(' / 一')}${lx.lemma}` });
        }
      } else if (gen.type === 'sentence_meaning') {
        const ss = bankFor(gen);
        const all = selectSentences(C, code, { known: K, maxUnknown: U });
        // two sentences mean the same when their words stand for the same concepts (再见 / 拜拜, 你 / 您): never offer one as a wrong meaning of the other
        const ck = new Map(), conceptKey = o => { if (!ck.has(o.id)) ck.set(o.id, o.req.map(l => (X.lex[l]?.senses || [])[0] || l).sort().join('|')); return ck.get(o.id); };   // computed once per sentence
        for (const s of ss.length > max * 3 + 30 ? shuffled(ss, rng).slice(0, max * 3 + 30) : ss) {   // a big bank: a sample is enough (the pool is cut to max anyway)
          const key = conceptKey(s);
          const others = shuffled(all.filter(o => o.id !== s.id && o.gloss !== s.gloss && conceptKey(o) !== key), rng);
          const near = others.filter(o => o.req.some(l => s.req.includes(l))), wrong = uniqStr([...near, ...others].map(o => o.gloss)).slice(0, 3);
          if (wrong.length < 2) continue;
          items.push({ type: 'choose', kind: 'meaning', fn: fid, lang: code, sentence: s.id, prompt: s.text, ask: 'What does it mean?', options: shuffled([s.gloss, ...wrong], rng), answer: s.gloss, why: s.gloss, unknown: s.unknown });
        }
      } else if (gen.type === 'build_sentence' || gen.type === 'word_order') {
        for (const s of bankFor(gen)) {
          const tiles = sentenceTiles(s); if (tiles.length < 2) continue;
          const wt = wrongTile(C, code, s, rng);
          items.push({ type: 'build', kind: 'build', fn: fid, lang: code, sentence: s.id, gloss: s.gloss, tiles: shuffled(wt ? [...tiles, wt] : tiles, rng), size: tiles.length,
            answers: [s.text, ...(s.alts || [])], punct: endPunct(s), why: s.text, unknown: s.unknown });
        }
      } else if (gen.type === 'transform') {
        const want = gen.bank?.variant;
        for (const s2 of selectSentences(C, code, { known: K, functions: gen.bank?.functions ? fnsOf(gen) : [], maxUnknown: U })) {
          if (!s2.variantOf || (want && !(want in (s2.variant || {}))) || (gen.bank?.frames && !gen.bank.frames.includes(s2.frame))) continue;
          const s1 = X.sentenceById[s2.variantOf]; if (!s1 || s1.req.filter(l => !K.has(l)).length > (U === 'auto' ? s1.cap : 0)) continue;
          if (!gen.bank?.functions && !gen.bank?.frames && !(s2.functions || []).includes(fid) && !(s1.functions || []).includes(fid)) continue;
          const tiles = sentenceTiles(s2), extra = sentenceTiles(s1).filter(t => !tiles.includes(t));
          items.push({ type: 'build', kind: 'transform', fn: fid, lang: code, sentence: s2.id, source: s1.text, sourceGloss: s1.gloss, change: variantLabel(s2.variant), gloss: s2.gloss,
            tiles: shuffled([...tiles, ...extra.slice(0, 1)], rng), size: tiles.length, answers: [s2.text, ...(s2.alts || [])], punct: endPunct(s2), why: s2.text,
            unknown: [...new Set([...s2.unknown, ...s1.req.filter(l => !K.has(l))])] });
        }
      } else if (GEN[gen.type]) {   // generators added by later phases (P4–P7): GEN[type](ctx) → items
        items.push(...(GEN[gen.type]({ C, L, code, fid, g, gen, k, K, rng, bank: () => bankFor(gen), max, U }) || []));
      } else if (gen.type === 'quiz') {
        for (const q of g.quiz || []) items.push({ type: 'choose', kind: 'quiz', fn: fid, lang: code, prompt: q.q, ask: '', options: shuffled(q.options, rng), answer: q.answer, why: q.why });
      }
      if (items.length) pools.push(shuffled(items, rng));
    }
    // take from the generators in turn, so a short set still has every kind
    const out = []; let i = 0;
    while (out.length < max && pools.some(p => p.length)) { const p = pools[i++ % pools.length]; if (p.length) out.push(p.shift()); }
    return out;
  }
  /** Is a built sentence right? (the tiles in order vs the sentence and its alternatives) */
  function checkBuilt(C, code, item, tiles) {
    const X = C.lang[code], text = joinTokens(tiles.map(t => ({ t })), item.join || X.language.tokenJoin);
    return item.answers.some(a => cmpText(code, a) === cmpText(code, text));
  }
  /** Recognition items for words: the word → its meaning (distractors: other words of the same lesson/node first). */
  function wordItems(C, L, code, lexIds, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, gl = id => { const c = (X.lex[id].senses || [])[0]; return c ? C.concepts[c].gloss : (X.lex[id].role || ''); };
    return lexIds.filter(id => (X.lex[id].senses || []).length).map(id => {
      const pool = uniqStr([...lexIds, ...Object.keys(X.lex)].filter(x => x !== id && (X.lex[x].senses || []).length && !(X.lex[x].senses || []).some(s => X.lex[id].senses.includes(s))).map(gl)).filter(g => g && g !== gl(id));
      return { type: 'choose', kind: 'word', lang: code, lex: id, prompt: X.lex[id].lemma, ask: 'What does it mean?', options: shuffled([gl(id), ...pool.slice(0, 3)], rng), answer: gl(id), why: `${X.lex[id].lemma} — ${gl(id)}` };
    });
  }
  /** The lesson check (§6.7): n items mixing the lesson's words and its functions, in one language. */
  function lessonCheck(C, L, code, nid, opts = {}) {
    const n = C.nodes[nid], rng = opts.rng || Math.random, size = opts.size || 10, k = opts.k || known(C, L, code);
    const words = shuffled(wordItems(C, L, code, C.lang[code].byNode[nid] || [], { rng }), rng);
    const fx = lessonFunctions(C, code, nid).map(f => exercises(C, L, code, f, { k, rng, max: size }));
    const out = []; const pools = [words, ...fx].filter(p => p.length); let i = 0;
    while (out.length < size && pools.some(p => p.length)) { const p = pools[i++ % pools.length]; if (p.length) out.push(p.shift()); }
    return out;
  }

  /** The word profiles, loaded separately (course.profiles.js: {lexeme id: profile}). */
  function addProfiles(C, map) {
    let n = 0;
    for (const X of Object.values(C.lang)) for (const [id, lx] of Object.entries(X.lex)) if (map && map[id] && !lx.profile) { lx.profile = map[id]; n++; }
    return n;
  }

  /* ---------- the daily session (§7.5) ---------- */
  const SECONDS = { review: 8, learn: 40, grammar: 300, extra: 120, lesson: 600 };
  /** The next lesson of every language, languages at the same lesson together (D10: the steps are parallel): [{kind:'lesson', node, step, langs}] */
  function nextLessons(C, L, langs, K) {
    const out = [];
    for (const c of langs) {
      const nid = C.order.find(x => C.nodes[x].kind === 'lesson' && ['open', 'learning'].includes(K[c].nodes[x]));
      if (!nid) continue;
      const st = out.find(x => x.node === nid);
      if (st) st.langs.push(c); else out.push({ kind: 'lesson', node: nid, step: C.nodes[nid].step ?? null, langs: [c] });
    }
    return out.sort((a, b) => C.order.indexOf(a.node) - C.order.indexOf(b.node));
  }
  /** → {steps: [{kind:'review', items:[{lang, lex, track}]}, {kind:'lesson', node, path, langs}, {kind:'learn', node, concepts:[{concept, langs:[{lang, lex}]}]}, {kind:'grammar', lang, fn}], seconds} */
  function planSession(C, L, { day, minutes = 30, languages } = {}) {
    const langs = (languages || L.settings.languages).filter(c => C.lang[c]);
    let budget = minutes * 60; const steps = [];
    const K = {}; for (const c of langs) K[c] = known(C, L, c);
    // 1 · reviews due, grouped by concept across languages (the same idea in every language one after the other)
    const due = [];
    for (const c of langs) for (const [id, it] of Object.entries(L.langs[c]?.items || {})) for (const tr of ['r', 'p']) {
      const t = it[tr]; if (t && t.due <= day) due.push({ lang: c, lex: id, track: tr, due: t.due, concept: (C.lang[c].lex[id].senses || [])[0] || id });
    }
    due.sort((a, b) => a.due - b.due || (a.concept < b.concept ? -1 : a.concept > b.concept ? 1 : 0) || langs.indexOf(a.lang) - langs.indexOf(b.lang) || (a.track < b.track ? -1 : 1));
    const order = []; const byConcept = {};
    for (const d of due) { if (!byConcept[d.concept]) { byConcept[d.concept] = []; order.push(d.concept); } byConcept[d.concept].push(d); }
    const reviews = [];
    for (const cid of order) { const g = byConcept[cid]; if (budget < g.length * SECONDS.review) break; reviews.push(...g); budget -= g.length * SECONDS.review; }
    if (reviews.length) steps.push({ kind: 'review', items: reviews.map(({ lang, lex, track }) => ({ lang, lex, track })) });
    // 2 · the foundations (D9, D10): the next lesson of every path group
    const lessons = nextLessons(C, L, langs, K);
    for (const st of lessons) { steps.push(st); budget -= SECONDS.lesson; }
    // 3 · a new batch: the first node (prerequisites first) still to learn in some language; its concepts in every language where it is open
    const batch = Math.max(1, L.settings.batch || 12);
    for (const nid of C.order) {
      if (budget < SECONDS.learn) break;
      if (C.nodes[nid].kind === 'lesson') continue;   // lesson words are learned inside their lesson
      const open = langs.filter(c => ['open', 'learning'].includes(K[c].nodes[nid]));
      if (!open.length) continue;
      const concepts = [];
      const n = C.nodes[nid];
      const cs = n.concepts.slice().sort((a, b) => { const A = C.concepts[a], B = C.concepts[b]; return (A.subgroup || '').localeCompare(B.subgroup || '') || A.tier - B.tier || A.rank - B.rank; });
      const pushConcept = (key, entries) => { if (entries.length && concepts.length < batch && budget >= SECONDS.learn) { concepts.push({ concept: key, langs: entries }); budget -= SECONDS.learn; } };
      for (const cid of cs) pushConcept(cid, open.flatMap(c => (C.lang[c].byConcept[cid] || []).filter(id => K[c].state[id] === 'ready').slice(0, 1).map(id => ({ lang: c, lex: id }))));
      for (const c of open) for (const id of C.lang[c].byNode[nid]) if (!(C.lang[c].lex[id].senses || []).length && K[c].state[id] === 'ready') pushConcept(id, [{ lang: c, lex: id }]);
      if (concepts.length) { steps.push({ kind: 'learn', node: nid, concepts }); break; }
    }
    // 4 · one grammar function: the first (by "after") that is ready or thin in some language and not mastered there
    if (budget >= SECONDS.grammar && !lessons.length) {
      // in the common order of the course (D13): where the function is taught, then by "after"
      const at = {}; C.order.forEach((nid, i) => { const f = C.nodes[nid].functions || []; for (const x of (Array.isArray(f) ? f : Object.values(f).flat())) if (!(x in at)) at[x] = i; });
      const fns = Object.keys(C.functions).sort((a, b) => (at[a] ?? 1e9) - (at[b] ?? 1e9) || (C.functions[a].after || []).length - (C.functions[b].after || []).length || a.localeCompare(b));
      outer: for (const fid of fns) for (const c of langs) {
        if (functionState(C, L, c, fid) === 'mastered') continue;
        const f = feasibility(C, L, c, fid, { k: K[c], minSentences: 1 });
        if (f.state === 'ready' || f.state === 'thin') { steps.push({ kind: 'grammar', lang: c, fn: fid, feasibility: f.state }); budget -= SECONDS.grammar; break outer; }
      }
    }
    budget -= polyPlan(C, L, steps, langs, K, day, minutes * 60);   // 5 · P6: confusables side by side, one polyglot item (§7.5, §9)
    return { day, steps, seconds: minutes * 60 - budget };
  }

  /* ---------- storage: one key per (language, node) and per (language, function) (§5.6) ---------- */
  function toKV(C, L) {
    const kv = { settings: L.settings };
    for (const [code, S] of Object.entries(L.langs)) {
      const X = C.lang[code]; if (!X) continue;
      for (const [id, it] of Object.entries(S.items)) { const n = X.lex[id]?.node; if (!n) continue; const k = `lang:${code}:node:${n}`; (kv[k] = kv[k] || { items: {} }).items[id] = it; }
      for (const [fid, f] of Object.entries(S.fns)) kv[`lang:${code}:fn:${fid}`] = f;
      for (const [nid, ch] of Object.entries(S.checks || {})) { const k = `lang:${code}:node:${nid}`; (kv[k] = kv[k] || { items: {} }).check = ch; }
      if (S.script && Object.keys(S.script.items || {}).length) kv[`lang:${code}:script`] = S.script;   // the script stage (§5.5)
    }
    return kv;
  }
  function fromKV(C, kv) {
    const L = newLearner(C, kv.settings || {});
    for (const [k, v] of Object.entries(kv)) {
      let m = k.match(/^lang:([^:]+):node:(.+)$/);
      if (m && C.lang[m[1]]) { Object.assign(ensureLang(L, m[1]).items, v.items || {}); if (v.check) ensureLang(L, m[1]).checks[m[2]] = v.check; continue; }
      m = k.match(/^lang:([^:]+):fn:(.+)$/);
      if (m && C.lang[m[1]]) ensureLang(L, m[1]).fns[m[2]] = v;
      m = k.match(/^lang:([^:]+):script$/);
      if (m && C.lang[m[1]] && v && typeof v === 'object') ensureLang(L, m[1]).script = { ...v, items: { ...(v.items || {}) } };
    }
    return L;
  }

  const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

  const API = { version: 1, nfc, canon, cellParts, cellHas, stripMarks, hasMarks, isHan, pinyinSplit, pinyinTone, pinyinSyllableErrors,
    pinyinNumbersToMarks, pinyinMarksToNumbers, joinTokens, capFirst,
    readCourse, course, forLearner, learnerProfiles, prototype, familiarFrom, notesFor, UNKNOWN_SHARE, newLearner, introduce, review, sm2, itemState, nodeStates, nodeState, known, conceptState, ITEM_STATES,
    practiceFunction, functionState, selectSentences, feasibility, lookup, tokenize, analyze, planSession, toKV, fromKV, dayNumber, wordCard, principalParts,
    TYPES, applies, pathGroups, lessonFunctions, addProfiles, recordCheck, nextLessons, exercises, checkBuilt, wordItems, lessonCheck, cellLabel, variantLabel, shuffled, PASS };
  /* ---------- P4 — Scripts and input: letters, characters, positional forms, vowel marks, tones, typed answers (§4.9, §5.5, §6.1, §8) ---------- */
  const ZWJ = '\u200d';
  const isMark = ch => /\p{M}/u.test(ch);
  const isLetterCh = ch => /\p{L}/u.test(ch);
  /** The script module of a language, indexed once: ar/he letters + marks (lang/<L>/script.json), zh characters (lang/zh/chars.json). */
  function scriptModule(C, code) {
    const X = C.lang[code]; if (!X) return null;
    if (X._script !== undefined) return X._script;
    const src = C.data.langs[code] || {}, s = src.script, z = src.chars;
    let M = null;
    if (s && Array.isArray(s.letters)) {
      const items = {}, byChar = {};
      for (const x of s.letters) { items[x.ch] = { ...x, key: x.ch, type: 'letter' }; for (const f of Object.values(x.forms || {})) { const b = f.replace(/\u200d/g, ''); if (!byChar[b]) byChar[b] = x.ch; } }
      for (const m of s.marks || []) items[m.ch] = { ...m, key: m.ch, type: 'mark' };
      const groups = (s.groups || []).map(g => ({ id: g.id, title: g.title, items: (g.items || []).filter(k => items[k]) }));
      groups.forEach((g, i) => g.items.forEach(k => { items[k].group = g.id; items[k].groupIndex = i; }));
      const look = {}; for (const set of s.lookalikes || []) for (const a of set) look[a] = uniqStr([...(look[a] || []), ...set.filter(b => b !== a)]);
      M = { kind: 'letters', lang: code, dir: s.dir || 'rtl', items, byChar, groups, order: groups.flatMap(g => g.items), marks: (s.marks || []).map(m => m.ch),
        markInfo: Object.fromEntries((s.marks || []).map(m => [m.ch, m])), baseMarks: new Set(s.baseMarks || []), look, keyboard: s.keyboard || null, raw: s };
    } else if (z && Array.isArray(z.chars)) {
      const items = {};
      for (const e of z.chars) items[e.ch] = { ...e, key: e.ch, type: 'char' };
      // characters grouped by the first node (in the course order) whose words use them: they come with the lessons
      const first = {}, groups = [];
      for (const nid of C.order) for (const id of X.byNode[nid] || []) for (const ch of nfc(X.lex[id].lemma)) if (items[ch] && !first[ch]) {
        first[ch] = nid; let g = groups[groups.length - 1]; if (!g || g.id !== nid) groups.push(g = { id: nid, title: C.nodes[nid].title, items: [] }); g.items.push(ch);
      }
      groups.forEach((g, i) => g.items.forEach(k => { items[k].group = g.id; items[k].groupIndex = i; }));
      const words = {}; for (const lx of Object.values(X.lex)) for (const ch of new Set(nfc(lx.lemma))) if (items[ch]) (words[ch] = words[ch] || []).push(lx.id);
      M = { kind: 'chars', lang: code, dir: 'ltr', items, groups, order: groups.flatMap(g => g.items), words, raw: z };
    }
    X._script = M; return M;
  }
  /** A written word as letters with their marks: [{t, base, marks: [sorted], letter (the module's key), sep?}] — he: the shin / sin dot is part
   *  of the letter, a dagesh in ב כ פ makes another letter (b k p) but stays a mark to write. */
  function letterClusters(C, code, text) {
    const M = scriptModule(C, code), out = [];
    for (const ch of nfc(text)) {
      if (isMark(ch) && out.length && !out[out.length - 1].sep) { const c = out[out.length - 1]; c.t += ch; if (M?.baseMarks?.has(ch)) c.base += ch; else c.marks.push(ch); continue; }
      out.push(isLetterCh(ch) ? { t: ch, base: ch, marks: [] } : { t: ch, base: ch, marks: [], sep: true });
    }
    for (const c of out) {
      c.marks.sort();
      if (c.sep || !M || M.kind !== 'letters') continue;
      const dag = c.marks.includes('\u05bc') && M.items[c.base + '\u05bc'] ? c.base + '\u05bc' : null;
      c.letter = dag || (M.items[c.base] ? c.base : M.byChar[c.base] || c.base);
    }
    return out;
  }
  /** Arabic: which form every letter of a word takes (isolated, initial, medial, final); Hebrew: regular or final. Lām + alif = one sign. */
  function glyphPositions(C, code, text) {
    const M = scriptModule(C, code), cl = letterClusters(C, code, text);
    const joins = c => c.sep ? 'none' : (M?.items[c.letter]?.joins || M?.items[M?.byChar?.[c.base]]?.joins || 'none');
    for (let i = 0; i < cl.length; i++) {
      const c = cl[i]; if (c.sep) continue;
      if (code === 'he') { const it = M?.items[c.letter]; c.pos = it?.finalOf ? 'final' : 'regular'; continue; }
      const prev = cl[i - 1], next = cl[i + 1];
      const fromPrev = !!prev && !prev.sep && joins(prev) === 'dual' && joins(c) !== 'none';
      const toNext = !!next && !next.sep && joins(c) === 'dual' && joins(next) !== 'none';
      c.pos = fromPrev ? (toNext ? 'medial' : 'final') : (toNext ? 'initial' : 'isolated');
      if (c.base === 'ل' && next && /^[اأإآٱ]/.test(next.base)) c.lamAlif = true;
    }
    return cl;
  }
  /** One letter in one position (ZWJ-joined, so any font shapes it): null when the letter has no such form. */
  const glyphForm = (C, code, key, pos) => { const it = scriptModule(C, code)?.items[key]; return it?.forms?.[pos] || null; };

  /* the learner's script stage (§5.5): letters / characters with two tracks each, stored in lang:<L>:script */
  const scriptStore = (L, code) => { const S = ensureLang(L, code); return S.script = S.script || { items: {} }; };
  function glyphTrackState(it) {
    if (!it || (it.seen == null && !it.r && !it.p)) return 'ready';
    if (!it.r && !it.p) return 'seen';
    if (!trackOk(it.r, 3, 2)) return 'learning';
    if (!trackOk(it.p, 3, 2)) return 'known_r';
    if (!trackOk(it.p, 21, 1)) return 'known_p';
    return 'mastered';
  }
  function introduceGlyph(C, L, code, key, day) { const st = scriptStore(L, code), it = st.items[key] = st.items[key] || {}; if (it.seen == null) it.seen = day; return it; }
  function reviewGlyph(C, L, code, key, track, grade, day) {
    if (!scriptModule(C, code)?.items[key]) throw new Error(`unknown letter or character ${key} in ${code}`);
    if (track !== 'r' && track !== 'p') throw new Error('track must be r or p');
    const it = introduceGlyph(C, L, code, key, day); it[track] = sm2(it[track], grade, day); return it;
  }
  /** The state of every letter (ar, he) or character (zh) and the stage: {kind, items: {key: state}, groups: [{id, title, items, state, known}],
   *  stage (groups fully known), stages, open (the groups to learn now), complete, known, total}. zh: a character is as known as the best
   *  word that contains it, or its own drills. */
  function scriptState(C, L, code, k) {
    const M = scriptModule(C, code); if (!M) return null;
    const store = L.langs[code]?.script?.items || {}, items = {};
    let kk = k;
    for (const key of M.order) {
      let st = glyphTrackState(store[key]);
      if (M.kind === 'chars') { kk = kk || known(C, L, code); for (const id of M.words[key] || []) if (rank(kk.state[id]) > rank(st)) st = kk.state[id]; if (st === 'locked') st = 'ready'; }
      items[key] = st;
    }
    const groups = M.groups.map(g => {
      const sts = g.items.map(x => items[x]), all = s => sts.every(x => rank(x) >= rank(s));
      return { id: g.id, title: g.title, items: g.items, state: all('known_r') ? 'known' : all('learning') ? 'practised' : sts.some(x => rank(x) >= rank('seen')) ? 'learning' : 'new', known: sts.filter(x => rank(x) >= rank('known_r')).length };
    });
    let stage = 0; while (stage < groups.length && groups[stage].state === 'known') stage++;
    // the groups to learn now: every group up to the first one that is not practised yet (the stage advances as letters become known)
    const open = []; for (const g of groups) { open.push(g.id); if (g.state !== 'known' && g.state !== 'practised') break; }
    const total = M.order.length, kn = M.order.filter(x => rank(items[x]) >= rank('known_r')).length;
    return { kind: M.kind, items, groups, stage, stages: groups.length, open, complete: total > 0 && kn === total, known: kn, total, introduced: M.order.filter(x => rank(items[x]) >= rank('seen')).length };
  }
  /** Until the letter stage is complete, words show their transliteration (§5.5). */
  const needsTranslit = (C, L, code) => { const M = scriptModule(C, code); return !!M && M.kind === 'letters' && !scriptState(C, L, code).complete; };

  /* ---------- vowel marks: full · fading by word state · none (§8) ---------- */
  const LIGHT_KEEP = { ar: new Set(['\u0651']), he: new Set(['\u05c1', '\u05c2', '\u05bc']) };   // light: ar keeps šadda; he keeps the shin / sin dot and the dagesh
  /** The marks to show on a word: 'full' | 'light' | 'none'. pref: full | fading | none; fading = full while the word is new, light once
   *  it is known for reading, none once it is known for writing. */
  function markLevel(C, L, code, lexId, pref) {
    if (!C.lang[code]?.language.vowelMarks) return 'full';
    if (pref === 'none') return 'none';
    if (pref !== 'fading' || !lexId || !C.lang[code].lex[lexId]) return 'full';
    const st = itemState(C, L, code, lexId, {});
    return rank(st) >= rank('known_p') ? 'none' : rank(st) >= rank('known_r') ? 'light' : 'full';
  }
  function fadeMarks(code, text, level) {
    if (level === 'none') return stripMarks(code, text);
    if (level !== 'light') return text;
    const t = markTest(code), keep = LIGHT_KEEP[code] || new Set(); let out = '';
    for (const ch of nfc(text)) if (!t(ch.codePointAt(0)) || keep.has(ch)) out += ch;
    return out;
  }
  /** The mark level of a written text (a word or a phrase without its lexeme): the weakest level of the words it is read as. */
  function textMarkLevel(C, L, code, text, pref) {
    if (!C.lang[code]?.language.vowelMarks || pref !== 'fading') return pref === 'none' && C.lang[code]?.language.vowelMarks ? 'none' : 'full';
    const ids = []; for (const tk of tokenize(C, code, text)) { if (tk.p) continue; const ms = tk.parts ? tk.parts.flatMap(p => p.matches) : tk.matches; if (!ms.length) return 'full'; ids.push(ms[0].l); }
    if (!ids.length) return 'full';
    const lv = ids.map(id => markLevel(C, L, code, id, pref)), order = ['full', 'light', 'none'];
    return lv.reduce((a, b) => order.indexOf(a) < order.indexOf(b) ? a : b);
  }

  /* ---------- Chinese tones: written and spoken (sandhi) ---------- */
  /** Spoken tones of a word: 3 + 3 → 2 + 3 (two syllables of the third tone), 不 before a fourth tone → bú. Only these two sure rules
   *  (一 depends on its use; longer runs of third tones on the phrasing) — null when the word is not one of these cases. */
  function toneSandhi(chars, tones) {
    const t = tones.slice(); let changed = false;
    const threes = tones.filter(x => x === 3).length;
    for (let i = 0; i < t.length - 1; i++) {
      if (chars[i] === '不' && t[i] === 4 && t[i + 1] === 4) { t[i] = 2; changed = true; }
      if (t[i] === 3 && t[i + 1] === 3 && threes === 2 && t.length <= 3) { t[i] = 2; changed = true; }
    }
    return changed ? t : null;
  }
  const pinyinBase = syl => { const r = pinyinTone(syl); return typeof r === 'string' ? syl : r[0]; };
  const withTone = (base, tone) => pinyinNumbersToMarks(base + (tone === 5 ? '' : tone));

  /* ---------- pinyin input (§8): tone numbers → marks, the characters to choose ---------- */
  let SYLS = null;
  function pinyinSyllables() {
    if (SYLS) return SYLS;
    SYLS = new Set();
    const ini = ['', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
    for (const i of ini) for (const f of FINALS) { const s = i + f; if (!pinyinSyllableErrors(s).length) SYLS.add(s); }
    for (const s of ['yu', 'yue', 'yuan', 'yun', 'ju', 'jue', 'juan', 'jun', 'qu', 'que', 'quan', 'qun', 'xu', 'xue', 'xuan', 'xun', 'lü', 'lüe', 'nü', 'nüe', 'r']) SYLS.add(s);
    return SYLS;
  }
  /** "ni3hao3", "ni hao", "nǐhǎo", "lv4" → [{base, tone|null}] (null when the text is not pinyin). A digit gives the tone of the syllable
   *  before it; a tone mark the tone of its syllable; no tone = any tone. */
  function parsePinyin(raw) {
    const S = pinyinSyllables(), out = [];
    const txt = nfc(String(raw || '')).toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü');
    for (const chunk of txt.split(/[\s']+/).filter(Boolean)) {
      for (const run of chunk.match(/[^\d]+|\d/g) || []) {
        if (/^\d$/.test(run)) { if (!out.length || +run > 5) return null; out[out.length - 1].tone = +run === 0 ? 5 : +run; continue; }
        let letters = ''; const toneAt = [];
        for (const ch of run) { if (TONE[ch]) { toneAt[letters.length] = TONE[ch][1]; letters += TONE[ch][0]; } else if (/[a-zü]/.test(ch)) letters += ch; else return null; }
        let best = null;
        const go = (i, acc) => { if (i === letters.length) { best = acc; return true; } for (let n = Math.min(6, letters.length - i); n >= 1; n--) if (S.has(letters.slice(i, i + n)) && go(i + n, [...acc, [i, n]])) return true; return false; };
        if (!go(0, [])) return null;
        for (const [i, n] of best) { let tone = null; for (let j = i; j < i + n; j++) if (toneAt[j]) tone = toneAt[j]; out.push({ base: letters.slice(i, i + n), tone }); }
      }
    }
    return out.length ? out : null;
  }
  /** What the learner typed in pinyin → {marks: 'nǐ hǎo', candidates: [{text, pinyin, lex?, gloss}]} — the course's words and characters
   *  whose reading fits (a tone that is not typed fits any tone). */
  function pinyinCandidates(C, code, raw, opts = {}) {
    const X = C.lang[code], syl = parsePinyin(raw); if (!syl) return { marks: '', candidates: [] };
    const marks = syl.map(s => s.tone ? withTone(s.base, s.tone) : s.base).join(' ');
    const fits = py => { const ps = pinyinSplit(py); if (ps.length !== syl.length) return false; return ps.every((p, i) => { const r = pinyinTone(p); return typeof r !== 'string' && r[0] === syl[i].base && (syl[i].tone == null || r[1] === syl[i].tone || (syl[i].tone === 5 && r[1] === 5)); }); };
    const K = opts.known || new Set(), out = [], seen = new Set();
    for (const lx of Object.values(X.lex)) if (lx.pinyin && fits(lx.pinyin) && !seen.has(lx.lemma)) { seen.add(lx.lemma); out.push({ text: lx.lemma, pinyin: lx.pinyin, lex: lx.id, gloss: (lx.senses || [])[0] ? C.concepts[lx.senses[0]]?.gloss || '' : lx.role || '', known: K.has(lx.id) }); }
    const M = scriptModule(C, code);
    if (M?.kind === 'chars' && syl.length === 1) for (const e of Object.values(M.items)) if (!seen.has(e.ch) && [...(e.readings || []), ...(e.wordReadings || [])].some(fits)) { seen.add(e.ch); out.push({ text: e.ch, pinyin: (e.readings || e.wordReadings)[0], gloss: e.meaning || '', known: false, char: true }); }
    out.sort((a, b) => (b.known - a.known) || (!!a.char - !!b.char) || ((M?.words?.[b.text]?.length || 0) - (M?.words?.[a.text]?.length || 0)) || a.text.localeCompare(b.text));
    return { marks, candidates: out.slice(0, opts.max || 12) };
  }

  /* ---------- typed answers: letter-level comparison (spell, produce, recall) ---------- */
  const graphemes = s => { try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map(x => x.segment); } catch (e) { return [...s]; } };
  /** Letter-level difference: [{t, op: same|wrong|missing|extra, want?}] (wanted vs typed, grapheme by grapheme). */
  function letterDiff(want, got) {
    const a = graphemes(nfc(want)), b = graphemes(nfc(got)), D = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) D[i][0] = i; for (let j = 0; j <= b.length; j++) D[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const out = []; let i = a.length, j = b.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { out.push(a[i - 1] === b[j - 1] ? { t: b[j - 1], op: 'same' } : { t: b[j - 1], op: 'wrong', want: a[i - 1] }); i--; j--; }
      else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { out.push({ t: a[i - 1], op: 'missing' }); i--; }
      else { out.push({ t: b[j - 1], op: 'extra' }); j--; }
    }
    return out.reverse();
  }
  const NOTE_PAIRS = [
    [/^[aouAOU]$/, /^[äöüÄÖÜ]$/, 'umlaut: ä ö ü are letters of their own'], [/^s$/, /^ß$/, 'ß (or ss after a long vowel / diphthong)'],
    [/^[اأإآءؤئ]/, /^[اأإآءؤئ]/, 'hamza and its seat (أ إ آ ء ؤ ئ)'], [/^[هة]/, /^[هة]/, 'tāʾ marbūṭa ة at the end, not هـ'], [/^[يى]/, /^[يى]/, 'alif maqṣūra ى (no dots) vs yāʾ ي'],
    [/^[כך]/, /^[כך]/, 'final form (ך ם ן ף ץ at the end of a word only)'], [/^[מם]/, /^[מם]/, 'final form (ך ם ן ף ץ at the end of a word only)'], [/^[נן]/, /^[נן]/, 'final form (ך ם ן ף ץ at the end of a word only)'],
    [/^[פף]/, /^[פף]/, 'final form (ך ם ן ף ץ at the end of a word only)'], [/^[צץ]/, /^[צץ]/, 'final form (ך ם ן ף ץ at the end of a word only)']];
  /** Is a typed answer the word? → {ok, expected, diff, notes, marksOk}. ar/he: without vowel marks the letters must match (with marks,
   *  the marks too); de: capitals, umlauts and ß count; zh: the characters (simplified or traditional). */
  function checkTyped(C, code, lexId, typed, opts = {}) {
    const X = C.lang[code], lx = X.lex[lexId], t = nfc(String(typed || '').trim().replace(/\s+/g, ' '));
    const wants = uniqStr([lx.lemma, ...(opts.forms || []), ...(lx.alts || []), ...(code === 'zh' && lx.trad ? [lx.trad] : [])].map(nfc));
    const vm = !!X.language.vowelMarks, typedMarks = vm && hasMarks(code, t);
    const plain = w => stripMarks(code, w);
    let ok = wants.includes(t); const swiss = code === 'de' && !ok && wants.some(w => w.includes('ß') && w.replace(/ß/g, 'ss') === t);
    if (swiss) ok = true;   // the Swiss spelling: ss for ß (accepted, with a note)
    if (!ok && vm && !typedMarks) ok = wants.some(w => plain(w) === t) || Object.values(lx.plene || {}).some(p => nfc(p) === t);
    const expected = wants[0], cmp = vm && !typedMarks ? plain(expected) : expected;
    const diff = letterDiff(cmp, t), notes = swiss ? ['the Swiss spelling (ss for ß) — elsewhere ß'] : [];
    if (!ok) {
      if (vm && typedMarks && wants.some(w => plain(w) === plain(t))) notes.push('the letters are right; a vowel mark is not');
      if (code === 'de' && t.toLowerCase() === expected.toLowerCase()) notes.push(lx.pos === 'NOUN' ? 'nouns start with a capital letter' : 'capital / small letter');
      if (code === 'zh' && /^[a-zA-Züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ0-9\s']+$/.test(t)) notes.push('type the pinyin, then choose the characters');
      for (const d of diff) if (d.op === 'wrong') for (const [x, y, n] of NOTE_PAIRS) if ((x.test(d.want) && y.test(d.t)) || (y.test(d.want) && x.test(d.t))) { if (!notes.includes(n)) notes.push(n); }
    }
    return { ok, expected, diff, notes, marksTyped: typedMarks };
  }

  /* ---------- tokenizer helpers for Chinese (§13.1): a bank sentence keeps its own words; a span the bank always splits stays split ---------- */
  function ownSegmentation(C, code, text) {
    const X = C.lang[code];
    if (!X._byText) { X._byText = new Map(); for (const s of X.sentences) if (!X._byText.has(nfc(s.text))) X._byText.set(nfc(s.text), s); }
    const s = X._byText.get(nfc(text)); if (!s) return null;
    return (s.tokens || []).map(k => k.p ? { t: k.t, p: k.p, matches: [] } : k.name || !k.l ? { t: k.t, matches: [], unknown: true }
      : { t: k.t, matches: [...(X.forms.get(nfc(k.t)) || [])].concat((X.forms.get(nfc(k.t)) || []).some(m => m.l === k.l) ? [] : [{ l: k.l, f: k.f || null }]) });
  }
  function maxMatch(X, chars, i) { for (let n = Math.min(X.maxWord, chars.length - i); n >= 1; n--) { const w = chars.slice(i, i + n).join(''); if (X.forms.has(w)) return w; } return null; }
  function knownSplit(C, code, chars, i, hitLen) {
    const X = C.lang[code];
    if (!X._splits) {
      X._splits = new Map(); const cand = new Map(), whole = new Set();
      for (const s of X.sentences) {
        const toks = s.tokens || [], flat = [...nfc(s.text)];
        if (toks.map(k => k.t).join('') !== nfc(s.text)) continue;
        const words = []; let pos = 0;
        for (const k of toks) { const n = [...k.t].length; if (!k.p) { words.push([pos, pos + n, k.t]); whole.add(nfc(k.t)); } pos += n; }
        // where plain longest matching from a word of the bank would swallow more than that word: how the bank splits the span
        for (const [a] of words) {
          const mw = maxMatch(X, flat, a); if (!mw) continue;
          const end = a + [...mw].length, inside = words.filter(([x, y]) => x >= a && y <= end);
          if (inside.length > 1 && inside[inside.length - 1][1] === end) { const v = cand.get(mw) || new Set(); v.add(inside.map(w => w[2]).join('|')); cand.set(mw, v); }
        }
      }
      // a span is split in every text only when the bank always splits it the same way and never writes it as one word
      for (const [span, v] of cand) if (v.size === 1 && !whole.has(span)) { const f = [...span][0]; if (!X._splits.has(f)) X._splits.set(f, []); X._splits.get(f).push({ span, parts: [...v][0].split('|') }); }
      for (const l of X._splits.values()) l.sort((a, b) => [...b.span].length - [...a.span].length);
    }
    const list = X._splits.get(chars[i]); if (!list) return null;
    for (const { span, parts } of list) { const n = [...span].length; if (n >= hitLen && chars.slice(i, i + n).join('') === span) return parts; }
    return null;
  }

  /* ---------- exercise generators (§6.1): every answer comes from the course files and the script module ---------- */
  const glossOf = (C, code, id) => { const x = C.lang[code].lex[id], c = (x.senses || [])[0]; return c ? C.concepts[c]?.gloss || c : (x.role || ''); };
  /** Words to read and write in script drills: the learner's words (fewest first-time), else the words of the lessons being learned. */
  function scriptWords(C, L, code, k, n = 40) {
    const X = C.lang[code], met = Object.keys(X.lex).filter(id => rank(k.state[id]) >= rank('seen'));
    let pool = met;
    if (pool.length < 6) for (const nid of C.order) { if (pool.length >= 12) break; if (['open', 'learning', 'passed'].includes(k.nodes[nid])) pool = uniqStr([...pool, ...(X.byNode[nid] || [])]); }
    if (pool.length < 6) for (const nid of C.order) { if (pool.length >= 12) break; if (X.prepared[nid]) pool = uniqStr([...pool, ...(X.byNode[nid] || [])]); }
    return pool.filter(id => X.lex[id] && (X.lex[id].senses || []).length || X.lex[id]?.role).slice(0, n * 4);
  }
  /** Letters to drill: those met, else the open groups (ar, he). */
  function scriptLetters(C, L, code, ss) {
    const M = scriptModule(C, code); if (!M || M.kind !== 'letters') return [];
    const met = M.order.filter(x => rank(ss.items[x]) >= rank('seen'));
    return met.length >= 3 ? met : uniqStr([...met, ...ss.groups.filter(g => ss.open.includes(g.id)).flatMap(g => g.items)]);
  }
  function chooseItem(type, kind, code, fields, rng) {
    const opts = uniqStr([fields.answer, ...fields.wrong.filter(w => w && w !== fields.answer)]).slice(0, 4);
    if (opts.length < 2) return null;
    const { wrong, ...rest } = fields;
    return { type, kind, lang: code, options: shuffled(opts, rng), ...rest };
  }
  const GEN_SCRIPT = {
    glyph_form(ctx) {
      const { C, code, rng } = ctx, M = scriptModule(C, code); if (!M || M.kind !== 'letters') return [];
      const ss = scriptState(C, ctx.L, code, ctx.k), out = [];
      for (const key of scriptLetters(C, ctx.L, code, ss)) {
        const it = M.items[key]; if (it.type !== 'letter') continue;
        const forms = it.forms || {}, poss = Object.keys(forms).filter(p => p !== 'isolated' && p !== 'regular');
        for (const pos of poss) {
          const wrong = uniqStr([...Object.entries(forms).filter(([p]) => p !== pos).map(([, f]) => f), ...(M.look[key] || []).map(b => M.items[b]?.forms?.[pos]).filter(Boolean)]);
          const label = { initial: 'at the start of a word (joined to the next letter)', medial: 'in the middle of a word', final: 'at the end of a word' }[pos];
          const x = chooseItem('glyph_form', 'position', code, { glyph: key, track: 'p', pos, prompt: forms.isolated || forms.regular || key, promptAs: 'glyph', ask: `${it.name}: its form ${label}?`, answer: forms[pos], wrong, optionsAs: 'glyph', why: `${it.name} ${label}: ${forms[pos].replace(/\u200d/g, '')}` }, rng);
          if (x) out.push(x);
        }
      }
      // building a word from its letters: the learner picks them in order (Arabic joins them as they come; Hebrew needs the final form)
      for (const id of scriptWords(C, ctx.L, code, ctx.k)) {
        const lx = C.lang[code].lex[id], plain = stripMarks(code, lx.lemma); if (/\s/.test(plain)) continue;
        const cl = letterClusters(C, code, plain); if (cl.length < 2 || cl.length > 9 || cl.some(c => c.sep || !M.items[c.letter] && !M.byChar[c.base])) continue;
        const letters = cl.map(c => c.base);
        // the other form of a letter with a final form (he) always comes along; then look-alikes
        const other = code === 'he' ? uniqStr(letters.flatMap(b => Object.values(M.items).filter(x => x.finalOf === b || x.ch === M.items[b]?.finalOf).map(x => x.ch))).filter(b => !letters.includes(b)) : [];
        const look = uniqStr(letters.flatMap(b => M.look[b] || [])).filter(b => b.length === 1 && !letters.includes(b) && !other.includes(b));
        out.push({ type: 'glyph_form', kind: 'join', lang: code, lex: id, prompt: glossOf(C, code, id), answer: plain, letters, tiles: shuffled([...letters, ...other.slice(0, 2), ...shuffled(look, rng).slice(0, Math.max(1, 3 - other.length))], rng), why: `${lx.lemma} = ${letters.join(' + ')}` });
      }
      return out;
    },
    transliterate(ctx) {
      const { C, code, rng } = ctx, X = C.lang[code], M = scriptModule(C, code), out = [];
      if (M?.kind === 'letters') {
        const ss = scriptState(C, ctx.L, code, ctx.k), keys = scriptLetters(C, ctx.L, code, ss), all = M.order.filter(x => M.items[x].type === 'letter' && M.items[x].translit);
        for (const key of keys) {
          const it = M.items[key]; if (it.type !== 'letter' || !it.translit) continue;
          const others = shuffled(all.filter(b => b !== key && M.items[b].translit !== it.translit), rng), look = (M.look[key] || []).filter(b => M.items[b]?.translit && M.items[b].translit !== it.translit);
          const a = chooseItem('transliterate', 'letter', code, { glyph: key, track: 'r', prompt: key, promptAs: 'glyph', ask: 'How is it written in Latin letters?', answer: it.translit, wrong: [...look.map(b => M.items[b].translit), ...others.map(b => M.items[b].translit)], optionsAs: 'latin', why: `${key} ${it.name}: ${it.translit} [${it.sound}]` }, rng);
          const b = chooseItem('transliterate', 'letter_rev', code, { glyph: key, track: 'p', prompt: `${it.translit}  [${it.sound}]`, promptAs: 'latin', ask: 'Which letter?', answer: key, wrong: [...look, ...others].filter(x => M.items[x].translit !== it.translit), optionsAs: 'glyph', why: `${it.translit} = ${key} (${it.name})` }, rng);
          if (a) out.push(a); if (b) out.push(b);
        }
      }
      const words = scriptWords(C, ctx.L, code, ctx.k), rom = id => code === 'zh' ? X.lex[id].pinyin : X.lex[id].translit;
      const pool = Object.keys(X.lex).filter(id => rom(id));
      for (const id of words) {
        const lx = X.lex[id], r = rom(id); if (!r) continue;
        const same = pool.filter(o => o !== id && rom(o) !== r && X.lex[o].lemma !== lx.lemma);
        const near = shuffled(same, rng).sort((a, b) => Math.abs(rom(a).length - r.length) - Math.abs(rom(b).length - r.length)).slice(0, 6);
        let wrong = near.map(rom);
        if (code === 'zh') {   // the same syllables with other tones are the closest wrong answers
          const syl = pinyinSplit(r), toneVar = [];
          for (let i = 0; i < syl.length && toneVar.length < 4; i++) for (const t of [1, 2, 3, 4]) { const b = pinyinBase(syl[i]), cur = pinyinTone(syl[i]); if (typeof cur === 'string' || cur[1] === t) continue; const v = syl.slice(); v[i] = withTone(b, t); toneVar.push(v.join(' ')); }
          const realOthers = new Set(pool.filter(o => X.lex[o].lemma === lx.lemma).map(rom));
          wrong = [...shuffled(toneVar.filter(v => !realOthers.has(v)), rng).slice(0, 2), ...wrong];
        }
        const a = chooseItem('transliterate', 'word', code, { lex: id, track: 'r', prompt: lx.lemma, promptAs: 'word', ask: code === 'zh' ? 'Its pinyin?' : 'How is it read?', answer: r, wrong, optionsAs: 'latin', why: `${lx.lemma} = ${r} — ${glossOf(C, code, id)}` }, rng);
        const b = chooseItem('transliterate', 'word_rev', code, { lex: id, prompt: r, promptAs: 'latin', ask: 'Which is it?', answer: lx.lemma, wrong: near.map(o => X.lex[o].lemma).filter(w => w !== lx.lemma), optionsAs: 'word', why: `${r} = ${lx.lemma} — ${glossOf(C, code, id)}` }, rng);
        if (a) out.push(a); if (b) out.push(b);
      }
      if (M?.kind === 'chars') for (const id of words) for (const ch of new Set(X.lex[id].lemma)) {   // a character → its readings
        const e = M.items[ch]; if (!e) continue; const rd = [...(e.readings || []), ...(e.wordReadings || [])]; if (!rd.length) continue;
        const syl = pinyinSplit(X.lex[id].pinyin), i = [...X.lex[id].lemma].indexOf(ch), ans = syl[i] && rd.includes(syl[i]) ? syl[i] : rd[0];
        const wrong = [1, 2, 3, 4].map(t => withTone(pinyinBase(ans), t)).filter(v => !rd.includes(v));
        const x = chooseItem('transliterate', 'char', code, { glyph: ch, track: 'r', prompt: ch, promptAs: 'word', ask: `Its reading in ${X.lex[id].lemma} (${glossOf(C, code, id)})?`, answer: ans, wrong, optionsAs: 'latin', why: `${ch}: ${rd.join(', ')} — ${e.meaning || ''}` }, rng);
        if (x) out.push(x);
      }
      return out;
    },
    vowelize(ctx) {
      const { C, code } = ctx, M = scriptModule(C, code); if (!M || M.kind !== 'letters' || !C.lang[code].language.vowelMarks) return [];
      const out = [], palette = M.marks;
      for (const id of scriptWords(C, ctx.L, code, ctx.k)) {
        const lx = C.lang[code].lex[id], cl = letterClusters(C, code, lx.lemma);
        if (cl.filter(c => !c.sep).length < 2 || cl.some(c => c.marks.some(m => !palette.includes(m)))) continue;
        out.push({ type: 'vowelize', kind: 'vowelize', lang: code, lex: id, prompt: glossOf(C, code, id), text: nfc(lx.lemma), letters: cl.map(c => ({ base: c.base, marks: c.marks, sep: !!c.sep })), palette, why: `${lx.lemma} — ${lx.translit || ''}` });
      }
      return out;
    },
    tone_mark(ctx) {
      const { C, code } = ctx, X = C.lang[code]; if (code !== 'zh' && X.language.romanization !== 'pinyin') return [];
      const out = [];
      for (const id of scriptWords(C, ctx.L, code, ctx.k)) {
        const lx = X.lex[id], chars = [...lx.lemma], syl = pinyinSplit(lx.pinyin || ''); if (!syl.length || syl.length !== chars.filter(isHan).length || chars.some(ch => !isHan(ch))) continue;
        const parsed = syl.map(pinyinTone); if (parsed.some(p => typeof p === 'string')) continue;
        const tones = parsed.map(p => p[1]), bases = parsed.map(p => p[0]);
        out.push({ type: 'tone_mark', kind: 'tone_mark', mode: 'written', lang: code, lex: id, prompt: glossOf(C, code, id), chars, bases, answer: tones, why: `${lx.lemma} ${lx.pinyin}` });
        const sp = toneSandhi(chars, tones);
        if (sp) out.push({ type: 'tone_mark', kind: 'tone_mark', mode: 'spoken', lang: code, lex: id, prompt: glossOf(C, code, id), chars, bases, written: tones, answer: sp,
          why: `written ${lx.pinyin}, said ${bases.map((b, i) => withTone(b, sp[i])).join(' ')} (${chars.includes('不') && tones.some((t, i) => chars[i] === '不' && t !== sp[i]) ? '不 before a 4th tone → bú' : '3rd + 3rd → 2nd + 3rd'})` });
      }
      return out;
    },
    char_compose(ctx) {
      const { C, code, rng } = ctx, M = scriptModule(C, code); if (!M || M.kind !== 'chars') return [];
      const out = [], chars = uniqStr(scriptWords(C, ctx.L, code, ctx.k).flatMap(id => [...C.lang[code].lex[id].lemma])).filter(ch => M.items[ch]);
      const allParts = uniqStr(Object.values(M.items).flatMap(e => idsParts(e.ids)));
      const radicals = uniqStr(Object.values(M.items).map(e => e.radical).filter(Boolean));
      for (const ch of chars) {
        const e = M.items[ch], parts = idsParts(e.ids);
        if (parts.length >= 2 && parts.length <= 3 && /^[⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺]/.test(e.ids || '') && parts.every(p => p !== ch)) {   // overlapping parts (⿻) are not built
          const wrong = shuffled(allParts.filter(p => !parts.includes(p)), rng).slice(0, 4);
          out.push({ type: 'char_compose', kind: 'compose', lang: code, glyph: ch, track: 'p', prompt: e.meaning || '', reading: (e.readings || e.wordReadings || [])[0] || '', ids: e.ids, layout: e.ids[0], answer: parts, tiles: shuffled([...parts, ...wrong], rng),
            hint: e.etymology?.hint || '', why: `${ch} = ${e.ids}${e.etymology?.semantic ? ` · meaning from ${e.etymology.semantic}` : ''}${e.etymology?.phonetic ? ` · sound from ${e.etymology.phonetic}` : ''}` });
        }
        if (e.radical && e.radical !== ch) {
          const x = chooseItem('char_compose', 'radical', code, { glyph: ch, track: 'r', prompt: ch, promptAs: 'word', ask: 'Its radical (the part it is filed under in a dictionary)?', answer: e.radical, wrong: shuffled(radicals.filter(r => r !== e.radical && !idsParts(e.ids).includes(r)), rng), optionsAs: 'word', why: `${ch}: radical ${e.radical}${e.meaning ? ' — ' + e.meaning : ''}` }, rng);
          if (x) out.push(x);
        }
      }
      return out;
    },
    trace(ctx) {
      const { C, code } = ctx, M = scriptModule(C, code); if (!M) return [];
      if (M.kind === 'chars') return uniqStr(scriptWords(C, ctx.L, code, ctx.k).flatMap(id => [...C.lang[code].lex[id].lemma])).filter(ch => M.items[ch]?.medians)
        .map(ch => ({ type: 'trace', kind: 'trace', lang: code, glyph: ch, track: 'p', check: 'medians', medians: M.items[ch].medians, prompt: M.items[ch].meaning || '', reading: (M.items[ch].readings || [])[0] || '', why: `${ch}: ${M.items[ch].medians.length} strokes` }));
      const ss = scriptState(C, ctx.L, code, ctx.k);
      return scriptLetters(C, ctx.L, code, ss).filter(k => M.items[k].type === 'letter').map(k => ({ type: 'trace', kind: 'trace', lang: code, glyph: k, track: 'p', check: 'self', prompt: M.items[k].name, reading: M.items[k].translit, why: `${k} — ${M.items[k].name}` }));
    },
    spell(ctx) {
      const { C, code } = ctx, X = C.lang[code];
      return scriptWords(C, ctx.L, code, ctx.k).filter(id => { const lx = X.lex[id]; return (lx.senses || []).length && [...stripMarks(code, lx.lemma)].length <= 24; })
        .map(id => ({ type: 'spell', kind: 'spell', lang: code, lex: id, track: 'p', prompt: glossOf(C, code, id), concept: (X.lex[id].senses || [])[0], answer: X.lex[id].lemma,
          also: uniqStr((X.byConcept[(X.lex[id].senses || [])[0]] || []).filter(o => o !== id).map(o => X.lex[o].lemma)),   // another word for the same idea is right too
          why: `${X.lex[id].lemma}${X.lex[id].translit ? ' — ' + X.lex[id].translit : X.lex[id].pinyin ? ' — ' + X.lex[id].pinyin : ''}` }));
    },
  };
  /** The parts of an IDS description (⿰女子 → [女, 子]); unknown parts (？) are left out. */
  const idsParts = ids => [...(ids || '')].filter(ch => !/[⿰-⿿？]/.test(ch));
  for (const t of Object.keys(GEN_SCRIPT)) GEN[t] = ctx => GEN_SCRIPT[t](ctx).map(x => ({ ...x, fn: ctx.fid })).slice(0, Math.max(ctx.max || 12, 1) * 3);   // as grammar generators: answers count for the function too
  const SCRIPT_TYPES = { ar: ['glyph_form', 'transliterate', 'vowelize', 'trace', 'spell'], he: ['glyph_form', 'transliterate', 'vowelize', 'trace', 'spell'], zh: ['transliterate', 'tone_mark', 'char_compose', 'trace', 'spell'] };
  /** Exercise types of the script lane for a language (§6.1): ar/he letters, zh characters; spell for every language. */
  const scriptTypes = (C, code) => SCRIPT_TYPES[code] || (C.lang[code]?.language.romanization === 'pinyin' ? SCRIPT_TYPES.zh : C.lang[code]?.language.vowelMarks ? SCRIPT_TYPES.ar : ['spell']);
  /** Script items for a language: one type or a mix. opts: {type, k, rng, max = 10} */
  function scriptItems(C, L, code, opts = {}) {
    const rng = opts.rng || Math.random, k = opts.k || known(C, L, code), max = opts.max ?? 10;
    const types = opts.type ? [opts.type] : scriptTypes(C, code);
    const pools = types.map(t => shuffled(GEN_SCRIPT[t] ? GEN_SCRIPT[t]({ C, L, code, k, K: k.R, rng, max }) : [], rng)).filter(p => p.length);
    const out = []; let i = 0;
    while (out.length < max && pools.some(p => p.length)) { const p = pools[i++ % pools.length]; if (p.length) out.push(p.shift()); }
    return out;
  }
  /** The script part of the daily session (§5.5): in the first weeks (ar, he: until the letter stage is complete; zh: six weeks from the
   *  first word) a few items — letters due again, then the next new letters with a first question each, then a drill. → [{intro?, item}] */
  function scriptSession(C, L, code, day, opts = {}) {
    const M = scriptModule(C, code); if (!M) return [];
    const n = opts.n ?? 4, rng = opts.rng || Math.random, k = opts.k || known(C, L, code), ss = scriptState(C, L, code, k), store = L.langs[code]?.script?.items || {};
    const seenDays = Object.values(L.langs[code]?.items || {}).map(it => it.seen).filter(x => x != null);
    const first = seenDays.length ? Math.min(...seenDays) : null;
    if (M.kind === 'chars' ? (first == null || day - first > 42) : ss.complete) return [];
    const out = [];
    const due = Object.entries(store).filter(([, it]) => ['r', 'p'].some(t => it[t] && it[t].due <= day)).map(([key]) => key);
    if (M.kind === 'letters') {
      for (const key of due) { if (out.length >= n) break; const its = scriptItems(C, L, code, { k, rng, max: 30, type: 'transliterate' }).filter(x => x.glyph === key); if (its[0]) out.push({ item: its[0] }); }
      const fresh = ss.groups.filter(g => ss.open.includes(g.id)).flatMap(g => g.items).filter(x => ss.items[x] === 'ready');
      for (const key of fresh) { if (out.length >= n) break; out.push({ intro: key }); }
      if (out.length < n) for (const it of scriptItems(C, L, code, { k, rng, max: n - out.length, type: rng() < 0.5 ? 'glyph_form' : 'transliterate' })) out.push({ item: it });
    } else {
      for (const it of scriptItems(C, L, code, { k, rng, max: n })) out.push({ item: it });
    }
    return out.slice(0, n);
  }

  /* ---------- tracing: a drawn stroke against a stroke median (Make Me a Hanzi, 1024 box, y up) ---------- */
  function resample(pts, n = 16) {
    if (pts.length < 2) return Array(n).fill(pts[0] || [0, 0]);
    const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L0 = d[d.length - 1] || 1, out = [];
    for (let k = 0; k < n; k++) { const t = L0 * k / (n - 1); let i = 1; while (i < d.length - 1 && d[i] < t) i++; const f = (t - d[i - 1]) / ((d[i] - d[i - 1]) || 1); out.push([pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])]); }
    return out;
  }
  /** Is a drawn stroke (points in the same box, y up) this median? Shape, place and direction: the mean distance of the resampled
   *  points under a quarter of the box, and the stroke goes the same way. → {ok, dist, reversed} */
  function strokeMatch(drawn, median, tol = 150) {
    const a = resample(drawn), b = resample(median);
    const dist = a.reduce((s, p, i) => s + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;
    const rev = a.reduce((s, p, i) => s + Math.hypot(p[0] - b[b.length - 1 - i][0], p[1] - b[b.length - 1 - i][1]), 0) / a.length;
    const len = pts => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
    const lenOk = len(b) < 60 || (len(a) > len(b) * 0.35 && len(a) < len(b) * 2.8);
    return { ok: dist <= tol && dist <= rev + 10 && lenOk, dist: Math.round(dist), reversed: rev + 10 < dist };
  }

  API.GEN = GEN;
  Object.assign(API, { scriptModule, letterClusters, glyphPositions, glyphForm, glyphTrackState, introduceGlyph, reviewGlyph, scriptState, needsTranslit, markLevel, fadeMarks, textMarkLevel, toneSandhi, parsePinyin, pinyinCandidates, letterDiff, checkTyped, scriptTypes, scriptItems, scriptSession, strokeMatch, resample, idsParts, ownSegmentation, knownSplit, GEN_SCRIPT });   // P4 — scripts and input
  /* ---------- P5 — Grammar lane: paradigm tables, analysis, morphemes, roots and patterns, agreement, contrasts, roles, glosses, proofreading, joining (§6.3, §6.4, §7.3, §7.5) ----------
     Every answer comes from the course files: the lexemes' forms and features, the bank's tokens and variant pairs. Item types:
       {type:'table'}      paradigm — rows [{cell, label, form, hidden, options, accept}]
       {type:'slots'}      analyze (layout 'rows': one choice per dimension, `combos` = the accepted combinations) · agree · parse · gloss (layout 'inline': one unit per word)
       {type:'proofread'}  units, wrongAt, fix {options, accept}
       {type:'contrast'}   a meaning → one of the sentences of a variant group
       {type:'morph'} / {type:'combine'}   tiles like 'build' (checkBuilt), morph joined without spaces (join: 'none') */
  for (const [t, l] of Object.entries({ JUS: 'jussive', HAB: 'habitual', INT: 'question', CSTR: 'construct state', DIR: 'directional', POS: 'positive' })) if (!(t in TAG_LABEL)) TAG_LABEL[t] = l;
  const POS_OF_TAG = { N: 'NOUN', V: 'VERB', ADJ: 'ADJ', DET: 'DET', PRON: 'PRON', NUM: 'NUM', ADP: 'ADP', PART: 'PART', ADV: 'ADV', CLF: 'CLF' };
  const POS_LABEL = { NOUN: 'noun', PROPN: 'name', VERB: 'verb', AUX: 'auxiliary verb', ADJ: 'adjective', DET: 'determiner / article', PRON: 'pronoun', ADP: 'preposition', ADV: 'adverb',
    PART: 'particle', CCONJ: 'conjunction (and, but …)', SCONJ: 'subordinator (that, because …)', NUM: 'number', CLF: 'measure word', INTJ: 'interjection' };
  const POS_ORDER = Object.keys(POS_LABEL);
  const DIMS = [['Case', ['NOM', 'ACC', 'DAT', 'GEN']], ['Number', ['SG', 'DU', 'PL', 'COLL']], ['Gender', ['MASC', 'FEM', 'NEUT']], ['Person', ['1', '2', '3']],
    ['Definiteness', ['DEF', 'INDF', 'CONST', 'CSTR']], ['Tense', ['PRS', 'PST', 'FUT']], ['Mood', ['IND', 'SBJV', 'JUS', 'JUSS', 'IMP']], ['Aspect', ['PFV', 'IPFV', 'HAB']],
    ['Form', ['NFIN', 'PTCP', 'MSDR']], ['Degree', ['CMPR', 'SPRL']], ['Ending', ['STRG', 'WEAK', 'MIX']], ['Address', ['FORM', 'INFM']], ['Polarity', ['NEG']]];
  const DIM_OF = {}; for (const [d, vs] of DIMS) for (const x of vs) DIM_OF[x] = d;
  const DIM_ORDER = [...DIMS.map(d => d[0]), 'Owner'];
  const DIM_TITLE = { Case: 'Case', Number: 'Number', Gender: 'Gender', Person: 'Person', Definiteness: 'Definiteness', Tense: 'Tense', Mood: 'Mood', Aspect: 'Aspect',
    Form: 'Form', Degree: 'Degree', Ending: 'Ending', Address: 'Address', Polarity: 'Polarity', Owner: 'Owner' };
  const NOT_MARKED = '— (not marked)';
  const GLOSS_ORDER = ['Tense', 'Mood', 'Aspect', 'Form', 'Degree', 'Polarity', 'Person', 'Number', 'Gender', 'Case', 'Definiteness', 'Ending', 'Address', 'Owner'];
  const SKIP_CELL = /(^|;)(PFX|ALT|SEP)(;|$)/;
  const AGREE_DIMS = ['Case', 'Number', 'Gender', 'Person'];
  const AGREE_KEYS = ['Number', 'Gender', 'Definiteness', 'Person', 'Addressee', 'Case'];
  const BANK_TYPES = new Set(['sentence_meaning', 'build_sentence', 'word_order', 'transform', 'agree', 'contrast', 'parse', 'gloss', 'proofread', 'combine', 'morph_build']);
  const P5_TYPES = ['paradigm', 'analyze', 'morph_build', 'root_pattern', 'agree', 'contrast', 'parse', 'gloss', 'proofread', 'combine'];
  const CANON = new WeakMap();   // lexeme → Map(canonical cell → its key in forms), built once
  const keyOf = (lx, cell) => { let m = CANON.get(lx); if (!m) { m = new Map(Object.keys(lx.forms || {}).map(x => [canon(x), x])); CANON.set(lx, m); } return m.get(canon(cell)) || null; };
  const formOf = (lx, cell) => { const k = keyOf(lx, cell); return k ? lx.forms[k] : null; };
  const acceptOf = (lx, key) => uniqStr([lx.forms[key], ...((lx.formsAlt || {})[key] || [])].map(nfc));
  const sameWord = (code, a, b) => stripMarks(code, nfc(a)).toLowerCase() === stripMarks(code, nfc(b)).toLowerCase();
  const shortGloss = g => { const a = String(g || '').replace(/\([^)]*\)/g, ' ').split(/[;,/]/)[0].replace(/\s+/g, ' ').trim(), b = a.replace(/^(to|the|a|an) /i, ''); return b || a; };   // “the (school) holidays” → holidays
  /** What a word means, briefly (the concept's gloss, else its role). */
  const meaningOf = (C, code, l) => { const x = C.lang[code].lex[l]; if (!x) return ''; const c = (x.senses || [])[0]; return shortGloss(c ? C.concepts[c]?.gloss : x.role) || x.lemma; };
  /** The dimension values of a cell → {Case: 'NOM', …} or null when a tag belongs to no dimension (such cells are not analysed). */
  function cellDims(cell) {
    const p = cellParts(canon(cell)).slice(1), out = {}, pss = p.find(t => /^PSS/.test(t));
    for (const t of p) {
      if (t === 'POSS' && pss) continue;
      const d = /^PSS/.test(t) ? 'Owner' : DIM_OF[t];
      if (!d || out[d]) return null;
      out[d] = t;
    }
    return out;
  }
  /** A cell in words, in the order a table reads (person · number · gender · case · definiteness …), not alphabetically. */
  const labelOf = cell => { const p = cellParts(canon(cell)).slice(1); if (p.some(t => t === 'POSS' || /^PSS/.test(t))) return cellLabel(cell); const rk = t => { const i = GLOSS_ORDER.indexOf(DIM_OF[t]); return i < 0 ? 99 : i; }; return p.sort((a, b) => rk(a) - rk(b)).map(t => TAG_LABEL[t] || t).join(' · ') || 'basic form'; };
  const valLabel = t => t == null ? NOT_MARKED : /^PSS/.test(t) ? (OWNER[t.slice(3)] || t.slice(3)) : (TAG_LABEL[t] || t);
  /** The known words a drill may use (the same filters as inflect: pos, class, lemmas, exclude, concepts). */
  function drillLexemes(X, gen, K, rng) {
    return shuffled(Object.values(X.lex).filter(lx => K.has(lx.id) && (!gen.pos || lx.pos === gen.pos) && (!gen.class || lx.class === gen.class) && (!gen.lemmas || gen.lemmas.includes(lx.id))
      && !(gen.exclude || []).includes(lx.id) && (!gen.concepts || (lx.senses || []).some(c => gen.concepts.some(p => c.startsWith(p)))) && !(lx.separable && !gen.lemmas)), rng);
  }
  const capOf = ctx => Math.max(30, (ctx.max || 12) * 3);
  /** The words of a sentence one by one: prefixed words split into their parts; punctuation kept ({p:true}). */
  function sentenceUnits(C, code, s) {
    const X = C.lang[code], cache = X._units || (X._units = new Map());
    if (s.id && cache.has(s.id)) return cache.get(s.id);
    const out = [];
    (s.tokens || []).forEach((k, ti) => {
      if (k.p) { out.push({ t: k.t, p: true, tok: ti }); return; }
      if (k.parts) { k.parts.forEach((q, j) => out.push({ t: q.t, l: q.l || null, f: q.f || null, name: !!q.name, tok: ti, pre: j < k.parts.length - 1, pos: unitPos(X, q) })); return; }
      out.push({ t: k.t, l: k.l || null, f: k.f || null, name: !!k.name, tok: ti, pos: unitPos(X, k) });
    });
    if (s.id) cache.set(s.id, out);
    return out;
  }
  function unitPos(X, k) { if (k.name) return 'PROPN'; const lx = X.lex[k.l]; if (lx?.pos && lx.pos !== 'NOUN' && lx.pos !== 'VERB') return lx.pos; return (k.f && POS_OF_TAG[cellParts(k.f)[0]]) || lx?.pos || null; }
  /** The gloss of one word: its meaning + the tags of its cell (carrot.ACC.SG), Leipzig style. */
  function unitGloss(C, code, u, cell) {
    const f = cell === undefined ? u.f : cell, rk = t => { const i = GLOSS_ORDER.indexOf(/^PSS/.test(t) ? 'Owner' : DIM_OF[t]); return i < 0 ? 99 : i; };
    const tags = f ? cellParts(canon(f)).slice(1).filter(t => !['PFX', 'ALT', 'POSS'].includes(t)).sort((a, b) => rk(a) - rk(b)) : [];
    return meaningOf(C, code, u.l) + (tags.length ? '.' + tags.join('.') : '');
  }
  const unknownOf = (s, K) => s.req.filter(l => !K.has(l));
  const fits = (s, K, U) => unknownOf(s, K).length <= (U === 'auto' ? s.cap : 0);
  /** Variant groups of a language: original id → [original, variants …] (cached). */
  function variantGroups(X) {
    if (X._groups) return X._groups;
    const g = {}; for (const s of X.sentences) if (s.variantOf && X.sentenceById[s.variantOf]) (g[s.variantOf] = g[s.variantOf] || [X.sentenceById[s.variantOf]]).push(s);
    return (X._groups = g);
  }
  const lemmaKey = k => k.l || (k.parts || []).map(p => p.l || p.t).join('+') || (k.name ? 'name:' + k.t : k.t);
  const wordToks = s => (s.tokens || []).map((k, i) => ({ k, i })).filter(x => !x.k.p);

  /* paradigm: a known word's table, cells hidden by how far the function is (new → a third, practising → half, solid → all but one, mastered → all) */
  GEN.paradigm = ctx => {
    const { C, L, code, fid, g, gen, K, rng } = ctx, X = C.lang[code], out = [];
    const share = { new: 0.34, practicing: 0.5, solid: 0.75, mastered: 1 }[functionState(C, L, code, fid)] || 0.34;
    const base = gen.cells || g.paradigmCells || null;
    for (const lx of drillLexemes(X, gen, K, rng)) {
      if (out.length >= capOf(ctx)) break;
      const keys = Object.keys(lx.forms || {}).filter(c => !SKIP_CELL.test(c));
      let rows = base ? keys.filter(c => base.some(b => canon(b) === canon(c))) : [];
      if (rows.length < 3) rows = keys.slice(0, 12);
      if (rows.length < 2) continue;
      const forms = uniqStr(rows.map(c => nfc(lx.forms[c])));
      if (forms.length < 2) continue;
      const n = rows.length, nh = Math.min(n, Math.max(1, Math.round(n * share)));
      const lemmaRow = rows.find(c => nfc(lx.forms[c]) === nfc(lx.lemma));
      const order = shuffled(rows, rng).sort((a, b) => (a === lemmaRow ? 1 : 0) - (b === lemmaRow ? 1 : 0));   // the lemma's cell is hidden last
      const hide = new Set(order.slice(0, nh));
      const extra = uniqStr(Object.keys(lx.forms).filter(c => !SKIP_CELL.test(c) && !rows.includes(c)).map(c => nfc(lx.forms[c]))).filter(f => !forms.includes(f));
      const pool = uniqStr([...forms, ...shuffled(extra, rng).slice(0, 1)]);
      const optsFor = c => shuffled(uniqStr([nfc(lx.forms[c]), ...shuffled(pool.filter(f => !acceptOf(lx, c).includes(f)), rng).slice(0, 5)]), rng);   // the answer + five others
      out.push({ type: 'table', kind: 'paradigm', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: `Fill in the table of ${lx.lemma}`,
        rows: rows.map(c => ({ cell: canon(c), label: labelOf(c), form: lx.forms[c], hidden: hide.has(c), ...(hide.has(c) ? { options: optsFor(c), accept: acceptOf(lx, c) } : {}) })),
        why: rows.map(c => `${labelOf(c)}: ${lx.forms[c]}`).join(' · ') });
    }
    return out;
  };
  /* analyze: a form → one choice per dimension that varies in the word's table; every cell with that form is accepted */
  GEN.analyze = ctx => {
    const { C, code, fid, g, gen, K, rng } = ctx, X = C.lang[code], out = [];
    const base = gen.cells || g.paradigmCells || null;
    for (const lx of drillLexemes(X, gen, K, rng)) {
      if (out.length >= capOf(ctx)) break;
      const all = Object.keys(lx.forms || {}).filter(c => !SKIP_CELL.test(c)).map(c => ({ key: c, cell: canon(c), dims: cellDims(c), form: nfc(lx.forms[c]), accept: acceptOf(lx, c) })).filter(x => x.dims);
      const uni = base && all.filter(x => base.some(b => canon(b) === x.cell)).length >= 2 ? all.filter(x => base.some(b => canon(b) === x.cell)) : all;
      if (uni.length < 2) continue;
      const dims = DIM_ORDER.filter(d => new Set(uni.map(x => x.dims[d] || null)).size > 1);
      if (!dims.length) continue;
      const fixed = DIM_ORDER.filter(d => !dims.includes(d) && uni[0].dims[d]).map(d => valLabel(uni[0].dims[d]));
      const done = new Set();
      for (const x of shuffled(uni, rng)) {
        if (done.has(x.form)) continue; done.add(x.form);
        const matches = uni.filter(o => o.accept.includes(x.form));
        const units = dims.map(d => {
          const vals = DIMS.find(z => z[0] === d)?.[1] || [], present = uniqStr(uni.map(o => o.dims[d] || null).map(String));
          const ordered = present.sort((a, b) => (a === 'null' ? 99 : vals.indexOf(a) < 0 ? 50 : vals.indexOf(a)) - (b === 'null' ? 99 : vals.indexOf(b) < 0 ? 50 : vals.indexOf(b)));
          return { label: DIM_TITLE[d], slot: { options: ordered.map(v => valLabel(v === 'null' ? null : v)), answer: uniqStr(matches.map(m => valLabel(m.dims[d]))) } };
        });
        out.push({ type: 'slots', kind: 'analyze', layout: 'rows', fn: fid, lang: code, lex: lx.id, prompt: lx.forms[x.key], ask: `Which form of ${lx.lemma} is it?`, fixed: fixed.join(' · '),
          units, combos: matches.map(m => dims.map(d => valLabel(m.dims[d]))), why: `${lx.forms[x.key]} = ${matches.map(m => labelOf(m.cell)).join(' or ')} of ${lx.lemma}` });
      }
    }
    return out;
  };
  /* morph_build: prefix + word (the bank's parts), Arabic stem + owner suffix (the pronoun's suffix) → the word */
  GEN.morph_build = ctx => {
    const { C, code, fid, gen, K, rng } = ctx, X = C.lang[code], out = [], seen = new Set(), U = ctx.U;
    const prefixes = uniqStr(X.prefixes.map(p => p.t));
    for (const s of ctx.bank()) {
      if (out.length >= capOf(ctx)) break;
      for (const k of s.tokens || []) {
        if (!k.parts || k.parts.some(q => q.name || !q.l || !K.has(q.l)) || seen.has(nfc(k.t))) continue;
        if (nfc(k.parts.map(q => q.t).join('')) !== nfc(k.t)) continue;
        seen.add(nfc(k.t));
        const host = k.parts[k.parts.length - 1], hx = X.lex[host.l];
        const otherPre = shuffled(prefixes.filter(p => !k.parts.some(q => nfc(q.t) === nfc(p))), rng).slice(0, 1);
        const otherForm = shuffled(Object.entries(hx.forms || {}).filter(([c, f]) => !SKIP_CELL.test(c) && !sameWord(code, f, host.t)).map(([, f]) => f), rng).slice(0, 1);
        const pieces = k.parts.map(q => q.t);
        out.push({ type: 'morph', kind: 'morph', fn: fid, lang: code, lex: host.l, join: 'none', pieces, tiles: shuffled(uniqStr([...pieces, ...otherPre, ...otherForm]), rng), size: pieces.length,
          answers: [k.t], punct: '', gloss: k.parts.map(q => unitGloss(C, code, q)).join(' + '), why: `${pieces.join(' + ')} → ${k.t}` });
      }
    }
    // Arabic: a possessed form = the stem + the owner's suffix (from the pronoun's `suffix`)
    const sufs = Object.values(X.lex).filter(x => x.pos === 'PRON' && typeof x.suffix === 'string').map(x => nfc(x.suffix.split(/[,(]/)[0].replace(/ـ/g, '').trim())).filter(Boolean);
    if (sufs.length >= 2 && (gen.suffixes || /possess|suffix|pronoun/.test(fid))) for (const lx of drillLexemes(X, { pos: 'NOUN' }, K, rng)) {
      if (out.length >= capOf(ctx) * 2) break;
      for (const [c, f] of Object.entries(lx.forms || {})) {
        const pss = cellParts(c).find(t => /^PSS/.test(t)); if (!pss || SKIP_CELL.test(c) || seen.has(nfc(f))) continue;
        const suf = sufs.filter(x => nfc(f).endsWith(x)).sort((a, b) => b.length - a.length)[0]; if (!suf) continue;
        const stem = nfc(f).slice(0, -suf.length); if (!stem) continue;
        seen.add(nfc(f));
        const tiles = shuffled(uniqStr([stem, suf, ...shuffled(sufs.filter(x => x !== suf), rng).slice(0, 2), ...(nfc(lx.lemma) !== stem && !nfc(lx.lemma).includes(' ') ? [nfc(lx.lemma)] : [])]), rng);
        out.push({ type: 'morph', kind: 'morph', fn: fid, lang: code, lex: lx.id, join: 'none', pieces: [stem, suf], tiles, size: 2, answers: [f], punct: '',
          gloss: `${lx.lemma} + ${valLabel(pss)}`, why: `${stem} + ${suf} → ${f} (${cellLabel(c)})` });
      }
    }
    return out;
  };
  /* root_pattern: root × pattern → word; word → root; word → pattern (Arabic and Hebrew; verbs: the verb form / binyan) */
  const rootOf = x => typeof x.root === 'string' && x.root.trim() ? x.root : null;
  const patternOf = x => typeof x.pattern === 'string' && x.pattern.trim() ? x.pattern : typeof x.verbForm === 'string' ? 'Form ' + x.verbForm : typeof x.binyan === 'string' ? x.binyan : null;
  GEN.root_pattern = ctx => {
    const { C, code, fid, gen, K, rng } = ctx, X = C.lang[code], out = [];
    const all = Object.values(X.lex).filter(x => rootOf(x) && patternOf(x) && (!gen.pos || x.pos === gen.pos));
    const knownAll = all.filter(x => K.has(x.id));
    const pickFrom = (cands, n) => { const kn = shuffled(cands.filter(x => K.has(x.id)), rng), un = shuffled(cands.filter(x => !K.has(x.id)), rng); return [...kn, ...un].slice(0, n); };
    const modes = gen.mode ? [gen.mode] : ['build', 'root', 'pattern'];
    for (const lx of drillLexemes(X, { ...gen, pos: gen.pos }, K, rng)) {
      if (out.length >= capOf(ctx)) break;
      const r = rootOf(lx), p = patternOf(lx); if (!r || !p) continue;
      const lem = nfc(lx.lemma), unknown = [];
      for (const mode of modes) {
        let options, answer, ask, prompt, why;
        if (mode === 'build') {
          const d = pickFrom(all.filter(x => x.id !== lx.id && nfc(x.lemma) !== lem && (rootOf(x) === r || patternOf(x) === p)), 3);
          const more = d.length < 2 ? pickFrom(all.filter(x => x.id !== lx.id && nfc(x.lemma) !== lem && !d.includes(x) && x.pos === lx.pos), 3 - d.length) : [];
          const ds = [...d, ...more]; if (ds.length < 2) continue;
          ds.forEach(x => { if (!K.has(x.id)) unknown.push(x.id); });
          options = uniqStr([lx.lemma, ...ds.map(x => x.lemma)]); answer = lx.lemma; ask = 'Root × pattern — which word?'; prompt = `${r} + ${p}`; why = `${r} + ${p} → ${lx.lemma} (${meaningOf(C, code, lx.id)})`;
        } else if (mode === 'root') {
          const letters = new Set(r.split(/\s+/));
          const roots = uniqStr(all.map(rootOf).filter(x => x !== r)).sort((a, b) => b.split(/\s+/).filter(z => letters.has(z)).length - a.split(/\s+/).filter(z => letters.has(z)).length || (rng() - 0.5));
          if (roots.length < 2) continue;
          options = [r, ...roots.slice(0, 3)]; answer = r; ask = 'Its root?'; prompt = lx.lemma; why = `${lx.lemma}: root ${r}, pattern ${p}`;
        } else {
          const pats = shuffled(uniqStr(all.filter(x => x.pos === lx.pos).map(patternOf).filter(x => x !== p)), rng);
          if (pats.length < 2) continue;
          options = [p, ...pats.slice(0, 3)]; answer = p; ask = 'Its pattern?'; prompt = lx.lemma; why = `${lx.lemma}: pattern ${p}, root ${r}`;
        }
        out.push({ type: 'choose', kind: 'root', mode, fn: fid, lang: code, lex: lx.id, prompt, ask, options: shuffled(uniqStr(options), rng), answer, why, unknown: mode === 'build' ? uniqStr(unknown) : [] });
      }
    }
    return knownAll.length ? out : [];
  };
  /* agree: an original and its variant that differ in ≥ 2 aligned words — the first changed noun / pronoun is given, the learner updates the rest */
  GEN.agree = ctx => {
    const { C, code, fid, gen, K, rng, U } = ctx, X = C.lang[code], out = [], want = gen.bank?.variant;
    for (const s2 of shuffled(ctx.bank(), rng)) {
      if (out.length >= capOf(ctx)) break;
      if (!s2.variantOf || !Object.keys(s2.variant || {}).some(k => AGREE_KEYS.includes(k)) || (want && !(want in (s2.variant || {})))) continue;
      const s1 = X.sentenceById[s2.variantOf]; if (!s1 || !fits(s1, K, U)) continue;
      const w1 = wordToks(s1), w2 = wordToks(s2);
      if (w1.length !== w2.length || w1.some((a, i) => lemmaKey(a.k) !== lemmaKey(w2[i].k))) continue;
      const changed = w1.map((a, i) => nfc(a.k.t) !== nfc(w2[i].k.t));
      if (changed.filter(Boolean).length < 2) continue;
      const posAt = i => unitPos(X, w1[i].k.parts ? w1[i].k.parts[w1[i].k.parts.length - 1] : w1[i].k);   // the noun is given (else a pronoun): the rest agrees with it
      let tr = changed.findIndex((c, i) => c && posAt(i) === 'NOUN'); if (tr < 0) tr = changed.findIndex((c, i) => c && ['PRON', 'PROPN'].includes(posAt(i))); if (tr < 0) tr = changed.indexOf(true);
      const units = []; let nslots = 0;
      for (const [ti, k] of (s1.tokens || []).entries()) {
        if (k.p) { units.push({ t: k.t, p: true }); continue; }
        const wi = w1.findIndex(x => x.i === ti), k2 = w2[wi].k;
        if (wi === tr) { units.push({ t: k2.t, from: k.t, l: k.l || null, trigger: true }); continue; }
        const lx = k.l && X.lex[k.l];
        const others = lx && k.f ? shuffled(Object.entries(lx.forms || {}).filter(([c, f]) => !SKIP_CELL.test(c) && !sameWord(code, f, k.t) && !sameWord(code, f, k2.t)).map(([, f]) => f), rng).slice(0, 2) : [];
        if (!changed[wi] && !others.length) { units.push({ t: k.t, l: k.l || null }); continue; }
        const key2 = lx && k2.f ? keyOf(lx, k2.f) : null;
        units.push({ t: k.t, l: k.l || null, slot: { options: shuffled(uniqStr([k.t, k2.t, ...others]), rng), answer: key2 ? uniqStr([k2.t, ...acceptOf(lx, key2)]) : [k2.t], value: k.t } });
        nslots++;
      }
      if (!nslots) continue;
      const un = uniqStr([...unknownOf(s2, K), ...unknownOf(s1, K)]);
      out.push({ type: 'slots', kind: 'agree', layout: 'inline', fn: fid, lang: code, sentence: s2.id, sentences: [s1.id, s2.id], source: s1.text, sourceGloss: s1.gloss, gloss: s2.gloss,
        change: variantLabel(s2.variant), ask: `${variantLabel(s2.variant)}: ${w1[tr].k.t} → ${w2[tr].k.t}. Change the words that agree with it.`, units, why: s2.text, unknown: un });
    }
    return out;
  };
  /* contrast: a meaning → which sentence of one variant group (minimal pairs) says it, with what separates them */
  const variantWords = v => Object.entries(v || {}).map(([k, x]) => TAG_LABEL[x] || TAG_LABEL[String(x).toUpperCase()] || `${k}: ${x}`).join(', ');
  GEN.contrast = ctx => {
    const { C, code, fid, gen, K, rng, U } = ctx, X = C.lang[code], out = [], groups = variantGroups(X), want = gen.bank?.variant, seen = new Set();
    for (const s of shuffled(ctx.bank(), rng)) {
      if (out.length >= capOf(ctx)) break;
      const gid = s.variantOf || (groups[s.id] ? s.id : null); if (!gid || seen.has(gid)) continue; seen.add(gid);
      const grp = (groups[gid] || []).filter(x => fits(x, K, U) && (!want || x === groups[gid][0] || want in (x.variant || {})));
      if (grp.length < 2) continue;
      for (const t of grp) {
        if (grp.some(o => o !== t && (o.gloss === t.gloss || nfc(o.text) === nfc(t.text)))) continue;   // the meaning must tell them apart
        const others = grp.filter(o => o !== t);
        out.push({ type: 'contrast', kind: 'contrast', fn: fid, lang: code, sentence: t.id, sentences: grp.map(x => x.id), prompt: t.gloss, ask: 'Which sentence says this?',
          options: shuffled(uniqStr(grp.map(x => x.text)), rng), answer: t.text,
          why: `${t.text} — ${t.variant ? variantWords(t.variant) : 'the starting sentence'}` + others.map(o => ` · ${o.text} = “${o.gloss}”${o.variant ? ' (' + variantWords(o.variant) + ')' : ''}`).join(''),
          unknown: uniqStr(grp.flatMap(x => unknownOf(x, K))) });
      }
    }
    return out;
  };
  /* parse: the case of every case-marked word (languages with case), otherwise the part of speech of every word */
  GEN.parse = ctx => {
    const { C, code, fid, gen, K, rng } = ctx, X = C.lang[code], out = [];
    for (const s of shuffled(ctx.bank(), rng)) {
      if (out.length >= capOf(ctx)) break;
      const us = sentenceUnits(C, code, s);
      const cased = us.filter(u => u.f && cellParts(u.f).some(t => DIM_OF[t] === 'Case'));
      const mode = gen.tags || (new Set(cased.map(u => cellParts(u.f).find(t => DIM_OF[t] === 'Case'))).size >= 2 ? 'case' : 'pos');
      let asked;
      if (mode === 'case') {
        const caseOf = u => cellParts(u.f || '').find(t => DIM_OF[t] === 'Case');
        const all = uniqStr(DIMS[0][1].filter(cs => X._cases ? X._cases.has(cs) : true));
        if (!X._cases) { X._cases = new Set(); for (const lx of Object.values(X.lex)) for (const c of Object.keys(lx.forms || {})) for (const t of cellParts(c)) if (DIM_OF[t] === 'Case') X._cases.add(t); }
        const opts = DIMS[0][1].filter(cs => X._cases.has(cs)).map(cs => TAG_LABEL[cs]);
        if (opts.length < 2) continue;
        asked = us.map(u => !u.p && !u.name && caseOf(u) ? { ...u, slot: { options: opts, answer: [TAG_LABEL[caseOf(u)]] } } : u);
        void all;
      } else {
        const ps = us.filter(u => !u.p && !u.name && u.pos && POS_LABEL[u.pos]);
        if (ps.length < 2) continue;
        const fill = ['NOUN', 'VERB', 'PRON', 'ADJ', 'ADP', 'ADV'];
        const opts = POS_ORDER.filter(p => ps.some(u => u.pos === p) || fill.includes(p)).map(p => POS_LABEL[p]);
        asked = us.map(u => !u.p && !u.name && u.pos && POS_LABEL[u.pos] ? { ...u, slot: { options: opts, answer: [POS_LABEL[u.pos]] } } : u);
      }
      const slots = asked.filter(u => u.slot);
      if (slots.length < 2 || new Set(slots.map(u => u.slot.answer[0])).size < 2) continue;
      out.push({ type: 'slots', kind: 'parse', mode, layout: 'inline', fn: fid, lang: code, sentence: s.id, gloss: s.gloss,
        ask: mode === 'case' ? 'Which case is each marked word in?' : 'Which part of speech is each word?', units: asked.map(stripUnit),
        why: slots.map(u => `${u.t} = ${u.slot.answer[0]}`).join(' · '), unknown: s.unknown });
    }
    return out;
  };
  const stripUnit = u => { const o = { t: u.t }; for (const k of ['p', 'l', 'pre', 'name', 'slot', 'gloss', 'trigger', 'from']) if (u[k]) o[k] = u[k]; return o; };
  /* gloss: the interlinear gloss under every word (meaning + the cell's tags), or the reverse */
  GEN.gloss = ctx => {
    const { C, code, fid, gen, K, rng } = ctx, X = C.lang[code], out = [];
    for (const s of shuffled(ctx.bank(), rng)) {
      if (out.length >= capOf(ctx)) break;
      const us = sentenceUnits(C, code, s), words = us.filter(u => !u.p && !u.name && u.l && X.lex[u.l]);
      if (words.length < 2 || words.length > 9) continue;
      const memo = new Map(), glossOf = u => { if (!memo.has(u)) memo.set(u, unitGloss(C, code, u)); return memo.get(u); };
      const units = us.map(u => {
        if (u.p || u.name || !u.l || !X.lex[u.l]) return stripUnit(u);
        const lx = X.lex[u.l], right = glossOf(u);
        if (gen.reverse) {
          const forms = shuffled(uniqStr([u.t, ...Object.entries(lx.forms || {}).filter(([c, f]) => !SKIP_CELL.test(c) && !sameWord(code, f, u.t)).map(([, f]) => f)]), rng).slice(0, 3);
          const opts = shuffled(uniqStr([u.t, ...forms.filter(f => f !== u.t).slice(0, 2), ...shuffled(words.filter(w => w.l !== u.l).map(w => w.t), rng).slice(0, 1)]), rng);
          return { ...stripUnit(u), gloss: right, slot: { options: opts, answer: [u.t] } };
        }
        const cells = u.f ? shuffled(Object.entries(lx.forms || {}).filter(([c, f]) => !SKIP_CELL.test(c) && !sameWord(code, f, u.t)), rng).slice(0, 2).map(([c]) => glossOf({ ...u, f: c })).filter(x => x !== right) : [];
        const other = shuffled(words.filter(w => w.l !== u.l).map(glossOf), rng);
        const opts = shuffled(uniqStr([right, ...shuffled(cells, rng).slice(0, 1), ...other.slice(0, 2)]).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4), rng);
        if (opts.length < 2) return { ...stripUnit(u), gloss: right };
        return { ...stripUnit(u), slot: { options: opts.includes(right) ? opts : [...opts.slice(0, 3), right], answer: [right] } };
      });
      if (units.filter(u => u.slot).length < 2) continue;
      out.push({ type: 'slots', kind: 'gloss', reverse: !!gen.reverse, layout: 'inline', fn: fid, lang: code, sentence: s.id, gloss: s.gloss,
        ask: gen.reverse ? 'Choose the word for every gloss' : 'Gloss every word (meaning.FEATURES)', units, why: words.map(u => `${u.t} = ${glossOf(u)}`).join(' · '), unknown: s.unknown });
    }
    return out;
  };
  /* proofread: one word replaced by another cell of its own paradigm that breaks agreement with a partner (never another correct sentence) */
  const NOMINAL = new Set(['N', 'PRON', 'DET', 'ADJ', 'NUM']), MODIFIER = new Set(['DET', 'ADJ', 'NUM']);
  function tagsWithGender(X, k) { const p = cellParts(canon(k.f)), lx = X.lex[k.l]; if (lx?.gender && !p.some(t => DIM_OF[t] === 'Gender') && p[0] === 'N') p.push(lx.gender); return p; }
  /** The other cell with one value changed: the same tags with v → v2 (or without a gender, as plural cells often are). */
  function changedCell(lx, cell, v, v2) {
    const p = cellParts(canon(cell)), q = p.includes(v) ? p.map(t => t === v ? v2 : t) : [...p, v2];
    for (const c of [q, q.filter(t => DIM_OF[t] !== 'Gender')]) { const k = keyOf(lx, c.join(';')); if (k) return k; }
    return null;
  }
  function errorsOf(C, code, s, rng) {
    const X = C.lang[code], cache = X._errs || (X._errs = new Map());
    if (!cache.has(s.id)) cache.set(s.id, findErrors(C, code, s));
    return cache.get(s.id).map(e => e.clfs ? { ...e, wrong: e.clfs[Math.floor(rng() * e.clfs.length)] } : e);
  }
  function findErrors(C, code, s) {
    const X = C.lang[code], toks = s.tokens || [], out = [];
    const isW = k => k && !k.p && !k.parts && !k.name && k.l && k.f && X.lex[k.l]?.forms;
    toks.forEach((T, i) => {
      if (!isW(T) || SKIP_CELL.test(T.f)) return;
      const lx = X.lex[T.l], tKey = keyOf(lx, T.f); if (!tKey) return;
      const tp = cellParts(canon(T.f)), catT = tp[0], accept = uniqStr([nfc(T.t), ...acceptOf(lx, tKey)]);
      const cap = X.language.capitalizeFirst && i === toks.findIndex(k => !k.p) && T.t !== decapFirst(T.t) ? capFirst : x => x;   // the first word keeps its capital
      for (const d of AGREE_DIMS) {
        const v = tp.find(t => DIM_OF[t] === d); if (!v) continue;
        for (const v2 of (DIMS.find(z => z[0] === d)[1]).filter(x => x !== v)) {
          const k2 = changedCell(lx, T.f, v, v2); if (!k2 || SKIP_CELL.test(k2)) continue;
          const wrong = cap(lx.forms[k2]); if (accept.some(a => sameWord(code, a, wrong))) continue;
          // a partner whose form would have to change too
          let partner = null;
          toks.forEach((P, j) => {
            if (partner || j === i || !isW(P)) return;
            const pp = tagsWithGender(X, P), catP = pp[0], dist = Math.abs(i - j);
            const between = toks.slice(Math.min(i, j) + 1, Math.max(i, j));
            const np = NOMINAL.has(catT) && NOMINAL.has(catP) && (MODIFIER.has(catT) || MODIFIER.has(catP)) && dist <= 2 && between.every(b => isW(b) && MODIFIER.has(cellParts(b.f)[0]))
              && (!pp.some(t => DIM_OF[t] === 'Case') || !tp.some(t => DIM_OF[t] === 'Case') || pp.find(t => DIM_OF[t] === 'Case') === tp.find(t => DIM_OF[t] === 'Case'));
            const subj = (catT === 'V' && ['PRON', 'N'].includes(catP) || catP === 'V' && ['PRON', 'N'].includes(catT)) && dist <= 3 && (() => {
              const nomTags = catT === 'V' ? pp : tp, hasCase = nomTags.some(t => DIM_OF[t] === 'Case');
              return hasCase ? nomTags.includes('NOM') : (catT === 'V' ? j < i : i < j);   // without case: the subject comes before its verb
            })();
            if (!np && !subj) return;
            if (!pp.includes(v)) return;
            const plx = X.lex[P.l];
            if (!cellParts(canon(P.f)).includes(v)) { if (d === 'Gender' && catP === 'N') partner = P; return; }   // a noun's own gender cannot follow
            const pk = changedCell(plx, P.f, v, v2); if (!pk) return;
            if (!sameWord(code, plx.forms[pk], P.t)) partner = P;
          });
          if (partner) out.push({ i, wrong, right: T.t, accept, why: `${labelOf(T.f)}, to agree with ${partner.t}` });
        }
      }
    });
    // Chinese: a measure word the noun does not take
    const clfs = Object.values(X.lex).filter(x => x.pos === 'CLF').map(x => x.lemma);
    toks.forEach((T, i) => {
      if (T.p || !T.l || X.lex[T.l]?.pos !== 'CLF') return;
      const nk = toks.slice(i + 1, i + 3).find(k => k.l && X.lex[k.l]?.pos === 'NOUN'), noun = nk && X.lex[nk.l];
      if (!noun || !(noun.measure || []).length || !noun.measure.includes(T.t)) return;
      const bad = clfs.filter(m => !noun.measure.includes(m) && m !== '个' && m !== T.t);
      if (bad.length) out.push({ i, clfs: bad, right: T.t, accept: [T.t, ...noun.measure.filter(m => m !== T.t)], why: `${noun.lemma} takes ${noun.measure.join(' / ')}` });
    });
    return out;
  }
  GEN.proofread = ctx => {
    const { C, code, fid, K, rng } = ctx, X = C.lang[code], out = [];
    const texts = X._texts || (X._texts = new Set(X.sentences.flatMap(s => [s.text, ...(s.alts || [])]).map(t => cmpText(code, t))));
    for (const s of shuffled(ctx.bank(), rng)) {
      if (out.length >= capOf(ctx)) break;
      const errs = shuffled(errorsOf(C, code, s, rng), rng);
      for (const e of errs) {
        const units = (s.tokens || []).map((k, i) => k.p ? { t: k.t, p: true } : { t: i === e.i ? e.wrong : k.t, ...(k.l ? { l: k.l } : {}) });
        const text = joinTokens(units.map(u => ({ t: u.t, p: u.p })), X.language.tokenJoin);
        if (texts.has(cmpText(code, text))) continue;   // the "error" is another stored sentence: not an error
        const lx = s.tokens[e.i].l && X.lex[s.tokens[e.i].l];
        const capF = X.language.capitalizeFirst && e.i === (s.tokens || []).findIndex(k => !k.p) && e.right !== decapFirst(e.right) ? capFirst : x => x;
        const more = lx?.forms ? shuffled(Object.values(lx.forms).filter(f => !sameWord(code, f, e.right) && !sameWord(code, f, e.wrong)), rng).slice(0, 1).map(capF) : [];
        out.push({ type: 'proofread', kind: 'proofread', fn: fid, lang: code, sentence: s.id, gloss: s.gloss, units, wrongAt: e.i,
          fix: { options: shuffled(uniqStr([e.right, e.wrong, ...more]), rng), accept: uniqStr(e.accept.map(nfc)) }, why: `${e.wrong} → ${e.right}: ${e.why}`, unknown: s.unknown });
        break;
      }
    }
    return out;
  };
  /* combine: a sentence with one connector whose two clauses are, word for word, two other bank sentences */
  const CONNECTOR = new Set(['CCONJ', 'SCONJ']);
  const wordKey = (code, ws) => ws.map(w => nfc(w).toLowerCase()).sort().join('\u0001');
  function clauseIndex(C, code) {
    const X = C.lang[code]; if (X._clauses) return X._clauses;
    const m = new Map();
    for (const s of X.sentences) { const key = wordKey(code, sentenceUnits(C, code, s).filter(u => !u.p).map(u => u.t)); (m.get(key) || m.set(key, []).get(key)).push(s); }
    return (X._clauses = m);
  }
  GEN.combine = ctx => {
    const { C, code, fid, K, rng, U } = ctx, X = C.lang[code], out = [], idx = clauseIndex(C, code);
    for (const s of shuffled(ctx.bank(), rng)) {
      if (out.length >= capOf(ctx)) break;
      const us = sentenceUnits(C, code, s), conn = us.filter(u => !u.p && u.l && CONNECTOR.has(X.lex[u.l]?.pos));
      if (conn.length !== 1) continue;
      const ci = us.indexOf(conn[0]), words = (a, b) => us.slice(a, b).filter(u => !u.p).map(u => u.t);
      let A, B;
      if (!us.slice(0, ci).some(u => !u.p)) {   // the clause with the connector comes first: … , main clause
        const comma = us.findIndex((u, i) => i > ci && u.p && /^[,،，、]$/.test(u.t)); if (comma < 0) continue;
        A = words(ci + 1, comma); B = words(comma + 1, us.length);
      } else { A = words(0, ci); B = words(ci + 1, us.length); }
      if (!A.length || !B.length) continue;
      const find = ws => (idx.get(wordKey(code, ws)) || []).find(x => x.id !== s.id && fits(x, K, U));
      const pa = find(A), pb = find(B); if (!pa || !pb || pa.id === pb.id) continue;
      const tiles = sentenceTiles(s), wt = wrongTile(C, code, s, rng);
      out.push({ type: 'combine', kind: 'combine', fn: fid, lang: code, sentence: s.id, sentences: [pa.id, pb.id, s.id], sources: [pa.text, pb.text], sourceGlosses: [pa.gloss, pb.gloss],
        connector: conn[0].t, connectorGloss: meaningOf(C, code, conn[0].l), gloss: s.gloss, tiles: shuffled(wt ? [...tiles, wt] : tiles, rng), size: tiles.length,
        answers: [s.text, ...(s.alts || [])], punct: endPunct(s), why: s.text, unknown: uniqStr([...s.unknown, ...unknownOf(pa, K), ...unknownOf(pb, K)]) });
    }
    return out;
  };

  /** The P5 types a function gets on top of its listed generators where its data allows (§6.7 “offered automatically”). */
  function autoGenerators(C, code, fid, have = []) {
    const X = C.lang[code], g = X.grammar[fid], fn = C.functions[fid] || {};
    if (!g || g.status === 'absent' || fn.category === 'overview') return [];
    const types = new Set(have.map(x => x.type)), out = [];
    const byPos = {}; for (const c of g.paradigmCells || []) { const pos = POS_OF_TAG[cellParts(c)[0]]; if (pos) (byPos[pos] = byPos[pos] || []).push(c); }
    for (const [pos, cells] of Object.entries(byPos)) { if (!types.has('paradigm')) out.push({ type: 'paradigm', pos, cells, auto: true }); if (!types.has('analyze')) out.push({ type: 'analyze', pos, cells, auto: true }); }
    if (X.sentences.some(s => (s.functions || []).includes(fid)))
      for (const t of ['agree', 'contrast', 'parse', 'gloss', 'proofread', 'combine', 'morph_build']) if (!types.has(t)) out.push({ type: t, auto: true });
    if (/root|pattern|derivation|word\.formation/.test(fid) && !types.has('root_pattern') && Object.values(X.lex).some(x => rootOf(x) && patternOf(x))) out.push({ type: 'root_pattern', auto: true });
    return out;
  }
  /** Is a slots item right? values: the chosen value of every slot, in order → {ok, wrong: [slot indexes]} */
  function checkSlots(item, values) {
    const slots = (item.units || []).filter(u => u.slot);
    if (item.combos) {
      const score = combo => combo.filter((v, i) => v === values[i]).length, best = item.combos.slice().sort((a, b) => score(b) - score(a))[0];
      const wrong = best.map((v, i) => v === values[i] ? -1 : i).filter(i => i >= 0);
      return { ok: !wrong.length, wrong };
    }
    const wrong = slots.map((u, i) => u.slot.answer.some(a => nfc(a) === nfc(values[i] ?? '')) ? -1 : i).filter(i => i >= 0);
    return { ok: !wrong.length, wrong };
  }
  /** Is a filled table right? values: the chosen form of every hidden row, in order */
  function checkTable(item, values) {
    const hid = item.rows.filter(r => r.hidden);
    const wrong = hid.map((r, i) => r.accept.includes(nfc(values[i] ?? '')) ? -1 : i).filter(i => i >= 0);
    return { ok: !wrong.length, wrong };
  }
  /** Proofreading: the word tapped and the fix chosen → {found, fixed, ok} */
  function checkProofread(item, at, fix) { const found = at === item.wrongAt, fixed = found && item.fix.accept.includes(nfc(fix ?? '')); return { found, fixed, ok: found && fixed }; }

  /** The 📐 grammar lane of one language: the functions of the learner's open lessons (common order) with state and feasibility. */
  const OPEN = new Set(['open', 'learning', 'passed', 'known', 'mastered']);
  function grammarLane(C, L, code, opts = {}) {
    const X = C.lang[code], k = opts.k || known(C, L, code), out = [], seen = new Set();
    const lessons = C.order.filter(nid => C.nodes[nid].kind === 'lesson' && X.applies[nid]);
    const ids = lessons.length ? lessons.filter(nid => OPEN.has(k.nodes[nid])).flatMap(nid => lessonFunctions(C, code, nid).map(f => [f, nid]))
      : Object.keys(C.functions).map(f => [f, null]);   // a course without lessons: every function
    for (const [fid, nid] of ids) {
      if (seen.has(fid) || C.functions[fid]?.category === 'overview') continue; seen.add(fid);
      const g = X.grammar[fid]; if (!g || g.status === 'absent') continue;
      out.push({ fn: fid, title: C.functions[fid]?.title || fid, lesson: nid, state: functionState(C, L, code, fid), feasibility: feasibility(C, L, code, fid, { k, minSentences: opts.minSentences }) });
    }
    return out;
  }
  /** A block of mixed items over several functions of one language (round robin), with the P5 types added where the data allows. */
  function practiceBlock(C, L, code, fids, opts = {}) {
    const k = opts.k || known(C, L, code), rng = opts.rng || Math.random, max = opts.max || 10;
    const pools = fids.map(f => exercises(C, L, code, f, { k, rng, max, auto: opts.auto !== false })).filter(p => p.length);
    const out = []; let i = 0;
    while (out.length < max && pools.some(p => p.length)) { const p = pools[i++ % pools.length]; if (p.length) out.push(p.shift()); }
    return out;
  }
  /** Does an item use one of these words (the words just learned)? */
  const touches = (C, code, it, words) => (it.lex && words.has(it.lex)) || [it.sentence, ...(it.sentences || [])].some(id => id && (C.lang[code].sentenceById[id]?.req || []).some(l => words.has(l)));
  /** §7.5 step 3: one trainable function using the words just learned. words: {code: [lexIds]} → {lang, fn, items, feasibility} | null */
  function sessionGrammar(C, L, opts = {}) {
    const langs = (opts.langs || L.settings.languages || C.languages).filter(c => C.lang[c]), rng = opts.rng || Math.random, max = opts.max || 6;
    let best = null;
    for (const code of langs) {
      const words = new Set((opts.words || {})[code] || []), k0 = known(C, L, code);
      const k = { ...k0, R: new Set([...k0.R, ...words]) };   // the words of this session are learned by the time the grammar comes
      const lane = grammarLane(C, L, code, { k, minSentences: 1 }).filter(x => x.state !== 'mastered' && ['ready', 'thin'].includes(x.feasibility.state)).slice(0, opts.limit || 24);
      for (const x of lane) {
        const items = exercises(C, L, code, x.fn, { k, rng, max: 40, auto: true });
        if (!items.length) continue;
        const hit = items.filter(it => touches(C, code, it, words));
        const score = hit.length * 100 + Math.min(items.length, 20);
        if (!best || score > best.score) best = { score, lang: code, fn: x.fn, feasibility: x.feasibility.state, items: [...hit, ...items.filter(it => !hit.includes(it))].slice(0, max), usesNew: hit.length };
        if (best.usesNew >= max) break;
      }
    }
    return best && { lang: best.lang, fn: best.fn, feasibility: best.feasibility, items: best.items, usesNew: best.usesNew };
  }
  API.GEN = GEN;
  Object.assign(API, { autoGenerators, checkSlots, checkTable, checkProofread, grammarLane, practiceBlock, sessionGrammar, sentenceUnits, P5_TYPES, POS_LABEL });   // P5 — grammar lane
  /* ---------- P5v — Vocabulary depth (the remaining §6.2 types): roots, compounds, semantic splits, collocations, confusables, intensity, register, nuance, connotation, idioms, cloze, senses, origins ----------
     Every item is made from the stored lexemes and their profiles (never written at runtime) and reviews its word: R track, or P where the
     learner picks or completes the word itself. Other course words appear only when the learner has met them. Profile sentences follow D19 /
     §7.1: at most ⌈30 %⌉ unknown words besides the word trained (course words not known yet are marked new, the others outside the course).
     Item kinds (ask and prompt.text: a text or parts like why): {type:'vpick', ask, prompt:{word|text|sentence, tr?, trAfter?, lit?}, options, optLang, answer, why} · {type:'vsort', ask, buckets, cards, why}
     · {type:'vorder', ask, cards (in the right order), why} · {type:'vsteps', prompt, steps:[{ask, options, optLang, answer}], why}; why = [text | {w, lang}]. */
  const DEEP_TYPES = ['root_family', 'compound_split', 'sense_split', 'collocation', 'confusables', 'intensity_scale', 'register_pick', 'nuance_pick', 'connotation', 'idiom_meaning', 'example_cloze', 'sense_pick', 'etymology_link'];
  const DEEP_P = new Set(['sense_split', 'collocation', 'confusables', 'register_pick', 'nuance_pick', 'example_cloze']);   // the learner gives the word: production
  const deepTrack = type => DEEP_P.has(type) ? 'p' : 'r';
  const MET = new Set(['seen', 'learning', 'known_r', 'known_p', 'mastered']);
  const profOf = lx => lx.profile || {};
  const mainSenses = lx => (profOf(lx).senses || []).filter(s => !s.of);
  /** The main sense a sense belongs to (a nuance says `of`). */
  const senseMain = (lx, sid) => { const ss = profOf(lx).senses || []; let s = ss.find(x => x.id === sid); for (let i = 0; s && s.of && i < 5; i++) s = ss.find(x => x.id === s.of); return s || null; };
  const plainOf = (code, s) => stripMarks(code, nfc(s)).toLowerCase().replace(/\s+/g, ' ').trim();
  const regsOf = r => [].concat(r || []).filter(Boolean);
  const deepGlossOf = (C, X, id) => { const c = (X.lex[id].senses || [])[0]; return c ? C.concepts[c]?.gloss || c : X.lex[id].role || ''; };
  const W = (w, lang) => ({ w, lang });
  const firstSentences = (s, max = 260) => { s = String(s || '').trim(); if (s.length <= max) return s; const cut = s.slice(0, max), i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; ')); return (i > 60 ? cut.slice(0, i + 1) : cut) + ' …'; };
  const SCRIPT_MARKS = { Arab: '[\\u064B-\\u0652\\u0670]*', Hebr: '[\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7]*' };
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** Hide words in a text (an explanation that would give the answer away): with or without vowel marks, Latin words whole and in any case. */
  const MASK_RE = new Map();
  const loosePlain = s => stripMarks('he', stripMarks('ar', nfc(s))).toLowerCase();
  function maskWords(text, words, mask = '…') {
    let out = nfc(text); const lp = loosePlain(out);
    const list = uniqStr((words || []).filter(Boolean).map(w => nfc(String(w)).trim()).filter(Boolean)).sort((a, b) => b.length - a.length);
    for (const w0 of list) {
      if (!lp.includes(loosePlain(w0).replace(/\s+/g, ' '))) continue;   // not in the text at all (the cheap test first)
      if (MASK_RE.has(w0)) { const re = MASK_RE.get(w0); if (re) out = out.replace(re, mask); continue; }
      const scr = /\p{Script=Arabic}/u.test(w0) ? 'Arab' : /\p{Script=Hebrew}/u.test(w0) ? 'Hebr' : /\p{Script=Han}/u.test(w0) ? 'Han' : 'Latn';
      const w = scr === 'Arab' ? stripMarks('ar', w0) : scr === 'Hebr' ? stripMarks('he', w0) : w0, n = [...w.replace(/\s/g, '')].length;
      if (scr === 'Latn' && n < 2) { MASK_RE.set(w0, null); continue; }
      const body = [...w].map(ch => (/\s/.test(ch) ? '[\\s\\u05BE-]+' : escRe(ch) + (SCRIPT_MARKS[scr] || ''))).join('');
      const re = scr === 'Han' ? new RegExp(body, 'gu') : (scr === 'Latn' || n < 3) ? new RegExp('(?<![\\p{L}\\p{M}])' + body + '(?![\\p{L}])', 'giu') : new RegExp(body, 'gu');
      MASK_RE.set(w0, re); out = out.replace(re, mask);
    }
    return out;
  }
  /** A profile sentence as a vocabulary item shows it (D19): tokens with the trained word (target: its form, cell, attached prefixes),
   *  course words not known yet (new, with the lexeme for its card) and words outside the course (out); ok when the unknown words besides
   *  the target are at most ⌈30 %⌉ of the words ('auto') or maxUnknown. */
  function deepSentence(C, code, text, lexId, K, maxUnknown = 'auto') {
    const toks = tokenize(C, code, text), out = [], unknown = []; let words = 0, bad = 0, target = -1;
    for (const k of toks) {
      if (k.p) { out.push({ t: k.t, p: k.p }); continue; }
      words++;
      const parts = k.parts || [{ t: k.t, matches: k.matches || [] }];
      const ti = target < 0 ? parts.findIndex(p => (p.matches || []).some(m => m.l === lexId)) : -1;
      if (ti >= 0) {
        const m = parts[ti].matches.find(x => x.l === lexId); target = out.length;
        out.push({ t: k.t, target: true, form: parts[ti].t, cell: m.f || null, pre: parts.slice(0, ti).map(p => p.t).join(''), post: parts.slice(ti + 1).map(p => p.t).join('') });
        continue;
      }
      const ls = parts.map(p => (p.matches || []).map(m => m.l));
      if (ls.some(a => !a.length)) { bad++; out.push({ t: k.t, out: true }); continue; }
      const miss = ls.find(a => !a.some(l => K.has(l)));
      if (miss) { bad++; unknown.push(miss[0]); out.push({ t: k.t, l: miss[0], new: true }); continue; }
      const last = ls[ls.length - 1]; out.push({ t: k.t, l: last.find(l => K.has(l)) || last[0] });
    }
    const cap = maxUnknown === 'auto' ? Math.ceil(UNKNOWN_SHARE * words) : (+maxUnknown || 0);
    return { tokens: out, target, words, unknown: uniqStr(unknown), outside: out.filter(x => x.out).length, cap, ok: bad <= cap };
  }
  /** The tokens with the target replaced by a gap (its attached prefixes stay). */
  const gapped = s => s.tokens.map((k, i) => i === s.target ? { gap: true, pre: k.pre, post: k.post } : k);
  /** Where a compound splits (§6.2 compound_split): the parts of features.compound found from the end of the lemma (the head last; a
   *  linker stays with the part before it: Kranken|pfleger). → {cuts, pieces, head} or null when the parts are not found in the word. */
  function compoundSplit(lx) {
    const comp = Array.isArray(lx.compound) ? lx.compound : Array.isArray(lx.features?.compound) ? lx.features.compound : null;
    if (!comp || comp.length < 2) return null;
    const lem = nfc(lx.lemma), low = lem.toLowerCase(), cuts = []; let end = lem.length;
    for (let i = comp.length - 1; i >= 1; i--) {
      const p = nfc(comp[i].part || '').toLowerCase(); if (!p || !low.slice(0, end).endsWith(p)) return null;
      end -= p.length; if (end <= 0) return null; cuts.unshift(end);
    }
    return { cuts, pieces: [lem.slice(0, cuts[0]), ...cuts.map((c, i) => lem.slice(c, cuts[i + 1] ?? lem.length))], head: comp[comp.length - 1].part };
  }
  const oneEdit = (a, b) => {
    if (a === b) return false; const A = [...a], B = [...b]; if (Math.abs(A.length - B.length) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < A.length && j < B.length) { if (A[i] === B[j]) { i++; j++; continue; } if (++d > 1) return false; if (A.length > B.length) i++; else if (B.length > A.length) j++; else { i++; j++; } }
    return d + (A.length - i) + (B.length - j) <= 1;
  };
  /** Per-language indexes the depth types share (built once): roots, look-alikes, collocation partners, phrases, intensity scales. */
  function deepPools(C, code) {
    const X = C.lang[code]; if (X._deep) return X._deep;
    const P = X._deep = {}, lexes = Object.values(X.lex);
    const lazy = (name, make) => Object.defineProperty(P, name, { configurable: true, get() { const v = make(); Object.defineProperty(P, name, { value: v }); return v; } });   // built when a type first needs it
    P.rootKey = r => stripMarks(code, nfc(r || '')).replace(/[\s\-–.]+/g, ' ').trim();
    P.byRoot = {}; for (const lx of lexes) if (typeof lx.root === 'string' && lx.root.trim()) (P.byRoot[P.rootKey(lx.root)] = P.byRoot[P.rootKey(lx.root)] || []).push(lx.id);
    // look-alikes: one letter apart, the same unvocalized skeleton (ar, he), the same toneless pinyin or one character apart (zh)
    const key = lx => code === 'zh' ? nfc(lx.lemma) : plainOf(code, lx.lemma).replace(/[\s\-]/g, '');
    const py = lx => lx.pinyin ? pinyinMarksToNumbers(lx.pinyin).replace(/[\d\s']/g, '') : null;
    lazy('look', () => { const look = {}; const cand = lexes.filter(lx => (lx.senses || []).length), K1 = cand.map(key), PY = cand.map(py), CH = K1.map(k => [...k]), LEM = cand.map(lx => nfc(lx.lemma));
    for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) {
      if (Math.abs(CH[a].length - CH[b].length) > 1 && !(PY[a] && PY[a] === PY[b])) continue;   // too different in length (the cheap test first)
      const x = cand[a], y = cand[b], kx = K1[a], ky = K1[b]; if (LEM[a] === LEM[b]) continue;
      if ((x.senses || []).some(s => (y.senses || []).includes(s))) continue;   // the same concept: those are contrasts, not look-alikes
      let hit = false;
      if (code === 'zh') { const X1 = CH[a], Y1 = CH[b]; hit = (PY[a] && PY[a] === PY[b]) || (X1.length >= 2 && X1.length === Y1.length && X1.filter((ch, i) => ch !== Y1[i]).length === 1); }
      else hit = kx === ky || (CH[a].length >= (code === 'de' ? 4 : 3) && oneEdit(kx, ky));
      if (hit) { (look[x.id] = look[x.id] || []).push(y.id); (look[y.id] = look[y.id] || []).push(x.id); }
    }
    return look; });
    // collocation partners: the collocation without the word, and on which side of it
    lazy('partners', () => { const partners = [];
    for (const lx of lexes) for (const col of profOf(lx).collocations || []) {
      const s = deepSentence(C, code, col.text, lx.id, new Set(), 99); if (s.target < 0) continue;
      const idx = s.tokens.map((k, i) => (!k.p && i !== s.target) ? i : -1).filter(i => i >= 0); if (!idx.length || idx[idx.length - 1] - idx[0] + 1 !== idx.length) continue;
      const span = s.tokens.slice(idx[0], idx[idx.length - 1] + 1).map(k => ({ t: k.t, p: k.p }));
      const text = joinTokens(span, X.language.tokenJoin);
      partners.push({ lex: lx.id, pos: lx.pos, col: col.text, tr: col.tr || '', text, plain: plainOf(code, text), side: idx[0] < s.target ? 'before' : 'after', n: idx.length, from: idx[0], to: idx[idx.length - 1], s });
    }
    return partners; });
    P.phrases = []; for (const lx of lexes) for (const ph of profOf(lx).phrases || []) if (ph.text && ph.meaning) P.phrases.push({ lex: lx.id, ...ph });
    // intensity scales: words with a strength (1–5) that share a concept or name each other as synonym / antonym
    const withI = lexes.filter(lx => typeof profOf(lx).intensity === 'number'), parent = {};
    const find = id => parent[id] === id ? id : (parent[id] = find(parent[id])); withI.forEach(lx => parent[lx.id] = lx.id);
    const names = lx => new Set([...(profOf(lx).synonyms || []), ...(profOf(lx).antonyms || [])].map(s => plainOf(code, s.word || '')));
    for (const x of withI) for (const y of withI) if (x.id < y.id && ((x.senses || []).some(s => (y.senses || []).includes(s)) || names(x).has(plainOf(code, y.lemma)) || names(y).has(plainOf(code, x.lemma)))) parent[find(x.id)] = find(y.id);
    P.scale = {}; for (const x of withI) (P.scale[find(x.id)] = P.scale[find(x.id)] || []).push(x.id);
    P.scaleOf = id => parent[id] ? P.scale[find(id)].filter(i => i !== id) : [];
    return P;
  }
  /** The words a learner might mix up with this one, with why: the other words of one of its concepts (contrasts) and look-alikes. */
  function confusablesOf(C, code, lexId) {
    const X = C.lang[code], lx = X.lex[lexId], P = deepPools(C, code), out = [];
    for (const c of lx.senses || []) for (const id of X.byConcept[c] || []) if (id !== lexId && !out.some(o => o.lex === id)) out.push({ lex: id, why: 'contrast', concept: c });
    for (const id of P.look[lexId] || []) if (!out.some(o => o.lex === id)) out.push({ lex: id, why: 'lookalike' });
    return out;
  }
  const REG_SITUATION = { formal: 'in a formal letter or an official text', informal: 'talking to family and friends', colloquial: 'chatting with friends', slang: 'in slang, among young people',
    literary: 'in literature', poetic: 'in poetry', technical: 'in a technical or specialist text', honorific: 'speaking respectfully to someone', neutral: 'in everyday neutral speech',
    dated: 'in older texts (dated)', archaic: 'in very old texts (archaic)', humorous: 'as a joke', pejorative: 'to sound disparaging', euphemistic: 'to put it gently (a euphemism)',
    children: 'talking to small children', religious: 'in a religious context', vulgar: 'vulgarly', dialectal: 'in a dialect' };
  /** The generators: DEEP[type](x, lx) → items for one word; x = {C, L, code, X, K (known, for 🆕), M (met), rng, maxUnknown, P (pools)}. */
  const DEEP = {};
  const deepBase = (x, type, lx, more) => ({ deep: true, kind: type, lang: x.code, lex: lx.id, track: deepTrack(type), ...more });
  const pickN = (x, arr, n) => shuffled(arr, x.rng).slice(0, n);
  /** Sort by a score computed once per element (the scores may include a random tie-breaker). */
  const rankBy = (arr, f) => arr.map(v => [f(v), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
  DEEP.root_family = (x, lx) => {
    if (typeof lx.root !== 'string' || !lx.root.trim()) return [];
    const { P, X, code } = x, r = P.rootKey(lx.root), fam = P.byRoot[r] || [], out = [];
    const shared = q => q.split(' ').filter(ch => r.split(' ').includes(ch)).length;
    const wrong = rankBy(shuffled(Object.keys(P.byRoot).filter(q => q !== r), x.rng), q => -shared(q)).slice(0, 3);
    const rootShown = q => X.lex[P.byRoot[q][0]].root.trim();
    const family = fam.filter(id => id !== lx.id && (x.M.has(id) || x.K.has(id)));
    const why = [W(lx.lemma, code), ' — root ', W(lx.root.trim(), code), ...(family.length ? ['. The same root: ', ...family.slice(0, 6).flatMap((id, i) => [i ? ', ' : '', W(X.lex[id].lemma, code), ` (${deepGlossOf(x.C, X, id)})`])] : [])];
    if (wrong.length >= 2) out.push(deepBase(x, 'root_family', lx, { type: 'vpick', ask: 'Its root?', prompt: { word: lx.lemma }, options: shuffled([lx.root.trim(), ...wrong.map(rootShown)], x.rng), optLang: code, answer: lx.root.trim(), why }));
    // sort met words into two families
    const metFam = q => (P.byRoot[q] || []).filter(id => id === lx.id || x.M.has(id));
    const mine = metFam(r);
    if (mine.length >= 2) {
      const other = shuffled(Object.keys(P.byRoot).filter(q => q !== r && metFam(q).length >= 2), x.rng)[0];
      if (other) {
        const cards = [...[lx.id, ...pickN(x, mine.filter(id => id !== lx.id), 2)].map(id => ({ id, bucket: r })), ...pickN(x, metFam(other), 3).map(id => ({ id, bucket: other }))];
        out.push(deepBase(x, 'root_family', lx, { type: 'vsort', ask: 'Sort the words by their root', buckets: [r, other].map(q => ({ id: q, label: rootShown(q), lang: code })),
          cards: shuffled(cards.map(c => ({ ...c, text: X.lex[c.id].lemma, lang: code, lex: c.id, note: deepGlossOf(x.C, X, c.id) })), x.rng),
          why: [r, other].flatMap((q, i) => [i ? ' · ' : '', W(rootShown(q), code), ': ', ...metFam(q).flatMap((id, j) => [j ? ', ' : '', W(X.lex[id].lemma, code)])]) }));
      }
    }
    return out;
  };
  DEEP.compound_split = (x, lx) => {
    const sp = compoundSplit(lx); if (!sp) return [];
    const { X, code } = x, lem = nfc(lx.lemma), n = lem.length, show = cuts => [lem.slice(0, cuts[0]), ...cuts.map((c, i) => lem.slice(c, cuts[i + 1] ?? n))].join('·');
    const right = show(sp.cuts), wrongs = [];
    for (const d of shuffled([-3, -2, -1, 1, 2, 3], x.rng)) {
      const j = Math.floor(x.rng() * sp.cuts.length), cuts = sp.cuts.slice(); cuts[j] += d;
      if (cuts[j] < 2 || cuts[j] > n - 2 || cuts.some((c, i) => i && c <= cuts[i - 1])) continue;
      const s = show(cuts); if (s !== right && !wrongs.includes(s)) wrongs.push(s);
      if (wrongs.length === 3) break;
    }
    if (wrongs.length < 2) return [];
    const head = Object.values(X.lex).find(y => y.id !== lx.id && y.pos === 'NOUN' && nfc(y.lemma) === nfc(sp.head));
    const steps = [{ ask: 'Where does it split?', options: shuffled([right, ...wrongs], x.rng), optLang: code, answer: right }];
    const g = GENDER_WORD[lx.gender];
    if (g && lx.class !== 'plt') steps.push(code === 'de' ? { ask: 'And its article?', options: ['der', 'die', 'das'], optLang: code, answer: ARTICLE[lx.gender] } : { ask: 'And its gender?', options: ['masculine', 'feminine', 'neuter'], answer: g });
    const last = sp.pieces[sp.pieces.length - 1], why = [W(right, code), ' — the last part, ', W(last, code), ', is the head: it decides the gender'];
    if (g) why.push(` (${g}`, ...(head ? [', as in ', W((code === 'de' ? ARTICLE[head.gender] + ' ' : '') + head.lemma, code)] : []), ')', ...(code === 'de' ? [': ', W(ARTICLE[lx.gender] + ' ' + lx.lemma, code)] : []));
    why.push('.');
    return [deepBase(x, 'compound_split', lx, { type: 'vsteps', prompt: { word: lx.lemma }, steps, why })];
  };
  /** Profile examples of a word for one concept (its sense's concept), fit for an item (D19) and with the word found. */
  const contexts = (x, lx, cid) => (profOf(lx).examples || []).filter(e => e.text && senseMain(lx, e.sense)?.concept === cid)
    .map(e => ({ e, s: deepSentence(x.C, x.code, e.text, lx.id, x.K, x.maxUnknown) })).filter(o => o.s.ok && o.s.target >= 0);
  DEEP.sense_split = (x, lx) => {
    const { X, code } = x, out = [];
    for (const cid of lx.senses || []) {
      const group = uniqStr([lx.id, ...(X.byConcept[cid] || []).filter(id => id !== lx.id && x.M.has(id))]).slice(0, 4);
      if (group.length < 2 || new Set(group.map(id => nfc(X.lex[id].lemma))).size !== group.length) continue;
      const val = id => ((X.lex[id].contrasts || []).find(t => t.concept === cid) || {});
      const axis = val(lx.id).axis || val(group[1]).axis || '';
      const why = [`“${x.C.concepts[cid]?.gloss || cid}”${axis ? ' — ' + axis : ''}: `, ...group.flatMap((id, i) => [i ? ' · ' : '', W(X.lex[id].lemma, code), val(id).value ? ' = ' + val(id).value : ''])];
      const mine = contexts(x, lx, cid);
      const hint = e => [].concat(e.register || [], e.context || []).join(' · ');   // the register and context of the example: often what separates the words
      for (const { e, s } of mine.slice(0, 3)) out.push(deepBase(x, 'sense_split', lx, { type: 'vpick', ask: 'Which word fills the gap?', prompt: { sentence: gapped(s), tr: e.tr || '', trAfter: e.py || '', hint: hint(e) },
        options: shuffled(group.map(id => X.lex[id].lemma), x.rng), optLang: code, answer: lx.lemma, unknown: s.unknown, why: [...why, '. ', W(e.text, code)] }));
      // sorting contexts into the words (kennen / wissen)
      const all = group.map(id => ({ id, cs: id === lx.id ? mine : contexts(x, X.lex[id], cid) })).filter(g => g.cs.length);
      if (all.length >= 2 && all.reduce((a, g) => a + Math.min(2, g.cs.length), 0) >= 3) {
        const cards = all.flatMap(g => g.cs.slice(0, 2).map((o, i) => ({ id: g.id + '#' + i, tokens: gapped(o.s), tr: o.e.tr || '', hint: hint(o.e), bucket: g.id, lex: g.id, lang: code, unknown: o.s.unknown })));
        out.push(deepBase(x, 'sense_split', lx, { type: 'vsort', ask: 'Which word goes in each gap? Sort the sentences', buckets: all.map(g => ({ id: g.id, label: X.lex[g.id].lemma, lang: code })),
          cards: shuffled(cards, x.rng), unknown: uniqStr(cards.flatMap(c => c.unknown)), why }));
      }
    }
    return out;
  };
  DEEP.collocation = (x, lx) => {
    const { X, code, P } = x, out = [], own = P.partners.filter(p => p.lex === lx.id);
    const mine = [...(profOf(lx).collocations || []), ...(profOf(lx).examples || []), ...(profOf(lx).phrases || [])].map(o => plainOf(code, o.text || '')).join(' | ');
    for (const p of own) {
      const others = shuffled(P.partners, x.rng).filter(q => q.lex !== lx.id && q.plain !== p.plain && !mine.includes(q.plain)).slice(0, 150);
      const wrong = uniqStr(rankBy(others, q => (q.side === p.side ? 0 : 2) + (q.n === p.n ? 0 : 1) + (X.lex[q.lex].pos === lx.pos ? 0 : 1) + x.rng()).map(q => q.text)).slice(0, 3);
      if (wrong.length < 2) continue;
      const toks = [...p.s.tokens.slice(0, p.from), { gap: true, pre: '', post: '' }, ...p.s.tokens.slice(p.to + 1)];
      out.push(deepBase(x, 'collocation', lx, { type: 'vpick', ask: ['What goes with ', W(lx.lemma, code), ' here?'], prompt: { sentence: toks, tr: p.tr }, options: shuffled([p.text, ...wrong], x.rng), optLang: code, answer: p.text,
        why: [W(p.col, code), p.tr ? ' — ' + p.tr : ''] }));
    }
    return out;
  };
  DEEP.confusables = (x, lx) => {
    const { X, code, C } = x, out = [], conf = confusablesOf(C, code, lx.id).filter(o => x.M.has(o.lex));
    for (const t of lx.contrasts || []) {
      const group = uniqStr([lx.id, ...conf.filter(o => o.why === 'contrast' && o.concept === t.concept).map(o => o.lex)]).slice(0, 4);
      const val = id => ((X.lex[id].contrasts || []).find(u => u.concept === t.concept) || {}).value || '';
      if (group.length < 2 || !t.value || new Set(group.map(val)).size !== group.length || new Set(group.map(id => nfc(X.lex[id].lemma))).size !== group.length) continue;
      const clue = maskWords(t.value, group.flatMap(id => [X.lex[id].lemma, ...Object.values(X.lex[id].forms || {})]));
      out.push(deepBase(x, 'confusables', lx, { type: 'vpick', ask: 'Which word is it?', prompt: { text: `“${C.concepts[t.concept]?.gloss || t.concept}” — ${t.axis}: ${clue}` },
        options: shuffled(group.map(id => X.lex[id].lemma), x.rng), optLang: code, answer: lx.lemma, why: group.flatMap((id, i) => [i ? ' · ' : '', W(X.lex[id].lemma, code), ' = ' + val(id)]) }));
    }
    const lemmas = new Set([nfc(lx.lemma)]), look = [];
    for (const o of shuffled(conf, x.rng)) if (o.why === 'lookalike' && deepGlossOf(C, X, o.lex) !== deepGlossOf(C, X, lx.id) && !lemmas.has(nfc(X.lex[o.lex].lemma))) { lemmas.add(nfc(X.lex[o.lex].lemma)); look.push(o.lex); }
    if (look.length) {
      const group = [lx.id, ...look.slice(0, 3)];
      out.push(deepBase(x, 'confusables', lx, { type: 'vpick', ask: `Which one means “${deepGlossOf(C, X, lx.id)}”?`, prompt: { text: 'Words that look alike' }, options: shuffled(group.map(id => X.lex[id].lemma), x.rng), optLang: code, answer: lx.lemma,
        why: group.flatMap((id, i) => [i ? ' · ' : '', W(X.lex[id].lemma, code), X.lex[id].pinyin ? ` ${X.lex[id].pinyin}` : '', ' = ' + deepGlossOf(C, X, id)]) }));
    }
    return out;
  };
  DEEP.intensity_scale = (x, lx) => {
    const { X, code, P } = x, me = profOf(lx).intensity; if (typeof me !== 'number') return [];
    const others = P.scaleOf(lx.id).filter(id => x.M.has(id) && profOf(X.lex[id]).intensity !== me), byVal = {};
    for (const id of shuffled(others, x.rng)) { const v = profOf(X.lex[id]).intensity; if (!byVal[v]) byVal[v] = id; }
    const group = [lx.id, ...Object.values(byVal)].sort((a, b) => profOf(X.lex[a]).intensity - profOf(X.lex[b]).intensity);
    if (group.length < 2) return [];
    const why = group.flatMap((id, i) => [i ? ' < ' : '', W(X.lex[id].lemma, code), ` (${deepGlossOf(x.C, X, id)}, ${profOf(X.lex[id]).intensity}/5)`]);
    if (group.length >= 3) return [deepBase(x, 'intensity_scale', lx, { type: 'vorder', ask: 'Put them in order: the weakest first', cards: group.map(id => ({ text: X.lex[id].lemma, lang: code, lex: id, note: deepGlossOf(x.C, X, id) })), why })];
    const strong = group[group.length - 1];
    return [deepBase(x, 'intensity_scale', lx, { type: 'vpick', ask: 'Which is stronger?', prompt: { text: group.flatMap((id, i) => [i ? ' · ' : '', W(X.lex[id].lemma, code), ' = ' + deepGlossOf(x.C, X, id)]) }, options: shuffled(group.map(id => X.lex[id].lemma), x.rng), optLang: code, answer: X.lex[strong].lemma, why })];
  };
  DEEP.register_pick = (x, lx) => {
    const p = profOf(lx), { code } = x, seen = new Set(), opts = [];
    for (const o of [{ w: lx.lemma, regs: regsOf(p.register), nuance: mainSenses(lx)[0]?.def || '' }, ...(p.synonyms || []).map(s => ({ w: s.word, regs: regsOf(s.register), nuance: s.nuance || '', region: s.region })) ]) {
      const k = plainOf(code, o.w || ''); if (!k || seen.has(k) || !o.regs.length) continue; seen.add(k); opts.push(o);
    }
    if (opts.length < 2) return [];
    const out = [], gl = deepGlossOf(x.C, x.X, lx.id);
    for (const r of uniqStr(opts.flatMap(o => o.regs))) {
      const holders = opts.filter(o => o.regs.includes(r)); if (holders.length !== 1) continue;
      const others = opts.filter(o => !o.regs.includes(r)); if (!others.length) continue;
      const h = holders[0], sit = r === 'regional' ? (h.region ? `in ${h.region}` : 'in one region (a regional word)') : REG_SITUATION[r] || `in ${r} use`;
      const shown = [h, ...pickN(x, others, 3)];
      out.push(deepBase(x, 'register_pick', lx, { type: 'vpick', ask: `Which word fits ${sit}?`, prompt: { text: `Words around “${gl}”` }, options: shuffled(shown.map(o => o.w), x.rng), optLang: code, answer: h.w,
        why: shown.flatMap((o, i) => [i ? ' · ' : '', W(o.w, code), ` (${o.regs.join(', ')}${o.region ? ', ' + o.region : ''})`, o.nuance ? ' — ' + o.nuance : '']), register: r }));
    }
    return out.sort((a, b) => (a.register === 'neutral') - (b.register === 'neutral'));
  };
  DEEP.nuance_pick = (x, lx) => {
    const p = profOf(lx), { code } = x, seen = new Set(), opts = [];
    for (const o of [{ w: lx.lemma, nuance: mainSenses(lx)[0]?.def || '', forms: Object.values(lx.forms || {}) }, ...(p.synonyms || []).map(s => ({ w: s.word, nuance: s.nuance || '', forms: [] }))]) {
      const k = plainOf(code, o.w || ''); if (!k || seen.has(k) || !o.nuance) continue; seen.add(k); opts.push(o);
    }
    if (opts.length < 2) return [];
    const all = opts.flatMap(o => [o.w, ...o.forms, ...String(o.w).split(/\s+/).filter(t => [...t].length >= 2)]), out = [];
    for (const o of opts) o.clue = maskWords(o.nuance, all);
    for (const o of opts) {
      const clue = o.clue; if (clue.replace(/[…\s\p{P}]/gu, '').length < 5) continue;
      const shown = [o, ...pickN(x, opts.filter(q => q !== o && q.clue !== clue), 3)];
      if (shown.length < 2) continue;
      out.push(deepBase(x, 'nuance_pick', lx, { type: 'vpick', ask: 'Which word has this nuance?', prompt: { text: clue }, options: shuffled(shown.map(q => q.w), x.rng), optLang: code, answer: o.w,
        why: shown.flatMap((q, i) => [i ? ' · ' : '', W(q.w, code), ' — ' + q.nuance]) }));
    }
    return out;
  };
  DEEP.connotation = (x, lx) => {
    const p = profOf(lx), c = p.connotation; if (!['positive', 'negative', 'neutral', 'mixed'].includes(c)) return [];
    return [deepBase(x, 'connotation', lx, { type: 'vpick', ask: 'What feeling does it carry?', prompt: { word: lx.lemma }, options: c === 'mixed' ? ['positive', 'neutral', 'negative', 'mixed'] : ['positive', 'neutral', 'negative'], answer: c,
      why: [W(lx.lemma, x.code), ` — ${c}`, p.feeling ? '. ' + p.feeling : ''] })];
  };
  DEEP.idiom_meaning = (x, lx) => {
    const { code, P } = x, out = [];
    for (const ph of profOf(lx).phrases || []) {
      if (!ph.text || !ph.meaning) continue;
      const others = P.phrases.filter(q => q.lex !== lx.id && q.meaning !== ph.meaning && plainOf(code, q.text) !== plainOf(code, ph.text));
      const near = rankBy(others, q => (q.kind === ph.kind ? 0 : 1) + x.rng());
      const wrongM = uniqStr(near.map(q => q.meaning)).slice(0, 3), wrongT = uniqStr(near.map(q => q.text)).slice(0, 3);
      const s = deepSentence(x.C, code, ph.text, lx.id, x.K, 99), why = [W(ph.text, code), ph.tr ? ` (“${ph.tr}”)` : '', ' — ' + ph.meaning, ph.source ? ` — ${ph.source}` : ''];
      if (wrongM.length >= 2) out.push(deepBase(x, 'idiom_meaning', lx, { type: 'vpick', ask: `What does it mean${ph.kind ? ' (' + ph.kind + ')' : ''}?`, prompt: { sentence: s.tokens, lit: ph.tr || '' }, options: shuffled([ph.meaning, ...wrongM], x.rng), answer: ph.meaning, unknown: s.unknown, why }));
      if (wrongT.length >= 2) out.push(deepBase(x, 'idiom_meaning', lx, { type: 'vpick', ask: 'Which expression says this?', prompt: { text: ph.meaning }, options: shuffled([ph.text, ...wrongT], x.rng), optLang: code, answer: ph.text, why }));
    }
    return out;
  };
  DEEP.example_cloze = (x, lx) => {
    const { X, code } = x, out = [], ownForms = new Set([lx.lemma, ...Object.values(lx.forms || {}), ...(lx.alts || [])].map(f => plainOf(code, f)));
    const con = x.C.concepts[(lx.senses || [])[0]] || {}, sc = y => { const k = x.C.concepts[(y.senses || [])[0]] || {}; return (x.M.has(y.id) ? 0 : 2) + (k.field && k.field === con.field ? 0 : 1) + x.rng(); };
    const pool = shuffled(Object.values(X.lex).filter(y => y.id !== lx.id && y.pos === lx.pos && (y.senses || []).length && !(y.senses || []).some(c => (lx.senses || []).includes(c))), x.rng).slice(0, 80);
    const ranked = rankBy(pool, sc);
    for (const e of profOf(lx).examples || []) {
      if (!e.text) continue;
      const s = deepSentence(x.C, code, e.text, lx.id, x.K, x.maxUnknown); if (!s.ok || s.target < 0) continue;
      const tg = s.tokens[s.target], ans = tg.form, cap = /^\p{Lu}/u.test(ans) && !/^\p{Lu}/u.test(lx.lemma);
      const formOf = y => { if (tg.cell) { const f = y.forms || {}, kk = Object.keys(f).find(c => canon(c) === canon(tg.cell)); return kk ? f[kk] : null; } return Object.keys(y.forms || {}).length ? null : y.lemma; };
      const wrong = uniqStr(ranked.map(formOf).filter(f => f && !ownForms.has(plainOf(code, f)) && plainOf(code, f) !== plainOf(code, ans)).map(f => cap ? capFirst(f) : f)).slice(0, 3);
      if (wrong.length < 2) continue;
      out.push(deepBase(x, 'example_cloze', lx, { type: 'vpick', ask: 'Which word fills the gap?', prompt: { sentence: gapped(s), tr: e.tr || '', trAfter: e.py || '' }, options: shuffled([ans, ...wrong], x.rng), optLang: code, answer: ans,
        unknown: s.unknown, why: [W(e.text, code), e.tr ? ' — ' + e.tr : '', tg.cell ? ` (${cellLabel(tg.cell)})` : ''] }));
    }
    return out;
  };
  DEEP.sense_pick = (x, lx) => {
    const ms = mainSenses(lx).filter(s => s.def); if (ms.length < 2) return [];
    const out = [];
    for (const e of profOf(lx).examples || []) {
      const m = senseMain(lx, e.sense); if (!m || !ms.includes(m) || !e.text) continue;
      const s = deepSentence(x.C, x.code, e.text, lx.id, x.K, x.maxUnknown); if (!s.ok) continue;
      const shown = [m, ...pickN(x, ms.filter(o => o !== m && o.def !== m.def), 3)];
      out.push(deepBase(x, 'sense_pick', lx, { type: 'vpick', ask: ['Which meaning of ', W(lx.lemma, x.code), ' is used here?'], prompt: { sentence: s.tokens, trAfter: [e.tr, e.py].filter(Boolean).join(' · ') }, options: shuffled(shown.map(o => o.def), x.rng), answer: m.def,
        unknown: s.unknown, why: [W(e.text, x.code), e.tr ? ' — ' + e.tr : '', ' → ' + m.def] }));
    }
    return out;
  };
  DEEP.etymology_link = (x, lx) => {
    const { X, code, C } = x, ety = profOf(lx).etymology; if (!ety?.text) return [];
    const hide = [lx.lemma, ...Object.values(lx.forms || {}), lx.trad, lx.translit, lx.pinyin, lx.pinyin && pinyinMarksToNumbers(lx.pinyin).replace(/\d/g, ''), ...String(lx.lemma).split(/\s+/), ...(code === 'zh' ? [...lx.lemma, ...(lx.trad ? [...lx.trad] : [])] : [])];
    const clue = firstSentences(maskWords(ety.text, hide));
    if (plainOf(code, clue).includes(plainOf(code, lx.lemma)) || clue.replace(/[…\s\p{P}]/gu, '').length < 10) return [];
    const con = C.concepts[(lx.senses || [])[0]] || {};
    const pool = shuffled(Object.values(X.lex).filter(y => y.id !== lx.id && profOf(y).etymology?.text && profOf(y).etymology.text !== ety.text && nfc(y.lemma) !== nfc(lx.lemma)), x.rng).slice(0, 80);
    const sc = y => (x.M.has(y.id) ? 0 : 2) + (y.pos === lx.pos ? 0 : 1) + ((C.concepts[(y.senses || [])[0]] || {}).field === con.field ? 0 : 1) + x.rng();
    const wrong = uniqStr(rankBy(pool, sc).map(y => y.lemma)).slice(0, 3);
    if (wrong.length < 2) return [];
    return [deepBase(x, 'etymology_link', lx, { type: 'vpick', ask: 'Which word comes from this?', prompt: { text: clue }, options: shuffled([lx.lemma, ...wrong], x.rng), optLang: code, answer: lx.lemma,
      why: [W(lx.lemma, code), ' — ' + ety.text, ety.src ? ` (${ety.src})` : ''] })];
  };
  /** Depth items for some words of one language, the types mixed (one per word and type in turn). opts: {types, max = 10, rng, k, maxUnknown = 'auto', strictKnown, perWord} */
  function deepItems(C, L, code, lexIds, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code), max = opts.max ?? 10, perWord = opts.perWord ?? (lexIds.length > 1 ? 2 : Infinity);
    const M = new Set(Object.keys(k.state).filter(id => MET.has(k.state[id])));
    const x = { C, L, code, X, K: k.R, M, rng, maxUnknown: opts.strictKnown ? 0 : (opts.maxUnknown ?? 'auto'), P: deepPools(C, code) };
    const types = (opts.types || DEEP_TYPES).filter(t => DEEP[t]), pools = [];
    for (const t of shuffled(types, rng)) {
      const per = lexIds.filter(id => X.lex[id]).map(id => shuffled(DEEP[t](x, X.lex[id]) || [], rng)).filter(a => a.length), q = [];
      for (let i = 0; per.some(a => a.length); i++) for (const a of per) if (a.length) q.push(a.shift());
      if (q.length) pools.push(q);
    }
    const out = [], used = {}; let i = 0;
    while (out.length < max && pools.some(p => p.length)) {
      const p = pools[i++ % pools.length]; if (!p.length) continue;
      const j = p.findIndex(it => (used[it.lex] || 0) < perWord); if (j < 0) { p.length = 0; continue; }
      const it = p.splice(j, 1)[0]; used[it.lex] = (used[it.lex] || 0) + 1; out.push(it);
    }
    return out;
  }
  /** The depth types a word's data allows for this learner (for 🏋️ practise this word). */
  function deepTypes(C, L, code, lexId, opts = {}) {
    const its = deepItems(C, L, code, [lexId], { ...opts, max: 999, rng: opts.rng || (() => 0.5) });
    return DEEP_TYPES.filter(t => its.some(it => it.kind === t));
  }
  /** Record a depth item as a review of its word(s): its track; a sorting item reviews every word on it (perLex: {lexId: right}). */
  function deepRecord(C, L, code, item, ok, day, perLex) {
    const X = C.lang[code];
    if (perLex && Object.keys(perLex).length) { for (const [id, good] of Object.entries(perLex)) if (X.lex[id]) review(C, L, code, id, item.track || 'r', good ? 'good' : 'again', day); }
    else review(C, L, code, item.lex, item.track || deepTrack(item.kind), ok ? 'good' : 'again', day);
  }
  /** Deepening for the daily session (§7.5): 1–3 items for words already known (≥ known_r), not due today, the least recently reviewed first,
   *  languages in turn. → [{lang, lex, item}] */
  function deepenPlan(C, L, { day, languages, n = 3, rng = Math.random } = {}) {
    const langs = (languages || L.settings.languages || C.languages).filter(c => C.lang[c]), queues = [];
    for (const c of langs) {
      const k = known(C, L, c), items = L.langs[c]?.items || {};
      const last = id => Math.max(items[id]?.r?.last ?? -1, items[id]?.p?.last ?? -1);
      const due = id => ['r', 'p'].some(t => items[id]?.[t] && items[id][t].due <= day);
      const cand = shuffled(Object.keys(C.lang[c].lex).filter(id => ['known_r', 'known_p', 'mastered'].includes(k.state[id]) && C.lang[c].lex[id].profile && !due(id)), rng).sort((a, b) => last(a) - last(b));
      queues.push({ c, k, cand });
    }
    const out = []; let tries = 0;
    while (out.length < n && queues.some(q => q.cand.length) && tries++ < 60) {
      for (const q of queues) {
        if (out.length >= n || !q.cand.length) continue;
        const id = q.cand.shift(); let it = null;
        for (const t of shuffled(DEEP_TYPES, rng)) if ((it = deepItems(C, L, q.c, [id], { k: q.k, rng, max: 1, types: [t] })[0])) break;   // one type at a time: only the indexes it needs are built
        if (it) out.push({ lang: q.c, lex: id, item: it });
      }
    }
    return out;
  }
  const deepGen = type => ctx => deepItems(ctx.C, ctx.L, ctx.code, [...ctx.K].filter(id => { const lx = ctx.C.lang[ctx.code].lex[id]; return lx && (!ctx.gen.pos || lx.pos === ctx.gen.pos) && (!ctx.gen.concepts || (lx.senses || []).some(c => ctx.gen.concepts.some(p => c.startsWith(p)))); }),
    { k: ctx.k, rng: ctx.rng, types: [type], max: ctx.max }).map(it => ({ ...it, fn: ctx.fid }));
  GEN.root_family = deepGen('root_family'); GEN.compound_split = deepGen('compound_split'); GEN.sense_split = deepGen('sense_split'); GEN.collocation = deepGen('collocation');
  GEN.confusables = deepGen('confusables'); GEN.intensity_scale = deepGen('intensity_scale'); GEN.register_pick = deepGen('register_pick'); GEN.nuance_pick = deepGen('nuance_pick');
  GEN.connotation = deepGen('connotation'); GEN.idiom_meaning = deepGen('idiom_meaning'); GEN.example_cloze = deepGen('example_cloze'); GEN.sense_pick = deepGen('sense_pick'); GEN.etymology_link = deepGen('etymology_link');
  API.GEN = GEN;
  Object.assign(API, { DEEP_TYPES, deepItems, deepTypes, deepSentence, deepTrack, deepRecord, deepenPlan, confusablesOf, compoundSplit, maskWords });
  /* ---------- P6 — Polyglot layer: parallel sentences, bridges, comparison statements, polyglot exercises, interleaved sessions (§6.6, §7.5, §9) ---------- */
  /** A small seeded random generator: the plan of a day stays the same when the home is drawn again. */
  function seeded(n) { let a = (n >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const polyFold = (code, s) => stripMarks(code, nfc(s)).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const sharedSenses = (a, b) => (a?.senses || []).filter(s => (b?.senses || []).includes(s));
  /** The active languages of a learner (or the ones asked for) that the course has. */
  const polyLangs = (C, L, langs) => uniqStr((langs || L.settings.languages || C.languages).filter(c => C.lang[c]));
  const knownMap = (C, L, langs, k) => { const K = { ...(k || {}) }; for (const c of langs) if (!K[c]) K[c] = known(C, L, c); return K; };

  // ---- the same meaning in several languages: same frame + same gloss (bracket notes set aside, but never contradicting) ----
  const CONTRACT = [[/\bcan't\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bcannot\b/g, 'can not'], [/n't\b/g, ' not'], [/'m\b/g, ' am'], [/'re\b/g, ' are'], [/'ve\b/g, ' have'], [/'ll\b/g, ' will'], [/'d\b/g, ' would'], [/'s\b/g, ' is']];
  function noteMarks(s, m) {
    s = s.toLowerCase();
    if (/\b(wom[ae]n|female|feminine|fem|f|girls?)\b/.test(s)) m.G = 'F'; else if (/\b(m[ae]n|male|masculine|masc|m|boys?)\b/.test(s)) m.G = 'M';
    if (/\b(pl|plural|you all|all of you|several people|a group)\b/.test(s)) m.N = 'PL'; else if (/\b(two|dual|both)\b/.test(s)) m.N = 'DU'; else if (/\b(sg|singular|one person)\b/.test(s)) m.N = 'SG';
    if (/\b(informal|familiar|casual)\b/.test(s)) m.R = 'INF'; else if (/\b(formal|polite|respectful)\b/.test(s)) m.R = 'FORM';
    return m;
  }
  /** A gloss → {key: the meaning folded, marks: {G: gender of the person, N: number of “you”, R: formality}} */
  function glossKey(g) {
    const marks = {};
    let t = nfc(g).replace(/[’‘`´]/g, "'").replace(/[(\[]([^)\]]*)[)\]]/g, (x, inner) => { noteMarks(inner, marks); return ' '; }).toLowerCase();
    for (const [re, to] of CONTRACT) t = t.replace(re, to);
    return { key: t.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim(), marks };
  }
  /** Groups of bank sentences that mean the same in ≥ 2 course languages: [{key, frame, gloss, by: {lang: [{id, marks}]}}] (cached). */
  function parallelGroups(C) {
    if (C._par) return C._par.groups;
    const map = new Map(), of = {};
    for (const code of C.languages) for (const s of C.lang[code].sentences) {
      if (!s.frame || !s.gloss) continue;
      const g = glossKey(s.gloss), key = s.frame + '|' + g.key;
      let G = map.get(key); if (!G) map.set(key, G = { key, frame: s.frame, gloss: s.gloss, by: {} });
      (G.by[code] = G.by[code] || []).push({ id: s.id, marks: g.marks });
      of[code + '|' + s.id] = G;
    }
    const groups = [...map.values()].filter(G => Object.keys(G.by).length >= 2);
    C._par = { groups, of };
    return groups;
  }
  /** The sentences of language `to` that say what sentence `sid` of `code` says (the bracket notes decide between variants). */
  function equivalents(C, code, sid, to) {
    parallelGroups(C);
    const G = C._par.of[code + '|' + sid]; if (!G || !G.by[to] || code === to) return [];
    const src = (G.by[code] || []).find(x => x.id === sid); let cands = G.by[to].slice();
    for (const cat of ['G', 'N', 'R']) {
      const want = src?.marks[cat];
      if (want) { const same = cands.filter(x => x.marks[cat] === want); cands = same.length ? same : cands.filter(x => !x.marks[cat]); }
      else { const plain = cands.filter(x => !x.marks[cat]); if (plain.length) cands = plain; }
    }
    return cands.map(x => x.id);
  }
  /** {lang: [ids]} — the same meaning as sentence `sid` in every other language (langs: which ones). */
  function parallelOf(C, code, sid, langs) {
    const out = {};
    for (const c of (langs || C.languages)) { if (c === code) continue; const e = equivalents(C, code, sid, c); if (e.length) out[c] = e; }
    return out;
  }

  // ---- bridges: related words across the course languages and to the learner's languages (computed from the stored data) ----
  const AR_HE = { 'ا': 'א', 'أ': 'א', 'إ': 'א', 'آ': 'א', 'ء': 'א', 'ئ': 'א', 'ؤ': 'א', 'ب': 'ב', 'ت': 'ת', 'ث': 'ש', 'ج': 'ג', 'ح': 'ח', 'خ': 'ח', 'د': 'ד', 'ذ': 'ז',
    'ر': 'ר', 'ز': 'ז', 'س': 'שס', 'ش': 'ש', 'ص': 'צ', 'ض': 'צ', 'ط': 'ט', 'ظ': 'צט', 'ع': 'ע', 'غ': 'ע', 'ف': 'פ', 'ق': 'ק', 'ك': 'כ', 'ل': 'ל', 'م': 'מ', 'ن': 'נ', 'ه': 'ה',
    'و': 'וי', 'ي': 'יו', 'ى': 'יו' };
  const HE_FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const rootLetters = (code, r) => typeof r === 'string' ? [...stripMarks(code, r)].filter(ch => /\p{L}/u.test(ch)).map(ch => HE_FINAL[ch] || ch) : [];
  /** The root of a word as its facade states it (D14: {none: why} = no root), else the top-level field. */
  const polyRootOf = lx => { const f = lx?.features; if (f && 'root' in f) return typeof f.root === 'string' ? f.root : null; return typeof lx?.root === 'string' ? lx.root : null; };
  /** Do an Arabic and a Hebrew root correspond by the regular sound correspondences? */
  function rootsCorrespond(ra, rh) { const a = rootLetters('ar', ra), b = rootLetters('he', rh); return a.length >= 2 && a.length === b.length && a.every((ch, i) => (AR_HE[ch] || '').includes(b[i])); }
  const QUALIFIER = /(?:Proto-|Pre-|Old|Middle|Classical|Ancient|Byzantine|Late|Medieval|Biblical|Mishnaic|Koine|Vulgar|Early|Ottoman|Egyptian|Levantine|Gulf|Literary|Moroccan|Iraqi|Syrian|Palestinian|Swiss|Austrian|American|British|Brazilian|Western|Eastern|Northern|Southern|Upper|Lower|High|Low|Judeo-|Jewish|Imperial|Archaic|Colloquial|Dialectal|Regional|Taiwanese|Mainland|Hong Kong)\s*$/;
  const NOT_A_WORD = new Set(('and or for entry word words people the a an in au la le el from speakers speaker also via with to of as is was are has have it its this that which who form forms name names spelling origin source sense meaning ' +
    'edition cognate cognates loan loanword term verb noun adjective plural dialect dialects variety cousin equivalent translation calque version influence ultimately itself one same').split(' '));
  const CUES = [['other', /\b(another word|other words?|different word|unrelated|not related|instead)\b/g], ['calque', /\b(calques?|loan[- ]translation|translated from|built (?:exactly )?like)\b/g], ['loan', /\b(borrow\w*|loan\w*|internationalism|from|via|through|passed into|whence|derived?s?|adopted|taken over|goes back|go back)\b/g], ['cognate', /\b(cognates?|related|akin|inherited|same root|continues|shares?|doublet)\b/g], ['compare', /\b(compare[sd]?|cf|see|like|as in|matches|similar)\b/g]];
  function cueOf(before, after, sentence) {
    if (/false friend/i.test(sentence)) return 'falseFriend';
    let best = 'mention', at = -1;
    for (const [kind, re] of CUES) for (const m of before.toLowerCase().matchAll(re)) if (m.index > at) { at = m.index; best = kind; }
    if (best === 'mention') for (const [kind, re] of CUES.slice(2, 4)) if (new RegExp(re.source).test(after.toLowerCase())) { best = kind; break; }
    return best;
  }
  const SCRIPT_RUN = { Arab: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+(?:\s[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+)?/g, Hebr: /[֐-׿יִ-ﭏ]+(?:\s[֐-׿יִ-ﭏ]+)?/g, Hani: /[㐀-鿿豈-﫿]+/g, Hans: /[㐀-鿿豈-﫿]+/g, Hant: /[㐀-鿿豈-﫿]+/g };
  /** The language names a text may use: those of the world profiles and of the course languages → code (cached on C). */
  function nameIndex(C) {
    if (C._names) return C._names;
    const names = {};
    for (const l of (C.data.world?.languages || [])) names[l.name.split(' (')[0]] = l.code;
    for (const c of C.languages) { const n = C.lang[c].language.name; if (n) names[n.split(' (')[0]] = c; }
    if (names.Chinese) names.Mandarin = names.Chinese;
    const list = Object.keys(names).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return C._names = { names, re: list.length ? new RegExp(`(?<![\\p{L}\\p{M}-])(${list.join('|')})(?![\\p{L}-])[ \\u00a0]+`, 'gu') : null };
  }
  /** Words of other languages named in a text: [{code, word, kind: loan|cognate|compare|falseFriend|mention, note, named}] */
  function mentionsIn(C, text, ownCode) {
    const out = [], spans = [], subjects = [], NI = nameIndex(C); text = nfc(text || ''); if (!text) return out;
    const sentenceAt = i => { const s = Math.max(text.lastIndexOf('. ', i), text.lastIndexOf('; ', i), text.lastIndexOf('? ', i)) + 1; let e = text.slice(i).search(/[.;?](\s|$)/); e = e < 0 ? text.length : i + e + 1; return [s, e]; };
    if (NI.re) for (const m of text.matchAll(NI.re)) {
      const pre = text.slice(Math.max(0, m.index - 14), m.index), [s, e] = sentenceAt(m.index), before = text.slice(s, m.index);
      // a sentence about another word (“English shallot is from French échalote”): a language named with no cue before it; what follows is about that word
      const subject = NI.names[m[1]] !== ownCode && !CUES.some(([, re]) => new RegExp(re.source, 'i').test(before)), about = subjects.some(x => x.s === s && x.at < m.index);
      if (subject && !QUALIFIER.test(pre)) subjects.push({ s, at: m.index });
      if (QUALIFIER.test(pre) || /\b(an?|the)\s+$/i.test(pre) || /[“‘"]\s*$/.test(pre)) continue;
      const rest = text.slice(m.index + m[0].length);
      let word = null;
      if (/^[A-Za-zÀ-ɏ]/.test(rest)) {
        const w = (rest.match(/^[\p{L}\p{M}'’-]+/u) || [''])[0].replace(/['’-]+$/, ''), after = rest.slice(w.length);
        if (w.length >= 2 && !NOT_A_WORD.has(w.toLowerCase()) && /^(?:['’]?\s*[(,;:.)”’—–]|\s+(?:and|or)\b|\s*$)/u.test(after)) word = w;
      } else if (!/^[“"‘(\s]/.test(rest)) {
        const w = (rest.match(/^[^\s,;:.()“”"!?،؛。，、]+/u) || [''])[0];
        if ([...w].length >= 2 || /[㐀-鿿]/.test(w)) word = w;
      }
      if (!word) continue;
      const code = NI.names[m[1]], at = m.index + m[0].length, sentence = text.slice(s, e).trim();
      spans.push([at, at + word.length]);
      const ff = /false friend/i.test(sentence), again = ff && out.some(x => x.s === s && x.code === code);   // a false-friend sentence: the first word of each language is the one it is about
      if (code !== ownCode) out.push({ code, word, kind: again ? 'other' : about && !ff ? 'other' : cueOf(before, text.slice(at + word.length, e), sentence), note: sentence, named: true, s });
      else out.push({ code, word, kind: 'own', note: sentence, named: true, s });
    }
    // runs of another course language's own script, without its name (they count only when they mean the same, or in a false-friend sentence: see bridges)
    for (const c of C.languages) {
      const re = SCRIPT_RUN[C.lang[c].language.script]; if (!re || c === ownCode || C.lang[ownCode]?.language.script === C.lang[c].language.script) continue;
      for (const m of text.matchAll(re)) {
        if (spans.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
        const [s, e] = sentenceAt(m.index), sentence = text.slice(s, e).trim();
        out.push({ code: c, word: m[0], kind: cueOf(text.slice(s, m.index), text.slice(m.index + m[0].length, e), sentence), note: sentence, named: false });
      }
    }
    return out;
  }
  const familyOf = (C, code) => (C.data.world?.languages || []).find(l => l.code === code)?.family || null;
  /** A word named in a text → the lexemes of a course language it is (direct readings of the form index; a two-word span is tried first). */
  function resolveWord(C, code, w) {
    const X = C.lang[code], tries = w.includes(' ') ? [w, w.split(' ')[0]] : [w];
    const trimEnd = t => code === 'ar' ? nfc(t).replace(/[\u064B-\u0650\u0652]+$/u, '') : nfc(t);   // the case ending a citation may leave out
    for (const t0 of tries) {
      const t = nfc(t0.replace(/[“”"'’(),.;:]+/g, ''));
      let ms = X.forms.get(t) || (X.language.capitalizeFirst ? X.forms.get(decapFirst(t)) : null);
      if (!ms) {
        ms = X.forms.get(stripMarks(code, t)) || [];
        if (hasMarks(code, t)) ms = ms.filter(m => { const lx = X.lex[m.l]; return [lx.lemma, ...Object.values(lx.forms || {})].some(f => trimEnd(f) === trimEnd(t)); });   // a vocalized word must match as written (أَبّ is not أَب)
      }
      if (ms && ms.length) return uniqStr(ms.map(m => m.l));
    }
    return [];
  }
  /** Every bridge of the course: {bridges: [{kind: cognate|loan|falseFriend, a:{lang,lex}, b:{lang,lex}, via: [root|etymology|source|pitfall], same, note, roots?}],
   *  known: [{lang, lex, code, word, kind, note}] — links to languages outside the course (the learner's, by their etymology)}. Cached until the profiles change. */
  function bridges(C) {
    const stamp = C.languages.reduce((n, c) => n + Object.values(C.lang[c].lex).filter(x => x.profile).length, 0);
    if (C._bridges && C._bridges.stamp === stamp) return C._bridges;
    const pairs = new Map(), knownL = [], bySource = new Map();
    const RANK = { cognate: 1, loan: 2, falseFriend: 3 };
    const add = (kind, a, b, via, note, extra = {}) => {
      if (a.lang === b.lang) return;
      const [x, y] = [a, b].sort((p, q) => (p.lang + p.lex < q.lang + q.lex ? -1 : 1)), key = `${x.lang}:${x.lex}|${y.lang}:${y.lex}`;
      const same = sharedSenses(C.lang[a.lang].lex[a.lex], C.lang[b.lang].lex[b.lex]).length > 0;
      if (kind === 'falseFriend' && same) return;   // the course gives them a meaning in common: not a false friend here
      const o = pairs.get(key);
      if (!o) { pairs.set(key, { kind, a: x, b: y, via: [via], same, note: note || '', ...extra }); return; }
      if (RANK[kind] > RANK[o.kind]) { o.kind = kind; if (note) o.note = note; } else if (note && !o.note) o.note = note;
      if (!o.via.includes(via)) o.via.push(via);
      Object.assign(o, extra);
    };
    // 1 · roots: an Arabic and a Hebrew word with corresponding radicals and a meaning in common
    if (C.lang.ar && C.lang.he) {
      const heBy = new Map();
      for (const lx of Object.values(C.lang.he.lex)) if (polyRootOf(lx)) { const k = rootLetters('he', polyRootOf(lx)).join(''); if (!heBy.has(k)) heBy.set(k, []); heBy.get(k).push(lx); }
      for (const lx of Object.values(C.lang.ar.lex)) {
        const ra = polyRootOf(lx); if (!ra) continue;
        let keys = [''];
        for (const ch of rootLetters('ar', ra)) { const opts = AR_HE[ch] || ''; keys = keys.flatMap(k => [...opts].map(o => k + o)); if (!keys.length) break; }
        for (const k of uniqStr(keys)) for (const h of heBy.get(k) || []) if (rootsCorrespond(ra, polyRootOf(h)) && sharedSenses(lx, h).length)
          add('cognate', { lang: 'ar', lex: lx.id }, { lang: 'he', lex: h.id }, 'root', '', { roots: [ra, polyRootOf(h)] });
      }
    }
    // 2 · texts: etymologies (cognates, loans, the sources of loans), and the sentences that say “false friend”
    for (const code of C.languages) for (const lx of Object.values(C.lang[code].lex)) {
      const p = lx.profile; if (!p) continue;
      const texts = [[p.etymology?.text || '', 'etymology'], ...(p.pitfalls || []).map(t => [t, 'pitfall']), ...(p.subtleties || []).map(t => [t, 'pitfall'])];
      for (const [text, src] of texts) {
        if (!text || (src === 'pitfall' && !/false friend/i.test(text))) continue;
        for (const m of mentionsIn(C, text, code)) {
          if (['own', 'other', 'calque'].includes(m.kind) || (src === 'pitfall' && m.kind !== 'falseFriend')) continue;
          if (C.lang[m.code]) {   // a word of another course language
            const ids = resolveWord(C, m.code, m.word); if (!ids.length) continue;
            const best = ids.find(id => sharedSenses(lx, C.lang[m.code].lex[id]).length) || ids[0], same = sharedSenses(lx, C.lang[m.code].lex[best]).length > 0;
            if (m.kind === 'falseFriend') { if (!same) add('falseFriend', { lang: code, lex: lx.id }, { lang: m.code, lex: best }, 'pitfall', m.note); continue; }
            if (!m.named && !same) continue;   // a bare word in that script: only when it means the same (it may be a word of another language written alike)
            if (m.kind === 'compare' && !(same && familyOf(C, code) && familyOf(C, code) === familyOf(C, m.code))) continue;   // “compare”: a relation only between words of one family with the same meaning
            add(m.kind === 'loan' ? 'loan' : 'cognate', { lang: code, lex: lx.id }, { lang: m.code, lex: best }, 'etymology', m.note);
          } else if (m.named && m.kind !== 'mention') {   // a language outside the course (the learner may speak it)
            knownL.push({ lang: code, lex: lx.id, code: m.code, word: m.word, kind: m.kind, note: m.note });
            if (m.kind === 'loan' && src === 'etymology') { const k = m.code + '|' + polyFold('', m.word); if (!bySource.has(k)) bySource.set(k, []); bySource.get(k).push({ lang: code, lex: lx.id, word: m.word }); }
          }
        }
      }
    }
    // 3 · the same source: two course words borrowed from the same word of a third language, with a meaning in common
    const NI = nameIndex(C), nameOf = cd => Object.keys(NI.names).find(n => NI.names[n] === cd) || cd;
    for (const [k, ws] of bySource) for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j]; if (a.lang === b.lang) continue;
      if (sharedSenses(C.lang[a.lang].lex[a.lex], C.lang[b.lang].lex[b.lex]).length) add('loan', a, b, 'source', `Both from ${nameOf(k.split('|')[0])} ${a.word}.`);
    }
    const list = [...pairs.values()];
    for (const b of list) if (!b.note && b.roots) b.note = `Root ${b.roots[0]} ↔ ${b.roots[1]}: the same radicals by the regular sound correspondences, and a meaning in common.`;
    const byWord = new Map(); for (const b of list) for (const w of [b.a, b.b]) { const k = w.lang + '|' + w.lex; if (!byWord.has(k)) byWord.set(k, []); byWord.get(k).push(b); }
    return C._bridges = { stamp, list, known: knownL, byWord };
  }
  /** The bridges of one word: [{…bridge, other: {lang, lex}}], false friends first. */
  function bridgesOf(C, code, lexId) {
    const B = bridges(C), RANK = { falseFriend: 0, loan: 1, cognate: 2 };
    return (B.byWord.get(code + '|' + lexId) || []).map(b => ({ ...b, other: b.a.lang === code && b.a.lex === lexId ? b.b : b.a })).sort((x, y) => RANK[x.kind] - RANK[y.kind]);
  }
  const knowCodes = knows => (knows || []).map(k => typeof k === 'string' ? k : k.code).filter(Boolean);
  /** Links of one word to the learner's own languages (from its etymology): [{code, word, kind, note}] — all of them when knows is not given. */
  function knownLinks(C, code, lexId, knows) {
    const ks = knows ? new Set(knowCodes(knows)) : null;
    return bridges(C).known.filter(x => x.lang === code && x.lex === lexId && (!ks || ks.has(x.code)));
  }

  // ---- comparison statements of a function across the languages ----
  const STATUS_TEXT = { realized: 'has a form or construction of its own for it', periphrastic: 'says it with other means (other words, word order)', absent: 'does not mark it at all' };
  /** One function across the languages: {fn, title, langs, rows: [{lang, status, first, typology}], features: [{feature, title, values: {lang: {value, title, from}}}], seeAlso: [{from, lang, fn, note}]} */
  function compareFn(C, fid, langs) {
    const W = C.data.world, feat = Object.fromEntries((W?.features || []).map(f => [f.id, f])), prof = Object.fromEntries((W?.languages || []).map(l => [l.code, l]));
    langs = (langs || C.languages).filter(c => C.lang[c]?.grammar[fid]);
    const rows = langs.map(c => { const g = C.lang[c].grammar[fid]; return { lang: c, status: g.status, first: (String(g.summary || '').match(/^.*?[.!?](\s|$)/) || [g.summary || ''])[0].trim(), summary: g.summary || '', typology: Array.isArray(g.typology) ? g.typology : [] }; });
    const ids = uniqStr(rows.flatMap(r => r.typology.map(t => t.feature))).filter(f => feat[f]);
    const features = ids.map(f => {
      const values = {};
      for (const r of rows) {
        const tag = r.typology.find(t => t.feature === f), v = tag ? tag.value : prof[r.lang]?.values?.[f];
        const vt = (feat[f].values || []).find(x => x.id === v);
        values[r.lang] = v && v !== 'unknown' ? { value: v, title: vt?.title || v, from: tag ? 'tag' : 'profile' } : null;
      }
      return { feature: f, title: feat[f].title, values };
    });
    const seeAlso = rows.flatMap(r => (C.lang[r.lang].grammar[fid].seeAlso || []).filter(x => langs.includes(x.lang) && x.lang !== r.lang).map(x => ({ from: r.lang, lang: x.lang, fn: x.fn || fid, note: x.note || '' })));
    return { fn: fid, title: C.functions[fid]?.title || fid, langs, rows, features, seeAlso };
  }
  /** compare_rule (§6.6): statements × languages from the typological values and the status of the realizations; and “whose page says this?” */
  function compareItems(C, L, { langs, fns, rng = Math.random, max = 4 } = {}) {
    langs = polyLangs(C, L, langs); if (langs.length < 2) return [];
    const order = {}; C.order.forEach((nid, i) => { const f = C.nodes[nid].functions || []; for (const x of (Array.isArray(f) ? f : Object.values(f).flat())) if (!(x in order)) order[x] = i; });
    fns = (fns || Object.keys(C.functions).filter(f => f !== 'fn.overview').sort((a, b) => (order[a] ?? 1e9) - (order[b] ?? 1e9)));
    const names = C.languages.flatMap(c => [C.lang[c].language.name, (C.lang[c].language.name || '').split(' (')[0], C.lang[c].language.nativeName]).filter(Boolean).concat(['Mandarin', 'MSA']);
    const mask = s => { let t = s; for (const n of names) t = t.split(n).join('…'); for (const re of Object.values(SCRIPT_RUN)) t = t.replace(new RegExp(re.source, 'g'), '…'); return t.replace(/(…\s*){2,}/g, '… '); };
    const out = [];
    for (const fid of fns) {
      const cf = compareFn(C, fid, langs); if (cf.langs.length < 2) continue;
      const st = [];
      for (const f of cf.features) {
        if (cf.langs.some(c => !f.values[c])) continue;   // every value known, or the statement is not asked
        const by = {}; for (const c of cf.langs) (by[f.values[c].value] = by[f.values[c].value] || []).push(c);
        const groups = Object.entries(by);
        for (const [v, hs] of groups) st.push({ text: `${f.title}: ${f.values[hs[0]].title}`, holds: hs, differs: groups.length > 1, feature: f.feature });
      }
      const sts = {}; for (const r of cf.rows) (sts[r.status] = sts[r.status] || []).push(r.lang);
      if (Object.keys(sts).length > 1) for (const [s, hs] of Object.entries(sts)) st.push({ text: `This language ${STATUS_TEXT[s] || s}.`, holds: hs, differs: true, feature: 'status' });
      const diff = shuffled(st.filter(s => s.differs), rng), samek = shuffled(st.filter(s => !s.differs), rng);
      const pick = [...diff.slice(0, 4)]; if (pick.length < 4 && samek.length) pick.push(samek[0]);
      if (pick.length >= 2 && pick.some(s => s.holds.length < cf.langs.length))
        out.push({ type: 'compare_rule', kind: 'compare', fn: fid, lang: cf.langs[0], langs: cf.langs, title: cf.title, multi: true, statements: shuffled(pick, rng).map(({ text, holds }) => ({ text, holds })),
          why: `${cf.title}: ` + cf.langs.map(c => `${c} — ${cf.rows.find(r => r.lang === c).first}`).join(' · ') });
      const firsts = cf.rows.filter(r => r.first);
      if (firsts.length >= 2) out.push({ type: 'compare_rule', kind: 'whose', fn: fid, lang: cf.langs[0], langs: cf.langs, title: cf.title, multi: false,
        statements: shuffled(firsts.map(r => ({ text: mask(r.first), holds: [r.lang] })), rng), why: cf.title });
      if (out.length >= max * 2) break;
    }
    const a = out.filter(x => x.kind === 'compare'), b = out.filter(x => x.kind === 'whose'), mix = [];
    while ((a.length || b.length) && mix.length < max) { if (a.length) mix.push(a.shift()); if (b.length && mix.length < max) mix.push(b.shift()); }
    return mix;
  }

  // ---- the polyglot items (§6.6): every answer from the stored data ----
  /** The romanization a learner reads a word in (transliteration, pinyin), or the word itself in Latin script; null when there is none. */
  function romanOf(C, code, lx) {
    if (lx.translit) return lx.translit;
    if (lx.pinyin) return lx.pinyin.replace(/\s+/g, '');
    return C.lang[code].language.script === 'Latn' ? lx.lemma : null;
  }
  const usable = lx => (lx.senses || []).length && !lx.prefix && lx.pos !== 'PROPN' && lx.pos !== 'PUNCT';
  /** which_language: a known word (romanized) or a sentence (when two languages share a script) → which course language? */
  function whichItems(C, L, { langs, k, rng = Math.random, max = 6 } = {}) {
    langs = polyLangs(C, L, langs); if (langs.length < 2) return [];
    const K = knownMap(C, L, langs, k), all = C._romans = C._romans || {};
    for (const c of langs) if (!all[c]) { all[c] = new Set(); for (const lx of Object.values(C.lang[c].lex)) { const r = romanOf(C, c, lx); if (r) all[c].add(polyFold(c, r)); all[c].add(polyFold(c, lx.lemma)); } }
    const ok = (c, lx) => { const r = romanOf(C, c, lx); if (!r || !usable(lx) || !K[c].R.has(lx.id) || [...polyFold(c, r)].length < 2) return null; const f = polyFold(c, r); return langs.some(o => o !== c && all[o].has(f)) ? null : r; };
    const item = (c, lx, r) => ({ type: 'which_language', kind: 'which', lang: c, lex: lx.id, prompt: r, roman: r !== lx.lemma, options: langs.slice(), answer: c, gloss: C.concepts[lx.senses[0]]?.gloss || '',
      why: `${lx.lemma}${r !== lx.lemma ? ' (' + r + ')' : ''} — ${C.concepts[lx.senses[0]]?.gloss || ''}` });
    const out = [], used = new Set();
    // confusables first: the two words of a bridge, both known, one after the other (§9.5)
    for (const b of shuffled(bridges(C).list.filter(b => langs.includes(b.a.lang) && langs.includes(b.b.lang)), rng)) {
      if (out.length + 2 > max) break;
      const A = C.lang[b.a.lang].lex[b.a.lex], B = C.lang[b.b.lang].lex[b.b.lex], ra = ok(b.a.lang, A), rb = ok(b.b.lang, B);
      if (!ra || !rb || used.has(A.id) || used.has(B.id)) continue;
      out.push({ ...item(b.a.lang, A, ra), pair: true }, { ...item(b.b.lang, B, rb), pair: true }); used.add(A.id); used.add(B.id);
    }
    // sentences, only where two of the languages share a script (otherwise the script alone answers it)
    const scripts = {}; for (const c of langs) (scripts[C.lang[c].language.script] = scripts[C.lang[c].language.script] || []).push(c);
    for (const group of Object.values(scripts)) if (group.length > 1) for (const c of group) {
      const s = shuffled(selectSentences(C, c, { known: K[c].R, maxUnknown: 'auto' }).slice(0, 20), rng)[0];
      if (s && out.length < max) out.push({ type: 'which_language', kind: 'which', lang: c, sentence: s.id, prompt: s.text, roman: false, options: langs.slice(), answer: c, gloss: s.gloss, why: `${s.text} — ${s.gloss}`, unknown: s.unknown });
    }
    const pools = langs.map(c => shuffled(Object.values(C.lang[c].lex).filter(lx => !used.has(lx.id) && ok(c, lx)), rng).map(lx => [c, lx]));
    let i = 0; while (out.length < max && pools.some(p => p.length)) { const p = pools[i++ % pools.length]; if (p.length) { const [c, lx] = p.shift(); out.push(item(c, lx, ok(c, lx))); } }
    return out.slice(0, max);
  }
  /** parallel_translate: a sentence of one course language → build the same meaning in another with tiles. */
  function parallelTranslateItems(C, L, { langs, from, to, k, rng = Math.random, max = 6, sources, fn, frame } = {}) {
    langs = polyLangs(C, L, langs); if (langs.length < 2) return [];
    const K = knownMap(C, L, langs, k), allowed = {};
    for (const c of langs) allowed[c] = new Map(selectSentences(C, c, { known: K[c].R, maxUnknown: 'auto' }).map(s => [s.id, s]));
    const pairsL = []; for (const a of (from ? [from] : langs)) for (const b of (to ? [].concat(to) : langs)) if (a !== b && allowed[a] && allowed[b]) pairsL.push([a, b]);
    const pools = pairsL.map(([a, b]) => {
      const src = (sources ? sources.filter(s => allowed[a].has(s.id)).map(s => allowed[a].get(s.id)) : [...allowed[a].values()]).filter(s => !frame || s.frame === frame);
      const items = [];
      for (const sA of shuffled(src, rng)) {
        const eq = equivalents(C, a, sA.id, b); if (!eq.length) continue;
        const ok = eq.map(id => allowed[b].get(id)).filter(Boolean).sort((x, y) => x.unknown.length - y.unknown.length); if (!ok.length) continue;
        const sB = ok[0], tiles = sentenceTiles(sB); if (tiles.length < 2) continue;
        const wt = wrongTile(C, b, sB, rng), answers = uniqStr(eq.flatMap(id => { const s = C.lang[b].sentenceById[id]; return s ? [s.text, ...(s.alts || [])] : []; }));
        items.push({ type: 'parallel_translate', kind: 'parallel', lang: b, from: a, source: sA.id, sentence: sB.id, frame: sA.frame, gloss: sA.gloss, tiles: shuffled(wt ? [...tiles, wt] : tiles, rng), size: tiles.length,
          answers, punct: endPunct(sB), why: sB.text, unknown: sB.unknown, unknownFrom: sA.unknown, ...(fn && C.lang[b].grammar[fn] ? { fn } : {}) });
        if (items.length >= max) break;
      }
      return items;
    });
    const out = []; let i = 0; while (out.length < max && pools.some(p => p.length)) { const p = pools[i++ % pools.length]; if (p.length) out.push(p.shift()); }
    return out;
  }
  const tokConcepts = (X, t) => uniqStr((t.l ? [t.l] : (t.parts || []).map(p => p.l).filter(Boolean)).flatMap(l => X.lex[l]?.senses || []));
  /** parallel_align: 2–4 realizations of one meaning; for words of the first, the words of the others with the same concept. */
  function alignItems(C, L, { langs, k, rng = Math.random, max = 4, pivot, sources, frame } = {}) {
    langs = polyLangs(C, L, langs); if (langs.length < 2) return [];
    const K = knownMap(C, L, langs, k), allowed = {};
    for (const c of langs) allowed[c] = new Map(selectSentences(C, c, { known: K[c].R, maxUnknown: 'auto' }).map(s => [s.id, s]));
    const srcIds = sources ? new Set(sources.map(s => (pivot || '') + '|' + s.id)) : null;
    const out = [];
    for (const G of shuffled(parallelGroups(C), rng)) {
      if (out.length >= max) break;
      if (frame && G.frame !== frame) continue;
      const present = langs.filter(c => (G.by[c] || []).some(x => allowed[c].has(x.id)));
      if (present.length < 2 || (pivot && !present.includes(pivot))) continue;
      const pv = pivot || present[Math.floor(rng() * present.length)];
      const sP = (G.by[pv] || []).map(x => allowed[pv].get(x.id)).filter(Boolean).sort((a, b) => a.unknown.length - b.unknown.length)[0];
      if (!sP || (srcIds && !srcIds.has(pv + '|' + sP.id))) continue;
      const sents = { [pv]: sP };
      for (const c of shuffled(present.filter(c => c !== pv), rng).slice(0, 3)) {
        const id = equivalents(C, pv, sP.id, c).find(x => allowed[c].has(x)); if (id) sents[c] = allowed[c].get(id);
      }
      const others = Object.keys(sents).filter(c => c !== pv); if (!others.length) continue;
      const XP = C.lang[pv], rows = [], usedTok = new Set();
      const conceptsP = sP.tokens.map(t => t.p || t.name ? [] : tokConcepts(XP, t));
      for (const cid of uniqStr(conceptsP.flat())) {
        const at = conceptsP.map((cs, i) => cs.includes(cid) ? i : -1).filter(i => i >= 0);
        if (at.length !== 1 || usedTok.has(at[0])) continue;
        const hits = {};
        for (const c of others) { const X = C.lang[c], hs = sents[c].tokens.map((t, i) => !t.p && !t.name && tokConcepts(X, t).includes(cid) ? i : -1).filter(i => i >= 0); if (hs.length) hits[c] = hs; }
        if (!Object.keys(hits).length) continue;
        usedTok.add(at[0]); rows.push({ concept: cid, gloss: C.concepts[cid]?.gloss || cid, pivot: at[0], hits });
        if (rows.length >= 5) break;
      }
      if (rows.length < 2) continue;
      out.push({ type: 'parallel_align', kind: 'align', lang: pv, langs: [pv, ...others], sentences: Object.fromEntries(Object.entries(sents).map(([c, s]) => [c, s.id])), rows, gloss: sP.gloss, frame: G.frame,
        unknown: Object.fromEntries(Object.entries(sents).map(([c, s]) => [c, s.unknown])), why: Object.entries(sents).map(([c, s]) => s.text).join(' · ') });
    }
    return out;
  }
  /** cognate_bridge: related words across the course languages, the links to the learner's languages, the false friend among related pairs. */
  function bridgeItems(C, L, { langs, k, rng = Math.random, max = 6, knows, focus } = {}) {
    langs = polyLangs(C, L, langs); if (!langs.length) return [];
    const K = knownMap(C, L, langs, k), B = bridges(C), isKnown = w => K[w.lang]?.R.has(w.lex);
    const mine = B.list.filter(b => langs.includes(b.a.lang) && langs.includes(b.b.lang) && isKnown(b.a) && isKnown(b.b) && (!focus || b.a.lang === focus || b.b.lang === focus));
    const linked = (w, x) => (B.byWord.get(w.lang + '|' + w.lex) || []).some(b => (b.a.lang === x.lang && b.a.lex === x.lex) || (b.b.lang === x.lang && b.b.lex === x.lex));
    const cand = {}; for (const c of langs) cand[c] = Object.values(C.lang[c].lex).filter(x => K[c].R.has(x.id) && usable(x));
    const distract = (lang, answer, prompt, n) => {
      const P = C.lang[prompt.lang].lex[prompt.lex], A = C.lang[lang].lex[answer];
      return shuffled(shuffled(cand[lang], rng).slice(0, 60).filter(x => x.id !== answer && x.lemma !== A.lemma && !sharedSenses(x, P).length && !linked(prompt, { lang, lex: x.id })
        && !(polyRootOf(x) && polyRootOf(P) && (lang === 'ar' ? rootsCorrespond(polyRootOf(x), polyRootOf(P)) : lang === 'he' ? rootsCorrespond(polyRootOf(P), polyRootOf(x)) : false))), rng)
        .sort((x, y) => (x.pos === A.pos ? 0 : 1) - (y.pos === A.pos ? 0 : 1)).slice(0, n).map(x => x.id);
    };
    const bridgeQ = [], ffQ = [], knownQ = [];
    for (const b of shuffled(mine.filter(b => b.kind !== 'falseFriend'), rng)) {
      if (bridgeQ.length >= max) break;
      const [p, a] = rng() < 0.5 ? [b.a, b.b] : [b.b, b.a]; if (focus && a.lang !== focus && p.lang !== focus) continue;
      const wrong = distract(a.lang, a.lex, p, 3); if (wrong.length < 2) continue;
      bridgeQ.push({ type: 'cognate_bridge', kind: 'bridge', lang: a.lang, from: p.lang, lex: p.lex, prompt: C.lang[p.lang].lex[p.lex].lemma, options: shuffled([a.lex, ...wrong], rng), answer: a.lex, bridge: b.kind, via: b.via, why: b.note });
    }
    for (const f of shuffled(mine.filter(b => b.kind === 'falseFriend'), rng)) {
      if (ffQ.length >= max) break;
      const same = shuffled(B.list.filter(b => b.kind !== 'falseFriend' && b.same && isKnown(b.a) && isKnown(b.b) && [b.a.lang, b.b.lang].sort().join() === [f.a.lang, f.b.lang].sort().join()), rng).slice(0, 3);
      if (!same.length) continue;
      const pairsQ = shuffled([f, ...same], rng);
      ffQ.push({ type: 'cognate_bridge', kind: 'false_friend', lang: f.a.lang, pairs: pairsQ.map(b => ({ a: b.a, b: b.b })), answer: pairsQ.indexOf(f), why: f.note });
    }
    const ks = new Set(knowCodes(knows || L.settings.knows || (C.data.course.knownLanguages || [])));
    for (const x of shuffled(B.known.filter(x => ks.has(x.code) && langs.includes(x.lang) && ['loan', 'cognate', 'falseFriend'].includes(x.kind) && K[x.lang].R.has(x.lex)), rng)) {
      if (knownQ.length >= max) break;
      if (focus && x.lang !== focus) continue;
      const others = new Set(B.known.filter(y => y.code === x.code && polyFold('', y.word) === polyFold('', x.word) && y.lang === x.lang).map(y => y.lex));
      const wrong = distract(x.lang, x.lex, { lang: x.lang, lex: x.lex }, 5).filter(id => !others.has(id)).slice(0, 3); if (wrong.length < 2) continue;
      knownQ.push({ type: 'cognate_bridge', kind: 'known', lang: x.lang, other: { code: x.code, word: x.word }, options: shuffled([x.lex, ...wrong], rng), answer: x.lex, bridge: x.kind, why: x.note });
    }
    const out = []; const qs = [ffQ, bridgeQ, knownQ]; let i = 0;
    while (out.length < max && qs.some(q => q.length)) { const q = qs[i++ % qs.length]; if (q.length) out.push(q.shift()); }
    return out;
  }
  /** Polyglot items of one type for the learner (§6.6). opts: {langs, k: {lang: known()}, rng, max, fn, from, to, pivot, knows}. */
  function polyItems(C, L, type, opts = {}) {
    if (type === 'which_language') return whichItems(C, L, opts);
    if (type === 'parallel_translate') return parallelTranslateItems(C, L, opts);
    if (type === 'parallel_align') return alignItems(C, L, opts);
    if (type === 'cognate_bridge') return bridgeItems(C, L, opts);
    if (type === 'compare_rule') return compareItems(C, L, { ...opts, fns: opts.fn ? [opts.fn] : opts.fns });
    return [];
  }
  const POLY_TYPES = ['which_language', 'parallel_translate', 'parallel_align', 'cognate_bridge', 'compare_rule'];
  // as generators of a realization (§6.7): the function's sentences / the function itself, this language and the other active ones
  const genLangs = ctx => uniqStr([ctx.code, ...((ctx.gen.to || ctx.gen.langs) || (ctx.L.settings.languages || ctx.C.languages))]).filter(c => ctx.C.lang[c]);
  const genK = ctx => ({ [ctx.code]: ctx.k });
  GEN.parallel_translate = ctx => parallelTranslateItems(ctx.C, ctx.L, { langs: genLangs(ctx), from: ctx.code, k: genK(ctx), rng: ctx.rng, max: ctx.max, sources: ctx.bank(), fn: ctx.fid });
  GEN.parallel_align = ctx => alignItems(ctx.C, ctx.L, { langs: genLangs(ctx), pivot: ctx.code, k: genK(ctx), rng: ctx.rng, max: ctx.max, sources: ctx.bank() }).map(it => ({ ...it, fn: ctx.fid }));
  GEN.which_language = ctx => whichItems(ctx.C, ctx.L, { langs: genLangs(ctx), k: genK(ctx), rng: ctx.rng, max: ctx.max });
  GEN.cognate_bridge = ctx => bridgeItems(ctx.C, ctx.L, { langs: genLangs(ctx), k: genK(ctx), rng: ctx.rng, max: ctx.max, focus: ctx.code });
  GEN.compare_rule = ctx => compareItems(ctx.C, ctx.L, { langs: genLangs(ctx), fns: [ctx.fid], rng: ctx.rng, max: ctx.max });

  /** The daily session (§7.5, §9.5): bridged words that are due together come one after the other; with ≥ 2 languages one polyglot item
   *  (in every session of 5 minutes or more, however full it is). → seconds used */
  function polyPlan(C, L, steps, langs, K, day, total) {
    const rv = steps.find(s => s.kind === 'review');
    if (rv && langs.length > 1) {
      const B = bridges(C), items = rv.items, placed = new Set(), out = [], key = x => x.lang + '|' + x.lex;
      for (let i = 0; i < items.length; i++) {
        if (placed.has(i)) continue; placed.add(i); out.push(items[i]);
        const partners = new Set((B.byWord.get(key(items[i])) || []).flatMap(b => [key(b.a), key(b.b)]));
        for (let j = i + 1; j < items.length; j++) if (!placed.has(j) && partners.has(key(items[j])) && key(items[j]) !== key(items[i])) { placed.add(j); out.push({ ...items[j], pair: true }); }
      }
      rv.items = out;
    }
    if (langs.length < 2 || total < 300) return 0;
    const rng = seeded(day * 7919 + 17), first = day % 2 ? 'parallel_align' : 'which_language';
    for (const type of [first, first === 'which_language' ? 'parallel_align' : 'which_language']) {
      const items = polyItems(C, L, type, { langs, k: K, rng, max: 1 });
      if (items.length) { steps.push({ kind: 'poly', type, items }); return SECONDS.extra; }
    }
    return 0;
  }
  API.GEN = GEN;
  Object.assign(API, { parallelGroups, parallelOf, equivalents, glossKey, bridges, bridgesOf, knownLinks, rootsCorrespond, mentionsIn, compareFn, polyItems, POLY_TYPES, romanOf, seeded });   // P6 — polyglot layer

  /* ---------- P7 — Production and reading: translation, rewriting, writing, graded readers, numbers / clock / date, register, the tutor's context ----------
     docs/LANGUAGES.md §6.5, §7.1 (3), §8 Tutor. Every automatic answer comes from stored data (the bank, the lexicon); an AI model only
     grades open answers (labelled "AI-judged" by the UI) and talks in the tutor — what it writes is tokenized and checked against the form index. */
  const glossOfLex = (C, X, l) => { const x = X.lex[l]; if (!x) return ''; const c = (x.senses || [])[0]; return c ? (C.concepts[c]?.gloss || c) : (x.role || ''); };
  const sensesOf = (X, l) => (l && X.lex[l]?.senses) || [];
  const numOf = (X, l) => { for (const s of sensesOf(X, l)) { const m = /^num\.(\d+)$/.exec(s); if (m) return +m[1]; } return null; };
  const ordOf = (X, l) => { for (const s of sensesOf(X, l)) { const m = /^num\.ord\.(\d+)$/.exec(s); if (m) return +m[1]; } return null; };
  /** The words of a stored sentence, a prefixed word split into its parts: [{t, l, f, name?}] (punctuation left out). */
  const flatWords = s => { const out = []; const walk = ks => ks.forEach(k => { if (k.parts) walk(k.parts); else if (!k.p) out.push(k); }); walk(s.tokens || []); return out; };
  const readKey = (l, f) => l + '|' + (f ? canon(f) : '');
  /** The readings of a tokenized word, part by part: [[keys of part 1], [keys of part 2] …] */
  const tokenReadings = k => k.parts ? k.parts.map(p => (p.matches || []).map(m => readKey(m.l, m.f))) : [(k.matches || []).map(m => readKey(m.l, m.f))];
  /** Does a typed text say exactly the words (lexeme + form) of a stored sentence, spelled any way the form index accepts
      (without vowel marks, full spelling, a capital at the start …)? Word order and every form must be the same. */
  function sameWords(C, code, s, text) {
    const X = C.lang[code], typed = tokenize(C, code, text).filter(k => !k.p), stored = flatWords(s), flat = [];
    for (const k of typed) { if (k.parts) k.parts.forEach(p => flat.push({ t: p.t, keys: (p.matches || []).map(m => readKey(m.l, m.f)) })); else flat.push({ t: k.t, keys: (k.matches || []).map(m => readKey(m.l, m.f)) }); }
    if (flat.length !== stored.length) return false;
    const plain = w => stripMarks(code, nfc(w)).toLowerCase();
    return stored.every((k, i) => {
      const w = flat[i];
      if (k.name || !k.l) return plain(w.t) === plain(k.t);   // a name: the same name
      if (hasMarks(code, w.t) && nfc(w.t) !== nfc(k.t) && !Object.values(X.lex[k.l]?.forms || {}).some(f => nfc(f) === nfc(w.t))) return false;   // vowel marks written must be right
      if (w.keys.includes(readKey(k.l, k.f))) return true;
      if (!k.f && w.keys.some(x => x.startsWith(k.l + '|'))) return true;   // an invariant word or a prefix: the same word
      const lx = X.lex[k.l], cell = k.f && Object.keys(lx?.forms || {}).find(c => canon(c) === canon(k.f)), alt = cell ? ((lx.formsAlt || {})[cell] || []) : [];   // Onkel / Onkels
      return alt.some(a => plain(a) === plain(w.t));
    });
  }
  /** A typed answer to a sentence (translate, rewrite with a stored variant) → {ok, how: 'exact' | 'variant' | null}.
      Accepted: the sentence, its alts, and every orthographic variant the form index reads as the same words (without vowel
      marks, the full spelling, a capital at the start …). Anything else is not decided here: the UI may send it to the AI, labelled "AI-judged". */
  function typedAnswer(C, code, s, text, alts) {
    const want = [s.text, ...(s.alts || []), ...(alts || [])];
    if (!String(text || '').trim()) return { ok: false, how: null };
    // letters as written (German nouns keep their capital), only the first letter of the answer is free; punctuation and spaces do not count
    const norm = t => { const x = nfc(t).replace(/[\p{P}\s]+/gu, ' ').trim(); return C.lang[code].language.capitalizeFirst ? decapFirst(x) : x.toLowerCase(); };
    const bare = !hasMarks(code, text);
    if (want.some(a => norm(a) === norm(text) || bare && norm(stripMarks(code, a)) === norm(text))) return { ok: true, how: 'exact' };
    if (sameWords(C, code, s, text)) return { ok: true, how: 'variant' };
    return { ok: false, how: null };
  }
  /** A text written by the learner or by an AI, checked against the form index (§7.2): every word with its reading.
      → {tokens, words: [{t, l, known, inCourse}], unknown: [not in the course], unlearned: [lexeme ids in the course, not known yet]} */
  function checkText(C, code, text, knownSet) {
    const X = C.lang[code], tokens = tokenize(C, code, text), words = [], unlearned = [], unknown = [];
    for (const k of tokens) {
      if (k.p) continue;
      if (k.unknown) { words.push({ t: k.t, l: null, known: false, inCourse: false }); unknown.push(k.t); continue; }
      const ids = k.parts ? k.parts.map(p => (p.matches || []).map(m => m.l)) : [(k.matches || []).map(m => m.l)];
      const content = ids[ids.length - 1], kn = !knownSet || ids.every(alts => alts.some(l => knownSet.has(l)));
      const l = content.find(x => knownSet?.has(x)) || content[0] || null;
      words.push({ t: k.t, l, known: kn, inCourse: true });
      if (!kn) for (const alts of ids) if (!alts.some(x => knownSet.has(x)) && X.lex[alts[0]] && !unlearned.includes(alts[0])) unlearned.push(alts[0]);
    }
    return { tokens, words, unknown, unlearned };
  }

  /* translate: the meaning → the sentence (early: tiles, later typed) */
  function translateItems(C, L, code, opts = {}) {
    const rng = opts.rng || Math.random, k = opts.k || known(C, L, code);
    const pool = opts.sentences || selectSentences(C, code, { known: k.R, maxUnknown: opts.strictKnown ? 0 : 'auto', variants: opts.variants ?? true, ...(opts.functions ? { functions: opts.functions } : {}) });
    const out = [], seen = new Set();
    for (const s of shuffled(pool, rng)) {
      if (!s.gloss || seen.has(s.gloss) || (s.nwords || 0) < 2) continue; seen.add(s.gloss);
      const unknown = s.unknown || s.req.filter(l => !k.R.has(l));
      // typed once every word of the sentence is known for production (§5.3 P); tiles before (or when asked)
      const typed = opts.mode === 'typed' || (opts.mode !== 'tiles' && s.req.every(l => k.P.has(l)));
      const tiles = sentenceTiles(s), wt = wrongTile(C, code, s, rng);
      out.push({ type: 'translate', kind: 'translate', mode: typed ? 'typed' : 'tiles', ...(opts.fn ? { fn: opts.fn } : {}), lang: code, sentence: s.id, gloss: s.gloss,
        answers: [s.text, ...(s.alts || [])], tiles: shuffled(wt ? [...tiles, wt] : tiles, rng), size: tiles.length, punct: endPunct(s), why: s.text, unknown });
      if (out.length >= (opts.max ?? 8)) break;
    }
    return out;
  }
  /* rewrite / expand: the same sentence under a constraint. A constraint the bank holds a variant for (negative, question, plural …)
     has stored answers (decided here); a paraphrase or an added detail is open: AI-judged, with the known-vocabulary check. */
  const EXPAND = [
    { id: 'time', text: 'Add when it happens (a time word).', need: x => (x.senses || []).some(c => /^time\./.test(c)) || x.pos === 'ADV' },
    { id: 'place', text: 'Add where it happens (a place).', need: x => (x.senses || []).some(c => /^place\./.test(c)) },
    { id: 'describe', text: 'Add a describing word (an adjective).', need: x => x.pos === 'ADJ' },
    { id: 'reason', text: 'Add a reason (because …).', need: x => (x.senses || []).includes('conj.because') },
    { id: 'and', text: 'Add a second sentence joined with “and” or “but”.', need: x => (x.senses || []).some(c => c === 'conj.and' || c === 'conj.but') }];
  function rewriteItems(C, L, code, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code), K = k.R, max = opts.max ?? 6;
    const byBase = {}; for (const s of X.sentences) if (s.variantOf) (byBase[s.variantOf] = byBase[s.variantOf] || []).push(s);
    const fits = s => s.req.filter(l => !K.has(l)).length <= s.cap;
    const can = EXPAND.filter(e => [...K].some(l => X.lex[l] && e.need(X.lex[l])));
    const out = [];
    for (const s of shuffled(selectSentences(C, code, { known: K, maxUnknown: 'auto', variants: false }), rng)) {
      if (!s.gloss || (s.nwords || 0) < 2) continue;
      const vs = (byBase[s.id] || []).filter(fits);
      const kind = opts.kind || (vs.length && rng() < 0.6 ? 'rewrite' : rng() < 0.5 ? 'expand' : 'rewrite');
      const base = { type: 'rewrite', lang: code, sentence: s.id, source: s.text, sourceGloss: s.gloss, unknown: s.unknown };
      if (kind === 'rewrite' && vs.length) { const v = vs[Math.floor(rng() * vs.length)]; out.push({ ...base, kind: 'rewrite', constraint: variantLabel(v.variant), target: v.id, gloss: v.gloss, answers: [v.text, ...(v.alts || [])], why: v.text }); }
      else if (kind === 'rewrite' && !opts.storedOnly) out.push({ ...base, kind: 'rewrite', constraint: 'Say the same thing in other words.', answers: [] });
      else if (kind === 'expand' && can.length) { const e = can[Math.floor(rng() * can.length)]; out.push({ ...base, kind: 'expand', constraint: e.text, expand: e.id, answers: [] }); }
      if (out.length >= max) break;
    }
    return out;
  }
  /* guided_compose: a prompt (or a picture) + required words → the learner writes a few sentences → the AI rubric per aspect */
  const TEXT_TYPES = [{ id: 'message', title: 'a short message to a friend', sentences: '2–3' }, { id: 'description', title: 'a short description', sentences: '3–4' }, { id: 'narration', title: 'a short story of what happened', sentences: '3–5' }];
  function composeTask(C, L, code, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code);
    const content = l => ['NOUN', 'VERB', 'ADJ'].includes(X.lex[l]?.pos) && (X.lex[l].senses || []).length;
    // the topic: the node asked for, else one of the learner's latest nodes with at least 3 known content words
    const cand = (opts.node ? [opts.node] : C.order.slice().reverse()).filter(nid => (X.byNode[nid] || []).filter(l => k.R.has(l) && content(l)).length >= 3);
    const nid = opts.node && cand.includes(opts.node) ? opts.node : cand[Math.floor(rng() * Math.min(3, cand.length))];
    if (!nid) return null;
    const words = shuffled((X.byNode[nid] || []).filter(l => k.R.has(l) && content(l)), rng);
    const required = []; for (const pos of ['NOUN', 'VERB', 'ADJ']) { const w = words.find(l => X.lex[l].pos === pos && !required.includes(l)); if (w) required.push(w); }
    for (const w of words) if (required.length < 3 && !required.includes(w)) required.push(w);
    const pastKnown = X.grammar['fn.past'] && [...k.R].some(l => X.lex[l]?.pos === 'VERB') && functionState(C, L, code, 'fn.past') !== 'new';
    const tt = TEXT_TYPES[k.R.size < 150 ? 0 : pastKnown && rng() < 0.4 ? 2 : Math.floor(rng() * 2)];
    const pic = (C.nodes[nid].concepts || []).find(cid => C.concepts[cid]?.media && (X.byConcept[cid] || []).some(l => required.includes(l))) || null;
    return { type: 'compose', kind: 'compose', lang: code, node: nid, topic: C.nodes[nid].title, textType: tt.id, prompt: `Write ${tt.title} (${tt.sentences} sentences) about “${C.nodes[nid].title}”.`, required, picture: pic };
  }
  /** The deterministic part of judging a written text: which required words it uses (in any form), which words are new or not in the course. */
  function composeCheck(C, code, text, task, knownSet) {
    const r = checkText(C, code, text, knownSet), used = new Set();
    for (const k of r.tokens) { if (k.p || k.unknown) continue; for (const ids of (k.parts ? k.parts.map(p => p.matches || []) : [k.matches || []])) for (const m of ids) if ((task.required || []).includes(m.l)) used.add(m.l); }
    const sentences = (String(text).match(/[^.!?。！？؟]+[.!?。！？؟]*/g) || []).filter(x => x.trim()).length;
    return { ...r, used: [...used], missing: (task.required || []).filter(l => !used.has(l)), sentences };
  }

  /* graded_reader: texts made of bank sentences of related frames, at most one unknown word per sentence (§3.8) */
  const frameFamily = id => { const f = String(id || '').split('.')[1] || String(id); return f === 'notlike' ? 'like' : f; };
  function readerTexts(C, L, code, opts = {}) {
    const X = C.lang[code], k = opts.k || known(C, L, code), K = k.R, size = opts.size || 6;
    const fam = {};
    for (const s of X.sentences) {
      if (s.variantOf || !s.gloss) continue;
      const unknown = s.req.filter(l => !K.has(l)); if (unknown.length > (opts.maxUnknown ?? 1)) continue;
      (fam[frameFamily(s.frame)] = fam[frameFamily(s.frame)] || []).push({ s, unknown });
    }
    const out = [];
    for (const [f, list] of Object.entries(fam)) {
      const seen = new Set(), uniq = list.filter(x => !seen.has(x.s.gloss) && seen.add(x.s.gloss)).sort((a, b) => a.unknown.length - b.unknown.length || (a.s.id < b.s.id ? -1 : 1));
      if (uniq.length < 4) continue;
      for (let i = 0; i + 3 < uniq.length && out.filter(t => t.family === f).length < (opts.perFamily || 3); i += size) {
        const part = uniq.slice(i, i + size).sort((a, b) => a.s.id < b.s.id ? -1 : 1); if (part.length < 4) break;
        const frames = {}; part.forEach(x => frames[x.s.frame] = (frames[x.s.frame] || 0) + 1);
        const main = Object.entries(frames).sort((a, b) => b[1] - a[1])[0][0];
        const unknown = uniqStr(part.flatMap(x => x.unknown));
        out.push({ id: `${code}:${f}:${i / size}`, lang: code, family: f, title: (C.frames[main]?.meaning || f).replace(/\s*\(.*?\)\s*/g, ' ').trim(), frames: Object.keys(frames), sentences: part.map(x => x.s.id), unknown });
      }
    }
    return out.sort((a, b) => a.unknown.length - b.unknown.length || b.sentences.length - a.sentences.length || (a.id < b.id ? -1 : 1));
  }
  /** Comprehension questions of a text: "Which of these does the text say?" — the meaning of one of its sentences among meanings
      of sentences of the same frames that are not in the text (never one that means the same). Answers from the stored glosses. */
  function readerQuestions(C, L, code, text, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, n = opts.n || 3, ids = new Set(text.sentences);
    const conceptKey = o => o.req.map(l => (X.lex[l]?.senses || [])[0] || l).sort().join('|');
    const inText = text.sentences.map(id => X.sentenceById[id]), glosses = new Set(inText.map(s => s.gloss)), keys = new Set(inText.map(conceptKey));
    const pool = X.sentences.filter(o => !ids.has(o.id) && o.gloss && !glosses.has(o.gloss) && !keys.has(conceptKey(o)) && frameFamily(o.frame) === text.family);
    const wide = X.sentences.filter(o => !ids.has(o.id) && o.gloss && !glosses.has(o.gloss) && !keys.has(conceptKey(o)));
    const out = [];
    for (const s of shuffled(inText, rng)) {
      const wrong = uniqStr([...shuffled(pool, rng), ...shuffled(wide, rng)].map(o => o.gloss)).slice(0, 3);
      if (wrong.length < 2) continue;
      out.push({ type: 'choose', kind: 'quiz', reader: text.id, lang: code, sentence: s.id, prompt: 'Which of these does the text say?', ask: '', options: shuffled([s.gloss, ...wrong], rng), answer: s.gloss, why: s.gloss });
      if (out.length >= n) break;
    }
    return out;
  }

  /* number_words: digits ↔ words, from the number words of the lexicon (concepts num.N) and the way the language builds 21–99 */
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const digitsIn = (code, n) => code === 'ar' ? String(n).replace(/\d/g, d => AR_DIGITS[d]) : String(n);
  /** The stored number words of a language: n → [lexeme ids] (only known ones when K is given). */
  function numberWords(C, code, K) {
    const X = C.lang[code], out = {};
    for (const [id, x] of Object.entries(X.lex)) { const n = numOf(X, id); if (n == null || x.pos !== 'NUM' || (K && !K.has(id))) continue; (out[n] = out[n] || []).push(id); }
    return out;
  }
  const findCell = (lx, ...tagSets) => { const f = lx.forms || {}; for (const tags of tagSets) { const c = Object.keys(f).find(x => cellHas(x, tags) && !/(^|;)(CONST|PFX|ALT)(;|$)/.test(x)); if (c) return f[c]; } return null; };
  /** A number word in the form used when counting things of one gender (ar / he; MASC is the form used with masculine nouns). */
  function numberForm(C, code, id, gender) {
    const lx = C.lang[code].lex[id]; if (!lx) return null;
    if (!Object.keys(lx.forms || {}).length) return lx.lemma;
    if (code === 'ar') return findCell(lx, ['NOM', gender, 'INDF'], ['NOM', gender], ['NOM', 'INDF'], ['NOM']) || lx.lemma;
    return findCell(lx, [gender], []) || lx.lemma;
  }
  /** Hebrew וְ "and" before a word: וּ before a shva and before ב מ פ, וַ / וֶ / וָ before a hataf; null where the course has no rule (a begadkefat letter with dagesh). */
  function heAnd(word) {
    const cs = [...nfc(word)], first = cs[0], marks = []; for (let i = 1; i < cs.length && /\p{M}/u.test(cs[i]); i++) marks.push(cs[i]);
    if ('בגדכפת'.includes(first) && marks.includes('ּ')) return null;
    if (marks.includes('ְ') || 'במפ'.includes(first)) return nfc('וּ' + word);
    if (marks.includes('ֲ')) return nfc('וַ' + word);
    if (marks.includes('ֱ')) return nfc('וֶ' + word);
    if (marks.includes('ֳ')) return nfc('וָ' + word);
    return nfc('וְ' + word);
  }
  /** The number n in words, built from the stored number words (deterministic): 0–20, the tens, 100, 1000 as stored; 21–99 as the
      language builds them (de einundzwanzig, zh 二十一, ar وَاحِدٌ وَعِشْرُونَ — unit + وَ + ten —, he עֶשְׂרִים וְאַחַת — ten + וְ + unit).
      opts: {gender: 'MASC' | 'FEM' (ar, he), K: only known words}. → {text, lex: [ids]} or null when the course cannot say it. */
  function numberWord(C, code, n, opts = {}) {
    const X = C.lang[code], W = numberWords(C, code), g = opts.gender || 'MASC', K = opts.K;
    const pick = v => (W[v] || []).filter(id => !(code === 'zh' && v === 2 && X.lex[id].lemma === '两'))[0] || null;   // zh: 二 inside numbers, 两 only before a measure word
    const ok = ids => !K || ids.every(id => K.has(id));
    const one = v => { const id = pick(v); if (!id) return null; return { text: code === 'ar' || code === 'he' ? numberForm(C, code, id, g) : X.lex[id].lemma, lex: [id] }; };
    if (W[n]) { const r = one(n); return r && ok(r.lex) ? r : null; }
    if (n < 21 || n > 99) return null;
    const u = n % 10, t = n - u, ui = pick(u), ti = pick(t); if (!ui || !ti) return null;
    const andId = Object.keys(X.lex).find(id => (X.lex[id].senses || []).includes('conj.and') && (code === 'de' || code === 'zh' || X.lex[id].prefix));
    let text = null; const lex = [ui, ti];
    if (code === 'de') { if (!andId) return null; text = (u === 1 ? 'ein' : X.lex[ui].lemma) + X.lex[andId].lemma + X.lex[ti].lemma; lex.push(andId); }   // einundzwanzig: eins loses its s
    else if (code === 'zh') text = X.lex[ti].lemma + X.lex[ui].lemma;   // 二十 + 一
    else if (code === 'ar') { if (!andId || (g === 'FEM' && u === 1)) return null; text = numberForm(C, code, ui, g) + ' ' + nfc(X.lex[andId].lemma + numberForm(C, code, ti, g)); lex.push(andId); }   // 21 with a feminine noun is إِحْدَى وَعِشْرُونَ: not built here
    else if (code === 'he') { const a = heAnd(numberForm(C, code, ui, g)); if (!andId || !a) return null; text = X.lex[ti].lemma + ' ' + a; lex.push(andId); }
    else return null;
    return ok(lex) ? { text: nfc(text), lex } : null;
  }
  /** Numbers that are easily confused with n (13 / 30, 16 / 60, neighbours, swapped digits) — for the wrong options. */
  const confusables = n => uniqStr([n < 20 && n > 12 ? (n - 10) * 10 : null, n % 10 === 0 && n >= 30 && n <= 90 ? n / 10 + 10 : null, n > 9 && n < 100 ? (n % 10) * 10 + Math.floor(n / 10) : null, n + 1, n - 1, n + 10, n - 10, n + 2].filter(x => x != null && x >= 0 && x !== n));
  function numberItems(C, L, code, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code), K = k.R, max = opts.max ?? 10, out = [];
    const say = (n, g) => numberWord(C, code, n, { K, gender: g });
    const range = []; for (let n = 0; n <= 1000; n++) if (say(n)) range.push(n);
    for (const n of shuffled(range, rng)) {
      const w = say(n); const others = confusables(n).filter(x => say(x));
      for (const x of shuffled(range, rng)) if (others.length < 6 && x !== n && !others.includes(x)) others.push(x);
      const wrong = uniqStr(others.map(x => say(x).text)).filter(t => t !== w.text).slice(0, 3);
      if (wrong.length < 2) continue;
      const g = code === 'ar' || code === 'he' ? ' (the form used with masculine nouns)' : '';
      if (rng() < 0.5) out.push({ type: 'number', kind: 'digits2word', lang: code, n, prompt: digitsIn(code, n), ask: `How do you say it in words?${g}`, options: shuffled([w.text, ...wrong], rng), answer: w.text, why: `${n} = ${w.text}`, lex: w.lex });
      else { const ws = others.slice(0, 3).map(String); out.push({ type: 'number', kind: 'word2digits', lang: code, n, prompt: w.text, ask: 'Which number is it?', options: shuffled([String(n), ...ws], rng), answer: String(n), why: `${w.text} = ${n}`, lex: w.lex }); }
      if (out.length >= Math.ceil(max * 0.6)) break;
    }
    out.push(...countingItems(C, L, code, { k, rng, max: max - out.length }));
    return shuffled(out, rng).slice(0, max);
  }
  /** Counting things: ar / he — the gender of 3–10 is the opposite of the noun's (ar ثَلَاثَةُ كُتُبٍ, he שְׁלוֹשָׁה סְפָרִים: the form in -a with a masculine noun);
      zh — 两 before a measure word (两本书), never 二. Everything from the stored forms, the noun's gender and its measure word. */
  function countingItems(C, L, code, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code), K = k.R, out = [], max = opts.max ?? 4;
    if (max <= 0) return out;
    const nouns = shuffled(Object.values(X.lex).filter(x => K.has(x.id) && x.pos === 'NOUN' && ['MASC', 'FEM'].includes(x.gender) && x.class !== 'collective' && !x.collective), rng);
    if (code === 'ar' || code === 'he') {
      const W = numberWords(C, code, K), plCell = code === 'ar' ? ['N', 'GEN', 'PL', 'INDF'] : ['N', 'PL', 'INDF'];
      for (const nn of nouns) {
        const pl = findCell(nn, plCell); if (!pl) continue;
        const n = 3 + Math.floor(rng() * 8), id = (W[n] || [])[0]; if (!id) continue;
        const lx = X.lex[id], cell = g => code === 'ar' ? Object.keys(lx.forms || {}).find(c => cellHas(c, ['NOM', g, 'CONST'])) : Object.keys(lx.forms || {}).find(c => canon(c) === canon('NUM;' + g));
        const m = cell('MASC'), f = cell('FEM'); if (!m || !f || lx.forms[m] === lx.forms[f]) continue;
        const right = lx.forms[nn.gender === 'MASC' ? m : f], wrong = lx.forms[nn.gender === 'MASC' ? f : m];
        out.push({ type: 'number', kind: 'counting', lang: code, n, noun: nn.id, prompt: `${digitsIn(code, n)} × ${nn.lemma}`, ask: `${n} — ${glossOfLex(C, X, nn.id)} (plural): which is right?`,
          options: shuffled([right + ' ' + pl, wrong + ' ' + pl], rng), answer: right + ' ' + pl,
          why: `${nn.lemma} is ${GENDER_WORD[nn.gender]} → ${right} ${pl}. From 3 to 10 the number takes the form of the other gender (the form in -a goes with masculine nouns).`, lex: [id, nn.id] });
        if (out.length >= max) break;
      }
    } else if (code === 'zh') {
      const two = Object.keys(X.lex).filter(id => numOf(X, id) === 2), liang = two.find(id => X.lex[id].lemma === '两'), er = two.find(id => X.lex[id].lemma === '二');
      if (liang && er && K.has(liang)) for (const nn of shuffled(Object.values(X.lex).filter(x => K.has(x.id) && x.pos === 'NOUN' && (x.measure || []).length), rng)) {
        const m = nn.measure[0], ph = w => w + m + nn.lemma;
        out.push({ type: 'number', kind: 'counting', lang: code, n: 2, noun: nn.id, prompt: `2 × ${nn.lemma}`, ask: `two ${glossOfLex(C, X, nn.id)}: which is right?`, options: shuffled([ph('两'), ph('二')], rng), answer: ph('两'), why: `${ph('两')} — before a measure word “two” is 两; 二 is for counting and inside numbers (十二, 二十).`, lex: [liang, nn.id] });
        if (out.length >= max) break;
      }
    }
    return out;
  }

  /* clock and date: read from the annotated words of bank sentences — a time or a date is only taken when the gloss confirms it */
  const EN_CARD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const EN_ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
  for (const [t, o] of [[20, 'twenty'], [30, 'thirty']]) for (let u = 1; u <= 9 && t + u <= 31; u++) EN_ORD[t + u] = o + '-' + EN_ORD[u];
  EN_ORD[30] = 'thirtieth';
  /** Where the hour stands next to the clock word, and which kind of number it is (the clock patterns of the course languages, docs/LANGUAGES.md §6.5). */
  const CLOCK = { de: { side: -1, num: 'card' }, zh: { side: -1, num: 'card' }, ar: { side: 1, num: 'ord' }, he: { side: 1, num: 'card' } };
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map(m => 'time.' + m);
  const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(d => 'time.' + d);
  /** The time a bank sentence names → {h, m} or null. */
  function clockOf(C, code, s) {
    const X = C.lang[code], spec = CLOCK[code]; if (!spec) return null;
    const ws = flatWords(s), isClock = k => k.l && sensesOf(X, k.l).includes('time.oclock') && !/(^|;)(PL|DU)(;|$)/.test(k.f || ''), i = ws.findIndex(isClock);
    if (i < 0 || ws.filter(isClock).length > 1) return null;   // one time per sentence
    let h = null, hi = -1;
    for (let d = 1; d <= 2 && h == null; d++) { const w = ws[i + spec.side * d]; if (!w || !w.l) continue; const v = spec.num === 'ord' ? ordOf(X, w.l) : numOf(X, w.l); if (v != null) { h = v; hi = i + spec.side * d; } }
    if (h == null || h < 1 || h > 24) return null;
    const isHalf = w => sensesOf(X, w.l).includes('num.half'), isQuarter = w => sensesOf(X, w.l).includes('num.quarter');
    const end = Math.max(i, hi);
    if (ws.slice(0, end + 1).some(w => isHalf(w) || isQuarter(w))) return null;   // German halb vier (= 3:30), a quarter to …: not read here
    let m = 0; const next = ws.slice(end + 1, end + 4);
    for (let j = 0; j < next.length; j++) {
      const w = next[j];
      if (isHalf(w)) { m = 30; break; }
      if (isQuarter(w)) { m = 15; break; }
      if (numOf(X, w.l) != null) { if (numOf(X, w.l) === 1 && next[j + 1] && isQuarter(next[j + 1])) { m = 15; break; } return null; }   // zh 一刻 = a quarter; minutes in numbers (三点十分, שָׁלוֹשׁ וְעֶשְׂרִים): not read here
    }
    // the gloss must confirm it (in English: "at six", "six o'clock", "half past three"; any language: "6:30")
    const g = String(s.gloss || '').toLowerCase().replace(/’/g, "'"), hw = h <= 20 ? EN_CARD[h] : String(h);
    const digits = new RegExp(`\\b${h}:${String(m).padStart(2, '0')}\\b`).test(g);
    if (!digits && /\d:\d\d/.test(g)) return null;
    const enHour = new RegExp(`\\b(at|by|until|till|from|since|after|before) (${hw}|${h})\\b`).test(g) || new RegExp(`\\b(${hw}|${h}) o'clock`).test(g) || new RegExp(`\\b(half|quarter) past (${hw}|${h})\\b`).test(g);
    const enMin = m === 0 ? !/\b(half|quarter|past|to|minutes?)\b/.test(g.replace(/\b(at|by|until|from|since|after|before) /g, '')) : m === 30 ? new RegExp(`half past (${hw}|${h})\\b`).test(g) : new RegExp(`quarter past (${hw}|${h})\\b`).test(g);
    return digits || (C.explainLang === 'en' && enHour && enMin) ? { h, m } : null;
  }
  /** The date a bank sentence names → {d, m} or null (a day number or ordinal next to a month word; the gloss must confirm it). */
  function dateOf(C, code, s) {
    const X = C.lang[code], ws = flatWords(s);
    const isMonth = k => k.l && sensesOf(X, k.l).some(c => MONTHS.includes(c)), mi = ws.findIndex(isMonth); if (mi < 0 || ws.filter(isMonth).length > 1) return null;
    const mc = sensesOf(X, ws[mi].l).find(c => MONTHS.includes(c)), m = MONTHS.indexOf(mc) + 1;
    const between = w => !!w && !!w.l && (['ADP', 'DET'].includes(X.lex[w.l]?.pos) || !!X.lex[w.l]?.prefix);   // am dritten März, الْخَامِسُ مِنْ مَايُو, אַרְבָּעָה בְּ־יוּלִי
    const near = []; for (const d of [-2, -1, 1, 2]) { const w = ws[mi + d]; if (!w || !w.l) continue; if (Math.abs(d) === 2 && !between(ws[mi + d / 2])) continue; const v = ordOf(X, w.l) ?? numOf(X, w.l); if (v != null && v >= 1 && v <= 31) near.push({ d: Math.abs(d), v }); }
    near.sort((a, b) => a.d - b.d); if (!near.length || (near[1] && near[1].d === near[0].d && near[1].v !== near[0].v)) return null;
    const day = near[0].v, g = String(s.gloss || '').toLowerCase(), mg = String(C.concepts[mc]?.gloss || '').toLowerCase();
    const D = `(${day}(st|nd|rd|th)?${C.explainLang === 'en' && EN_ORD[day] ? '|' + EN_ORD[day] : ''})`;
    const ok = mg && (new RegExp(`\\b(the )?${D} of ${mg}\\b`).test(g) || new RegExp(`\\b${mg} ${D}\\b`).test(g) || new RegExp(`\\b${D}\\.? ?${mg}\\b`).test(g));
    return ok ? { d: day, m } : null;
  }
  const hm = t => `${t.h}:${String(t.m).padStart(2, '0')}`;
  function clockItems(C, L, code, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code), max = opts.max ?? 6;
    const all = selectSentences(C, code, { known: k.R, maxUnknown: 'auto' }).map(s => ({ s, t: clockOf(C, code, s) })).filter(x => x.t);
    const out = [];
    for (const { s, t } of shuffled(all, rng)) {
      const times = uniqStr([hm(t), ...shuffled([{ h: t.h % 12 + 1, m: t.m }, { h: t.h, m: (t.m + 30) % 60 }, { h: (t.h + 10) % 12 + 1, m: t.m }, { h: (t.h + 5) % 12 + 1, m: t.m === 0 ? 30 : 0 }], rng).map(hm)]).slice(0, 4);
      const others = []; for (const o of shuffled(all, rng)) if (hm(o.t) !== hm(t) && !others.some(x => hm(x.t) === hm(o.t))) others.push(o);   // other times, one sentence each
      if (others.length >= 2 && rng() < 0.5) {
        out.push({ type: 'clock', kind: 'time2sentence', lang: code, time: t, sentence: s.id, ask: 'Which sentence says this time?', options: shuffled([s.id, ...others.slice(0, 3).map(o => o.s.id)], rng), answer: s.id, why: `${hm(t)} — ${s.text}`, unknown: s.unknown });
      } else out.push({ type: 'clock', kind: 'sentence2time', lang: code, time: t, sentence: s.id, ask: 'What time does it say?', options: shuffled(times, rng), answer: hm(t), why: `${s.text} — ${hm(t)}`, unknown: s.unknown });
      if (out.length >= max) break;
    }
    return out;
  }
  function dateItems(C, L, code, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code), K = k.R, max = opts.max ?? 8, out = [];
    const words = cs => cs.map((c, i) => ({ c, i, ids: (X.byConcept[c] || []).filter(id => K.has(id)) })).filter(x => x.ids.length);
    const months = words(MONTHS), days = words(WEEKDAYS);
    const lemma = id => X.lex[id].lemma;
    for (const mo of shuffled(months, rng).slice(0, 3)) {
      const wrong = shuffled(months.filter(x => x.c !== mo.c), rng).slice(0, 3).map(x => lemma(x.ids[0])); if (wrong.length < 2) break;
      const id = mo.ids[Math.floor(rng() * mo.ids.length)];
      if (rng() < 0.5) out.push({ type: 'date', kind: 'month2word', lang: code, prompt: digitsIn(code, mo.i + 1) + '.', ask: 'Which month is it?', options: shuffled([lemma(id), ...wrong], rng), answer: lemma(id), why: `${mo.i + 1} = ${mo.ids.map(lemma).join(' / ')} (${C.concepts[mo.c].gloss})`, lex: [id] });
      else { const nums = shuffled(months.filter(x => x.c !== mo.c), rng).slice(0, 3).map(x => String(x.i + 1)); out.push({ type: 'date', kind: 'word2month', lang: code, prompt: lemma(id), ask: 'Which month is it (its number)?', options: shuffled([String(mo.i + 1), ...nums], rng), answer: String(mo.i + 1), why: `${lemma(id)} = ${mo.i + 1} (${C.concepts[mo.c].gloss})`, lex: [id] }); }
    }
    for (const dy of shuffled(days, rng).slice(0, 2)) {
      const nx = days.find(x => x.i === (dy.i + 1) % 7); if (!nx) continue;
      const wrong = shuffled(days.filter(x => x.c !== nx.c && x.c !== dy.c), rng).slice(0, 3).map(x => lemma(x.ids[0])); if (wrong.length < 2) continue;
      out.push({ type: 'date', kind: 'nextday', lang: code, prompt: lemma(dy.ids[0]), ask: 'Which day comes after it?', options: shuffled([lemma(nx.ids[0]), ...wrong], rng), answer: lemma(nx.ids[0]), why: `${lemma(dy.ids[0])} → ${lemma(nx.ids[0])} (${C.concepts[dy.c].gloss} → ${C.concepts[nx.c].gloss})`, lex: [dy.ids[0], nx.ids[0]] });
    }
    const ords = Object.keys(X.lex).filter(id => K.has(id) && ordOf(X, id) != null && (X.lex[id].senses || [])[0] === `num.ord.${ordOf(X, id)}`);
    for (const id of shuffled(ords, rng).slice(0, 2)) {
      const n = ordOf(X, id), wrong = uniqStr(shuffled(ords.filter(x => ordOf(X, x) !== n), rng).map(lemma)).slice(0, 3); if (wrong.length < 2) continue;
      out.push({ type: 'date', kind: 'ordinal', lang: code, prompt: digitsIn(code, n) + '.', ask: `The ${EN_ORD[n] || n + 'th'}: which word?`, options: shuffled([lemma(id), ...wrong], rng), answer: lemma(id), why: `${n}. = ${lemma(id)}`, lex: [id] });
    }
    const fmt = t => `${t.d} ${C.concepts[MONTHS[t.m - 1]]?.gloss || t.m}`;
    for (const s of shuffled(selectSentences(C, code, { known: K, maxUnknown: 'auto' }), rng)) {
      const t = dateOf(C, code, s); if (!t) continue;
      const opts2 = uniqStr([fmt(t), fmt({ d: t.d, m: t.m % 12 + 1 }), fmt({ d: t.d % 28 + 1, m: t.m }), fmt({ d: (t.d + 9) % 28 + 1, m: (t.m + 5) % 12 + 1 })]);
      out.push({ type: 'date', kind: 'sentence2date', lang: code, sentence: s.id, ask: 'Which date does it say?', options: shuffled(opts2, rng), answer: fmt(t), why: `${s.text} — ${fmt(t)}`, unknown: s.unknown });
      if (out.filter(x => x.kind === 'sentence2date').length >= 2) break;
    }
    return shuffled(out, rng).slice(0, max);
  }

  /* register and dialogue_turn: choose the right formula, complete a turn — from bank sentences with a register (variants by
     formality or by the person addressed) and the exchanges the bank holds (greetings first). */
  function registerItems(C, L, code, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code), max = opts.max ?? 6, out = [];
    const fits = s => s.req.filter(l => !k.R.has(l)).length <= s.cap;
    const ASK = { Formality: { formal: 'Which one is polite (formal)?', informal: 'Which one is informal (familiar)?' }, Address: { formal: 'Which one is polite (formal)?', informal: 'Which one is informal (familiar)?' },
      Addressee: { FEM: 'Which one do you say to a woman?', MASC: 'Which one do you say to a man?', PL: 'Which one do you say to several people?' } };
    for (const s2 of shuffled(X.sentences.filter(s => s.variantOf && fits(s)), rng)) {
      const [key, val] = Object.entries(s2.variant || {}).find(([kk]) => ASK[kk]) || []; if (!key) continue;
      const ask = ASK[key][val] || ASK[key][String(val).toLowerCase()]; const s1 = X.sentenceById[s2.variantOf];
      if (!ask || !s1 || !fits(s1) || cmpText(code, s1.text) === cmpText(code, s2.text)) continue;
      out.push({ type: 'register', kind: 'register', lang: code, sentence: s2.id, ask, gloss: s2.gloss.replace(/\s*\((polite|formal|informal|to a (wo)?man|to several people)\)\s*/gi, ' ').trim(),
        options: shuffled([s2.text, s1.text], rng), answer: s2.text, why: `${s2.text} — ${s2.gloss}`, unknown: uniqStr([...s2.req, ...s1.req].filter(l => !k.R.has(l))) });
      if (out.length >= max) break;
    }
    return out;
  }
  /** The turns of an exchange stored as one sentence (Wie geht's? Gut, danke.) → [[tokens of turn 1], [tokens of turn 2] …] */
  function turnsOf(s) {
    const ts = s.tokens || [], out = [[]];
    ts.forEach((k, i) => { out[out.length - 1].push(k); if (k.p === true && /[.?!。？！؟]/.test(k.t) && ts.slice(i + 1).some(x => !x.p)) out.push([]); });
    return out.filter(t => t.some(k => !k.p));
  }
  function dialogueItems(C, L, code, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, k = opts.k || known(C, L, code), max = opts.max ?? 6, out = [];
    const lem = ts => new Set(ts.flatMap(t => t.parts ? t.parts.map(p => p.l) : [t.l]).filter(Boolean));
    const join = ts => joinTokens(ts, X.language.tokenJoin);
    const ex = selectSentences(C, code, { known: k.R, maxUnknown: 'auto' }).map(s => ({ s, turns: turnsOf(s) })).filter(x => x.turns.length === 2)
      .map(x => ({ ...x, a: join(x.turns[0]), b: join(x.turns[1]), la: lem(x.turns[0]), lb: lem(x.turns[1]) }));
    const ordered = [...shuffled(ex.filter(x => x.s.frame === 'fr.greet'), rng), ...shuffled(ex.filter(x => x.s.frame !== 'fr.greet' && /[?？؟]\s*$/.test(x.a)), rng)];
    const used = new Set();
    for (const x of ordered) {
      if (used.has(x.a)) continue;
      const wrong = uniqStr(shuffled(ex.filter(o => o.b !== x.b && ![...o.la].some(l => x.la.has(l)) && ![...o.lb].some(l => x.lb.has(l))), rng).map(o => o.b)).slice(0, 3);
      if (wrong.length < 2) continue; used.add(x.a);
      const [ga, gb] = String(x.s.gloss).split(/\s+[–—]\s+/);
      out.push({ type: 'dialogue', kind: 'dialogue', lang: code, sentence: x.s.id, prompt: x.a, promptGloss: gb ? ga : '', ask: 'What fits as the answer?', options: shuffled([x.b, ...wrong], rng), answer: x.b, why: `${x.s.text} — ${x.s.gloss}`, unknown: x.s.unknown });
      if (out.length >= max) break;
    }
    return out;
  }

  /* the AI's tasks — built here (pure), sent by the UI with the learner's own key; their answers are never an answer key */
  const AI_VERDICT = { type: 'object', required: ['verdict', 'feedback'], properties: { verdict: { type: 'string', enum: ['correct', 'acceptable', 'wrong'] }, corrected: { type: 'string' },
    mistakes: { type: 'array', items: { type: 'object', required: ['wrong', 'right', 'why'], properties: { wrong: { type: 'string' }, right: { type: 'string' }, why: { type: 'string' } } } }, feedback: { type: 'string' } } };
  const AI_RUBRIC = { type: 'object', required: ['aspects', 'feedback'], properties: {
    aspects: { type: 'object', required: ['grammar', 'vocabulary', 'spelling', 'cohesion'], properties: Object.fromEntries(['grammar', 'vocabulary', 'spelling', 'cohesion'].map(a => [a, { type: 'object', required: ['score', 'comment'], properties: { score: { type: 'integer', minimum: 0, maximum: 5 }, comment: { type: 'string' } } }])) },
    corrections: { type: 'array', items: { type: 'object', required: ['from', 'to', 'why'], properties: { from: { type: 'string' }, to: { type: 'string' }, why: { type: 'string' } } } },
    corrected: { type: 'string' }, feedback: { type: 'string' } } };
  const langLabel = (C, code) => C.lang[code]?.language?.name || code;
  /** The prompt for grading an open answer. task: {kind: translate | rewrite | expand | compose, lang, …} → {system, prompt, schema, name} */
  function aiTask(C, L, code, task, opts = {}) {
    const X = C.lang[code], name = langLabel(C, code), expl = opts.chatLang || C.explainLang || 'en';
    const k = opts.k || known(C, L, code), words = [...k.R].slice(0, opts.cap || 120).map(l => `${X.lex[l].lemma} = ${glossOfLex(C, X, l)}`).join('; ');
    const system = `[noema:lang-judge] You grade the open answer of a learner of ${name} (course "${C.data.course.title}"). Write every explanation in the language with code "${expl}". Judge only what is asked; be precise and kind. ` +
      `The course's stored answers are the reference: you do not replace them. Accept every answer that is correct ${name} and says what was asked, even when it differs from the reference. ` +
      `When you correct, change as little as possible and keep the learner's words. Never invent facts about the language; when unsure, say so in the feedback.\nThe learner knows these words: ${words || '(few yet)'}.`;
    let prompt, schema = AI_VERDICT;
    if (task.kind === 'translate') prompt = `The learner had to say in ${name}: "${task.gloss}".\nThe course's answer(s): ${task.reference.map(r => `"${r}"`).join(' / ')}.\nThe learner wrote: "${task.answer}".\nIs it correct ${name} with this meaning? verdict: correct (fully right), acceptable (right meaning, small slips), wrong. corrected: the learner's sentence, minimally corrected (or unchanged when it is right). mistakes: each error with the right form and why.`;
    else if (task.kind === 'rewrite') prompt = `The sentence: "${task.source}" ("${task.sourceGloss}").\nThe task: ${task.constraint}\n${task.reference?.length ? `One answer the course knows: ${task.reference.map(r => `"${r}"`).join(' / ')}.\n` : ''}The learner wrote: "${task.answer}".\nDoes it do the task in correct ${name}? verdict: correct, acceptable (does it, small slips) or wrong (wrong language, wrong meaning or the task not done). corrected: the learner's sentence minimally corrected. mistakes: each error.`;
    else if (task.kind === 'expand') prompt = `The sentence: "${task.source}" ("${task.sourceGloss}").\nThe task: keep the sentence and ${task.constraint.charAt(0).toLowerCase() + task.constraint.slice(1)}\nThe learner wrote: "${task.answer}".\nDoes it keep the meaning, add what was asked and stay correct ${name}? verdict: correct, acceptable or wrong. corrected: minimally corrected. mistakes: each error.`;
    else { schema = AI_RUBRIC; prompt = `The task: ${task.prompt}\nWords the learner had to use: ${(task.required || []).map(l => `${X.lex[l]?.lemma} (${glossOfLex(C, X, l)})`).join(', ')}.\nThe learner wrote:\n"""${task.answer}"""\nGrade each aspect 0–5 with a short comment: grammar, vocabulary (fits the task, the required words used well), spelling (and vowel marks / characters as written), cohesion (the sentences connect). corrections: every error as {from: the exact wrong text, to: the fix, why}. corrected: the whole text minimally corrected. feedback: two or three sentences.`; }
    return { system, prompt, schema, name: task.kind === 'compose' ? 'rubric' : 'verdict' };
  }
  /** The prompt for a new graded text written by the AI and checked by the tokenizer (the LLM proposes, the validator decides). */
  function readerTask(C, L, code, opts = {}) {
    const X = C.lang[code], k = opts.k || known(C, L, code), name = langLabel(C, code);
    const words = [...k.R].slice(0, opts.cap || 200).map(l => X.lex[l].lemma).join(', ');
    return { name: 'reader', system: `[noema:lang-reader] You write graded reading texts for a learner of ${name}. Use ONLY words from the learner's list, in any of their forms; at most one word per sentence may be outside it. Simple, natural, neutral sentences; no names of real people.`,
      prompt: `The learner's words: ${words}.\nWrite a short text (${opts.sentences || 5} sentences) in ${name}${opts.topic ? ` about "${opts.topic}"` : ''}: one object per sentence, with its translation into the language with code "${opts.chatLang || C.explainLang}".`,
      schema: { type: 'object', required: ['title', 'sentences'], properties: { title: { type: 'string' }, sentences: { type: 'array', minItems: 2, items: { type: 'object', required: ['text', 'gloss'], properties: { text: { type: 'string' }, gloss: { type: 'string' } } } } } },
      // the validator decides: sentences that fail are dropped by the UI; a repair is asked only when fewer than three would remain
      validate: data => { const errs = readerProblems(C, code, data, k.R), bad = new Set(errs.map(e => +e.match(/\d+/)[0])); return (data.sentences || []).length - bad.size >= Math.min(3, (data.sentences || []).length) ? [] : errs; } };
  }
  /** The checks of an AI-written text: every word in the course, at most one unknown word per sentence. → [problems] (empty = accepted) */
  function readerProblems(C, code, data, knownSet) {
    const errs = [];
    (data.sentences || []).forEach((s, i) => { const r = checkText(C, code, s.text, knownSet); if (r.unknown.length) errs.push(`sentence ${i + 1}: words not in the course: ${r.unknown.join(', ')} — use other words`); if (r.unlearned.length > 1) errs.push(`sentence ${i + 1}: ${r.unlearned.length} words the learner does not know yet — at most one`); });
    return errs;
  }

  /* the tutor in a language (§8 Tutor): the context, the learner's known words (capped), the rule, the intent of the button */
  const TUTOR_RULE = 'Use the learner\'s known words for everything you write in the language; at most one new word per sentence, and gloss it right after the sentence (word = meaning). Never give the answers of the app\'s exercises: the app checks those against its stored answers.';
  const TUTOR_INTENTS = {
    explain: 'The learner pressed "Explain this rule": explain the grammar point below in depth — what it is, how it works, the traps — with short examples made of their known words.',
    compare: 'The learner pressed "Compare the languages": show how the same point works in each language of the course (below), what is the same, what differs, and where one language misleads in another. Neutral: no language is the norm.',
    quiz: 'The learner pressed "Quiz this node": ask one short question at a time about the words and the grammar below; wait for the answer, say whether it is right and why, then ask the next.',
    chat: 'The learner pressed "A conversation at my level": hold a simple conversation in the language, one or two short sentences per turn, made of their known words; correct their mistakes gently after their turn.' };
  function tutorContext(C, L, code, ctx = {}, opts = {}) {
    const X = C.lang[code], k = opts.k || known(C, L, code), cap = opts.cap || 150;
    const ids = [...k.P, ...[...k.R].filter(l => !k.P.has(l))].filter(l => X.lex[l]);
    const words = ids.slice(0, cap).map(l => ({ lex: l, lemma: X.lex[l].lemma, gloss: glossOfLex(C, X, l), p: k.P.has(l) }));
    const parts = [], blockText = b => [b.title, b.text, ...(b.items || []).map(x => typeof x === 'string' ? x : [x.title, ...(x.points || []), x.term, x.def].filter(Boolean).join(': ')), ...(b.rows || []).map(r => r.join(' | ')), ...(b.questions || [])].filter(Boolean).join(' ');
    const fnText = (c, fid, full) => { const g = C.lang[c].grammar[fid]; if (!g) return `${langLabel(C, c)}: not written yet.`; return `${langLabel(C, c)} (${g.status || 'realized'}): ${g.summary || ''}` + (full ? `\n${(g.blocks || []).map(blockText).join('\n').slice(0, 6000)}\nAsk yourself: ${(g.procedure?.askYourself || []).join(' | ')}\nTraps: ${(g.traps || []).join(' | ')}` : ''); };
    if (ctx.fn) {
      parts.push(`THE GRAMMAR POINT: "${C.functions[ctx.fn]?.title || ctx.fn}"\n${fnText(code, ctx.fn, true)}`);
      if (ctx.intent === 'compare') parts.push('THE SAME POINT IN THE OTHER COURSE LANGUAGES:\n' + C.languages.filter(c => c !== code).map(c => fnText(c, ctx.fn, false)).join('\n'));
    }
    if (ctx.node && C.nodes[ctx.node]) {
      const n = C.nodes[ctx.node], nw = (X.byNode[ctx.node] || []).map(l => `${X.lex[l].lemma} = ${glossOfLex(C, X, l)}`);
      parts.push(`THE LESSON / NODE: "${n.title}"\nIts words in ${langLabel(C, code)}: ${nw.join('; ') || '(none)'}\nIts grammar: ${lessonFunctions(C, code, ctx.node).map(f => C.functions[f]?.title || f).join(', ') || '—'}`);
    }
    return { lang: code, langName: langLabel(C, code), words, total: k.R.size, rule: TUTOR_RULE, intent: TUTOR_INTENTS[ctx.intent] || '', context: parts.join('\n\n') };
  }
  function tutorTask(C, L, code, ctx = {}, opts = {}) {
    const t = tutorContext(C, L, code, ctx, opts), lang = opts.chatLang || C.explainLang;
    const system = `[noema:lang-tutor] You are the tutor of a learner of ${t.langName} (course "${C.data.course.title}"). Explain in the language with code "${lang}"; write ${t.langName} where you give examples or talk in it. ` +
      `Describe languages neutrally: no language is the norm.\nRULE: ${t.rule}\n${t.intent ? 'WHY THIS CONVERSATION WAS OPENED: ' + t.intent + '\n' : ''}` +
      `THE LEARNER'S KNOWN WORDS in ${t.langName} (${t.words.length} of ${t.total}${t.total > t.words.length ? ', the best known first' : ''}): ${t.words.map(w => `${w.lemma} = ${w.gloss}`).join('; ') || '(none yet — use very simple words and gloss each one)'}\n` +
      (t.context ? '\n' + t.context + '\n' : '') +
      `\nAnswer with: reply (your message; markdown **bold** allowed) and target (every sentence or phrase in ${t.langName} that your reply contains, exactly as written in it).`;
    return { system, schema: { type: 'object', required: ['reply', 'target'], properties: { reply: { type: 'string' }, target: { type: 'array', items: { type: 'string' } } } }, name: 'tutor', context: t };
  }

  GEN.translate = ctx => translateItems(ctx.C, ctx.L, ctx.code, { k: ctx.k, rng: ctx.rng, max: ctx.max, sentences: ctx.bank(), fn: ctx.fid, mode: ctx.gen.mode });
  GEN.rewrite = ctx => rewriteItems(ctx.C, ctx.L, ctx.code, { k: ctx.k, rng: ctx.rng, max: ctx.max, kind: 'rewrite' }).map(it => ({ ...it, fn: ctx.fid }));
  GEN.expand = ctx => rewriteItems(ctx.C, ctx.L, ctx.code, { k: ctx.k, rng: ctx.rng, max: ctx.max, kind: 'expand' }).map(it => ({ ...it, fn: ctx.fid }));
  GEN.number_words = ctx => numberItems(ctx.C, ctx.L, ctx.code, { k: ctx.k, rng: ctx.rng, max: ctx.max }).map(it => ({ ...it, fn: ctx.fid }));
  GEN.clock = ctx => clockItems(ctx.C, ctx.L, ctx.code, { k: ctx.k, rng: ctx.rng, max: ctx.max }).map(it => ({ ...it, fn: ctx.fid }));
  GEN.date = ctx => dateItems(ctx.C, ctx.L, ctx.code, { k: ctx.k, rng: ctx.rng, max: ctx.max }).map(it => ({ ...it, fn: ctx.fid }));
  GEN.register = ctx => registerItems(ctx.C, ctx.L, ctx.code, { k: ctx.k, rng: ctx.rng, max: ctx.max }).map(it => ({ ...it, fn: ctx.fid }));
  GEN.dialogue_turn = ctx => dialogueItems(ctx.C, ctx.L, ctx.code, { k: ctx.k, rng: ctx.rng, max: ctx.max }).map(it => ({ ...it, fn: ctx.fid }));
  API.GEN = GEN;
  Object.assign(API, { typedAnswer, sameWords, checkText, translateItems, rewriteItems, composeTask, composeCheck, readerTexts, readerQuestions, numberWords, numberWord, numberItems, countingItems, heAnd, digitsIn, clockOf, dateOf, clockItems, dateItems, registerItems, dialogueItems, turnsOf, aiTask, readerTask, readerProblems, tutorContext, tutorTask, TUTOR_INTENTS, TUTOR_RULE, MONTHS, WEEKDAYS, frameFamily });
  /* ---------- P8 — Through Claude (course creation and generation): account courses, task queue, checks and merges (§7.4, §10.1) ---------- */
  /* The same code runs in the app (engine/lang/95_claude.js) and in the connector (cloud/mcp/server.mjs, bundled by tools/build.py):
     a task, the check of its answer and the way the answer changes the course are identical everywhere. Pure: no DOM, no storage. */
  const LANG_P8 = (() => {
    const FORMAT = 'noema.langjobs/v1', DATA = 'noema.langdata/v1', PATCH = 'noema.langpatch/v1';
    const IN = 'a:langin:', CLAIM = 'a:langclaim:', LEASE = 4 * 3600e3, KEEP = 400;
    const KIND = { core: 'lang.core', node: 'lang.node', function: 'lang.function', compare: 'lang.compare', refill: 'lang.refill' };
    const POS = new Set(['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CCONJ', 'SCONJ', 'NUM', 'PART', 'INTJ', 'CLF', 'X']);
    const CONTENT = new Set(['NOUN', 'VERB', 'ADJ', 'ADV']);
    const GENDERED = new Set(['de', 'ar', 'he', 'fr', 'es', 'it', 'pt', 'ru', 'el', 'hi']);
    // D18: the reference set (library/languages/_typology/reference.json) with the type of each language
    const REF = { el: 'fusional', ru: 'fusional', es: 'fusional', en: 'fusional', fr: 'fusional', de: 'fusional', hi: 'fusional', fa: 'fusional', mr: 'fusional', ar: 'fusional', he: 'fusional',
      tr: 'agglutinating', ja: 'agglutinating', ko: 'agglutinating', fi: 'agglutinating', hu: 'agglutinating', sw: 'agglutinating', lg: 'agglutinating', zh: 'isolating', vi: 'isolating', iu: 'polysynthetic' };
    const STATUS = new Set(['realized', 'periphrastic', 'absent']);
    const CATS = new Set(['overview', 'script', 'phonology', 'morphology', 'morphosyntax', 'syntax', 'semantics', 'pragmatics', 'lexicon', 'reading', 'writing', 'speaking', 'listening', 'production', 'culture']);
    const GENS = new Set(['quiz', 'sentence_meaning', 'glyph_form', 'transliterate', 'vowelize', 'tone_mark', 'char_compose', 'trace', 'spell', 'learn_batch', 'recognize', 'picture_name', 'exhaustive_recall', 'field_map',
      'gender_article', 'principal_parts', 'measure_word', 'root_family', 'compound_split', 'sense_split', 'collocation', 'confusables', 'intensity_scale', 'paradigm', 'inflect', 'analyze', 'morph_build', 'root_pattern', 'agree',
      'build_sentence', 'word_order', 'transform', 'contrast', 'parse', 'gloss', 'proofread', 'combine', 'translate', 'rewrite', 'expand', 'guided_compose', 'graded_reader', 'number_words', 'clock', 'date', 'register',
      'dialogue_turn', 'parallel_translate', 'parallel_align', 'which_language', 'cognate_bridge', 'compare_rule', 'register_pick', 'nuance_pick', 'connotation', 'idiom_meaning', 'example_cloze', 'sense_pick', 'etymology_link']);
    const clone = o => JSON.parse(JSON.stringify(o));
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const str = v => typeof v === 'string' && v.trim() !== '';
    const iso = now => new Date(now == null ? Date.now() : now).toISOString();
    const NAMES = { ar: 'Arabic', he: 'Hebrew', zh: 'Chinese', de: 'German', en: 'English', el: 'Greek', ru: 'Russian', tr: 'Turkish', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi', fa: 'Persian', fi: 'Finnish', hu: 'Hungarian', sw: 'Swahili', vi: 'Vietnamese', nl: 'Dutch', pl: 'Polish' };
    const nameOf = c => NAMES[c] || c;

    /* ---------- the account course: its record (synced key a:langcourse:<id>) and its content (device + cloud storage) ---------- */
    const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    function newCourseId(title, rnd = Math.random) { let r = ''; for (let i = 0; i < 4; i++) r += 'abcdefghijkmnpqrstuvwxyz'[Math.floor(rnd() * 24)]; return `u-${slug(title) || 'course'}-${r}`; }
    /** A new course made through Claude → {record, data}. library: built library courses (their language.json and typology are reused). */
    function newCourse({ title, languages, explainLang = 'en', depth = {}, knownLanguages = [], provider = 'claudeapp', id = null, now = Date.now(), library = [] } = {}) {
      const langs = [...new Set((languages || []).map(x => String(x).trim().toLowerCase()).filter(x => /^[a-z]{2,3}$/.test(x)))];
      if (!str(title)) throw new Error('A course needs a title.');
      if (!langs.length) throw new Error('Choose at least one language.');
      id = id || newCourseId(title);
      const dep = Object.fromEntries(langs.map(c => [c, [1, 2, 3].includes(+depth[c]) ? +depth[c] : 3]));
      const known = [...new Set((knownLanguages || []).map(x => String(x).trim().toLowerCase()).filter(Boolean))];
      const libLang = c => { for (const d of library || []) if (d?.langs?.[c]?.language) return clone(d.langs[c].language); return null; };
      const data = { format: DATA, rev: 1, course: { format: 'noema.langcourse/v1', id, title: title.trim(), explainLang, languages: langs, defaults: { depth: dep, batch: 12, dailyMinutes: 30 }, knownLanguages: known, account: true, draft: [] },
        typology: clone((library || []).find(d => d?.typology)?.typology || null), fields: [], nodes: [], functions: [], frames: [], compare: {},
        langs: Object.fromEntries(langs.map(c => [c, { language: libLang(c), lexicon: {}, grammar: {}, bank: [] }])) };
      const record = { format: FORMAT, id, origin: 'account', title: data.course.title, languages: langs, explainLang, depth: dep, knownLanguages: known, provider, created: iso(now), updated: iso(now), rev: 1, tasks: [], log: [] };
      queueTask(record, KIND.core, {}, { now });
      return { record, data };
    }
    /** The record of a library course: only its refill queue lives in the account (the learner's private patch). */
    const libraryRecord = (C, now = Date.now()) => ({ format: FORMAT, id: C.id, origin: 'library', title: C.data.course.title, languages: C.languages.slice(), explainLang: C.explainLang, depth: {}, knownLanguages: C.data.course.knownLanguages || [], provider: 'claudeapp', created: iso(now), updated: iso(now), rev: 0, tasks: [], log: [] });
    const emptyPatch = (cid) => ({ format: PATCH, course: cid, rev: 0, langs: {} });
    /** A library course with the learner's patch laid over it (refill sentences, §7.4). Mutates and returns data. */
    function applyPatch(data, patch) {
      for (const [code, P] of Object.entries(patch?.langs || {})) {
        const L = data.langs?.[code]; if (!L) continue;
        const have = new Set((L.bank || []).map(s => s.id));
        for (const s of P.bank || []) if (!have.has(s.id)) { L.bank.push(s); have.add(s.id); }
      }
      return data;
    }

    /* ---------- the queue ---------- */
    const taskIdOf = (kind, a) => kind === KIND.core ? 'core' : kind === KIND.node ? `node:${a.node}:${a.lang}` : kind === KIND.function ? `function:${a.fn}:${a.lang}` : kind === KIND.compare ? `compare:${a.fn}` : `refill:${a.fn}:${a.lang}:${a.n}`;
    const isOpen = t => t && (t.status === 'queued');
    /** Queue a task (the open one when it is queued already) → the task. */
    function queueTask(rec, kind, args = {}, { now = Date.now(), night = false } = {}) {
      if (!Object.values(KIND).includes(kind)) throw new Error('unknown task kind ' + kind);
      rec.tasks = rec.tasks || [];
      if (kind === KIND.refill && args.n == null) args = { ...args, n: 1 + rec.tasks.filter(t => t.kind === KIND.refill && t.fn === args.fn && t.lang === args.lang).length };
      const id = taskIdOf(kind, args);
      const open = rec.tasks.find(t => t.id === id && isOpen(t)); if (open) return open;
      const t = { id, kind, ...args, status: 'queued', queuedAt: iso(now), ...(night ? { night: true } : {}) };
      rec.tasks.push(t); rec.updated = iso(now);
      const done = rec.tasks.filter(x => !isOpen(x)); if (done.length > KEEP) rec.tasks = rec.tasks.filter(x => isOpen(x) || done.indexOf(x) >= done.length - KEEP);
      return t;
    }
    const order = rec => (rec.tasks || []).filter(isOpen).sort((a, b) => (a.kind === KIND.core ? -1 : 0) - (b.kind === KIND.core ? -1 : 0) || String(a.queuedAt).localeCompare(String(b.queuedAt)) || (a.seq || 0) - (b.seq || 0));
    /** The queue as it really is: a task with a live claim (KV a:langclaim:<course>:<task>) is being written by another run. */
    function settle(rec, { claims = [], now = Date.now(), lease = LEASE } = {}) {
      const r = clone(rec), pre = CLAIM + rec.id + ':';
      const live = {}; for (const c of claims) { if (!String(c.key).startsWith(pre)) continue; const t = Date.parse(c.updated_at || '') || 0; if (now - t < lease) live[c.key.slice(pre.length)] = iso(t); }
      for (const t of r.tasks || []) if (isOpen(t) && live[t.id]) t.claimedAt = live[t.id];
      return r;
    }
    /** {queued: [free tasks in order], claimed: [taken by a run], done, refused} */
    function work(rec) {
      const o = order(rec);
      return { queued: o.filter(t => !t.claimedAt), claimed: o.filter(t => t.claimedAt), done: (rec.tasks || []).filter(t => t.status === 'done').length, refused: (rec.tasks || []).filter(t => t.status === 'refused').length };
    }
    const byId = (rec, id) => (rec.tasks || []).find(t => t.id === id && isOpen(t)) || null;
    /** The next task: want 'any' or a kind (lang.node …); task: one task id (even when another run took it, with force). */
    function next(rec, { want = 'any', task = '', force = false } = {}) {
      if (task) { const t = byId(rec, task); if (!t) return { error: `No open task “${task}” in “${rec.title}”.` }; if (t.claimedAt && !force) return { error: `“${task}” is being written by another run since ${t.claimedAt} — do not write it twice (force = true takes it over when that run stopped).` }; return t; }
      if (rec.tasks?.some(t => isOpen(t) && t.kind === KIND.core) && want !== 'any' && want !== KIND.core) return null;   // nothing can be written before the core
      const w = work(rec);
      return w.queued.find(t => want === 'any' || t.kind === want || t.kind === 'lang.' + want) || null;
    }
    /** What the course still needs, in course order: {core, nodes: [{node, lang}], functions: [{fn, lang}], compare: [fn]} */
    function needs(rec, data) {
      const out = { core: !(data.nodes || []).length, nodes: [], functions: [], compare: [] };
      if (out.core) return out;
      let C; try { C = course(data); } catch (e) { return out; }
      const langs = rec.languages || C.languages;
      for (const nid of C.order) for (const code of langs) {
        const X = C.lang[code]; if (!X || !X.applies[nid]) continue;
        if (C.nodes[nid].concepts.length && !data.langs[code].lexicon[nid]) out.nodes.push({ node: nid, lang: code });
        if (C.nodes[nid].kind === 'lesson') for (const fid of lessonFunctions(C, code, nid)) if (C.functions[fid] && !X.grammar[fid] && !out.functions.some(x => x.fn === fid && x.lang === code)) out.functions.push({ fn: fid, lang: code });
      }
      for (const fid of Object.keys(C.functions)) if (C.functions[fid].category !== 'overview' && langs.filter(c => C.lang[c]?.grammar[fid]).length >= 2 && !(data.compare || {})[fid]) out.compare.push(fid);
      return out;
    }
    /** 🌙 Queue every unwritten node (and the realizations its lessons need) — for a night of scheduled runs → how many were queued. */
    function queueNight(rec, data, { now = Date.now(), langs = null, functions = true } = {}) {
      const nd = needs(rec, data); let n = 0, i = 0;
      const want = c => !langs || langs.includes(c);
      const before = new Set(order(rec).map(t => t.id));
      const add = (kind, a) => { const t = queueTask(rec, kind, a, { now, night: true }); t.seq = t.seq || ++i; if (!before.has(t.id)) { before.add(t.id); n++; } };
      for (const x of nd.nodes) if (want(x.lang)) add(KIND.node, x);
      if (functions) for (const x of nd.functions) if (want(x.lang)) add(KIND.function, x);
      return n;
    }
    /** The refill request of §7.4: the function, the language and the learner's known lexemes (R and P) right now. */
    function refillRequest(C, L, code, fid) {
      const k = known(C, L, code);
      return { fn: fid, lang: code, R: [...k.R].sort(), P: [...k.P].sort(), have: selectSentences(C, code, { known: k.R, functions: [fid] }).length };
    }

    /* ---------- the parallel order (D13, §4.4.3) — the JS twin of validate_lang.course_paths / order_conflicts ---------- */
    const lessonFns = (n, L, typ) => { const f = n.functions || []; if (Array.isArray(f)) return f.slice(); const out = []; for (const k of ['*', typ, L]) for (const x of f[k] || []) if (!out.includes(x)) out.push(x); return out; };
    function topo(nodes) { const by = {}, seen = {}, out = []; for (const n of nodes) if (n.id) by[n.id] = n; const visit = id => { if (seen[id] || !by[id]) return; seen[id] = 1; for (const p of by[id].prereqs || []) visit(p); out.push(id); }; for (const n of nodes) visit(n.id); return { by, out }; }
    /** The path of every language of the course and of every language type: [[name, [[node id, Set(subjects)]]]] */
    function coursePaths(data, label = null) {
      label = label || data.course?.id || 'course';
      const { by, out } = topo(data.nodes || []);
      const holders = [];
      for (const L of data.course?.languages || []) { const typ = data.langs?.[L]?.language?.typology; if (typ) holders.push([`${label}/${L}`, L, typ]); }
      for (const t of TYPES.slice().sort()) holders.push([`${label}/${t} type`, null, t]);
      return holders.map(([name, L, typ]) => {
        const seen = new Set(), steps = [];
        for (const nid of out) {
          const n = by[nid]; if (!applies(n, L, typ)) continue;
          const g = new Set(['node ' + nid, ...lessonFns(n, L, typ).map(f => 'grammar ' + f), ...(n.concepts || []).map(c => 'word ' + c)].filter(x => !seen.has(x)));
          g.forEach(x => seen.add(x)); steps.push([nid, g]);
        }
        return [name, steps];
      });
    }
    /** Pairs of subjects taught in opposite orders by two paths (one of them starts with `mine`) → messages */
    function orderConflicts(paths, mine = null, limit = 12) {
      const pos = paths.map(([, steps]) => { const p = new Map(); steps.forEach(([nid, g], i) => g.forEach(x => p.set(x, [i, nid]))); return p; });
      const found = new Map();
      for (let a = 0; a < paths.length; a++) for (let b = a + 1; b < paths.length; b++) {
        if (mine && !(paths[a][0].startsWith(mine) || paths[b][0].startsWith(mine))) continue;
        const A = pos[a], B = pos[b];
        const common = [...A.keys()].filter(x => B.has(x)).sort((x, y) => A.get(x)[0] - A.get(y)[0] || B.get(x)[0] - B.get(y)[0]);
        let best = null, i = 0;
        while (i < common.length) {
          let j = i; while (j < common.length && A.get(common[j])[0] === A.get(common[i])[0]) j++;
          for (const y of common.slice(i, j)) if (best && B.get(y)[0] < B.get(best)[0]) { const k = best + '|' + y; if (!found.has(k)) found.set(k, `“${best}” comes before “${y}” in ${paths[a][0]} (${A.get(best)[1]} → ${A.get(y)[1]}) but after it in ${paths[b][0]} (${B.get(y)[1]} → ${B.get(best)[1]})`); }
          for (const y of common.slice(i, j)) if (best === null || B.get(y)[0] > B.get(best)[0]) best = y;
          i = j;
        }
      }
      const msgs = [...found.values()];
      return msgs.slice(0, limit).concat(msgs.length > limit ? [`… and ${msgs.length - limit} more`] : []);
    }

    /* ---------- the answer schemas (the tool input of the in-app runner; the connector checks the same) ---------- */
    const S_SENT = { type: 'object', required: ['id', 'frame', 'text', 'tokens', 'gloss'], properties: { id: { type: 'string' }, frame: { type: 'string' }, text: { type: 'string' }, gloss: { type: 'string' }, tokens: { type: 'array', minItems: 1, items: { type: 'object' } }, functions: { type: 'array', items: { type: 'string' } }, level: { type: 'string' }, variantOf: { type: 'string' }, variant: { type: 'object' } } };
    const SCHEMA = {
      [KIND.core]: { type: 'object', required: ['fields', 'nodes', 'functions', 'frames'], properties: { fields: { type: 'array', items: { type: 'object' } }, nodes: { type: 'array', minItems: 1, items: { type: 'object' } }, functions: { type: 'array', items: { type: 'object' } }, frames: { type: 'array', items: { type: 'object' } }, typology: { type: 'object' }, languages: { type: 'object', description: 'language.json of each course language that has none yet' } } },
      [KIND.node]: { type: 'object', required: ['lexicon'], properties: { lexicon: { type: 'object', required: ['lexemes'], properties: { lexemes: { type: 'array', items: { type: 'object' } }, absent: { type: 'array', items: { type: 'object' } } } }, bank: { type: 'array', items: S_SENT }, grammar: { type: 'object', description: 'function id → realization (lang/<code>/grammar/<fn>.json), for the lesson\'s functions' } } },
      [KIND.function]: { type: 'object', required: ['grammar'], properties: { grammar: { type: 'object' }, bank: { type: 'array', items: S_SENT } } },
      [KIND.compare]: { type: 'object', required: ['compare'], properties: { compare: { type: 'object', required: ['function', 'rows'], properties: { function: { type: 'string' }, rows: { type: 'array', minItems: 1, items: { type: 'object', required: ['aspect', 'cells'], properties: { aspect: { type: 'string' }, cells: { type: 'object' } } } }, notes: { type: 'array', items: { type: 'object' } } } } } },
      [KIND.refill]: { type: 'object', required: ['bank'], properties: { bank: { type: 'array', minItems: 1, items: S_SENT } } },
    };
    /** The JSON-Schema subset of the answer schemas → problems */
    function shape(schema, v, at = '$', out = []) {
      if (!schema || out.length > 40) return out;
      const t = schema.type;
      const ok = !t || (t === 'array' ? Array.isArray(v) : t === 'object' ? isObj(v) : t === 'integer' ? Number.isInteger(v) : typeof v === t);
      if (!ok) { out.push(`${at}: expected ${t}`); return out; }
      if (t === 'array') { if (schema.minItems && v.length < schema.minItems) out.push(`${at}: needs ≥ ${schema.minItems} items`); if (schema.items) v.forEach((x, i) => shape(schema.items, x, `${at}[${i}]`, out)); }
      if (t === 'object') { for (const r of schema.required || []) if (v[r] === undefined) out.push(`${at}.${r}: missing`); for (const [k, x] of Object.entries(v)) if (schema.properties?.[k]) shape(schema.properties[k], x, `${at}.${k}`, out); }
      return out;
    }

    /* ---------- checks: the validator's rules the app and the connector need (tools/validate_lang.py is the full check) ---------- */
    /** Every lexeme of a language in the course (+ extra ones) → Map id → {x, node} */
    function lexIndex(data, code, extra = [], skipNode = null) {
      const m = new Map();
      for (const [nid, f] of Object.entries(data.langs?.[code]?.lexicon || {})) { if (nid === skipNode) continue; for (const x of f.lexemes || []) m.set(x.id, { x, node: nid }); }
      for (const [x, nid] of extra) m.set(x.id, { x, node: nid });
      return m;
    }
    /** Which node teaches each concept in a language (ownership, §4.4). */
    function owners(data, code) {
      const typ = data.langs?.[code]?.language?.typology, own = {};
      for (const n of data.nodes || []) if (applies(n, code, typ)) for (const c of n.concepts || []) if (!own[c]) own[c] = n.id;
      return own;
    }
    const conceptsOf = data => { const m = {}; for (const f of data.fields || []) for (const c of f.concepts || []) m[c.id] = { ...c, field: f.field }; return m; };
    function checkLexemes(E, data, code, nid, lexicon, lj) {
      const where = `lang/${code}/lexicon/${nid}.json`, concepts = conceptsOf(data), own = owners(data, code), node = (data.nodes || []).find(n => n.id === nid);
      const others = lexIndex(data, code, [], nid), ids = new Set(), covered = new Set(), pcells = lj.paradigmCells || {}, cite = lj.citationCells || {}, marks = !!lj.vowelMarks;
      const wf = lj.wordFeatures || null;
      const profiles = (data.course?.profiles || 'required') === 'required';
      for (const x of lexicon.lexemes || []) {
        const w = `${where} · ${x?.id}`;
        if (!isObj(x)) { E.push(`${where}: a lexeme must be an object`); continue; }
        if (!(str(x.id) && x.id.startsWith(code + ':'))) { E.push(`${w}: lexeme id must start with “${code}:”`); continue; }
        if (ids.has(x.id) || others.has(x.id)) E.push(`${w}: lexeme id used twice`); ids.add(x.id);
        if (!str(x.lemma)) E.push(`${w}: “lemma” is required (text)`);
        if (!POS.has(x.pos)) E.push(`${w}: unknown part of speech “${x.pos}”`);
        if (!Array.isArray(x.senses)) { E.push(`${w}: “senses” must be a list (empty for a word with no shared concept)`); continue; }
        x.senses.forEach((s, i) => {
          if (!concepts[s]) { E.push(`${w}: unknown concept “${s}”`); return; }
          if (i === 0 && own[s] !== nid && !(x.role && (concepts[s].pending || own[s]))) E.push(`${w}: concept “${s}” belongs to node ${own[s] || '(none)'} in ${code}, not ${nid}`);
          covered.add(s);
        });
        if (!x.senses.length && !str(x.role)) E.push(`${w}: a word without a concept needs its “role”`);
        if (!isObj(x.ref)) E.push(`${w}: “ref” is required (how the word was checked: {"src": "kaikki", "checked": "<date>"}, tools/lang_refcheck.py)`);
        const forms = x.forms == null ? {} : x.forms;
        if (!isObj(forms)) { E.push(`${w}: “forms” must be an object`); continue; }
        const seen = {};
        for (const [c, f] of Object.entries(forms)) {
          if (!cellParts(c).length) E.push(`${w}: an empty cell`);
          if (seen[canon(c)]) E.push(`${w}: cells ${seen[canon(c)]} and ${c} are the same`); seen[canon(c)] = c;
          if (!str(f)) E.push(`${w}: cell ${c}: empty form`);
          else if (marks && [...stripMarks(code, f)].filter(ch => /\p{L}/u.test(ch)).length > 1 && !hasMarks(code, f)) E.push(`${w}: cell ${c}: “${f}” has no vowel marks (store ${code} forms fully vocalized)`);
        }
        const key = x.class ? `${x.pos}.${x.class}` : x.pos;
        for (const c of pcells[key] || pcells[x.pos] || []) if (!seen[canon(c)]) E.push(`${w}: missing cell ${c}`);
        const cc = cite[key] || cite[x.pos];
        if (cc && Object.keys(forms).length) { if (!seen[canon(cc)]) E.push(`${w}: missing citation cell ${cc}`); else if (forms[seen[canon(cc)]] !== x.lemma) E.push(`${w}: the lemma “${x.lemma}” must be the ${cc} form “${forms[seen[canon(cc)]]}”`); }
        if (marks && str(x.lemma) && [...stripMarks(code, x.lemma)].filter(ch => /\p{L}/u.test(ch)).length > 1 && !hasMarks(code, x.lemma)) E.push(`${w}: the lemma has no vowel marks`);
        if (x.pos === 'NOUN' && GENDERED.has(code) && x.class !== 'plt' && !['MASC', 'FEM', 'NEUT'].includes(x.gender)) E.push(`${w}: gender is required (MASC, FEM or NEUT)`);
        if (profiles && CONTENT.has(x.pos) && x.senses.length && !isObj(x.profile)) E.push(`${w}: a content word needs its profile (§4.6: senses, examples, collocations … — the validator checks it in full)`);
        // D14: the facade — every parameter its language declares for the part of speech
        if (wf) {
          if (!Array.isArray(wf[x.pos])) E.push(`${w}: no wordFeatures for ${x.pos} in ${code} (language.json)`);
          const feats = isObj(x.features) ? x.features : {};
          const mine = (wf[x.pos] || []).filter(d => !d.classes || d.classes.includes(key)), known = new Set(mine.map(d => d.id));
          for (const k of Object.keys(feats)) if (!known.has(k)) E.push(`${w}: features.${k}: not a parameter of ${key} in ${code} (wordFeatures)`);
          for (const d of mine) {
            const val = d.at === 'top' ? x[d.id] : feats[d.id];
            if (val == null) { E.push(`${w}: the word does not state its ${d.title || d.id} (${d.id}${d.at === 'top' ? ' at the top level' : ''}): give a value${d.none ? ' or {"none": "<why>"}' : ''} (D14)`); continue; }
            if (isObj(val) && Object.keys(val).length === 1 && 'none' in val) { if (!d.none) E.push(`${w} · ${d.id}: this parameter cannot be “none”`); else if (!str(val.none)) E.push(`${w} · ${d.id}: say why it is none`); continue; }
            if (d.type === 'enum' && !(d.values || []).includes(val)) E.push(`${w} · ${d.id}: “${val}” is not one of ${(d.values || []).join(', ')}`);
          }
        }
        for (const ct of x.contrasts || []) { if (!x.senses.includes(ct.concept)) E.push(`${w}: contrasts: “${ct.concept}” is not one of the word's concepts`); if (!str(ct.axis) || !str(ct.value)) E.push(`${w} · contrasts: axis and value are required`); }
        if (code === 'zh') {
          const lemma = String(x.lemma || ''), chars = [...lemma];
          if (!chars.every(isHan)) E.push(`${w}: “${lemma}” must be written in characters only`);
          if (!str(x.trad) || [...x.trad].length !== chars.length) E.push(`${w}: the traditional form (trad) is required, with as many characters as the lemma`);
          const syl = pinyinSplit(x.pinyin || '');
          const erhua = lemma.endsWith('儿') && chars.length > 1 && syl.length === chars.length - 1 && /r$/.test(syl[syl.length - 1] || '');
          if (!syl.length) E.push(`${w}: pinyin is required (syllables separated by spaces)`);
          else if (syl.length !== chars.length && !erhua) E.push(`${w}: ${syl.length} pinyin syllables for ${chars.length} characters`);
          else syl.forEach((s, i) => { for (const e of pinyinSyllableErrors(erhua && i === syl.length - 1 ? s.slice(0, -1) : s)) E.push(`${w}: ${e}`); });
          const ms = (x.features || {}).measure ?? x.measure;
          if (x.pos === 'NOUN' && !ms && !x.measureNone) E.push(`${w}: a noun needs its measure word(s) (features.measure), or {"none": "<why>"}`);
        }
      }
      for (const a of lexicon.absent || []) {
        const w = `${where} · absent ${a?.concept}`;
        if (!node || !(node.concepts || []).includes(a?.concept)) E.push(`${w}: concept “${a?.concept}” is not in node ${nid}`);
        if (covered.has(a?.concept)) E.push(`${w}: the concept has a word and is also marked absent`);
        if (!str(a?.reason)) E.push(`${w}: “reason” is required (and what is said instead: use)`);
        covered.add(a?.concept);
      }
      // every concept of the node has a word or an absent entry (a word written elsewhere with this meaning counts too)
      const elsewhere = new Set([...others.values()].flatMap(({ x }) => x.senses || []));
      for (const cid of node?.concepts || []) if (!covered.has(cid) && !elsewhere.has(cid)) E.push(`${where}: concept “${cid}” has no word and is not marked absent`);
      // D14: one concept, several words → each says what separates it, on one axis
      const all = lexIndex(data, code, (lexicon.lexemes || []).filter(isObj).map(x => [x, nid]), nid), by = {};
      for (const { x } of all.values()) for (const c of x.senses || []) (by[c] = by[c] || []).push(x);
      for (const [cid, xs] of Object.entries(by)) {
        if (xs.length < 2 || !xs.some(x => (lexicon.lexemes || []).includes(x))) continue;
        const got = xs.map(x => (x.contrasts || []).find(ct => ct.concept === cid));
        if (got.some(g => !g)) { E.push(`lang/${code} · concept ${cid}: ${xs.length} words (${xs.map(x => x.id).join(', ')}): each says what separates it (contrasts, D14) — missing in ${xs.filter((x, i) => !got[i]).map(x => x.id).join(', ')}`); continue; }
        if (new Set(got.map(g => g.axis)).size > 1) E.push(`lang/${code} · concept ${cid}: the words of one concept are contrasted on ONE axis`);
        if (new Set(got.map(g => g.value)).size < got.length) E.push(`lang/${code} · concept ${cid}: two words have the same contrast value`);
      }
    }
    /** A realization (lang/<code>/grammar/<fn>.json). */
    function checkRealization(E, data, code, fid, g, lj) {
      const where = `lang/${code}/grammar/${fid}.json`, fn = (data.functions || []).find(f => f.id === fid);
      if (!isObj(g)) { E.push(`${where}: the realization must be an object`); return; }
      if (!fn) { E.push(`${where}: unknown function “${fid}”`); return; }
      if (g.function !== fid) E.push(`${where}: function must be “${fid}”`);
      if (!STATUS.has(g.status)) E.push(`${where}: status must be one of realized, periphrastic, absent`);
      if (!str(g.summary)) E.push(`${where}: “summary” is required (text)`);
      const fors = new Set([...(g.notes || []), ...(g.blocks || []).flatMap(b => isObj(b) ? b.notes || [] : [])].map(n => n?.for).filter(Boolean));
      for (const n of [...(g.notes || []), ...(g.blocks || []).flatMap(b => isObj(b) ? b.notes || [] : [])]) if (!str(n?.for) || !str(n?.text)) E.push(`${where}: a comparison note needs “for” and “text”`);
      const refs = [...fors].filter(f => REF[f]), types = new Set([...refs.map(f => REF[f]), ...[...fors].filter(f => String(f).startsWith('type:')).map(f => f.slice(5))]);
      if (refs.length < 8 || !TYPES.every(t => types.has(t))) E.push(`${where}: comparison notes for the reference set: ${refs.length} of at least 8 languages, types ${[...types].sort().join(', ') || 'none'} of all four (D18: ${Object.keys(REF).join(' ')})`);
      for (const gen of g.generators || []) {
        if (!GENS.has(gen?.type)) E.push(`${where}: unknown exercise type “${gen?.type}”`);
        if (gen?.type === 'inflect' && !gen.pos) E.push(`${where}: inflect needs pos`);
        for (const fr of gen?.bank?.frames || []) if (!(data.frames || []).some(f => f.id === fr)) E.push(`${where}: generator bank: unknown frame “${fr}”`);
        if (gen?.type === 'quiz' && !(g.quiz || []).length) E.push(`${where}: quiz: the questions (quiz) are missing`);
      }
      (g.quiz || []).forEach((q, i) => {
        const qw = `${where} · quiz ${i + 1}`;
        if (!str(q?.q) || !str(q?.why)) E.push(`${qw}: q and why are required`);
        if (!Array.isArray(q?.options) || q.options.length < 2 || !q.options.every(str)) E.push(`${qw}: options: at least 2 non-empty strings`);
        else if (new Set(q.options).size !== q.options.length) E.push(`${qw}: two options are the same`);
        else if (!q.options.includes(q.answer)) E.push(`${qw}: answer must be one of the options (the text)`);
      });
      if (fn.category === 'overview') {
        if (g.typology?.type !== lj?.typology) E.push(`${where}: typology.type must be the language's type “${lj?.typology}”`);
        if ((g.facts || []).length < 3) E.push(`${where}: facts: at least 3`);
        if ((g.peculiarities || []).length < 3) E.push(`${where}: peculiarities: at least 3 (D11)`);
        if ((g.quiz || []).length < 3) E.push(`${where}: quiz: at least 3 questions`);
      } else if (g.status !== 'absent' && !(g.procedure?.askYourself || []).length) E.push(`${where}: procedure.askYourself (the “ask yourself” checklist) is required`);
    }
    /** Sentences for the bank. opts: {lex (Map), grams {fid: realization}, fn (must list it), only (Set of lexeme ids the words must come from)} */
    function checkBank(E, data, code, sents, lj, { lex, grams = {}, fn = null, only = null, label = 'bank' } = {}) {
      const old = new Set((data.langs?.[code]?.bank || []).map(s => s.id)), mine = new Map();
      for (const s of sents || []) if (isObj(s) && str(s.id)) mine.set(s.id, s);
      const frames = new Set((data.frames || []).map(f => f.id)), fns = new Set((data.functions || []).map(f => f.id));
      const seen = new Set();
      for (const s of sents || []) {
        const w = `lang/${code}/${label} · ${s?.id}`;
        if (!isObj(s)) { E.push(`lang/${code}/${label}: a sentence must be an object`); continue; }
        if (!(str(s.id) && s.id.startsWith(code + '.'))) E.push(`${w}: sentence id must start with “${code}.”`);
        if (old.has(s.id) || seen.has(s.id)) E.push(`${w}: sentence id used twice (choose new ids)`); seen.add(s.id);
        if (!frames.has(s.frame)) E.push(`${w}: unknown frame “${s.frame}”`);
        if (!str(s.gloss)) E.push(`${w}: “gloss” is required (the meaning, in the explanation language)`);
        const toks = Array.isArray(s.tokens) ? s.tokens : [];
        if (!toks.length) { E.push(`${w}: tokens are required`); continue; }
        const used = []; let first = true;
        const one = (k, tw, isFirst) => {
          const e = lex.get(k.l); if (!e) { E.push(`${tw}: unknown lexeme “${k.l}”`); return; }
          const x = e.x, forms = x.forms || {}; let want;
          if (k.f) { const cm = {}; for (const c of Object.keys(forms)) cm[canon(c)] = c; if (!cm[canon(k.f)]) { E.push(`${tw}: “${k.l}” has no cell ${k.f}`); used.push([k.l, k.f]); return; } want = forms[cm[canon(k.f)]]; }
          else { if (Object.keys(forms).length) { E.push(`${tw}: “${k.l}” is inflected: the cell (f) is required`); used.push([k.l, null]); return; } want = x.lemma; }
          used.push([k.l, k.f || null]);
          if (!k.f && (x.alts || []).includes(k.t)) return;
          if (code === 'ar' && !isFirst && k.t !== want && want.length > 2 && want[0] === 'ا' && 'َُِ'.includes(want[1]) && (k.t === 'ٱ' + want.slice(2) || k.t === 'ا' + want.slice(2))) return;   // hamzat al-waṣl inside a sentence
          if (k.t !== want && !(isFirst && lj.capitalizeFirst && k.t === capFirst(want))) E.push(`${tw}: “${k.t}” is not the ${k.f || 'lemma'} form of ${k.l} (“${want}”)`);
        };
        toks.forEach((k, i) => {
          const tw = `${w} · token ${i + 1} “${k?.t}”`;
          if (!isObj(k)) { E.push(`${tw}: a token must be an object`); return; }
          if (k.p) { if (k.t && '.?!。？！؟'.includes(String(k.t).slice(-1))) first = true; return; }
          if (k.name) { if (k.l || k.f) E.push(`${tw}: a name has no lexeme (l) and no cell (f)`); first = false; return; }
          if (k.parts) { if (k.parts.map(p => p.t || '').join('') !== k.t) E.push(`${tw}: the parts do not spell the token`); k.parts.forEach((p, j) => { if (!p.name) one(p, `${tw} · part ${j + 1}`, first && j === 0); }); }
          else one(k, tw, first);
          first = false;
        });
        if (joinTokens(toks, lj.tokenJoin) !== s.text) E.push(`${w}: text “${s.text}” ≠ the tokens joined “${joinTokens(toks, lj.tokenJoin)}”`);
        if (only) { const out = used.map(u => u[0]).filter(l => !only.has(l)); if (out.length) E.push(`${w}: uses words the learner does not know yet: ${[...new Set(out)].join(', ')} (a refill uses only the known words listed in the task)`); }
        if (fn && !(s.functions || []).includes(fn)) E.push(`${w}: must list ${fn} in functions (this task writes sentences for it)`);
        for (const fid of s.functions || []) {
          if (!fns.has(fid)) { E.push(`${w}: unknown function “${fid}”`); continue; }
          const g = grams[fid] || data.langs?.[code]?.grammar?.[fid] || {};
          if (g.status === 'absent') { E.push(`${w}: ${fid} is absent in ${code}; a sentence cannot show it`); continue; }
          const ev = g.evidence || {};
          if (!(ev.tags || ev.lemmas || ev.punct)) { E.push(`${w}: ${fid} has no evidence in its realization (tags, lemmas or punct) yet: a sentence cannot show it`); continue; }
          let tagsets = ev.tags || []; tagsets = tagsets.length && Array.isArray(tagsets[0]) ? tagsets : tagsets.length ? [tagsets] : [];
          let ok = used.some(([l]) => (ev.lemmas || []).includes(l)) || used.some(([, f]) => f && tagsets.some(ts => ts.length && ts.every(t => cellParts(f).includes(t)))) || toks.some(k => k.p && (ev.punct || []).includes(k.t));
          if (ok && used.some(([l]) => (ev.exclude || []).includes(l))) ok = false;
          if (!ok) E.push(`${w}: listed as ${fid}, but no word shows it (evidence ${JSON.stringify(ev)})`);
        }
        if (s.variantOf) { const o = mine.get(s.variantOf) || (data.langs?.[code]?.bank || []).find(x => x.id === s.variantOf); if (!o) E.push(`${w}: variantOf “${s.variantOf}” does not exist`); else if (o.frame !== s.frame) E.push(`${w}: a variant must have the frame of its original`); if (!s.variant) E.push(`${w}: a variant must say what changed (variant)`); }
      }
    }
    function checkCore(E, rec, data, ans, peers) {
      const langs = data.course.languages, concepts = {}, fns = {}, frames = {}, nodes = {};
      for (const f of ans.fields || []) {
        const where = `core/fields/${f?.field}.json`;
        if (!str(f?.field) || !str(f?.title)) E.push(`${where}: field and title are required`);
        if (!Array.isArray(f?.sources) || !f.sources.length) E.push(`${where}: “sources” is required: how the list was made complete`);
        const subs = new Set((f?.subgroups || []).map(s => s.id)), ranks = {};
        for (const c of f?.concepts || []) {
          const w = `${where} · ${c?.id}`;
          if (!str(c?.id)) { E.push(`${where}: a concept without id`); continue; }
          if (concepts[c.id]) E.push(`${w}: concept id used twice`); concepts[c.id] = { ...c, field: f.field };
          if (!str(c.gloss)) E.push(`${w}: “gloss” is required (in the explanation language)`);
          if (subs.size && !subs.has(c.subgroup)) E.push(`${w}: unknown subgroup “${c.subgroup}”`);
          if (![1, 2, 3].includes(c.tier)) E.push(`${w}: tier must be 1, 2 or 3`);
          if (!(Number.isInteger(c.rank) && c.rank > 0)) E.push(`${w}: rank must be a positive integer`);
          else if ((ranks[c.tier] = ranks[c.tier] || new Set()).has(c.rank)) E.push(`${w}: rank ${c.rank} used twice in tier ${c.tier}`); else ranks[c.tier].add(c.rank);
        }
      }
      for (const f of ans.functions || []) {
        if (!str(f?.id) || fns[f.id]) { E.push(`core/functions: function id missing or used twice (${f?.id})`); continue; }
        fns[f.id] = f;
        if (!str(f.title)) E.push(`core/functions/${f.id}.json: “title” is required`);
        if (!CATS.has(f.category)) E.push(`core/functions/${f.id}.json: category must be one of ${[...CATS].join(', ')} (D19)`);
      }
      for (const f of Object.values(fns)) for (const a of f.after || []) if (!fns[a]) E.push(`core/functions/${f.id}.json: unknown function “${a}” in after`);
      for (const f of ans.frames || []) { if (!str(f?.id) || frames[f.id]) E.push(`core/frames.json: frame id missing or used twice (${f?.id})`); else frames[f.id] = f; if (!str(f?.meaning)) E.push(`core/frames.json · ${f?.id}: “meaning” is required`); }
      const own = {};
      for (const n of ans.nodes || []) {
        const w = `core/nodes.json · ${n?.id}`;
        if (!str(n?.id)) { E.push('core/nodes.json: a node without id'); continue; }
        if (nodes[n.id]) E.push(`${w}: node id used twice`); nodes[n.id] = n;
        if (!str(n.title)) E.push(`${w}: “title” is required`);
        if (!['core', 'field', 'lesson'].includes(n.kind)) E.push(`${w}: kind must be "core", "field" or "lesson"`);
        if (!(n.concepts || []).length && n.kind !== 'lesson') E.push(`${w}: a node needs concepts`);
        if (n.path != null && !TYPES.includes(n.path)) E.push(`${w}: path must be one of ${TYPES.join(', ')}`);
        if (n.kind === 'lesson') {
          const fl = n.functions, allf = Array.isArray(fl) ? fl : isObj(fl) ? Object.values(fl).flat() : [];
          if (isObj(fl)) for (const k of Object.keys(fl)) if (k !== '*' && !TYPES.includes(k) && !langs.includes(k)) E.push(`${w}: functions: “${k}” is not "*", a language type or a course language`);
          if (!allf.length) E.push(`${w}: a lesson needs its grammar (functions)`);
          for (const f of allf) if (!fns[f]) E.push(`${w}: unknown function “${f}”`);
          if (n.step != null && !(Number.isInteger(n.step) && n.step >= 0)) E.push(`${w}: step must be a whole number ≥ 0`);
        } else if (n.functions) E.push(`${w}: only lessons have functions`);
        if (n.stage != null && !['foundations', 'core', 'advanced'].includes(n.stage)) E.push(`${w}: stage must be foundations, core or advanced (D17)`);
        if (n.stage === 'advanced' && !['field', 'grammar', 'lexicon', 'variety', 'text', 'culture'].includes(n.family)) E.push(`${w}: an advanced module names its family (D17)`);
        for (const x of n.langs || []) if (!langs.includes(x)) E.push(`${w}: “${x}” in langs is not a course language`);
        (n.concepts || []).forEach((cid, i) => {
          if (!concepts[cid]) { E.push(`${w}: unknown concept “${cid}”`); return; }
          if (n.concepts.indexOf(cid) !== i) E.push(`${w}: concept “${cid}” listed twice`);
          (own[cid] = own[cid] || []).push(n.id);
          if (n.kind === 'field' && (concepts[cid].field !== n.field || concepts[cid].tier !== n.tier)) E.push(`${w}: concept “${cid}” is ${concepts[cid].field} tier ${concepts[cid].tier}, the node is ${n.field} tier ${n.tier}`);
        });
      }
      for (const n of Object.values(nodes)) for (const p of n.prereqs || []) if (!nodes[p]) E.push(`core/nodes.json · ${n.id}: unknown prerequisite “${p}”`);
      for (const [cid, c] of Object.entries(concepts)) { if (c.pending && own[cid]) E.push(`concept ${cid}: is pending but node ${own[cid][0]} teaches it: remove "pending"`); else if (!c.pending && !own[cid]) E.push(`concept ${cid}: is in no node (a meaning not taught yet is "pending": true)`); }
      const state = {}; const visit = (x, path) => { if (state[x] === 1) { E.push('core/nodes.json: cycle: ' + [...path, x].join(' → ')); return; } if (state[x] === 2 || !nodes[x]) return; state[x] = 1; for (const p of nodes[x].prereqs || []) visit(p, [...path, x]); state[x] = 2; };
      Object.keys(nodes).forEach(x => visit(x, []));
      // additive: a course that has content keeps every node and concept it had
      for (const n of data.nodes || []) if (!nodes[n.id]) E.push(`core/nodes.json: node “${n.id}” is missing — the core of a course that has content only grows (progress is kept by its ids)`);
      for (const c of Object.keys(conceptsOf(data))) if (!concepts[c]) E.push(`concept ${c}: is missing — concepts are never removed`);
      // the declarations of every language (language.json): from the course, the library, or this answer
      const decl = {};
      for (const L of langs) {
        const lj = ans.languages?.[L] || data.langs?.[L]?.language;
        if (!isObj(lj)) { E.push(`lang/${L}/language.json: missing — give it in "languages" (code, typology, script, dir, tokenJoin, paradigmCells, citationCells, wordFeatures; its catalogue of phenomena comes first, D14)`); continue; }
        decl[L] = lj;
        if (ans.languages?.[L]) {
          if (lj.code !== L) E.push(`lang/${L}/language.json: code must be “${L}”`);
          if (!['ltr', 'rtl'].includes(lj.dir)) E.push(`lang/${L}/language.json: dir must be "ltr" or "rtl"`);
          if (!['space', 'none'].includes(lj.tokenJoin)) E.push(`lang/${L}/language.json: tokenJoin must be "space" or "none"`);
          if (!TYPES.includes(lj.typology)) E.push(`lang/${L}/language.json: typology must be one of ${TYPES.join(', ')} (D10)`);
          if (!isObj(lj.paradigmCells)) E.push(`lang/${L}/language.json: paradigmCells is required (the cells every word of a part of speech fills)`);
          if (!isObj(lj.wordFeatures)) E.push(`lang/${L}/language.json: wordFeatures is required (D14, §4.5.1)`);
        }
      }
      for (const L of Object.keys(ans.languages || {})) if (!langs.includes(L)) E.push(`languages.${L}: not a course language`);
      // per language: lessons form one chain, a concept is taught at most once
      for (const L of Object.keys(decl)) {
        const typ = decl[L].typology, app = new Set(Object.values(nodes).filter(n => applies(n, L, typ)).map(n => n.id));
        for (const [cid, ns] of Object.entries(own)) { const m = ns.filter(x => app.has(x)); if (m.length > 1) E.push(`core/nodes.json · ${L}: concept “${cid}” is taught twice in ${L}: ${m.join(', ')}`); }
      }
      const lessons = Object.values(nodes).filter(n => n.kind === 'lesson');
      const ty = ans.typology || data.typology;
      if (lessons.length && !(isObj(ty) && Array.isArray(ty.types) && TYPES.every(t => ty.types.some(x => x.id === t)))) E.push('core/typology.json: the four language types (isolating, agglutinating, fusional, polysynthetic) are required when the course has lessons');
      // D13: one common order of the subjects — within the course and against the library courses
      if (!E.length) {
        const mineData = { course: data.course, nodes: ans.nodes, langs: Object.fromEntries(Object.entries(decl).map(([L, lj]) => [L, { language: lj }])) };
        const paths = coursePaths(mineData, rec.id);
        for (const p of peers || []) { try { paths.push(...coursePaths(p)); } catch (e) { } }
        for (const m of orderConflicts(paths, rec.id + '/')) E.push(`parallel order (D13): ${m} — a subject common to several paths keeps the same place in all of them (docs/LANGUAGES.md §4.4.3)`);
      }
    }
    /** Is this answer good for this task? → [problems] (empty: accepted). peers: the library courses (D13). */
    function checkAnswer(rec, data, task, ans, { peers = [] } = {}) {
      if (!isObj(ans)) return ['the answer must be ONE JSON object (not a list, not text)'];
      const E = shape(SCHEMA[task.kind], ans); if (E.length) return E;
      if (task.kind === KIND.core) { checkCore(E, rec, data, ans, peers); return E.slice(0, 80); }
      if (!(data.nodes || []).length) return ['the course has no core yet: its core task comes first'];
      const code = task.lang, L = data.langs?.[code], lj = L?.language;
      if (task.kind !== KIND.compare) {
        if (!L) return [`“${code}” is not a language of this course`];
        if (!isObj(lj)) return [`lang/${code}/language.json is missing — the course's core task gives it first`];
      }
      if (task.kind === KIND.node) {
        const node = (data.nodes || []).find(n => n.id === task.node); if (!node) return [`node “${task.node}” is not in the course`];
        if (!applies(node, code, lj.typology)) return [`node ${task.node} does not apply to ${code} (path / langs)`];
        checkLexemes(E, data, code, task.node, ans.lexicon, lj);
        const lex = lexIndex(data, code, (ans.lexicon.lexemes || []).filter(isObj).map(x => [x, task.node]), task.node);
        const grams = isObj(ans.grammar) ? ans.grammar : {};
        for (const [fid, g] of Object.entries(grams)) checkRealization(E, data, code, fid, g, lj);
        checkBank(E, data, code, ans.bank || [], lj, { lex, grams, label: `bank/${task.node}.json` });
      } else if (task.kind === KIND.function) {
        checkRealization(E, data, code, task.fn, ans.grammar, lj);
        checkBank(E, data, code, ans.bank || [], lj, { lex: lexIndex(data, code), grams: { [task.fn]: ans.grammar }, fn: task.fn, label: `bank/${task.fn}.json` });
      } else if (task.kind === KIND.compare) {
        const c = ans.compare;
        if (c.function !== task.fn) E.push(`compare/${task.fn}.json: function must be “${task.fn}”`);
        if (!(data.functions || []).some(f => f.id === task.fn)) E.push(`compare: unknown function “${task.fn}”`);
        c.rows.forEach((r, i) => {
          const ks = Object.keys(r.cells || {});
          if (!str(r.aspect)) E.push(`compare/${task.fn}.json · row ${i + 1}: aspect is required`);
          for (const k of ks) { if (!data.course.languages.includes(k)) E.push(`compare/${task.fn}.json · row ${i + 1}: “${k}” is not a course language`); else if (!str(r.cells[k])) E.push(`compare/${task.fn}.json · row ${i + 1}: empty cell for ${k}`); }
          if (ks.length < 2) E.push(`compare/${task.fn}.json · row ${i + 1}: at least two languages side by side`);
        });
      } else if (task.kind === KIND.refill) {
        const only = new Set([...(task.R || []), ...(task.P || [])]);
        checkBank(E, data, code, ans.bank, lj, { lex: lexIndex(data, code), fn: task.fn, only, label: `bank/refill.json` });
      }
      return E.slice(0, 80);
    }

    /* ---------- merges: additive, by id ---------- */
    const upsert = (arr, items, key = 'id') => { for (const it of items || []) { const i = arr.findIndex(x => x?.[key] === it?.[key]); if (i >= 0) arr[i] = it; else arr.push(it); } return arr; };
    /** Apply a checked answer (mutates data — or, for a library course's refill, the patch — and the record) → a log line. */
    function applyAnswer(rec, data, task, ans, { now = Date.now(), patch = null } = {}) {
      let line;
      if (task.kind === KIND.core) {
        upsert(data.fields, clone(ans.fields), 'field'); upsert(data.nodes, clone(ans.nodes)); upsert(data.functions, clone(ans.functions)); upsert(data.frames, clone(ans.frames));
        if (ans.typology) data.typology = clone(ans.typology);
        for (const [L, lj] of Object.entries(ans.languages || {})) if (data.langs[L]) data.langs[L].language = clone(lj);
        line = `the core: ${ans.nodes.length} nodes, ${ans.fields.reduce((a, f) => a + (f.concepts || []).length, 0)} concepts, ${ans.functions.length} grammar points, ${ans.frames.length} frames`;
      } else if (task.kind === KIND.node) {
        const L = data.langs[task.lang], f = L.lexicon[task.node] = L.lexicon[task.node] || { lexemes: [], absent: [] };
        f.absent = f.absent || []; upsert(f.lexemes, clone(ans.lexicon.lexemes)); upsert(f.absent, clone(ans.lexicon.absent || []), 'concept');
        for (const [fid, g] of Object.entries(ans.grammar || {})) L.grammar[fid] = clone(g);
        upsert(L.bank, clone(ans.bank || []));
        line = `${task.node} in ${nameOf(task.lang)}: ${ans.lexicon.lexemes.length} words, ${(ans.lexicon.absent || []).length} absent, ${(ans.bank || []).length} sentences`;
      } else if (task.kind === KIND.function) {
        const L = data.langs[task.lang]; L.grammar[task.fn] = clone(ans.grammar); upsert(L.bank, clone(ans.bank || []));
        line = `${task.fn} in ${nameOf(task.lang)}: the realization + ${(ans.bank || []).length} sentences`;
      } else if (task.kind === KIND.compare) {
        (data.compare = data.compare || {})[task.fn] = clone(ans.compare); line = `${task.fn} compared across ${data.course.languages.length} languages`;
      } else if (task.kind === KIND.refill) {
        if (patch) { const P = patch.langs[task.lang] = patch.langs[task.lang] || { bank: [] }; upsert(P.bank, clone(ans.bank)); patch.rev = (patch.rev || 0) + 1; }
        upsert(data.langs[task.lang].bank, clone(ans.bank));
        line = `${ans.bank.length} new sentences for ${task.fn} in ${nameOf(task.lang)} with the words you know`;
      }
      if (!patch) { data.rev = (data.rev || 0) + 1; rec.rev = data.rev; }
      const t = (rec.tasks || []).find(x => x.id === task.id && isOpen(x)); if (t) { t.status = 'done'; t.doneAt = iso(now); delete t.claimedAt; }
      rec.updated = iso(now); (rec.log = rec.log || []).push({ t: now, m: '✓ ' + line }); if (rec.log.length > 200) rec.log = rec.log.slice(-200);
      return line;
    }
    /** The course as it will be once the app has merged the answers waiting in the inbox (the connector works on this). */
    function merged(rec, data, rows, { peers = [] } = {}) {
      const r = clone(rec), d = clone(data);
      for (const row of [...rows].sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
        let e; try { e = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; } catch (x) { continue; }
        const t = byId(r, e?.task); if (t && !checkAnswer(r, d, t, e.data, { peers }).length) applyAnswer(r, d, t, e.data);
      }
      return { rec: r, data: d };
    }
    const inboxKey = (cid, seq) => `${IN}${cid}:${seq || Date.now().toString(36).padStart(9, '0') + '-' + Math.random().toString(36).slice(2, 6)}`;
    const claimKey = (cid, tid) => `${CLAIM}${cid}:${tid}`;

    /* ---------- the task as text (the connector, a copied task, the in-app runner) ---------- */
    const RULES = `The binding rules (docs/LANGUAGE_RULES.md, D1–D19 — read the whole file: noema_authoring_guide part "languages", or references/LANGUAGE_RULES.md of the skill):
- D1 every gloss, rule text, trap and feedback is written in the course's explanation language.
- D3/D5 correctness over speed: every form, gender, plural, vowel mark, tone and fact is grounded (Wiktionary via kaikki.org — tools/lang_refcheck.py —, CC-CEDICT, reference grammars); leave out what you are not sure of; ref.override only with a reason. You never invent an answer key: exercises are made by the app from the paradigms and sentences you store.
- D6 UniMorph cells (N;NOM;SG, V;PRS;3;SG) and Universal Dependencies parts of speech.
- D9 complete thematic word groups that combine with the words already taught (verbs take the nouns taught, adjectives fit them).
- D10/D13 ONE common order of subjects across every language of every course and every language type: a node, grammar function or concept common to several paths keeps the same place in all of them; type- or language-specific grammar goes inside the common step (functions by "*" / type / code) or into an extra node (path, langs) between the common ones — never a different order for one language.
- D14 every word states its language's whole facade: features for every parameter of wordFeatures (a value, or {"none": "<why>"}); several words for one concept each give contrasts (one axis per concept).
- D15 every distinct meaning of a word is its own concept (pending until a node teaches it); a nuance says "of" the sense it belongs to.
- D16 no built-in point of view: texts describe the language itself, never "unlike English / as in Greek"; comparisons go into notes.
- D18 every grammar page has comparison notes ({for, rel: same|similar|different|new|trap, text}) for at least 8 languages of the reference set covering all four types: fusional el ru es en fr de hi fa mr ar he · agglutinating tr ja ko fi hu sw lg · isolating zh vi · polysynthetic iu.
- D19 every word used anywhere is in the lexicon with its full facade; sentences for the other aspects may hold up to ⌈30 %⌉ unknown words; every field brings ≥ 2 sentences for every non-vocabulary node before it.
- ar and he forms are stored fully vocalized; zh words give pinyin (syllables separated by spaces), trad, and measure words for nouns.`;
    const fmtForms = x => { const f = x.forms || {}; const ks = Object.keys(f); return ks.length ? ' {' + ks.map(k => `${k}=${f[k]}`).join(', ') + '}' : ''; };
    /** The words of a language written so far (before a node in course order when `before` is given): one line each, with all forms. */
    function wordLines(data, code, { before = null, only = null, max = 1500 } = {}) {
      const { out } = topo(data.nodes || []), stop = before ? out.indexOf(before) : out.length, lines = [];
      for (const nid of out.slice(0, stop < 0 ? out.length : stop)) for (const x of data.langs?.[code]?.lexicon?.[nid]?.lexemes || []) {
        if (only && !only.has(x.id)) continue;
        lines.push(`${x.id} · ${x.lemma} · ${x.pos}${x.gender ? ' ' + x.gender : ''} · ${(x.senses || []).join(', ') || x.role || ''}${fmtForms(x)}`);
      }
      return lines.length > max ? lines.slice(0, max).concat([`… and ${lines.length - max} more (in the course file)`]) : lines;
    }
    const nodeLine = (n, code, typ) => `${n.id} (${n.kind}${n.stage ? ', ' + n.stage : ''}${n.field ? ', ' + n.field + ' tier ' + n.tier : ''}${n.path ? ', path ' + n.path : ''}${n.langs ? ', only ' + n.langs.join('/') : ''}) — ${n.title}${n.prereqs?.length ? ' · after ' + n.prereqs.join(', ') : ''}${n.kind === 'lesson' ? ' · grammar: ' + (code ? lessonFns(n, code, typ).join(', ') : JSON.stringify(n.functions)) : ''} · ${(n.concepts || []).length} concepts`;
    /** {id, kind, title, system, prompt, schema} — the prompt says everything but how to deliver the answer. */
    function taskSpec(rec, data, task, { peers = [], courseUrl = '' } = {}) {
      const c = data.course, code = task.lang, lj = code ? data.langs?.[code]?.language : null, typ = lj?.typology;
      const concepts = conceptsOf(data), head = `Course “${c.title}” (${c.id}) · languages: ${c.languages.map(x => `${nameOf(x)} (${x})`).join(', ')} · explanations in ${nameOf(c.explainLang)} (${c.explainLang})${(c.knownLanguages || []).length ? ' · the learner already speaks: ' + c.knownLanguages.join(', ') : ''}`;
      const system = `You write content for a noema-lite language course (docs/LANGUAGES.md). Correctness first: every form, gender, plural, vowel mark, tone and fact is grounded in reference data. Answer only through the requested JSON structure.`;
      const frames = (data.frames || []).map(f => `${f.id}: ${f.meaning}`).join('\n') || '(none yet)';
      const fnsList = (data.functions || []).map(f => `${f.id} (${f.category}) — ${f.title}`).join('\n') || '(none yet)';
      let title, what, ctx = '';
      if (task.kind === KIND.core) {
        title = 'The core of the course: concepts (fields), the node DAG, grammar functions, frames';
        what = `Write the language-neutral core of this course (docs/LANGUAGES.md §4.1–§4.4, §4.7, §4.8): \`fields\` (core/fields/<field>.json each: field, title, subgroups, sources — how the list was made complete —, concepts {id, gloss, subgroup, tier 1–3, rank, wikidata?, pending?}), \`nodes\` (core/nodes.json: the foundations S00–S18 as lessons fd.00–fd.18 with step, stage and functions by "*" / type / language code, then the core lessons and the field branches with tiers; prerequisites; every non-pending concept in exactly one node), \`functions\` (core/functions/<id>.json: id, title, category, level, after), \`frames\` (core/frames.json: id, meaning), \`typology\` (core/typology.json: the four types, when the course has lessons) and \`languages\` (language.json for every course language that has none below).
Depth per language: ${Object.entries(c.defaults?.depth || {}).map(([k, v]) => `${k} ${v}`).join(', ')}. Build on the library course: the same node ids, function ids and concept ids for the same subjects, in the same order (D13) — then the check of the parallel order passes. The library course file (with every concept) is ${courseUrl || 'library/languages/<id>/course.pack.js on the noema-lite website'}.`;
        ctx = (peers || []).map(p => { const tp = topo(p.nodes || []); return `### The common order of the library course “${p.course?.title}” (${p.course?.id}) — keep it\n` + tp.out.map(id => nodeLine(tp.by[id])).join('\n') + `\nFunctions: ${(p.functions || []).map(f => f.id).join(', ')}`; }).join('\n\n');
        ctx += `\n\n### The languages\n` + c.languages.map(L => `${L}: ${data.langs[L]?.language ? `language.json exists (typology ${data.langs[L].language.typology}) — do not repeat it` : 'NO language.json yet — give it in "languages" (its catalogue of phenomena must exist: library/languages/_phenomena/' + L + '.json, D14)'}`).join('\n');
      } else if (task.kind === KIND.node) {
        const n = (data.nodes || []).find(x => x.id === task.node) || { concepts: [] };
        title = `${n.title} (${task.node}) in ${nameOf(code)}`;
        what = `Write node ${task.node} in ${nameOf(code)} (${code}): \`lexicon\` = lang/${code}/lexicon/${task.node}.json — a lexeme for every concept of the node (or an "absent" entry with reason and what is said instead), each with id "${code}:<lemma>", lemma, pos, senses (concept ids; every meaning a concept, D15), forms (every cell of paradigmCells for its part of speech; fully vocalized for ar/he), gender, features (the whole facade, D14), contrasts when a concept has several words, ref, and its profile (§4.6) — and \`bank\`: sentences (lang/${code}/bank) that combine the new words with the earlier ones (at least 3 per new content word over the course's frames, variants for negation / questions / plural where the functions allow), every token {t, l, f} equal to its paradigm cell, ids "${code}.${task.node}.001"…, gloss in ${nameOf(c.explainLang)}; list in "functions" only grammar a word of the sentence shows (by the realization's evidence).` + (n.kind === 'lesson' ? ` This is a lesson: give in \`grammar\` the realization of every function of the lesson in ${code} that is not written yet (${lessonFns(n, code, typ).filter(f => !data.langs[code].grammar[f]).join(', ') || 'none'}).` : '');
        ctx = `### The node\n${nodeLine(n, code, typ)}\nConcepts:\n${(n.concepts || []).map(cid => `- ${cid}: ${concepts[cid]?.gloss || ''}${concepts[cid]?.subgroup ? ' [' + concepts[cid].subgroup + ']' : ''}${concepts[cid]?.note ? ' — ' + concepts[cid].note : ''}`).join('\n')}\n\n### language.json of ${code}\n${JSON.stringify({ typology: lj?.typology, dir: lj?.dir, tokenJoin: lj?.tokenJoin, capitalizeFirst: lj?.capitalizeFirst, vowelMarks: lj?.vowelMarks, paradigmCells: lj?.paradigmCells, citationCells: lj?.citationCells, extraTags: lj?.extraTags, wordFeatures: lj?.wordFeatures })}\n\n### The words of ${code} written before this node (id · lemma · pos · concepts {cell=form})\n${wordLines(data, code, { before: task.node }).join('\n') || '(none yet)'}\n\n### Grammar realized in ${code} (a sentence may list these when a word shows them)\n${Object.entries(data.langs[code].grammar || {}).map(([fid, g]) => `${fid}: ${g.status}; evidence ${JSON.stringify(g.evidence || {})}`).join('\n') || '(none yet)'}`;
      } else if (task.kind === KIND.function) {
        const f = (data.functions || []).find(x => x.id === task.fn) || {};
        title = `${f.title || task.fn} (${task.fn}) in ${nameOf(code)}`;
        what = `Write the realization of ${task.fn} in ${nameOf(code)}: \`grammar\` = lang/${code}/grammar/${task.fn}.json (function, status realized | periphrastic | absent, summary, blocks, procedure.askYourself, traps, evidence {tags | lemmas | punct, exclude?}, paradigmCells, needs, generators — exercise ids of §6 —, notes for the reference set, D18; an absent point says how the language expresses the meaning instead) — and \`bank\`: at least 12 sentences that show it (each lists ${task.fn} in functions and a word of it shows the evidence), made only of words of the lexicon below.`;
        ctx = `### The function\n${JSON.stringify(f)}\n\n### language.json of ${code}\n${JSON.stringify({ typology: lj?.typology, tokenJoin: lj?.tokenJoin, paradigmCells: lj?.paradigmCells, extraTags: lj?.extraTags })}\n\n### The words of ${code} (id · lemma · pos · concepts {cell=form})\n${wordLines(data, code).join('\n') || '(none yet)'}${data.langs[code]?.grammar?.[task.fn] ? `\n\n### The realization written so far (improve it, keep what is right)\n${JSON.stringify(data.langs[code].grammar[task.fn])}` : ''}`;
      } else if (task.kind === KIND.compare) {
        const f = (data.functions || []).find(x => x.id === task.fn) || {};
        title = `${f.title || task.fn} (${task.fn}) across the course languages`;
        what = `Write \`compare\` = compare/${task.fn}.json: {function: "${task.fn}", rows: [{aspect, cells: {<language code>: text}}], notes?} — one row per aspect of the point (form, position, agreement, what it marks, what is absent …), every course language side by side, neutral (D16), examples in the languages themselves.`;
        ctx = c.languages.map(L => `### ${nameOf(L)} (${L})\n${data.langs[L]?.grammar?.[task.fn] ? JSON.stringify({ status: data.langs[L].grammar[task.fn].status, summary: data.langs[L].grammar[task.fn].summary, traps: data.langs[L].grammar[task.fn].traps }) : '(not written yet)'}`).join('\n\n');
      } else {
        const f = (data.functions || []).find(x => x.id === task.fn) || {}, g = data.langs?.[code]?.grammar?.[task.fn] || {};
        const only = new Set([...(task.R || []), ...(task.P || [])]);
        title = `More sentences for ${f.title || task.fn} in ${nameOf(code)} with the words the learner knows`;
        what = `Write \`bank\`: new sentences (at least 12, more is better, all different) for ${task.fn} in ${nameOf(code)} that use ONLY the learner's known words below (§7.4: requirements ⊆ known) — every sentence lists ${task.fn} in functions and a word of it shows the evidence; tokens {t, l, f} equal to the paradigm cells; new ids "${code}.refill.${task.fn.replace(/^fn\./, '')}.${task.n}.001"…; gloss in ${nameOf(c.explainLang)}; frames from the list (the meaning of a frame may be stretched: the frame groups sentences of one pattern).`;
        ctx = `### The point\n${task.fn}: ${f.title || ''} — ${g.summary || ''}\nevidence: ${JSON.stringify(g.evidence || {})}\nThe learner has ${task.have ?? '?'} usable sentences for it now.\n\n### The learner's known words in ${code} (R: recognized; the ones marked P are also produced)\n${wordLines(data, code, { only }).map(l => (task.P || []).includes(l.split(' · ')[0]) ? l + ' · P' : l).join('\n')}\n\n### language.json\n${JSON.stringify({ tokenJoin: lj?.tokenJoin, capitalizeFirst: lj?.capitalizeFirst })}`;
      }
      const prompt = `${head}\nTask ${task.id} (${task.kind})\n\n${RULES}\n\n## What to write\n${what}\n\n## The course\nFrames:\n${frames}\n\nGrammar functions:\n${fnsList}\n\n${ctx}`;
      return { id: task.id, kind: task.kind, title, system, prompt, schema: SCHEMA[task.kind] };
    }
    /** The whole task as text. mode 'connector' (answer with noema_lang_submit) or 'paste' (answer with the JSON only). */
    /** files: how Claude gets the course file(s) into its sandbox: [{url, name}] (the first one is unpacked; a library course
        comes as course.pack.js + course.profiles.js; a library course's private patch as patch.json). */
    function taskText(rec, data, task, { mode = 'connector', files = [], peers = [], libraryUrl = '' } = {}) {
      const t = taskSpec(rec, data, task, { peers, courseUrl: libraryUrl });
      const folder = `work/lang/${data.course.id}`, L = task.lang ? ` --lang ${task.lang}` : '';
      const main = files[0]?.name || 'course.json', patch = files.find(f => f.name === 'patch.json');
      const get = files.length ? files.map(f => `curl -sSL -o ${f.name} "${f.url}"`).join('\n   ') : `(the learner attaches the course file course-${data.course.id}.json to this chat — save it as course.json)`;
      const check = `## Check it before you answer (the noema-pack-builder toolkit: the skill, or noema_get_toolkit)
1. ${get}
2. python3 scripts/lang_course.py unpack ${main} work/lang${patch ? ' --patch patch.json' : ''}        → the course as a folder: ${folder}
3. Write your answer as ONE JSON object to answer.json (the structure below), then
   python3 scripts/lang_course.py apply ${folder} answer.json ${task.id}   (writes it into the folder)
4. python3 scripts/validate_lang.py ${folder}${L} --alone               → fix every ❌ (warnings about nodes not written yet are fine)
${task.kind === KIND.compare || task.kind === KIND.core ? '' : `5. python3 scripts/lang_refcheck.py ${folder}${L}                       → every form against Wiktionary (kaikki.org); explain a deliberate difference in ref.override\n`}6. python3 scripts/lang_course.py answer ${folder} ${task.id} > answer.json   → the answer, read back from the folder`;
      const how = mode === 'connector'
        ? `## How to answer\nCall **noema_lang_submit** with course_id "${data.course.id}", task_id "${task.id}" and result_json = the answer (ONE JSON object, no prose, no code fence). It is checked exactly as noema-lite checks it: if it lists problems, fix ALL of them and submit the corrected object again. When it is accepted, call noema_lang_task for the next task.`
        : `## How to answer\nAnswer with exactly ONE JSON object that matches the JSON Schema below — only the JSON, nothing before or after it. The learner pastes it into noema-lite, which checks it; if it lists problems, fix all of them and send the whole corrected object again.`;
      return `# noema-lite language task — ${t.title}\n\n## Your role\n${t.system}\n\n${t.prompt}\n\n${check}\n\n${how}\n\n## JSON Schema of the answer\n${JSON.stringify(t.schema)}\nThe full schema of every file: schemas/noema.lang.v1.schema.json in the toolkit; the contract: references/LANGUAGES.md (§4) and the skill's LANGUAGES.md.`;
    }
    /** The message the learner pastes into a Claude chat with the connector. */
    function message(rec, { count = 1 } = {}) {
      const w = work(rec), n = w.queued.length;
      return `Use the noema-lite connector to write my noema-lite language course “${rec.title}” (course_id ${rec.id}): ${n ? `do the next ${count > 1 ? Math.min(count, n) + ' queued tasks' : 'queued task'} (${n} waiting)` : 'see what is left to do'}.\nCall noema_lang_task with course_id "${rec.id}" and follow what it returns — check every answer with the toolkit (validate_lang.py, lang_refcheck.py) before noema_lang_submit; after each accepted answer call noema_lang_task again. Stop after ${count > 1 ? count + ' tasks' : 'one task'} or when it says there is nothing left. Do not ask me questions — choose sensible defaults.`;
    }

    return { LANGJOBS: { FORMAT, DATA, PATCH, IN, CLAIM, LEASE, KIND, SCHEMA, REF },
      langNewCourseId: newCourseId, langNewCourse: newCourse, langLibraryRecord: libraryRecord, langEmptyPatch: emptyPatch, langApplyPatch: applyPatch,
      langQueue: queueTask, langOpenTasks: order, langSettle: settle, langWork: work, langTaskById: byId, langNext: next, langNeeds: needs, langQueueNight: queueNight, langRefillRequest: refillRequest,
      langCoursePaths: coursePaths, langOrderConflicts: orderConflicts, checkLangAnswer: checkAnswer, applyLangAnswer: applyAnswer, langMerged: merged, langInboxKey: inboxKey, langClaimKey: claimKey,
      langTaskSpec: taskSpec, langTaskText: taskText, langMessage: message, langWordLines: wordLines };
  })();
  API.GEN = GEN;
  Object.assign(API, LANG_P8);   // P8 — Through Claude: account courses, tasks, checks, merges
  /* ---------- extensions by phase (P4 script, P5 grammar, P6 polyglot, P7 production): each adds its functions with Object.assign(API, {…}) in its own section below ---------- */
  root.NoemaLang = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
