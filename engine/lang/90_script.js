/* ---------- P4 — Scripts and input (docs/LANGUAGES.md §5.5, §6.1, §8) ----------
   The 🔤 script lane (#/script/<lang>): letters (ar, he) or characters (zh) with their state, the stage meter and the drills
   glyph_form · transliterate · vowelize · tone_mark · char_compose · trace · spell; a few script items in the daily session in the
   first weeks; on-screen keyboards (ar, he with the vowel marks), pinyin input (tone numbers → marks → characters) and ä ö ü ß
   buttons for every typed answer; vowel marks that fade on known words. Every answer comes from the course files and the script
   module (langcore: scriptItems, checkTyped, strokeMatch …). */

/* ---------- vowel marks: full · fading · none, per language ---------- */
const markPref = c => UI.prefs.marks === false ? 'none' : ((UI.prefs.markLevel || {})[c] || 'full');
/** The text of a word as it should be shown: all its marks, fewer as the word becomes known ("fading"), or none. force = 'full' for drills about the marks. */
function shownMarks(c, text, lex, force) {
  const X = LX(c); if (!X?.language.vowelMarks || force === 'full' || text == null) return text;
  const pref = markPref(c);
  if (pref === 'full') return text;
  if (pref === 'none') return N.stripMarks(c, text);
  const lv = lex ? N.markLevel(UI.C, UI.L, c, lex.id || lex, pref) : N.textMarkLevel(UI.C, UI.L, c, text, pref);
  return N.fadeMarks(c, text, lv);
}
/** Until the letter stage is complete, Arabic and Hebrew words show their transliteration (§5.5). */
const needTranslit = c => { try { return N.needsTranslit(UI.C, UI.L, c); } catch (e) { return false; } };
function marksSettings() {
  const langs = UI.C.languages.filter(c => LX(c).language.vowelMarks);
  if (!langs.length) return null;
  return h('div', { class: 'lx-marklevels' }, ...langs.map(c => h('label', { class: 'lx-setrow' }, info(c).flag, ' ', info(c).name, ' — vowel marks: ',
    h('select', { 'aria-label': `Vowel marks in ${info(c).name}`, 'data-lang': c, onchange: e => { UI.prefs.markLevel = { ...(UI.prefs.markLevel || {}), [c]: e.target.value }; save(); } },
      ...[['full', 'always all of them'], ['fading', 'fading: on new words, fewer on known ones'], ['none', 'none (unvocalized)']].map(([v2, t]) => h('option', { value: v2, selected: ((UI.prefs.markLevel || {})[c] || 'full') === v2 ? true : null }, t))))),
    h('p', { class: 'tiny' }, 'Fading: a new word shows every mark; once you know it for reading only the šadda / dagesh stay; once you can write it, none. Drills about the marks always show them.'));
}

/* ---------- typing in any script: on-screen keyboards, pinyin input, umlauts (§8) ---------- */
const keyBtn = (label, onclick, extra = {}) => h('button', { type: 'button', class: 'lx-key', onmousedown: e => e.preventDefault(), onclick, ...extra }, label);
/** An answer field for language c: the physical keyboard always works; ar/he get an on-screen keyboard with the vowel marks, zh a pinyin
 *  box (tone numbers → marks) whose characters are chosen, de the ä ö ü ß buttons. → {el, input, insert} */
function scriptInput(c, { placeholder = '', onEnter = null, cls = '', autofocus = false } = {}) {
  const X = LX(c), M = N.scriptModule(UI.C, c);
  const input = h('input', { class: 'noema-input lx-typein2 ' + cls, lang: c, dir: X.language.dir || 'ltr', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': placeholder || `Your answer in ${info(c).name}` });
  const wrap = h('div', { class: 'lx-input', 'data-lang': c }, input);
  const insert = s => {
    const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
    input.setRangeText(s, a, b, 'end'); input.focus(); input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const backspace = () => {   // one letter with its marks (a grapheme), not half of it
    const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
    if (a !== b) { input.setRangeText('', a, b, 'end'); return; }
    const before = clusters(input.value.slice(0, a)); if (!before.length) return;
    const n = before[before.length - 1].length; input.setRangeText('', a - n, a, 'end'); input.focus(); input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && onEnter && !e.isComposing) { e.preventDefault(); onEnter(input.value); } });
  if (c === 'de' || X.language.capitalizeFirst) {
    wrap.append(h('div', { class: 'lx-kbd lx-kbd-de', role: 'group', 'aria-label': 'Special letters' }, ...['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map(ch => keyBtn(ch, () => insert(ch), { 'data-key': ch }))));
  } else if (M?.kind === 'letters' && M.keyboard) {
    const kb = M.keyboard, open = (UI.prefs.kbd || {})[c] !== false;
    const panel = h('div', { class: 'lx-kbd', lang: c, dir: 'rtl', role: 'group', 'aria-label': `${info(c).name} keyboard`, hidden: open ? null : true },
      ...kb.rows.map(r => h('div', { class: 'lx-kbdrow' }, ...r.split(' ').map(ch => keyBtn(ch, () => insert(ch), { 'data-key': ch, title: M.items[ch]?.name || '' })))),
      h('div', { class: 'lx-kbdrow lx-kbdmarks' }, ...(kb.marks || []).map(m => keyBtn('◌' + m, () => insert(m), { 'data-key': m, title: M.markInfo[m]?.name || (m === 'ׁ' ? 'shin dot' : m === 'ׂ' ? 'sin dot' : '') }))),
      h('div', { class: 'lx-kbdrow' }, ...(kb.punct || []).map(p => keyBtn(p, () => insert(p), { 'data-key': p })), keyBtn('␣', () => insert(' '), { class: 'lx-key lx-keywide', 'data-key': ' ', title: 'space' }), keyBtn('⌫', backspace, { class: 'lx-key lx-keywide', title: 'delete' })));
    const tog = h('button', { type: 'button', class: 'btn ghost small lx-kbdtoggle', 'aria-expanded': open ? 'true' : 'false', title: 'On-screen keyboard', onclick: () => {
      panel.hidden = !panel.hidden; tog.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true'); UI.prefs.kbd = { ...(UI.prefs.kbd || {}), [c]: !panel.hidden }; save(); input.focus(); } }, '⌨️');
    wrap.insertBefore(tog, input.nextSibling); wrap.append(panel);
  } else if (c === 'zh' || X.language.romanization === 'pinyin') {
    const K = N.known(UI.C, UI.L, c).R;
    const py = h('input', { class: 'noema-input lx-pyin', lang: 'zh-Latn-pinyin', placeholder: 'pinyin, e.g. ni3hao3 or nihao', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Type pinyin, then choose the characters' });
    const prev = h('span', { class: 'lx-pyprev', lang: 'zh-Latn-pinyin' }), cands = h('div', { class: 'lx-cands', role: 'listbox', 'aria-label': 'Characters' });
    const refresh = () => {
      const r = N.pinyinCandidates(UI.C, c, py.value, { known: K }); prev.textContent = r.marks ? '→ ' + r.marks : ''; cands.innerHTML = '';
      r.candidates.forEach((x, i) => cands.append(h('button', { type: 'button', class: 'lx-cand', role: 'option', 'data-text': x.text, title: x.gloss, onmousedown: e => e.preventDefault(),
        onclick: () => { insert(x.text); py.value = ''; refresh(); py.focus(); } }, word(c, x.text, { sub: false }), h('span', { class: 'tiny' }, ' ' + x.pinyin + (x.gloss ? ' · ' + x.gloss.split(/[;,(]/)[0] : '')))));
    };
    py.addEventListener('input', refresh);
    py.addEventListener('keydown', e => {
      if ((e.key === ' ' || e.key === 'Enter') && cands.firstChild && py.value.trim()) { e.preventDefault(); cands.firstChild.click(); }
      else if (e.key === 'Enter' && !py.value.trim() && onEnter) { e.preventDefault(); onEnter(input.value); }
      else if (e.key === 'Backspace' && !py.value) { e.preventDefault(); input.value = [...input.value].slice(0, -1).join(''); }
    });
    wrap.append(h('div', { class: 'lx-pybox' }, h('span', { class: 'tiny' }, '拼 '), py, prev), cands);
  }
  if (autofocus) setTimeout(() => input.focus(), 40);
  return { el: wrap, input, insert };
}
/** Typing in the production exercise (exProduce): offered once the letter stage is complete (ar, he: tiles until then, §5.5),
 *  always for Chinese (pinyin → characters) and the Latin script. onAnswer(ok, typed). */
function produceTyping(c, lid, onAnswer) {
  const X = LX(c), me = X.lex[lid];
  if (N.scriptModule(UI.C, c)?.kind === 'letters' && needTranslit(c)) return null;
  const si = scriptInput(c, { placeholder: 'or type it…', cls: 'lx-typein', onEnter: v => {
    const t = N.nfc(v.trim()); if (!t) return;
    const r = N.checkTyped(UI.C, c, lid, t), ok = r.ok || (X.language.capitalizeFirst && t.toLowerCase() === N.nfc(me.lemma).toLowerCase() && me.pos !== 'NOUN');
    onAnswer(ok, t, r);
  } });
  return si.el;
}

/* ---------- recording: a letter / character (the script stage) or a word ---------- */
function scriptRecord(it, ok) {
  const day = today(), g = ok ? 'good' : 'again';
  try {
    if (it.glyph && it.track) N.reviewGlyph(UI.C, UI.L, it.lang, it.glyph, it.track, g, day);
    if (it.lex && it.track && ['seen', 'learning', 'known_r', 'known_p', 'mastered'].includes(N.itemState(UI.C, UI.L, it.lang, it.lex, {}))) N.review(UI.C, UI.L, it.lang, it.lex, it.track, g, day);
  } catch (e) { console.warn(e); }
  save();
}
function asText(c, s, how) {
  const X = LX(c);
  if (how === 'latin') return h('span', { class: 'lx-latin', lang: c === 'zh' ? 'zh-Latn-pinyin' : c + '-Latn', dir: 'ltr' }, s);
  if (how === 'glyph') return h('span', { class: 'lx-w lx-glyph', lang: c, dir: X.language.dir || 'ltr' }, s);
  if (how === 'word') return word(c, s, { sub: false, marks: 'full' });
  return wordsIn(c, s);
}
const scriptFb = (box, ok, it, extra) => box.append(h('div', { class: 'lx-fb ' + (ok ? 'ok' : 'bad') }, ok ? '✅ ' : '❌ ', wordsIn(it.lang, it.why || ''), extra || null));

/* ---------- widgets (one per exercise type, §6.1) ---------- */
function scriptChoose(it, done) {
  const box = h('div', { class: 'lx-ex lx-exscript', 'data-kind': it.kind || it.type, 'data-type': it.type });
  const opts = it.options.map(o => ({ label: asText(it.lang, o, it.optionsAs), ok: o === it.answer }));
  box.append(it.ask ? h('div', { class: 'lx-q' }, wordsIn(it.lang, it.ask)) : null, h('div', { class: 'lx-prompt' }, asText(it.lang, it.prompt, it.promptAs)),
    options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); scriptRecord(it, !!o.ok); scriptFb(box, !!o.ok, it); done(!!o.ok); }));
  return box;
}
/** Tiles → a sequence (letters of a word, components of a character). check(seq) → ok. */
function tilesWidget(it, { box, tiles, size, show, check, label }) {
  const X = LX(it.lang), built = [], slot = h('div', { class: 'lx-slot', lang: it.lang, dir: X.language.dir || 'ltr', 'aria-live': 'polite' }), pool = h('div', { class: 'lx-tiles', lang: it.lang, dir: X.language.dir || 'ltr' });
  let over = false;
  const draw = () => { slot.textContent = built.length ? show(built.map(b => b.t)) : '…'; };
  const end = ok => { over = true; [...pool.children].forEach(b => b.disabled = true); slot.classList.add(ok ? 'right' : 'wrong'); scriptRecord(it, ok); scriptFb(box, ok, it); box._done(ok); };
  tiles.forEach((t, i) => pool.append(h('button', { class: 'lx-tile1', 'data-i': i, 'data-t': t, 'aria-label': label ? label(t) : t, onclick: e => {
    if (over || e.currentTarget.disabled) return; built.push({ t, i }); e.currentTarget.disabled = true; draw(); if (built.length === size) end(check(built.map(b => b.t))); } }, t)));
  const undo = h('button', { class: 'btn small ghost', onclick: () => { if (over || !built.length) return; const b = built.pop(); pool.children[b.i].disabled = false; draw(); } }, '⌫');
  const give = h('button', { class: 'btn small ghost', onclick: () => { if (!over) end(false); } }, 'Show me');
  draw(); box.append(slot, pool, h('div', { class: 'row' }, undo, give));
}
WIDGETS.glyph_form = (it, done) => {
  if (it.kind !== 'join') return scriptChoose(it, done);
  const box = h('div', { class: 'lx-ex lx-exscript lx-exjoin', 'data-kind': 'join', 'data-type': it.type }); box._done = done;
  box.append(h('div', { class: 'lx-q' }, `Write it in ${info(it.lang).name} — tap its letters in order${it.lang === 'he' ? ' (mind the final forms)' : ' (they join by themselves)'}:`), h('div', { class: 'lx-prompt lx-meaning' }, it.prompt));
  tilesWidget(it, { box, tiles: it.tiles, size: it.letters.length, show: s => s.join(''), check: s => s.join('') === it.answer, label: t => N.scriptModule(UI.C, it.lang)?.items[t]?.name || t });
  return box;
};
WIDGETS.transliterate = scriptChoose;
WIDGETS.char_compose = (it, done) => {
  if (it.kind !== 'compose') return scriptChoose(it, done);
  const box = h('div', { class: 'lx-ex lx-exscript lx-excompose', 'data-kind': 'compose', 'data-type': it.type }); box._done = done;
  const LAYOUT = { '⿰': 'left | right', '⿱': 'top / bottom', '⿲': 'left | middle | right', '⿳': 'top / middle / bottom', '⿴': 'outside around inside', '⿵': 'open below', '⿶': 'open above', '⿷': 'open right', '⿸': 'top-left around', '⿹': 'top-right around', '⿺': 'bottom-left around', '⿻': 'overlapping' };
  box.append(h('div', { class: 'lx-q' }, `Build the character from its parts (${LAYOUT[it.layout] || it.layout}):`), h('div', { class: 'lx-prompt lx-meaning' }, it.prompt, it.reading ? h('span', { class: 'lx-latin tiny', lang: 'zh-Latn-pinyin' }, ' ' + it.reading) : null),
    it.hint ? h('div', { class: 'tiny' }, '💡 ', wordsIn('zh', it.hint)) : null);
  tilesWidget(it, { box, tiles: it.tiles, size: it.answer.length, show: s => s.join(' + '), check: s => s.slice().sort().join('') === it.answer.slice().sort().join('') });
  return box;
};
WIDGETS.vowelize = (it, done) => {
  const M = N.scriptModule(UI.C, it.lang), X = LX(it.lang);
  const box = h('div', { class: 'lx-ex lx-exscript lx-exvowel', 'data-kind': 'vowelize', 'data-type': it.type });
  const cur = it.letters.map(l => ({ ...l, mine: [] })); let sel = cur.findIndex(l => !l.sep), over = false;
  const row = h('div', { class: 'lx-vrow', lang: it.lang, dir: X.language.dir || 'rtl' }), preview = h('div', { class: 'lx-w lx-vpreview', lang: it.lang, dir: X.language.dir || 'rtl', 'aria-live': 'polite' });
  const draw = () => { preview.textContent = N.nfc(cur.map(l => l.base + l.mine.join('')).join('')); row.innerHTML = ''; cur.forEach((l, i) => row.append(l.sep ? h('span', { class: 'lx-vsep' }, l.base) : h('button', { type: 'button', class: 'lx-vletter' + (i === sel ? ' on' : '') + (l.state ? ' ' + l.state : ''), 'data-i': i, 'aria-pressed': i === sel ? 'true' : 'false', 'aria-label': `letter ${i + 1}`,
    onclick: () => { if (over) return; sel = i; draw(); row.querySelector('.lx-vletter.on')?.focus(); } }, N.nfc(l.base + l.mine.join(''))))); };
  const kindOf = m => M?.markInfo[m]?.kind || 'vowel';
  const put = m => {
    if (over || sel < 0) return; const l = cur[sel], had = document.activeElement && box.contains(document.activeElement);
    if (l.mine.includes(m)) l.mine = l.mine.filter(x => x !== m);
    else if (kindOf(m) === 'vowel') l.mine = [...l.mine.filter(x => kindOf(x) !== 'vowel'), m];
    else l.mine = [...l.mine, m];
    draw(); if (had) row.querySelector('.lx-vletter.on')?.focus();
  };
  const step = d => { if (over) return; let i = sel; do { i += d; } while (i >= 0 && i < cur.length && cur[i].sep); if (i >= 0 && i < cur.length) { sel = i; draw(); row.querySelector('.lx-vletter.on')?.focus(); } };
  const pal = h('div', { class: 'lx-palette', lang: it.lang }, ...it.palette.map((m, i) => keyBtn(h('span', {}, h('span', { class: 'lx-w', lang: it.lang, dir: X.language.dir }, '◌' + m), h('span', { class: 'tiny' }, ' ' + (M?.markInfo[m]?.name || ''), i < 9 ? h('span', { class: 'lx-k' }, i + 1) : null)), () => put(m), { 'data-mark': m })),
    keyBtn('∅ clear', () => { if (!over && sel >= 0) { cur[sel].mine = []; draw(); } }, { 'data-mark': '' }));
  const check = () => {
    if (over) return; over = true;
    let ok = true; for (const l of cur) if (!l.sep) { const r = l.mine.slice().sort().join('') === l.marks.slice().sort().join(''); l.state = r ? 'right' : 'wrong'; if (!r) ok = false; }
    sel = -1; draw(); scriptRecord(it, ok); scriptFb(box, ok, it, h('div', { class: 'lx-extext' }, word(it.lang, it.text, { sub: false, marks: 'full' }))); done(ok);
  };
  box.tabIndex = -1;
  box.addEventListener('keydown', e => {
    if (over) return;
    if (/^[1-9]$/.test(e.key) && it.palette[+e.key - 1]) { e.preventDefault(); e.stopPropagation(); put(it.palette[+e.key - 1]); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step((e.key === 'ArrowLeft') === (X.language.dir === 'rtl') ? 1 : -1); }
    else if (e.key === 'Enter') { e.preventDefault(); check(); }
  });
  draw();
  box.append(h('div', { class: 'lx-q' }, `Add the vowel marks, letter by letter (tap a letter, then its marks; ← → move, 1–9 marks, Enter checks):`), h('div', { class: 'lx-prompt lx-meaning' }, it.prompt), preview, row, pal,
    h('div', { class: 'row' }, h('button', { class: 'btn primary small lx-check', onclick: check }, 'Check'), h('button', { class: 'btn ghost small', onclick: () => { if (!over) { cur.forEach(l => l.mine = l.marks.slice()); check(); } } }, 'Show me')));
  setTimeout(() => box.focus(), 30);
  return box;
};
WIDGETS.tone_mark = (it, done) => {
  const box = h('div', { class: 'lx-ex lx-exscript lx-extone', 'data-kind': it.mode, 'data-type': it.type });
  const mine = it.answer.map(() => 0); let cur = 0, over = false;
  const syl = h('div', { class: 'lx-tones' });
  const draw = () => { syl.innerHTML = ''; it.chars.forEach((ch, i) => syl.append(h('div', { class: 'lx-tonecol' + (i === cur && !over ? ' on' : ''), 'data-i': i },
    h('div', { class: 'lx-w lx-tonech', lang: 'zh' }, ch), h('div', { class: 'lx-latin', lang: 'zh-Latn-pinyin' }, mine[i] ? N.pinyinNumbersToMarks(it.bases[i] + (mine[i] === 5 ? '' : mine[i])) : it.bases[i]),
    h('div', { class: 'lx-toneopts' }, ...[1, 2, 3, 4, 5].map(t => h('button', { type: 'button', class: 'lx-tonebtn' + (mine[i] === t ? ' on' : '') + (over ? (t === it.answer[i] ? ' right' : mine[i] === t ? ' wrong' : '') : ''), 'data-tone': t, 'aria-label': `syllable ${i + 1}: tone ${t === 5 ? 'neutral' : t}`,
      onclick: () => { if (over) return; mine[i] = t; cur = Math.min(i + 1, it.chars.length - 1); draw(); if (mine.every(Boolean)) check(); } }, t === 5 ? '·' : N.pinyinNumbersToMarks('a' + t))))))); };
  const check = () => { if (over) return; over = true; const ok = mine.every((t, i) => t === it.answer[i]); draw(); scriptRecord(it, ok); scriptFb(box, ok, it); done(ok); };
  box.tabIndex = -1;
  box.addEventListener('keydown', e => { if (!over && /^[1-5]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); mine[cur] = +e.key; cur = Math.min(cur + 1, it.chars.length - 1); draw(); if (mine.every(Boolean)) check(); } });
  draw();
  box.append(h('div', { class: 'lx-q' }, it.mode === 'spoken' ? 'How is it said? (the tones change in speech)' : 'Mark the tone of every syllable (keys 1–5, 5 = neutral):'),
    h('div', { class: 'lx-prompt lx-meaning' }, it.prompt, it.mode === 'spoken' ? h('div', { class: 'tiny' }, 'written: ', h('span', { class: 'lx-latin', lang: 'zh-Latn-pinyin' }, it.bases.map((b, i) => N.pinyinNumbersToMarks(b + (it.written[i] === 5 ? '' : it.written[i]))).join(' '))) : null), syl,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => { if (!over) { mine.fill(0); check(); } } }, 'Show me')));
  setTimeout(() => box.focus(), 30);
  return box;
};
WIDGETS.spell = (it, done) => {
  const X = LX(it.lang), box = h('div', { class: 'lx-ex lx-exscript lx-exspell', 'data-kind': 'spell', 'data-type': it.type });
  let over = false;
  const out = h('div', { class: 'lx-diff', lang: it.lang, dir: X.language.dir || 'ltr' });
  const finish = (ok, r) => {
    over = true; si.input.disabled = true; scriptRecord(it, ok);
    if (r && !ok) { out.append(...r.diff.map(d => h('span', { class: 'lx-d d-' + d.op, title: d.op === 'wrong' ? `you: ${d.t} · right: ${d.want}` : d.op }, d.op === 'wrong' ? d.want : d.t))); }
    scriptFb(box, ok, it, r?.notes?.length ? h('ul', { class: 'lx-list tiny' }, ...r.notes.map(n => h('li', {}, n))) : null); done(ok);
  };
  const si = scriptInput(it.lang, { placeholder: `Type it in ${info(it.lang).name}…`, autofocus: true, onEnter: v => { if (over || !v.trim()) return; const r = N.checkTyped(UI.C, it.lang, it.lex, v, { forms: it.also }); finish(r.ok, r); } });
  box.append(h('div', { class: 'lx-q' }, `Write it in ${info(it.lang).name}:`), h('div', { class: 'lx-prompt lx-meaning' }, it.concept ? conceptPic(it.concept, 'lx-exemoji') : '', ' ', it.prompt), si.el, out,
    h('div', { class: 'row' }, h('button', { class: 'btn primary small lx-check', onclick: () => { if (!over && si.input.value.trim()) { const r = N.checkTyped(UI.C, it.lang, it.lex, si.input.value, { forms: it.also }); finish(r.ok, r); } } }, 'Check'),
      h('button', { class: 'btn ghost small', onclick: () => { if (!over) finish(false, null); } }, 'Show me')));
  return box;
};
WIDGETS.trace = (it, done) => {
  const X = LX(it.lang), box = h('div', { class: 'lx-ex lx-exscript lx-extrace', 'data-kind': it.check, 'data-type': it.type });
  const S = 280, cv = h('canvas', { class: 'lx-canvas', width: S * 2, height: S * 2, 'aria-label': `Draw ${it.glyph}`, role: 'img' }), g = cv.getContext('2d');
  const toBox = (x, y) => [x / S * 1024, 900 - y / S * 1024], toCv = (x, y) => [x / 1024 * S * 2, (900 - y) / 1024 * S * 2];
  const strokes = [], med = it.medians || []; let curStroke = null, next = 0, misses = 0, over = false, hint = false;
  const ghost = () => {
    g.clearRect(0, 0, S * 2, S * 2); g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(127,127,127,.25)'; g.lineWidth = 1.5; g.strokeRect(1, 1, S * 2 - 2, S * 2 - 2); g.beginPath(); g.moveTo(S, 0); g.lineTo(S, S * 2); g.moveTo(0, S); g.lineTo(S * 2, S); g.stroke();
    if (it.check === 'medians') med.forEach((m, i) => { g.strokeStyle = i < next ? 'rgba(46,160,90,.85)' : hint && i === next ? 'rgba(230,140,0,.7)' : 'rgba(127,127,127,.22)'; g.lineWidth = 34; g.beginPath(); m.forEach((p, j) => { const [x, y] = toCv(p[0], p[1]); j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); });
    else { g.fillStyle = 'rgba(127,127,127,.18)'; g.font = `${S * 1.3}px ${it.lang === 'ar' ? "'Noto Naskh Arabic', serif" : "'Noto Sans Hebrew', sans-serif"}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(it.glyph, S, S * 1.05); }
    g.strokeStyle = 'rgba(40,40,40,.9)'; g.lineWidth = 9; for (const s of strokes) { g.beginPath(); s.forEach(([x, y], j) => j ? g.lineTo(x * 2, y * 2) : g.moveTo(x * 2, y * 2)); g.stroke(); }
  };
  const status = h('div', { class: 'tiny lx-tracestatus', 'aria-live': 'polite' });
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * S, (e.clientY - r.top) / r.height * S]; };
  cv.addEventListener('pointerdown', e => { if (over) return; e.preventDefault(); cv.setPointerCapture?.(e.pointerId); curStroke = [pos(e)]; strokes.push(curStroke); ghost(); });
  cv.addEventListener('pointermove', e => { if (!curStroke) return; e.preventDefault(); curStroke.push(pos(e)); ghost(); });
  const up = () => {
    if (!curStroke) return; const s = curStroke; curStroke = null;
    if (it.check !== 'medians' || over) return;
    if (s.length < 2) { strokes.pop(); ghost(); return; }
    const r = N.strokeMatch(s.map(([x, y]) => toBox(x, y)), med[next]);
    if (r.ok) { next++; strokes.pop(); hint = false; status.textContent = `stroke ${next} of ${med.length} ✓`; if (next === med.length) end(misses <= 1); }
    else { strokes.pop(); misses++; hint = misses >= 2; status.textContent = r.reversed ? 'the other way round — strokes go from where they start' : `not stroke ${next + 1} — ${hint ? 'follow the orange one' : 'try again'}`; }
    ghost();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
  const end = ok => { if (over) return; over = true; next = med.length; ghost(); scriptRecord(it, ok); scriptFb(box, ok, it, it.check === 'medians' ? h('div', { class: 'tiny' }, `${misses} wrong stroke${misses === 1 ? '' : 's'}`) : null); done(ok); };
  const demo = () => {   // the stroke order, one stroke after another
    if (it.check !== 'medians') return; let i = 0; const was = next; next = 0; ghost();
    const t = setInterval(() => { if (i >= med.length || !box.isConnected) { clearInterval(t); next = over ? med.length : was; ghost(); return; } next = ++i; ghost(); }, 420);
  };
  ghost();
  box.append(h('div', { class: 'lx-q' }, it.check === 'medians' ? `Write ${it.glyph} stroke by stroke (in the right order):` : `Trace the letter, then compare it with the model:`),
    h('div', { class: 'lx-prompt lx-meaning' }, h('span', { class: 'lx-w', lang: it.lang, dir: X.language.dir || 'ltr' }, it.glyph), ' ', h('span', { class: 'tiny' }, [it.prompt, it.reading].filter(Boolean).join(' · '))),
    h('div', { class: 'lx-canvaswrap' }, cv), status,
    h('div', { class: 'row' }, it.check === 'medians' ? h('button', { class: 'btn ghost small', onclick: demo }, '▶ Stroke order') : null,
      h('button', { class: 'btn ghost small', onclick: () => { if (!over) { strokes.length = 0; ghost(); } } }, 'Clear'),
      it.check === 'medians' ? h('button', { class: 'btn ghost small', onclick: () => end(false) }, 'Show me')
        : [h('button', { class: 'btn primary small lx-selfok', onclick: () => end(true) }, '✓ Looks right'), h('button', { class: 'btn ghost small lx-selfno', onclick: () => end(false) }, '✗ Not yet')]));
  box._strokeTest = { toBox, med, draw: pts => { if (over) return; curStroke = pts.map(([x, y]) => [x / 1024 * S, (900 - y) / 1024 * S]); strokes.push(curStroke); up(); } };   // tests draw a stroke in box coordinates
  return box;
};
/** Does a word contain this letter (with or without dagesh / dots) or this vowel mark? */
const hasGlyph = (c, x, key) => N.scriptModule(UI.C, c)?.items[key]?.type === 'mark' ? N.nfc(x.lemma).includes(key) : N.letterClusters(UI.C, c, x.lemma).some(cl => cl.letter === key || cl.base === key);
/** A new letter: its shapes, sound, name and a word that has it (ar, he). */
function glyphIntro(c, key, done) {
  const M = N.scriptModule(UI.C, c), it = M.items[key], X = LX(c);
  const ex = Object.values(X.lex).filter(x => !x.prefix && hasGlyph(c, x, key) && x.translit).sort((a, b) => a.lemma.length - b.lemma.length)[0];
  const forms = Object.entries(it.forms || {}).filter(([, f]) => f);
  const box = h('div', { class: 'lx-ex lx-intro lx-glyphintro', 'data-kind': 'glyph_intro', 'data-glyph': key },
    h('div', { class: 'lx-q' }, `New in ${info(c).flag} ${info(c).name}: ${it.type === 'mark' ? 'a vowel mark' : 'a letter'}`),
    h('div', { class: 'lx-prompt' }, h('span', { class: 'lx-w lx-glyph', lang: c, dir: X.language.dir }, it.type === 'mark' ? '◌' + key : key)),
    h('div', { class: 'lx-meaning' }, h('b', {}, it.name), ' · ', h('span', { class: 'lx-latin' }, it.translit || '—'), it.sound ? ` · [${it.sound}]` : '', it.what ? ' · ' + it.what : ''),
    forms.length > 1 ? h('dl', { class: 'lx-parts lx-forms' }, ...forms.flatMap(([p, f]) => [h('dt', {}, p), h('dd', {}, h('span', { class: 'lx-w lx-glyph', lang: c, dir: X.language.dir }, f))])) : null,
    it.note ? h('p', { class: 'tiny' }, it.note) : null,
    (M.look[key] || []).length ? h('p', { class: 'tiny' }, '👀 Do not mix up with ', ...(M.look[key] || []).flatMap((b, i) => [i ? ' · ' : '', h('span', { class: 'lx-w', lang: c }, b), ' ', M.items[b]?.name || ''])) : null,
    ex ? h('div', { class: 'lx-ex1' }, word(c, ex.lemma, { lex: ex, marks: 'full' }), h('div', { class: 'tiny' }, ex.translit, ' — ', gloss(c, ex.id))) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary lx-next', onclick: () => { N.introduceGlyph(UI.C, UI.L, c, key, today()); save(); done(true); } }, 'Got it →')));
  return box;
}
/** The card of a letter or a character (tap in the lane). */
function glyphCard(c, key) {
  const M = N.scriptModule(UI.C, c), it = M.items[key], X = LX(c), st = N.scriptState(UI.C, UI.L, c).items[key];
  const words = M.kind === 'chars' ? (M.words[key] || []).slice(0, 12) : Object.values(X.lex).filter(x => !x.prefix && hasGlyph(c, x, key)).slice(0, 10).map(x => x.id);
  const body = M.kind === 'chars'
    ? [h('div', { class: 'lx-prompt' }, h('span', { class: 'lx-w lx-glyph', lang: 'zh' }, key)),
      h('dl', { class: 'lx-parts' }, ...[['reading', [...(it.readings || []), ...(it.wordReadings || [])].join(' · ')], ['meaning', it.meaning], ['traditional', (it.trad || []).join(' ')], ['parts', it.ids], ['radical', it.radical], ['strokes', it.medians?.length || it.strokes], ['how it is built', [it.etymology?.type, it.etymology?.hint].filter(Boolean).join(': ')]]
        .filter(([, v2]) => v2).flatMap(([k2, v2]) => [h('dt', {}, k2), h('dd', {}, wordsIn('zh', String(v2)))]))]
    : [h('div', { class: 'lx-prompt' }, h('span', { class: 'lx-w lx-glyph', lang: c, dir: X.language.dir }, it.type === 'mark' ? '◌' + key : key)),
      h('dl', { class: 'lx-parts' }, ...[['name', it.name], ['transliteration', it.translit], ['sound', it.sound && `[${it.sound}]`], ['what it does', it.what], ['joins', it.joins && { dual: 'to both sides', right: 'only to the letter before it', none: 'to no letter' }[it.joins]], ['note', it.note]].filter(([, v2]) => v2).flatMap(([k2, v2]) => [h('dt', {}, k2), h('dd', {}, v2)])),
      Object.keys(it.forms || {}).length > 1 ? h('dl', { class: 'lx-parts lx-forms' }, ...Object.entries(it.forms).flatMap(([p, f]) => [h('dt', {}, p), h('dd', {}, h('span', { class: 'lx-w lx-glyph', lang: c, dir: X.language.dir }, f))])) : null];
  const pop = h('div', { class: 'lx-pop', role: 'dialog', 'aria-label': it.name || key, onclick: e => { if (e.target === pop) pop.remove(); } },
    h('div', { class: 'lx-popbox lx-glyphcard', 'data-glyph': key }, h('div', { class: 'row' }, h('b', {}, it.name || it.meaning || key), h('span', { class: 'lx-badge st s-' + st }, STATE_LABEL[st] || st), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost small', onclick: () => pop.remove() }, '✕')),
      ...body, words.length ? h('div', { class: 'lx-sec' }, h('b', {}, 'In words of the course'), h('ul', { class: 'lx-list' }, ...words.map(id => h('li', {}, word(c, X.lex[id].lemma, { lex: X.lex[id] }), ' — ', gloss(c, id))))) : null,
      (it.medians || M.kind === 'letters') && it.type !== 'mark' ? h('button', { class: 'btn small', onclick: () => { pop.remove(); runScriptDrill(c, 'trace', { only: key }); } }, '✍️ Trace it') : null));
  document.body.append(pop);
}

/* ---------- the 🔤 script lane ---------- */
const SCRIPT_TITLE = { glyph_form: ['🔣', 'Letter forms'], transliterate: ['🔤', 'Reading'], vowelize: ['◌َ', 'Vowel marks'], tone_mark: ['〽️', 'Tones'], char_compose: ['🧩', 'Building characters'], trace: ['✍️', 'Tracing'], spell: ['⌨️', 'Spelling'], learn: ['🆕', 'The next letters'] };
function scriptHomeButtons() {
  return activeLangs().map(c => h('button', { class: 'btn ghost small lx-scriptbtn', 'data-lang': c, onclick: () => go('#/script/' + c) }, '🔤 ', info(c).flag, ' ', N.scriptModule(UI.C, c) ? (N.scriptModule(UI.C, c).kind === 'chars' ? 'Characters' : 'Letters') : 'Spelling'));
}
VIEWS.script = (v, r) => {
  const c = r.arg && UI.C.lang[r.arg] ? r.arg : UI.lang, M = N.scriptModule(UI.C, c), X = LX(c);
  if (c !== UI.lang) { UI.lang = c; UI.prefs.lang = c; save(); }
  v.classList.add('lx-scriptview'); v.dataset.lang = c;
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, '🔤 ', M ? (M.kind === 'chars' ? 'Characters' : 'Letters') : 'Spelling', ' — ', info(c).flag, ' ', info(c).name),
    h('div', { class: 'row' }, flagRail(null, c, x => go('#/script/' + x))));
  const drills = h('div', { class: 'row lx-drills lx-scriptdrills' }, ...N.scriptTypes(UI.C, c).map(t => h('button', { class: 'btn small', 'data-type': t, onclick: () => runScriptDrill(c, t) }, SCRIPT_TITLE[t][0] + ' ' + SCRIPT_TITLE[t][1])),
    N.scriptTypes(UI.C, c).length > 1 ? h('button', { class: 'btn small primary', 'data-type': 'mix', onclick: () => runScriptDrill(c, null) }, '▶ Mixed') : null);
  if (!M) {
    v.append(h('p', { class: 'lx-note' }, `${info(c).name} is written in the ${X.language.script === 'Latn' ? 'Latin alphabet' : X.language.script}${c === 'de' ? ': ä ö ü and ß are letters of their own, every noun starts with a capital letter' : ''}. Spelling drills use the words you have met; the buttons under the answer field type the special letters.`), drills);
    return;
  }
  const ss = N.scriptState(UI.C, UI.L, c);
  const pct = ss.total ? Math.round(ss.known / ss.total * 100) : 0;
  const fresh = M.kind === 'letters' ? ss.groups.filter(g => ss.open.includes(g.id)).flatMap(g => g.items).filter(x => ss.items[x] === 'ready') : [];
  v.append(h('div', { class: 'lx-card lx-stagemeter', 'data-stage': ss.stage },
    h('div', { class: 'row' }, h('b', {}, `Stage ${ss.stage} of ${ss.stages}`), h('span', { class: 'tiny' }, `${ss.known} of ${ss.total} ${M.kind === 'chars' ? 'characters' : 'letters and marks'} known · ${ss.introduced} met`), ss.complete ? h('span', { class: 'lx-badge st s-known_p' }, '✅ complete') : null),
    h('div', { class: 'lx-progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: pct + '%' } })),
    h('p', { class: 'tiny' }, M.kind === 'chars' ? 'A character is known when you know a word with it (or from its own drills). The groups follow the lessons.'
      : ss.complete ? 'Every letter is known: words may now be typed, and transliteration follows your setting.' : 'Letters come in groups of similar shapes; the next group opens when you have practised this one. Until every letter is known, words show their transliteration and you write them with tiles.'),
    fresh.length ? h('button', { class: 'btn primary lx-learnletters', onclick: () => runScriptDrill(c, 'learn') }, `🆕 Learn ${fresh.length === 1 ? 'the next one' : 'the next ' + Math.min(fresh.length, 6)}`) : null), drills);
  for (const [gi, g] of ss.groups.entries()) {
    const isOpen = ss.open.includes(g.id);
    if (M.kind === 'chars' && !isOpen && g.state === 'new' && gi > ss.groups.findIndex(x => x.state === 'new') + 2) continue;   // characters: the near groups only
    v.append(h('details', { class: 'lx-sec lx-glyphgroup', open: isOpen ? true : null, 'data-group': g.id }, h('summary', {}, g.title, h('span', { class: 'tiny' }, ` · ${g.known}/${g.items.length} known${isOpen ? '' : g.state === 'new' ? ' · 🔒 later' : ''}`)),
      h('div', { class: 'lx-glyphs' + (isOpen || g.state !== 'new' ? '' : ' lx-later') }, ...g.items.map(key => {
        const it = M.items[key], st = ss.items[key];
        return h('button', { class: 'lx-gtile s-' + st, 'data-glyph': key, title: `${it.name || it.meaning || ''} — ${STATE_LABEL[st] || st}`, onclick: () => glyphCard(c, key) },
          h('span', { class: 'lx-w lx-glyph', lang: c, dir: X.language.dir || 'ltr' }, it.type === 'mark' ? '◌' + key : key),
          h('span', { class: 'lx-gname' }, M.kind === 'chars' ? h('span', { class: 'lx-latin', lang: 'zh-Latn-pinyin' }, (it.readings || it.wordReadings || [])[0] || '') : it.translit || '·'),
          h('span', { class: 'lx-gsub tiny' }, M.kind === 'chars' ? (it.meaning || '').split(/[;,]/)[0] : it.name));
      }))));
  }
};
/** A drill of the lane: up to 10 items of one type (or mixed, or the next letters), one after the other; answers are recorded as they come. */
function runScriptDrill(c, type, { only = null } = {}) {
  const day = today(), queue = [];
  if (type === 'learn') {
    const ss = N.scriptState(UI.C, UI.L, c), M = N.scriptModule(UI.C, c);
    const fresh = ss.groups.filter(g => ss.open.includes(g.id)).flatMap(g => g.items).filter(x => ss.items[x] === 'ready').slice(0, 6);
    for (const key of fresh) queue.push({ intro: key });
    const L2 = JSON.parse(JSON.stringify(UI.L)); for (const key of fresh) N.introduceGlyph(UI.C, L2, c, key, day);   // the questions as if the letters were met
    const its = N.scriptItems(UI.C, L2, c, { type: 'transliterate', max: 60 }).filter(x => fresh.includes(x.glyph) && x.kind === 'letter');
    for (const key of fresh) { const x = its.find(y => y.glyph === key); if (x) queue.push({ item: x }); }
    if (M.kind === 'letters') for (const x of N.scriptItems(UI.C, L2, c, { type: 'glyph_form', max: 30 }).filter(y => fresh.includes(y.glyph)).slice(0, 3)) queue.push({ item: x });
  } else {
    let its = N.scriptItems(UI.C, UI.L, c, { type: type || undefined, max: only ? 400 : 10 });
    if (only) its = its.filter(x => x.glyph === only).slice(0, 1);
    for (const x of its) queue.push({ item: x });
  }
  const m = $('.lx-main'); m.innerHTML = '';
  const bar = h('div', { class: 'lx-progress' }, h('i')), stage = h('div', { class: 'lx-stage' });
  const title = type ? SCRIPT_TITLE[type].join(' ') : '▶ Mixed';
  m.append(h('div', { class: 'view lx-view lx-session lx-scriptrun', 'data-lang': c, 'data-type': type || 'mix' }, h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => { save(true); go('#/script/' + c); render(); } }, '✕ Stop'), h('b', { class: 'tiny' }, info(c).flag + ' ' + title), bar), stage));
  if (!queue.length) { stage.append(h('div', { class: 'lx-result' }, h('p', {}, `Nothing to drill here yet in ${info(c).name}: learn some ${N.scriptModule(UI.C, c)?.kind === 'letters' ? 'letters' : 'words'} first.`), h('button', { class: 'btn primary', onclick: () => go('#/script/' + c) }, 'Back'))); return; }
  const total = queue.length, stats = { right: 0, wrong: 0 }; let i = 0;
  const next = () => {
    bar.firstChild.style.width = Math.round(i / total * 100) + '%';
    const a = queue.shift(); stage.innerHTML = '';
    if (!a) {
      save(true); bar.firstChild.style.width = '100%';
      return stage.append(h('div', { class: 'lx-result' }, h('h2', {}, '🎉 Done'), h('p', {}, `${stats.right} right · ${stats.wrong} to practise again`),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => runScriptDrill(c, type) }, '↻ Again'), h('button', { class: 'btn', onclick: () => go('#/script/' + c) }, 'Back to the letters'))));
    }
    i++;
    UI.current = { kind: 'script', lang: c, it: a.item, intro: a.intro };   // what is on screen (tests, the tutor)
    const done = ok => {
      if (a.intro) return next();
      ok ? stats.right++ : stats.wrong++;
      const b = h('button', { class: 'btn primary lx-next' }, 'Next →'); b.onclick = next; stage.append(h('div', { class: 'row lx-nextrow' }, b)); setTimeout(() => b.focus(), 30);
    };
    const ex = a.intro ? glyphIntro(c, a.intro, done) : exItem(a.item, done);
    stage.append(h('div', { class: 'tiny lx-which' }, info(c).flag, ' ', info(c).name), ex);
  };
  document.onkeydown = e => {
    if (!$('.lx-scriptrun')) { document.onkeydown = null; return; }
    if (/^[1-9]$/.test(e.key) && !/input/i.test(document.activeElement?.tagName)) { const b = [...stage.querySelectorAll('.lx-opts:not([data-done]) .lx-opt')][+e.key - 1]; b?.click(); }
  };
  next();
}
/** The script part of the daily session (§5.5): a few items per language in the first weeks — never in the very first session. */
function scriptSessionSteps() {
  const out = [], day = today();
  for (const c of activeLangs()) {
    const seen = Object.values(UI.L.langs[c]?.items || {}).map(x => x.seen).filter(x => x != null);
    if (!seen.length || Math.min(...seen) >= day) continue;
    for (const x of N.scriptSession(UI.C, UI.L, c, day, { n: 3 })) out.push({ kind: 'script', lang: c, lex: null, it: x.item || null, intro: x.intro || null });
  }
  return out;
}
const scriptStep = (a, done) => a.intro ? glyphIntro(a.lang, a.intro, done) : exItem(a.it, done);
Object.assign(window.NoemaLangUI, { script: { scriptInput, shownMarks, runScriptDrill, glyphIntro, glyphCard, scriptSessionSteps, produceTyping } });
