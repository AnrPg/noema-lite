/* ---------- the field map: the whole thematic field, every tier, grouped by subgroup ---------- */
VIEWS.field = (v, r) => {
  const fid = r.arg, tierPick = r.arg2 ? +r.arg2 : 0;
  const field = UI.C.data.fields.find(f => f.field === fid); if (!field) return VIEWS.home(v);
  const c = UI.lang, k = N.known(UI.C, UI.L, c);
  const all = field.concepts;
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← ' + LT('lang.card.map'))),
    h('h1', {}, '🧺 ', field.title, h('span', { class: 'tiny lx-count' }, ' · ' + LT('lang.field.inAll', { n: all.length }))),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); render(); }),
      h('div', { class: 'lx-seg' }, ...[0, 1, 2, 3].map(t => h('button', { class: tierPick === t ? 'on' : '', onclick: () => go(`#/field/${encodeURIComponent(fid)}/${t}`) }, LT('lang.field.tier' + t)))),
      h('button', { class: 'btn small', onclick: () => go('#/sort/' + encodeURIComponent(fid)) }, '🧩 ' + LT('lang.field.sortGroups')),
      h('label', { class: 'tiny lx-peek' }, h('input', { type: 'checkbox', checked: UI.prefs.peek ? true : null, onchange: e => { UI.prefs.peek = e.target.checked; save(); render(); } }), ' ' + LT('lang.field.peek'))));
  for (const sg of field.subgroups || [{ id: null, title: '' }]) {
    const items = all.filter(x => (sg.id == null || x.subgroup === sg.id) && (!tierPick || x.tier === tierPick)).sort((a, b) => a.tier - b.tier || a.rank - b.rank);
    if (!items.length) continue;
    v.append(h('h3', { class: 'lx-h3' }, (SUB_EMOJI[sg.id] || '') + ' ' + sg.title, h('span', { class: 'tiny' }, ' ' + LNUM(items.length))),
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
  const si = scriptInput(c, { cls: 'lx-recallin', placeholder: LT('lang.recall.placeholder', { lang: info(c).name }) }), input = si.input;   // keyboards / pinyin (P4)
  const clock = h('b', { class: 'lx-clock' }, '3:00'), list = h('div', { class: 'lx-found' }), msg = h('div', { class: 'tiny' });
  const finish = () => {
    clearInterval(timer); input.disabled = true;
    const taught = words.filter(x => k.R.has(x.id)), got = [...found.keys()];
    const bonus = got.filter(id => !k.R.has(id));
    v.append(h('div', { class: 'lx-result' }, h('h2', {}, LT('lang.recall.result', { got: got.length, total: words.length, field: field.title.toLowerCase(), lang: info(c).name })),
      h('p', {}, LT('lang.recall.learned', { taught: taught.length, named: got.filter(id => k.R.has(id)).length }), bonus.length ? ' ' + LT('lang.recall.bonus', { n: bonus.length }) : ''),
      h('details', {}, h('summary', {}, LT('lang.recall.notNamed')), h('div', { class: 'lx-cgrid' }, ...words.filter(x => !found.has(x.id)).map(x => conceptTile(c, { cid: x.senses[0] }, k))))));
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
    if (hit) { found.set(hit.id, true); list.prepend(h('span', { class: 'lx-hit' }, word(c, hit.lemma, { sub: false }), ' ', h('span', { class: 'tiny' }, gloss(c, hit.id)))); msg.textContent = `✓ ${LNUM(found.size)}`; }
    else msg.textContent = LT(words.some(x => spellings(c, x).has(t)) ? 'lang.recall.already' : 'lang.recall.notInField');
  });
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.back() }, '← ' + LT('lang.card.back'))),
    h('h1', {}, '⏱️ ' + LT('lang.recall.title', { field: field.title.toLowerCase(), lang: info(c).flag + ' ' + info(c).label })),
    h('p', { class: 'tiny' }, LT('lang.recall.how')),
    h('div', { class: 'row' }, si.el, clock, h('button', { class: 'btn small', onclick: finish }, LT('lang.recall.done'))), msg, list);
  setTimeout(() => input.focus(), 50);
};

/* ---------- ⚙️ settings ---------- */
/** D18: the learner's languages with their level; native / C2 ones fold what is familiar. A language without a profile is
 *  described by its type (and family), and the app infers from them. */
const LEVELS = [['native', () => LT('lang.set.native')], ['C2', () => LT('lang.set.c2')], ['C1', () => 'C1'], ['B2', () => 'B2'], ['B1', () => 'B1'], ['A2', () => LT('lang.set.a2')]];
function knowsEditor() {
  const S = UI.L.settings, W = UI.C.data.world, box = h('div', { class: 'lx-knows' });
  const list = () => S.knows || (S.knows = []);
  const draw = () => {
    box.innerHTML = '';
    for (const [i, k] of list().entries()) box.append(h('div', { class: 'lx-setrow', 'data-know': k.code || k.name },
      h('b', {}, k.code ? capFirst(langName(k.code)) : k.name), k.code ? null : h('span', { class: 'tiny' }, ' ' + LT('lang.set.inferred', { what: (k.type || '?') + (k.family ? ', ' + k.family : '') })), ' ',
      h('select', { 'aria-label': LT('lang.set.level'), onchange: e => { k.level = e.target.value; save(); } }, ...LEVELS.map(([v, t]) => h('option', { value: v, selected: (k.level || 'native') === v ? true : null }, t()))),
      h('button', { class: 'btn ghost small', onclick: () => { list().splice(i, 1); save(); draw(); } }, '✕')));
    const nm = l => capFirst(langName(l.code) || l.name), cmp = window.NoemaI18n ? NoemaI18n.fmt.compare : (a, b) => a.localeCompare(b);
    const langs = (W?.languages || []).slice().sort((a, b) => cmp(nm(a), nm(b)));
    const pick = h('select', { 'aria-label': LT('lang.set.addLang') }, h('option', { value: '' }, '+ ' + LT('lang.set.addLangItem')), ...langs.map(l => h('option', { value: l.code }, `${nm(l)} — ${l.family}`)), h('option', { value: '*' }, LT('lang.set.otherLang')));
    pick.onchange = () => {
      if (pick.value === '*') {
        const name = prompt(LT('lang.set.askName')); if (!name) return draw();
        const type = prompt(LT('lang.set.askType'), 'agglutinating') || '';   // the answer is one of the four type codes
        const fams = [...new Set((W?.languages || []).map(l => l.family))].sort();
        const family = prompt(LT('lang.set.askFamily', { families: fams.join(', ') }), '') || '';
        list().push({ name, type: type.trim().toLowerCase(), ...(fams.includes(family.trim()) ? { family: family.trim() } : {}), level: 'native' });
      } else if (pick.value && !list().some(k => k.code === pick.value)) list().push({ code: pick.value, level: 'native' });
      save(); draw();
    };
    box.append(pick, h('p', { class: 'tiny' }, LT('lang.set.knowsNote')),
      h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', checked: S.aiNotes ? true : null, onchange: e => { S.aiNotes = e.target.checked; save(); } }),
        ' ✨ ' + LT('lang.set.aiNotes')));
  };
  draw(); return box;
}
/** D19: the learner's native language (a:settings.native, one for every course): a picker of every profiled language + “another
 *  language” (its name, type and family). onPick(native | null) after it is saved. */
function nativePicker(onPick = () => { }) {
  const W = UI.C.data.world, cur = accSettings().native || null, box = h('div', { class: 'lx-native' });
  const nm = l => capFirst(langName(l.code) || l.name), cmp = window.NoemaI18n ? NoemaI18n.fmt.compare : (a, b) => a.localeCompare(b);
  const langs = (W?.languages || []).slice().sort((a, b) => cmp(nm(a), nm(b)));
  const known = cur?.code && langs.some(l => l.code === cur.code);
  const sel = h('select', { class: 'lx-nativesel', 'aria-label': LT('lang.native.label') }, h('option', { value: '' }, LT('lang.native.none')),
    ...langs.map(l => h('option', { value: l.code, selected: cur?.code === l.code ? true : null }, `${nm(l)} — ${l.family}`)),
    cur && !known ? h('option', { value: '=', selected: true }, cur.name || cur.code) : null,
    h('option', { value: '*' }, LT('lang.native.other')));
  const typeNames = Object.fromEntries((UI.C.data.typology?.types || []).map(t => [t.id, t.name]));
  const other = h('div', { class: 'lx-nativeother', hidden: true });
  const name = h('input', { class: 'noema-input', 'aria-label': LT('lang.native.name'), placeholder: LT('lang.native.name') });
  const type = h('select', { 'aria-label': LT('lang.native.type') }, ...N.TYPES.map(t => h('option', { value: t }, typeNames[t] || t)));
  const fams = [...new Set((W?.languages || []).map(l => l.family))].sort(cmp);
  const fam = h('select', { 'aria-label': LT('lang.native.family') }, h('option', { value: '' }, LT('lang.native.familyUnknown')), ...fams.map(f => h('option', { value: f }, f)));
  const put = v => { putAccSettings({ native: v || undefined }); nativeMemo = null; onPick(nativeL()); };
  other.append(name, type, fam, h('button', { class: 'btn small', onclick: () => { const n = name.value.trim(); if (!n) return name.focus(); put({ name: n, type: type.value, ...(fam.value ? { family: fam.value } : {}) }); } }, LT('lang.native.save')));
  sel.onchange = () => { other.hidden = sel.value !== '*'; if (sel.value === '*') return name.focus(); if (sel.value !== '=') put(sel.value ? { code: sel.value } : null); };
  box.append(sel, other);
  return box;
}
/** D19: asked once in a language course while the native language is not known (until then: no comparisons, general texts only). */
function nativeAsk() {
  if (nativeL() || UI.prefs.nativeAsked || !UI.C.data.world) return null;
  const box = h('div', { class: 'lx-card lx-native-ask', 'data-ask': 'native' }, h('b', {}, '🧭 ' + LT('lang.native.ask')), h('p', { class: 'tiny' }, LT('lang.native.askWhy')),
    nativePicker(() => { UI.prefs.nativeAsked = true; save(); applyExplanationLocale(); render(); }),
    h('button', { class: 'btn ghost small lx-nativelater', onclick: () => { UI.prefs.nativeAsked = true; save(); box.remove(); } }, LT('lang.native.later')));
  return box;
}
/** D19: the language of the explanations — automatic (the native language's, else the UI's, when its facade is on) or the learner's choice (settings.speaker). */
function speakerPicker() {
  const opts = explanationLocales(); if (opts.length < 2) return null;
  const S = UI.L.settings;
  return h('label', { class: 'lx-setrow' }, LT('lang.native.speaker') + ' ', h('select', { class: 'lx-speaker', onchange: e => { if (e.target.value) S.speaker = e.target.value; else delete S.speaker; save(); applyExplanationLocale(); render(); } },
    h('option', { value: '' }, LT('lang.native.speakerAuto')), ...opts.map(l => h('option', { value: l, selected: S.speaker === l ? true : null }, capFirst(uiLangName(l))))));
}
const PEC_AREAS = ['script', 'orthography', 'phonology', 'morphology', 'syntax', 'lexicon', 'semantics', 'pragmatics', 'culture', 'numbers'];   // lang.pec.area.<area>
/** D18: the peculiarities of a language as a free library (no order): what is new for you first marked, every one readable. */
VIEWS.peculiar = (v, r) => {
  const c = r.arg && UI.C.lang[r.arg] ? r.arg : UI.lang, W = UI.C.data.world;
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.length > 1 ? history.back() : go('#/') }, '← ' + LT('lang.card.back'))),
    h('h1', {}, '📚 ' + LT('lang.pec.title', { lang: info(c).name })), h('div', { class: 'row' }, flagRail(null, c, x => go('#/peculiar/' + x))));
  if (!W) return v.append(h('p', { class: 'lx-note' }, LT('lang.pec.noCatalogue')));
  const r2 = N.forLearner(UI.C, c, knowsL()), isNew = new Set(r2.new.map(x => x.p.id)), fam = Object.fromEntries(r2.familiar.map(x => [x.p.id, x.from]));
  const filt = UI.prefs.pecFilter || 'all';
  v.append(h('p', { class: 'tiny' }, LT('lang.pec.counts', { nNew: r2.new.length, nFam: r2.familiar.length, from: LLIST(r2.knownProfiles.map(langName)) || '—' }) + ' ',
    ...['all', 'new', 'familiar'].map(f => h('button', { class: 'btn small' + (filt === f ? ' primary' : ''), 'data-filter': f, onclick: () => { UI.prefs.pecFilter = f; save(); go('#/peculiar/' + c); render(); } }, LT('lang.pec.filter.' + f)))));
  const byArea = {};
  for (const p of W.phenomena[c] || []) {
    if (filt === 'new' && !isNew.has(p.id) || filt === 'familiar' && !fam[p.id]) continue;
    (byArea[p.area] = byArea[p.area] || []).push(p);
  }
  for (const [area, ps] of Object.entries(byArea)) v.append(h('details', { class: 'lx-sec', open: true, 'data-area': area }, h('summary', {}, PEC_AREAS.includes(area) ? LT('lang.pec.area.' + area) : area, h('span', { class: 'tiny' }, ' ' + LNUM(ps.length))),
    ...ps.map(p => h('details', { class: 'lx-pec', 'data-id': p.id }, h('summary', {}, isNew.has(p.id) ? '✨ ' : fam[p.id] ? '✓ ' : '', p.kind === 'lacks' ? '∅ ' : '', h('b', {}, p.title),
        fam[p.id] ? h('span', { class: 'tiny' }, ' — ' + LT('lang.pec.familiarFrom', { from: LLIST(fam[p.id].map(langName)) })) : null),
      h('p', {}, wordsIn(c, p.what)),
      ...(p.examples || []).map(e => h('div', { class: 'lx-ex' }, h('div', { class: 'lx-extext' }, wordsIn(c, e.text)), e.translit ? h('div', { class: 'tiny' }, e.translit) : null, e.note ? h('div', { class: 'lx-tr' }, e.note) : null)),
      (() => { const mine = N.contrastFor(p.notes, nativeL()); return mine.length ? notesList(mine, c) : null; })(),   // D19: the native language's notes only
      p.when ? h('p', { class: 'tiny' }, '🛤️ ' + LT('lang.pec.inCourse') + ' ', p.when) : null))));
};
VIEWS.settings = (v) => {
  const S = UI.L.settings;
  const langBox = h('div', { class: 'lx-setrow' }, ...UI.C.languages.map(c => h('label', { class: 'lx-check' },
    h('input', { type: 'checkbox', checked: activeLangs().includes(c) ? true : null, onchange: e => { const s = new Set(activeLangs()); e.target.checked ? s.add(c) : s.delete(c); if (!s.size) { e.target.checked = true; return; } S.languages = UI.C.languages.filter(x => s.has(x)); save(); } }),
    ' ', info(c).flag, ' ', info(c).label,
    h('select', { 'aria-label': LT('lang.set.depthFor', { lang: info(c).name }), onchange: e => { S.depth = { ...(S.depth || {}), [c]: +e.target.value }; save(); } },
      ...[[1, LT('lang.set.depth1')], [2, LT('lang.set.depth2')], [3, LT('lang.set.depth3')]].map(([d, t]) => h('option', { value: d, selected: (S.depth?.[c] ?? 3) === d ? true : null }, t))))));
  const num = (label, key, min, max, def) => h('label', { class: 'lx-setrow' }, label, ' ', h('input', { type: 'number', min, max, value: S[key] || def, onchange: e => { S[key] = Math.max(min, Math.min(max, +e.target.value || def)); save(); } }));
  const tog = (label, key) => h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', checked: UI.prefs[key] !== false ? true : null, onchange: e => { UI.prefs[key] = e.target.checked; save(); } }), ' ', label);
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← ' + LT('lang.card.map'))), h('h1', {}, '⚙️ ' + LT('lang.shell.settings')),
    h('h3', { class: 'lx-h3' }, LT('lang.set.studyNow')), langBox,
    h('h3', { class: 'lx-h3' }, LT('lang.native.label')), nativePicker(() => { applyExplanationLocale(); render(); }), h('p', { class: 'tiny' }, LT('lang.native.note')), speakerPicker(),
    h('h3', { class: 'lx-h3' }, LT('lang.set.knowAlready')), knowsEditor(),
    h('h3', { class: 'lx-h3' }, LT('lang.set.sessions')), num(LT('lang.set.batch'), 'batch', 3, 30, 12), num(LT('lang.set.minutes'), 'minutes', 5, 120, UI.C.data.course.defaults?.dailyMinutes || 20),
    h('h3', { class: 'lx-h3' }, LT('lang.set.readingHelp')), tog(LT('lang.set.marks'), 'marks'), marksSettings(), tog(LT('lang.set.translit'), 'translit'), tog(LT('lang.set.pinyin'), 'pinyin'),
    h('p', { class: 'tiny' }, LT('lang.set.explainNote', { lang: info(UI.C.explainLang).name })));
};
