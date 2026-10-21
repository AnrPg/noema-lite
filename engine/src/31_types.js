/* ===================== Exercise types for critical thinking (CONTENT_SPEC.md, Q5 / paradigms) =====================
   flaw · case · predict · tree · inquiry · debate — same contract as the renderers in 30_exercises.js:
   { el, check(): true|false|null, reveal(), given(), selfDone? } */
Object.assign(TYPE_ICON, { flaw: '🔎', case: '📂', predict: '🔮', tree: '🌳', inquiry: '❓', debate: '🗣' });

/** Find the flaw: tap the wrong line(s) of a worked solution, argument or code, then pick why it is wrong. */
R.flaw = (ex, api) => {
  const sel = new Set(), bad = new Set(ex.flaws || []);
  const code = ex.asCode || !!ex.lang;
  const lines = ex.lines.map((l, i) => h('button', { onclick: () => { if (api.locked()) return; sel.has(i) ? sel.delete(i) : sel.add(i); lines[i].classList.toggle('sel'); } },
    h('span', { class: 'ln' }, nf(i + 1)), code ? h('span', { html: highlight(l, ex.lang || guessLang(ex.lines.join('\n'))) }) : h('span', { class: 'prose' }, F(l))));
  let why = null;
  const whyBtns = ex.reasons.map((r, i) => h('button', { class: 'opt', onclick: () => { if (api.locked()) return; why = i; whyBtns.forEach((b, k) => b.classList.toggle('sel', k === i)); } },
    h('span', { class: 'k' }, String.fromCharCode(65 + i)), h('span', {}, F(r))));
  return {
    el: h('div', {}, h('div', { class: 'tiny', style: { marginBottom: '8px' } }, tE('engine.ex.flawHint', { n: bad.size })),
      h('div', { class: 'codelines' + (code ? '' : ' prose') }, ...lines),
      h('div', { class: 'lbl', style: { margin: '12px 0 6px' } }, tE('engine.ex.flawWhy')), h('div', { class: 'opts' }, ...whyBtns)),
    check() { if (!sel.size || why === null) return null; return sel.size === bad.size && [...sel].every(i => bad.has(i)) && why === ex.reason; },
    given: () => [...sel].sort((a, b) => a - b).map(i => 'line ' + (i + 1)).join(', ') + (why === null ? '' : ' — because: ' + ex.reasons[why]),   // i18n-ignore (for the AI)
    reveal() {
      lines.forEach((b, i) => { if (bad.has(i)) b.classList.add('right'); else if (sel.has(i)) b.classList.add('wrong'); });
      whyBtns.forEach((b, i) => { if (i === ex.reason) b.classList.add('right'); else if (i === why) b.classList.add('wrong'); });
      if (ex.fix) whyBtns[0].parentElement.after(h('div', { class: 'fb ok' }, h('b', {}, '🔧 ' + tE('engine.ex.fix') + ' '), code && /\n|;|\(|=/.test(ex.fix) ? codeBlock(ex.fix, ex.lang || guessLang(ex.fix)) : h('span', { html: fmt(ex.fix) })));
    },
  };
};

/** A case: one situation, 2–4 questions about it (mcq, tf or calc), each graded on its own. */
R.case = (ex, api) => {
  const quiet = { locked: api.locked, check: () => { }, done: () => { } };   // the parts answer into the card's one Check
  const parts = ex.parts.map((p, i) => {
    const w = (R[p.type] || R.mcq)({ ...p, id: ex.id + '/' + i }, quiet);
    const box = h('div', { class: 'casepart' }, h('div', { class: 'sp' }, h('span', { class: 'pill c' }, tE('engine.ex.casePart', { n: i + 1, of: ex.parts.length })), ' ', h('span', { html: fmt(p.q) })), w.el);
    return { p, w, box };
  });
  return {
    el: h('div', { class: 'case' }, ...parts.map(x => x.box)),
    check() { const r = parts.map(x => x.w.check()); return r.some(v => v === null) ? null : r.every(Boolean); },
    score: () => parts.filter(x => x.w.check()).length / parts.length,
    given: () => parts.map((x, i) => `(${i + 1}) ` + givenOf(x.w)).join('  '),
    reveal() { parts.forEach(x => { const ok = x.w.check(); x.w.reveal?.(); x.box.classList.add(ok ? 'ok' : 'bad'); if (x.p.explain) x.box.append(h('div', { class: 'fb ' + (ok ? 'ok' : 'info'), html: fmt(x.p.explain) })); }); },
  };
};

/** Predict: commit to what will happen (an option or a number), then see what actually happens. */
R.predict = (ex, api) => {
  const numeric = !Array.isArray(ex.options);
  const w = numeric ? R.calc(ex, api) : R.mcq(ex, api);
  return {
    ...w,
    el: h('div', {}, h('div', { class: 'tiny', style: { marginBottom: '8px' } }, '🔮 ' + tE('engine.ex.predictHint')), w.el),
    reveal() { w.reveal(); w.el.after(h('div', { class: 'fb info' }, h('b', {}, '▶ ' + tE('engine.ex.outcome') + ' '), /\n/.test(ex.outcome) && ex.lang ? codeBlock(ex.outcome, ex.lang) : h('span', { html: fmt(ex.outcome) }))); },
  };
};

/** Decision tree: walk from the root; a wrong branch shows where it leads and the learner chooses again. */
R.tree = (ex, api) => {
  const box = h('div', { class: 'tree' }), path = h('ol', { class: 'treepath' }), pathLbl = h('div', { class: 'tiny', hidden: true }, tE('engine.ex.treePath'));
  let mistakes = 0, steps = 0;
  const seen = new Set();
  function node(id) {
    const n = ex.nodes[id]; if (!n || seen.has(id)) return api.done(mistakes === 0, mistakes);   // a malformed tree ends instead of looping
    seen.add(id); steps++;
    const div = h('div', { class: 'scstep' }, h('div', { class: 'sp' }, h('span', { class: 'pill c' }, '🌳 ' + nf(steps)), ' ', F(n.q)));
    const opts = h('div', { class: 'opts' }), fbBox = h('div');
    let done = false;
    n.options.forEach((o, i) => {
      const b = h('button', { class: 'opt', onclick: () => {
        if (done || b.classList.contains('wrong')) return;
        fbBox.innerHTML = '';
        if (o.ok) {
          done = true; b.classList.add('right'); beep('ok');
          path.append(h('li', {}, F(o.text))); pathLbl.hidden = false;
          if (o.fb) fbBox.append(h('div', { class: 'fb ok', html: '✅ ' + fmt(o.fb) }));
          if (o.to) node(o.to); else api.done(mistakes === 0, mistakes);
        } else { mistakes++; b.classList.add('wrong', 'shake'); beep('bad'); fbBox.append(h('div', { class: 'fb bad', html: '↪ ' + fmt(o.fb) })); }
      } }, h('span', { class: 'k' }, String.fromCharCode(65 + i)), F(o.text));
      opts.append(b);
    });
    div.append(opts, fbBox); box.append(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  node(ex.start || Object.keys(ex.nodes)[0]);
  return { el: h('div', {}, pathLbl, path, box), selfDone: true, given: () => [...path.children].map(li => li.textContent).join(' → ') };
};

/** Inquiry: which question, test or experiment tells you the most? Each option has a value 0–3 shown afterwards. */
R.inquiry = (ex, api) => {
  const best = Math.max(...ex.scores);
  let pick = null;
  const btns = shuffle(ex.options.map((o, i) => i)).map((oi, k) => {
    const b = h('button', { class: 'opt', onclick: () => { if (api.locked()) return; pick = oi; api.check(); } }, h('span', { class: 'k' }, String.fromCharCode(65 + k)), h('span', {}, F(ex.options[oi])));
    b._oi = oi; return b;
  });
  return {
    el: h('div', {}, h('div', { class: 'tiny', style: { marginBottom: '8px' } }, tE('engine.ex.inquiryHint')), h('div', { class: 'opts' }, ...btns)),
    keys: k => btns[k]?.click(),
    check: () => pick === null ? null : ex.scores[pick] === best,
    given: () => pick === null ? '' : ex.options[pick],
    reveal() {
      btns.forEach(b => {
        const oi = b._oi, sc = ex.scores[oi];
        b.classList.add(sc === best ? 'right' : oi === pick ? 'wrong' : 'dim');
        b.children[1].append(h('span', { class: 'why' }, h('span', { class: 'value', title: tE('engine.ex.inquiryValue', { n: sc }), 'aria-label': tE('engine.ex.inquiryValue', { n: sc }) }, '●'.repeat(sc) + '○'.repeat(3 - sc)), ' ', h('span', { html: fmt(ex.why?.[oi] || '') })));
      });
    },
  };
};

/** Debate: take any side (no side is graded), then pick the strongest objection to it. */
R.debate = (ex, api) => {
  const box = h('div', { class: 'debate' });
  let side = null, pick = null, cBtns = [];
  const sideBtns = ex.sides.map((s, i) => h('button', { class: 'opt', onclick: () => {
    if (api.locked() || side !== null) return;
    side = i; sideBtns.forEach((b, k) => { b.classList.toggle('sel', k === i); if (k !== i) b.classList.add('dim'); });
    const sd = ex.sides[i];
    cBtns = shuffle(sd.counters.map((c, j) => j)).map((ci, k) => { const b = h('button', { class: 'opt', onclick: () => { if (api.locked()) return; pick = ci; api.check(); } }, h('span', { class: 'k' }, String.fromCharCode(65 + k)), h('span', {}, F(sd.counters[ci]))); b._ci = ci; return b; });
    box.append(h('div', { class: 'lbl', style: { margin: '12px 0 6px' } }, tE('engine.ex.debateCounter')), h('div', { class: 'opts' }, ...cBtns));
  } }, h('span', { class: 'k' }, String.fromCharCode(65 + i)), h('span', {}, F(s.position))));
  box.append(h('div', { class: 'lbl', style: { marginBottom: '6px' } }, tE('engine.ex.debatePick')), h('div', { class: 'opts' }, ...sideBtns));
  return {
    el: box, keys: k => (side === null ? sideBtns : cBtns)[k]?.click(),
    check: () => pick === null ? null : pick === ex.sides[side].best,
    given: () => side === null ? '' : 'side: ' + ex.sides[side].position + (pick === null ? '' : ' — objection: ' + ex.sides[side].counters[pick]),   // i18n-ignore (for the AI)
    reveal() { const sd = ex.sides[side]; cBtns.forEach(b => { const ci = b._ci; if (ci === sd.best) b.classList.add('right'); else if (ci === pick) b.classList.add('wrong'); if (sd.why?.[ci]) b.children[1].append(h('span', { class: 'why', html: fmt(sd.why[ci]) })); }); },
  };
};

/* i18n-ignore-start */   // the new types as context for the AI (English, like exerciseAsText)
function typeAsText(ex) {
  switch (ex.type) {
    case 'flaw': return 'Lines:\n' + ex.lines.map((l, i) => `${i + 1}. ${l}`).join('\n') + '\nFlawed lines: ' + ex.flaws.map(i => i + 1).join(', ') + '\nReason options: ' + ex.reasons.join(' | ') + '\nCorrect reason: ' + ex.reasons[ex.reason] + (ex.fix ? '\nFix: ' + ex.fix : '') + '\n';
    case 'case': return ex.parts.map((p, i) => `Part ${i + 1} (${p.type}): ${p.q}` + (p.options ? ' Options: ' + p.options.join(' | ') + ' Correct: ' + [].concat(p.answer).map(a => p.options[a]).join(' + ') : ' Answer: ' + p.answer + (p.unit ? ' ' + p.unit : ''))).join('\n') + '\n';
    case 'predict': return (ex.options ? 'Options: ' + ex.options.join(' | ') + '\nCorrect: ' + ex.options[ex.answer] : 'Answer: ' + ex.answer + ' ' + (ex.unit || '')) + '\nWhat happens: ' + ex.outcome + '\n';
    case 'tree': return 'Decision tree: ' + Object.entries(ex.nodes).map(([id, n]) => `[${id}] ${n.q} → right: ${(n.options.find(o => o.ok) || {}).text}`).join(' | ') + '\n';
    case 'inquiry': return 'Options with their value (0-3): ' + ex.options.map((o, i) => `${o} = ${ex.scores[i]}`).join(' | ') + '\n';
    case 'debate': return ex.sides.map(s => `Position: ${s.position}; strongest objection: ${s.counters[s.best]}`).join('\n') + '\n';
  }
  return '';
}
/* i18n-ignore-end */
