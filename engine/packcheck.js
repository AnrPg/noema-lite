/* noema-lite — pack checks shared by the app (in-browser generators) and the Claude connector (src/connector).
   checkPack(p, expectId, { strict }) → { errors, warnings, counts }
   strict = also check every exercise's own fields (used for packs generated in the browser, where nothing
   else validated them; the Python validator in the skill is the full check for skill-built packs).
   i18n (docs/i18n.md): every message here stays English — they are diagnostics with the pack's own field names, read by
   the AI that repairs its chapter (engine/packgen.js), by Claude through the connector, and by the learner only as the
   technical detail after a translated sentence (“The pack has 3 error(s): …”, engine/curjobs.js, engine/packgen.js). */
(function (root) {
  /* i18n-ignore-start */
  const TYPES = new Set(['mcq', 'tf', 'odd', 'order', 'match', 'bucket', 'cloze', 'spotbug', 'calc', 'scenario', 'free', 'write', 'flaw', 'case', 'predict', 'tree', 'inquiry', 'debate', 'sim', 'img_hotspot', 'img_sequence', 'img_reveal', 'img_drag', 'img_label', 'img_select', 'img_occlusion']);
  const BLOCKS = new Set(['p', 'list', 'code', 'diagram', 'table', 'callout', 'compare', 'flow', 'reveal', 'ask', 'terms', 'figure', 'interactive']);
  const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
  const isStr = v => typeof v === 'string' && v.trim().length > 0;
  const strs = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every(isStr);
  const intIn = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

  /* The SHAPE of every format (which fields, of which type, which values) is its data contract: the JSON Schemas of
     src/contracts/schemas, compiled into engine/contracts.js (NoemaCore.contracts, loaded before this file; in Node it is
     required from beside this file). This file keeps what a schema cannot say: an answer that must be one of its
     options, ids that must exist and be unique, the pack's own language, a bridge of the right pack … */
  if (!(root.NoemaCore && root.NoemaCore.contracts) && typeof require === 'function' && typeof __dirname === 'string') { try { require(require('path').join(__dirname, 'contracts.js')); } catch (e) { } }
  const contracts = () => { const c = root.NoemaCore && root.NoemaCore.contracts; if (!c) throw new Error('engine/contracts.js is not loaded (npm run contracts builds it)'); return c; };
  /** The contract's issues as messages: "<where>: <field>: <what>" (where = '' → "<field>: <what>"). */
  const shapeOf = (id, x, where) => contracts().check(id, x).issues.map(i => (where ? `${where}: ` : '') + i.text);

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

  /** The quality rules of packs with subject.authoring.rules >= 2 — the SAME object as tools/pack_rules.json "quality" and the SAME
      checks as tools/pack_quality.py (tests/pack_rules.js compares both on the same chapters). docs/PIPELINES.md §4. */
  const QUALITY = {"version": 2, "vocab": {"types": ["bucket", "calc", "case", "cloze", "debate", "flaw", "free", "img_drag", "img_hotspot", "img_label", "img_occlusion", "img_reveal", "img_select", "img_sequence", "inquiry", "match", "mcq", "odd", "order", "predict", "scenario", "sim", "spotbug", "tf", "tree", "write"], "think": ["recall", "explain", "apply", "discriminate", "analyze", "evaluate", "create"], "applyPlus": ["apply", "discriminate", "analyze", "evaluate", "create"], "critical": ["analyze", "evaluate", "create"], "modes": ["contradiction", "reverse", "whatif", "perturb", "causal", "distinguish", "translate", "ambiguity", "feynman", "combine", "dialectic"], "cats": ["pitfall", "confusable", "falsefriend", "detail", "sequence", "multipart", "nomenclature", "acronym", "formula", "edge", "recent", "hard-understand", "hard-remember"], "levels": ["foundation", "core", "advanced"], "tags": ["concept", "syntax", "pitfall", "debug", "exam", "interview", "calc", "compare"]}, "optIn": {"types": ["sim"]}, "autoUnfit": {"code": ["spotbug", "write", "syntax"], "math": ["calc"], "pictures": ["img_hotspot", "img_sequence", "img_reveal", "img_drag", "img_label", "img_select", "img_occlusion"]}, "checks": [{"id": "map.present", "level": "error", "what": "the chapter has its knowledge map (map/chNN.json → chapter.map)"}, {"id": "map.refs", "level": "error", "what": "points and learnables are well formed: unique ids, known levels and categories, every kp / with id exists"}, {"id": "map.exhaustive", "level": "error", "what": "every knowledge point is in a learnable, or names the earlier DAG node that taught it (taughtIn)"}, {"id": "fit.declared", "level": "error", "what": "every exercise type, focus tag and paradigm is in fits, or has a reason in unfit"}, {"id": "fit.types", "level": "error", "min": 3, "minPerKind": {"sim": 1}, "what": "every type in fits.types (sim, an interactive activity, is opt-in: listed in fits.types only where an activity teaches, then >= 1)"}, {"id": "fit.focus", "level": "error", "min": 3, "what": "every focus tag in fits.focus"}, {"id": "mode.coverage", "level": "error", "min": 2, "what": "every paradigm in fits.modes"}, {"id": "mix.difficulty", "level": "error", "target": {"1": 20, "2": 25, "3": 55}, "tol": 5, "what": "difficulty 1/2/3 = 20/25/55 % of the chapter"}, {"id": "mix.think", "level": "error", "recallMax": 25, "applyPlusMin": 40, "criticalMin": 3, "what": "recall <= 25 %, apply or higher >= 40 %, critical thinking (analyze/evaluate/create) >= 3 exercises"}, {"id": "mix.order", "level": "warn", "maxInversions": 25, "what": "inside a section, easier exercises come first"}, {"id": "lr.link", "level": "error", "what": "every exercise names its learnable (lr), its kind of thinking (think) and, if any, a known paradigm (mode)"}, {"id": "lr.facades", "level": "error", "min": 2, "types": 2, "what": "every learnable has >= 2 versions in >= 2 exercise types"}, {"id": "cats.facades", "level": "error", "min": 2, "types": 2, "what": "every knowledge point with a category has >= 2 exercises in >= 2 types"}, {"id": "source.questions", "level": "error", "what": "every exercise / question / problem of the sources (map.sourceQuestions) is in the chapter, written out in full, with its answer: answerFrom 'source' (the source's own solution: its result is taken as correct, no second check, but the exercise's explanation is rewritten more detailed, insightful and explanatory than the source's) or 'claude' (solved here, then double-checked: check says how), and an exercise that cites it (cite.sq)"}, {"id": "theory.tables", "level": "error", "kinds": {"compare": {"cols": 3, "rows": 2, "what": "a comparative matrix: concepts side by side against the same criteria"}, "summary": {"cols": 2, "rows": 3, "what": "a table that categorises or sums up the chapter's concepts"}, "breakdown": {"cols": 4, "rows": 2, "what": "related concepts brought together and broken down across columns of different parameters"}}, "what": "the theory has all three kinds of table (a table block's kind: compare, summary, breakdown), each big enough to be one; a chapter with nothing to put in one gives the reason in map.unfit['table.<kind>']"}, {"id": "example.restated", "level": "warn", "skip": ["explain", "why", "fb", "outcome", "model", "rubric", "fix", "solution", "note"], "what": "an exercise does not test the specifics of a lesson's example (unless the example is an interesting case in itself) and never points at it ('the example above', 'in the lesson's example'): it writes the example out in full and then asks a question that needs thinking about it (Q5b)", "patterns": ["\\b(?:the|this|that|our) (?:worked )?example (?:above|earlier|before|we (?:saw|met|studied|read)|(?:from|in) (?:the|this) (?:lesson|theory|section|chapter))\\b", "\\b(?:in|from) the (?:lesson|theory|section|chapter)(?:'s|’s)? example\\b", "\\bas (?:in|shown in) the example\\b", "\\b(?:recall|remember) the example\\b", "(?:στο|το|του|από το) παράδειγμα (?:του μαθήματος|της θεωρίας|της ενότητας|του κεφαλαίου|παραπάνω|που είδαμε)", "όπως στο παράδειγμα", "(?:в|из) пример(?:е|а) (?:выше|урока|из урока|из теории)"]}, {"id": "figure.explained", "level": "warn", "minChars": 120, "what": "every figure, diagram and interactive activity of the theory is explained in detail right after it (a p, list or callout block, >= 120 characters): what it shows (its parts, axes, symbols, arrows, colours; for an activity: its controls and what to try), how to read it and what it teaches; a caption alone is not enough (Q7b)"}, {"id": "sequence.arrows", "level": "warn", "what": "img_sequence (tap the parts in order) rarely teaches on a graph diagram (flowchart, pipeline, DAG, cycle): its arrows already show the order. Keep one only when tracing teaches something the picture does not already show, and say why in map.sequenceWhy['<media id>'] (Q5c)"}, {"id": "cite.present", "level": "error", "what": "every exercise keeps where it comes from in cite {src, loc} (metadata, never in the text)"}, {"id": "self.contained", "level": "error", "what": "no exercise, card or theory text points at the source's structure (question numbers, pages, paragraphs, 'the source says')", "patterns": ["\\bQ\\d{1,3}\\b", "\\bRound \\d+\\b", "\\bp\\.\\s?\\d+", "\\bpages? \\d+", "\\bparagraphs? \\d+", "\\b(?:in|from|according to|see) the (?:source|document|slides?|pdf|handout|reading|text above)\\b", "\\bthe (?:source|document|slides?|pdf|handout) (?:says|states|mentions|shows|lists|gives)\\b", "\\bin the order (?:the source|it is) (?:gives|mentions|lists)", "σελ(?:ίδα|\\.)\\s?\\d+", "(?:η|την|στην|της) πηγή", "σύμφωνα με το κείμενο", "παράγραφο \\d+"]}, {"id": "explain.depth", "level": "error", "minChars": 80, "minSentences": 2, "what": "the explanation says why the answer is right and why the tempting wrong one is wrong (>= 2 sentences, >= 80 characters)"}, {"id": "mcq.why", "level": "error", "what": "every mcq / odd option has its why"}, {"id": "trivial.answer", "level": "error", "minWords": 2, "what": "the right option is not written in the question"}, {"id": "trivial.longest", "level": "warn", "ratio": 1.6, "what": "the right option is not by far the longest"}, {"id": "review.done", "level": "error", "rubricMin": 15, "what": "the second-pass review (review/chNN.json → chapter.review): rubric on >= 15 learnables (or all), every exercise solved blind, every mismatch fixed"}], "notes": ["Strictness: subject.authoring.rules >= 2 turns these checks on (start_subject.py writes 2). Errors when subject.authoring.by is 'claude' or 'gemini', warnings when it is 'learner' or 'import'. Packs without authoring.rules are not checked (made before 2026-10-21; TD-11).", "The connector (noema_finish_upload, noema_save_pack) refuses a pack built since 'since' (pack.builtAt, or no builtAt at all) that has no subject.authoring.rules >= 2, so a pack cannot skip the checks by leaving the field out. Older packs keep working unchanged.", "autoUnfit: a value that cannot fit the chapter needs no reason in unfit — the code types without subject.features.code, calc without .math, picture types when the chapter has no picture (pictures only where they teach, docs/VISUAL.md §5).", "optIn: a value a chapter uses only where it teaches (sim, an interactive activity: docs/INTERACTIVE.md) needs no reason in unfit when it is left out; once listed in fits it counts like any other value, with its own minimum (fit.types minPerKind).", "Counts are never checked: about 2 versions per learnable is the core set; there is no upper limit (docs/PIPELINES.md §4, a mild suggestion only)."], "since": "2026-10-22T00:00:00Z"};
  const LANGS = {"version": 2, "translations": ["en", "el", "ru", "de", "fr"], "bridges": ["en", "el", "ru", "ar", "de", "fr"], "bridgesFrom": ["own", "translations"], "bridgeCoverage": {"everyday": 0.8, "all": 0.9}, "since": "2026-10-22T00:00:00Z", "what": "Every pack with subject.authoring.rules >= 2 ends its flow with a full translation into each of 'translations' (minus its own language) and a 文A bridge for every pair (content language → native language): the content language is the pack's own language AND each of its translations ('bridgesFrom'), the native language each of 'bridges' that is not that content language (user rules 2026-10-21, 2026-10-22 and 2026-11-05: an en pack translated into el, ru, de and fr gets 25 pairs — from each of en, el, ru, de, fr into each of the other five of en, el, ru, ar, de, fr: en→el/ru/ar/de/fr, el→en/ru/ar/de/fr, ru→en/el/ar/de/fr, de→en/el/ru/ar/fr, fr→en/el/ru/ar/de). A translation's bridges are made after the translation, from its text. A translation is its own file (noema-translation, <id>.tr.<locale>.json; docs/i18n.md §10) with the pack's ids, structure and answers, plus the subject's name in that language (subject.i18n.<locale>: title, description, hero, ...). A bridge covers >= bridgeCoverage.all of the content words of the theory and >= bridgeCoverage.everyday of the everyday ones (band 1, and every word no entry covers yet). Checked at the end of the flow (tools/pipeline.py steps translate and bridges; noema_finish_upload lists what is missing), never on the first upload."};
  const qv = v => v == null ? 'none' : `"${v}"`, pct = x => String(Math.floor(x + 0.5));
  const qnorm = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const qsent = t => String(t || '').trim().split(/[.!?;;。]+(?:\s+|$)/u).filter(s => s.trim().length > 1).length;
  const QSKIP = new Set(['id', 'section', 'src', 'cite', 'media', 'lr', 'think', 'mode', 'type', 'tags', 'regions', 'targets', 'kp', 'with']);
  function* qstrings(x, skip) {
    if (typeof x === 'string') yield x;
    else if (Array.isArray(x)) { for (const v of x) yield* qstrings(v, skip); }
    else if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) if (!skip.has(k)) yield* qstrings(v, skip); }
  }
  /** checkQuality(chapter, subject) → [{ level: 'error'|'warn', rule, msg }]. chapter.map = map/chNN.json, chapter.review = review/chNN.json. */
  function checkQuality(ch, subject) {
    const V = QUALITY.vocab, C = Object.fromEntries(QUALITY.checks.map(c => [c.id, c])), out = [], cid = ch?.id ?? '?';
    const add = (rule, msg) => out.push({ level: C[rule].level, rule, msg: `${cid}: [${rule}] ${msg}` });
    const exs = ch?.exercises || [], features = Object.entries(subject?.features || {}).filter(([, v]) => v).map(([k]) => k);
    let m = ch?.map;
    if (!m || typeof m !== 'object' || Array.isArray(m)) { add('map.present', `no knowledge map (write map/${cid}.json before the exercises)`); m = {}; }
    const points = m.points || [], lrs = m.learnables || [];
    const P = new Map(points.filter(p => p && typeof p === 'object').map(p => [p.id, p])), L = new Map(lrs.filter(l => l && typeof l === 'object').map(l => [l.id, l]));
    let seen = new Set();
    for (const p of points) {
      const pid = p.id;
      if (!pid || seen.has(pid)) add('map.refs', `point id ${qv(pid)} missing or repeated`);
      seen.add(pid);
      if (!isStr(p.text)) add('map.refs', `${pid}: needs its text`);
      if (!V.levels.includes(p.level)) add('map.refs', `${pid}: level must be one of ${V.levels.join(', ')}`);
      for (const c of p.cats || []) if (!V.cats.includes(c)) add('map.refs', `${pid}: unknown category ${qv(c)}`);
      for (const w of p.with || []) if (!P.has(w) && !/^ch\d+-k/.test(String(w))) add('map.refs', `${pid}: with ${qv(w)} is not a knowledge point`);
      if ('taughtIn' in p && !isStr(p.taughtIn)) add('map.refs', `${pid}: taughtIn must name the earlier step or chapter`);
    }
    seen = new Set();
    for (const l of lrs) {
      const lid = l.id;
      if (!lid || seen.has(lid)) add('map.refs', `learnable id ${qv(lid)} missing or repeated`);
      seen.add(lid);
      if (!(l.kp || []).length) add('map.refs', `${lid}: kp must list its knowledge points`);
      for (const k of l.kp || []) if (!P.has(k)) add('map.refs', `${lid}: kp ${qv(k)} is not a point of the map`);
    }
    const inlr = new Set(lrs.flatMap(l => l.kp || []));
    for (const p of points) if (!inlr.has(p.id) && !p.taughtIn) add('map.exhaustive', `${p.id}: in no learnable and no taughtIn`);
    const fits = m.fits || {}, unfit = m.unfit || {};
    const pics = exs.some(e => String(e.type || '').startsWith('img_')) || (ch?.sections || []).some(s => (s.blocks || []).some(b => b.t === 'figure'));
    const auto = new Set();
    for (const [f, vals] of Object.entries(QUALITY.autoUnfit)) if (!(f === 'pictures' ? pics : features.includes(f))) vals.forEach(v => auto.add(v));
    for (const v of QUALITY.optIn?.types || []) if (!(fits.types || []).includes(v)) auto.add(v);   // opt-in: no reason needed when left out
    const used = k => new Set(exs.flatMap(e => k === 'tags' ? (e.tags || []) : [e[k]]).filter(v => v != null));
    for (const [key, universe, field] of [['types', V.types, 'type'], ['focus', V.tags, 'tags'], ['modes', V.modes, 'mode']]) {
      const fv = fits[key] || [];
      for (const v of fv) if (!universe.includes(v)) add('fit.declared', `fits.${key}: unknown value ${qv(v)}`);
      for (const v of universe) { if (fv.includes(v) || auto.has(v)) continue; if (!isStr(unfit[v])) add('fit.declared', `${key} ${v}: put it in fits.${key} or give the reason in unfit.${v}`); }
      for (const v of [...used(field)].filter(v => !fv.includes(v)).sort()) if (universe.includes(v)) add('fit.declared', `${v} is used but not in fits.${key}`);
    }
    for (const [key, field, rule] of [['types', 'type', 'fit.types'], ['focus', 'tags', 'fit.focus'], ['modes', 'mode', 'mode.coverage']]) {
      for (const v of fits[key] || []) { const n = C[rule].minPerKind?.[v] ?? C[rule].min; const have = exs.filter(e => field === 'tags' ? (e.tags || []).includes(v) : e[field] === v).length; if (have < n) add(rule, `${v}: ${have} exercise(s), need >= ${n}`); }
    }
    const N = exs.length;
    if (N) {
      let c = C['mix.difficulty'];
      for (const [d, p] of Object.entries(c.target)) { const share = 100 * exs.filter(e => String(e.difficulty) === d).length / N; if (Math.abs(share - p) > c.tol) add('mix.difficulty', `difficulty ${d}: ${pct(share)} %, need ${p} ± ${c.tol} %`); }
      c = C['mix.think'];
      const rec = 100 * exs.filter(e => e.think === 'recall').length / N, app = 100 * exs.filter(e => V.applyPlus.includes(e.think)).length / N, cri = exs.filter(e => V.critical.includes(e.think)).length;
      if (rec > c.recallMax) add('mix.think', `recall ${pct(rec)} %, at most ${c.recallMax} %`);
      if (app < c.applyPlusMin) add('mix.think', `apply or higher ${pct(app)} %, need >= ${c.applyPlusMin} %`);
      if (cri < c.criticalMin) add('mix.think', `critical thinking (analyze/evaluate/create) ${cri} exercise(s), need >= ${c.criticalMin}`);
    }
    for (const s of ch?.sections || []) {
      const ds = exs.filter(e => e.section === s.id).map(e => e.difficulty || 0), pairs = ds.length * (ds.length - 1) / 2;
      let inv = 0; for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) if (ds[i] > ds[j]) inv++;
      if (pairs && 100 * inv / pairs > C['mix.order'].maxInversions) add('mix.order', `${s.id}: put the easier exercises first`);
    }
    const sq = new Map((m.sourceQuestions || []).filter(q => q && typeof q === 'object').map(q => [q.id, q]));
    const pats = C['self.contained'].patterns.map(p => new RegExp(p, 'i'));
    const contained = (where, x, skip = QSKIP) => {
      for (const t of qstrings(x, skip)) for (const p of pats) { const hit = p.exec(t); if (hit) { add('self.contained', `${where}: “${hit[0]}” points at the source; write the example or question out in full`); return; } }
    };
    for (const e of exs) {
      const eid = e.id;
      if (!L.has(e.lr)) add('lr.link', `${eid}: lr ${qv(e.lr)} is not a learnable of the map`);
      if (!V.think.includes(e.think)) add('lr.link', `${eid}: think must be one of ${V.think.join(', ')}`);
      if (e.mode != null && !V.modes.includes(e.mode)) add('lr.link', `${eid}: unknown mode ${qv(e.mode)}`);
      const ci = e.cite;
      if (!(ci && typeof ci === 'object' && !Array.isArray(ci) && isStr(ci.src))) add('cite.present', `${eid}: cite {src, loc} missing`);
      else if (ci.sq != null && !sq.has(ci.sq)) add('source.questions', `${eid}: cite.sq ${qv(ci.sq)} is not a source question of the map`);
      if (e.type !== 'scenario') { const ex = e.explain || '', c = C['explain.depth']; if (ex.trim().length < c.minChars || qsent(ex) < c.minSentences) add('explain.depth', `${eid}: the explanation is too short (why right, why the tempting wrong one is wrong)`); }
      if (e.type === 'mcq' || e.type === 'odd') {
        const opts = e.options || [], why = e.why;
        if (!(Array.isArray(why) && why.length === opts.length && why.every(isStr))) add('mcq.why', `${eid}: needs a why for every option`);
        const ai = Number.isInteger(e.answer) ? e.answer : null;
        if (ai != null && ai >= 0 && ai < opts.length) {
          const right = qnorm(opts[ai]);
          if (e.type === 'mcq' && right.split(' ').filter(Boolean).length >= C['trivial.answer'].minWords && qnorm(e.q).includes(right)) add('trivial.answer', `${eid}: the right option is written in the question`);
          const others = opts.filter((o, i) => i !== ai).map(o => String(o).length);
          if (e.type === 'mcq' && others.length && String(opts[ai]).length >= C['trivial.longest'].ratio * Math.max(...others)) add('trivial.longest', `${eid}: the right option is by far the longest`);
        }
      }
      contained(eid, e);
    }
    for (const f of ch?.flashcards || []) contained(f.id || 'flashcard', f);
    const bskip = new Set([...QSKIP, 't', 'lang', 'code']);
    for (const s of ch?.sections || []) for (const b of s.blocks || []) if (!['code', 'diagram', 'figure'].includes(b.t)) contained(s.id, b, bskip);
    const byLr = new Map(); for (const e of exs) { if (!byLr.has(e.lr)) byLr.set(e.lr, []); byLr.get(e.lr).push(e.type); }
    let c = C['lr.facades'];
    for (const lid of L.keys()) { const ts = byLr.get(lid) || []; if (ts.length < c.min || new Set(ts).size < c.types) add('lr.facades', `${lid}: ${ts.length} exercise(s) in ${new Set(ts).size} type(s), need >= ${c.min} in >= ${c.types}`); }
    c = C['cats.facades'];
    for (const p of points) {
      if (!(p.cats || []).length || p.taughtIn) continue;
      const ts = lrs.filter(l => (l.kp || []).includes(p.id)).flatMap(l => byLr.get(l.id) || []);
      if (ts.length < c.min || new Set(ts).size < c.types) add('cats.facades', `${p.id} (${p.cats.join(', ')}): ${ts.length} exercise(s) in ${new Set(ts).size} type(s), need >= ${c.min} in >= ${c.types}`);
    }
    const cited = new Set(exs.filter(e => e.cite && typeof e.cite === 'object').map(e => e.cite.sq));
    for (const [qid, q] of sq) {
      if (!(isStr(q.text) && isStr(q.answer))) add('source.questions', `${qid}: needs its full text and its checked answer`);
      if (!['source', 'claude'].includes(q.answerFrom)) add('source.questions', `${qid}: answerFrom must be 'source' (the source's own solution) or 'claude' (solved here)`);
      else if (q.answerFrom === 'claude' && !isStr(q.check)) add('source.questions', `${qid}: solved here, so say in check how the answer was double-checked`);
      if (!cited.has(qid)) add('source.questions', `${qid}: no exercise cites it (cite.sq)`);
    }
    const tabs = (ch?.sections || []).flatMap(s => s?.blocks || []).filter(b => b && b.t === 'table');
    for (const [k, need] of Object.entries(C['theory.tables'].kinds)) {
      if (isStr(unfit['table.' + k])) continue;
      if (!tabs.some(b => b.kind === k && (b.head || []).length >= need.cols && (b.rows || []).length >= need.rows)) add('theory.tables', `no ${k} table (a table block with kind '${k}', >= ${need.cols} columns and >= ${need.rows} rows): ${need.what}`);
    }
    // example.restated / figure.explained / sequence.arrows (warnings)
    c = C['example.restated'];
    const xp = c.patterns.map(p => new RegExp(p, 'i')), xskip = new Set([...QSKIP, ...c.skip]);
    for (const e of exs) {
      let hit = null;
      for (const t of qstrings(e, xskip)) { for (const p of xp) { hit = p.exec(t); if (hit) break; } if (hit) break; }
      if (hit) add('example.restated', `${e.id}: “${hit[0]}” points at a lesson's example; write the example out in the exercise and ask a question that needs thinking about it`);
    }
    c = C['figure.explained'];
    for (const s of ch?.sections || []) {
      const bs = (s.blocks || []).filter(b => b && typeof b === 'object' && !Array.isArray(b));
      bs.forEach((b, i) => {
        if (!['figure', 'diagram', 'interactive'].includes(b.t)) return;
        const nx = bs[i + 1] || {}, txt = [...qstrings(Object.fromEntries(Object.entries(nx).filter(([k]) => ['title', 'text', 'items'].includes(k))), new Set())].join(' ');
        if (!['p', 'list', 'callout'].includes(nx.t) || txt.length < c.minChars) add('figure.explained', `${s.id}: the ${b.t}${b.media ? ' ' + qv(b.media) : b.activity ? ' ' + qv(b.activity) : ''} is not explained right after it (what it shows, how to read it, what it teaches)`);
      });
    }
    const sw = m.sequenceWhy && typeof m.sequenceWhy === 'object' && !Array.isArray(m.sequenceWhy) ? m.sequenceWhy : {};
    for (const e of exs) if (e.type === 'img_sequence' && !isStr(sw[e.media])) add('sequence.arrows', `${e.id}: img_sequence on ${qv(e.media)}: if its arrows already show the order, use another type; else say why in map.sequenceWhy`);
    const r = ch?.review; c = C['review.done'];
    if (!r || typeof r !== 'object' || Array.isArray(r)) add('review.done', `no second-pass review (review/${cid}.json)`);
    else {
      const rub = new Set((r.rubric || []).filter(x => x && typeof x === 'object' && L.has(x.lr)).map(x => x.lr)), need = Math.min(c.rubricMin, L.size);
      if (rub.size < need) add('review.done', `the rubric covers ${rub.size} learnable(s), need ${need}`);
      const b = r.blind || {};
      if (!Number.isInteger(b.solved) || b.solved < N) add('review.done', `blind re-solve: ${b.solved ?? 0} of ${N} exercises solved`);
      const open = (b.mismatches || []).filter(x => !(x && typeof x === 'object' && x.fixed === true)).map(x => x?.id);
      if (open.length) add('review.done', `blind re-solve: mismatches not fixed: ${open.slice(0, 8).join(', ')}`);
    }
    return out;
  }

  /** The fields one exercise needs so the engine can show and grade it: its contract (noema.chapter.v1#exercise), then
      what the contract cannot say (exerciseRefs). */
  function checkExercise(e, media) {
    const E = shapeOf('noema.chapter.v1#exercise', e, e && e.id);
    return E.length ? E : exerciseRefs(e, media);
  }
  /** What an exercise's contract cannot say: its answer is one of its own options, lines, buckets, nodes or regions,
      its lists line up, its picture is in the pack. Only for an exercise that meets its contract. */
  function exerciseRefs(e, media) {
    const E = []; const t = e.type; const bad = m => E.push(`${e.id}: ${m}`);
    const perOption = (why, n, what) => { if (why && why.length !== n) bad(`"why" needs one text per ${what}`); };
    switch (t) {
      case 'mcq': case 'odd': {
        if (![].concat(e.answer).every(a => a < e.options.length)) bad('"answer" must be the index of an option');
        perOption(e.why, e.options.length, 'option');
        break;
      }
      case 'match': if (new Set(e.pairs.map(p => p[1])).size !== e.pairs.length) bad('the right sides of "pairs" must be distinct'); break;
      case 'bucket': if (!e.items.every(i => i.bucket < e.buckets.length)) bad('every item\'s "bucket" must be the index of a bucket'); break;
      case 'spotbug': if (!e.bugs.every(b => b < e.lines.length)) bad('"bugs" must be line indexes'); break;
      case 'flaw': if (!e.flaws.every(b => b < e.lines.length)) bad('"flaws" must be line indexes');
        if (e.reason >= e.reasons.length) bad('"reason" must be the index of one of "reasons"');
        break;
      case 'case': e.parts.forEach((p, i) => E.push(...exerciseRefs({ ...p, id: `${e.id} part ${i + 1}` }, media))); break;
      case 'predict': if (Array.isArray(e.options) && e.answer >= e.options.length) bad('"answer" must be the index of an option'); break;
      case 'tree': {
        const N = e.nodes;
        if (!(e.start in N)) bad('"start" must name a node');
        for (const [id, n] of Object.entries(N)) for (const o of n.options) if (o.to != null && !(o.to in N)) bad(`node "${id}": "to" names no node (${o.to})`);
        const seen = new Set(); let at = e.start;   // the right path ends without a loop
        while (at in N && !seen.has(at)) { seen.add(at); at = N[at].options.find(o => o.ok)?.to; }
        if (at != null) bad('the right path of the tree loops or leads nowhere');
        break;
      }
      case 'inquiry': if (e.scores.length !== e.options.length) bad('"scores": one per option');
        else if (e.scores.filter(v => v === Math.max(...e.scores)).length !== 1) bad('exactly one option has the highest score');
        perOption(e.why, e.options.length, 'option');
        break;
      case 'debate': e.sides.forEach((sd, i) => { if (sd.best >= sd.counters.length) bad(`side ${i + 1}: "best" must be the index of a counter`); if (sd.why && sd.why.length !== sd.counters.length) bad(`side ${i + 1}: "why" needs one text per counter`); }); break;
      default:
        if (String(t).startsWith('img_')) {
          const m = media[e.media]; if (!m) { bad(`media "${e.media}" not in pack.media`); break; }
          const regs = Array.isArray(e.regions) ? e.regions : (m.regions || []); const R = new Map(regs.map(r => [r.id, r]));
          if (!R.size && t !== 'img_reveal') bad('the picture has no regions');
          const targets = e.targets || [...R.keys()];
          if ((t === 'img_hotspot' || t === 'img_sequence') && (!Array.isArray(e.answer) || !e.answer.length)) bad('"answer" must list region ids');
          if (['img_drag', 'img_label', 'img_select', 'img_occlusion'].includes(t)) for (const id of targets) if (R.has(id) && !isStr(R.get(id).label)) bad(`region "${id}" needs a label`);
          if (t === 'img_reveal') { if (!strs(e.options, 2)) bad('"options" needed'); else if (![].concat(e.answer).every(a => intIn(a, e.options.length))) bad('"answer" must be an option index'); }
          for (const r of regs) {
            const inside = r.shape === 'circle' ? r.cx >= 0 && r.cy >= 0 && r.cx <= m.w && r.cy <= m.h : r.shape === 'poly' ? Array.isArray(r.points) && r.points.length >= 3 : r.x >= 0 && r.y >= 0 && r.x + r.w <= m.w + 1 && r.y + r.h <= m.h + 1;
            if (!inside) { bad(`region "${r.id}" lies outside the picture`); break; }
          }
        }
    }
    return E;
  }

  /* ---- a pack in several languages (tools/CONTENT_SPEC.md "Packs in several languages"; the shape: noema.subject.v1
     i18n, noema.pack.v3 translations, noema.translation.v1): optional ---- */
  const LOCALE_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;
  /** What a translated exercise must keep (only the words may change): the type, section, picture and everything that decides the answer. */
  const shape = e => JSON.stringify([e.type, e.section, e.media || null, e.answer ?? null, e.targets || null, e.bugs || null, e.grid || null,
    ...['options', 'items', 'pairs', 'buckets', 'lines', 'steps'].map(k => Array.isArray(e[k]) ? e[k].length : null),
    e.type === 'bucket' ? (e.items || []).map(x => x && x.bucket) : null, e.type === 'scenario' ? (e.steps || []).map(st => (st.options || []).map(o => !!o.ok)) : null,
    // the thinking types (flaw, case, predict, tree, inquiry, debate): what decides their answer
    e.type === 'flaw' ? [e.flaws ?? null, e.reason ?? null, (e.reasons || []).length] : null,
    e.type === 'case' ? (e.parts || []).map(p => p && [p.type, p.answer ?? null, (p.options || []).length, p.tolerance ?? null]) : null,
    e.type === 'tree' ? [e.start ?? null, Object.entries(e.nodes || {}).map(([k, n]) => [k, (n?.options || []).map(o => [!!o?.ok, o?.to ?? null])])] : null,
    e.type === 'inquiry' ? e.scores ?? null : null, e.type === 'debate' ? (e.sides || []).map(x => x && [x.best ?? null, (x.counters || []).length]) : null,
    e.type === 'sim' ? [e.activity ?? null, JSON.stringify(e.task ?? null), JSON.stringify(e.grade ?? null), (e.hints || []).length] : null,
    e.tolerance ?? null]);
  /** The languages of a pack beyond their shape: never the pack's own language, a translation has the subject's name in
      its language (a warning), an inline translation keeps the pack's structure and answers (checkTrChapters). */
  function checkI18n(p, chapters, E, W) {
    const s = p.subject || {}, own = s.language || 'en';
    const notOwn = (where, loc) => { if (loc !== own) return true; E.push(`${where}: "${loc}" is the pack's own language`); return false; };
    if (isObj(s.i18n)) for (const loc of Object.keys(s.i18n)) notOwn(`subject.i18n.${loc}`, loc);
    if (!isObj(p.translations)) return;
    const byId = new Map(chapters.map(c => [c.id, c]));
    for (const [loc, t] of Object.entries(p.translations)) {
      const where = `translations.${loc}`; if (!LOCALE_RE.test(loc) || !notOwn(where, loc)) continue;
      if (!(s.i18n && s.i18n[loc])) W.push(`${where}: add subject.i18n.${loc} (title, description) so the picker shows the translated name`);
      if (isObj(t) && t.file !== true && Array.isArray(t.chapters)) checkTrChapters(where, t.chapters.filter(isObj), byId, E);
    }
  }
  /** The chapters of a translation against the pack's: same sections, exercises, cards, playbooks and answers. */
  function checkTrChapters(where, list, byId, E) {
    for (const c of list) {
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
      const code = x => (x.sections || []).flatMap(sc => (sc.blocks || []).filter(b => b && b.t === 'code').map(b => b.code ?? b.text ?? ''));
      const a = code(src), b = code(c);
      if (a.length !== b.length || a.some((x, i) => x !== b[i])) E.push(`${where}/${c.id}: code blocks must stay exactly as the source's (translate the comments around them, not the code)`);
    }
  }
  const lang0 = x => String(x || '').split('-')[0].toLowerCase();
  /** The languages every new pack gets (tools/pack_rules.json "languages"), minus the pack's own: { translations, bridges }. */
  function requiredLocales(own) {
    const o = lang0(own || 'en'), translations = LANGS.translations.filter(l => lang0(l) !== o);
    // 文A: a bridge for every (content language → native) pair: the pack's own language and each translation ('bridgesFrom')
    const from = [o, ...((LANGS.bridgesFrom || []).includes('translations') ? translations.map(lang0) : [])];
    const bridgePairs = from.flatMap(src => LANGS.bridges.filter(n => lang0(n) !== src).map(n => ({ source: src, native: lang0(n) })));
    return { translations, bridges: LANGS.bridges.filter(l => lang0(l) !== o), bridgePairs };
  }
  /** checkTranslation(t, pack) → { errors, warnings, counts }: one noema-translation file (docs/i18n.md §10; its shape:
      noema.translation.v1) against its pack. */
  function checkTranslation(t, pack) {
    const W = [];
    if (!isObj(t)) return { errors: ['not a JSON object'], warnings: W, counts: {} };
    const E = shapeOf('noema.translation.v1', t);
    const chapters = Array.isArray(t.chapters) ? t.chapters.filter(isObj) : [];
    if (pack) {
      const own = pack.subject?.language || 'en';
      if (pack.subject?.id && t.pack && pack.subject.id !== t.pack) E.push(`pack: "${t.pack}" — this translation belongs to another subject (this one is "${pack.subject.id}")`);
      if (t.locale && lang0(t.locale) === lang0(own)) E.push(`locale: "${t.locale}" is the pack's own language`);
      checkTrChapters(`translation ${t.locale}`, chapters, new Map((pack.chapters || []).map(c => [c.id, c])), E);
      const have = new Set(chapters.map(c => c.id)), miss = (pack.chapters || []).filter(c => !have.has(c.id)).map(c => c.id);
      if (miss.length) W.push(`chapters not translated yet: ${miss.join(', ')}`);
      if (t.version && pack.version && t.version !== pack.version) W.push(`made for pack version ${t.version}; the pack is now ${pack.version} — check the chapters that changed`);
    }
    // the subject's name in this language (subject.i18n.<locale>): optional in the file, merged into the pack when it is saved
    if (isObj(t.subject)) {
      const src = pack?.subject || null;
      for (const k of ['hero', 'tutor']) if (isObj(t.subject[k]) && src && isObj(src[k])) for (const f of Object.keys(t.subject[k])) if (!(f in src[k])) E.push(`subject.${k}.${f}: the pack's subject.${k} has no "${f}"`);
    } else if (t.subject == null && pack && !(pack.subject?.i18n?.[t.locale]?.title)) W.push(`no subject name in ${t.locale}: add "subject": {"title", "description", "hero", …} in ${t.locale} so the picker, the subject's home and the Roadmap show it translated`);
    for (const c of chapters) { let j = ''; try { j = JSON.stringify(c); } catch (e) { } if (/<script|javascript:/i.test(j)) E.push(`translation ${t.locale}/${c.id}: no script or javascript: links`); }
    return { errors: E, warnings: W, counts: { chapters: Array.isArray(t.chapters) ? t.chapters.length : 0 } };
  }

  /* ---------- interactive activities (docs/INTERACTIVE.md): the SAME rules as tools/activities.py (tests/activities.js) ---------- */
  const ACT = {
    FORMAT: 'noema.activities/v1', ID_RE: /^[a-z0-9][a-z0-9-]{1,60}$/, KEY_RE: /^[a-z][a-zA-Z0-9_.-]{0,63}$/,
    RUNTIMES: new Set(['html-app@1', 'sim-spec@1', 'py-module@1', 'h5p@1']), LATER: {},
    H5P: 'h5p@1', SHA_RE: /^[0-9a-f]{64}$/, H5P_MAX: 100 * 1024 * 1024,   // h5p@1: the .h5p file travels beside the pack (docs/INTERACTIVE_H5P.md)
    CAPS: new Set(['state', 'events', 'resize', 'result', 'hints', 'announce']), GRADE_MODES: new Set(['reported', 'checks']),
    CHECKS_RUNTIMES: new Set(['sim-spec@1', 'py-module@1']),   // runtimes whose values the app can see (the checks grader needs them)
    SPEC_RUNTIMES: new Set(['sim-spec@1', 'py-module@1']),     // runtimes the app draws from a spec (py-module@1: its outputs come from Python's step())
    // py-module@1 (docs/INTERACTIVE_PYTHON.md): Python with numpy, scipy and the allow-listed extras (tools/pywheels_allow.json) — the same lists in tools/activities.py
    PY: 'py-module@1', PY_BASE: ['numpy', 'scipy'], PY_EXTRAS: ['quantiphy'], PY_MAX: 256 * 1024, PY_STEP: [100, 10000], PY_PACKAGES_MAX: 12,
    PY_BANNED: [
      [/^\s*(?:import\s+js\b|from\s+js\s+import\b|import\s+pyodide_js\b|from\s+pyodide_js\b)/m, 'the browser (js, pyodide_js): Python has no page and no network here; return values from step()'],
      [/\bpyodide\.http\b|\bpyfetch\b|\bopen_url\b|^\s*(?:import|from)\s+(?:urllib|requests|http\.client|socket|ssl)\b/m, 'a network call: a Python activity has no network'],
      [/^\s*(?:import|from)\s+micropip\b/m, 'micropip: list the package in "packages" instead (only the allow-listed ones)'],
      [/(?:^|[^A-Za-z0-9_.])input\s*\(/m, 'input(): there is no console; the learner uses the controls of the spec'],
    ],
    PY_WARN: [
      [/^\s*while\s+True\s*:/m, 'while True: each step() has a budget (stepMs, 3 s by default) and is stopped after it'],
      [/\btime\.sleep\s*\(/, 'time.sleep(): a step blocks the learner while it sleeps; return at once'],
    ],
    // sim-spec@1 (docs/INTERACTIVE.md §12): the SAME rules as tools/activities.py check_spec
    SPEC_FORMAT: 'noema.sim-spec/v1', DEFAULT_ENGINE: 'formula@1', ENGINES: new Set(['formula@1', 'circuit-mna@1', 'thermal@1', 'pid@1', 'rf@1', 'twin@1', 'ode@1', 'prob@1', 'graph@1', 'geom@1', 'genetics@1', 'seq@1', 'med@1', 'clinic@1', 'anatomy@1', 'timeline@1', 'music@1', 'map@1', 'text@1', 'craft@1', 'logic@1', 'rhetoric@1', 'philo@1', 'des@1', 'field@1', 'agents@1', 'law@1']),   // the same list in tools/activities.py
    SPEC_KEYS: new Set(['format', 'engine', 'model', 'title', 'intro', 'consts', 'params', 'derived', 'outputs', 'readouts', 'plots', 'bench']),
    // circuit-mna@1 (docs/INTERACTIVE_CIRCUIT.md): the model, the outputs it can compute, the fault-finding bench (docs/INTERACTIVE.md §12.7)
    CIRCUIT: 'circuit-mna@1', BENCH_ENGINES: new Set(['circuit-mna@1', 'twin@1']), BENCH_NAMES: ['diagnosis', 'measurements', 'correct'],
    // the P6 engines (docs/INTERACTIVE_ENGINES.md): each checks its model with its own checkSpec (the module under src/engines, loaded through NoemaCore.engines; the Python twins in tools/)
    P6: { 'thermal@1': 'thermal/thermal.js', 'pid@1': 'pid/pid.js', 'rf@1': 'rf/rf.ts', 'twin@1': 'twin/twin.js' },
    // the engine library (docs/INTERACTIVE_LIBRARY.md): general engines on one core (src/engines/kernel/core.js); each checks its model with its own checkSpec and
    // lists the expressions (exprs: [src, where, local names]) and string keys (keys: [key, where]) of its model; Python twins tools/lib_<name>.py
    LIB: { 'ode@1': 'ode/ode.js', 'prob@1': 'prob/prob.js', 'graph@1': 'graph/graph.js', 'geom@1': 'geom/geom.js', 'genetics@1': 'genetics/genetics.js', 'seq@1': 'seq/seq.ts', 'med@1': 'med/med.js', 'clinic@1': 'clinic/clinic.js', 'anatomy@1': 'anatomy/anatomy.js', 'timeline@1': 'timeline/timeline.js', 'music@1': 'music/music.js', 'map@1': 'map/map.js', 'text@1': 'text/text.js', 'craft@1': 'craft/craft.js', 'logic@1': 'logic/logic.js', 'rhetoric@1': 'rhetoric/rhetoric.ts', 'philo@1': 'philo/philo.js', 'des@1': 'des/des.js', 'field@1': 'field/field.js', 'agents@1': 'agents/agents.js', 'law@1': 'law/law.js' },
    LIB_KINDS: ['scalar', 'series', 'scene', 'sound'], LINE_STYLES: ['line', 'bars', 'steps', 'points'],
    APP_ENGINES_MAX: 8,   // html-app@1: the engines of the library a mini-app may use ("engines": [...], docs/INTERACTIVE.md §8.1) — the same rule in tools/activities.py
    P6_TIMED: ['thermal@1', 'pid@1'],   // engines whose model.transient times and outputs' at may be expressions
    // twin@1's bench: the probe points of the device and its instruments (the event log and the radio's RSSI besides V, I, scope)
    TWIN: 'twin@1', TWIN_POINTS: ['vbat', 'vload', 'i', 'gnd'], TWIN_INSTRUMENTS: ['V', 'I', 'scope', 'log', 'rssi', 'T', 'clock'], WHOLE: ['log', 'rssi', 'T', 'clock'],
    MODEL_KEYS: ['netlist', 'bindings', 'transient', 'noise', 'ac'], OUT_KEYS: ['id', 'kind', 'node', 'branch', 'time', 'probe', 'at', 'stat', 'power', 'ac', 'ref'], STATS: ['final', 'min', 'max', 'mean', 'pp', 'rms'],
    // the AC analysis (docs/INTERACTIVE_CIRCUIT.md §9.6) and the meters' modes (§9.5)
    AC_CURVES: ['f', 'db', 'phase', 'mag'], AC_POINT: ['db', 'phase', 'mag'], AC_STATS: ['dcDb', 'peakDb', 'fPeak', 'f3db', 'fLow3db', 'fUnity', 'pm'], MODES: ['dc', 'ac', 'rms', 'avg'],
    WAVES: { pulse: ['v1', 'v2', 'delay', 'rise', 'fall', 'width', 'period'], sine: ['offset', 'amp', 'freq', 'phase', 'delay'], pwm: ['v', 'freq', 'duty', 'low', 'delay'] },
    BENCH_KEYS: ['faults', 'points', 'instruments', 'diagnosis', 'budget'], INSTRUMENTS: ['V', 'I', 'R', 'scope', 'logic', 'bode'],
    INST_KEYS: ['kind', 'points', 'parts', 'tEnd', 'dt', 'tStart', 'threshold', 'modes', 'zin', 'leads', 'source', 'fStart', 'fStop', 'fPoints'], BENCH_ID_RE: /^[A-Za-z][A-Za-z0-9_-]{0,31}$/,
    BENCH_LIM: { faults: 16, apply: 4, points: 24, instruments: 7, parts: 24, options: 12, budget: 100, bindings: 24, steps: 200000, leads: 4, acPoints: 1000 },
    SPEC_LIM: { params: 24, consts: 24, derived: 48, outputs: 24, readouts: 24, plots: 6, series: 6, marks: 8, points: 2000, options: 12, checks: 16, bytes: 64 * 1024, unit: 16, digits: 8 },
    NAME_RE: /^[A-Za-z_][A-Za-z0-9_]{0,31}$/, PARAM_KINDS: ['slider', 'number', 'toggle', 'choice'], NUM_FORMATS: ['auto', 'si', 'fixed'],
    HTML_MAX: 512 * 1024, HTML_WARN: 256 * 1024, FALLBACK_MIN: 40, HINTS_MAX: 6,
    BANNED: [
      [/<script[^>]*\bsrc\s*=/i, 'an external script (<script src>): put every script inline'],
      [/(?:\b(?:src|href|action|poster|data)\s*=\s*["']?\s*(?:https?:)?\/\/)/i, 'a link to the network (src/href to http(s):// or //): put everything inline (data: URIs)'],
      [/url\(\s*["']?\s*(?:https?:)?\/\//i, 'a CSS url() to the network: use data: URIs'],
      [/@import\b/i, 'a CSS @import: put every style inline'],
      [/<[a-z][^>]*\son[a-z]+\s*=/i, 'an inline event handler (onclick=…): use addEventListener in a script'],
      [/javascript:/i, 'a javascript: URL'],
      [/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/i, 'a network call (fetch, XHR, WebSocket, EventSource, sendBeacon): an activity has no network'],
      [/\bimportScripts\b|\bnew\s+(?:Shared)?Worker\b/i, 'a worker: an html-app has none (numerical work goes to a later runtime)'],
      [/\beval\s*\(|\bnew\s+Function\b|\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/i, 'code made from text (eval, new Function, setTimeout("…"))'],
      [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b/i, 'browser storage: save with noema.saveState(…)'],
      [/\bwindow\.open\b|\bwindow\.top\b|\btop\.location\b|\bparent\.|\bopener\b/i, 'a popup or the page around the frame: an activity stays in its frame'],
      [/\bpostMessage\s*\(/i, 'raw postMessage: talk to the app through window.noema'],
      [/allow-same-origin/i, 'allow-same-origin: never'],
      [/<meta[^>]+http-equiv/i, 'a <meta http-equiv>: the app sets the policy'],
      [/<base\b/i, 'a <base> element'],
      [/<(?:iframe|frame|object|embed|form)\b/i, 'a frame, object, embed or form: not available in an activity'],
    ],
    WARN: [
      [/while\s*\(\s*(?:true|1|!0)\s*\)/i, 'while (true): every loop is stopped after 1.5 s without a pause; use requestAnimationFrame or setTimeout for a loop that never ends'],
      [/setInterval\s*\([^,]+,\s*0\s*\)/i, 'setInterval(…, 0): use requestAnimationFrame'],
      [/new\s+Array\s*\(\s*\d{7,}/i, 'a huge array'],
    ],
  };
  // P6 (docs/adr/001 D12): a precompiled WebAssembly module (its own spec, or the model of a sim-spec@1 spec) and an allow-listed outside page
  Object.assign(ACT, { WASM: 'wasm-module@1', WASM_ENGINE: 'wasm@1', EMBED: 'external-embed@1' });
  ACT.RUNTIMES.add(ACT.WASM); ACT.RUNTIMES.add(ACT.EMBED);
  ACT.CHECKS_RUNTIMES.add(ACT.WASM);   // a module with its own spec shows its values like sim-spec@1
  ACT.ENGINES.add(ACT.WASM_ENGINE);
  const WK = () => root.NoemaWasm || null;    // engine/src/44_activity_wasm.js, loaded beside this file (checkItem, checkModel: the twins of tools/wasm_check.py)
  const EK = () => root.NoemaEmbed || null;   // engine/src/45_activity_embed.js, loaded beside this file (check, PROVIDERS: the twins of tools/embed_check.py)
  const specObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  /** the spec a wasm-module@1 item shows: its own spec, run by wasm@1 on the item itself (as the runtime completes it) */
  function ownSpec(a) {
    const s = a && a.spec; if (!specObj(s)) return s;
    return { ...s, engine: ACT.WASM_ENGINE, model: { ...(specObj(s.model) ? s.model : {}), module: a.id } };
  }
  /** the spec an activity shows (sim-spec@1: its spec; wasm-module@1: its own spec, completed) or null */
  const specOf = a => !a ? null : ACT.SPEC_RUNTIMES.has(a.runtime) ? (specObj(a.spec) ? a.spec : null) : a.runtime === ACT.WASM ? (specObj(a.spec) ? ownSpec(a) : null) : null;
  /** a wasm-module@1 item without its own spec: a module for a sim-spec@1 spec, nothing a block or an exercise can show */
  const showsNothing = a => !!a && a.runtime === ACT.WASM && !specObj(a.spec);
  const SHOWS_NOTHING = `is a ${ACT.WASM} module without its own spec: show it through a sim-spec@1 spec (engine ${ACT.WASM_ENGINE}, model.module) or give it a spec`;
  const utf8 = t => typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(t).length : unescape(encodeURIComponent(t)).length;
  function visibleText(html) {
    let body = html.includes('<body') ? html.split('<body').slice(1).join('<body') : html;
    body = body.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
    return body.match(/[\p{L}]{2,}/gu) || [];
  }
  function lintHtml(html) {
    const E = [], W = [];
    if (typeof html !== 'string' || !html.trim()) return { errors: ['the bundle is empty'], warnings: W };
    const n = utf8(html);
    if (n > ACT.HTML_MAX) E.push(`the bundle is ${Math.floor(n / 1024)} KB (at most ${ACT.HTML_MAX / 1024} KB)`);
    else if (n > ACT.HTML_WARN) W.push(`the bundle is ${Math.floor(n / 1024)} KB (aim for <= ${ACT.HTML_WARN / 1024} KB)`);
    for (const [re, why] of ACT.BANNED) { const m = html.match(re); if (m) E.push(`${why} — found “${m[0].slice(0, 40)}”`); }
    for (const [re, why] of ACT.WARN) if (re.test(html)) W.push(why);
    const words = visibleText(html);
    if (words.length >= 3) W.push(`visible text in the HTML (“${words.slice(0, 6).join(' ')}…”): put every word in the string tables and show it with noema.t(key)`);
    return { errors: E, warnings: W };
  }
  /** lintPython(source, packages) → { errors, warnings }: what a py-module@1 activity may not contain (the same list as tools/activities.py lint_python) */
  function lintPython(src, packages) {
    const E = [], W = [];
    if (typeof src !== 'string' || !src.trim()) return { errors: ['the Python file is empty'], warnings: W };
    const n = utf8(src);
    if (n > ACT.PY_MAX) E.push(`the Python file is ${Math.floor(n / 1024)} KB (at most ${ACT.PY_MAX / 1024} KB)`);
    if (!/^def\s+step\s*\(/m.test(src)) E.push('the Python file defines no step(inputs, state) at the top level');
    for (const [re, why] of ACT.PY_BANNED) { const m = src.match(re); if (m) E.push(`${why} — found “${m[0].trim().slice(0, 40)}”`); }
    for (const [re, why] of ACT.PY_WARN) if (re.test(src)) W.push(why);
    const decl = new Set(Array.isArray(packages) ? packages : []);
    for (const name of [...ACT.PY_BASE, ...ACT.PY_EXTRAS]) if (!decl.has(name) && new RegExp('^\\s*(?:import|from)\\s+' + name + '\\b', 'm').test(src)) E.push(`the Python file imports ${name}: list it in "packages"`);
    return { errors: E, warnings: W };
  }
  /* ---------- sim-spec@1 (docs/INTERACTIVE.md §12): every expression through the expression language (NoemaCore.engines.expr, src/engines/kernel/simexpr.js) ---------- */
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && isFinite(v);
  const list = v => Array.isArray(v) ? v : [];
  /** the engine library (src/engines, NoemaCore.engines): the expression language always; an engine's module only once it is loaded —
      a caller loads the engines a pack names (enginesNamed) before it checks the pack */
  const LIBR = () => root.NoemaCore?.engines || null;
  const NX = () => LIBR()?.expr || null;
  const MOD = id => LIBR()?.loaded(id) || null;
  /** null, or the first problem of an expression (names null = not checked) */
  function exprProblem(src, names, where) {
    if (typeof src !== 'string' || !src.trim()) return `${where}: an expression (a text such as “2*x + 1”) is required`;
    if (!NX()) return `${where}: the expression checker (NoemaCore.engines.expr) is not loaded here`;
    const p = NX().check(src, names ? { vars: names } : {});
    return p.length ? `${where}: ${p[0].msg} in “${src.slice(0, 60)}”` : null;
  }
  const badName = n => !(typeof n === 'string' && ACT.NAME_RE.test(n)) || n === 'pi' || n === 'e' || n === 'true' || n === 'false' || !NX() || NX().check(n).length > 0;
  /** the scalar names an expression of the spec may use: consts, params, derived, the engine's scalar outputs */
  function specNames(spec) {
    if (!isObj(spec)) return [];
    const out = isObj(spec.consts) ? Object.keys(spec.consts) : [];
    for (const k of ['params', 'derived']) for (const x of list(spec[k])) if (isObj(x) && typeof x.id === 'string') out.push(x.id);
    for (const x of list(spec.outputs)) if (isObj(x) && typeof x.id === 'string' && x.kind === 'scalar') out.push(x.id);
    for (const p of list(spec.parts)) for (const x of isObj(p) ? list(p.outputs) : []) if (isObj(x) && typeof x.id === 'string' && x.kind === 'scalar') out.push(x.id);   // parts (§12.8; a part from activities/_parts names its outputs there)
    if (isObj(spec.bench)) out.push(...ACT.BENCH_NAMES);   // a bench's values: for the checks of a sim exercise only (never shown)
    return out;
  }
  /* ---------- circuit-mna@1: the model, the outputs, the bench — the SAME rules as tools/activities.py check_circuit / check_bench ---------- */
  const CK = () => MOD(ACT.CIRCUIT);   // src/engines/circuit (its check and checkFaults), once loaded
  const isGnd = s => s === 'gnd' || s === '0';
  /** → {nl, els: Map id → element, nodes: Set of node and test-point names} of a spec's netlist without errors, or null */
  function circuitOf(spec) {
    const nl = isObj(spec?.model) ? spec.model.netlist : null;
    if (!CK() || !isObj(nl) || CK().check(nl).some(p => p.level === 'error')) return null;
    return { nl, els: new Map(nl.elements.map(e => [e.id, e])), nodes: new Set(nl.nodes.map(x => typeof x === 'string' ? x : x.name)) };
  }
  /** a measuring point: a node, a test-point label, gnd, or a pin "@R1.0" */
  function endpointOk(c, x) {
    if (typeof x !== 'string') return false;
    if (x[0] === '@') { const m = /^@(.*)\.(\d+)$/.exec(x), e = m ? c.els.get(m[1]) : null; return !!e && +m[2] < e.n.length; }
    return c.nodes.has(x) || isGnd(x);
  }
  function probeOk(c, p) {
    if (!isObj(p)) return false;
    const meter = p.kind === 'V' || p.kind === 'I';   // a meter's mode, input resistance (V) and averaging window (§9.5)
    if (p.mode !== undefined && !(meter && ACT.MODES.includes(p.mode))) return false;
    if (p.zin !== undefined && !(p.kind === 'V' && isNum(p.zin) && p.zin >= 0)) return false;
    for (const k of ['tEnd', 'dt', 'tStart']) if (p[k] !== undefined && !(meter && isNum(p[k]) && (k === 'tStart' ? p[k] >= 0 : p[k] > 0))) return false;
    if ((p.dt !== undefined || p.tStart !== undefined) && (p.tEnd === undefined || (p.tStart !== undefined && !(p.tStart < p.tEnd)))) return false;   // a window: tEnd, and tStart below it
    if (p.kind === 'V' || p.kind === 'R') return endpointOk(c, p.a) && (p.b === undefined || endpointOk(c, p.b));
    if (p.kind === 'I') { const e = typeof p.element === 'string' ? c.els.get(p.element) : null; return !!e && (p.pin === undefined || (Number.isInteger(p.pin) && p.pin >= 0 && p.pin < e.n.length)); }
    return false;
  }
  /** a source the AC analysis can excite: a V or I part */
  const acSourceOk = (c, id) => typeof id === 'string' && c.els.has(id) && ['V', 'I'].includes(c.els.get(id).type);
  /** a number (> 0 when pos) or an expression of names → the number, or null (an expression, or a problem pushed to E) */
  function numOrExpr(v, names, where, E, pos) {
    if (typeof v === 'string') { const m = exprProblem(v, names, where); if (m) E.push(m); return null; }
    if (!(isNum(v) && (!pos || v > 0))) { E.push(`${where} must be a number${pos ? ' > 0' : ''} or an expression`); return null; }
    return v;
  }
  const stepsOver = (tEnd, dt) => isNum(tEnd) && isNum(dt) && Math.ceil(tEnd / dt - 1e-9) > ACT.BENCH_LIM.steps;
  const unknownKeys = (o, allowed, w, E) => { for (const k of Object.keys(o).filter(k => !allowed.includes(k)).sort()) E.push(`${w}: unknown field ${qv(k)}`); };
  function checkCircuit(spec, names, E) {
    const m = spec.model, L = ACT.BENCH_LIM;
    if (!isObj(m)) { E.push(`spec.model: ${ACT.CIRCUIT} needs a model {netlist, bindings?, transient?, noise?}`); return; }
    unknownKeys(m, ACT.MODEL_KEYS, 'spec.model', E);
    if (!CK()) { E.push(`spec.model: the ${ACT.CIRCUIT} checker (src/engines/circuit/sim.js) is not loaded here`); return; }
    if (!isObj(m.netlist)) { E.push('spec.model.netlist must be a netlist {format: "noema.circuit/v1", nodes, elements}'); return; }
    const probs = CK().check(m.netlist).filter(p => p.level === 'error');
    for (const p of probs) E.push(`spec.model.netlist${p.path ? '.' + p.path : ''}: ${p.msg}`);
    if (probs.length) return;
    const c = circuitOf(spec), bs = m.bindings;
    if (bs != null && !(Array.isArray(bs) && bs.length <= L.bindings)) E.push(`spec.model.bindings must be a list of at most ${L.bindings} {element, prop?, expr}`);
    list(bs).slice(0, L.bindings).forEach((b, i) => {
      const w = `spec.model.bindings[${i}]`;
      if (!isObj(b)) { E.push(`${w} must be an object {element, prop?, expr}`); return; }
      unknownKeys(b, ['element', 'prop', 'expr'], w, E);
      const e = typeof b.element === 'string' ? c.els.get(b.element) : null;
      if (!e) E.push(`${w}.element is not a part of the netlist`);
      else {
        const prop = b.prop === undefined ? 'value' : b.prop, wave = isObj(e.value) ? Object.keys(e.value)[0] : null;
        const okp = typeof prop === 'string' && (['R', 'C', 'L'].includes(e.type) ? prop === 'value'
          : e.type === 'SW' ? prop === 'on'
            : ['V', 'I'].includes(e.type) ? (prop === 'value' ? (wave === null || wave === 'dc') : (Object.prototype.hasOwnProperty.call(ACT.WAVES, wave) && ACT.WAVES[wave].some(f => wave + '.' + f === prop))) : false);
        if (!okp) E.push(`${w}.prop cannot be set on this part (value of R, C, L and a DC source; on of a switch; pulse.v2, sine.freq, pwm.duty … of a source with that waveform)`);
      }
      const mm = exprProblem(b.expr, names, w + '.expr'); if (mm) E.push(mm);
    });
    const tr = m.transient;
    if (tr != null) {
      if (!isObj(tr)) E.push('spec.model.transient must be an object {tEnd, dt?}');
      else {
        unknownKeys(tr, ['tEnd', 'dt'], 'spec.model.transient', E);
        let te = null; if (tr.tEnd === undefined) E.push('spec.model.transient.tEnd is required'); else te = numOrExpr(tr.tEnd, names, 'spec.model.transient.tEnd', E, true);
        const dt = tr.dt === undefined ? null : numOrExpr(tr.dt, names, 'spec.model.transient.dt', E, true);
        if (stepsOver(te, dt)) E.push(`spec.model.transient: tEnd / dt is more than ${L.steps} steps`);
      }
    }
    const nz = m.noise;
    if (nz != null && !(isObj(nz) && Object.keys(nz).every(k => k === 'rel' || k === 'abs') && ['rel', 'abs'].every(k => nz[k] === undefined || (isNum(nz[k]) && nz[k] >= 0 && nz[k] <= 1)))) E.push("spec.model.noise is {rel?, abs?}: numbers from 0 to 1 (the meter's relative and absolute error)");
    const ac = m.ac;
    if (ac != null) {
      if (!isObj(ac)) E.push('spec.model.ac must be an object {source, fStart, fStop, points?}');
      else {
        unknownKeys(ac, ['source', 'fStart', 'fStop', 'points'], 'spec.model.ac', E);
        if (!acSourceOk(c, ac.source)) E.push('spec.model.ac.source must be a V or I part of the netlist (the source the analysis excites)');
        for (const k of ['fStart', 'fStop']) { if (ac[k] === undefined) E.push(`spec.model.ac.${k} is required (Hz)`); else numOrExpr(ac[k], names, 'spec.model.ac.' + k, E, true); }
        if (isNum(ac.fStart) && isNum(ac.fStop) && !(ac.fStop > ac.fStart)) E.push('spec.model.ac: fStop must be above fStart');
        if (ac.points !== undefined && !(Number.isInteger(ac.points) && ac.points >= 2 && ac.points <= L.acPoints)) E.push(`spec.model.ac.points is a whole number 2–${L.acPoints}`);
      }
    }
    list(spec.outputs).forEach((o, i) => {
      const w = `spec.outputs[${i}]`;
      if (!(isObj(o) && (o.kind === 'scalar' || o.kind === 'series'))) return;   // (reported with the outputs)
      unknownKeys(o, ACT.OUT_KEYS, w, E);
      if ('ac' in o) {   // a point or a curve of the AC analysis
        if (['branch', 'time', 'probe', 'power', 'stat'].some(k => k in o)) E.push(`${w}: an ac output reads only ac, node, ref and (a gain or phase at one frequency) at`);
        const curve = o.kind === 'series', okv = curve ? ACT.AC_CURVES.includes(o.ac) : ACT.AC_POINT.includes(o.ac) || ACT.AC_STATS.includes(o.ac);
        if (!okv) E.push(`${w}.ac is one of ${(curve ? ACT.AC_CURVES : ACT.AC_POINT.concat(ACT.AC_STATS)).join(', ')} on a ${o.kind} output`);
        const nodeOk = x => typeof x === 'string' && (c.nodes.has(x) || isGnd(x));
        if (o.ac !== 'f' && !nodeOk(o.node)) E.push(`${w}.node is not a node of the netlist (where the response is read)`);
        if (o.ac === 'f' && 'node' in o) E.push(`${w}: the frequency axis (ac: f) reads no node`);
        if ('ref' in o && !nodeOk(o.ref)) E.push(`${w}.ref is not a node of the netlist`);
        if (!curve && ACT.AC_POINT.includes(o.ac)) { if (!('at' in o)) E.push(`${w}.at is required: the frequency (Hz) of this ${o.ac}`); else numOrExpr(o.at, names, w + '.at', E, true); }
        else if ('at' in o) E.push(`${w}: at belongs to a gain or phase at one frequency (ac: db, phase, mag on a scalar)`);
        if (!isObj(m.ac)) E.push(`${w} needs model.ac {source, fStart, fStop, points?}`);
        return;
      }
      if ('ref' in o) E.push(`${w}: ref belongs to an ac output`);
      const src = ['node', 'branch', 'time', 'probe', 'power'].filter(k => k in o);
      if (src.length !== 1) { E.push(`${w} must name what it reads: one of node, branch, time, probe, power, ac`); return; }
      const s = src[0];
      if (s === 'time' && !(o.time === true && o.kind === 'series')) E.push(`${w}.time is true on a series output (the time axis of the transient)`);
      if (s === 'node' && !(typeof o.node === 'string' && (c.nodes.has(o.node) || isGnd(o.node)))) E.push(`${w}.node is not a node of the netlist`);
      if (s === 'branch' && !(typeof o.branch === 'string' && c.els.has(o.branch))) E.push(`${w}.branch is not a part of the netlist`);
      if (s === 'power' && !(typeof o.power === 'string' && c.els.has(o.power))) E.push(`${w}.power is not a part of the netlist (the part whose power is read)`);
      if (s === 'probe' && !(o.kind === 'scalar' && probeOk(c, o.probe))) E.push(`${w}.probe must be a reading {kind: V | I | R, a, b? | element, pin?, mode?, zin?, tEnd?, dt?, tStart?} on a scalar output`);
      const at = 'at' in o, st = 'stat' in o;
      if ((at || st) && !(o.kind === 'scalar' && (s === 'node' || s === 'branch' || s === 'power'))) E.push(`${w}: at and stat belong to a scalar output of a node, a branch or a power`);
      if (s === 'power' && o.kind === 'scalar' && !at && !st) E.push(`${w}: a power is read over the transient: give at or stat`);
      if (at && st) E.push(`${w}: at or stat, not both`);
      if (at) numOrExpr(o.at, names, w + '.at', E, false);
      if (st && !ACT.STATS.includes(o.stat)) E.push(`${w}.stat is one of ${ACT.STATS.join(', ')}`);
      if ((o.kind === 'series' || at || st) && !isObj(m.transient)) E.push(`${w} needs model.transient {tEnd, dt?}`);
    });
  }
  /* ---------- the P6 engines thermal@1, pid@1, rf@1, twin@1 (docs/INTERACTIVE_ENGINES.md): the engine's own checkSpec, then every expression of
     its model through NoemaExpr — the SAME rules as tools/activities.py check_engine (the engines' Python twins: tools/thermal.py, pid.py, rf.py, twin.py) ---------- */
  /** [source, where] of each expression of a P6 model: the bindings; for thermal@1 and pid@1 also the transient's times and the outputs' at */
  function engineExprs(spec, eng) {
    const m = isObj(spec.model) ? spec.model : {}, out = [], timed = ACT.P6_TIMED.includes(eng);
    const add = (v, w) => { if (typeof v === 'string' && v.trim()) out.push([v, w]); };   // (an empty one is the engine's own message)
    list(m.bindings).forEach((b, i) => { if (isObj(b)) add(b.expr, `spec.model.bindings[${i}].expr`); });
    if (timed && isObj(m.transient)) for (const k of ['tEnd', 'dt']) add(m.transient[k], `spec.model.transient.${k}`);
    if (timed) list(spec.outputs).forEach((o, i) => { if (isObj(o)) add(o.at, `spec.outputs[${i}].at`); });
    return out;
  }
  function checkEngine(spec, eng, names, E) {
    const M = MOD(eng);
    if (!M) { E.push(`spec.model: the ${eng} checker (src/engines/${ACT.P6[eng]}) is not loaded here`); return; }
    for (const p of M.checkSpec(spec)) if (p.level === 'error') E.push(`spec${p.path ? '.' + p.path : ''}: ${p.msg}`);
    for (const [src, w] of engineExprs(spec, eng)) { const m = exprProblem(src, names, w); if (m) E.push(m); }
  }
  /* ---------- the engine library (docs/INTERACTIVE_LIBRARY.md): the engine's own checkSpec, then every expression of its model over the spec's names
     plus the model's own local names (the variables of an ODE, the time t …), then every string key it names — the SAME rules as
     tools/activities.py check_lib (the engines' Python twins: tools/lib_<name>.py) ---------- */
  function checkLib(spec, eng, names, E, key) {
    const M = MOD(eng);
    if (!M) { E.push(`spec.model: the ${eng} checker (src/engines/${ACT.LIB[eng]}) is not loaded here`); return; }
    const P = M.checkSpec(spec);
    for (const p of P) if (p.level === 'error') E.push(`spec${p.path ? '.' + p.path : ''}: ${p.msg}`);
    if (P.some(p => p.level === 'error')) return;   // the expressions and keys of a model that does not stand are not listed
    for (const [src, w, local] of M.exprs(spec)) { const m = exprProblem(src, names.concat(local || []), 'spec.' + w); if (m) E.push(m); }
    for (const [k, w] of M.keys(spec)) key(k, 'spec.' + w, true);
  }
  /** twin@1: the device of a spec without errors, or null */
  function twinOf(spec) {
    const d = isObj(spec?.model) ? spec.model.device : null, T = MOD(ACT.TWIN);
    return T && isObj(d) && !T.check(d).some(p => p.level === 'error') ? d : null;
  }
  function checkBench(spec, names, seen, E, key, eng) {
    const b = spec.bench, L = ACT.BENCH_LIM, tw = eng === ACT.TWIN, c = tw ? null : circuitOf(spec), dev = tw ? twinOf(spec) : null;
    const KINDS = tw ? ACT.TWIN_INSTRUMENTS : ACT.INSTRUMENTS;
    if (!isObj(b)) { E.push('spec.bench must be an object {faults, points, instruments, diagnosis, budget?}'); return; }
    unknownKeys(b, ACT.BENCH_KEYS, 'spec.bench', E);
    for (const n of ACT.BENCH_NAMES) if (seen.has(n)) E.push(`spec: the name ${n} belongs to the bench (its values: ${ACT.BENCH_NAMES.join(', ')})`);
    const ids = (arr, w, what) => {
      const out = [];
      list(arr).forEach((x, i) => {
        if (!isObj(x)) return;
        if (!(typeof x.id === 'string' && ACT.BENCH_ID_RE.test(x.id))) E.push(`${w}[${i}].id must be a name (a letter, then letters, digits, _ or -; at most 32)`);
        else if (out.includes(x.id)) E.push(`${w}[${i}].id: the ${what} ${x.id} is listed twice`);
        else out.push(x.id);
      });
      return out;
    };
    const fs = b.faults;
    if (!(Array.isArray(fs) && fs.length >= 1 && fs.length <= L.faults)) E.push(`spec.bench.faults must be a list of 1–${L.faults} faults {id, apply}`);
    const fids = ids(fs, 'spec.bench.faults', 'fault');
    list(fs).forEach((f, i) => {
      const w = `spec.bench.faults[${i}]`;
      if (!isObj(f)) { E.push(`${w} must be an object {id, apply}`); return; }
      unknownKeys(f, ['id', 'apply'], w, E);
      if (!(Array.isArray(f.apply) && f.apply.length <= L.apply)) { E.push(`${w}.apply must be a list of at most ${L.apply} changes to the ${tw ? 'device' : 'circuit'} ([] = a healthy device)`); return; }
      if (c) for (const p of CK().checkFaults(c.nl, f.apply)) E.push(`${w}.${p.path.replace(/^faults/, 'apply')}: ${p.msg}`);
      if (dev) for (const p of MOD(ACT.TWIN).checkFaults(dev, f.apply)) E.push(`${w}.${p.path.replace(/^faults/, 'apply')}: ${p.msg}`);
    });
    const ps = b.points;
    if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.points)) E.push(`spec.bench.points must be a list of 1–${L.points} probe points {id, at, label}`);
    const pids = ids(ps, 'spec.bench.points', 'point'), atOf = new Map();
    list(ps).forEach((p, i) => {
      const w = `spec.bench.points[${i}]`;
      if (!isObj(p)) { E.push(`${w} must be an object {id, at, label}`); return; }
      unknownKeys(p, ['id', 'at', 'label'], w, E);
      if (typeof p.id === 'string' && !atOf.has(p.id)) atOf.set(p.id, p.at);
      if (c && !endpointOk(c, p.at)) E.push(`${w}.at must be a node, a test point, gnd or a pin such as @R1.0 of the netlist`);
      if (tw && !ACT.TWIN_POINTS.includes(p.at)) E.push(`${w}.at is one of ${ACT.TWIN_POINTS.join(', ')} (the battery, the battery under load, the supply current, the ground)`);
      key(p.label, w + '.label', true);
    });
    const is = b.instruments, kinds = [];
    if (!(Array.isArray(is) && is.length >= 1 && is.length <= L.instruments)) E.push(`spec.bench.instruments must be a list of 1–${L.instruments} instruments {kind, …}`);
    list(is).forEach((x, i) => {
      const w = `spec.bench.instruments[${i}]`;
      if (!(isObj(x) && KINDS.includes(x.kind))) { E.push(`${w}.kind is one of ${KINDS.join(', ')}`); return; }
      if (kinds.includes(x.kind)) E.push(`${w}: the instrument ${x.kind} is listed twice`);
      kinds.push(x.kind);
      unknownKeys(x, ACT.INST_KEYS, w, E);
      if (ACT.WHOLE.includes(x.kind)) {   // twin@1: the event log, the radio's RSSI, the thermometer and the clock check read the device, not a point
        if (Object.keys(x).some(k => k !== 'kind' && ACT.INST_KEYS.includes(k))) E.push(`${w}: the ${{ log: 'event log', rssi: 'RSSI reading', T: 'thermometer', clock: 'clock check' }[x.kind]} has only a kind`);
        return;
      }
      const scope = x.kind === 'scope' || x.kind === 'logic', meter = !tw && (x.kind === 'V' || x.kind === 'I');
      if (x.kind === 'I') {
        if ('points' in x) E.push(`${w}: the ammeter reads parts (parts), not points`);
        const pa = x.parts;
        if (!(Array.isArray(pa) && pa.length >= 1 && pa.length <= L.parts)) E.push(`${w}.parts must be a list of 1–${L.parts} parts {element, label, pin?}`);
        else pa.forEach((q, j) => {
          const wq = `${w}.parts[${j}]`;
          if (!isObj(q)) { E.push(`${wq} must be an object {element, label, pin?}`); return; }
          unknownKeys(q, ['element', 'label', 'pin'], wq, E);
          if (c && !probeOk(c, { kind: 'I', element: q.element, pin: q.pin })) E.push(`${wq}: element must be a part of the netlist (and pin one of its pins)`);
          if (tw && !(q.element === 'battery' && q.pin === undefined)) E.push(`${wq}: element must be battery (the twin's ammeter reads the supply current), without pin`);
          key(q.label, wq + '.label', true);
        });
      } else {
        if ('parts' in x) E.push(`${w}: only the ammeter (I) reads parts`);
        const pts = x.points;
        if (pts !== undefined && !(Array.isArray(pts) && pts.length >= 1 && pts.every(q => typeof q === 'string' && pids.includes(q)))) E.push(`${w}.points must be ids of spec.bench.points`);
        if ((x.kind === 'V' || x.kind === 'R') && (Array.isArray(pts) ? pts.length : pids.length) < 2) E.push(`${w}: a meter needs two points to put its leads on`);
        if (tw) {
          const on = (Array.isArray(pts) ? pts : pids).filter(q => typeof q === 'string' && pids.includes(q)).map(q => atOf.get(q));
          if (x.kind === 'V' && on.some(a => a === 'i')) E.push(`${w}: the twin's voltmeter reads vbat or vload against gnd (list its points: not the current i)`);
          if (x.kind === 'scope' && on.some(a => a !== 'i')) E.push(`${w}: the twin's oscilloscope shows the supply current (list its points: only points at i)`);
        }
      }
      for (const k of ['tEnd', 'dt', 'tStart', 'threshold']) if (k in x && !((scope || meter) && (k !== 'threshold' || x.kind === 'logic'))) E.push(`${w}.${k} belongs to ${k === 'threshold' ? 'the logic analyser' : 'the oscilloscope, the logic analyser and (its averaging window) the multimeter'}`);
      // the circuit's instruments (§9.5): the meter's modes, an input resistance, the scope probe's ground leads, the frequency response analyser
      if ('modes' in x && !(meter && Array.isArray(x.modes) && x.modes.length >= 1 && x.modes.every((q, j) => ACT.MODES.includes(q) && x.modes.indexOf(q) === j))) E.push(`${w}.modes belongs to the multimeter (V, I): a list of ${ACT.MODES.join(', ')}, each once`);
      if ('zin' in x && !(!tw && ['V', 'scope', 'logic'].includes(x.kind) && isNum(x.zin) && x.zin >= 0)) E.push(`${w}.zin belongs to the voltmeter, the oscilloscope and the logic analyser: their input resistance in Ω (0 = ideal)`);
      if ('leads' in x) {
        if (!(!tw && x.kind === 'scope' && Array.isArray(x.leads) && x.leads.length >= 1 && x.leads.length <= L.leads)) E.push(`${w}.leads belongs to the oscilloscope: a list of 1–${L.leads} ground leads {label, lead, cin?}`);
        else x.leads.forEach((q, j) => {
          const wq = `${w}.leads[${j}]`;
          if (!isObj(q)) { E.push(`${wq} must be an object {label, lead, cin?}`); return; }
          unknownKeys(q, ['label', 'lead', 'cin'], wq, E);
          if (!(isNum(q.lead) && q.lead >= 0)) E.push(`${wq}.lead is the ground lead's inductance in H (0 = none; about 1 nH per mm of wire)`);
          if (q.cin !== undefined && !(isNum(q.cin) && q.cin >= 0)) E.push(`${wq}.cin is the probe's capacitance in F`);
          key(q.label, wq + '.label', true);
        });
      }
      const bode = x.kind === 'bode';
      for (const k of ['source', 'fStart', 'fStop', 'fPoints']) if (k in x && !bode) E.push(`${w}.${k} belongs to the frequency response analyser (bode)`);
      if (bode) {
        if (c && !acSourceOk(c, x.source)) E.push(`${w}.source must be a V or I part of the netlist (the source the analyser sweeps)`);
        for (const k of ['fStart', 'fStop']) { if (x[k] === undefined) E.push(`${w}.${k} is required (Hz)`); else numOrExpr(x[k], names, `${w}.${k}`, E, true); }
        if (x.fPoints !== undefined && !(Number.isInteger(x.fPoints) && x.fPoints >= 2 && x.fPoints <= L.acPoints)) E.push(`${w}.fPoints is a whole number 2–${L.acPoints}`);
      }
      if (meter) {
        const te = x.tEnd === undefined ? null : numOrExpr(x.tEnd, names, w + '.tEnd', E, true), dt = x.dt === undefined ? null : numOrExpr(x.dt, names, w + '.dt', E, true);
        if ('tStart' in x) numOrExpr(x.tStart, names, w + '.tStart', E, false);
        if (('dt' in x || 'tStart' in x) && !('tEnd' in x)) E.push(`${w}: the multimeter's averaging window needs tEnd`);
        if (isNum(x.tStart) && isNum(te) && !(x.tStart < te)) E.push(`${w}: the multimeter's averaging window needs tStart below tEnd`);
        if (stepsOver(te, dt)) E.push(`${w}: tEnd / dt is more than ${L.steps} steps`);
      }
      if (scope) {
        let te = null; if (x.tEnd === undefined) E.push(`${w}.tEnd is required (how long the trace is, in s)`); else te = numOrExpr(x.tEnd, names, w + '.tEnd', E, true);
        const dt = x.dt === undefined ? null : numOrExpr(x.dt, names, w + '.dt', E, true);
        if ('tStart' in x) numOrExpr(x.tStart, names, w + '.tStart', E, false);
        if ('threshold' in x && x.kind === 'logic') numOrExpr(x.threshold, names, w + '.threshold', E, false);
        if (stepsOver(te, dt)) E.push(`${w}: tEnd / dt is more than ${L.steps} steps`);
      }
    });
    const d = b.diagnosis;
    if (!isObj(d)) E.push('spec.bench.diagnosis must be an object {options: [{label, fault?}]}');
    else {
      unknownKeys(d, ['label', 'options'], 'spec.bench.diagnosis', E);
      key(d.label, 'spec.bench.diagnosis.label');
      const os = d.options, named = [];
      if (!(Array.isArray(os) && os.length >= 2 && os.length <= L.options)) E.push(`spec.bench.diagnosis.options must be a list of 2–${L.options} options {label, fault?}`);
      else {
        os.forEach((o, i) => {
          const w = `spec.bench.diagnosis.options[${i}]`;
          if (!isObj(o)) { E.push(`${w} must be an object {label, fault?}`); return; }
          unknownKeys(o, ['label', 'fault'], w, E);
          key(o.label, w + '.label', true);
          if (o.fault !== undefined) {
            if (!(typeof o.fault === 'string' && fids.includes(o.fault))) E.push(`${w}.fault must be the id of one of spec.bench.faults`);
            else if (named.includes(o.fault)) E.push(`${w}.fault: two options name the fault ${o.fault}`);
            else named.push(o.fault);
          }
        });
        for (const f of fids) if (!named.includes(f)) E.push(`spec.bench.diagnosis: no option names the fault ${f} (the learner could not diagnose it)`);
      }
    }
    if (b.budget !== undefined && !(Number.isInteger(b.budget) && b.budget >= 1 && b.budget <= L.budget)) E.push(`spec.bench.budget is a whole number 1–${L.budget} (the measurements allowed)`);
  }
  /* ---------- parts: several engines in one spec (docs/INTERACTIVE.md §12.8) — the SAME rules and messages as tools/activities.py check_parts ----------
     spec.parts: [{id, engine, model, outputs, inputs?: {name: expression | {series, points?, stat?}}} | {id, use, with?}] (≤ 8); the output ids
     join the spec's names; spec.couple: "chain" (default) | {loops: [{parts, tol, maxIter?, relax?, init?}], cosim: {tEnd, dt, parts, order?,
     t0?, time?, init?, iterate?}}. A part's model sees the consts, the params and its own inputs. */
  Object.assign(ACT, {
    PARTS_LIM: { parts: 8, inputs: 24, outputs: 48, loops: 4, iter: 50, macro: 5000, points: 2000 },
    PART_KEYS: ['id', 'engine', 'model', 'outputs', 'inputs', 'use', 'with'], USE_RE: /^[a-z0-9][a-z0-9-]{0,60}$/,
    // the engines that can be stepped in time (a stepper: docs/INTERACTIVE_LIBRARY.md §1.6) — the same list in tools/activities.py
    STEPPERS: new Set(['ode@1', 'med@1', 'clinic@1', 'genetics@1', 'des@1', 'field@1', 'agents@1', 'thermal@1', 'pid@1', 'twin@1', 'circuit-mna@1']),
  });
  ACT.SPEC_KEYS.add('parts'); ACT.SPEC_KEYS.add('couple');
  /** the names an expression uses (its free variables), in order of appearance; [] when it does not parse */
  function freeVars(src) {
    if (typeof src !== 'string' || !NX()) return [];
    let ast; try { ast = NX().parse(src); } catch (e) { return []; }
    const out = [];
    (function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (n.t === 'var') { if (!out.includes(n.name)) out.push(n.name); return; }
      for (const k of ['a', 'b', 'c']) if (n[k]) walk(n[k]);
      if (Array.isArray(n.args)) n.args.forEach(walk);
    })(ast);
    return out;
  }
  /** deep merge of plain objects (b wins; arrays and other values are replaced) */
  function mergeDeep(a, b) {
    if (!isObj(a) || !isObj(b)) return b === undefined ? a : JSON.parse(JSON.stringify(b));
    const o = JSON.parse(JSON.stringify(a));
    for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(o[k]) ? mergeDeep(o[k], v) : JSON.parse(JSON.stringify(v));
    return o;
  }
  /** the parts of a spec with every `use` resolved against the pack's activities/_parts (lib: {name: part}); E gets the problems.
      → [{i, w, p (the resolved part)}] or null when spec.parts is not a list */
  function resolveParts(spec, lib, E) {
    const ps = spec.parts, L = ACT.PARTS_LIM, out = [];
    if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.parts)) { E.push(`spec.parts must be a list of 1–${L.parts} parts {id, engine, model, outputs, inputs?}`); if (!Array.isArray(ps)) return null; }
    ps.slice(0, L.parts).forEach((p, i) => {
      const w = `spec.parts[${i}]`;
      if (!isObj(p)) { E.push(`${w} must be an object {id, engine, model, outputs, inputs?} or {id, use, with?}`); return; }
      unknownKeys(p, ACT.PART_KEYS, w, E);
      let q = p;
      if (p.use !== undefined) {
        if (!(typeof p.use === 'string' && ACT.USE_RE.test(p.use))) { E.push(`${w}.use must be the name of a file activities/_parts/<name>.json (lower-case letters, digits and -)`); return; }
        const d = isObj(lib) && Object.prototype.hasOwnProperty.call(lib, p.use) ? lib[p.use] : undefined;
        if (d === undefined) { E.push(`${w}.use: activities/_parts/${p.use}.json is not in the pack`); return; }
        if (!isObj(d)) { E.push(`${w}.use: activities/_parts/${p.use}.json must be a part {engine, model, outputs, inputs?}`); return; }
        if (p.with !== undefined && !isObj(p.with)) { E.push(`${w}.with must be an object (the fields of the part to change)`); return; }
        const base = {}; for (const k of Object.keys(d)) if (ACT.PART_KEYS.includes(k) && k !== 'id' && k !== 'use' && k !== 'with') base[k] = d[k];
        q = mergeDeep(base, p.with || {});
        for (const k of ['engine', 'model', 'outputs', 'inputs']) if (p[k] !== undefined) q[k] = JSON.parse(JSON.stringify(p[k]));
        q.id = p.id;
      } else if (p.with !== undefined) E.push(`${w}.with needs use (the part of activities/_parts it changes)`);
      out.push({ i, w, p: q });
    });
    return out;
  }
  /** the spec one part shows its engine: its model and outputs, the spec's consts and params, and its inputs as names (the engine's own checks see them) */
  function partSpec(spec, p) {
    const consts = Object.assign({}, isObj(spec.consts) ? spec.consts : {});
    for (const k of isObj(p.inputs) ? Object.keys(p.inputs) : []) if (!Object.prototype.hasOwnProperty.call(consts, k)) consts[k] = 0;
    const s = { format: ACT.SPEC_FORMAT, engine: p.engine, consts, params: list(spec.params) };
    if (p.model !== undefined) s.model = p.model;
    if (p.outputs !== undefined) s.outputs = p.outputs;
    return s;
  }
  /** an engine's messages about spec.X → about spec.parts[i].X */
  const partMsg = (m, w) => m.replace(/^spec(?=[.:\[])/, w);
  /** the dependency graph of derived values and parts (docs/INTERACTIVE.md §12.8): nodes "d:<id>" and "p:<id>" in the spec's order, each with
      the nodes it needs; its strongly connected components (Tarjan 1972) */
  function partsGraph(spec, parts) {
    const nodes = [], deps = new Map(), owner = new Map(), label = new Map();
    for (const d of list(spec.derived)) if (isObj(d) && typeof d.id === 'string' && !label.has('d:' + d.id)) { nodes.push('d:' + d.id); label.set('d:' + d.id, d.id); if (!owner.has(d.id)) owner.set(d.id, 'd:' + d.id); }
    for (const p of parts) if (typeof p.id === 'string' && !label.has('p:' + p.id)) { nodes.push('p:' + p.id); label.set('p:' + p.id, p.id); for (const o of list(p.outputs)) if (isObj(o) && typeof o.id === 'string' && !owner.has(o.id)) owner.set(o.id, 'p:' + p.id); }
    const need = (n, names) => { const a = deps.get(n); for (const x of names) { const o = owner.get(x); if (o && !a.includes(o)) a.push(o); } };
    for (const n of nodes) deps.set(n, []);
    for (const d of list(spec.derived)) if (isObj(d) && typeof d.id === 'string' && deps.has('d:' + d.id)) need('d:' + d.id, freeVars(d.expr));
    for (const p of parts) if (typeof p.id === 'string' && deps.has('p:' + p.id) && isObj(p.inputs)) for (const v of Object.values(p.inputs)) need('p:' + p.id, typeof v === 'string' ? freeVars(v) : isObj(v) && typeof v.series === 'string' ? [v.series] : []);
    // Tarjan's strongly connected components
    let idx = 0; const st = [], on = new Set(), ix = new Map(), low = new Map(), sccs = [];
    const visit = v => {
      ix.set(v, idx); low.set(v, idx); idx++; st.push(v); on.add(v);
      for (const w of deps.get(v)) { if (!ix.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), ix.get(w))); }
      if (low.get(v) === ix.get(v)) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); sccs.push(c.sort((a, b) => nodes.indexOf(a) - nodes.indexOf(b))); }
    };
    for (const v of nodes) if (!ix.has(v)) visit(v);
    return { nodes, deps, sccs, label };
  }
  /** a cycle through the component c, as names: the shortest way from its first node back to it */
  function cyclePath(G, c) {
    const s = c[0], prev = new Map([[s, null]]), q = [s];
    while (q.length) {
      const v = q.shift();
      for (const w of G.deps.get(v)) {
        if (!c.includes(w)) continue;
        if (w === s) { const path = []; for (let x = v; x !== null; x = prev.get(x)) path.unshift(G.label.get(x)); return path.concat(G.label.get(s)); }
        if (!prev.has(w)) { prev.set(w, v); q.push(w); }
      }
    }
    return [G.label.get(s), G.label.get(s)];
  }
  /** the coupling groups of a spec: [{k: 'loop', i, parts, def} | {k: 'cosim', parts, def}] (only well-formed lists of part ids) */
  function couplingGroups(spec, ids) {
    const c = spec.couple, out = [];
    if (!isObj(c)) return out;
    list(c.loops).forEach((l, i) => { if (isObj(l) && Array.isArray(l.parts)) out.push({ k: 'loop', i, parts: l.parts.filter(x => ids.includes(x)), def: l }); });
    if (isObj(c.cosim) && Array.isArray(c.cosim.parts)) {
      const ps = c.cosim.parts.filter(x => ids.includes(x)), ord = Array.isArray(c.cosim.order) ? c.cosim.order.filter(x => ps.includes(x)) : [];
      out.push({ k: 'cosim', parts: ord.concat(ps.filter(x => !ord.includes(x))), def: c.cosim });
    }
    return out;
  }
  /** the order of evaluation: units {k: 'derived', id} | {k: 'part', id} | {k: 'loop', i, parts, derived} | {k: 'cosim', parts, derived}, each after
      what it needs (Kahn 1962, ties in the spec's order), and the undeclared cycles [[names]] */
  function partsOrder(spec, parts) {
    const G = partsGraph(spec, parts), ids = parts.map(p => p.id), groups = couplingGroups(spec, ids), unitOf = new Map(), units = [], cycles = [];
    const gOf = pid => groups.findIndex(g => g.parts.includes(pid));
    groups.forEach((g, j) => { const u = { ...(g.k === 'loop' ? { k: 'loop', i: g.i } : { k: 'cosim' }), parts: g.parts.slice(), derived: [], key: 'g' + j }; units.push(u); for (const p of g.parts) unitOf.set('p:' + p, u); });
    for (const c of G.sccs) {
      const cyc = c.length > 1 || G.deps.get(c[0]).includes(c[0]);
      if (!cyc) continue;
      const ps = c.filter(n => n.startsWith('p:')).map(n => n.slice(2)), gs = [...new Set(ps.map(gOf))];
      if (ps.length && gs.length === 1 && gs[0] >= 0) { const u = unitOf.get('p:' + ps[0]); for (const n of c) if (n.startsWith('d:') && !unitOf.has(n)) { u.derived.push(n.slice(2)); unitOf.set(n, u); } }
      else cycles.push(cyclePath(G, c));
    }
    for (const n of G.nodes) if (!unitOf.has(n)) { const u = n.startsWith('d:') ? { k: 'derived', id: n.slice(2), key: n } : { k: 'part', id: n.slice(2), key: n }; units.push(u); unitOf.set(n, u); }
    for (const u of units) if (u.derived) u.derived.sort((a, b) => G.nodes.indexOf('d:' + a) - G.nodes.indexOf('d:' + b));
    const rank = u => Math.min(...G.nodes.filter(n => unitOf.get(n) === u).map(n => G.nodes.indexOf(n)), 1e9);
    const udeps = new Map(units.map(u => [u, new Set()]));
    for (const n of G.nodes) for (const m of G.deps.get(n)) { const a = unitOf.get(n), b = unitOf.get(m); if (a !== b) udeps.get(a).add(b); }
    const done = new Set(), order = [];
    if (!cycles.length) while (order.length < units.length) {
      const ready = units.filter(u => !done.has(u) && [...udeps.get(u)].every(b => done.has(b))).sort((a, b) => rank(a) - rank(b));
      if (!ready.length) break;
      done.add(ready[0]); order.push(ready[0]);
    }
    return { order: order.map(u => { const o = { ...u }; delete o.key; return o; }), cycles };
  }
  /** partsPlan(spec, lib) → {parts: [resolved part], order: [unit], errors} — what the runtime (35_activity_sim.js) runs */
  function partsPlan(spec, lib) {
    const E = [], R = isObj(spec) ? resolveParts(spec, lib, E) || [] : [];
    const parts = R.map(r => r.p);
    const { order, cycles } = partsOrder(spec, parts);
    return { parts, order, errors: E, cycles };
  }
  /** check the parts (the first half: before the derived values are checked) — registers every output id as a name of the spec */
  function checkParts(spec, X) {
    const { E, name, key, items, lib, cp } = X, L = ACT.PARTS_LIM, known = X.known;
    const R = resolveParts(spec, lib, E) || [], info = { R, cp, parts: [], scalars: [], series: [], scenes: [], sounds: [], anyLib: false, outOf: new Map(), kindOf: new Map(), ids: [] };
    let nOut = 0;
    for (const { i, w, p } of R) {
      if (!(typeof p.id === 'string' && ACT.BENCH_ID_RE.test(p.id))) E.push(`${w}.id must be an id (a letter, then letters, digits, _ or -; at most 32)`);
      else if (info.ids.includes(p.id)) E.push(`${w}.id: the part ${p.id} is listed twice`);
      else info.ids.push(p.id);
      const eng = p.engine, lib1 = typeof eng === 'string' && Object.prototype.hasOwnProperty.call(ACT.LIB, eng);
      if (eng === ACT.DEFAULT_ENGINE) E.push(`${w}.engine: ${ACT.DEFAULT_ENGINE} computes nothing a part could add (use derived)`);
      else if (typeof eng !== 'string' || !known.has(eng)) E.push(`${w}.engine: unknown engine ${qv(eng)} (this version knows ${[...known].filter(e => e !== ACT.DEFAULT_ENGINE).sort().join(', ')})`);
      if (lib1) info.anyLib = true;
      if (p.model !== undefined && !isObj(p.model)) E.push(`${w}.model must be an object`);
      const ins = p.inputs, inNames = [];
      if (ins !== undefined) {
        if (!(isObj(ins) && Object.keys(ins).length <= L.inputs)) E.push(`${w}.inputs must be an object of at most ${L.inputs} inputs {name: number | expression | {series: "<output id>"}}`);
        else for (const k of Object.keys(ins)) { if (badName(k)) E.push(`${w}.inputs: ${qv(k)} is not a usable name (a letter or _, then letters, digits, _; not pi, e or a reserved word)`); else inNames.push(k); }
      }
      const os = p.outputs, mine = { id: p.id, eng, lib: lib1, w, i, p, scalars: [], series: [], scenes: [], sounds: [], inNames };
      if (!(Array.isArray(os) && os.length >= 1 && os.length <= ACT.SPEC_LIM.outputs)) E.push(`${w}.outputs must be a list of 1–${ACT.SPEC_LIM.outputs} {id, kind}`);
      else os.forEach((o, j) => {
        const wo = `${w}.outputs[${j}]`, kinds = lib1 ? ACT.LIB_KINDS : ['scalar', 'series'];
        if (!(isObj(o) && kinds.includes(o.kind))) { E.push(`${wo} must be {id, kind: ${kinds.join(' | ')}}`); return; }
        nOut++;
        if (name(o.id, wo + '.id')) {
          const k = o.kind === 'scalar' ? 'scalars' : o.kind === 'series' ? 'series' : o.kind === 'scene' ? 'scenes' : 'sounds';
          mine[k].push(o.id); info[k].push(o.id); info.outOf.set(o.id, p.id); info.kindOf.set(o.id, o.kind);
        }
      });
      // the engine's own checks of the model and outputs, over the consts, the params and the part's inputs
      const sub = partSpec(spec, p), names = cp.concat(inNames.filter(n => !cp.includes(n))), E2 = [];
      if (typeof eng === 'string' && known.has(eng)) {
        if (eng === ACT.CIRCUIT) checkCircuit(sub, names, E2);
        else if (Object.prototype.hasOwnProperty.call(ACT.P6, eng)) checkEngine(sub, eng, names, E2);
        else if (lib1) checkLib(sub, eng, names, E2, (k, wk, need) => key(k, partMsg(wk, w), need));
        if (eng === ACT.WASM_ENGINE && items) { if (!WK()) E2.push('spec.model: the WebAssembly checker (NoemaWasm, engine/src/44_activity_wasm.js) is not loaded here'); else E2.push(...WK().checkModel(sub, items)); }
      }
      E.push(...E2.map(m => partMsg(m, w)));
      info.parts.push(mine);
    }
    if (nOut > L.outputs) E.push(`spec.parts: at most ${L.outputs} outputs in all`);
    return info;
  }
  /** check the parts (the second half: inputs, coupling, the order, the bench), once every name of the spec is known */
  function checkPartLinks(spec, info, X) {
    const { E, names, cp, seen, key, name } = X, L = ACT.PARTS_LIM, ids = info.ids;
    const c = spec.couple, inGroup = new Map();
    const tol = (v, w) => { if (v === undefined) E.push(`${w}.tol is required: a number > 0 (the largest relative change that counts as settled)`); else if (!(isNum(v) && v > 0)) E.push(`${w}.tol must be a number > 0`); };
    const maxIter = (v, w) => { if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= L.iter)) E.push(`${w}.maxIter is a whole number 1–${L.iter}`); };
    const groupParts = (ps, w, what) => {
      if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.parts && ps.every(x => typeof x === 'string'))) { E.push(`${w}.parts must be a list of 1–${L.parts} ids of spec.parts`); return []; }
      const ok = [];
      for (const x of ps) {
        if (!ids.includes(x)) E.push(`${w}.parts: ${qv(x)} is not a part of spec.parts`);
        else if (ok.includes(x)) E.push(`${w}.parts lists the part ${x} twice`);
        else if (inGroup.has(x)) E.push(`${w}.parts: the part ${x} is already in ${inGroup.get(x)}`);
        else { ok.push(x); inGroup.set(x, what); }
      }
      return ok;
    };
    const initOf = (o, w, ps) => {
      if (o === undefined) return;
      if (!isObj(o)) { E.push(`${w}.init must be an object {output id: number} (the first guesses)`); return; }
      for (const [k, v] of Object.entries(o)) {
        if (!(info.outOf.has(k) && ps.includes(info.outOf.get(k)) && info.kindOf.get(k) === 'scalar')) E.push(`${w}.init.${k} must name a scalar output of a part of the ${w.endsWith('cosim') ? 'co-simulation' : 'loop'}`);
        else if (!isNum(v)) E.push(`${w}.init.${k} must be a number`);
      }
    };
    let cosimParts = [];
    if (c !== undefined && c !== 'chain') {
      if (!isObj(c)) E.push('spec.couple is "chain" or {loops?: […], cosim?: {…}}');
      else {
        unknownKeys(c, ['loops', 'cosim'], 'spec.couple', E);
        if (c.loops !== undefined) {
          if (!(Array.isArray(c.loops) && c.loops.length >= 1 && c.loops.length <= L.loops)) E.push(`spec.couple.loops must be a list of 1–${L.loops} loops {parts, tol, maxIter?, relax?, init?}`);
          else c.loops.forEach((l, i) => {
            const w = `spec.couple.loops[${i}]`;
            if (!isObj(l)) { E.push(`${w} must be an object {parts, tol, maxIter?, relax?, init?}`); return; }
            unknownKeys(l, ['parts', 'tol', 'maxIter', 'relax', 'init'], w, E);
            const ps = groupParts(l.parts, w, `the loop ${i}`);
            tol(l.tol, w); maxIter(l.maxIter, w);
            if (l.relax !== undefined && !(isNum(l.relax) && l.relax > 0 && l.relax <= 1)) E.push(`${w}.relax is a number in (0, 1] (1 = no relaxation)`);
            initOf(l.init, w, ps);
          });
        }
        if (c.cosim !== undefined) {
          const w = 'spec.couple.cosim', s = c.cosim;
          if (!isObj(s)) E.push(`${w} must be an object {tEnd, dt, parts, order?, t0?, time?, init?, iterate?}`);
          else {
            unknownKeys(s, ['tEnd', 'dt', 'parts', 'order', 't0', 'time', 'init', 'iterate'], w, E);
            cosimParts = groupParts(s.parts, w, 'the co-simulation');
            for (const pid of cosimParts) { const q = info.parts.find(x => x.id === pid); if (q && typeof q.eng === 'string' && !ACT.STEPPERS.has(q.eng)) E.push(`${w}.parts: the engine ${q.eng} of the part ${pid} cannot be stepped in time (a co-simulation needs ${[...ACT.STEPPERS].sort().join(', ')}); couple it in a chain or a loop`); }
            let te = null, dt = null;
            if (s.tEnd === undefined) E.push(`${w}.tEnd is required (when the co-simulation ends)`); else te = numOrExpr(s.tEnd, cp, `${w}.tEnd`, E, true);
            if (s.dt === undefined) E.push(`${w}.dt is required (the macro step: how often the parts exchange their values)`); else dt = numOrExpr(s.dt, cp, `${w}.dt`, E, true);
            const t0 = s.t0 === undefined ? 0 : numOrExpr(s.t0, cp, `${w}.t0`, E, false);
            if (isNum(te) && isNum(dt) && isNum(t0) && Math.ceil((te - t0) / dt - 1e-9) > L.macro) E.push(`${w}: (tEnd − t0) / dt is more than ${L.macro} macro steps`);
            if (isNum(te) && isNum(t0) && !(te > t0)) E.push(`${w}: tEnd must be after t0`);
            if (s.order !== undefined && !(Array.isArray(s.order) && s.order.length === cosimParts.length && cosimParts.every(x => s.order.includes(x)))) E.push(`${w}.order must list each part of the co-simulation once (the order they exchange in)`);
            if (s.time !== undefined && name(s.time, `${w}.time`)) info.series.push(s.time);
            initOf(s.init, w, cosimParts);
            if (s.iterate !== undefined) {
              if (!isObj(s.iterate)) E.push(`${w}.iterate must be an object {tol, maxIter?}`);
              else { unknownKeys(s.iterate, ['tol', 'maxIter'], `${w}.iterate`, E); tol(s.iterate.tol, `${w}.iterate`); maxIter(s.iterate.maxIter, `${w}.iterate`); }
            }
          }
        }
      }
    }
    // the inputs: formulas over the spec's names (in a co-simulation also the step values of its parts' outputs), or a series of another part
    for (const q of info.parts) {
      const ins = isObj(q.p.inputs) ? q.p.inputs : {}, co = cosimParts.includes(q.id);
      const nm = co ? names.concat([...info.outOf.keys()].filter(o => cosimParts.includes(info.outOf.get(o)) && !names.includes(o))) : names;
      for (const k of q.inNames) {
        const v = ins[k], wi = `${q.w}.inputs.${k}`;
        if (typeof v === 'string') { const m = exprProblem(v, nm, wi); if (m) E.push(m); }
        else if (isNum(v)) { /* a number */ }
        else if (isObj(v)) {
          unknownKeys(v, ['series', 'points', 'stat'], wi, E);
          if (!(typeof v.series === 'string' && info.kindOf.get(v.series) === 'series' && info.outOf.get(v.series) !== q.id)) E.push(`${wi}.series must name a series output of another part`);
          else if (co && cosimParts.includes(info.outOf.get(v.series))) E.push(`${wi}: the parts of a co-simulation exchange numbers at each step, not series (use the output's id in a formula)`);
          if (v.points !== undefined && !(Number.isInteger(v.points) && v.points >= 2 && v.points <= L.points)) E.push(`${wi}.points is a whole number 2–${L.points} (a series input is at most ${L.points} points)`);
          if (v.stat !== undefined && !ACT.STATS.includes(v.stat)) E.push(`${wi}.stat is one of ${ACT.STATS.join(', ')}`);
          if (v.stat !== undefined && v.points !== undefined) E.push(`${wi}: stat makes a number of the series, points resamples it: one or the other`);
        } else E.push(`${wi} must be a number, an expression or {series: "<output id>"}`);
      }
    }
    // the order: every cycle must be declared
    const good = info.parts.filter((q, k) => info.ids.includes(q.id) && info.parts.findIndex(x => x.id === q.id) === k).map(q => ({ ...q.p, outputs: list(q.p.outputs).filter(o => isObj(o) && info.outOf.get(o.id) === q.id) }));
    for (const cy of partsOrder(spec, good).cycles) E.push(`spec.parts: ${cy.join(' → ')} depend on each other in a cycle: declare it in spec.couple.loops (a fixed point) or spec.couple.cosim (in time)`);
    // the bench: at most one, on a part whose engine takes measurements
    if (spec.bench != null) {
      const b = spec.bench, q = isObj(b) ? info.parts.find(x => x.id === b.part) : null;
      if (!isObj(b) || !q || !ACT.BENCH_ENGINES.has(q.eng)) E.push(`spec.bench.part must be the id of a part whose engine takes measurements (${[...ACT.BENCH_ENGINES].sort().join(', ')})`);
      else {
        const sub = partSpec(spec, q.p), bb = {}; for (const k of Object.keys(b)) if (k !== 'part') bb[k] = b[k];
        sub.bench = bb;
        checkBench(sub, cp.concat(q.inNames.filter(n => !cp.includes(n))), seen, E, key, q.eng);
      }
    }
  }
  /** checkSimSpec(spec, tables?, engines?, opts?) → errors of a sim-spec@1 spec. tables: {locale: {key: text}}; engines: the known engine ids
      (default ACT.ENGINES; the app passes the engines it has registered). opts.python: the spec of a py-module@1 activity (its outputs
      come from Python's step(): no engine, no model, no bench, at least one output). opts.items: {id: item} of the pack (a wasm@1 model
      names its module there; none = the model is not checked here, the engine's own check does it in the app). The same rules as
      tools/activities.py check_spec. */
  function checkSimSpec(spec, tables, engines, opts) {
    const py = !!(opts && opts.python), items = opts && isObj(opts.items) ? opts.items : null;
    const E = [], L = ACT.SPEC_LIM;
    if (!isObj(spec)) return ['spec: a JSON object is required (activities/<id>/spec.json)'];
    if (utf8(JSON.stringify(spec)) > L.bytes) E.push(`spec: at most ${L.bytes / 1024} KB`);
    if (spec.format !== ACT.SPEC_FORMAT) E.push(`spec: format must be "${ACT.SPEC_FORMAT}"`);
    for (const k of Object.keys(spec).filter(k => !ACT.SPEC_KEYS.has(k)).sort()) E.push(`spec: unknown field ${qv(k)}`);
    const eng = py ? ACT.PY : 'engine' in spec ? spec.engine : ACT.DEFAULT_ENGINE, known = engines ? new Set(engines) : ACT.ENGINES;
    if (py) {
      if ('engine' in spec) E.push('spec.engine: the outputs of a py-module@1 activity come from its Python step(); leave engine out');
      if ('model' in spec) E.push('spec.model: a py-module@1 activity has no engine model (its Python code is the model)');
    } else if (typeof eng !== 'string' || !known.has(eng)) E.push(`spec: unknown engine ${qv(eng)} (this version knows ${[...known].sort().join(', ')})`);
    const PT = !py && 'parts' in spec;   // several engines in one spec (§12.8)
    if (py && 'parts' in spec) E.push('spec.parts: a py-module@1 activity has no parts (its Python code is the model)');
    if (PT && typeof eng === 'string' && eng !== ACT.DEFAULT_ENGINE) E.push(`spec.engine: a spec with parts names the engine of each part (leave spec.engine out, or "${ACT.DEFAULT_ENGINE}")`);
    if (!PT && 'couple' in spec) E.push('spec.couple: coupling needs parts (spec.parts)');
    if (eng === ACT.DEFAULT_ENGINE && 'model' in spec) E.push('spec: model configures another engine; formula@1 has none');
    if (spec.model != null && !isObj(spec.model)) E.push('spec: model must be an object');
    const keys = new Set(), seen = new Set();
    const key = (k, where, need = false) => { if (k == null && !need) return; if (!(typeof k === 'string' && ACT.KEY_RE.test(k))) { E.push(`${where} must be a key of the activity's string tables`); return; } keys.add(k); };
    const name = (n, where) => {
      if (badName(n)) { E.push(`${where}: ${qv(n)} is not a usable name (a letter or _, then letters, digits, _; not pi, e or a reserved word)`); return false; }
      if (seen.has(n)) { E.push(`${where}: the name ${n} is used twice`); return false; }
      seen.add(n); return true;
    };
    const expr = (src, names, where) => { const m = exprProblem(src, names, where); if (m) E.push(m); };
    const numfmt = (o, where) => {
      if (o.unit != null && !(typeof o.unit === 'string' && o.unit.length <= L.unit)) E.push(`${where}.unit must be a text of at most ${L.unit} characters`);
      if (o.format != null && !ACT.NUM_FORMATS.includes(o.format)) E.push(`${where}.format is one of ${ACT.NUM_FORMATS.join(', ')}`);
      if (o.digits != null && !(Number.isInteger(o.digits) && o.digits >= 1 && o.digits <= L.digits)) E.push(`${where}.digits is a whole number 1–${L.digits}`);
    };
    key(spec.title, 'spec.title'); key(spec.intro, 'spec.intro');
    const c = spec.consts;
    if (c != null) {
      if (!(isObj(c) && Object.keys(c).length <= L.consts)) E.push(`spec.consts must be an object of at most ${L.consts} numbers`);
      else for (const [k, v] of Object.entries(c)) if (name(k, 'spec.consts') && !isNum(v)) E.push(`spec.consts.${k} must be a number`);
    }
    const ps = spec.params;
    if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.params)) E.push(`spec.params must be a list of 1–${L.params} controls`);
    list(ps).slice(0, L.params).forEach((p, i) => {
      const w = `spec.params[${i}]`;
      if (!isObj(p)) { E.push(`${w} must be an object`); return; }
      name(p.id, w + '.id'); key(p.label, w + '.label', true);
      const kd = p.kind;
      if (!ACT.PARAM_KINDS.includes(kd)) { E.push(`${w}.kind is one of ${ACT.PARAM_KINDS.join(', ')}`); return; }
      if (kd === 'slider' || kd === 'number') {
        const lo = p.min, hi = p.max, df = p.default;
        if (!(isNum(lo) && isNum(hi) && lo < hi)) { E.push(`${w}: min and max must be numbers, min < max`); return; }
        if (p.step != null && !(isNum(p.step) && p.step > 0)) E.push(`${w}.step must be a number > 0`);
        if (!(isNum(df) && lo <= df && df <= hi)) E.push(`${w}.default must be a number from min to max`);
        if (p.scale != null && !['lin', 'log'].includes(p.scale)) E.push(`${w}.scale is lin or log`);
        else if (p.scale === 'log' && lo <= 0) E.push(`${w}: a log scale needs min > 0`);
        numfmt(p, w);
      } else if (kd === 'toggle') {
        if (p.default != null && typeof p.default !== 'boolean') E.push(`${w}.default must be true or false`);
      } else {
        const ops = p.options;
        if (!(Array.isArray(ops) && ops.length >= 2 && ops.length <= L.options)) { E.push(`${w}.options must be a list of 2–${L.options} {value, label}`); return; }
        const vals = [];
        ops.forEach((o, j) => { if (!(isObj(o) && isNum(o.value))) { E.push(`${w}.options[${j}] needs a number value`); return; } key(o.label, `${w}.options[${j}].label`, true); vals.push(o.value); });
        if (new Set(vals).size !== vals.length) E.push(`${w}.options: two options have the same value`);
        if (p.default != null && !vals.includes(p.default)) E.push(`${w}.default must be the value of one of the options`);
      }
    });
    const names = [...seen];   // consts and params (the order does not matter to a check)
    const PI = PT ? checkParts(spec, { E, name, key, items, lib: opts && isObj(opts.parts) ? opts.parts : null, cp: [...names], known }) : null;
    const ds = spec.derived;
    if (ds != null && !(Array.isArray(ds) && ds.length <= L.derived)) E.push(`spec.derived must be a list of at most ${L.derived} {id, expr}`);
    list(ds).slice(0, L.derived).forEach((d, i) => {
      const w = `spec.derived[${i}]`;
      if (!isObj(d)) { E.push(`${w} must be an object {id, expr}`); return; }
      expr(d.expr, PI ? names.concat(PI.scalars) : [...names], w + '.expr');
      if (name(d.id, w + '.id')) names.push(d.id);
    });
    const inNames = [...names];   // what an engine's inputs may use: consts, params, derived
    const os = spec.outputs, series = [], scenes = [], sounds = [], lib = PI ? PI.anyLib : typeof eng === 'string' && Object.prototype.hasOwnProperty.call(ACT.LIB, eng);
    if (PI) { names.push(...PI.scalars); checkPartLinks(spec, PI, { E, names, cp: PI.cp, seen, key, name }); series.push(...PI.series); scenes.push(...PI.scenes); sounds.push(...PI.sounds); }
    if (py && !(Array.isArray(os) && os.length)) E.push('spec.outputs: list what step() returns, at least one {id, kind: scalar | series}');
    if (os != null) {
      if (PT) E.push('spec.outputs: a spec with parts lists the outputs of each part (spec.parts[i].outputs)');
      else if (eng === ACT.DEFAULT_ENGINE) E.push('spec.outputs come from an engine; formula@1 has none (use derived)');
      else if (!(Array.isArray(os) && os.length <= L.outputs)) E.push(`spec.outputs must be a list of at most ${L.outputs} {id, kind}`);
      else os.forEach((o, i) => {
        const w = `spec.outputs[${i}]`;
        const kinds = lib ? ACT.LIB_KINDS : ['scalar', 'series'];
        if (!(isObj(o) && kinds.includes(o.kind))) { E.push(`${w} must be {id, kind: ${kinds.join(' | ')}}`); return; }
        if (name(o.id, w + '.id')) (o.kind === 'scalar' ? names : o.kind === 'series' ? series : o.kind === 'scene' ? scenes : sounds).push(o.id);
      });
    }
    const rs = spec.readouts;
    if (rs != null && !(Array.isArray(rs) && rs.length <= L.readouts)) E.push(`spec.readouts must be a list of at most ${L.readouts} {label, expr}`);
    list(rs).slice(0, L.readouts).forEach((r, i) => {
      const w = `spec.readouts[${i}]`;
      if (!isObj(r)) { E.push(`${w} must be an object {label, expr}`); return; }
      key(r.label, w + '.label', true); expr(r.expr, names, w + '.expr'); numfmt(r, w);
    });
    const pl = spec.plots;
    if (pl != null && !(Array.isArray(pl) && pl.length <= L.plots)) E.push(`spec.plots must be a list of at most ${L.plots} plots`);
    list(pl).slice(0, L.plots).forEach((p, i) => {
      const w = `spec.plots[${i}]`;
      if (!isObj(p) || !(lib ? ['function', 'series', 'scene', 'sound'] : ['function', 'series']).includes(p.kind)) { E.push(lib ? `${w} must be a plot {kind: function | series, x, y, series} or {kind: scene | sound, of}` : `${w} must be a plot {kind: function | series, x, y, series}`); return; }
      key(p.title, w + '.title');
      if (p.kind === 'scene' || p.kind === 'sound') {   // a drawing or a sound an engine of the library computes (docs/INTERACTIVE_LIBRARY.md §1.4)
        unknownKeys(p, ['kind', 'title', 'of', 'height'], w, E);
        if (!(p.kind === 'scene' ? scenes : sounds).includes(p.of)) E.push(`${w}.of must name a ${p.kind} output of the engine`);
        if (p.height != null && !(Number.isInteger(p.height) && p.height >= 120 && p.height <= 900)) E.push(`${w}.height is a whole number 120–900 (px)`);
        return;
      }
      const x = isObj(p.x) ? p.x : null, y = p.y != null ? p.y : {};
      if (!x) { E.push(`${w}.x must be an object`); return; }
      if (!isObj(y)) { E.push(`${w}.y must be an object`); return; }
      for (const [ax, o] of [['x', x], ['y', y]]) {
        key(o.label, `${w}.${ax}.label`); numfmt(o, `${w}.${ax}`);
        if (o.scale != null && !['lin', 'log'].includes(o.scale)) E.push(`${w}.${ax}.scale is lin or log`);
        for (const b of ['min', 'max']) {
          const v = o[b]; if (v == null) continue;
          if (typeof v === 'string') expr(v, names, `${w}.${ax}.${b}`);
          else if (!isNum(v)) E.push(`${w}.${ax}.${b} must be a number or an expression`);
        }
        if (isNum(o.min) && isNum(o.max) && !(o.min < o.max)) E.push(`${w}.${ax}: min must be below max`);
        if (o.scale === 'log' && isNum(o.min) && o.min <= 0) E.push(`${w}.${ax}: a log scale needs min > 0`);
      }
      const local = [...names];
      if (p.kind === 'function') {
        const xv = x.var;
        if (badName(xv) || seen.has(xv)) E.push(`${w}.x.var: ${qv(xv)} must be a new name for the x axis (not one of the spec's names)`);
        else local.push(xv);
        if (x.min == null || x.max == null) E.push(`${w}.x needs min and max`);
        const pts = p.points;
        if (pts != null && !(Number.isInteger(pts) && pts >= 2 && pts <= L.points)) E.push(`${w}.points is a whole number 2–${L.points}`);
      } else if (!series.includes(x.series)) E.push(`${w}.x.series must name a series output of the engine`);
      let ss = p.series;
      if (!(Array.isArray(ss) && ss.length >= 1 && ss.length <= L.series)) { E.push(`${w}.series must be a list of 1–${L.series} lines`); ss = []; }
      ss.forEach((s, j) => {
        const ws = `${w}.series[${j}]`;
        if (!isObj(s)) { E.push(`${ws} must be an object`); return; }
        key(s.label, ws + '.label');
        if (s.style != null && !ACT.LINE_STYLES.includes(s.style)) E.push(`${ws}.style is one of ${ACT.LINE_STYLES.join(', ')}`);
        if (p.kind === 'function') expr(s.expr, local, ws + '.expr');
        else if (!series.includes(s.y)) E.push(`${ws}.y must name a series output of the engine`);
      });
      let mk = p.marks;
      if (mk != null && !(Array.isArray(mk) && mk.length <= L.marks)) { E.push(`${w}.marks must be a list of at most ${L.marks} {axis, expr}`); mk = []; }
      list(mk).forEach((m, j) => {
        const wm = `${w}.marks[${j}]`;
        if (!(isObj(m) && (m.axis === 'x' || m.axis === 'y'))) { E.push(`${wm} must be {axis: x | y, expr, label?}`); return; }
        key(m.label, wm + '.label'); expr(m.expr, names, wm + '.expr');
      });
    });
    if (eng === ACT.CIRCUIT) checkCircuit(spec, inNames, E);
    else if (typeof eng === 'string' && Object.prototype.hasOwnProperty.call(ACT.P6, eng)) checkEngine(spec, eng, inNames, E);
    else if (lib && !PT) checkLib(spec, eng, inNames, E, key);
    if (eng === ACT.WASM_ENGINE && items) { if (!WK()) E.push('spec.model: the WebAssembly checker (NoemaWasm, engine/src/44_activity_wasm.js) is not loaded here'); else E.push(...WK().checkModel(spec, items)); }
    if (spec.bench != null && !PT) {
      if (!ACT.BENCH_ENGINES.has(eng)) E.push(`spec.bench needs an engine that can take measurements (${[...ACT.BENCH_ENGINES].sort().join(', ')})`);
      else checkBench(spec, inNames, seen, E, key, eng);
    }
    if (tables && Object.keys(tables).length) for (const k of [...keys].sort()) {
      const miss = Object.keys(tables).filter(l => isObj(tables[l]) && !Object.prototype.hasOwnProperty.call(tables[l], k)).sort();
      if (miss.length) E.push(`spec: the string ${k} is missing in strings.${miss.join(', strings.')}`);
    }
    return E;
  }
  /** the engines of the library an html-app@1 item lists (its "engines"; only known ids) */
  const appEngines = a => isObj(a) && a.runtime === 'html-app@1' && Array.isArray(a.engines) ? a.engines.filter(e => typeof e === 'string' && Object.prototype.hasOwnProperty.call(ACT.LIB, e)) : [];
  /** the "engines" of an html-app@1 item: a list of library engine ids, and every engine the bundle names in noema.engine('…') among them —
      the SAME messages as tools/activities.py check_app_engines */
  function checkAppEngines(a) {
    const E = [], es = a.engines, lib = Object.keys(ACT.LIB).sort();
    if (es != null) {
      if (!(Array.isArray(es) && es.length >= 1 && es.length <= ACT.APP_ENGINES_MAX && es.every(x => typeof x === 'string'))) E.push(`engines must be a list of 1–${ACT.APP_ENGINES_MAX} engine ids of the library (${lib.join(', ')})`);
      else {
        for (const x of es) if (!lib.includes(x)) E.push(`engine ${qv(x)} is not an engine of the library (a mini-app can use ${lib.join(', ')})`);
        if (new Set(es).size !== es.length) E.push('engines lists an engine twice');
      }
    }
    const have = Array.isArray(es) ? es : [];
    const used = typeof a.html === 'string' ? [...new Set([...a.html.matchAll(/\bnoema\.engine\(\s*(['"])([^'"\n]{1,40})\1/g)].map(m => m[2]))] : [];
    for (const x of used) if (!have.includes(x)) E.push(`the bundle uses the engine ${qv(x)}: list it in "engines"`);
    return E;
  }
  /** what pack.requires must list: the core, each runtime, each engine other than formula@1 (and the engines a mini-app lists) */
  /** the engines of the parts of a sim-spec@1 item (a part from activities/_parts: its engine there) */
  const partEngines = (a, lib) => isObj(a) && a.runtime === 'sim-spec@1' && isObj(a.spec) && Array.isArray(a.spec.parts) ? a.spec.parts.filter(isObj).map(p => p.engine !== undefined ? p.engine : typeof p.use === 'string' && isObj(lib) && isObj(lib[p.use]) ? (isObj(p.with) && p.with.engine !== undefined ? p.with.engine : lib[p.use].engine) : null) : [];
  function needRequires(items, lib) {
    items = items.filter(isObj); if (!items.length) return [];
    const rts = [...new Set(items.map(a => a.runtime).filter(r => typeof r === 'string'))].sort().map(r => 'runtime:' + r);
    const engs = [...new Set([...items.filter(a => (a.runtime === 'sim-spec@1' || a.runtime === ACT.WASM) && isObj(a.spec)).map(a => a.runtime === ACT.WASM ? ACT.WASM_ENGINE : 'engine' in a.spec ? a.spec.engine : ACT.DEFAULT_ENGINE), ...items.flatMap(appEngines), ...items.flatMap(a => partEngines(a, lib))].filter(e => typeof e === 'string' && e !== ACT.DEFAULT_ENGINE))].sort().map(e => 'engine:' + e);
    return ['activities/v1', ...rts, ...engs];
  }
  /** enginesNamed(pack) → the ids of the engines of the library a pack names (its activities and their parts, pack.requires): what a
      caller loads (NoemaCore.engines.load) before checkPack, so that each engine's own checks run — and only those engines are loaded */
  function enginesNamed(p) {
    const reg = isObj(p) ? p.activities : null, items = isObj(reg) && Array.isArray(reg.items) ? reg.items.filter(isObj) : [], parts = isObj(reg) && isObj(reg.parts) ? reg.parts : null;
    const ids = new Set();
    for (const r of [...needRequires(items, parts), ...(Array.isArray(p?.requires) ? p.requires : [])]) if (typeof r === 'string' && r.startsWith('engine:')) ids.add(r.slice(7));
    if (parts) for (const d of Object.values(parts)) if (isObj(d) && typeof d.engine === 'string') ids.add(d.engine);
    return [...ids].filter(id => ACT.ENGINES.has(id) && id !== ACT.DEFAULT_ENGINE).sort();
  }
  function checkBlockAct(b, items) {
    const E = [];
    if (!Object.prototype.hasOwnProperty.call(items, b.activity)) E.push(`interactive: activity ${qv(b.activity)} is not in pack.activities`);
    else if (showsNothing(items[b.activity])) E.push(`interactive: activity ${b.activity} ${SHOWS_NOTHING}`);
    const hg = b.height; if (hg != null && hg !== 'auto' && !(Number.isInteger(hg) && hg >= 120 && hg <= 2000)) E.push('interactive: height is "auto" or 120–2000 (px)');
    if (b.aspect != null && !(typeof b.aspect === 'string' && /^\d{1,2}:\d{1,2}$/.test(b.aspect))) E.push('interactive: aspect is like "16:9"');
    if (b.caption != null && typeof b.caption !== 'string') E.push('interactive: caption must be a text');
    return E;
  }
  function checkSim(e, items) {
    const E = [];
    const has = Object.prototype.hasOwnProperty.call(items, e.activity);
    if (!has) E.push(`activity ${qv(e.activity)} is not in pack.activities`);
    const a = has && isObj(items[e.activity]) ? items[e.activity] : null, rt = a ? a.runtime : null;
    const spec = specOf(a);
    if (showsNothing(a)) E.push(`activity ${e.activity} ${SHOWS_NOTHING}`);
    if (rt === ACT.EMBED) {   // no provider has a result channel (tools/embed_allow.json supportsResult): an outside page is explore only
      const pv = (EK() ? EK().PROVIDERS : []).find(x => x && x.id === a.provider);
      if (!(pv && pv.supportsResult === true)) E.push(`sim-embed: activity ${e.activity} is an outside page (explore only): use it in a theory block`);
    }
    const g = e.grade;
    if (!isObj(g) || !ACT.GRADE_MODES.has(g.mode)) E.push('grade must be {"mode": "reported"} (the activity reports its result) or {"mode": "checks", "checks": [{"expr": …}]} (sim-spec@1)');
    else {
      if (g.pass != null && !(isNum(g.pass) && g.pass > 0 && g.pass <= 1)) E.push('grade.pass must be a number in (0, 1]');
      if (g.mode === 'reported' && ACT.CHECKS_RUNTIMES.has(rt) && rt !== ACT.PY) E.push(`a ${rt} activity reports nothing itself: grade it with {"mode": "checks", "checks": […]}`);
      if (g.mode === 'checks') {
        if (rt != null && !ACT.CHECKS_RUNTIMES.has(rt)) E.push(`grade.mode "checks" needs an activity whose values the app can see (sim-spec@1, py-module@1, wasm-module@1); ${rt} reports its own result: use "reported"`);
        const cs = g.checks;
        if (!(Array.isArray(cs) && cs.length >= 1 && cs.length <= ACT.SPEC_LIM.checks)) E.push(`grade.checks must be a list of 1–${ACT.SPEC_LIM.checks} checks {expr, label?, weight?}`);
        else {
          const names = spec ? specNames(spec) : null, tables = a && isObj(a.strings) ? a.strings : {};
          cs.forEach((c, i) => {
            const w = `grade.checks[${i}]`;
            if (!isObj(c)) { E.push(`${w} must be an object {expr, label?, weight?}`); return; }
            const m = exprProblem(c.expr, names, w + '.expr'); if (m) E.push(m);
            if (c.weight != null && !(isNum(c.weight) && c.weight > 0)) E.push(`${w}.weight must be a number > 0`);
            if (c.label != null) {
              if (!(typeof c.label === 'string' && ACT.KEY_RE.test(c.label))) E.push(`${w}.label must be a key of the activity's string tables`);
              else { const miss = Object.keys(tables).filter(l => isObj(tables[l]) && !Object.prototype.hasOwnProperty.call(tables[l], c.label)).sort(); if (miss.length) E.push(`${w}.label: the string ${c.label} is missing in strings.${miss.join(', strings.')}`); }
            }
          });
        }
      }
    }
    const t = e.task;
    if (t != null) {
      if (typeof t !== 'object' || Array.isArray(t)) E.push('task must be an object {seed, params}');
      else {
        const sd = t.seed ?? 'auto'; if (!(sd === 'auto' || (Number.isInteger(sd) && sd >= 0))) E.push('task.seed is "auto" (a new one each attempt) or a whole number');
        if (t.params != null && (typeof t.params !== 'object' || Array.isArray(t.params))) E.push('task.params must be an object');
        else if (spec && t.params) {
          const consts = isObj(spec.consts) ? spec.consts : {};
          const fids = isObj(spec.bench) ? list(spec.bench.faults).filter(isObj).map(f => f.id) : null;
          for (const [k, v] of Object.entries(t.params)) {
            if (k === 'fault' && fids) {   // a bench: the fault of this task (one id), or the ones the seed draws from (a list)
              if (!(typeof v === 'string' ? fids.includes(v) : Array.isArray(v) && v.length >= 1 && v.every(x => typeof x === 'string' && fids.includes(x)))) E.push('task.params.fault must be the id of a fault of the bench, or a list of them (the seed draws one)');
            } else if (!Object.prototype.hasOwnProperty.call(consts, k)) { if (rt !== ACT.PY) E.push(`task.params.${k}: not a constant of the spec (a sim-spec@1 task sets only the spec's consts)`); }   // py-module@1: Python's init(task, seed) reads the others
            else if (!isNum(v)) E.push(`task.params.${k} must be a number`);
          }
        }
      }
    }
    if (e.hints != null && !(Array.isArray(e.hints) && e.hints.length <= ACT.HINTS_MAX && e.hints.every(isStr))) E.push(`hints must be a list of at most ${ACT.HINTS_MAX} texts`);
    if (e.reveal != null && !isStr(e.reveal)) E.push('reveal must be a text');
    return E;
  }
  /** checkActivities(pack, locales?) → { errors, warnings }: pack.activities, the blocks and sim exercises that use them, pack.requires.
      The sha256 of a bundle is checked here when Node's crypto is at hand (the connector), else by the app when it mounts it. */
  const nodeSha = (() => { try { const c = globalThis.process?.getBuiltinModule?.('crypto'); return c ? s => c.createHash('sha256').update(s, 'utf8').digest('hex') : null; } catch (e) { return null; } })();
  /** the registry fields of an h5p@1 item (the package itself: checkActivityPackages) — the SAME rules as tools/activities.py check_h5p_item */
  function checkH5PItem(a, aid, locs, own) {
    const E = [], entry = a.entry;
    if (entry != null && !(typeof entry === 'string' && entry.startsWith('activities/') && entry.endsWith('.h5p') && !entry.split('/').includes('..'))) E.push(`entry must be the .h5p file beside the pack (activities/${aid}/item.h5p)`);
    if (!(typeof a.sha256 === 'string' && ACT.SHA_RE.test(a.sha256))) E.push('sha256 (of the .h5p file) is required');
    if (!(Number.isInteger(a.bytes) && a.bytes > 0 && a.bytes <= ACT.H5P_MAX)) E.push(`bytes (the size of the .h5p file, at most ${ACT.H5P_MAX / 1048576} MB) is required`);
    if ('html' in a) E.push('an h5p@1 item has no html (its .h5p file travels beside the pack)');
    if (a.h5p != null && typeof a.h5p !== 'string') E.push('h5p (inline) must be the .h5p file in base64');
    const by = a.h5pByLocale;
    if (by != null) {
      if (!isObj(by)) E.push('h5pByLocale must be {locale: {content} | {h5p, sha256}}');
      else for (const [loc, v] of Object.entries(by)) {
        if (!locs.includes(loc)) { E.push(`h5pByLocale.${loc}: the pack is not read in ${loc} (${locs.join(', ')})`); continue; }
        if (!isObj(v) || !(isObj(v.content) || (typeof v.h5p === 'string' && typeof v.sha256 === 'string' && ACT.SHA_RE.test(v.sha256)))) E.push(`h5pByLocale.${loc} must be {content} (its content.json) or {h5p, sha256} (another package in base64)`);
        else if (v.l10n != null && !isObj(v.l10n)) E.push(`h5pByLocale.${loc}.l10n must be an object (H5P's own strings)`);
      }
    }
    for (const loc of locs) if (loc !== own && !(isObj(by) && Object.prototype.hasOwnProperty.call(by, loc))) E.push(`h5pByLocale.${loc} is missing: the item's words in ${loc} (activities/${aid}/content.${loc}.json)`);
    return E;
  }
  /** checkActivityPackages(pack, bytesOf?) → Promise<{ errors, warnings }>: the .h5p files of the pack's h5p@1 items — sha256 and bytes
      as the registry says, the package rules (NoemaH5P.check, engine/src/38_activity_h5p.js, loaded beside this file), each h5pByLocale
      translation with the same rules. bytesOf(item) → bytes (Uint8Array) | null, or a promise of them; an inline "h5p" (base64) is used
      first. The SAME messages as tools/activities.py check_h5p_packages (tests/activities.js). The connector runs it on the files
      uploaded beside a pack; the app runs NoemaH5P's checks itself when an item mounts. */
  async function checkActivityPackages(p, bytesOf) {
    const E = [], W = [], H = root.NoemaH5P;
    const items = (p?.activities?.items || []).filter(a => isObj(a) && a.runtime === ACT.H5P && typeof a.id === 'string');
    if (!items.length) return { errors: E, warnings: W };
    if (!H || !root.crypto?.subtle) return { errors: E, warnings: ['h5p@1: the package checker (NoemaH5P, engine/src/38_activity_h5p.js) is not loaded here'] };
    const b64 = s => { try { const t = atob(String(s).replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '')), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; } catch (e) { return new Uint8Array(0); } };
    const hex = async u => Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', u)), x => x.toString(16).padStart(2, '0')).join('');
    const unzip = async u => { try { return await H.unzip(u); } catch (e) { return null; } };
    for (const a of items) {
      const w = `activity ${a.id}`;
      let b = typeof a.h5p === 'string' ? b64(a.h5p) : (bytesOf ? await bytesOf(a) : null);
      if (b == null) { E.push(`${w}: the .h5p file ${a.entry || ''} is missing`); continue; }
      if (!(b instanceof Uint8Array)) b = new Uint8Array(b);
      if (a.sha256 !== await hex(b)) E.push(`${w}: sha256 does not match the .h5p file`);
      if (a.bytes !== b.length) E.push(`${w}: bytes does not match the .h5p file`);
      const files = await unzip(b);
      if (!files) { E.push(`${w}: not a .h5p (zip) file`); continue; }
      const r = H.check(files); E.push(...r.errors.map(m => `${w}: ${m}`)); W.push(...r.warnings.map(m => `${w}: ${m}`));
      const by = isObj(a.h5pByLocale) ? a.h5pByLocale : {};
      for (const loc of Object.keys(by).sort()) {
        const v = by[loc]; if (!isObj(v)) continue;
        let f2;
        if (typeof v.h5p === 'string') {
          const b2 = b64(v.h5p); f2 = await unzip(b2);
          if (!f2) { E.push(`${w}: h5pByLocale.${loc}: not a .h5p (zip) file`); continue; }
          if (v.sha256 !== await hex(b2)) E.push(`${w}: h5pByLocale.${loc}: sha256 does not match the .h5p file`);
        } else if (isObj(v.content)) f2 = { ...files, 'content/content.json': new TextEncoder().encode(JSON.stringify(v.content)) };
        else continue;
        E.push(...H.check(f2).errors.map(m => `${w}: h5pByLocale.${loc}: ${m}`));
      }
    }
    return { errors: E, warnings: W };
  }
  function checkActivities(p, translations) {
    const E = [], W = [], reg = p?.activities, media = p?.media || {}, own = p?.subject?.language || 'en';
    const locs = [...new Set([own, ...(translations || Object.keys(p?.translations || {}))])].sort();
    const items = {}, every = {};   // (a wasm@1 spec names a module item)
    for (const x of (reg && Array.isArray(reg.items) ? reg.items : [])) if (x && typeof x === 'object' && typeof x.id === 'string') every[x.id] = x;
    const partLib = isObj(reg) && isObj(reg.parts) ? reg.parts : null;   // activities/_parts/<name>.json (§12.8)
    if (reg != null) {
      if (typeof reg !== 'object' || Array.isArray(reg) || reg.format !== ACT.FORMAT) E.push(`activities: format must be "${ACT.FORMAT}"`);
      if (isObj(reg) && reg.parts !== undefined) {
        if (!isObj(reg.parts)) E.push('activities.parts must be an object {name: part} (the files activities/_parts/<name>.json)');
        else for (const [k, d] of Object.entries(reg.parts)) {
          if (!ACT.USE_RE.test(k)) E.push(`activities/_parts/${k}.json: the name is lower-case letters, digits and - (at most 61)`);
          else if (!isObj(d)) E.push(`activities/_parts/${k}.json must be a part {engine, model, outputs, inputs?}`);
          else unknownKeys(d, ACT.PART_KEYS.filter(x => x !== 'id' && x !== 'use' && x !== 'with'), `activities/_parts/${k}.json`, E);
        }
      }
      for (const a of (reg && Array.isArray(reg.items) ? reg.items : [])) {
        const aid = a && typeof a === 'object' ? a.id : null;
        if (typeof aid !== 'string' || !ACT.ID_RE.test(aid)) { E.push(`activity ${qv(aid)}: id must be lower-case letters, digits and - (2–61)`); continue; }
        if (Object.prototype.hasOwnProperty.call(items, aid)) { E.push(`activity ${aid}: duplicate id`); continue; }
        items[aid] = a; const w = `activity ${aid}`, rt = a.runtime;
        if (Object.prototype.hasOwnProperty.call(ACT.LATER, rt)) E.push(`${w}: runtime ${rt} arrives in a later version of the app (${ACT.LATER[rt]}); use html-app@1, sim-spec@1, py-module@1 or h5p@1 for now`);
        else if (!ACT.RUNTIMES.has(rt)) E.push(`${w}: unknown runtime ${qv(rt)} (one of ${[...ACT.RUNTIMES].sort().join(', ')})`);
        if (!(Number.isInteger(a.stateVersion) && a.stateVersion >= 1)) E.push(`${w}: stateVersion must be a whole number >= 1`);
        if (rt !== 'html-app@1' && a.engines != null) E.push(`${w}: engines: only an html-app@1 item lists engines (a sim-spec@1 spec names its engine in spec.engine)`);
        const caps = a.capabilities ?? [];
        if (!Array.isArray(caps) || caps.some(c => !ACT.CAPS.has(c))) E.push(`${w}: capabilities must be some of ${[...ACT.CAPS].sort().join(', ')}`);
        const fb = a.fallback && typeof a.fallback === 'object' ? a.fallback : {};
        if (!(isStr(fb.text) && fb.text.trim().length >= ACT.FALLBACK_MIN)) E.push(`${w}: fallback.text (>= ${ACT.FALLBACK_MIN} characters: what the activity shows and teaches) is required`);
        if (!isStr(fb.media)) E.push(`${w}: fallback.media (a still picture in media/) is required`);
        else if (!media[fb.media]) E.push(`${w}: fallback.media ${qv(fb.media)} is not a picture of the pack`);
        if (rt === 'html-app@1') {
          if (typeof a.html !== 'string') E.push(`${w}: the bundle (html) is missing`);
          else {
            const l = lintHtml(a.html); E.push(...l.errors.map(m => `${w}: ${m}`)); W.push(...l.warnings.map(m => `${w}: ${m}`));
            if (a.sha256 != null && (!/^[0-9a-f]{64}$/.test(String(a.sha256)) || (nodeSha && nodeSha(a.html) !== a.sha256))) E.push(`${w}: sha256 does not match the bundle`);
            if (a.bytes != null && a.bytes !== utf8(a.html)) E.push(`${w}: bytes does not match the bundle`);
          }
          E.push(...checkAppEngines(a).map(m => `${w}: ${m}`));
        } else if (rt === 'sim-spec@1') {
          if (!('spec' in a)) E.push(`${w}: the spec (activities/${aid}/spec.json) is missing`);
          else E.push(...checkSimSpec(a.spec, isObj(a.strings) ? a.strings : null, null, { items: every, parts: partLib }).map(m => `${w}: ${m}`));
        } else if (rt === ACT.PY) {
          const pk = a.packages == null ? [] : a.packages, allowed = [...ACT.PY_BASE, ...ACT.PY_EXTRAS];
          if (!(Array.isArray(pk) && pk.length <= ACT.PY_PACKAGES_MAX && pk.every(x => typeof x === 'string'))) E.push(`${w}: packages must be a list of names (${allowed.join(', ')})`);
          else {
            for (const x of pk) if (!allowed.includes(x)) E.push(`${w}: package ${qv(x)} is not available (numpy, scipy and the allow-listed extras: ${ACT.PY_EXTRAS.join(', ')})`);
            if (new Set(pk).size !== pk.length) E.push(`${w}: packages lists a name twice`);
            if (pk.some(x => ACT.PY_EXTRAS.includes(x)) && a.requiresNetwork !== true) E.push(`${w}: an extra package (${pk.filter(x => ACT.PY_EXTRAS.includes(x)).join(', ')}) is downloaded the first time: set "requiresNetwork": true`);
          }
          if (a.requiresNetwork != null && typeof a.requiresNetwork !== 'boolean') E.push(`${w}: requiresNetwork must be true or false`);
          if (a.stepMs != null && !(Number.isInteger(a.stepMs) && a.stepMs >= ACT.PY_STEP[0] && a.stepMs <= ACT.PY_STEP[1])) E.push(`${w}: stepMs is a whole number ${ACT.PY_STEP[0]}–${ACT.PY_STEP[1]} (the budget of one step(), in ms)`);
          if (typeof a.python !== 'string') E.push(`${w}: the Python file (activities/${aid}/main.py) is missing`);
          else {
            const l = lintPython(a.python, Array.isArray(pk) ? pk : []); E.push(...l.errors.map(m => `${w}: ${m}`)); W.push(...l.warnings.map(m => `${w}: ${m}`));
            if (a.sha256 != null && (!/^[0-9a-f]{64}$/.test(String(a.sha256)) || (nodeSha && nodeSha(a.python) !== a.sha256))) E.push(`${w}: sha256 does not match the Python file`);
            if (a.bytes != null && a.bytes !== utf8(a.python)) E.push(`${w}: bytes does not match the Python file`);
          }
          if (!('spec' in a)) E.push(`${w}: the spec (activities/${aid}/spec.json: the controls, readouts and plots the app draws) is missing`);
          else E.push(...checkSimSpec(a.spec, isObj(a.strings) ? a.strings : null, null, { python: true }).map(m => `${w}: ${m}`));
        } else if (rt === ACT.WASM) {   // the module (size, sha256, imports, memory, exports) and its own spec, if it has one
          if (!WK()) E.push(`${w}: the WebAssembly checker (NoemaWasm, engine/src/44_activity_wasm.js) is not loaded here`);
          else E.push(...WK().checkItem(a).problems.map(m => `${w}: ${m}`));
          const sp = a.spec;
          if (sp !== undefined && sp !== null) {
            if (isObj(sp) && ('engine' in sp ? sp.engine : ACT.WASM_ENGINE) !== ACT.WASM_ENGINE) E.push(`${w}: spec.engine: the own spec of a ${ACT.WASM} item runs on ${ACT.WASM_ENGINE} (leave engine out)`);
            if (isObj(sp) && isObj(sp.model) && (sp.model.module !== undefined ? sp.model.module : aid) !== aid) E.push(`${w}: spec.model.module: the own spec of a ${ACT.WASM} item runs this item (leave module out)`);
            E.push(...checkSimSpec(ownSpec(a), isObj(a.strings) ? a.strings : null, null, { items: every }).map(m => `${w}: ${m}`));
          }
        } else if (rt === ACT.EMBED) {   // an allow-listed outside page: the provider, the exact URL, credit and licence (tools/embed_allow.json)
          if (!EK()) E.push(`${w}: the outside-page checker (NoemaEmbed, engine/src/45_activity_embed.js) is not loaded here`);
          else { const r = EK().check(a); E.push(...r.errors.map(m => `${w}: ${m}`)); W.push(...r.warnings.map(m => `${w}: ${m}`)); }
        } else if (rt === ACT.H5P) E.push(...checkH5PItem(a, aid, locs, own).map(m => `${w}: ${m}`));
        const st = a.strings;
        if (rt === ACT.H5P && (st == null || (isObj(st) && !Object.keys(st).length))) { /* an H5P item keeps its words in content.json (h5pByLocale for the other languages) */ }
        else if (!st || typeof st !== 'object' || Array.isArray(st) || !Object.keys(st).length) E.push(`${w}: strings {locale: {key: text}} are required (an activity shows no words of its own)`);
        else {
          let keys = null;
          for (const [loc, tab] of Object.entries(st)) {
            if (!LOCALE_RE.test(loc)) { E.push(`${w}: strings: ${qv(loc)} is not a locale`); continue; }
            if (!tab || typeof tab !== 'object' || Array.isArray(tab) || !Object.entries(tab).every(([k, v]) => ACT.KEY_RE.test(k) && isStr(v))) { E.push(`${w}: strings.${loc} must map keys (a-z, digits, . _ -) to non-empty texts`); continue; }
            const ks = new Set(Object.keys(tab));
            if (!keys) keys = [loc, ks];
            else { const d = [...keys[1]].filter(k => !ks.has(k)).concat([...ks].filter(k => !keys[1].has(k))).sort().slice(0, 5); if (d.length) E.push(`${w}: strings.${loc} and strings.${keys[0]} have different keys (${d.join(', ')})`); }
          }
          for (const loc of locs) if (!st[loc]) E.push(`${w}: strings for ${loc} are missing (the pack is read in ${locs.join(', ')})`);
        }
        for (const k of ['origin', 'credit', 'license']) if (k in a && typeof a[k] !== 'string') E.push(`${w}: ${k} must be a text`);
      }
    }
    const used = new Set();
    for (const c of p?.chapters || []) {
      for (const sec of c.sections || []) (sec.blocks || []).forEach((b, i) => { if (b?.t !== 'interactive') return; used.add(b.activity); E.push(...checkBlockAct(b, items).map(m => `${sec.id} block ${i}: ${m}`)); });
      for (const e of c.exercises || []) { if (e?.type !== 'sim') continue; used.add(e.activity); E.push(...checkSim(e, items).map(m => `${e.id}: ${m}`)); }
    }
    for (const a of Object.values(items)) {   // a module item that a wasm@1 spec runs is used by that spec's blocks and exercises
      const sp = a && a.runtime === 'sim-spec@1' ? a.spec : null;
      if (isObj(sp) && sp.engine === ACT.WASM_ENGINE && isObj(sp.model) && Object.prototype.hasOwnProperty.call(items, sp.model.module)) used.add(sp.model.module);
    }
    for (const aid of Object.keys(items)) if (!used.has(aid)) W.push(`activity ${aid}: not used by any interactive block or sim exercise`);
    if (Object.keys(items).length) {
      const req = Array.isArray(p.requires) ? p.requires : [];
      const need = needRequires(Object.values(items), partLib);
      const miss = need.filter(x => !req.includes(x)); if (miss.length) E.push(`pack.requires must list ${miss.join(', ')} (make_pack.py writes it)`);
    }
    return { errors: E, warnings: W };
  }

  /** checkPack(p, expectId, { strict, balance, requireQuality }) → { errors, warnings, counts }. The pack's shape is its
      contract (noema.pack.v3; strict: every chapter's too, noema.chapter.v1#chapter, and every exercise's); then what a
      schema cannot say: unique ids, sections and pictures that exist, the quantity and quality rules, the languages,
      the activities.
      balance: the minimum of RULES per chapter. Default: the pack's own subject.authoring.minPerKind (Gemini generator);
      a pack that does not say gets the issues as warnings; 0 = off. A number → errors.
      quality (QUALITY, packs with subject.authoring.rules >= 2): errors when subject.authoring.by is claude or gemini, else warnings.
      requireQuality (the connector): a pack built since QUALITY.since (or with no builtAt) must have authoring.rules >= 2. */
  function checkPack(p, expectId, { strict = false, balance, requireQuality = false } = {}) {
    const W = [];
    if (!isObj(p)) return { errors: ['not a JSON object'], warnings: W, counts: {} };
    const E = shapeOf('noema.pack.v3', p);
    const s = isObj(p.subject) ? p.subject : {};
    if (expectId && s.id !== expectId) E.push(`subject.id is "${s.id}" but you uploaded it as "${expectId}"`);
    const media = isObj(p.media) ? p.media : {};
    for (const [mid, m] of Object.entries(media)) if (isObj(m) && !m.alt) W.push(`media ${mid}: no alt text`);
    const srcIds = new Set();
    for (const x of (Array.isArray(p.sources?.sources) ? p.sources.sources : []).filter(isObj)) {   // sources whose original file travels in the package (make_pack.py)
      if (srcIds.has(x.id)) E.push(`duplicate source ${x.id}`); srcIds.add(x.id);
    }
    const chapters = Array.isArray(p.chapters) ? p.chapters.filter(isObj) : [];
    for (const c of chapters) for (const r of (Array.isArray(c.sources) ? c.sources : [])) if (r && r.id && srcIds.size && !srcIds.has(r.id)) W.push(`${c.id}: cites unknown source "${r.id}"`);
    const exIds = new Set(), secIds = new Set(); let ex = 0, vis = 0, secN = 0;
    const used = {};
    for (const c of chapters) {
      // strict: the chapter's own contract (its exercises are checked one by one below, with what their contract cannot say)
      if (strict) E.push(...shapeOf('noema.chapter.v1#chapter', { ...c, exercises: [] }, c.id));
      const mySecs = new Set();
      for (const sec of (Array.isArray(c.sections) ? c.sections : []).filter(isObj)) {
        secN++; if (secIds.has(sec.id)) E.push(`duplicate section ${sec.id}`); secIds.add(sec.id); mySecs.add(sec.id);
        for (const b of (Array.isArray(sec.blocks) ? sec.blocks : []).filter(isObj)) if (b.t === 'figure' && !media[b.media]) E.push(`${sec.id}: figure media "${b.media}" not in pack.media`);
      }
      for (const e of (Array.isArray(c.exercises) ? c.exercises : []).filter(isObj)) {
        ex++;
        if (exIds.has(e.id)) E.push(`duplicate exercise ${e.id}`); exIds.add(e.id);
        if (!TYPES.has(e.type)) continue;   // the contract says so
        if (!secIds.has(e.section) || (strict && !mySecs.has(e.section))) E.push(`${e.id}: section ${e.section} not found in its chapter`);
        if (String(e.type).startsWith('img_')) {
          vis++; used[e.media] = (used[e.media] || 0) + 1;
          const m = media[e.media]; if (!m) { E.push(`${e.id}: media "${e.media}" not in pack.media`); continue; }
          const regs = Array.isArray(e.regions) ? e.regions : (m.regions || []); const R = new Set(regs.map(r => r && r.id));
          for (const a of [].concat(e.type === 'img_hotspot' || e.type === 'img_sequence' ? e.answer || [] : [], e.targets || [])) if (!R.has(a)) E.push(`${e.id}: region "${a}" not found`);
        }
        if (strict) E.push(...checkExercise(e, media));
      }
    }
    const auth = s.authoring || {}, qual = Number(auth.rules) >= QUALITY.version;
    if (requireQuality && !qual && (!p.builtAt || p.builtAt >= QUALITY.since)) E.push(`subject.authoring.rules must be ${QUALITY.version} (and authoring.by "claude"): new packs meet the quality rules of tools/pack_rules.json — start the subject with start_subject.py and rebuild with make_pack.py`);
    if (qual) {
      const hard = ['claude', 'gemini'].includes(auth.by);
      for (const c of chapters) for (const i of checkQuality(c, s)) (i.level === 'error' && hard ? E : W).push(i.msg);
    } else {
      const per = balance ?? auth.minPerKind;
      if (per !== 0) for (const c of chapters) for (const i of checkBalance(c, s, { min: per ?? undefined })) (per ? E : W).push(i.msg);
    }
    checkI18n(p, chapters, E, W);
    { const A = checkActivities(p); E.push(...A.errors); W.push(...A.warnings); }
    for (const mid of Object.keys(media)) if ((used[mid] || 0) < 3) W.push(`picture ${mid} has ${used[mid] || 0} exercises (aim for >= 3)`);
    return { errors: E, warnings: W, counts: { chapters: chapters.length, sections: secN, exercises: ex, visual: vis, media: Object.keys(media).length } };
  }

  /* ---------- language bridges (docs/BRIDGE.md): a sidecar dictionary for one pack and one native language ---------- */
  const POS = new Set(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV', 'NUM', 'X', 'SYM', 'INTJ', 'PHRASE']);
  const FUNCTION_POS = new Set(['DET', 'ADP', 'CCONJ', 'SCONJ', 'PRON', 'AUX', 'PART']);
  const BRIDGE_MAX = 3 * 1024 * 1024;
  /** checkBridge(b, pack?) → { errors, warnings, counts }. Its shape is its contract (noema.bridge.v1: the fields, plain
      text, the lengths); then its size, its words (no function words, each once), what its sections and anchors name
      and, with the pack, that it belongs to it and reads one of its languages. */
  function checkBridge(b, pack) {
    const W = [];
    if (!isObj(b)) return { errors: ['not a JSON object'], warnings: W, counts: {} };
    const E = shapeOf('noema.bridge.v1', b);
    let size = 0; try { size = JSON.stringify(b).length; } catch (e) { E.push('not serialisable'); }
    if (size > BRIDGE_MAX) E.push(`too big (${Math.round(size / 1024)} KB, at most ${BRIDGE_MAX / 1024} KB)`);
    if (b.source && b.native && String(b.source).split('-')[0] === String(b.native).split('-')[0]) E.push('native must differ from source');
    const entries = (Array.isArray(b.entries) ? b.entries : []).filter(isObj);
    const keys = new Map(); let senses = 0, stale = 0;
    entries.forEach((e, n) => {
      if (!isStr(e.k)) return;
      const at = `entries[${n}] "${e.k}"`;
      if (keys.has(e.k)) E.push(`${at}: k appears twice`);
      if (e.pos != null && FUNCTION_POS.has(e.pos)) E.push(`${at}: ${e.pos} — function words (articles, prepositions, conjunctions, pronouns, auxiliaries, particles) are not part of a bridge`);
      else if (e.pos != null && !POS.has(e.pos)) W.push(`${at}: unknown pos "${e.pos}" (Universal Dependencies: NOUN, PROPN, VERB, ADJ, ADV, NUM, X, SYM, INTJ, or PHRASE)`);
      const ids = new Set();
      (Array.isArray(e.senses) ? e.senses : []).filter(isObj).forEach((x, q) => {
        if (ids.has(String(x.id))) E.push(`${at} sense ${q + 1}: id "${x.id}" twice`); else ids.add(String(x.id));
        if (x.st === 'stale') stale++; senses++;
      });
      keys.set(e.k, ids);
    });
    const secIds = pack ? new Set((pack.chapters || []).flatMap(c => (c.sections || []).map(s => s.id))) : null;
    const secs = isObj(b.sections) ? b.sections : {};
    let previews = 0;
    for (const [sid, v] of Object.entries(secs)) {
      if (secIds && !secIds.has(sid)) W.push(`sections.${sid}: no such section in the pack`);
      if (!isObj(v)) continue;
      for (const k of Array.isArray(v.terms) ? v.terms : []) if (!keys.has(k)) E.push(`sections.${sid}.terms: "${k}" is not an entry`);
      if (isStr(v.preview)) previews++;
    }
    const anchors = (Array.isArray(b.anchors) ? b.anchors : []).filter(isObj);
    anchors.forEach((a, n) => {
      const at = `anchors[${n}]`;
      if (secIds && typeof a.at === 'string' && a.at.includes('/') && !secIds.has(a.at.split('/')[0])) W.push(`${at}: section ${a.at.split('/')[0]} is not in the pack`);
      if (!keys.has(a.k)) E.push(`${at}: k "${a.k}" is not an entry`);
      else if (!keys.get(a.k).has(String(a.sense))) E.push(`${at}: entry "${a.k}" has no sense "${a.sense}"`);
    });
    if (pack) {
      if (pack.subject?.id && b.pack && pack.subject.id !== b.pack) E.push(`pack: "${b.pack}" — this bridge belongs to another subject (this one is "${pack.subject.id}")`);
      // the source is the language the learner reads: the pack's own, or one of its translations (docs/BRIDGE.md §2.4)
      const own = pack.subject?.language || 'en', offered = [own, ...Object.keys(pack.translations || {})].map(lang0);
      if (b.source && !offered.includes(lang0(b.source))) E.push(`source: "${b.source}" — the pack is written in "${own}"${offered.length > 1 ? ` and translated into ${offered.slice(1).join(', ')}` : ''}; a bridge from a translation needs that translation saved first`);
    }
    if (!entries.length) W.push('no entries yet');
    return { errors: E, warnings: W, counts: { entries: entries.length, senses, stale, sections: Object.keys(secs).length, previews, anchors: anchors.length } };
  }
  /* i18n-ignore-end */
  root.NoemaPackCheck = { checkPack, checkActivities, checkActivityPackages, checkSimSpec, partsPlan, resolveParts, partSpec, partMsg, freeVars, ownSpec, specNames, needRequires, enginesNamed, lintHtml, lintPython, ACTIVITY_RULES: ACT, checkExercise, checkBalance, checkQuality, checkBridge, checkTranslation, requiredLocales, RULES, QUALITY, LANGS, TYPES, BLOCKS, ID_RE };
})(typeof window !== 'undefined' ? window : globalThis);
