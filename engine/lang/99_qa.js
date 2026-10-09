/* ---------- QA — the whole language part, end to end (docs/LANGUAGES.md §13 QA): the home organized, foreign script marked ---------- */

/* Every run of Arabic, Hebrew or Chinese script in a text the app writes (explanations, notes, glosses, buttons) gets its own
   lang + dir, wherever the view forgot it (LANGUAGE_RULES: every foreign span gets lang + dir). One observer for every view. */
const QA_SCRIPT = /[֐-׿יִ-ﭏ]+(?:[\s֐-׿יִ-ﭏ]*[֐-׿יִ-ﭏ])?|[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+(?:[\s؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿ً-ٟ]*[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿])?|[㐀-鿿豈-﫿]+/g;
const QA_SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'TITLE', 'svg', 'SVG', 'text', 'CANVAS']);
const QA_OTHER = { Arab: ['fa', 'ur', 'ps', 'ku', 'sd', 'ug'], Hebr: ['yi', 'lad'], Hani: ['ja', 'ko', 'yue', 'vi'] };
function qaScriptOf(run) { return /[֐-׿יִ-ﭏ]/.test(run) ? 'Hebr' : /[㐀-鿿豈-﫿]/.test(run) ? 'Hani' : 'Arab'; }
function qaLangOf(run, el) {
  const sc = qaScriptOf(run), base = { Hebr: 'he', Arab: 'ar', Hani: 'zh' }[sc];
  const forCode = el.closest('[data-for]')?.dataset.for;   // a comparison note about Persian, Yiddish, Japanese …
  if (forCode && QA_OTHER[sc].includes(forCode)) return { lang: forCode, dir: sc === 'Hani' ? 'ltr' : 'rtl' };
  return { lang: UI.C?.lang[base] ? base : 'und-' + sc, dir: sc === 'Hani' ? 'ltr' : 'rtl' };
}
/** Does this element already sit in a span of a language written in that script? */
function qaMarked(el, sc) {
  const holder = el.closest('[lang]'); if (!holder) return false;
  const l = holder.getAttribute('lang').toLowerCase();
  if (sc === 'Hebr') return /^(he|yi|lad|und-hebr)/.test(l);
  if (sc === 'Arab') return /^(ar|fa|ur|ps|ku|sd|ug|und-arab)/.test(l);
  return /^(zh|ja|ko|yue|vi|und-hani)/.test(l);
}
function qaMarkScripts(root) {
  if (!root || !UI.C) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: t => {
    const p = t.parentElement; if (!p || QA_SKIP.has(p.tagName) || p.closest('svg, textarea, select, [contenteditable], .lx-autolang')) return NodeFilter.FILTER_REJECT;
    QA_SCRIPT.lastIndex = 0; return QA_SCRIPT.test(t.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  } });
  const todo = []; while (tw.nextNode()) todo.push(tw.currentNode);
  for (const t of todo) {
    const p = t.parentElement, s = t.data, parts = []; let last = 0, m, changed = false;
    QA_SCRIPT.lastIndex = 0;
    while ((m = QA_SCRIPT.exec(s))) {
      if (qaMarked(p, qaScriptOf(m[0]))) continue;
      if (m.index > last) parts.push(document.createTextNode(s.slice(last, m.index)));
      const { lang, dir } = qaLangOf(m[0], p);
      parts.push(h('span', { class: 'lx-autolang', lang, dir }, m[0])); last = m.index + m[0].length; changed = true;
    }
    if (!changed) continue;
    if (last < s.length) parts.push(document.createTextNode(s.slice(last)));
    t.replaceWith(...parts);
  }
}
{
  /* synchronously, in the observer's microtask: a view is marked before anything else runs (a timer may wait behind long tasks) */
  const obs = new MutationObserver(list => {
    const roots = new Set();
    for (const mu of list) for (const n of mu.addedNodes) {
      const el = n.nodeType === 1 ? n : n.parentElement;
      if (el && el.isConnected && !el.classList?.contains('lx-autolang') && el.closest?.('.lx-main, .lx-pop, .lx-tutor, .lx-top, .lj-box, .lx-glyphcard')) roots.add(el);
    }
    for (const r of roots) { let up = r.parentElement, inner = false; while (up && !inner) { inner = roots.has(up); up = up.parentElement; } if (!inner) qaMarkScripts(r); }   // the outermost only
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

/* ---------- the home: the session first, then the next lesson, the lanes of every language as one compact grid, the map near you ---------- */
const QA_ICON = s => (STATE_LABEL[s] || s || '').split(' ')[0];
const QA_FAR = new Set(['locked', 'unprepared']);
{
  const home1 = VIEWS.home;
  VIEWS.home = (v, r) => {
    home1(v, r);
    if (!v.querySelector('.lx-hero')) return;   // an account course without its core: the ✨ page
    const hero = v.querySelector('.lx-hero'), go1 = hero.querySelector('.lx-go');
    // nothing due, but a lesson waits (a new learner): the big button starts it instead of saying "come back tomorrow"
    const first = v.querySelector('.lx-lessonbtn');
    if (go1 && go1.disabled && first) {
      const nid = first.dataset.node, n = UI.C.nodes[nid];
      const st = N.planSession(UI.C, UI.L, { day: today(), minutes: UI.L.settings.minutes || 20, languages: todayLangs() }).steps.find(s => s.kind === 'lesson' && s.node === nid);
      const start = go1.cloneNode(false); start.disabled = false; start.textContent = `▶ Start: ${stepLabel(n)} ${n.title}`;   // a clone: without the session's listener
      start.addEventListener('click', () => runLesson(nid, st?.langs?.length ? st.langs : lessonLangs(nid))); go1.replaceWith(start);
    }
    const poly = v.querySelector('.lx-polyhome'), today1 = poly?.querySelector('.lx-today');
    if (today1) hero.append(today1);   // today's languages belong to the session
    // the lanes: one row per language — grammar, writing, reading, script, peculiarities, tutor; then what spans languages
    const lanes = v.querySelector('.lx-prodlanes');
    if (lanes) {
      lanes.querySelector('h2').textContent = '🧭 Your lanes';
      for (const row of lanes.querySelectorAll('.lx-lanerow')) {
        const c = row.dataset.lang, tutor = row.querySelector('.lx-totutor');
        const gram = h('button', { class: 'btn small lx-togrammar', title: 'The grammar points of your open lessons', onclick: () => go('#/grammar/' + c) }, '📐 Grammar');
        row.querySelector('.lx-towrite')?.before(gram);
        const sb = v.querySelector(`.lx-drills .lx-scriptbtn[data-lang="${c}"]`); if (sb) { sb.classList.remove('ghost'); sb.textContent = sb.textContent.replace(info(c).flag, '').replace(/\s+/g, ' ').trim(); tutor ? tutor.before(sb) : row.append(sb); }
        const pec = [...v.querySelectorAll('.lx-libraries button')].find(b => b.textContent.includes(info(c).name));
        if (pec) { pec.textContent = '📚 Peculiarities'; pec.classList.add('lx-topec'); tutor ? tutor.before(pec) : row.append(pec); }
        row.append(h('div', { class: 'lx-laneacts' }, ...row.querySelectorAll(':scope > button')));
      }
      v.querySelector('.lx-libraries')?.remove();
      const polyRow = poly?.querySelector('.lx-polydrills'); if (polyRow) lanes.append(polyRow);
      const drills = v.querySelector('.lx-drills');
      if (drills) {
        const sorts = [...drills.querySelectorAll('button')].filter(b => b.textContent.startsWith('🧩'));
        if (sorts.length) drills.append(h('details', { class: 'lx-sortfold' }, h('summary', { class: 'btn ghost small' }, `🧩 Sort a field into its groups (${sorts.length})`), h('div', { class: 'row' }, ...sorts)));
        lanes.append(drills);
      }
      if (poly && !poly.children.length) poly.remove();
      const lessonsBox = v.querySelector('.lx-lessons');
      (lessonsBox || hero).after(lanes);
      const glane = v.querySelector('.lx-glane'); if (glane) lanes.after(glane);
    }
    qaCompactMap(v);
  };
}
/** The map: compact state chips (flag + sign, the words in the legend and the tooltip), the far, locked part folded. */
function qaCompactMap(v) {
  const box = v.querySelector('.lx-nodes'); if (!box) return;
  const nodes = [...box.querySelectorAll('.lx-node')], seen = new Set();
  let lastNear = -1;
  nodes.forEach((n, i) => {
    const chips = [...n.querySelectorAll('.lx-ns')], states = chips.map(ch => [...ch.classList].find(x => x.startsWith('ns-'))?.slice(3));
    chips.forEach((ch, j) => { const flag = ch.textContent.trim().split(' ')[0]; seen.add(states[j]); ch.textContent = ''; ch.append(flag, ' ', h('span', { class: 'lx-nsi', 'aria-hidden': 'true' }, QA_ICON(states[j]))); ch.setAttribute('aria-label', ch.title); });
    if (states.some(s => s && !QA_FAR.has(s) && s !== 'na')) lastNear = i;
  });
  const cut = lastNear + 4, hidden = nodes.slice(cut);
  if (hidden.length > 2) {
    hidden.forEach(n => { n.hidden = true; });
    box.after(h('button', { class: 'btn ghost small lx-mapmore', onclick: e => { hidden.forEach(n => { n.hidden = false; }); e.currentTarget.remove(); } }, `🗺️ The whole map — ${hidden.length} more steps`));
  }
  const legend = [...seen].filter(Boolean).map(s => `${QA_ICON(s)} ${(STATE_LABEL[s] || s).split(' ').slice(1).join(' ')}`).join(' · ');
  box.before(h('p', { class: 'tiny lx-maplegend' }, legend));
}

/* ---------- the next step offered at the end of a lesson ---------- */
/** “▶ Next lesson” when another lesson waits (in today's languages, those of the lesson just run first), else null. */
function qaNextLessonButton(nid, ran = []) {
  const langs = todayLangs(), K = Object.fromEntries(langs.map(c => [c, N.known(UI.C, UI.L, c)])), mine = s => s.langs.some(c => ran.includes(c)) ? 0 : 1;
  const st = N.nextLessons(UI.C, UI.L, langs, K).filter(s => s.node !== nid).sort((a, b) => mine(a) - mine(b))[0];   // the languages just learned first
  if (!st) return null;
  const n = UI.C.nodes[st.node];
  return h('button', { class: 'btn primary lx-nextlesson', onclick: () => runLesson(st.node, st.langs) }, `▶ Next lesson: ${stepLabel(n)} ${n.title}`);
}

/* ---------- 🔁 principal parts: distractors that do not give the answer away ---------- */
/** Wrong options for “its <label>?” of one word: German forms built from the same word (der / die / das + noun, the plural
    and genitive patterns, du / er forms), then the word's other principal parts, then the same label of other words. */
function qaPartsDistractors(c, p, label, val, pool) {
  const lem = LX(c).lex[p.id].lemma, made = [];
  if (c === 'de') {
    const noun = val.replace(/^(der|die|das|des|dem|den) /, ''), uml = w => w.replace(/(au|a|o|u)(?=[^aou]*$)/i, x => ({ au: 'äu', a: 'ä', o: 'ö', u: 'ü', Au: 'Äu', A: 'Ä', O: 'Ö', U: 'Ü' }[x] || x));
    const stem = lem.replace(/e?n$/, '');
    if (label === 'article') made.push(...['der', 'die', 'das'].map(a => a + ' ' + noun));
    else if (label === 'plural') made.push(...[lem, lem + 'e', lem + 'en', lem + 'n', lem + 'er', lem + 's', uml(lem) + 'e', uml(lem) + 'er', uml(lem)].map(x => 'die ' + x));
    else if (label === 'genitive') made.push('des ' + lem + 's', 'des ' + lem + 'es', 'des ' + lem + 'en', 'des ' + lem, 'der ' + lem);
    else if (label === 'er/sie/es') made.push(stem + 't', stem + 'et', uml(stem) + 't', lem);
    else if (label === 'du') made.push(stem + 'st', stem + 'est', uml(stem) + 'st', lem);
  }
  const FORM = ['plural', 'feminine', 'feminine plural', 'with the article', 'counted plural', 'one (unit noun)', 'collective'];   // labels whose values are forms of the word
  const own = FORM.includes(label) ? p.parts.filter(([l]) => l !== label && FORM.includes(l)).map(([, x]) => x).filter(x => x !== lem) : [];
  const seen = new Set([val]), out = [];
  const closed = c === 'de' && label === 'article';   // der / die / das: two wrong ones, nothing else
  for (const x of [...shuffle(made), ...(closed ? [] : [...shuffle(own), ...shuffle([...(pool || [])])])]) if (!seen.has(x) && x && out.length < 3) { seen.add(x); out.push(x); }
  return out;
}
