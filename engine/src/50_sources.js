/* ===================== Sources: registry, filtering, "what's new" ===================== */
/* Data model: every chapter has `src`; any item (section, block, exercise, playbook, flashcard, pitfall)
   may carry its own `src` (patched-in material) — otherwise it inherits the chapter's. Filtering never
   mutates content: it rebuilds lightweight views (shallow clones) of the full course. */
const SRCREG = window.SOURCES || { sources: [], chapters: {}, patches: {} };
const SOURCES = SRCREG.sources.length ? SRCREG.sources : [{ id: 'base', title: tE('engine.src.course'), pages: '', emoji: '📘' }];   // (the loader has set the UI language before the engine runs)
const SRC_BY_ID = Object.fromEntries(SOURCES.map((s, i) => [s.id, { ...s, _i: i }]));
const FULL_COURSE = COURSE.slice();
FULL_COURSE.forEach((c, i) => {
  c._ci = i;
  c.src = [SRCREG.chapters?.[c.id], c.src].find(id => id && SRC_BY_ID[id]) || SOURCES[0].id;   // only ids that exist
  c.flashcards.forEach((f, k) => { f._key = f.id || f._key || c.id + '#' + k; });   // SRS keys: the card's id (packs without ids: its position), independent of filtering
});
{ /* tell sibling apps (Meletee, a:caps) that card progress is keyed by card id; each feature merges only its own flag */
  const k = Noema.kv.accountKey('caps'); let c = {}; try { c = JSON.parse(Noema.kv.get(k) || '{}') || {}; } catch (e) { }
  if (!c.stableCardIds) Noema.kv.set(k, JSON.stringify({ ...c, stableCardIds: 1 }));
}
const srcOfItem = (it, c) => (it && it.src) || c.src;

/* ---------- "new" = sources added AFTER the subject was first made (a later version), not yet marked as seen.
   Sources that arrived together with the first one (same "added" date, or no dates at all) are never "new". ---------- */
const FIRST_ADDED = SOURCES.map(s => s.added).filter(Boolean).sort()[0] || null;
function isNewSrc(id) { const s = SRC_BY_ID[id]; if (!id || id === SOURCES[0].id || !s) return false; if (FIRST_ADDED && s.added && s.added <= FIRST_ADDED) return false; if (FIRST_ADDED && !s.added) return false; return !(S.seenSrc && S.seenSrc[id]); }

/* ---------- chapter ↔ sources: EVERY source a chapter really uses ----------
   Signals (strongest first): chapter.sources [{id, pages}] · the chapter's main source · items with their own src ·
   the free-text sourcePages ("ECB σ. 23–42 · Karp 9.2 · διάλεξη YouTube (37:00–63:00)"), split into parts and each
   part matched to a source by its id, short name, acronym or a word only its title has. */
const NORM = x => String(x || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['’`]/g, ' ').replace(/[^a-z0-9α-ωа-я]+/g, ' ').trim();   // i18n-ignore
const SRC_ALIASES = (() => {
  const words = s => NORM(s.title).split(' ').filter(w => w.length >= 4 && !/^\d+$/.test(w));
  const count = {}; SOURCES.forEach(s => new Set(words(s)).forEach(w => count[w] = (count[w] || 0) + 1));
  const STOP = new Set(['part', 'chapter', 'with', 'from', 'the', 'and', 'for', 'των', 'στην', 'στον', 'για', 'απο', 'και', 'μαθημα', 'course', 'notes']);   // i18n-ignore
  return Object.fromEntries(SOURCES.map(s => {
    const a = new Set();
    if (s.id.length >= 2 && !/^(part|src|source|s)\d*$/i.test(s.id)) a.add(NORM(s.id));
    if (s.short) a.add(NORM(s.short));
    const latin = (s.title.match(/[A-Z][A-Za-z']+/g) || []).filter(w => !/^(The|And|Of|For|In|On|A|An)$/.test(w)); if (latin.length >= 2) a.add(latin.map(w => w[0]).join('').toLowerCase());   // i18n-ignore
    for (const m of String(s.title).matchAll(/(κεφ|κεφαλαιο|ch|chapter|kap|chap)\.?\s*(\d+)/gi)) a.add(NORM(m[1].replace(/αλαιο|apter|ap/i, '')) + ' ' + m[2]);   // i18n-ignore
    words(s).filter(w => count[w] === 1 && !STOP.has(w)).forEach(w => a.add(w));
    const u = (String(s.url || s.subtitle || '').match(/https?:\/\/(?:www\.)?([a-z0-9-]+)/i) || [])[1]; if (u) a.add(u.toLowerCase());   // i18n-ignore
    return [s.id, [...a].filter(x => x && x.length >= 2)];
  }));
})();
const hasAlias = (seg, al) => { const t = ' ' + NORM(seg) + ' '; return al.filter(a => t.includes(' ' + a + ' ') || (a.length >= 5 && t.includes(' ' + a))).length; };
const PAGE_RE = /(?<![\p{L}])(?:σελ|σ|pp?|pages?|page|seite|s|pg)\.?\s*(\d{1,4})/iu, TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;   // i18n-ignore
const REFS = {};
/** [{ src, label, page, start, main }] for a chapter (memoised). */
function chapterRefs(c) {
  if (REFS[c.id]) return REFS[c.id];
  const out = []; const add = (src, label, main) => { if (!SRC_BY_ID[src]) return; const pm = String(label || '').match(PAGE_RE), tm = String(label || '').match(TIME_RE); const ex = out.find(r => r.src === src); if (ex) { if (label && !ex.label.includes(label)) ex.label = !ex.label || label.includes(ex.label) ? label : ex.label + ' · ' + label; ex.page = ex.page || (pm ? +pm[1] : null); ex.start = ex.start ?? (tm ? (+tm[1]) * (tm[3] ? 3600 : 60) + (+tm[2]) * (tm[3] ? 60 : 1) + (+(tm[3] || 0)) : null); ex.main = ex.main || main; return; } out.push({ src, label: label || '', page: pm ? +pm[1] : null, start: tm ? (+tm[1]) * (tm[3] ? 3600 : 60) + (+tm[2]) * (tm[3] ? 60 : 1) + (+(tm[3] || 0)) : null, main: !!main }); };
  if (Array.isArray(c.sources)) c.sources.forEach(r => add(r.id || r.src, r.pages || r.label || '', r.id === c.src));
  const segs = String(c.sourcePages || '').split(/\s+[·|;]\s+|\n|\s+\+\s+/).map(x => x.trim()).filter(Boolean);
  for (const seg of segs) {
    let best = null, bestN = 0; for (const s of SOURCES) { const n = hasAlias(seg, SRC_ALIASES[s.id]); if (n > bestN) { best = s.id; bestN = n; } }
    add(best || c.src, seg, (best || c.src) === c.src);
  }
  if (!out.some(r => r.src === c.src)) add(c.src, '', true); else out.find(r => r.src === c.src).main = true;
  const items = [...c.sections, ...c.exercises, ...c.debug, ...c.flashcards, ...c.pitfalls, ...c.sections.flatMap(s => s.blocks)];
  new Set(items.map(it => it.src).filter(Boolean)).forEach(src => add(src, '', false));
  out.sort((a, b) => (b.main - a.main));
  return (REFS[c.id] = out);
}
/** For a source: the chapters that use it — main source first, then "also used in". */
function sourceChapters(srcId) { return FULL_COURSE.map(c => ({ c, ref: chapterRefs(c).find(r => r.src === srcId) })).filter(x => x.ref).sort((a, b) => (b.ref.main - a.ref.main) || (a.c._ci - b.c._ci)); }

/* ---------- opening a source (👁 preview) ---------- */
async function openSource(srcId, { page, start } = {}) {
  const s = SRC_BY_ID[srcId]; if (!s) return;
  if (page && window.NoemaSrcFiles?.filePage) page = NoemaSrcFiles.filePage(s, page);   // a part of a split PDF starts at "firstPage" of the book
  const av = window.NoemaSrcFiles ? NoemaSrcFiles.available(ACCOUNT.id, SUBJ.id, s) : null;
  if (!av) { DECK.open = true; DECK.expanded[srcId] = true; renderSourcesDeck(); toast('📎 ' + tE('engine.src.noFile'), 4500); return; }
  if (av.url && !av.meta) return NoemaViewer.open({ url: av.url, title: s.title, subtitle: s.subtitle, page, start });
  toast('⏳ ' + tE('engine.src.opening'), 1200);
  const rec = await NoemaSrcFiles.get(ACCOUNT.id, SUBJ.id, srcId).catch(() => null);
  if (!rec) { toast('⚠️ ' + tE('engine.src.unavailable'), 4500); return; }
  NoemaViewer.open({ blob: rec.blob, name: rec.name, type: rec.type, title: s.title, subtitle: s.subtitle, page });
}
/** The chapter header line: which sources this chapter comes from — tap one to open it at that page. */
function sourceChips(c) {
  const refs = chapterRefs(c); if (!refs.length || (refs.length === 1 && !refs[0].label && SOURCES.length === 1 && SOURCES[0].id === 'base')) return null;
  const short = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 46 ? t.slice(0, 44).replace(/[\s,·]+\S*$/, '') + '…' : t; };
  return h('div', { class: 'srcrefs', 'aria-label': tE('engine.src.chapterAria') }, h('span', { class: 'srcrefs-l' }, tE('engine.src.from')),
    ...refs.map(r => { const s = SRC_BY_ID[r.src]; const av = window.NoemaSrcFiles?.available(ACCOUNT.id, SUBJ.id, s);
      return h('button', { class: 'srcref' + (av ? ' can' : ''), title: `${s.title}${r.label ? '\n' + r.label : ''}\n` + (av ? '👁 ' + (r.page ? tE('engine.src.openAtPage', { page: r.page }) : tE('engine.src.open')) : tE('engine.src.showCard')), onclick: () => openSource(r.src, { page: r.page, start: r.start }) },
        h('span', { class: 'e' }, s.emoji || '📘'), h('span', {}, short(r.label ? (s.short && !r.label.includes(s.short) ? s.short + ' ' + r.label : r.label) : s.short || s.title)), av ? h('span', { class: 'eye', 'aria-hidden': 'true' }, '👁') : null); }));
}
function newSources() { return SOURCES.filter(s => isNewSrc(s.id)).map(s => s.id); }
function markSeen(ids) { S.seenSrc = S.seenSrc || {}; (ids || SOURCES.map(s => s.id)).forEach(id => S.seenSrc[id] = true); save(); }

/* ---------- per-source statistics over the FULL course ---------- */
function sourceStats() {
  const st = Object.fromEntries(SOURCES.map(s => [s.id, { chapters: new Set(), newChapters: [], sections: new Set(), enriched: new Set(), blocks: 0, exercises: 0, playbooks: 0, cards: 0, pitfalls: 0 }]));
  const bump = (id, k, n = 1) => { if (st[id]) st[id][k] += n; };
  FULL_COURSE.forEach(c => {
    if (st[c.src]) st[c.src].newChapters.push(c);
    c.sections.forEach(s => {
      const ss = srcOfItem(s, c);
      if (st[ss]) { st[ss].sections.add(s.id); st[ss].chapters.add(c.id); }
      s.blocks.forEach(b => { const bs = srcOfItem(b, c); bump(bs, 'blocks'); if (st[bs] && bs !== ss) { st[bs].enriched.add(s.id); st[bs].chapters.add(c.id); } });
    });
    c.exercises.forEach(e => { const es = srcOfItem(e, c); bump(es, 'exercises'); if (st[es] && es !== c.src) { st[es].enriched.add(e.section); st[es].chapters.add(c.id); } });
    c.debug.forEach(d => bump(srcOfItem(d, c), 'playbooks'));
    c.flashcards.forEach(f => bump(srcOfItem(f, c), 'cards'));
    c.pitfalls.forEach(p => bump(srcOfItem(p, c), 'pitfalls'));
  });
  return st;
}

/* ---------- filtering ---------- */
function activeSrcSet() { const on = S.settings.srcOn; return Array.isArray(on) && on.length && on.length < SOURCES.length ? new Set(on) : null; }
function setSrcFilter(ids) { S.settings.srcOn = ids && ids.length && ids.length < SOURCES.length ? ids : null; save(); applySourceFilter(); route(); renderSourcesDeck(); }
function applySourceFilter() {
  const on = activeSrcSet();
  const vis = id => !on || on.has(id);
  COURSE.length = 0; ALL_EX.length = 0;
  for (const o of [CH, SEC, EX, PB]) for (const k of Object.keys(o)) delete o[k];
  FULL_COURSE.forEach(c0 => {
    const exAll = c0.exercises.filter(e => vis(srcOfItem(e, c0)));
    const pbAll = c0.debug.filter(d => vis(srcOfItem(d, c0)));
    const secs = c0.sections.map(s0 => {
      const blocks = s0.blocks.filter(b => vis(srcOfItem(b, s0.src ? s0 : c0)));
      const s = { ...s0, blocks, _full: s0 };
      s._new = isNewSrc(srcOfItem(s0, c0)) || s0.blocks.some(b => b.src && b.src !== c0.src && isNewSrc(b.src)) || c0.exercises.some(e => e.section === s0.id && e.src && e.src !== c0.src && isNewSrc(e.src));
      return s;
    }).filter(s => vis(srcOfItem(s._full, c0)) || s.blocks.length || exAll.some(e => e.section === s.id) || pbAll.some(d => d.section === s.id));
    if (!secs.length) return;
    const ids = new Set(secs.map(s => s.id));
    const c = { ...c0, sections: secs, exercises: exAll.filter(e => ids.has(e.section)), debug: pbAll.filter(d => !d.section || ids.has(d.section)),
      flashcards: c0.flashcards.filter(f => vis(srcOfItem(f, c0)) && (!f.section || ids.has(f.section))), pitfalls: c0.pitfalls.filter(p => vis(srcOfItem(p, c0))) };
    c._newWhole = isNewSrc(c0.src);
    c._new = c._newWhole || secs.some(s => s._new);
    c._i = COURSE.length; COURSE.push(c); CH[c.id] = c;
    c.sections.forEach((s, j) => { s._ch = c; s._j = j; SEC[s.id] = s; });
    c.exercises.forEach(e => { e._ch = c; EX[e.id] = e; ALL_EX.push(e); });
    c.debug.forEach(d => { d._ch = c; PB[d.id] = d; });
  });
  if (!COURSE.length) { S.settings.srcOn = null; save(); return applySourceFilter(); }   // never leave the app empty
  searchIdx = null;
}

/* ---------- badges / hooks used by the existing views ---------- */
function newBadge(x) {
  if (!x || !x._new) return null;
  if (x.sections) return h('span', { class: 'newpill corner' }, '✨ ' + (x._newWhole ? tE('engine.src.newChapter') : tE('engine.src.newContent')));
  return h('span', { class: 'newpill' }, '✨ ' + tE('engine.src.new'));
}
function newPill(item) {
  const c = item && item._ch; if (!c) return null;
  const s = item.src;
  return s && s !== c.src && isNewSrc(s) ? h('span', { class: 'newpill' }, '✨ ' + tE('engine.src.new')) : null;
}
function markNewBlock(el, b, c) { if (b.src && b.src !== c.src && isNewSrc(b.src)) { el.classList.add('is-new'); el.prepend(h('span', { class: 'newtag' }, '✨ ' + tE('engine.src.NEW'))); } }
function filterBanner() {
  const on = activeSrcSet(); if (!on) return null;
  const names = [...on].map(id => SRC_BY_ID[id]?.title || id).join(' + ');
  const onlyNew = newSources().length && [...on].every(id => isNewSrc(id));
  return h('div', { class: 'filterbar' }, h('span', {}, onlyNew ? '✨' : '🔎'), h('span', { class: 'grow' }, h('b', {}, (onlyNew ? tE('engine.src.onlyNewLabel') : tE('engine.src.filteredLabel')) + ' '), names),
    h('button', { class: 'btn small', onclick: () => toggleSourcesDeck(true) }, '📚 ' + tE('engine.src.sources')), h('button', { class: 'btn small primary', onclick: () => setSrcFilter(null) }, tE('engine.src.showEverything')));
}
function whatsNewButton() {
  const ns = newSources();
  if (!ns.length) return null;
  return h('button', { class: 'btn ai whatsnewbtn', onclick: () => go('#/new') }, '✨ ' + tE('engine.src.showOnlyNew'));
}

/* ---------- "What's new" view ---------- */
function whatsNewView() {
  setAccent(document.body, null);
  let ids = newSources(); const none = !ids.length;
  if (none) ids = [SOURCES[SOURCES.length - 1].id];
  const st = sourceStats();
  const pick = (k) => ids.reduce((a, id) => a + (st[id] ? (st[id][k].size ?? st[id][k]) : 0), 0);
  const newChs = FULL_COURSE.filter(c => ids.includes(c.src));
  const enriched = [...new Set(ids.flatMap(id => [...(st[id]?.enriched || [])]))].map(sid => { for (const c of FULL_COURSE) { const s = c.sections.find(x => x.id === sid); if (s && !ids.includes(c.src)) return { s, c }; } return null; }).filter(Boolean);
  const exNew = FULL_COURSE.flatMap(c => c.exercises.filter(e => ids.includes(srcOfItem(e, c))));
  const pbNew = FULL_COURSE.flatMap(c => c.debug.filter(d => ids.includes(srcOfItem(d, c))));
  const filterOnly = () => setSrcFilter(ids);
  const runNew = () => { setSrcFilter(ids); startRun(ALL_EX.slice(), { title: '✨ ' + tE('engine.new.exercisesTitle'), count: 15, back: '#/new' }); };
  shellChrome({ sub: true, crumbs: [[t('view.whatsNew')]], back: HOME() });
  view(backBtn(t('nav.home'), HOME()),
    h('h1', {}, none ? t('view.latest') : t('view.whatsNew')),
    h('p', { class: 'muted' }, ids.map(id => `${SRC_BY_ID[id].emoji || '📗'} ` + tE('engine.new.srcPages', { title: SRC_BY_ID[id].title, pages: SRC_BY_ID[id].pages })).join(' · ') + (none ? ' — ' + tE('engine.new.alreadySeen') : '')),
    h('div', { class: 'statgrid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' } },
      ...[['chapters', newChs.length], ['sections', pick('sections') + pick('enriched')], ['exercises', pick('exercises')], ['drills', pick('playbooks')], ['flashcards', pick('cards')], ['traps', pick('pitfalls')]].map(([l, n]) => h('div', { class: 'stat' }, h('b', {}, nf(n)), h('span', { class: 'tiny' }, tE('engine.new.stat_' + l, { n }))))),
    h('div', { class: 'row', style: { margin: '6px 0 24px' } },
      h('button', { class: 'btn primary', onclick: filterOnly }, '🔎 ' + tE('engine.new.filterAll')),
      h('button', { class: 'btn', onclick: runNew }, '🎯 ' + tE('engine.new.practice', { n: exNew.length })),
      pbNew.length ? h('button', { class: 'btn', onclick: () => { setSrcFilter(ids); go('#/drill/' + pbNew[0].id); } }, '🔧 ' + tE('engine.new.drills', { n: pbNew.length })) : null,
      h('button', { class: 'btn', onclick: () => { setSrcFilter(ids); go('#/cards'); } }, '🃏 ' + tE('engine.new.cards')),
      none ? null : h('button', { class: 'btn ghost', onclick: () => { markSeen(ids); applySourceFilter(); toast(tE('engine.new.markedSeen')); go(HOME()); } }, '✔ ' + tE('engine.new.markSeen'))),
    newChs.length ? h('h2', { style: { marginBottom: '12px' } }, tE('engine.new.chapters')) : null,
    newChs.length ? h('div', { class: 'chapters' }, ...newChs.map((c, i) => { const card = h('button', { class: 'chcard', style: { animationDelay: i * 50 + 'ms' }, onclick: () => go('#/ch/' + c.id) }, h('div', { class: 'emo' }, c.emoji), h('div', { class: 'num' }, tE('engine.new.chapterN', { num: c.num })), h('h3', {}, c.title), h('p', {}, c.subtitle), h('div', { class: 'tiny' }, tE('engine.new.chCounts', { s: c.sections.length, e: c.exercises.length, d: c.debug.length }))); setAccent(card, c); return card; })) : null,
    enriched.length ? h('h2', { style: { margin: '28px 0 6px' } }, tE('engine.new.enriched')) : null,
    enriched.length ? h('p', { class: 'muted', style: { marginTop: 0 } }, tE('engine.new.enrichedNote')) : null,
    enriched.length ? h('div', { class: 'path' }, ...enriched.map(({ s, c }, i) => { const n = h('button', { class: 'node', style: { animationDelay: i * 25 + 'ms' }, onclick: () => go('#/s/' + s.id) }, h('div', { class: 'dot' }, c.emoji), h('div', { class: 'grow' }, h('b', {}, s.title), h('small', {}, chTitle(c.num, c.title))), h('span', { class: 'newpill' }, tE('engine.new.added', { blocks: s.blocks.filter(b => ids.includes(b.src)).length, ex: c.exercises.filter(e => e.section === s.id && ids.includes(e.src)).length }))); setAccent(n, c); return n; })) : null);
}

/* ---------- Sources deck (collapsible menu under the top bar) ---------- */
const DECK = { open: false, expanded: {} };
function toggleSourcesDeck(force) { DECK.open = force ?? !DECK.open; renderSourcesDeck(); }
function renderSourcesDeck() {
  let d = $('.srcdeck');
  if (!d) { d = h('div', { class: 'srcdeck' }); ($('.topbar') || $('.ns-top') || document.body.firstChild).after(d); }
  d.classList.toggle('open', DECK.open);
  $('.srcbtn')?.classList.toggle('on', DECK.open || !!activeSrcSet());
  d.innerHTML = '';
  if (!DECK.open) return;
  const st = sourceStats();
  const on = activeSrcSet();
  const isOn = id => !on || on.has(id);
  const ns = newSources();
  const inner = h('div', { class: 'deckinner' });
  inner.append(h('div', { class: 'deckhead' },
    h('div', { class: 'grow' }, h('b', {}, '📚 ' + tE('engine.src.sources')), h('span', { class: 'tiny' }, ' · ' + (on ? tE('engine.deck.countSome', { n: SOURCES.length, shown: on.size }) : tE('engine.deck.countAll', { n: SOURCES.length })))),
    h('button', { class: 'fchip' + (!on ? ' on' : ''), onclick: () => setSrcFilter(null) }, tE('engine.deck.all')),
    ns.length ? h('button', { class: 'fchip' + (on && [...on].every(isNewSrc) ? ' on' : ''), onclick: () => setSrcFilter(ns) }, '✨ ' + tE('engine.deck.onlyNew')) : null,
    h('button', { class: 'iconbtn', title: tE('engine.deck.close'), onclick: () => toggleSourcesDeck(false) }, '✕')));
  SOURCES.forEach((s, i) => {
    const x = st[s.id]; const exp = !!DECK.expanded[s.id];
    const chs = sourceChapters(s.id);
    const fm = window.NoemaSrcFiles ? NoemaSrcFiles.index(ACCOUNT.id, SUBJ.id)[s.id] : null; const web = window.NoemaSrcFiles?.webUrl(s);
    const pick = h('input', { type: 'file', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (!f) return; toast('⬆️ ' + tE('engine.deck.saving', { name: f.name }), 2500); try { await NoemaSrcFiles.put(ACCOUNT.id, SUBJ.id, s.id, f); toast('📎 ' + tE('engine.deck.attached')); } catch (er) { toast('⚠️ ' + errText(er), 6000); } renderSourcesDeck(); route(); } });
    const card = h('div', { class: 'srccard' + (isOn(s.id) ? '' : ' off') + (exp ? ' exp' : ''), style: { animationDelay: i * 40 + 'ms' } },
      h('div', { class: 'srcrow' },
        h('label', { class: 'switch', title: tE('engine.deck.include') }, h('input', { type: 'checkbox', checked: isOn(s.id), onchange: e => { const cur = on ? [...on] : SOURCES.map(z => z.id); const next = e.target.checked ? [...new Set([...cur, s.id])] : cur.filter(z => z !== s.id); if (!next.length) { e.target.checked = true; toast(tE('engine.deck.keepOne')); return; } setSrcFilter(next); } }), h('i')),
        h('span', { class: 'srcemo' }, s.emoji || '📘'),
        h('button', { class: 'grow srcmain', onclick: () => { DECK.expanded[s.id] = !exp; renderSourcesDeck(); } },
          h('b', {}, s.title, isNewSrc(s.id) ? h('span', { class: 'newpill', style: { marginLeft: '6px' } }, '✨ ' + tE('engine.src.new')) : null),
          h('small', {}, (s.subtitle || '') + (s.pages ? ' · ' + (/^\d/.test(s.pages) ? tE('engine.deck.pp', { pages: s.pages }) : s.pages) : ''))),
        fm || web ? h('button', { class: 'iconbtn srceye', title: '👁 ' + tE('engine.deck.preview') + (fm ? ' ' + fm.name : ''), 'aria-label': tE('engine.deck.previewAria'), onclick: () => openSource(s.id) }, '👁') : null,
        h('button', { class: 'iconbtn', onclick: () => { DECK.expanded[s.id] = !exp; renderSourcesDeck(); } }, h('span', { class: 'chev', style: { transform: exp ? 'rotate(90deg)' : '' } }, '▸'))),
      exp ? h('div', { class: 'srcbody' },
        h('div', { class: 'srcstats' }, ...[['🧱', x.newChapters.length, 'chapters'], ['📖', x.sections.size, 'sections'], ['➕', x.enriched.size, 'enriched'], ['🎯', x.exercises, 'exercises'], ['🔧', x.playbooks, 'drills'], ['🃏', x.cards, 'cards'], ['⚠️', x.pitfalls, 'traps']].filter(r => r[1]).map(([e, n, l]) => h('span', { class: 'pill' }, `${e} ` + tE('engine.deck.st_' + l, { n })))),
        h('div', { class: 'srcfile' }, fm ? [h('span', {}, `📎 ${fm.name} · ${fileSize(fm.size)}`, fm.cloud ? '' : ' · ' + tE('engine.deck.deviceOnly')), h('button', { class: 'btn small primary', onclick: () => openSource(s.id) }, '👁 ' + tE('engine.deck.preview')), h('label', { class: 'btn small' }, '↻ ' + tE('engine.deck.replace'), pick), h('button', { class: 'btn small ghost', onclick: async () => { if (confirm(tE('engine.deck.removeConfirm'))) { await NoemaSrcFiles.remove(ACCOUNT.id, SUBJ.id, s.id); renderSourcesDeck(); route(); } } }, '🗑 ' + tE('engine.deck.remove'))]
          : web ? [h('span', {}, '🌐 ', h('a', { href: web, target: '_blank', rel: 'noopener' }, web.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))), h('button', { class: 'btn small primary', onclick: () => openSource(s.id) }, '👁 ' + tE('engine.deck.preview')), h('label', { class: 'btn small' }, '📎 ' + tE('engine.deck.attachInstead'), pick)]
          : [h('span', { class: 'tiny' }, s.sha256 ? '📦 ' + tE('engine.deck.inPackage', { name: s.fileName || String(s.file).split('/').pop() }) : s.file ? '📄 ' + tE('engine.deck.notAttached', { name: String(s.file).split('/').pop() }) : tE('engine.deck.noFile')), h('label', { class: 'btn small primary' }, '📎 ' + tE('engine.deck.attach'), pick)]),
        h('div', { class: 'tiny', style: { margin: '6px 0' } }, (s.pages ? (/^\d/.test(s.pages) ? tE('engine.deck.pages', { pages: s.pages }) : s.pages) + ' · ' : '') + tE('engine.deck.added', { date: s.added || '—' })),
        chs.length ? h('div', { class: 'srcchs' }, ...chs.map(({ c, ref }) => h('button', { class: 'srcch' + (ref.main ? '' : ' also'), title: ref.label || '', onclick: () => { toggleSourcesDeck(false); go('#/ch/' + c.id); } }, `${c.emoji} ` + chTitle(c.num, c.title), ref.label ? h('small', {}, ' — ' + (ref.label.length > 60 ? ref.label.slice(0, 58) + '…' : ref.label)) : null, ref.main ? null : h('small', {}, ' ' + tE('engine.deck.also'))))) : h('div', { class: 'tiny' }, tE('engine.deck.noChapter')),
        h('div', { class: 'row', style: { marginTop: '10px' } },
          h('button', { class: 'btn small', onclick: () => setSrcFilter([s.id]) }, '🔎 ' + tE('engine.deck.onlyThis')),
          isNewSrc(s.id) ? h('button', { class: 'btn small', onclick: () => { markSeen([s.id]); applySourceFilter(); route(); renderSourcesDeck(); } }, '✔ ' + tE('engine.new.markSeen')) : null,
          s.id !== SOURCES[0].id && S.seenSrc?.[s.id] ? h('button', { class: 'btn small ghost', onclick: () => { delete S.seenSrc[s.id]; save(); applySourceFilter(); route(); renderSourcesDeck(); } }, '↺ ' + tE('engine.deck.markNew')) : null)) : null);
    inner.append(card);
  });
  inner.append(h('div', { class: 'tiny', style: { marginTop: '10px' } }, tE('engine.deck.footer')));
  d.append(inner);
}
