/* noema-lite — pack checks shared by the app (in-browser generators) and the Claude connector (cloud/mcp).
   checkPack(p, expectId, { strict }) → { errors, warnings, counts }
   strict = also check every exercise's own fields (used for packs generated in the browser, where nothing
   else validated them; the Python validator in the skill is the full check for skill-built packs). */
(function (root) {
  const TYPES = new Set(['mcq', 'tf', 'odd', 'order', 'match', 'bucket', 'cloze', 'spotbug', 'calc', 'scenario', 'free', 'write', 'img_hotspot', 'img_sequence', 'img_reveal', 'img_drag', 'img_label', 'img_select', 'img_occlusion']);
  const BLOCKS = new Set(['p', 'list', 'code', 'diagram', 'table', 'callout', 'compare', 'flow', 'reveal', 'ask', 'terms', 'figure']);
  const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
  const isStr = v => typeof v === 'string' && v.trim().length > 0;
  const strs = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every(isStr);
  const intIn = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

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

  function checkPack(p, expectId, { strict = false } = {}) {
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
    const chapters = Array.isArray(p?.chapters) ? p.chapters : [];
    if (!chapters.length) E.push('no chapters');
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
      if (!(c.exercises || []).some(e => String(e.type).startsWith('img_'))) W.push(`${c.id}: no visual exercises`);
    }
    for (const mid of Object.keys(media)) if ((used[mid] || 0) < 3) W.push(`picture ${mid} has ${used[mid] || 0} exercises (aim for >= 3)`);
    return { errors: E, warnings: W, counts: { chapters: chapters.length, sections: secN, exercises: ex, visual: vis, media: Object.keys(media).length } };
  }
  root.NoemaPackCheck = { checkPack, checkExercise, TYPES, BLOCKS, ID_RE };
})(typeof window !== 'undefined' ? window : globalThis);
