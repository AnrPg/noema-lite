/* noema-lite — pack checks shared by the app (in-browser generators) and the Claude connector (cloud/mcp).
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
  const LANGS = {"version": 1, "translations": ["en", "el", "ru"], "bridges": ["en", "el", "ru", "ar"], "bridgesFrom": ["own", "translations"], "bridgeCoverage": {"everyday": 0.8, "all": 0.9}, "since": "2026-10-22T00:00:00Z", "what": "Every pack with subject.authoring.rules >= 2 ends its flow with a full translation into each of 'translations' (minus its own language) and a 文A bridge for every pair (content language → native language): the content language is the pack's own language AND each of its translations ('bridgesFrom'), the native language each of 'bridges' that is not that content language (user rules 2026-10-21 and 2026-10-22: an en pack translated into el and ru gets en→el, en→ru, en→ar, el→en, el→ru, el→ar, ru→en, ru→el, ru→ar). A translation's bridges are made after the translation, from its text. A translation is its own file (noema-translation, <id>.tr.<locale>.json; docs/i18n.md §10) with the pack's ids, structure and answers, plus the subject's name in that language (subject.i18n.<locale>: title, description, hero, ...). A bridge covers >= bridgeCoverage.all of the content words of the theory and >= bridgeCoverage.everyday of the everyday ones (band 1, and every word no entry covers yet). Checked at the end of the flow (tools/pipeline.py steps translate and bridges; noema_finish_upload lists what is missing), never on the first upload."};
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
      case 'flaw': if (!strs(e.lines, 3) || !Array.isArray(e.flaws) || !e.flaws.length || !e.flaws.every(b => intIn(b, e.lines.length))) bad('"lines" (≥ 3) and "flaws" (line indexes) needed');
        if (!strs(e.reasons, 2) || !intIn(e.reason, (e.reasons || []).length)) bad('"reasons" (≥ 2 texts) and "reason" (the index of the right one) needed');
        break;
      case 'case': if (!Array.isArray(e.parts) || e.parts.length < 2 || e.parts.length > 4) { bad('"parts": 2–4 questions [{q, type: mcq|tf|calc, …}]'); break; }
        e.parts.forEach((p, i) => { if (!p || !['mcq', 'tf', 'calc'].includes(p.type)) bad(`part ${i + 1}: "type" must be mcq, tf or calc`); else checkExercise({ ...p, id: `${e.id} part ${i + 1}` }, media).forEach(m => E.push(m)); });
        break;
      case 'predict': if (!isStr(e.outcome)) bad('"outcome" (what actually happens) needed');
        if (Array.isArray(e.options)) { if (!strs(e.options, 2) || !intIn(e.answer, e.options.length)) bad('"options" and "answer" (an option index) needed'); }
        else if (typeof e.answer !== 'number' || !isFinite(e.answer)) bad('"options" + "answer", or a numeric "answer" (with "tolerance", "unit")');
        break;
      case 'tree': {
        const N = e.nodes && typeof e.nodes === 'object' ? e.nodes : null; if (!N || !Object.keys(N).length) { bad('"nodes" {id: {q, options}} and "start" needed'); break; }
        if (!(e.start in N)) bad('"start" must name a node');
        for (const [id, n] of Object.entries(N)) {
          if (!isStr(n?.q) || !Array.isArray(n.options) || n.options.length < 2 || n.options.filter(o => o.ok === true).length !== 1 || !n.options.every(o => isStr(o.text) && (o.ok || isStr(o.fb)))) bad(`node "${id}": q and options [{text, ok, fb}], exactly one ok, every wrong one with fb`);
          for (const o of n?.options || []) if (o.to != null && !(o.to in N)) bad(`node "${id}": "to" names no node (${o.to})`);
        }
        const seen = new Set(); let at = e.start;   // the right path ends without a loop
        while (at in N && !seen.has(at)) { seen.add(at); at = (N[at].options || []).find(o => o.ok)?.to; }
        if (at != null) bad('the right path of the tree loops or leads nowhere');
        break;
      }
      case 'inquiry': if (!strs(e.options, 3) || !Array.isArray(e.scores) || e.scores.length !== e.options.length || !e.scores.every(v => intIn(v, 4))) bad('"options" (≥ 3) and "scores" (0–3, one per option) needed');
        else if (e.scores.filter(v => v === Math.max(...e.scores)).length !== 1) bad('exactly one option has the highest score');
        if (!Array.isArray(e.why) || e.why.length !== (e.options || []).length) bad('"why": one text per option');
        break;
      case 'sim': break;   // its own fields need the pack's activities: checkActivities
      case 'debate': if (!Array.isArray(e.sides) || e.sides.length < 2 || e.sides.length > 3 || !e.sides.every(sd => isStr(sd?.position) && strs(sd.counters, 2) && intIn(sd.best, sd.counters.length) && (!sd.why || (Array.isArray(sd.why) && sd.why.length === sd.counters.length)))) bad('"sides": 2–3 of {position, counters (≥ 2), best (index), why (one per counter)}'); break;
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
    e.type === 'bucket' ? (e.items || []).map(x => x && x.bucket) : null, e.type === 'scenario' ? (e.steps || []).map(st => (st.options || []).map(o => !!o.ok)) : null,
    // the thinking types (flaw, case, predict, tree, inquiry, debate): what decides their answer
    e.type === 'flaw' ? [e.flaws ?? null, e.reason ?? null, (e.reasons || []).length] : null,
    e.type === 'case' ? (e.parts || []).map(p => p && [p.type, p.answer ?? null, (p.options || []).length, p.tolerance ?? null]) : null,
    e.type === 'tree' ? [e.start ?? null, Object.entries(e.nodes || {}).map(([k, n]) => [k, (n?.options || []).map(o => [!!o?.ok, o?.to ?? null])])] : null,
    e.type === 'inquiry' ? e.scores ?? null : null, e.type === 'debate' ? (e.sides || []).map(x => x && [x.best ?? null, (x.counters || []).length]) : null,
    e.type === 'sim' ? [e.activity ?? null, JSON.stringify(e.task ?? null), JSON.stringify(e.grade ?? null), (e.hints || []).length] : null,
    e.tolerance ?? null]);
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
      if (!(s.i18n && s.i18n[loc])) W.push(`${where}: add subject.i18n.${loc} (title, description) so the picker shows the translated name`);
      if (t && t.file === true) { if (!Number.isInteger(t.chapters) || t.chapters < 1) E.push(`${where}: a translation in its own file says {"file": true, "chapters": <how many chapters it translates>}`); continue; }
      if (!t || !Array.isArray(t.chapters)) { E.push(`${where}.chapters must be a list of chapters (or {"file": true, …} for a translation in its own file)`); continue; }
      checkTrChapters(where, t.chapters, byId, E);
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
  /** checkTranslation(t, pack) → { errors, warnings, counts }: one noema-translation file (docs/i18n.md §10) against its pack. */
  function checkTranslation(t, pack) {
    const E = [], W = [];
    if (!t || typeof t !== 'object' || Array.isArray(t)) return { errors: ['not a JSON object'], warnings: W, counts: {} };
    if (t.format !== 'noema-translation') E.push('format must be "noema-translation"');
    if (t.v !== 1) E.push('v must be 1');
    if (!ID_RE.test(String(t.pack || ''))) E.push('pack: the subject id the translation belongs to (pack.subject.id)');
    if (!LOCALE_RE.test(String(t.locale || ''))) E.push('locale: the language of the translation (e.g. el, ru, pt-PT)');
    if (!Array.isArray(t.chapters) || !t.chapters.length) E.push('chapters must be a non-empty list of translated chapters');
    if (pack) {
      const own = pack.subject?.language || 'en';
      if (pack.subject?.id && t.pack && pack.subject.id !== t.pack) E.push(`pack: "${t.pack}" — this translation belongs to another subject (this one is "${pack.subject.id}")`);
      if (t.locale && lang0(t.locale) === lang0(own)) E.push(`locale: "${t.locale}" is the pack's own language`);
      if (Array.isArray(t.chapters)) {
        checkTrChapters(`translation ${t.locale}`, t.chapters, new Map((pack.chapters || []).map(c => [c.id, c])), E);
        const have = new Set(t.chapters.map(c => c && c.id)), miss = (pack.chapters || []).filter(c => !have.has(c.id)).map(c => c.id);
        if (miss.length) W.push(`chapters not translated yet: ${miss.join(', ')}`);
      }
      if (t.version && pack.version && t.version !== pack.version) W.push(`made for pack version ${t.version}; the pack is now ${pack.version} — check the chapters that changed`);
    }
    // the subject's name in this language (subject.i18n.<locale>): optional in the file, merged into the pack when it is saved
    if (t.subject != null) {
      const m = t.subject, src = pack?.subject || null;
      if (!m || typeof m !== 'object' || Array.isArray(m)) E.push('subject must be an object {title, appTitle, description, searchExamples, hero, tutor} in the translation\'s language');
      else for (const [k, v] of Object.entries(m)) {
        if (I18N_TEXT.includes(k)) { if (!isStr(v)) E.push(`subject.${k} must be a non-empty string`); }
        else if (I18N_OBJ.includes(k)) { if (!v || typeof v !== 'object' || Object.values(v).some(x => typeof x !== 'string')) E.push(`subject.${k} must be an object of strings like the pack's subject.${k}`); else if (src && src[k]) for (const f of Object.keys(v)) if (!(f in src[k])) E.push(`subject.${k}.${f}: the pack's subject.${k} has no "${f}"`); }
        else E.push(`subject.${k}: unknown field (allowed: ${[...I18N_TEXT, ...I18N_OBJ].join(', ')})`);
      }
    } else if (pack && !(pack.subject?.i18n?.[t.locale]?.title)) W.push(`no subject name in ${t.locale}: add "subject": {"title", "description", "hero", …} in ${t.locale} so the picker, the subject's home and the Roadmap show it translated`);
    for (const c of Array.isArray(t.chapters) ? t.chapters : []) { let j = ''; try { j = JSON.stringify(c); } catch (e) { } if (/<script|javascript:/i.test(j)) E.push(`translation ${t.locale}/${c && c.id}: no script or javascript: links`); }
    return { errors: E, warnings: W, counts: { chapters: Array.isArray(t.chapters) ? t.chapters.length : 0 } };
  }

  /** balance: the minimum of RULES per chapter. Default: the pack's own subject.authoring.minPerKind (Gemini generator);
      a pack that does not say gets the issues as warnings; 0 = off. A number → errors.
      quality (QUALITY, packs with subject.authoring.rules >= 2): errors when subject.authoring.by is claude or gemini, else warnings.
      requireQuality (the connector): a pack built since QUALITY.since (or with no builtAt) must have authoring.rules >= 2. */

  /* ---------- interactive activities (docs/INTERACTIVE.md): the SAME rules as tools/activities.py (tests/activities.js) ---------- */
  const ACT = {
    FORMAT: 'noema.activities/v1', ID_RE: /^[a-z0-9][a-z0-9-]{1,60}$/, KEY_RE: /^[a-z][a-zA-Z0-9_.-]{0,63}$/,
    RUNTIMES: new Set(['html-app@1', 'sim-spec@1']), LATER: { 'py-module@1': 'P4', 'h5p@1': 'P4b' },
    CAPS: new Set(['state', 'events', 'resize', 'result', 'hints', 'announce']), GRADE_MODES: new Set(['reported', 'checks']),
    CHECKS_RUNTIMES: new Set(['sim-spec@1']),   // runtimes whose values the app can see (the checks grader needs them)
    // sim-spec@1 (docs/INTERACTIVE.md §12): the SAME rules as tools/activities.py check_spec
    SPEC_FORMAT: 'noema.sim-spec/v1', DEFAULT_ENGINE: 'formula@1', ENGINES: new Set(['formula@1', 'circuit-mna@1']),   // the same list in tools/activities.py
    SPEC_KEYS: new Set(['format', 'engine', 'model', 'title', 'intro', 'consts', 'params', 'derived', 'outputs', 'readouts', 'plots', 'bench']),
    // circuit-mna@1 (docs/INTERACTIVE_CIRCUIT.md): the model, the outputs it can compute, the fault-finding bench (docs/INTERACTIVE.md §12.7)
    CIRCUIT: 'circuit-mna@1', BENCH_ENGINES: new Set(['circuit-mna@1']), BENCH_NAMES: ['diagnosis', 'measurements', 'correct'],
    MODEL_KEYS: ['netlist', 'bindings', 'transient', 'noise'], OUT_KEYS: ['id', 'kind', 'node', 'branch', 'time', 'probe', 'at', 'stat'], STATS: ['final', 'min', 'max', 'mean', 'pp', 'rms'],
    WAVES: { pulse: ['v1', 'v2', 'delay', 'rise', 'fall', 'width', 'period'], sine: ['offset', 'amp', 'freq', 'phase', 'delay'], pwm: ['v', 'freq', 'duty', 'low', 'delay'] },
    BENCH_KEYS: ['faults', 'points', 'instruments', 'diagnosis', 'budget'], INSTRUMENTS: ['V', 'I', 'R', 'scope', 'logic'],
    INST_KEYS: ['kind', 'points', 'parts', 'tEnd', 'dt', 'tStart', 'threshold'], BENCH_ID_RE: /^[A-Za-z][A-Za-z0-9_-]{0,31}$/,
    BENCH_LIM: { faults: 16, apply: 4, points: 24, instruments: 5, parts: 24, options: 12, budget: 100, bindings: 24, steps: 200000 },
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
  const specOf = a => !a ? null : a.runtime === 'sim-spec@1' ? (specObj(a.spec) ? a.spec : null) : a.runtime === ACT.WASM ? (specObj(a.spec) ? ownSpec(a) : null) : null;
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
  /* ---------- sim-spec@1 (docs/INTERACTIVE.md §12): every expression through NoemaExpr (engine/src/35_simexpr.js, loaded beside this file) ---------- */
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && isFinite(v);
  const list = v => Array.isArray(v) ? v : [];
  const NX = () => root.NoemaExpr || null;
  /** null, or the first problem of an expression (names null = not checked) */
  function exprProblem(src, names, where) {
    if (typeof src !== 'string' || !src.trim()) return `${where}: an expression (a text such as “2*x + 1”) is required`;
    if (!NX()) return `${where}: the expression checker (NoemaExpr, engine/src/35_simexpr.js) is not loaded here`;
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
    if (isObj(spec.bench)) out.push(...ACT.BENCH_NAMES);   // a bench's values: for the checks of a sim exercise only (never shown)
    return out;
  }
  /* ---------- circuit-mna@1: the model, the outputs, the bench — the SAME rules as tools/activities.py check_circuit / check_bench ---------- */
  const CK = () => root.NoemaCircuit || null;   // engine/src/36_engine_circuit.js, loaded beside this file (its check and checkFaults)
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
    if (p.kind === 'V' || p.kind === 'R') return endpointOk(c, p.a) && (p.b === undefined || endpointOk(c, p.b));
    if (p.kind === 'I') { const e = typeof p.element === 'string' ? c.els.get(p.element) : null; return !!e && (p.pin === undefined || (Number.isInteger(p.pin) && p.pin >= 0 && p.pin < e.n.length)); }
    return false;
  }
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
    if (!CK()) { E.push('spec.model: the circuit checker (NoemaCircuit, engine/src/36_engine_circuit.js) is not loaded here'); return; }
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
    list(spec.outputs).forEach((o, i) => {
      const w = `spec.outputs[${i}]`;
      if (!(isObj(o) && (o.kind === 'scalar' || o.kind === 'series'))) return;   // (reported with the outputs)
      unknownKeys(o, ACT.OUT_KEYS, w, E);
      const src = ['node', 'branch', 'time', 'probe'].filter(k => k in o);
      if (src.length !== 1) { E.push(`${w} must name what it reads: one of node, branch, time, probe`); return; }
      const s = src[0];
      if (s === 'time' && !(o.time === true && o.kind === 'series')) E.push(`${w}.time is true on a series output (the time axis of the transient)`);
      if (s === 'node' && !(typeof o.node === 'string' && (c.nodes.has(o.node) || isGnd(o.node)))) E.push(`${w}.node is not a node of the netlist`);
      if (s === 'branch' && !(typeof o.branch === 'string' && c.els.has(o.branch))) E.push(`${w}.branch is not a part of the netlist`);
      if (s === 'probe' && !(o.kind === 'scalar' && probeOk(c, o.probe))) E.push(`${w}.probe must be a reading {kind: V | I | R, a, b? | element, pin?} on a scalar output`);
      const at = 'at' in o, st = 'stat' in o;
      if ((at || st) && !(o.kind === 'scalar' && (s === 'node' || s === 'branch'))) E.push(`${w}: at and stat belong to a scalar output of a node or a branch`);
      if (at && st) E.push(`${w}: at or stat, not both`);
      if (at) numOrExpr(o.at, names, w + '.at', E, false);
      if (st && !ACT.STATS.includes(o.stat)) E.push(`${w}.stat is one of ${ACT.STATS.join(', ')}`);
      if ((o.kind === 'series' || at || st) && !isObj(m.transient)) E.push(`${w} needs model.transient {tEnd, dt?}`);
    });
  }
  function checkBench(spec, names, seen, E, key) {
    const b = spec.bench, L = ACT.BENCH_LIM, c = circuitOf(spec);
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
      if (!(Array.isArray(f.apply) && f.apply.length <= L.apply)) { E.push(`${w}.apply must be a list of at most ${L.apply} changes to the circuit ([] = a healthy device)`); return; }
      if (c) for (const p of CK().checkFaults(c.nl, f.apply)) E.push(`${w}.${p.path.replace(/^faults/, 'apply')}: ${p.msg}`);
    });
    const ps = b.points;
    if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.points)) E.push(`spec.bench.points must be a list of 1–${L.points} probe points {id, at, label}`);
    const pids = ids(ps, 'spec.bench.points', 'point');
    list(ps).forEach((p, i) => {
      const w = `spec.bench.points[${i}]`;
      if (!isObj(p)) { E.push(`${w} must be an object {id, at, label}`); return; }
      unknownKeys(p, ['id', 'at', 'label'], w, E);
      if (c && !endpointOk(c, p.at)) E.push(`${w}.at must be a node, a test point, gnd or a pin such as @R1.0 of the netlist`);
      key(p.label, w + '.label', true);
    });
    const is = b.instruments, kinds = [];
    if (!(Array.isArray(is) && is.length >= 1 && is.length <= L.instruments)) E.push(`spec.bench.instruments must be a list of 1–${L.instruments} instruments {kind, …}`);
    list(is).forEach((x, i) => {
      const w = `spec.bench.instruments[${i}]`;
      if (!(isObj(x) && ACT.INSTRUMENTS.includes(x.kind))) { E.push(`${w}.kind is one of ${ACT.INSTRUMENTS.join(', ')}`); return; }
      if (kinds.includes(x.kind)) E.push(`${w}: the instrument ${x.kind} is listed twice`);
      kinds.push(x.kind);
      unknownKeys(x, ACT.INST_KEYS, w, E);
      const scope = x.kind === 'scope' || x.kind === 'logic';
      if (x.kind === 'I') {
        if ('points' in x) E.push(`${w}: the ammeter reads parts (parts), not points`);
        const pa = x.parts;
        if (!(Array.isArray(pa) && pa.length >= 1 && pa.length <= L.parts)) E.push(`${w}.parts must be a list of 1–${L.parts} parts {element, label, pin?}`);
        else pa.forEach((q, j) => {
          const wq = `${w}.parts[${j}]`;
          if (!isObj(q)) { E.push(`${wq} must be an object {element, label, pin?}`); return; }
          unknownKeys(q, ['element', 'label', 'pin'], wq, E);
          if (c && !probeOk(c, { kind: 'I', element: q.element, pin: q.pin })) E.push(`${wq}: element must be a part of the netlist (and pin one of its pins)`);
          key(q.label, wq + '.label', true);
        });
      } else {
        if ('parts' in x) E.push(`${w}: only the ammeter (I) reads parts`);
        const pts = x.points;
        if (pts !== undefined && !(Array.isArray(pts) && pts.length >= 1 && pts.every(q => typeof q === 'string' && pids.includes(q)))) E.push(`${w}.points must be ids of spec.bench.points`);
        if ((x.kind === 'V' || x.kind === 'R') && (Array.isArray(pts) ? pts.length : pids.length) < 2) E.push(`${w}: a meter needs two points to put its leads on`);
      }
      for (const k of ['tEnd', 'dt', 'tStart', 'threshold']) if (k in x && !(scope && (k !== 'threshold' || x.kind === 'logic'))) E.push(`${w}.${k} belongs to ${k === 'threshold' ? 'the logic analyser' : 'the oscilloscope and the logic analyser'}`);
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
  /** checkSimSpec(spec, tables?, engines?) → errors of a sim-spec@1 spec. tables: {locale: {key: text}}; engines: the known engine ids
      (default ACT.ENGINES; the app passes the engines it has registered); items: {id: item} of the pack (a wasm@1 model names its
      module there; none = the model is not checked here, the engine's own check does it in the app). The same rules as tools/activities.py check_spec. */
  function checkSimSpec(spec, tables, engines, items) {
    const E = [], L = ACT.SPEC_LIM;
    if (!isObj(spec)) return ['spec: a JSON object is required (activities/<id>/spec.json)'];
    if (utf8(JSON.stringify(spec)) > L.bytes) E.push(`spec: at most ${L.bytes / 1024} KB`);
    if (spec.format !== ACT.SPEC_FORMAT) E.push(`spec: format must be "${ACT.SPEC_FORMAT}"`);
    for (const k of Object.keys(spec).filter(k => !ACT.SPEC_KEYS.has(k)).sort()) E.push(`spec: unknown field ${qv(k)}`);
    const eng = 'engine' in spec ? spec.engine : ACT.DEFAULT_ENGINE, known = engines ? new Set(engines) : ACT.ENGINES;
    if (typeof eng !== 'string' || !known.has(eng)) E.push(`spec: unknown engine ${qv(eng)} (this version knows ${[...known].sort().join(', ')})`);
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
    const ds = spec.derived;
    if (ds != null && !(Array.isArray(ds) && ds.length <= L.derived)) E.push(`spec.derived must be a list of at most ${L.derived} {id, expr}`);
    list(ds).slice(0, L.derived).forEach((d, i) => {
      const w = `spec.derived[${i}]`;
      if (!isObj(d)) { E.push(`${w} must be an object {id, expr}`); return; }
      expr(d.expr, [...names], w + '.expr');
      if (name(d.id, w + '.id')) names.push(d.id);
    });
    const inNames = [...names];   // what an engine's inputs may use: consts, params, derived
    const os = spec.outputs, series = [];
    if (os != null) {
      if (eng === ACT.DEFAULT_ENGINE) E.push('spec.outputs come from an engine; formula@1 has none (use derived)');
      else if (!(Array.isArray(os) && os.length <= L.outputs)) E.push(`spec.outputs must be a list of at most ${L.outputs} {id, kind}`);
      else os.forEach((o, i) => {
        const w = `spec.outputs[${i}]`;
        if (!(isObj(o) && (o.kind === 'scalar' || o.kind === 'series'))) { E.push(`${w} must be {id, kind: scalar | series}`); return; }
        if (name(o.id, w + '.id')) (o.kind === 'scalar' ? names : series).push(o.id);
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
      if (!isObj(p) || !['function', 'series'].includes(p.kind)) { E.push(`${w} must be a plot {kind: function | series, x, y, series}`); return; }
      key(p.title, w + '.title');
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
    if (eng === ACT.WASM_ENGINE && items) { if (!WK()) E.push('spec.model: the WebAssembly checker (NoemaWasm, engine/src/44_activity_wasm.js) is not loaded here'); else E.push(...WK().checkModel(spec, items)); }
    if (spec.bench != null) {
      if (!ACT.BENCH_ENGINES.has(eng)) E.push(`spec.bench needs an engine that can take measurements (${[...ACT.BENCH_ENGINES].sort().join(', ')})`);
      else checkBench(spec, inNames, seen, E, key);
    }
    if (tables && Object.keys(tables).length) for (const k of [...keys].sort()) {
      const miss = Object.keys(tables).filter(l => isObj(tables[l]) && !Object.prototype.hasOwnProperty.call(tables[l], k)).sort();
      if (miss.length) E.push(`spec: the string ${k} is missing in strings.${miss.join(', strings.')}`);
    }
    return E;
  }
  /** what pack.requires must list: the core, each runtime, each engine other than formula@1 */
  function needRequires(items) {
    items = items.filter(isObj); if (!items.length) return [];
    const rts = [...new Set(items.map(a => a.runtime).filter(r => typeof r === 'string'))].sort().map(r => 'runtime:' + r);
    const engs = [...new Set(items.filter(a => (a.runtime === 'sim-spec@1' || a.runtime === ACT.WASM) && isObj(a.spec)).map(a => a.runtime === ACT.WASM ? ACT.WASM_ENGINE : 'engine' in a.spec ? a.spec.engine : ACT.DEFAULT_ENGINE).filter(e => typeof e === 'string' && e !== ACT.DEFAULT_ENGINE))].sort().map(e => 'engine:' + e);
    return ['activities/v1', ...rts, ...engs];
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
      if (g.mode === 'reported' && ACT.CHECKS_RUNTIMES.has(rt)) E.push(`a ${rt} activity reports nothing itself: grade it with {"mode": "checks", "checks": […]}`);
      if (g.mode === 'checks') {
        if (rt != null && !ACT.CHECKS_RUNTIMES.has(rt)) E.push(`grade.mode "checks" needs an activity whose values the app can see (sim-spec@1); ${rt} reports its own result: use "reported"`);
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
            } else if (!Object.prototype.hasOwnProperty.call(consts, k)) E.push(`task.params.${k}: not a constant of the spec (a sim-spec@1 task sets only the spec's consts)`);
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
  function checkActivities(p, translations) {
    const E = [], W = [], reg = p?.activities, media = p?.media || {}, own = p?.subject?.language || 'en';
    const locs = [...new Set([own, ...(translations || Object.keys(p?.translations || {}))])].sort();
    const items = {}, every = {};   // (a wasm@1 spec names a module item)
    for (const x of (reg && Array.isArray(reg.items) ? reg.items : [])) if (x && typeof x === 'object' && typeof x.id === 'string') every[x.id] = x;
    if (reg != null) {
      if (typeof reg !== 'object' || Array.isArray(reg) || reg.format !== ACT.FORMAT) E.push(`activities: format must be "${ACT.FORMAT}"`);
      for (const a of (reg && Array.isArray(reg.items) ? reg.items : [])) {
        const aid = a && typeof a === 'object' ? a.id : null;
        if (typeof aid !== 'string' || !ACT.ID_RE.test(aid)) { E.push(`activity ${qv(aid)}: id must be lower-case letters, digits and - (2–61)`); continue; }
        if (Object.prototype.hasOwnProperty.call(items, aid)) { E.push(`activity ${aid}: duplicate id`); continue; }
        items[aid] = a; const w = `activity ${aid}`, rt = a.runtime;
        if (Object.prototype.hasOwnProperty.call(ACT.LATER, rt)) E.push(`${w}: runtime ${rt} arrives in a later version of the app (${ACT.LATER[rt]}); use html-app@1 or sim-spec@1 for now`);
        else if (!ACT.RUNTIMES.has(rt)) E.push(`${w}: unknown runtime ${qv(rt)} (one of ${[...ACT.RUNTIMES].sort().join(', ')})`);
        if (!(Number.isInteger(a.stateVersion) && a.stateVersion >= 1)) E.push(`${w}: stateVersion must be a whole number >= 1`);
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
        } else if (rt === 'sim-spec@1') {
          if (!('spec' in a)) E.push(`${w}: the spec (activities/${aid}/spec.json) is missing`);
          else E.push(...checkSimSpec(a.spec, isObj(a.strings) ? a.strings : null, null, every).map(m => `${w}: ${m}`));
        } else if (rt === ACT.WASM) {   // the module (size, sha256, imports, memory, exports) and its own spec, if it has one
          if (!WK()) E.push(`${w}: the WebAssembly checker (NoemaWasm, engine/src/44_activity_wasm.js) is not loaded here`);
          else E.push(...WK().checkItem(a).problems.map(m => `${w}: ${m}`));
          const sp = a.spec;
          if (sp !== undefined && sp !== null) {
            if (isObj(sp) && ('engine' in sp ? sp.engine : ACT.WASM_ENGINE) !== ACT.WASM_ENGINE) E.push(`${w}: spec.engine: the own spec of a ${ACT.WASM} item runs on ${ACT.WASM_ENGINE} (leave engine out)`);
            if (isObj(sp) && isObj(sp.model) && (sp.model.module !== undefined ? sp.model.module : aid) !== aid) E.push(`${w}: spec.model.module: the own spec of a ${ACT.WASM} item runs this item (leave module out)`);
            E.push(...checkSimSpec(ownSpec(a), isObj(a.strings) ? a.strings : null, null, every).map(m => `${w}: ${m}`));
          }
        } else if (rt === ACT.EMBED) {   // an allow-listed outside page: the provider, the exact URL, credit and licence (tools/embed_allow.json)
          if (!EK()) E.push(`${w}: the outside-page checker (NoemaEmbed, engine/src/45_activity_embed.js) is not loaded here`);
          else { const r = EK().check(a); E.push(...r.errors.map(m => `${w}: ${m}`)); W.push(...r.warnings.map(m => `${w}: ${m}`)); }
        }
        const st = a.strings;
        if (!st || typeof st !== 'object' || Array.isArray(st) || !Object.keys(st).length) E.push(`${w}: strings {locale: {key: text}} are required (an activity shows no words of its own)`);
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
      const need = needRequires(Object.values(items));
      const miss = need.filter(x => !req.includes(x)); if (miss.length) E.push(`pack.requires must list ${miss.join(', ')} (make_pack.py writes it)`);
    }
    return { errors: E, warnings: W };
  }

  function checkPack(p, expectId, { strict = false, balance, requireQuality = false } = {}) {
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
    const auth = s.authoring || {}, qual = Number(auth.rules) >= QUALITY.version;
    if (requireQuality && !qual && (!p?.builtAt || p.builtAt >= QUALITY.since)) E.push(`subject.authoring.rules must be ${QUALITY.version} (and authoring.by "claude"): new packs meet the quality rules of tools/pack_rules.json — start the subject with start_subject.py and rebuild with make_pack.py`);
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
      // the source is the language the learner reads: the pack's own, or one of its translations (docs/BRIDGE.md §2.4)
      const own = pack.subject?.language || 'en', offered = [own, ...Object.keys(pack.translations || {})].map(lang0);
      if (b.source && !offered.includes(lang0(b.source))) E.push(`source: "${b.source}" — the pack is written in "${own}"${offered.length > 1 ? ` and translated into ${offered.slice(1).join(', ')}` : ''}; a bridge from a translation needs that translation saved first`);
    }
    if (!entries.length) W.push('no entries yet');
    return { errors: E, warnings: W, counts: { entries: entries.length, senses, stale, sections: Object.keys(secs).length, previews, anchors: anchors.length } };
  }
  /* i18n-ignore-end */
  root.NoemaPackCheck = { checkPack, checkActivities, checkSimSpec, ownSpec, specNames, needRequires, lintHtml, ACTIVITY_RULES: ACT, checkExercise, checkBalance, checkQuality, checkBridge, checkTranslation, requiredLocales, RULES, QUALITY, LANGS, TYPES, BLOCKS, ID_RE };
})(typeof window !== 'undefined' ? window : globalThis);
