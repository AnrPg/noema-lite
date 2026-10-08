/* ===================== Exercise engine ===================== */
const TYPE_LABEL = { mcq: '🎯 Choose', tf: '⚖️ True / False', odd: '🕵️ Odd one out', order: '🔢 Put in order', match: '🔗 Match', bucket: '🗂️ Sort', cloze: '✍️ Fill the gaps', spotbug: '🐞 Spot the bug', calc: '🧮 Calculate', scenario: '🚨 Debug simulation', free: '🗣️ Explain it', write: '⌨️ Write the code' };
const TAG_LABEL = { concept: 'concept', syntax: 'syntax', pitfall: '⚠️ pitfall', debug: '🔧 debug', exam: '🎓 exam trap', interview: '🎤 interview', calc: '🧮 calc', compare: '⚖️ compare' };
const PAIR_COLORS = ['#7c5cff', '#ff922b', '#12b5a5', '#e64fa5', '#3b9cf6', '#40c057', '#f2a20c'];

/* Each renderer returns { el, check(): true|false|null, reveal(), auto?: bool, selfDone?: bool } */
const R = {};

R.mcq = (ex, api) => {
  const multi = !!ex.multi || (Array.isArray(ex.answer) && ex.answer.length > 1);
  const ans = new Set(Array.isArray(ex.answer) ? ex.answer : [ex.answer]);
  const order = shuffle(ex.options.map((o, i) => i));
  const sel = new Set();
  const wrap = h('div', { class: 'opts' });
  const btns = order.map((oi, k) => {
    const b = h('button', { class: 'opt', onclick: () => { if (api.locked()) return; if (!multi) { sel.clear(); btns.forEach(x => x.classList.remove('sel')); } sel.has(oi) ? sel.delete(oi) : sel.add(oi); b.classList.toggle('sel', sel.has(oi)); if (!multi) api.check(); } },
      h('span', { class: 'k' }, String.fromCharCode(65 + k)), h('span', {}, F(ex.options[oi])));
    b._oi = oi; return b;
  });
  wrap.append(...btns);
  const el = h('div', {}, multi ? h('div', { class: 'tiny', style: { marginBottom: '8px' } }, `Select ALL that apply (${ans.size}).`) : null, wrap);
  return {
    el, keys: k => { const b = btns[k]; b && b.click(); },
    check() { if (!sel.size) return null; return sel.size === ans.size && [...sel].every(x => ans.has(x)); },
    given: () => [...sel].map(oi => String.fromCharCode(65 + oi) + '. ' + ex.options[oi]).join(' + '),
    reveal() { btns.forEach(b => { const oi = b._oi; if (ans.has(oi)) b.classList.add('right'); else if (sel.has(oi)) b.classList.add('wrong'); if (ex.why?.[oi]) b.children[1].append(h('span', { class: 'why', html: fmt(ex.why[oi]) })); }); },
  };
};
R.odd = (ex, api) => { const r = R.mcq(ex, api); r.el.querySelector('.opts').classList.add('grid4'); return r; };

R.tf = (ex, api) => {
  let pick = null;
  const mk = (v, label, cls) => h('button', { class: 'tfbtn ' + cls, onclick: () => { if (api.locked()) return; pick = v; api.check(); } }, label);
  const t = mk(true, '👍 True', 't'), f = mk(false, '👎 False', 'f');
  return {
    el: h('div', { class: 'tfrow' }, t, f), keys: k => (k === 0 ? t : k === 1 ? f : null)?.click(),
    check: () => pick === null ? null : pick === ex.answer,
    given: () => pick === null ? '' : String(pick),
    reveal() { (ex.answer ? t : f).classList.add('right'); if (pick !== ex.answer) (pick ? t : f).classList.add('wrong'); },
  };
};

R.order = (ex, api) => {
  const pool = h('div', { class: 'pool' }), seq = h('div', { class: 'seq' });
  const picked = [];
  const items = shuffle(ex.items.map((t, i) => ({ t, i })));
  function draw() {
    seq.innerHTML = ''; pool.innerHTML = '';
    if (!picked.length) seq.append(h('div', { class: 'ph' }, 'Tap the items below in the right order ↓'));
    picked.forEach((it, k) => seq.append(h('button', { class: 'chipx', onclick: () => { if (api.locked()) return; picked.splice(k, 1); draw(); } }, h('span', { class: 'no' }, k + 1), F(it.t))));
    items.filter(it => !picked.includes(it)).forEach(it => pool.append(h('button', { class: 'chipx', onclick: () => { if (api.locked()) return; picked.push(it); draw(); } }, F(it.t))));
  }
  draw();
  return {
    el: h('div', {}, seq, pool),
    check: () => picked.length < items.length ? null : picked.every((it, k) => it.i === k),
    given: () => picked.map(it => it.t).join(' → '),
    reveal() {
      $$('.chipx', seq).forEach((b, k) => b.classList.add(picked[k].i === k ? 'right' : 'wrong'));
      if (!picked.every((it, k) => it.i === k)) seq.after(h('div', { class: 'fb info' }, h('b', {}, 'Correct order: '), h('ol', { style: { margin: '6px 0 0', paddingLeft: '20px' } }, ...ex.items.map(t => h('li', { html: fmt(t) })))));
    },
  };
};

R.match = (ex, api) => {
  const L = ex.pairs.map((p, i) => ({ t: p[0], i })), Rr = shuffle(ex.pairs.map((p, i) => ({ t: p[1], i })));
  const link = {}; // leftIdx -> rightIdx
  let selL = null;
  const lcol = h('div', { class: 'col' }), rcol = h('div', { class: 'col' });
  const lb = {}, rb = {};
  function paint() {
    const used = Object.entries(link);
    Object.values(lb).forEach(b => { b.classList.remove('sel'); b.querySelector('.tag')?.remove(); b.style.borderColor = ''; });
    Object.values(rb).forEach(b => { b.querySelector('.tag')?.remove(); b.style.borderColor = ''; });
    used.forEach(([l, r], k) => { const c = PAIR_COLORS[k % PAIR_COLORS.length]; [lb[l], rb[r]].forEach(b => { b.style.borderColor = c; b.append(h('span', { class: 'tag', style: { background: c } }, k + 1)); }); });
    if (selL != null) lb[selL].classList.add('sel');
  }
  L.forEach(it => { lb[it.i] = h('button', { class: 'mitem', onclick: () => { if (api.locked()) return; if (link[it.i] != null) { delete link[it.i]; } selL = selL === it.i ? null : it.i; paint(); } }, F(it.t)); lcol.append(lb[it.i]); });
  Rr.forEach(it => { rb[it.i] = h('button', { class: 'mitem', onclick: () => { if (api.locked()) return; const owner = Object.keys(link).find(k => link[k] === it.i); if (owner != null) delete link[owner]; if (selL != null) { link[selL] = it.i; selL = null; const next = L.find(x => link[x.i] == null); if (next) selL = next.i; } paint(); } }, F(it.t)); rcol.append(rb[it.i]); });
  selL = 0; paint();
  return {
    el: h('div', {}, h('div', { class: 'tiny', style: { marginBottom: '8px' } }, 'Tap a left item, then its partner on the right.'), h('div', { class: 'matchgrid' }, lcol, rcol)),
    check: () => Object.keys(link).length < L.length ? null : L.every(it => link[it.i] === it.i),
    given: () => L.filter(it => link[it.i] != null).map(it => it.t + ' = ' + ex.pairs[link[it.i]][1]).join('; '),
    reveal() {
      L.forEach(it => { const ok = link[it.i] === it.i; lb[it.i].classList.add(ok ? 'right' : 'wrong'); });
      if (!L.every(it => link[it.i] === it.i)) lcol.parentElement.after(h('div', { class: 'fb info' }, h('b', {}, 'Correct pairs:'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '20px' } }, ...ex.pairs.map(p => h('li', { html: fmt(p[0]) + ' → ' + fmt(p[1]) })))));
    },
  };
};

R.bucket = (ex, api) => {
  const place = {}; let sel = null;
  const items = shuffle(ex.items.map((it, i) => ({ ...it, i })));
  const pool = h('div', { class: 'pool' });
  const zones = ex.buckets.map((name, bi) => {
    const z = h('div', { class: 'bucket', onclick: () => { if (api.locked() || sel == null) return; place[sel] = bi; sel = null; draw(); },
      ondragover: e => { e.preventDefault(); z.classList.add('hot'); }, ondragleave: () => z.classList.remove('hot'),
      ondrop: e => { e.preventDefault(); z.classList.remove('hot'); const i = +e.dataTransfer.getData('text'); if (!api.locked()) { place[i] = bi; sel = null; draw(); } } },
      h('h4', { html: fmt(name) }), h('div', { class: 'pool' }));
    return z;
  });
  function chip(it) {
    const b = h('button', { class: 'chipx' + (sel === it.i ? ' sel' : ''), draggable: 'true',
      ondragstart: e => e.dataTransfer.setData('text', it.i),
      onclick: e => { e.stopPropagation(); if (api.locked()) return; if (place[it.i] != null) { delete place[it.i]; sel = it.i; } else sel = sel === it.i ? null : it.i; draw(); } }, F(it.text));
    b._it = it; return b;
  }
  function draw() {
    pool.innerHTML = ''; zones.forEach(z => z.querySelector('.pool').innerHTML = '');
    items.forEach(it => (place[it.i] == null ? pool : zones[place[it.i]].querySelector('.pool')).append(chip(it)));
    zones.forEach(z => z.classList.toggle('hot', sel != null));
    if (!pool.children.length) pool.append(h('span', { class: 'tiny' }, 'All sorted — check it!'));
  }
  draw();
  return {
    el: h('div', {}, h('div', { class: 'tiny', style: { marginBottom: '8px' } }, 'Tap an item, then tap its bucket (or drag).'), pool, h('div', { class: 'buckets' }, ...zones)),
    check: () => Object.keys(place).length < items.length ? null : items.every(it => place[it.i] === it.bucket),
    given: () => items.filter(it => place[it.i] != null).map(it => it.text + ' → ' + ex.buckets[place[it.i]]).join('; '),
    reveal() { zones.forEach(z => $$('.chipx', z).forEach(b => { const ok = place[b._it.i] === b._it.bucket; b.classList.add(ok ? 'right' : 'wrong'); if (!ok) b.append(h('small', { style: { opacity: .8 } }, ' → ' + ex.buckets[b._it.bucket])); })); },
  };
};

R.cloze = (ex, api) => {
  const parts = ex.text.split(/\[\[(.+?)\]\]/g);
  const blanks = [];
  const box = h('div', { class: 'cloze' + (ex.asCode ? ' code' : '') });
  const useBank = Array.isArray(ex.bank);
  let selB = 0;
  parts.forEach((p, i) => {
    if (i % 2 === 0) { box.append(ex.asCode ? document.createTextNode(p) : F(p)); return; }
    const alts = p.split('|').map(s => s.trim());
    const bi = blanks.length;
    let el;
    if (useBank) {
      el = h('span', { class: 'blank', onclick: () => { if (api.locked()) return; if (blanks[bi].val != null) { blanks[bi].val = null; } selB = bi; draw(); } }, ' ');
    } else {
      el = h('input', { class: 'blank', style: { width: Math.max(80, Math.min(300, alts[0].length * 10 + 30)) + 'px' }, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); const nx = blanks[bi + 1]; if (nx) nx.el.focus(); else api.check(); } } });
    }
    blanks.push({ alts, el, val: null }); box.append(el);
  });
  let bankEl = null, chips = [];
  if (useBank) {
    const words = shuffle([...blanks.map(b => b.alts[0]), ...ex.bank]);
    bankEl = h('div', { class: 'pool bank' });
    chips = words.map((w, wi) => h('button', { class: 'chipx', onclick: () => { if (api.locked()) return; let t = blanks[selB]?.val == null ? selB : blanks.findIndex(b => b.val == null); if (t < 0) return; blanks[t].val = wi; selB = blanks.findIndex(b => b.val == null); if (selB < 0) selB = t; draw(); } }, w));
    chips.forEach((c, i) => c._w = words[i]);
    bankEl.append(...chips);
  }
  function draw() {
    if (!useBank) return;
    blanks.forEach((b, i) => { b.el.textContent = b.val == null ? ' ' : chips[b.val]._w; b.el.classList.toggle('filled', b.val != null); b.el.classList.toggle('sel', i === selB && b.val == null); });
    const used = new Set(blanks.map(b => b.val));
    chips.forEach((c, i) => c.style.display = used.has(i) ? 'none' : '');
  }
  draw();
  const val = b => useBank ? (b.val == null ? null : chips[b.val]._w) : b.el.value;
  return {
    el: h('div', {}, box, bankEl), focus: () => !useBank && blanks[0]?.el.focus(),
    given: () => blanks.some(b => val(b)) ? blanks.map(b => val(b) || '—').join(' | ') : '',
    check() { if (blanks.some(b => !norm(val(b)))) return null; return blanks.every(b => b.alts.some(a => norm(a) === norm(val(b)))); },
    reveal() { blanks.forEach(b => { const ok = b.alts.some(a => norm(a) === norm(val(b))); b.el.classList.add(ok ? 'right' : 'wrong'); if (useBank) { if (!ok) b.el.append(h('span', { class: 'corr' }, '→ ' + b.alts[0])); } else { b.el.readOnly = true; if (!ok) b.el.after(h('span', { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)', margin: '0 4px', fontFamily: 'var(--mono)' } }, b.alts[0])); } }); if (bankEl) bankEl.style.display = 'none'; },
  };
};

R.spotbug = (ex, api) => {
  const sel = new Set();
  const lines = ex.lines.map((l, i) => h('button', { onclick: () => { if (api.locked()) return; sel.has(i) ? sel.delete(i) : sel.add(i); lines[i].classList.toggle('sel'); } }, h('span', { class: 'ln' }, i + 1), h('span', { html: highlight(l, ex.lang || guessLang(ex.lines.join('\n'))) })));
  const bugs = new Set(ex.bugs);
  return {
    el: h('div', {}, h('div', { class: 'tiny', style: { marginBottom: '8px' } }, `Click the buggy line${bugs.size > 1 ? 's (' + bugs.size + ')' : ''}.`), h('div', { class: 'codelines' }, ...lines)),
    check: () => !sel.size ? null : sel.size === bugs.size && [...sel].every(i => bugs.has(i)),
    given: () => [...sel].sort((a, b) => a - b).map(i => 'line ' + (i + 1) + ' (0-based ' + i + ')').join(', '),
    reveal() { lines.forEach((b, i) => { if (bugs.has(i)) b.classList.add('right'); else if (sel.has(i)) b.classList.add('wrong'); }); lines[0].parentElement.after(h('div', { class: 'fb ok' }, h('b', {}, '🔧 Fix'), /\n|;|\(|=/.test(ex.fix) ? codeBlock(ex.fix, ex.lang || guessLang(ex.fix)) : h('div', { html: fmt(ex.fix) }))); },
  };
};

R.calc = (ex, api) => {
  const inp = h('input', { type: 'number', step: 'any', placeholder: '?', onkeydown: e => { if (e.key === 'Enter') api.check(); } });
  return {
    el: h('div', { class: 'calcrow' }, inp, h('b', { class: 'muted' }, ex.unit || '')), focus: () => inp.focus(),
    given: () => inp.value === '' ? '' : inp.value + ' ' + (ex.unit || ''),
    check() { if (inp.value === '') return null; return Math.abs(+inp.value - ex.answer) <= (ex.tolerance || 0) + 1e-9; },
    reveal() { inp.readOnly = true; inp.style.borderColor = Math.abs(+inp.value - ex.answer) <= (ex.tolerance || 0) + 1e-9 ? 'var(--ok)' : 'var(--bad)'; inp.after(h('span', { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)', fontSize: '15px' } }, `= ${ex.answer} ${ex.unit || ''}`)); },
  };
};

R.scenario = (ex, api) => {
  const box = h('div');
  let k = 0, mistakes = 0;
  function step() {
    const st = ex.steps[k];
    const div = h('div', { class: 'scstep' }, h('div', { class: 'sp' }, h('span', { class: 'pill c' }, `Step ${k + 1}/${ex.steps.length}`), ' ', F(st.prompt)), st.code ? codeBlock(st.code, guessLang(st.code)) : null);
    const opts = h('div', { class: 'opts' });
    const fbBox = h('div');
    let done = false;
    shuffle(st.options).forEach((o, i) => {
      const b = h('button', { class: 'opt', onclick: () => {
        if (done || b.classList.contains('wrong')) return;
        fbBox.innerHTML = '';
        if (o.ok) {
          done = true; b.classList.add('right'); beep('ok');
          fbBox.append(h('div', { class: 'fb ok', html: '✅ ' + fmt(o.fb) }));
          k++;
          if (k < ex.steps.length) fbBox.append(h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn small primary', onclick: e => { e.target.remove(); step(); } }, 'Next step →')));
          else api.done(mistakes === 0, mistakes);
        } else { mistakes++; b.classList.add('wrong', 'shake'); beep('bad'); fbBox.append(h('div', { class: 'fb bad', html: '❌ ' + fmt(o.fb) })); }
      } }, h('span', { class: 'k' }, String.fromCharCode(65 + i)), F(o.text));
      opts.append(b);
    });
    div.append(opts, fbBox); box.append(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  step();
  return { el: box, selfDone: true };
};

R.free = (ex, api) => {
  const ta = h('textarea', { class: 'answer', placeholder: 'Explain in your own words… (aim for 2–5 sentences)' });
  const out = h('div');
  let finished = false;
  const finish = ok => { if (finished) return; finished = true; api.done(ok); };
  const aiBtn = h('button', { class: 'btn ai', onclick: async () => {
    if (!ta.value.trim()) { ta.classList.add('shake'); setTimeout(() => ta.classList.remove('shake'), 500); return; }
    aiBtn.disabled = true; aiBtn.textContent = '✨ Grading…';
    try {
      const g = await aiGrade(ex, ta.value);
      const sc = Math.max(0, Math.min(100, g.score | 0));
      out.innerHTML = '';
      out.append(h('div', { class: 'fb ai' }, h('div', { class: 'row' }, h('span', { class: 'score', style: { background: sc >= 70 ? 'var(--ok)' : sc >= 45 ? 'var(--warn)' : 'var(--bad)' } }, sc), h('b', { class: 'grow', html: fmt(g.verdict) })),
        g.covered?.length ? h('div', { style: { marginTop: '8px' } }, '✅ ', F(g.covered.join(' · '))) : null,
        g.missing?.length ? h('div', { style: { marginTop: '4px' } }, '➕ Missing: ', F(g.missing.join(' · '))) : null,
        g.mistakes?.length ? h('div', { style: { marginTop: '4px' } }, '❌ ', F(g.mistakes.join(' · '))) : null,
        h('div', { style: { marginTop: '8px' } }, md(g.feedback))));
      out.append(modelBox());
      finish(sc >= 70);
    } catch (e) { out.innerHTML = ''; out.append(h('div', { class: 'fb bad' }, '⚠️ ' + e.message + ' — use Self-check instead.')); aiBtn.disabled = false; aiBtn.textContent = '✨ Grade with AI'; }
  } }, '✨ Grade with AI');
  const modelBox = () => h('div', { class: 'explain' }, h('div', { class: 'hd' }, '📘 Model answer'), F(ex.model));
  const selfBtn = h('button', { class: 'btn', onclick: () => {
    selfBtn.disabled = true; out.innerHTML = '';
    const checks = ex.rubric.map(r => h('input', { type: 'checkbox' }));
    out.append(modelBox(), h('div', { class: 'explain rubric' }, h('div', { class: 'hd' }, '☑️ Tick what your answer covered'), ...ex.rubric.map((r, i) => h('label', {}, checks[i], F(r))),
      h('button', { class: 'btn small primary', style: { marginTop: '8px' }, onclick: e => { const n = checks.filter(c => c.checked).length; e.target.disabled = true; finish(n / ex.rubric.length >= 0.7); } }, 'Done')));
  } }, '🙋 Self-check');
  return { el: h('div', {}, ta, h('div', { class: 'actions' }, aiBtn, selfBtn), out), selfDone: true, focus: () => ta.focus(), given: () => ta.value.trim() };
};

R.write = (ex, api) => {
  const ta = h('textarea', { class: 'answer code', spellcheck: 'false', placeholder: '-- write your ' + (ex.lang || 'code') + ' here', onkeydown: e => { if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 2; } } });
  const missing = () => ex.keywords.filter(k => !ta.value.toLowerCase().replace(/\s+/g, ' ').includes(k.toLowerCase().replace(/\s+/g, ' ')));
  return {
    el: h('div', {}, ta, h('div', { class: 'tiny', style: { marginTop: '6px' } }, 'Checked locally for the essential keywords; use ✨ AI review for a real code review.')),
    focus: () => ta.focus(),
    check() { if (!ta.value.trim()) return null; return missing().length === 0; },
    given: () => ta.value.trim() ? '\n```\n' + ta.value.trim() + '\n```\n' : '',
    reveal() {
      ta.readOnly = true;
      const m = missing();
      const box = h('div', {});
      if (m.length) box.append(h('div', { class: 'fb bad' }, 'Missing essentials: ', ...m.map(k => h('code', { style: { marginRight: '4px' } }, k))));
      box.append(h('div', { class: 'explain' }, h('div', { class: 'hd' }, '✅ Reference solution'), codeBlock(ex.solution, ex.lang || guessLang(ex.solution))));
      const aiBtn = h('button', { class: 'btn small ai', style: { marginTop: '10px' }, onclick: async () => {
        aiBtn.disabled = true; aiBtn.textContent = '✨ Reviewing…';
        try { const g = await aiGrade(ex, ta.value); aiBtn.replaceWith(h('div', { class: 'fb ai' }, h('b', {}, `AI review: ${g.score}/100 — `), F(g.verdict), h('div', { style: { marginTop: '6px' } }, md(g.feedback)))); }
        catch (e) { aiBtn.replaceWith(h('div', { class: 'fb bad' }, '⚠️ ' + e.message)); }
      } }, '✨ AI review of my code');
      box.append(aiBtn);
      ta.after(box);
    },
  };
};

/* ---------- exercise card ---------- */
function exerciseCard(ex, { onDone, compact = false, noXP = false, showSection = false } = {}) {
  const ch = ex._ch;
  const card = h('div', { class: 'ex' });
  setAccent(card, ch);
  let locked = false, firstTry = true, result = null;
  const api = {
    locked: () => locked,
    check: () => doCheck(),
    done: (ok, mistakes) => finish(ok, true),
  };
  const head = h('div', { class: 'exhead' },
    h('span', { class: 'pill c' }, TYPE_LABEL[ex.type] || ex.type),
    h('span', { class: 'diff', title: 'difficulty ' + ex.difficulty }, ...[1, 2, 3].map(i => h('i', { class: i <= ex.difficulty ? 'on' : '' }))),
    ...(ex.tags || []).filter(t => t !== 'concept').map(t => h('span', { class: 'pill' }, TAG_LABEL[t] || t)),
    newPill(ex),
    ex._ai ? h('span', { class: 'pill', style: { background: 'var(--violet-bg)', color: 'var(--violet)' } }, '✨ AI-made') : null,
    showSection && SEC[ex.section] ? h('span', { class: 'tiny', style: { marginLeft: 'auto' } }, `Ch${ch.num} · ${SEC[ex.section].title}`) : null);
  const q = h('div', { class: 'q', html: fmt(ex.q || '') });
  card.append(head, q);
  if (ex.code) card.append(h('div', { style: { margin: '0 0 12px' } }, codeBlock(ex.code, ex.lang || guessLang(ex.code))));
  const w = (R[ex.type] || R.mcq)(ex, api);
  card.append(w.el);
  const actions = h('div', { class: 'actions' });
  const checkBtn = h('button', { class: 'btn primary', onclick: () => doCheck() }, 'Check ✓');
  const nudge = h('span', { class: 'tiny' });
  if (!w.selfDone && !w.auto && !['tf'].includes(ex.type) && !(ex.type === 'mcq' && !ex.multi && !Array.isArray(ex.answer)) && ex.type !== 'odd') actions.append(checkBtn, nudge);
  const hintBtn = h('button', { class: 'btn ghost small', onclick: () => askAIAbout(ex, null, givenOf(w)) }, `${TUTOR.avatar} Ask ${TN}`);
  actions.append(h('span', { class: 'grow' }), hintBtn);
  card.append(actions);
  function doCheck() {
    if (locked || w.selfDone || !w.check) return;
    const r = w.check();
    if (r === null) { nudge.textContent = 'Finish your answer first 🙂'; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); return; }
    finish(r, false);
  }
  function finish(ok, selfReported) {
    if (locked) return;
    locked = true; result = ok;
    if (!selfReported) w.reveal?.();
    checkBtn.remove(); nudge.remove();
    if (ok) { beep('ok'); card.classList.add('pop'); } else { beep('bad'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
    if (!ex._ai) record(ex, ok);
    const xp = ok ? 4 + ex.difficulty * 4 + (w.bonus?.() || 0) : 1;
    if (!noXP) addXP(xp, card);
    const exp = h('div', { class: 'explain ' + (ok ? 'ok' : 'bad') }, h('div', { class: 'hd' }, ok ? pickOne(['✅ Nailed it!', '✅ Correct!', '🎉 Yes!', '✅ Spot on!', '🔥 Exactly!']) : pickOne(['💡 Not quite — here’s the key', '🧠 Learning moment', '💡 Close — look at this'])), h('div', { html: fmt(ex.explain || '') }));
    if (!ok) exp.append(h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn small ai', onclick: () => askAIAbout(ex, 'socratic', givenOf(w)) }, `${TUTOR.avatar} Help me get it (Socratic)`),
      h('button', { class: 'btn small', onclick: () => askAIAbout(ex, 'explain', givenOf(w)) }, '💡 Explain differently')));
    card.append(exp);
    window.NoemaReact?.answered(!!ok, { hard: ex.difficulty >= 3 });   // the character reacts (rarely big: engine/react.js)
    if (onDone) onDone(ok, card);
  }
  card._w = w; card._check = doCheck; card._locked = () => locked;
  setTimeout(() => w.focus?.(), 50);
  return card;
}
const pickOne = a => a[Math.random() * a.length | 0];
function exerciseAsText(ex) {
  let t = `Exercise (${ex.type}): ${ex.q || ''}\n`;
  if (ex.code) t += 'Code:\n' + ex.code + '\n';
  if (ex.options) t += 'Options:\n' + ex.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n') + '\nCorrect: ' + [].concat(ex.answer).map(i => String.fromCharCode(65 + i)).join(', ') + '\n';
  if (ex.type === 'tf') t += 'Correct answer: ' + ex.answer + '\n';
  if (ex.items && ex.type === 'order') t += 'Correct order: ' + ex.items.join(' → ') + '\n';
  if (ex.pairs) t += 'Pairs: ' + ex.pairs.map(p => p[0] + ' = ' + p[1]).join('; ') + '\n';
  if (ex.buckets) t += 'Buckets: ' + ex.items.map(i => i.text + ' → ' + ex.buckets[i.bucket]).join('; ') + '\n';
  if (ex.text) t += 'Text: ' + ex.text + '\n';
  if (isVisual(ex)) t += visualAsText(ex);
  if (ex.lines) t += 'Code lines:\n' + ex.lines.join('\n') + '\nBug lines (0-based): ' + ex.bugs + '\nFix: ' + ex.fix + '\n';
  if (ex.type === 'calc') t += 'Answer: ' + ex.answer + ' ' + (ex.unit || '') + '\n';
  if (ex.steps) t += 'Steps: ' + ex.steps.map(s => s.prompt + ' [correct: ' + s.options.find(o => o.ok).text + ']').join(' | ') + '\n';
  if (ex.model) t += 'Model answer: ' + ex.model + '\n';
  if (ex.solution) t += 'Solution:\n' + ex.solution + '\n';
  t += 'Explanation: ' + (ex.explain || '');
  const sec = SEC[ex.section];
  return 'COURSE NOTES — exercise context:\n' + t + (sec ? '\n\nSection notes:\n' + sectionText(sec).slice(0, 7000) : '');
}
/** What the learner entered in an exercise, as text for the tutor ('' when unknown). */
function givenOf(w) { try { return String(w?.given?.() || '').slice(0, 3000); } catch (e) { return ''; } }
/** The three AI buttons of an exercise — each its own conversation, mode and task:
    "Ask Brick" before answering → hints (never the answer) · "Help me get it" after a wrong answer → Socratic, starting from the learner's answer ·
    "Explain differently" after a wrong answer → a free, in-depth explanation from another angle (no questions). */
function askAIAbout(ex, mode, given = '') {
  const ctx = { kind: 'exercise', id: ex.id, text: exerciseAsText(ex) };
  const m = mode === 'explain' ? 'explain' : mode === 'socratic' ? 'socratic' : 'hint';
  const key = ex.id + '|' + m;
  T.hist[key] = []; delete T.tstate[key];
  const mine = given ? ` (I answered: ${given.length > 300 ? given.slice(0, 300) + '…' : given})` : '';
  if (m === 'explain') openTutor(ctx, 'explain', `I got this exercise wrong${mine}. Explain it to me differently.`, { intent: INTENT.exExplain(given) });
  else if (m === 'socratic') openTutor(ctx, 'socratic', `I got this exercise wrong${mine}. Help me get it — don't just give me the answer.`, { intent: INTENT.exSocratic(given) });
  else openTutor(ctx, 'hint', 'Give me a hint for this exercise — don\'t tell me the answer.', { intent: INTENT.exHint(given) });
}
