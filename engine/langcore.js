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
    if (!it || (it.seen == null && !it.r && !it.p)) return ns && ns !== 'locked' ? 'ready' : 'locked';
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
    const ok = selectSentences(C, code, { known: k.R, functions: [fid] });
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
    const state = !needsMet || !ok.length ? 'locked' : ok.length >= min ? 'ready' : 'thin';
    return { state, sentences: ok.length, needs, unlockBy };
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
    const gens = (g.generators && g.generators.length) ? g.generators : [{ type: 'sentence_meaning' }, { type: 'build_sentence' }, { type: 'transform' }];
    const fnsOf = gen => gen.bank?.functions || [fid];
    // the sentences a generator draws on: by functions (default: this one) or by frames (for points no word shows, e.g. a verbless “to be”)
    const U = opts.strictKnown ? 0 : 'auto';   // D19: up to ⌈30 %⌉ unknown words (marked 🆕); strictKnown: only known words
    const bankFor = gen => gen.bank?.frames ? selectSentences(C, code, { known: K, maxUnknown: U }).filter(s => gen.bank.frames.includes(s.frame)) : selectSentences(C, code, { known: K, functions: fnsOf(gen), maxUnknown: U });
    const pools = [];
    for (const gen of gens) {
      const items = [];
      if (['inflect', 'principal_parts', 'paradigm'].includes(gen.type)) {
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
        const conceptKey = o => o.req.map(l => (X.lex[l]?.senses || [])[0] || l).sort().join('|');
        for (const s of ss) {
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
        items.push(...(GEN[gen.type]({ C, L, code, fid, g, gen, k, K, rng, bank: () => bankFor(gen), max }) || []));
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
    const X = C.lang[code], text = joinTokens(tiles.map(t => ({ t })), X.language.tokenJoin);
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
  /* ---------- extensions by phase (P4 script, P5 grammar, P6 polyglot, P7 production): each adds its functions with Object.assign(API, {…}) in its own section below ---------- */
  root.NoemaLang = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
