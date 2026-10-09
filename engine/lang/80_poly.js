/* ---------- P6 — the polyglot layer (docs/LANGUAGES.md §6.6, §8, §9) ----------
   Widgets of the five polyglot exercise types, the ⇄ compare lane (#/cmp …), the polyglot drills (#/poly/<type>),
   the word card's bridges (“across your languages”), the strips on the flag card and the function page, today's languages
   on the home. Every answer comes from langcore (N.polyItems, N.bridges, N.compareFn): stored data only. */
const RTL_CODES = ['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv', 'ku-Arab'];
const dirOf = code => UI.C.lang[code] ? (LX(code).language.dir || 'ltr') : RTL_CODES.includes(code) ? 'rtl' : 'ltr';
const flagName = c => [info(c).flag, ' ', info(c).name];
/** A word of a language outside the course (the learner's), with its language and direction. */
const otherWord = (code, text) => h('span', { class: 'lx-w lx-ow', lang: code, dir: dirOf(code) }, text);
const BRIDGE_LABEL = { cognate: '🌉 related', loan: '🔁 loan', falseFriend: '⚠️ false friend' };
const VIA_LABEL = { root: 'same root', etymology: 'etymology', source: 'same source', pitfall: 'noted' };

/* ---------- today's languages (§9.6): chosen on the home among the active ones, for today only ---------- */
function todayLangs() {
  const act = activeLangs(), t = UI.prefs.today;
  if (!t || t.day !== today()) return act;
  const l = act.filter(c => (t.langs || []).includes(c));
  return l.length ? l : act;
}
function todayPicker() {
  const act = activeLangs(); if (act.length < 2) return null;
  const cur = todayLangs();
  return h('div', { class: 'row lx-today', role: 'group', 'aria-label': 'Languages of today’s session' }, h('span', { class: 'tiny' }, '📅 Today: '),
    ...act.map(c => h('button', { class: 'chip lx-todaychip' + (cur.includes(c) ? ' on' : ''), 'data-lang': c, 'aria-pressed': cur.includes(c) ? 'true' : 'false',
      title: cur.includes(c) ? `Leave ${info(c).name} out today` : `Take ${info(c).name} today too`, onclick: () => {
        const s = new Set(cur); if (s.has(c)) s.delete(c); else s.add(c); if (!s.size) return;
        UI.prefs.today = { day: today(), langs: act.filter(x => s.has(x)) }; save(); render();
      } }, ...flagName(c))),
    cur.length < act.length ? h('span', { class: 'tiny' }, ' — tomorrow all of them again') : null);
}
/** The home's polyglot part: today's languages, the compare lane and the polyglot drills. */
function polyHome() {
  const box = h('div', { class: 'lx-polyhome' });
  box.append(todayPicker() || '');
  if (activeLangs().length > 1) box.append(h('div', { class: 'row lx-polydrills' }, h('span', { class: 'tiny' }, '🌐 Across your languages: '),
    h('button', { class: 'btn small', onclick: () => go('#/cmp') }, '⇄ Compare'),
    ...POLY_DRILLS.map(([t, label]) => h('button', { class: 'btn ghost small', 'data-type': t, onclick: () => go('#/poly/' + t) }, label))));
  return box;
}
const POLY_DRILLS = [['which_language', '🔤 Which language?'], ['cognate_bridge', '🌉 Bridges'], ['parallel_translate', '🔀 Translate across'], ['parallel_align', '🧷 Align the words'], ['compare_rule', '⚖️ Which holds where?']];

/* ---------- widgets (it, done) → element (docs/LANGUAGES.md §6.6) ---------- */
WIDGETS.which_language = (it, done) => {
  const box = h('div', { class: 'lx-ex lx-exwhich', 'data-kind': 'which' });
  const shown = it.sentence ? sentenceView(it.lang, LX(it.lang).sentenceById[it.sentence], it.unknown)
    : it.roman ? h('span', { class: 'lx-w lx-roman', lang: it.lang + '-Latn', dir: 'ltr' }, it.prompt) : word(it.lang, it.prompt, { sub: false });
  const holder = h('div', { class: 'lx-prompt lx-hidecol' }, shown);   // the colour of a language would give the answer away until it is given
  const opts = it.options.map(c => ({ label: h('span', { class: 'lx-langopt', 'data-lang': c }, ...flagName(c)), ok: c === it.answer }));
  box.append(h('div', { class: 'lx-q' }, it.sentence ? 'Which of your languages is this sentence in?' : 'Which of your languages is this word from?'), holder,
    options(opts, (o, b, wrap) => {
      b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); holder.classList.remove('lx-hidecol');
      const lx = it.lex && LX(it.lang).lex[it.lex];
      box.append(h('div', { class: 'lx-fb ' + (o.ok ? 'ok' : 'bad') }, o.ok ? '✅ ' : '❌ ', ...flagName(it.answer), ': ', lx ? word(it.lang, lx.lemma, { lex: lx }) : null, ' — ', it.gloss,
        it.pair ? h('div', { class: 'tiny' }, '⇄ It has a relative in another of your languages, asked with it: keep the two apart.') : null));
      done(!!o.ok);
    }));
  return box;
};
const lexWord = (c, id, sub = false) => { const lx = LX(c).lex[id]; return word(c, lx.lemma, { lex: sub ? lx : null, sub }); };
WIDGETS.cognate_bridge = (it, done) => {
  const box = h('div', { class: 'lx-ex lx-exbridge', 'data-kind': it.kind });
  if (it.kind === 'false_friend') {
    const opts = it.pairs.map((p, i) => ({ label: h('span', { class: 'lx-pair' }, info(p.a.lang).flag, ' ', lexWord(p.a.lang, p.a.lex), ' ⇄ ', info(p.b.lang).flag, ' ', lexWord(p.b.lang, p.b.lex)), ok: i === it.answer }));
    box.append(h('div', { class: 'lx-q' }, 'Related look-alikes — which pair is a false friend (it does not mean the same)?'),
      options(opts, (o, b, wrap) => {
        b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok);
        box.append(h('div', { class: 'lx-fb ' + (o.ok ? 'ok' : 'bad') }, o.ok ? '✅ ' : '❌ ', wordsIn(it.lang, it.why || ''),
          h('ul', { class: 'lx-list tiny' }, ...it.pairs.map(p => h('li', {}, lexWord(p.a.lang, p.a.lex), ' = ', gloss(p.a.lang, p.a.lex), ' · ', lexWord(p.b.lang, p.b.lex), ' = ', gloss(p.b.lang, p.b.lex))))));
        done(!!o.ok);
      }));
    return box;
  }
  const prompt = it.kind === 'known'
    ? h('div', { class: 'lx-prompt' }, h('span', { class: 'tiny' }, langName(it.other.code) + ' '), otherWord(it.other.code, it.other.word))
    : h('div', { class: 'lx-prompt' }, info(it.from).flag, ' ', lexWord(it.from, it.lex, true), h('div', { class: 'tiny' }, gloss(it.from, it.lex)));
  const q = it.kind === 'known' ? `A word of ${langName(it.other.code)}, one of your languages — which ${info(it.lang).name} word is linked to it by its origin?` : `Which ${info(it.lang).name} word is related to it?`;
  const opts = it.options.map(id => ({ label: lexWord(it.lang, id), ok: id === it.answer }));
  box.append(h('div', { class: 'lx-q' }, q), prompt, options(opts, (o, b, wrap) => {
    b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok);
    box.append(h('div', { class: 'lx-fb ' + (o.ok ? 'ok' : 'bad') }, o.ok ? '✅ ' : '❌ ', lexWord(it.lang, it.answer, true), ' — ', gloss(it.lang, it.answer), ' ',
      it.kind !== 'known' && BRIDGE_LABEL[it.bridge] ? h('span', { class: 'lx-badge ctx' }, BRIDGE_LABEL[it.bridge]) : it.bridge === 'falseFriend' ? h('span', { class: 'lx-badge ctx' }, BRIDGE_LABEL.falseFriend) : null,
      it.why ? h('div', { class: 'tiny' }, wordsIn(it.lang, it.why)) : null));
    done(!!o.ok);
  }));
  return box;
};
/** Tiles to build a sentence (the core of exBuild): → {el, check} */
function tileBuilder(it, onDone) {
  const X = LX(it.lang), built = [], slot = h('div', { class: 'lx-slot', lang: it.lang, dir: X.language.dir }), pool = h('div', { class: 'lx-tiles', lang: it.lang, dir: X.language.dir });
  const draw = () => { slot.textContent = built.length ? N.joinTokens(built.map(b => ({ t: b.t })), X.language.tokenJoin) + (built.length === it.size ? it.punct : '') : '…'; };
  let over = false;
  const finish = ok => { over = true; slot.classList.add(ok ? 'right' : 'wrong'); [...pool.children].forEach(b => b.disabled = true); onDone(ok); };
  it.tiles.forEach((t, i) => pool.append(h('button', { class: 'lx-tile1', 'data-i': i, onclick: e => { if (over || e.currentTarget.disabled) return; built.push({ t, i }); e.currentTarget.disabled = true; draw(); if (built.length === it.size) finish(N.checkBuilt(UI.C, it.lang, it, built.map(b => b.t))); } }, t)));
  const undo = h('button', { class: 'btn small ghost', onclick: () => { if (over || !built.length) return; const b = built.pop(); pool.children[b.i].disabled = false; draw(); } }, '⌫');
  const giveUp = h('button', { class: 'btn small ghost', onclick: () => { if (!over) finish(false); } }, 'Show me');
  draw();
  return h('div', {}, slot, pool, h('div', { class: 'row' }, undo, giveUp));
}
WIDGETS.parallel_translate = (it, done) => {
  const box = h('div', { class: 'lx-ex lx-exparallel', 'data-kind': 'parallel' }), XF = LX(it.from);
  noteNew(it.from, it.unknownFrom); noteNew(it.lang, it.unknown);
  box.append(h('div', { class: 'lx-q' }, ...flagName(it.from), ' → ', ...flagName(it.lang), ': say the same'),
    h('div', { class: 'lx-prompt' }, sentenceView(it.from, XF.sentenceById[it.source], it.unknownFrom)),
    h('details', { class: 'lx-hint' }, h('summary', { class: 'tiny' }, 'the meaning'), h('div', { class: 'lx-tr' }, it.gloss)));
  if ((it.unknown || []).length) box.append(h('div', { class: 'tiny lx-newwords' }, '🆕 ', ...it.unknown.flatMap((l, i) => [i ? ' · ' : '', h('button', { class: 'btn ghost small', onclick: () => wordPopup(it.lang, l) }, LX(it.lang).lex[l].lemma), ' = ' + gloss(it.lang, l)])));
  box.append(tileBuilder(it, ok => {
    box.append(h('div', { class: 'lx-fb ' + (ok ? 'ok' : 'bad') }, ok ? '✅ ' : '❌ ', sentenceView(it.lang, LX(it.lang).sentenceById[it.sentence], it.unknown), h('div', { class: 'tiny' }, it.gloss)));
    done(ok);
  }));
  return box;
};
WIDGETS.parallel_align = (it, done) => {
  const box = h('div', { class: 'lx-ex lx-exalign', 'data-kind': 'align' }), pv = it.langs[0];
  Object.entries(it.unknown || {}).forEach(([c, u]) => noteNew(c, u));
  const btns = {}, status = h('div', { class: 'lx-q lx-alignq' });
  let r = -1, mistakes = 0, over = false, need = [], found = new Set();
  const tokText = (c, t) => LX(c).language.vowelMarks && UI.prefs.marks === false ? N.stripMarks(c, t) : t;
  const lines = it.langs.map(c => {
    const X = LX(c), s = X.sentenceById[it.sentences[c]], sp = X.language.tokenJoin !== 'none'; btns[c] = {};
    const parts = s.tokens.map((t, i) => {
      if (t.p) return h('span', { class: 'lx-apunct', lang: c }, t.t);
      const b = h('button', { class: 'lx-atok', lang: c, dir: X.language.dir || 'ltr', 'data-i': i, onclick: () => pick(c, i, b) }, tokText(c, t.t));
      btns[c][i] = b; return b;
    });
    return h('div', { class: 'lx-aline', 'data-lang': c, lang: c, dir: X.language.dir || 'ltr' }, h('span', { class: 'lx-aflag', title: info(c).name }, info(c).flag),
      ...parts.flatMap((p, i) => i && sp && !/^[.,!?;:،؟。，！？、)」]/.test(p.textContent) ? [' ', p] : [p]));
  });
  const show = () => {
    r++;
    for (const c of it.langs) for (const b of Object.values(btns[c])) b.classList.remove('lx-focus');
    lines.forEach(l => l.classList.remove('lx-skip'));
    if (r >= it.rows.length) return finish();
    const row = it.rows[r], pb = btns[pv][row.pivot]; pb.classList.add('lx-focus');
    need = Object.keys(row.hits); found = new Set();
    it.langs.forEach((c, i) => { if (c !== pv && !need.includes(c)) lines[i].classList.add('lx-skip'); });
    status.textContent = `${r + 1} / ${it.rows.length} · Tap the word that means “${pb.textContent}” in ${need.map(c => info(c).name).join(' and ')}.`;
  };
  const pick = (c, i, b) => {
    if (over || r < 0 || r >= it.rows.length || c === pv || !need.includes(c) || found.has(c)) return;
    const row = it.rows[r];
    if (row.hits[c].includes(i)) { b.classList.add('right'); b.dataset.row = r + 1; found.add(c); if (found.size === need.length) { btns[pv][row.pivot].classList.add('right'); btns[pv][row.pivot].dataset.row = r + 1; setTimeout(show, 200); } }
    else { mistakes++; b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600); status.textContent = `Not that one — “${btns[pv][row.pivot].textContent}” is ${row.gloss}.`; }
  };
  const finish = () => {
    if (over) return; over = true; status.textContent = '';
    const ok = mistakes === 0;
    box.append(h('div', { class: 'lx-fb ' + (ok ? 'ok' : 'bad') }, ok ? '✅ All matched' : `❌ ${mistakes} wrong tap${mistakes > 1 ? 's' : ''}`, h('div', { class: 'tiny' }, it.gloss),
      h('ul', { class: 'lx-list tiny' }, ...it.rows.map(row => h('li', {}, h('b', {}, row.gloss), ': ', ...it.langs.flatMap(c => {
        const s = LX(c).sentenceById[it.sentences[c]], is = c === pv ? [row.pivot] : row.hits[c] || [];
        return is.length ? [info(c).flag, ' ', h('span', { class: 'lx-w', lang: c, dir: LX(c).language.dir || 'ltr' }, is.map(i => tokText(c, s.tokens[i].t)).join(' ')), ' '] : [];
    }))))));
    done(ok);
  };
  const giveUp = h('button', { class: 'btn small ghost', onclick: () => { if (over) return; mistakes++; for (let j = Math.max(r, 0); j < it.rows.length; j++) for (const [c, is] of Object.entries(it.rows[j].hits)) is.forEach(i => btns[c][i].classList.add('right')); finish(); } }, 'Show me');
  box.append(h('div', { class: 'lx-q' }, `The same meaning in ${it.langs.length} languages — match the words`), h('div', { class: 'lx-align' }, ...lines), status, h('div', { class: 'row' }, giveUp));
  show();
  return box;
};
WIDGETS.compare_rule = (it, done) => {
  const box = h('div', { class: 'lx-ex lx-excompare', 'data-kind': it.kind }), picks = it.statements.map(() => new Set());
  let over = false;
  const check = h('button', { class: 'btn primary small lx-check', disabled: true }, 'Check');
  const rows = it.statements.map((st, i) => {
    const chips = it.langs.map(c => h('button', { class: 'chip lx-bucket', 'data-lang': c, 'aria-pressed': 'false', title: info(c).name, onclick: e => {
      if (over) return; const set = picks[i], b = e.currentTarget;
      if (!it.multi) { set.clear(); b.parentNode.querySelectorAll('.lx-bucket').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); }
      if (set.has(c)) { set.delete(c); b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); } else { set.add(c); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
      check.disabled = picks.some(p => !p.size);
    } }, info(c).flag, ' ', c.toUpperCase()));
    return h('div', { class: 'lx-stmt', 'data-i': i }, h('div', { class: 'lx-stmttext' }, wordsIn(it.lang, st.text)), h('div', { class: 'row lx-buckets' }, ...chips));
  });
  check.onclick = () => {
    if (over) return; over = true; let all = true;
    it.statements.forEach((st, i) => {
      const ok = st.holds.length === picks[i].size && st.holds.every(c => picks[i].has(c)); if (!ok) all = false;
      rows[i].classList.add(ok ? 'right' : 'wrong');
      if (!ok) rows[i].append(h('div', { class: 'tiny' }, '→ ', ...st.holds.flatMap(c => [info(c).flag, ' ', info(c).name, ' '])));
    });
    box.append(h('div', { class: 'lx-fb ' + (all ? 'ok' : 'bad') }, all ? '✅ ' : '❌ ', it.title, h('div', { class: 'tiny' }, wordsIn(it.lang, it.why || ''))));
    done(all);
  };
  box.append(h('div', { class: 'lx-q' }, it.kind === 'whose' ? `${it.title} — whose page says this?` : `${it.title} — for which language does each statement hold? (one or more)`), ...rows, h('div', { class: 'row' }, check));
  return box;
};

/* ---------- the word card: across your languages (§8) ---------- */
function polyWordExtras(c, lid) {
  const bs = N.bridgesOf(UI.C, c, lid), kl = N.knownLinks(UI.C, c, lid, knowsL());
  if (!bs.length && !kl.length) return null;
  return h('details', { class: 'lx-sec lx-bridges', open: true }, h('summary', {}, '🌐 Across your languages', h('span', { class: 'tiny' }, ' ' + (bs.length + kl.length))),
    h('ul', { class: 'lx-list' },
      ...bs.map(b => h('li', { class: b.kind === 'falseFriend' ? 'lx-ff' : null, 'data-kind': b.kind, 'data-lang': b.other.lang },
        h('span', { class: 'lx-badge ctx' }, BRIDGE_LABEL[b.kind]), ' ', info(b.other.lang).flag, ' ',
        h('button', { class: 'btn ghost small', onclick: () => wordPopup(b.other.lang, b.other.lex) }, lexWord(b.other.lang, b.other.lex)), ' — ', gloss(b.other.lang, b.other.lex), ' ',
        ...b.via.map(x => h('span', { class: 'lx-badge reg' }, VIA_LABEL[x] || x)),
        b.note ? h('div', { class: 'tiny' }, wordsIn(c, b.note)) : null)),
      ...kl.map(x => h('li', { 'data-kind': 'known', 'data-for': x.code, class: x.kind === 'falseFriend' ? 'lx-ff' : null },
        h('span', { class: 'lx-badge ctx' }, x.kind === 'falseFriend' ? BRIDGE_LABEL.falseFriend : x.kind === 'compare' ? '≈ compare' : '🔗 linked'), ' ', h('b', {}, langName(x.code)), ' ', otherWord(x.code, x.word),
        h('div', { class: 'tiny' }, wordsIn(c, x.note))))));
}
/** The bridges among the words of one concept (under the flag card's ⇄ table) and the way to the compare lane. */
function polyConceptStrip(cid) {
  const ws = UI.C.languages.flatMap(c => (LX(c).byConcept[cid] || []).map(lex => ({ lang: c, lex })));
  const seen = new Set(), rows = [];
  for (const w of ws) for (const b of N.bridgesOf(UI.C, w.lang, w.lex)) {
    const k = [b.a.lang + b.a.lex, b.b.lang + b.b.lex].sort().join('|'); if (seen.has(k)) continue; seen.add(k);
    rows.push(h('li', { 'data-kind': b.kind }, h('span', { class: 'lx-badge ctx' }, BRIDGE_LABEL[b.kind]), ' ', info(w.lang).flag, ' ', lexWord(w.lang, w.lex), ' ⇄ ', info(b.other.lang).flag, ' ',
      h('button', { class: 'btn ghost small', onclick: () => wordPopup(b.other.lang, b.other.lex) }, lexWord(b.other.lang, b.other.lex)), b.other.lang && !(LX(b.other.lang).lex[b.other.lex].senses || []).includes(cid) ? ' — ' + gloss(b.other.lang, b.other.lex) : ''));
  }
  return h('div', { class: 'lx-polystrip' }, rows.length ? h('ul', { class: 'lx-list' }, ...rows) : null,
    h('button', { class: 'btn ghost small', onclick: () => go('#/cmp/c/' + encodeURIComponent(cid)) }, '⇄ In the compare lane'));
}
/** Under a function page: its typological values in every course language (the comparison strip), folded. */
function polyFnStrip(fid) {
  const cf = N.compareFn(UI.C, fid, UI.C.languages); if (cf.langs.length < 2) return null;
  return h('details', { class: 'lx-sec lx-fnstrip' }, h('summary', {}, '⇄ Side by side ', h('span', { class: 'tiny' }, cf.features.length + ' features')),
    cf.features.length ? stripTable(cf) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => go('#/cmp/fn/' + encodeURIComponent(fid)) }, '⇄ In the compare lane'),
      h('button', { class: 'btn ghost small', onclick: () => go('#/poly/compare_rule/' + encodeURIComponent(fid)) }, '⚖️ Which holds where?')));
}
function stripTable(cf) {
  return h('div', { class: 'lx-compare lx-strip' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), ...cf.langs.map(c => h('th', { 'data-lang': c }, ...flagName(c))))),
    h('tbody', {}, h('tr', {}, h('th', {}, 'status'), ...cf.rows.map(r => h('td', {}, r.status === 'realized' ? '✓ its own form' : STATUS_LABEL[r.status] || r.status))),
      ...cf.features.map(f => {
        const vals = cf.langs.map(c => f.values[c]?.value || null), differ = new Set(vals.filter(Boolean)).size > 1;
        return h('tr', { class: differ ? 'lx-differs' : null }, h('th', {}, f.title), ...cf.langs.map(c => h('td', { title: f.values[c]?.from === 'profile' ? 'from the language’s profile' : '' }, f.values[c] ? f.values[c].title : h('i', { class: 'tiny' }, 'unknown'))));
      }))));
}

/* ---------- the ⇄ compare lane (§8) ---------- */
const cmpLangs = () => { const act = activeLangs(), p = (UI.prefs.cmpLangs || []).filter(c => act.includes(c)); return p.length >= 2 ? p : act; };
function cmpLangPicker(redraw) {
  const act = activeLangs(), cur = cmpLangs();
  return h('div', { class: 'row lx-cmplangs', role: 'group', 'aria-label': 'Languages to compare' }, ...act.map(c => h('button', { class: 'chip lx-todaychip' + (cur.includes(c) ? ' on' : ''), 'data-lang': c, 'aria-pressed': cur.includes(c) ? 'true' : 'false', onclick: () => {
    const s = new Set(cur); if (s.has(c)) s.delete(c); else s.add(c); if (s.size < 2) return; UI.prefs.cmpLangs = act.filter(x => s.has(x)); save(); redraw();
  } }, ...flagName(c))));
}
const fnOrder = () => { const at = {}; UI.C.order.forEach((nid, i) => { const f = UI.C.nodes[nid].functions || []; for (const x of (Array.isArray(f) ? f : Object.values(f).flat())) if (!(x in at)) at[x] = i; }); return Object.keys(UI.C.functions).filter(f => f !== 'fn.overview').sort((a, b) => (at[a] ?? 1e9) - (at[b] ?? 1e9)); };
const STATUS_MARK = { realized: '✓', periphrastic: '≈', absent: '—' };
VIEWS.cmp = (v, r) => {
  const back = h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => r.arg ? go('#/cmp') : go('#/') }, r.arg ? '← Compare' : '← Map'));
  v.append(back);
  if (activeLangs().length < 2) return v.append(h('h1', {}, '⇄ Compare'), h('p', { class: 'lx-note' }, 'Comparing needs two languages: choose them in ⚙️ Settings.'));
  const langs = cmpLangs(), redraw = () => render();
  if (r.arg === 'fn' && UI.C.functions[r.arg2]) return cmpFn(v, r.arg2, langs, redraw);
  if (r.arg === 'frame' && UI.C.frames[r.arg2]) return cmpFrame(v, r.arg2, langs, redraw);
  if (r.arg === 'c' && UI.C.concepts[r.arg2]) return cmpConcept(v, r.arg2);
  v.append(h('h1', {}, '⇄ Compare your languages'), cmpLangPicker(redraw),
    h('div', { class: 'row lx-polydrills' }, h('span', { class: 'tiny' }, '🏋️ '), ...POLY_DRILLS.map(([t, label]) => h('button', { class: 'btn ghost small', 'data-type': t, onclick: () => go('#/poly/' + t) }, label))));
  // grammar side by side
  const fns = fnOrder().filter(f => langs.filter(c => LX(c).grammar[f]).length >= 2);
  v.append(h('h2', { class: 'lx-h2' }, '📖 Grammar side by side ', h('span', { class: 'tiny' }, fns.length)),
    h('div', { class: 'lx-cmplist' }, ...fns.map(f => h('button', { class: 'lx-cmprow', 'data-fn': f, onclick: () => go('#/cmp/fn/' + encodeURIComponent(f)) }, h('span', {}, UI.C.functions[f].title),
      h('span', { class: 'lx-cmpst' }, ...langs.map(c => { const g = LX(c).grammar[f]; return h('span', { class: 'lx-badge', 'data-lang': c, title: `${info(c).name}: ${g ? g.status : 'not written yet'}` }, info(c).flag, ' ', g ? STATUS_MARK[g.status] || '?' : '⏳'); }))))));
  // frames: the same meaning in every language
  const groups = N.parallelGroups(UI.C), byFrame = {};
  for (const G of groups) if (langs.filter(c => G.by[c]).length >= 2) byFrame[G.frame] = (byFrame[G.frame] || 0) + 1;
  const frames = Object.keys(byFrame).sort((a, b) => byFrame[b] - byFrame[a]);
  v.append(h('h2', { class: 'lx-h2' }, '🧩 The same meaning in every language ', h('span', { class: 'tiny' }, frames.length + ' frames')),
    h('div', { class: 'lx-cmplist' }, ...frames.map(f => h('button', { class: 'lx-cmprow', 'data-frame': f, onclick: () => go('#/cmp/frame/' + encodeURIComponent(f)) }, h('span', {}, UI.C.frames[f]?.meaning || f), h('span', { class: 'tiny' }, byFrame[f] + ' sentences')))));
  // bridges
  const B = N.bridges(UI.C).list.filter(b => langs.includes(b.a.lang) && langs.includes(b.b.lang));
  const kinds = ['falseFriend', 'loan', 'cognate'];
  v.append(h('h2', { class: 'lx-h2' }, '🌉 Bridges between them ', h('span', { class: 'tiny' }, B.length)),
    ...kinds.map(kd => { const list = B.filter(b => b.kind === kd); if (!list.length) return null;
      return h('details', { class: 'lx-sec', open: kd === 'falseFriend' ? true : null, 'data-kind': kd }, h('summary', {}, BRIDGE_LABEL[kd], h('span', { class: 'tiny' }, ' ' + list.length)),
        h('ul', { class: 'lx-list lx-bridgelist' }, ...list.slice(0, 300).map(b => h('li', {}, ...[b.a, b.b].flatMap((w, i) => [i ? ' ⇄ ' : '', info(w.lang).flag, ' ', h('button', { class: 'btn ghost small', onclick: () => wordPopup(w.lang, w.lex) }, lexWord(w.lang, w.lex)), h('span', { class: 'tiny' }, ' ' + gloss(w.lang, w.lex))]),
          ' ', ...b.via.map(x => h('span', { class: 'lx-badge reg' }, VIA_LABEL[x] || x))))));
    }));
};
function cmpFn(v, fid, langs, redraw) {
  const cf = N.compareFn(UI.C, fid, langs);
  v.append(h('h1', {}, '⇄ ', cf.title), cmpLangPicker(redraw));
  // one meaning in every language, when the bank has it: the parallel group with the most languages using this function
  let best = null, bestN = 0;
  for (const G of N.parallelGroups(UI.C)) {
    const n = cf.langs.filter(c => (G.by[c] || []).some(x => (LX(c).sentenceById[x.id]?.functions || []).includes(fid))).length;
    if (n > bestN) { best = G; bestN = n; }
  }
  const kn = Object.fromEntries(cf.langs.map(c => [c, N.known(UI.C, UI.L, c).R]));
  const exOf = c => {
    const id = best && bestN >= 2 && (best.by[c] || [])[0]?.id;
    const s = id ? LX(c).sentenceById[id] : N.selectSentences(UI.C, c, { known: kn[c], functions: [fid], maxUnknown: 'auto' })[0];
    if (!s) return '';
    const un = s.req.filter(l => !kn[c].has(l)); noteNew(c, un);
    return h('div', {}, sentenceView(c, s, un), id ? null : h('div', { class: 'tiny' }, s.gloss));
  };
  v.append(best && bestN >= 2 ? h('p', { class: 'tiny' }, 'The same sentence in each: ', h('b', {}, best.gloss)) : null,
    h('div', { class: 'lx-compare lx-cmpfn' }, h('table', {}, h('tbody', {}, ...cf.rows.map(r => h('tr', { 'data-lang': r.lang },
      h('th', {}, h('button', { class: 'btn ghost small', onclick: () => go(`#/fn/${encodeURIComponent(fid)}/${r.lang}`) }, ...flagName(r.lang))),
      h('td', {}, r.status !== 'realized' ? h('span', { class: 'lx-badge reg' }, STATUS_LABEL[r.status]) : null, ' ', wordsIn(r.lang, r.first), h('div', { class: 'lx-cmpex' }, exOf(r.lang)))))))),
    langs.filter(c => !cf.langs.includes(c)).length ? h('p', { class: 'tiny' }, '⏳ Not written yet in ', langs.filter(c => !cf.langs.includes(c)).map(c => info(c).name).join(', ')) : null);
  if (cf.features.length) v.append(h('h2', { class: 'lx-h2' }, '📊 The comparison strip'), h('p', { class: 'tiny' }, 'The values of the shared typology (rows that differ are marked); a value not tagged on the page comes from the language’s profile.'), stripTable(cf));
  if (cf.seeAlso.length) v.append(h('h2', { class: 'lx-h2' }, '🔗 How they relate'), h('ul', { class: 'lx-list' }, ...cf.seeAlso.map(x => h('li', {}, info(x.from).flag, ' → ', info(x.lang).flag, ' ',
    x.fn !== fid ? h('button', { class: 'btn ghost small', onclick: () => go(`#/fn/${encodeURIComponent(x.fn)}/${x.lang}`) }, UI.C.functions[x.fn]?.title || x.fn) : null, ' ', wordsIn(x.lang, x.note)))));
  v.append(h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => go('#/poly/compare_rule/' + encodeURIComponent(fid)) }, '⚖️ Which holds where?')), newWordsList('🆕 Words in these sentences you have not learned yet'));
}
function cmpFrame(v, fid, langs, redraw) {
  const fr = UI.C.frames[fid], kn = Object.fromEntries(langs.map(c => [c, N.known(UI.C, UI.L, c).R]));
  const groups = N.parallelGroups(UI.C).filter(G => G.frame === fid && langs.filter(c => G.by[c]).length >= 2);
  v.append(h('h1', {}, '🧩 ', fr.meaning || fid), cmpLangPicker(redraw),
    h('div', { class: 'row' }, h('button', { class: 'btn primary small', onclick: () => go('#/poly/parallel_align/' + encodeURIComponent(fid)) }, '🧷 Align the words'), h('button', { class: 'btn small', onclick: () => go('#/poly/parallel_translate/' + encodeURIComponent(fid)) }, '🔀 Translate across')),
    h('p', { class: 'tiny' }, `${groups.length} meanings said in at least two of your languages.`));
  for (const G of groups.slice(0, 40)) v.append(h('div', { class: 'lx-card lx-pgroup' }, h('div', { class: 'lx-tr' }, G.gloss),
    ...langs.filter(c => G.by[c]).map(c => { const s = LX(c).sentenceById[G.by[c][0].id], un = s.req.filter(l => !kn[c].has(l)); noteNew(c, un); return h('div', { class: 'lx-prow', 'data-lang': c }, h('span', { class: 'lx-aflag' }, info(c).flag), sentenceView(c, s, un)); })));
  v.append(newWordsList('🆕 Words in these sentences you have not learned yet'));
}
function cmpConcept(v, cid) {
  const con = UI.C.concepts[cid];
  v.append(h('div', { class: 'lx-cardhead' }, conceptPic(cid, 'lx-bigemoji'), h('div', {}, h('h1', {}, '⇄ ', con.gloss), h('button', { class: 'btn ghost small', onclick: () => go('#/c/' + encodeURIComponent(cid)) }, '→ the flag card'))),
    compareTable(cid), polyConceptStrip(cid));
}

/* ---------- 🏋️ polyglot drills (#/poly/<type>/<function or frame>) ---------- */
VIEWS.poly = (v, r) => {
  const type = r.arg, langs = cmpLangs(), label = (POLY_DRILLS.find(x => x[0] === type) || [type, type])[1];
  if (!N.POLY_TYPES.includes(type)) return VIEWS.cmp(v, { name: 'cmp' });
  const k = Object.fromEntries(langs.map(c => [c, N.known(UI.C, UI.L, c)]));
  const opts = { langs, k, knows: knowsL(), max: 8 };
  if (r.arg2 && UI.C.functions[r.arg2]) opts.fn = r.arg2;
  if (r.arg2 && UI.C.frames[r.arg2]) opts.frame = r.arg2;
  const items = langs.length >= 2 || type === 'cognate_bridge' ? N.polyItems(UI.C, UI.L, type, opts) : [];
  if (!items.length) {
    v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/cmp') }, '← Compare')), h('h1', {}, label),
      h('p', { class: 'lx-note lx-polyempty' }, langs.length < 2 ? 'This needs two languages: choose them in ⚙️ Settings.' : 'Nothing to ask yet: learn some words in at least two of your languages first (the items use only words you have met).'));
    return;
  }
  runPoly(v, items, { title: label + (opts.fn ? ' · ' + UI.C.functions[opts.fn].title : opts.frame ? ' · ' + (UI.C.frames[opts.frame].meaning || opts.frame) : ''), back: opts.fn ? '#/cmp/fn/' + encodeURIComponent(opts.fn) : opts.frame ? '#/cmp/frame/' + encodeURIComponent(opts.frame) : '#/cmp' });
};
/** A short run of polyglot items: one after the other, a result at the end. */
function runPoly(v, items, { title, back }) {
  metNew.clear();
  const bar = h('div', { class: 'lx-progress' }, h('i')), stage = h('div', { class: 'lx-stage' });
  v.classList.add('lx-session', 'lx-polyrun');
  v.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => { save(true); go(back); } }, '✕ Stop'), h('b', { class: 'tiny' }, title), bar), stage);
  let i = 0, right = 0; const day = today();
  const next = () => {
    bar.firstChild.style.width = Math.round(i / items.length * 100) + '%';
    if (i >= items.length) return finish();
    const it = items[i++]; stage.innerHTML = ''; UI.current = it;   // what is on screen (tests, the tutor)
    const ex = exItem(it, ok => {
      if (ok) right++;
      if (it.fn && LX(it.lang)?.grammar[it.fn]) N.practiceFunction(UI.C, UI.L, it.lang, it.fn, ok ? 1 : 0, 1, day);
      save();
      const b = h('button', { class: 'btn primary lx-next' }, 'Next →'); b.onclick = next; stage.append(h('div', { class: 'row lx-nextrow' }, b)); setTimeout(() => b.focus(), 30);
    });
    Object.assign(ex.dataset, { kind: it.kind, lang: it.lang, type: it.type });
    stage.append(h('div', { class: 'tiny lx-which' }, (it.langs || it.options || [it.from, it.lang]).filter(Boolean).filter((c, j, a) => UI.C.lang[c] && a.indexOf(c) === j).map(c => info(c).flag).join(' ')), ex);
  };
  const finish = () => {
    save(true); bar.firstChild.style.width = '100%'; stage.innerHTML = '';
    stage.append(h('div', { class: 'lx-result lx-polydone' }, h('h2', {}, `✅ ${right} of ${items.length} right`), newWordsList(),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => render() }, '↻ Again'), h('button', { class: 'btn', onclick: () => go(back) }, 'Back'))));
  };
  document.onkeydown = e => {
    if (!$('.lx-polyrun')) { document.onkeydown = null; return; }
    if (/^[1-9]$/.test(e.key) && !/input/i.test(document.activeElement?.tagName)) { const b = [...stage.querySelectorAll('.lx-opts:not([data-done]) .lx-opt')][+e.key - 1]; b?.click(); }
  };
  next();
}

window.NoemaLangUI.poly = { runSession, runPoly, todayLangs, polyWordExtras, cmpLangs };
