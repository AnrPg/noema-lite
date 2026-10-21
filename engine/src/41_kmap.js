/* ===================== The pack's knowledge map ("Info"), traps in the Mistakes gym, reported exercises =====================
   chapter.map is the knowledge map written before the chapter (CONTENT_SPEC.md, map/chNN.json, noema.map/v1):
   points {id, text, level, cats, taughtIn}, learnables {id, kp, goal}. Exercises point to a learnable with `lr`. */
const KMAP_CATS = ['pitfall', 'confusable', 'falsefriend', 'detail', 'sequence', 'multipart', 'nomenclature', 'acronym', 'formula', 'edge', 'recent', 'hard-understand', 'hard-remember'];
const hasKmap = () => COURSE.some(c => c.map?.learnables?.length);
/** The categories of the knowledge points an exercise's learnable covers (pitfall, confusable…). */
function exCats(ex) {
  const m = ex._ch?.map; if (!m || !ex.lr) return [];
  const L = (m.learnables || []).find(l => l.id === ex.lr); if (!L) return [];
  const P = new Map((m.points || []).map(p => [p.id, p]));
  return [...new Set((L.kp || []).flatMap(k => P.get(k)?.cats || []))];
}
const lrExercises = (c, lr) => c.exercises.filter(e => e.lr === lr);
function lrMastery(c, lr) { const ex = lrExercises(c, lr); return { n: ex.length, ok: ex.filter(e => solved(e.id)).length }; }

/** The overlay: every chapter's map; the chapter `focus` opens unfolded. A learnable starts a round of its exercises. */
function knowledgeMap(focus) {
  modal((box, close) => {
    box.classList.add('kmapbox');
    const chs = COURSE.filter(c => c.map?.learnables?.length);
    box.append(h('h3', {}, tE('engine.kmap.title')), h('p', { class: 'tiny' }, tE('engine.kmap.intro')));
    for (const c of chs) {
      const m = c.map, P = new Map((m.points || []).map(p => [p.id, p]));
      const all = m.learnables.map(l => lrMastery(c, l.id)), done = all.filter(x => x.n && x.ok === x.n).length;
      const det = h('details', { class: 'kmapch', open: c.id === focus || chs.length === 1 ? '' : null },
        h('summary', {}, h('span', {}, `${c.emoji || '📘'} ${c.title}`), h('span', { class: 'tiny' }, tE('engine.kmap.chSummary', { points: (m.points || []).length, learnables: m.learnables.length, done }))));
      const LV = ['foundation', 'core', 'advanced'];
      const lowest = l => Math.min(...(l.kp || []).map(k => LV.indexOf(P.get(k)?.level)).filter(i => i >= 0), 1);   // a learnable sits at the level of its most basic point (core if none)
      for (const lv of LV) {
        const ls = m.learnables.filter(l => LV[lowest(l)] === lv);
        if (!ls.length) continue;
        det.append(h('div', { class: 'lbl kmaplv' }, tE('engine.kmap.level_' + lv)));
        for (const l of ls) {
          const ms = lrMastery(c, l.id), pts = (l.kp || []).map(k => P.get(k)).filter(Boolean);
          const cats = [...new Set(pts.flatMap(p => p.cats || []))];
          det.append(h('div', { class: 'kmaplr' },
            h('div', { class: 'row' }, h('b', { class: 'grow', html: fmt(l.goal || pts[0]?.text || l.id) }),
              ms.n ? h('button', { class: 'btn small', title: tE('engine.kmap.practise'), onclick: () => { close(); startRun(lrExercises(c, l.id), { title: '🧭 ' + (l.goal || l.id), count: ms.n, back: location.hash }); } }, `${nf(ms.ok)}/${nf(ms.n)} ▶`) : null),
            cats.length ? h('div', { class: 'kmapcats' }, ...cats.map(k => h('span', { class: 'pill' }, tE('engine.cat.' + k)))) : null,
            h('ul', {}, ...pts.map(p => h('li', { html: fmt(p.text) })))));
        }
      }
      const earlier = (m.points || []).filter(p => p.taughtIn);
      if (earlier.length) det.append(h('div', { class: 'lbl kmaplv' }, tE('engine.kmap.earlier')), h('ul', { class: 'tiny' }, ...earlier.map(p => h('li', {}, F(p.text), ' — ', h('i', {}, String(p.taughtIn))))));
      box.append(det);
    }
    box.append(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, h('button', { class: 'btn', onclick: close }, tE('engine.kmap.close'))));
  });
}

/** Mistakes gym, by trap: the open mistakes grouped by the categories of their knowledge points. */
function mistakesByCat(list) {
  const by = {}; for (const e of list) for (const k of exCats(e)) (by[k] = by[k] || []).push(e);
  const cats = KMAP_CATS.filter(k => by[k]); if (!cats.length) return null;
  return h('div', { class: 'gymcats' }, h('div', { class: 'lbl' }, tE('engine.gym.byTrap')),
    h('div', { class: 'fchips' }, ...cats.map(k => h('button', { class: 'fchip', onclick: () => startRun(by[k], { title: '🔁 ' + tE('engine.cat.' + k), count: by[k].length, back: '#/mistakes' }) }, tE('engine.cat.' + k) + ' · ' + nf(by[k].length)))));
}

/** ⚑ The exercises the learner reported (S.flags): listed, and copied as JSON for Claude to revise them (reviseExercises keeps their ids). */
function reportedView() {
  const ids = Object.keys(S.flags || {}).filter(id => EX[id]);
  modal((box, close) => {
    box.append(h('h3', {}, '⚑ ' + tE('engine.flags.title', { n: ids.length })), h('p', { class: 'tiny' }, tE('engine.flags.intro')),
      h('ul', { class: 'flaglist' }, ...ids.map(id => { const f = S.flags[id], e = EX[id]; return h('li', {}, h('b', {}, tE('engine.ex.report_' + f.why)), ' · ', h('span', { html: fmt((e.q || '').slice(0, 120)) }), f.note ? h('div', { class: 'tiny' }, '“' + f.note + '”') : null,
        h('button', { class: 'btn ghost small', onclick: () => { delete S.flags[id]; save(); close(); if (Object.keys(S.flags).length) reportedView(); } }, tE('engine.flags.clear'))); })),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, h('button', { class: 'btn', onclick: close }, tE('engine.kmap.close')),
        h('button', { class: 'btn primary', onclick: async () => {
          /* i18n-ignore-start */   // a request for Claude (English, like the prompts)
          const txt = `Revise these exercises of the noema-lite subject "${SUBJ.title}" (id ${SUBJ.id}) with a patch {"reviseExercises":[…]} that keeps every id (tools/CONTENT_SPEC.md "Additive updates"). The learner's reports:\n` + JSON.stringify(ids.map(id => ({ report: S.flags[id], exercise: Object.fromEntries(Object.entries(EX[id]).filter(([k]) => !k.startsWith('_'))) })), null, 1);
          /* i18n-ignore-end */
          try { await navigator.clipboard.writeText(txt); toast('📋 ' + tE('engine.flags.copied')); } catch (e) { toast('⚠️ ' + errText(e), 4000); }
        } }, '📋 ' + tE('engine.flags.copy'))));
  });
}
