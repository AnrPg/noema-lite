/* ---------- the field map: the whole thematic field, every tier, grouped by subgroup ---------- */
VIEWS.field = (v, r) => {
  const fid = r.arg, tierPick = r.arg2 ? +r.arg2 : 0;
  const field = UI.C.data.fields.find(f => f.field === fid); if (!field) return VIEWS.home(v);
  const c = UI.lang, k = N.known(UI.C, UI.L, c);
  const all = field.concepts;
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, '🧺 ', field.title, h('span', { class: 'tiny' }, ` · ${all.length} in all`)),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); render(); }),
      h('div', { class: 'lx-seg' }, ...[0, 1, 2, 3].map(t => h('button', { class: tierPick === t ? 'on' : '', onclick: () => go(`#/field/${encodeURIComponent(fid)}/${t}`) }, t ? ['', 'common', 'less common', 'rare'][t] : 'all'))),
      h('button', { class: 'btn small', onclick: () => go('#/sort/' + encodeURIComponent(fid)) }, '🧩 Sort into groups'),
      h('label', { class: 'tiny lx-peek' }, h('input', { type: 'checkbox', checked: UI.prefs.peek ? true : null, onchange: e => { UI.prefs.peek = e.target.checked; save(); render(); } }), ' show words not learned yet')));
  for (const sg of field.subgroups || [{ id: null, title: '' }]) {
    const items = all.filter(x => (sg.id == null || x.subgroup === sg.id) && (!tierPick || x.tier === tierPick)).sort((a, b) => a.tier - b.tier || a.rank - b.rank);
    if (!items.length) continue;
    v.append(h('h3', { class: 'lx-h3' }, (SUB_EMOJI[sg.id] || '') + ' ' + sg.title, h('span', { class: 'tiny' }, ' ' + items.length)),
      h('div', { class: 'lx-cgrid' }, ...items.map((x, i) => {
        const t = conceptTile(c, { cid: x.id }, k);
        if (i && items[i - 1].tier !== x.tier) t.classList.add('lx-tierbreak');
        t.dataset.tier = x.tier; return t;
      })));
  }
};

/* ---------- ⏱️ name them all: free recall of a whole field ---------- */
function fold(code, s) {
  let t = N.stripMarks(code, N.nfc(String(s))).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[\s'’\-·]+/g, '');
  return t.replace(/ß/g, 'ss');
}
/** Every way the learner may type a word: any form, without vowel marks, full spelling, transliteration, pinyin with or without tones. */
function spellings(code, x) {
  const out = new Set([x.lemma, ...Object.values(x.forms || {}), ...Object.values(x.plene || {}), ...(x.alts || [])].map(s => fold(code, s)));
  if (x.translit) out.add(fold(code, x.translit));
  if (x.pinyin) { out.add(fold(code, x.pinyin)); out.add(fold(code, N.pinyinMarksToNumbers(x.pinyin).replace(/\d/g, ''))); }
  if (x.trad) out.add(fold(code, x.trad));
  return out;
}
VIEWS.recall = (v, r) => {
  const fid = r.arg, field = UI.C.data.fields.find(f => f.field === fid); if (!field) return VIEWS.home(v);
  const c = UI.lang, X = LX(c), k = N.known(UI.C, UI.L, c);
  const words = Object.values(X.lex).filter(x => (x.senses || []).some(s => UI.C.concepts[s]?.field === fid));
  const found = new Map(); let left = 180, timer = null;
  const si = scriptInput(c, { cls: 'lx-recallin', placeholder: `Type a ${info(c).name} word and press Enter…` }), input = si.input;   // keyboards / pinyin (P4)
  const clock = h('b', { class: 'lx-clock' }, '3:00'), list = h('div', { class: 'lx-found' }), msg = h('div', { class: 'tiny' });
  const finish = () => {
    clearInterval(timer); input.disabled = true;
    const taught = words.filter(x => k.R.has(x.id)), got = [...found.keys()];
    const bonus = got.filter(id => !k.R.has(id));
    v.append(h('div', { class: 'lx-result' }, h('h2', {}, `${got.length} of ${words.length} ${field.title.toLowerCase()} in ${info(c).name}`),
      h('p', {}, `Of the ${taught.length} you have learned you named ${got.filter(id => k.R.has(id)).length}.`, bonus.length ? ` And ${bonus.length} you have not been taught yet — well done!` : ''),
      h('details', {}, h('summary', {}, 'The ones you did not name'), h('div', { class: 'lx-cgrid' }, ...words.filter(x => !found.has(x.id)).map(x => conceptTile(c, { cid: x.senses[0] }, k))))));
    // naming a learned word counts as a correct production review
    for (const id of got) if (k.R.has(id)) N.review(UI.C, UI.L, c, id, 'p', 'good', today());
    save(true);
  };
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = fold(c, input.value); input.value = '';
    if (!t) return;
    if (!timer) timer = setInterval(() => { left--; clock.textContent = `${left / 60 | 0}:${String(left % 60).padStart(2, '0')}`; if (left <= 0) finish(); }, 1000);
    const hit = words.find(x => !found.has(x.id) && spellings(c, x).has(t));
    if (hit) { found.set(hit.id, true); list.prepend(h('span', { class: 'lx-hit' }, word(c, hit.lemma, { sub: false }), ' ', h('span', { class: 'tiny' }, gloss(c, hit.id)))); msg.textContent = `✓ ${found.size}`; }
    else msg.textContent = words.some(x => spellings(c, x).has(t)) ? 'already named' : 'not in this field (or a spelling I do not know)';
  });
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.back() }, '← Back')),
    h('h1', {}, `⏱️ Name all the ${field.title.toLowerCase()} you can — ${info(c).flag} ${info(c).name}`),
    h('p', { class: 'tiny' }, 'Any form counts; without vowel marks, in transliteration or pinyin (tones optional) too. The clock starts with your first word.'),
    h('div', { class: 'row' }, si.el, clock, h('button', { class: 'btn small', onclick: finish }, 'Done')), msg, list);
  setTimeout(() => input.focus(), 50);
};

/* ---------- ⚙️ settings ---------- */
/** D18: the learner's languages with their level; native / C2 ones fold what is familiar. A language without a profile is
 *  described by its type (and family), and the app infers from them. */
const LEVELS = [['native', 'native'], ['C2', 'C2 (near-native)'], ['C1', 'C1'], ['B2', 'B2'], ['B1', 'B1'], ['A2', 'A2 or less']];
function knowsEditor() {
  const S = UI.L.settings, W = UI.C.data.world, box = h('div', { class: 'lx-knows' });
  const list = () => S.knows || (S.knows = knowsL().map(k => ({ ...k })));
  const draw = () => {
    box.innerHTML = '';
    for (const [i, k] of list().entries()) box.append(h('div', { class: 'lx-setrow', 'data-know': k.code || k.name },
      h('b', {}, k.code ? langName(k.code) : k.name), k.code ? null : h('span', { class: 'tiny' }, ` (${k.type || '?'}${k.family ? ', ' + k.family : ''}: inferred)`), ' ',
      h('select', { 'aria-label': 'level', onchange: e => { k.level = e.target.value; save(); } }, ...LEVELS.map(([v, t]) => h('option', { value: v, selected: (k.level || 'native') === v ? true : null }, t))),
      h('button', { class: 'btn ghost small', onclick: () => { list().splice(i, 1); save(); draw(); } }, '✕')));
    const langs = (W?.languages || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const pick = h('select', { 'aria-label': 'add a language' }, h('option', { value: '' }, '+ add a language …'), ...langs.map(l => h('option', { value: l.code }, `${l.name} — ${l.family}`)), h('option', { value: '*' }, 'another language (not in the list) …'));
    pick.onchange = () => {
      if (pick.value === '*') {
        const name = prompt('Name of the language?'); if (!name) return draw();
        const type = prompt('Its type: isolating, agglutinating, fusional or polysynthetic?', 'agglutinating') || '';
        const fams = [...new Set((W?.languages || []).map(l => l.family))].sort();
        const family = prompt('Its family, if one of these (else leave empty): ' + fams.join(', '), '') || '';
        list().push({ name, type: type.trim().toLowerCase(), ...(fams.includes(family.trim()) ? { family: family.trim() } : {}), level: 'native' });
      } else if (pick.value && !list().some(k => k.code === pick.value)) list().push({ code: pick.value, level: 'native' });
      save(); draw();
    };
    box.append(pick, h('p', { class: 'tiny' }, 'Native and C2 languages decide what is folded as familiar; comparison notes are shown for all of them.'),
      h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', checked: S.aiNotes ? true : null, onchange: e => { S.aiNotes = e.target.checked; save(); } }),
        ' ✨ Let Claude or Gemini write comparison notes for my languages that the course has none for (needs your API key in the app’s ⚙️ Settings)'));
  };
  draw(); return box;
}
/** D18: the peculiarities of a language as a free library (no order): what is new for you first marked, every one readable. */
VIEWS.peculiar = (v, r) => {
  const c = r.arg && UI.C.lang[r.arg] ? r.arg : UI.lang, W = UI.C.data.world;
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.length > 1 ? history.back() : go('#/') }, '← Back')),
    h('h1', {}, `📚 ${info(c).name}: its peculiarities`), h('div', { class: 'row' }, flagRail(null, c, x => go('#/peculiar/' + x))));
  if (!W) return v.append(h('p', { class: 'lx-note' }, 'The catalogue is not in this build.'));
  const r2 = N.forLearner(UI.C, c, knowsL()), isNew = new Set(r2.new.map(x => x.p.id)), fam = Object.fromEntries(r2.familiar.map(x => [x.p.id, x.from]));
  const filt = UI.prefs.pecFilter || 'all';
  v.append(h('p', { class: 'tiny' }, `${r2.new.length} new for you · ${r2.familiar.length} familiar from ${r2.knownProfiles.map(langName).join(', ') || '—'} · read them in any order. `,
    ...['all', 'new', 'familiar'].map(f => h('button', { class: 'btn small' + (filt === f ? ' primary' : ''), onclick: () => { UI.prefs.pecFilter = f; save(); go('#/peculiar/' + c); render(); } }, f))));
  const byArea = {};
  for (const p of W.phenomena[c] || []) {
    if (filt === 'new' && !isNew.has(p.id) || filt === 'familiar' && !fam[p.id]) continue;
    (byArea[p.area] = byArea[p.area] || []).push(p);
  }
  for (const [area, ps] of Object.entries(byArea)) v.append(h('details', { class: 'lx-sec', open: true, 'data-area': area }, h('summary', {}, area, h('span', { class: 'tiny' }, ' ' + ps.length)),
    ...ps.map(p => h('details', { class: 'lx-pec', 'data-id': p.id }, h('summary', {}, isNew.has(p.id) ? '✨ ' : fam[p.id] ? '✓ ' : '', p.kind === 'lacks' ? '∅ ' : '', h('b', {}, p.title),
        fam[p.id] ? h('span', { class: 'tiny' }, ' — familiar from ' + fam[p.id].map(langName).join(', ')) : null),
      h('p', {}, wordsIn(c, p.what)),
      ...(p.examples || []).map(e => h('div', { class: 'lx-ex' }, h('div', { class: 'lx-extext' }, wordsIn(c, e.text)), e.translit ? h('div', { class: 'tiny' }, e.translit) : null, e.note ? h('div', { class: 'lx-tr' }, e.note) : null)),
      (() => { const mine = N.notesFor(UI.C, p.notes, knowsL()); return mine.length ? notesList(mine) : null; })(),
      p.when ? h('p', { class: 'tiny' }, '🛤️ In the course: ', p.when) : null))));
};
VIEWS.settings = (v) => {
  const S = UI.L.settings;
  const langBox = h('div', { class: 'lx-setrow' }, ...UI.C.languages.map(c => h('label', { class: 'lx-check' },
    h('input', { type: 'checkbox', checked: activeLangs().includes(c) ? true : null, onchange: e => { const s = new Set(activeLangs()); e.target.checked ? s.add(c) : s.delete(c); if (!s.size) { e.target.checked = true; return; } S.languages = UI.C.languages.filter(x => s.has(x)); save(); } }),
    ' ', info(c).flag, ' ', info(c).name,
    h('select', { 'aria-label': `How far to go in ${info(c).name}`, onchange: e => { S.depth = { ...(S.depth || {}), [c]: +e.target.value }; save(); } },
      ...[[1, 'common words only'], [2, 'common + less common'], [3, 'everything, the rare ones too']].map(([d, t]) => h('option', { value: d, selected: (S.depth?.[c] ?? 3) === d ? true : null }, t))))));
  const num = (label, key, min, max, def) => h('label', { class: 'lx-setrow' }, label, ' ', h('input', { type: 'number', min, max, value: S[key] || def, onchange: e => { S[key] = Math.max(min, Math.min(max, +e.target.value || def)); save(); } }));
  const tog = (label, key) => h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', checked: UI.prefs[key] !== false ? true : null, onchange: e => { UI.prefs[key] = e.target.checked; save(); } }), ' ', label);
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')), h('h1', {}, '⚙️ Settings'),
    h('h3', { class: 'lx-h3' }, 'Languages you study now'), langBox,
    h('h3', { class: 'lx-h3' }, 'Languages you already know'), knowsEditor(),
    h('h3', { class: 'lx-h3' }, 'Sessions'), num('New ideas per session', 'batch', 3, 30, 12), num('Minutes per session', 'minutes', 5, 120, UI.C.data.course.defaults?.dailyMinutes || 20),
    h('h3', { class: 'lx-h3' }, 'Reading help'), tog('Vowel marks in Arabic and Hebrew', 'marks'), marksSettings(), tog('Transliteration under Arabic and Hebrew words', 'translit'), tog('Pinyin under Chinese words', 'pinyin'),
    h('p', { class: 'tiny' }, `Explanations are in ${info(UI.C.explainLang).name}: the language chosen when the course was made.`));
};
