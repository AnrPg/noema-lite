/* =====================================================================================
   noema-lite — 🔎 search everything (docs/SEARCH.md).
   The magnifier in the top bar (or / and Ctrl/⌘ K) opens a quick sheet; "Open in a page" goes to #/search?q=…, the
   page with every result and the filters. Results are records of engine/catalog.js, grouped by kind (Roadmaps,
   stations, chapters, theory, exercises … words, meanings, grammar … conversations), each with its kind, the field it
   was found in, a piece of text around the word, where it sits, and Knowledge or Languages.
   "Practise these results" makes one round of the exercises, cards and words found (subject by subject, course by
   course); a search can be kept as a collection that stays up to date by itself.
   ===================================================================================== */
window.NoemaSearch = (() => {
  'use strict';
  const C = () => window.NoemaCatalog, N = () => window.Noema, S = () => window.NoemaShell;

  /* ---------- words: in engine/i18n_shell.js as sr_* (every interface language), read through the shell's L() ---------- */
  // the words: i18n/shell (keys sh.sr_*, docs/i18n.md) through the frame's L(), or straight from the catalog without the frame
  const L = (k, v) => S() ? S().L('sr_' + k, v) : window.NoemaI18n ? NoemaI18n.t('sh.sr_' + k, v) : k;

  /* ---------- the learner's data ---------- */
  const acc = () => N()?.account?.id || N()?.kv?.acc || null;
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const world = () => window.NoemaThemes?.world?.() || 'know';
  const isLangSubj = s => s && (s.kind === 'language' || String(s.id).startsWith('lang:'));
  const toast = (m, ms) => N()?.toast?.(m, ms);

  /** Where every record comes from: the subjects' packs, the Roadmaps, the language courses, the conversations. Each has
      a signature: when it changes, that source is read again (engine/catalog.js Index). */
  async function sources() {
    const a = acc(), w = world(), out = [];
    if (!a) return out;
    if (w !== 'lang') {
      const subs = (await N().subjectsFor(a).catch(() => [])).filter(s => !isLangSubj(s) && !s.hidden);
      for (const s of subs) out.push({ key: 'pack:' + s.id, label: s.title || s.id, sig: [s.version || '', s.updated || '', JSON.stringify(s.counts || {}), s.title || '', s.description || ''].join('|'),
        build: async () => {
          const had = !!window.NOEMA_PACKS?.[s.id];
          const p = await N().loadSubject(a, s.id);
          const recs = C().fromPack(p, s);
          if (!had && window.NOEMA_PACKS && N().pack?.subject?.id !== s.id) delete window.NOEMA_PACKS[s.id];   // read once; the page keeps only the subject you study
          return recs;
        } });
      for (const c of window.NoemaCurriculum?.list(a) || []) out.push({ key: 'cur:' + c.id, label: c.title || c.goal || c.id, sig: String(c.updated || ''), build: async () => C().fromCurriculum(window.NoemaCurriculum.get(a, c.id) || c) });
    }
    if (w !== 'know' && N().langCourses) {
      for (const m of N().langCourses()) {
        const own = m.account ? localStorage.getItem(`noema1:${a}:a:langcourse:${m.courseId}`) || '' : '';
        out.push({ key: 'lang:' + m.courseId, label: m.title || m.courseId, sig: [m.version || '', m.path || '', window.NOEMA_REGISTRY?.builtAt || '', own ? C().hash36(own) : ''].join('|'), build: async () => C().fromLangCourse(await N().langData(m), m) });
      }
    }
    const cv = window.NoemaConvos ? await NoemaConvos.list(a).catch(() => []) : [];
    const live = cv.filter(r => !r.deleted && r.messages?.length && (!r.kind || r.kind === 'tutor'));
    out.push({ key: 'convos', label: L('t_convo'), sig: live.length + '|' + live.reduce((m, r) => String(r.updatedAt || '') > m ? String(r.updatedAt) : m, '') + '|' + live.map(r => r.title || '').join('').length, build: async () => C().fromConvos(live) });
    return out;
  }
  let IDX = null, IDXacc = null;
  function index() { if (!IDX || IDXacc !== acc()) { IDX = C().Index(acc(), sources); IDXacc = acc(); } return IDX; }
  /** Read what is stored, then bring it up to date in the background. */
  function warm() { const I = index(); I.load().then(() => I.refresh()); jset(`noema1:${acc()}:meta:searchUsed`, Date.now()); return I; }

  /* ---------- the page's settings live in its address: #/search?q=…&w=…&t=…&h=…&it=…&in=1&lg=…&st=…&c=…
     h + it: the place the search was opened from ("here"); in=1: only there; c: the collection shown ---------- */
  const KEYS = ['q', 'w', 't', 'h', 'it', 'in', 'lg', 'st', 'c'];
  function parse(hash = location.hash) {
    const qs = String(hash).split('?')[1] || '', u = new URLSearchParams(qs), P = {};
    for (const k of KEYS) { const v = u.get(k); if (v) P[k] = v; }
    return P;
  }
  function qstr(P) { const u = new URLSearchParams(); for (const k of KEYS) if (P[k]) u.set(k, P[k]); const s = u.toString(); return s ? '?' + s : ''; }
  const pageHash = P => '#/search' + qstr(P);
  const listOf = s => String(s || '').split(',').filter(Boolean);
  const hereOf = P => { const m = String(P.h || '').match(/^(subj|cur|course):(.+)$/); return m ? { kind: m[1], id: m[2], title: P.it || m[2] } : null; };
  const hereNow = () => hereOf(parse());
  const hereParam = hh => hh ? { h: `${hh.kind}:${hh.id}`, it: hh.title || '' } : {};

  /** The filters as one test per record (scope and status: they need the learner's state or a Roadmap's stations). */
  function keeper(P) {
    const a = acc(), states = {}, st = id => states[id] !== undefined ? states[id] : (states[id] = jget(`noema1:${a}:s:${id}:state`, null));
    const tests = [];
    const hh = hereOf(P);
    if (hh && P.in) {
      if (hh.kind === 'subj') tests.push(r => r.sj === hh.id);
      else if (hh.kind === 'course') tests.push(r => r.co === hh.id);
      else if (hh.kind === 'cur') {
        const c = window.NoemaCurriculum?.get(a, hh.id), packs = new Set(Object.values(c?.nodes || {}).map(n => n.pack?.id).filter(Boolean));
        tests.push(r => r.cu === hh.id || (r.sj && packs.has(r.sj)));
      }
    }
    if (P.st) {
      const want = P.st;
      tests.push(r => {
        if (!r.sj) return false;
        const s = st(r.sj) || {};
        if (want === 'unread') return (r.ty === 'section' || r.ty === 'theory') && !(s.read || {})[r.x?.sec];
        if (want === 'unsolved') return r.ty === 'exercise' && !((s.res || {})[r.x?.exid]?.ok > 0);
        if (want === 'wrong') return r.ty === 'exercise' && (s.res || {})[r.x?.exid]?.last === false;
        return true;
      });
    }
    return tests.length ? r => tests.every(t => t(r)) : null;
  }
  /** Search with the page's settings: { exact, groups, total } — groups before the kind filter (the kind chips count them),
      shown: the groups the kind filter keeps. */
  function run(P) {
    const I = index(), types = listOf(P.t);
    const res = C().search(I.records(), P.q || '', { w: P.w === 'know' || P.w === 'lang' ? P.w : '', langs: listOf(P.lg), keep: keeper(P) });
    res.shown = types.length ? res.groups.filter(([t]) => types.includes(t)) : res.groups;
    res.shownTotal = res.shown.reduce((a, [, l]) => a + l.length, 0);
    return res;
  }

  /* ---------- one result ---------- */
  const langName = code => { try { return window.NoemaI18n ? NoemaI18n.fmt.langName(code) : new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch (e) { return code; } };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function kindLabel(r, field) {
    if (r.ty === 'theory') return L('b_' + (r.x?.bt || 'paragraph'));
    const one = L('1_' + r.ty);
    if (r.ty === 'convo' || !field) return one;
    const [f, code] = String(field).split(':');
    if (f === r.ty) return one;   // "Word", not "Word · Word"
    const fl = L('f_' + f); if (fl.startsWith('sh.') || fl === 'sr_f_' + f) return one;
    return `${one} · ${fl}${code ? ' (' + langName(code) + ')' : ''}`;
  }
  /** Where a conversation began, in words: its style, the button and the exact part ("Explain · from “Explain differently” · exercise 14 of chapter 3, “…”"). */
  function convoWhere(r) {
    const x = r.x || {}, o = x.origin || {}, I = index(), sj = r.sj, bits = [];
    const mode = x.mode && window.NoemaI18n?.has('sh.mode' + cap(x.mode)) ? S().L('mode' + cap(x.mode)) : null; if (mode) bits.push(mode);
    const via = o.via ? L('via_' + o.via) : r.w === 'lang' ? L('via_lang') : null; if (via && !via.startsWith('sh.') && !via.startsWith('sr_')) bits.push(via);
    const chN = id => I.byKey(`s:${sj}:ch:${id}`)?.x?.n || '?';
    const short = t => { t = String(t || ''); return t.length > 60 ? t.slice(0, 58) + '…' : t; };
    let where = null;
    if (o.ex || x.ctx === 'exercise' && x.ctxId && !String(x.ctxId).startsWith('fc:')) { const e = I.byKey(`s:${sj}:ex:${o.ex || x.ctxId}`); if (e) where = L('whereEx', { n: e.x?.n || '?', c: chN(e.x?.ch) }) + ' ' + L('quoted', { t: short(e.ti) }); }
    else if (o.card || String(x.ctxId || '').startsWith('fc:')) { const key = o.card || String(x.ctxId).slice(3), cd = I.byKey(`s:${sj}:fc:${key}`); if (cd) where = L('whereCard', { c: chN(cd.x?.ch) }) + ' ' + L('quoted', { t: short(cd.ti) }); }
    else if (o.bid && (o.sec || x.sec)) { const b = I.byKey(`s:${sj}:b:${o.sec || x.sec}:${o.bid}`); if (b) where = L('whereBlock', { kind: L('b_' + (b.x?.bt || 'paragraph')), sec: b.pa[b.pa.length - 1] || '' }); }
    else if (o.drill || x.ctx === 'playbook') { const d = I.byKey(`s:${sj}:dr:${o.drill || x.ctxId}`); if (d) where = L('whereDrill', { t: short(d.ti) }); }
    if (!where && (o.sec || x.sec || x.ctx === 'section')) { const s = I.byKey(`s:${sj}:s:${o.sec || x.sec || x.ctxId}`); if (s) where = L('whereSec', { sec: short(s.ti) }); }
    if (!where && (o.ch || x.ch || x.ctx === 'chapter')) { const id = o.ch || x.ch || x.ctxId, c = I.byKey(`s:${sj}:ch:${id}`); if (c) where = L('whereCh', { c: c.x?.n || '?' }) + ' ' + L('quoted', { t: short(c.ti) }); }
    if (!where && x.label) where = short(x.label);
    if (where) bits.push(where);
    return bits.join(' · ');
  }
  function resultEl(res, q, { h, pill }, { onOpen } = {}) {
    const r = res.r, sn = C().snip(res, q);
    const mark = h('span', { class: 'ns-srsn' }, sn.pre, sn.hit ? h('mark', {}, sn.hit) : null, sn.post);
    const tag = r.w === 'lang' ? pill(S().L('languages'), 3, 'ns-srw') : pill(S().L('knowledge'), 1, 'ns-srw');
    const langs = r.w === 'lang' && r.lg?.length && r.lg.length <= 2 ? r.lg.map(langName).join(', ') : '';
    const where = r.ty === 'convo' ? convoWhere(r) : '';
    const path = [...(r.pa || [])].filter(Boolean).join(' › ');
    return h('button', { class: 'ns-sr', 'data-k': r.k, 'data-ty': r.ty, onclick: () => { onOpen?.(); openRec(r, q); } },
      h('span', { class: 'ns-srtop' }, h('span', { class: 'ns-srk' }, kindLabel(r, sn.field)), tag),
      h('b', { class: 'ns-srt' }, r.ti),
      (sn.hit || sn.post) && !(res.fi === 0 && C().fold(r.f[0]?.[1] || '').trim() === C().fold(r.ti || '').trim()) ? mark : null,   // found in the title: the title says it
      where ? h('span', { class: 'ns-srvia' }, where) : null,
      path || langs ? h('span', { class: 'ns-srpath' }, [path, langs].filter(Boolean).join(' · ')) : null);
  }
  /** Open a found record: its exact place (another subject loads first; a conversation opens in its window). */
  function openRec(r, q) {
    remember(parse().q ? parse() : { q });
    if (String(r.h).startsWith('convo:')) { S().convos(r.h.slice(6)); return; }
    if (r.sj && r.h.startsWith('#/') && !r.h.startsWith('#/search')) { S().open(r.sj, r.h); return; }
    S().go(r.h);
  }

  /* ---------- the groups of results ---------- */
  const OPEN = { q: null, set: new Set() };   // the groups opened on the page, kept while the results redraw for the same words
  function groupsEl(res, q, ctx, { per = 5, compact = false, fold = false, onOpen } = {}) {
    if (OPEN.q !== q) { OPEN.q = q; OPEN.set = new Set(); }
    const { h, pill } = ctx, box = h('div', { class: 'ns-srgroups' + (compact ? ' compact' : '') });
    const top = new Set(res.exact.slice(0, compact ? 2 : 4).map(x => x.r.k));   // shown on top: not again in their group
    if (res.exact.length) {
      box.append(h('section', { class: 'ns-srgrp ns-srexact' }, h('div', { class: 'ns-srh' }, h('span', { class: 'ns-label' }, L('exact'))), ...res.exact.slice(0, compact ? 2 : 4).map(x => resultEl(x, q, ctx, { onOpen }))));
    }
    for (const [ty, all] of res.shown || res.groups) {
      const list = all.filter(x => !top.has(x.r.k)); if (!list.length) continue;
      const sec = h('section', { class: 'ns-srgrp', 'data-ty': ty });
      const body = h('div', { class: 'ns-srlist' });
      let n = Math.min(per, list.length);
      const moreBtn = h('button', { class: 'linkish ns-srmore' });
      const head = [h('span', { class: 'ns-label' }, L('t_' + ty)), pill(String(all.length), ty === 'convo' ? 4 : TYPE_TONE(ty))];
      const drawN = () => { body.replaceChildren(...list.slice(0, n).map(x => resultEl(x, q, ctx, { onOpen }))); moreBtn.hidden = n >= list.length; moreBtn.textContent = L('more', { n: list.length - n }); };
      moreBtn.onclick = () => { n = Math.min(list.length, n + (compact ? 10 : 20)); drawN(); };
      drawN();
      if (fold) {   // the page: every group folded; open, it shows its first few and "+N more"
        const isOpen = () => OPEN.set.has(ty);
        const hb = h('button', { class: 'ns-srh ns-srfold', 'aria-expanded': String(isOpen()), onclick: () => { isOpen() ? OPEN.set.delete(ty) : OPEN.set.add(ty); paint(); } }, ...head, h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›'));
        const paint = () => { const o = isOpen(); hb.setAttribute('aria-expanded', String(o)); sec.classList.toggle('open', o); body.hidden = !o; if (!o) moreBtn.hidden = true; else drawN(); };
        sec.append(hb, body, moreBtn); paint();
      } else sec.append(h('div', { class: 'ns-srh' }, ...head), body, moreBtn);
      box.append(sec);
    }
    return box;
  }
  const TYPE_TONE = ty => C().TYPES.lang.includes(ty) ? 3 : 2;

  /* ---------- indexing progress: one quiet line while sources are read ---------- */
  function progressEl(ctx, onChange) {
    const { h } = ctx, I = index(), line = h('div', { class: 'ns-srprog', role: 'status', 'aria-live': 'polite' });
    const paint = st => {
      line.hidden = !st.busy;
      if (st.busy) line.replaceChildren(h('b', {}, L('indexing', { done: Math.min(st.done + 1, st.total), total: st.total })), h('span', { class: 'tiny ns-muted' }, L('indexingWhat')), h('i', { class: 'ns-srprogbar', style: { width: Math.round((st.done / Math.max(1, st.total)) * 100) + '%' } }));
    };
    let last = -1;
    const off = I.on(st => { if (!line.isConnected) { off(); return; } paint(st); if (st.done !== last) { last = st.done; onChange?.(); } });
    paint(I.state);
    return line;
  }

  /* ---------- 🔎 the quick sheet (top bar, / or Ctrl K) ---------- */
  function quick(hh) {
    const X = S(); if (!X) return;
    const ctx = { h: X.h, pill: X.pill, L: X.L };
    const I = warm();
    X.sheet(L('search'), (body, close) => {
      const h = X.h;
      const inp = h('input', { class: 'noema-input ns-srin', type: 'search', placeholder: L('placeholder'), 'aria-label': L('search'), enterkeyhint: 'search', autocomplete: 'off' });
      const out = h('div', { class: 'ns-srquick' });
      const P0 = { ...hereParam(hh) };
      const pageBtn = h('button', { class: 'btn small ns-srpage', onclick: () => { close(); X.go(pageHash({ q: inp.value.trim(), ...P0, ...(scope === 'here' ? { in: '1' } : {}) })); } }, L('openPage'), ' →');
      const hereSeg = hh ? h('div', { class: 'ns-seg small ns-srscope', role: 'radiogroup', 'aria-label': L('scope') },
        ...[['all', L('everywhere')], ['here', L('hereIs', { title: hh.title })]].map(([k, l]) => h('button', { class: k === 'all' ? 'on' : '', role: 'radio', 'aria-checked': String(k === 'all'), 'data-v': k, onclick: e => { [...e.currentTarget.parentElement.children].forEach(b => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-checked', String(b === e.currentTarget)); }); scope = k; draw(); } }, l))) : null;
      let scope = 'all', t = 0;
      const draw = () => {
        const q = inp.value.trim(), P = { q, ...P0, ...(scope === 'here' ? { in: '1' } : {}) };
        if (q.length < 2) { out.replaceChildren(h('p', { class: 'tiny ns-muted' }, L('typeMore'))); return; }
        const res = run(P);
        if (!res.total) { out.replaceChildren(h('p', { class: 'ns-muted' }, L('none', { q })), I.state.busy ? null : h('p', { class: 'tiny ns-muted' }, L('noneTip'))); return; }
        out.replaceChildren(h('p', { class: 'tiny ns-muted' }, L('results', { n: res.total })), groupsEl(res, q, ctx, { per: 3, compact: true, onOpen: close }));
      };
      inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 120); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pageBtn.click(); } });
      body.append(h('div', { class: 'ns-srbar' }, inp), hereSeg, progressEl(ctx, () => { if (inp.value.trim().length >= 2) draw(); }), out, h('div', { class: 'row ns-srfoot' }, pageBtn, collections().length ? h('button', { class: 'btn small ghost ns-srgosaved', onclick: () => { close(); X.go('#/search'); } }, L('collectionsN', { n: collections().length })) : null));
      draw();
      setTimeout(() => inp.focus(), 60);
    }, { cls: 'ns-srsheet' });
    I.load().then(() => { /* the stored index is in: the sheet draws as the learner types */ });
  }

  /* ---------- #/search: the page ---------- */
  let drawnFor = null;
  function page(ctx) {
    const { h, pill, page: pg, go, menuButton } = ctx;
    let P = parse();
    const I = warm();
    const coll = P.c ? collections().find(x => x.id === P.c) : null;
    const savedItem = () => { const n = collections().length; return { label: L('collections') + (n ? ` (${n})` : ''), sub: L('collectionsSub'), icon: 'star', run: () => go('#/search') }; };
    const v = pg({ tab: null, crumbs: [[L('search')], ...(coll ? [[coll.name]] : [])], back: null, cls: 'ns-searchview', menu: () => [savedItem(), ...(coll ? ['-', ...collMenu(coll, ctx)().filter(x => x.label !== L('open'))] : [])] });
    const inp = h('input', { class: 'noema-input ns-srin', type: 'search', value: P.q || '', placeholder: L('placeholder'), 'aria-label': L('search'), enterkeyhint: 'search', autocomplete: 'off' });
    const roundBox = h('div', { class: 'ns-srroundbox' });
    const actions = h('div', { class: 'row ns-sracts' });
    const typeChips = h('div', { class: 'ns-srkinds', role: 'group', 'aria-label': L('kinds') });
    const filtBtn = h('button', { class: 'btn small ghost ns-srfilt', 'aria-expanded': 'false', onclick: () => { filt.hidden = !filt.hidden; filtBtn.setAttribute('aria-expanded', String(!filt.hidden)); } });
    const filt = h('div', { class: 'ns-panel ns-srfilters', hidden: true });
    const out = h('div', { class: 'ns-srout' });
    v.append(h('div', { class: 'ns-srbar' }, inp), roundBox, progressEl(ctx, () => draw()), h('div', { class: 'row ns-srrow' }, filtBtn, actions), filt, out);
    const setP = (patch, { replace = true } = {}) => {
      P = { ...P, ...patch }; for (const k of Object.keys(P)) if (!P[k]) delete P[k];
      if (P.c && !sameQuery(collections().find(x => x.id === P.c)?.p, P)) delete P.c;
      const hs = pageHash(P);
      if (replace) history.replaceState(null, '', location.pathname + location.search + hs); else location.hash = hs;
      draw();
    };
    let t = 0;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => setP({ q: inp.value.trim() }), 140); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(t); setP({ q: inp.value.trim() }); remember(P); } });

    function seg(label, cur, opts, pick) {
      return h('div', { class: 'ns-srfrow' }, h('span', { class: 'ns-label' }, label), h('div', { class: 'ns-seg small', role: 'radiogroup', 'aria-label': label },
        ...opts.map(([k, l]) => h('button', { class: (cur || '') === k ? 'on' : '', role: 'radio', 'aria-checked': String((cur || '') === k), 'data-v': k, onclick: () => pick(k) }, l))));
    }
    function drawFilters(res) {
      const w = world(), langs = [...new Set(index().records().filter(r => r.w === 'lang').flatMap(r => r.lg || []))];
      const rows = [];
      if (w === 'both') rows.push(seg(L('world'), P.w, [['', L('all')], ['know', S().L('knowledge')], ['lang', S().L('languages')]], k => setP({ w: k, lg: k === 'know' ? '' : P.lg, st: k === 'lang' ? '' : P.st })));
      const hereNowP = hereOf(P);
      if (hereNowP) rows.push(seg(L('scope'), P.in ? 'here' : '', [['', L('everywhere')], ['here', L('hereIs', { title: hereNowP.title })]], k => setP({ in: k ? '1' : '' })));
      if (P.w !== 'know' && w !== 'know' && langs.length > 1) rows.push(seg(L('lang'), P.lg || '', [['', L('all')], ...langs.map(c => [c, langName(c)])], k => setP({ lg: k })));
      if (P.w !== 'lang' && w !== 'lang') rows.push(seg(L('status'), P.st || '', [['', L('all')], ['unread', L('stUnread')], ['unsolved', L('stUnsolved')], ['wrong', L('stWrong')]], k => setP({ st: k })));
      const n = ['w', 'in', 'lg', 'st', 't'].filter(k => P[k]).length;
      if (n) rows.push(h('button', { class: 'linkish', onclick: () => setP({ w: '', in: '', lg: '', st: '', t: '' }) }, L('clear')));
      filt.replaceChildren(...(res.total ? [h('div', { class: 'ns-srfrow' }, h('span', { class: 'ns-label' }, L('kinds')), typeChips)] : []), ...rows);
      filtBtn.textContent = (n ? L('filtersN', { n }) : L('filters')) + ' ▾';
      filtBtn.hidden = !rows.length && !res.total;
    }
    function drawChips(res) {
      const types = listOf(P.t);
      const chip = (k, label, n, on) => h('button', { class: 'ns-srchip' + (on ? ' on' : ''), 'aria-pressed': String(!!on), 'data-ty': k || 'all', onclick: () => {
        if (!k) return setP({ t: '' });
        const s = new Set(types); s.has(k) ? s.delete(k) : s.add(k); setP({ t: [...s].join(',') });
      } }, label, h('span', { class: 'n' }, String(n)));
      const T3 = C().TYPES, part = (label, tys) => { const g = res.groups.filter(([ty]) => tys.includes(ty)); return g.length ? h('div', { class: 'ns-srkgrp' }, label ? h('small', { class: 'ns-muted' }, label) : null, h('div', { class: 'ns-srchips' }, ...g.map(([ty, l]) => chip(ty, L('t_' + ty), l.length, types.includes(ty))))) : null; };
      const two = res.groups.some(([ty]) => T3.know.includes(ty)) && res.groups.some(([ty]) => T3.lang.includes(ty));
      typeChips.replaceChildren(...(res.total ? [h('div', { class: 'ns-srchips' }, chip('', L('all'), res.total, !types.length)),
        part(two ? S().L('knowledge') : '', T3.know), part(two ? S().L('languages') : '', T3.lang), part('', T3.both)].filter(Boolean) : []));
    }
    function drawActions(res) {
      const sv = collections().find(x => sameQuery(x.p, P));
      const kinds = listOf(P.t), canPractise = kinds.length && kinds.every(t => PRACTISABLE.includes(t));   // only when the filter keeps things that can be practised
      actions.replaceChildren(...(res.shownTotal ? [
        canPractise ? h('button', { class: 'btn small primary ns-srpractise', onclick: () => practise(res, P) }, L('practise')) : null,
        sv ? h('span', { class: 'ns-pill ns-srsaved' }, L('collection'), ': ', sv.name) : h('button', { class: 'btn small ghost ns-srsave', onclick: () => saveCollection(P, ctx) }, L('save'))].filter(Boolean) : []));
    }
    function drawEmpty() {
      const cols = collections(), rec = recents();
      const it = (title, sub, run, menu) => h('div', { class: 'ns-itemwrap' }, h('button', { class: 'ns-item', onclick: run }, h('span', { class: 't' }, h('b', {}, title), sub ? h('small', {}, sub) : null), h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›')), menu || null);
      out.replaceChildren(
        cols.length ? h('section', { class: 'ns-srcols' }, h('span', { class: 'ns-label' }, L('collections')), h('p', { class: 'tiny ns-muted' }, L('collectionsSub')),
          h('div', { class: 'ns-list' }, ...cols.map(c => { const n = run(c.p).shownTotal; return it(c.name, [describe(c.p), L('nItems', { n })].filter(Boolean).join(' · '), () => go(pageHash({ ...c.p, c: c.id })), menuButton(collMenu(c, ctx), { label: S().L('moreFor', { title: c.name }) })); }))) : null,
        rec.length ? h('section', { class: 'ns-srrecent' }, h('span', { class: 'ns-label' }, L('recent')), h('div', { class: 'ns-list' }, ...rec.map(p => it(p.q, describe(p), () => go(pageHash(p)))))) : null,
        !cols.length && !rec.length ? h('p', { class: 'ns-muted' }, L('typeMore')) : null);
    }
    function draw() {
      drawRound(roundBox, ctx);
      const q = P.q || '';
      if (q.length < 2) { typeChips.replaceChildren(); actions.replaceChildren(); drawFilters({ total: 0 }); drawEmpty(); return; }
      const res = run(P);
      drawFilters(res); drawChips(res); drawActions(res);
      if (!res.total) { out.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, ctx.faceEl(undefined, 'breathe'), h('p', {}, L('none', { q })), h('p', { class: 'tiny ns-muted' }, L('noneTip')))); return; }
      out.replaceChildren(h('p', { class: 'tiny ns-muted ns-srcount' }, L('results', { n: res.shownTotal })), groupsEl(res, q, ctx, { per: 3, fold: true }));
    }
    drawnFor = v;
    I.load().then(() => { if (v.isConnected) draw(); });
    draw();
    if (!P.q) setTimeout(() => inp.focus(), 60);
  }
  const describe = p => [p.w ? S().L(p.w === 'lang' ? 'languages' : 'knowledge') : '', listOf(p.t).map(t => L('t_' + t)).join(', '), p.in && p.it ? L('hereIs', { title: p.it }) : '', listOf(p.lg).map(langName).join(', '), p.st ? L({ unread: 'stUnread', unsolved: 'stUnsolved', wrong: 'stWrong' }[p.st]) : ''].filter(Boolean).join(' · ');
  const sameQuery = (a, b) => !!a && !!b && ['q', 'w', 't', 'h', 'in', 'lg', 'st'].every(k => String(a[k] || '') === String(b[k] || ''));

  /* ---------- recent searches (this device) and collections (saved searches, synced with the account) ---------- */
  const recentKey = () => `noema1:${acc()}:meta:searchRecent`;
  const recents = () => (jget(recentKey(), []) || []).filter(p => p && p.q);
  function remember(P) { if (!P?.q || P.q.length < 2) return; const p = {}; for (const k of KEYS) if (P[k] && k !== 'c') p[k] = P[k]; jset(recentKey(), [p, ...recents().filter(x => !sameQuery(x, p))].slice(0, 8)); }
  const colKey = () => N()?.kv?.accountKey ? N().kv.accountKey('searches') : `noema1:${acc()}:a:searches`;
  const collections = () => (jget(colKey(), []) || []).filter(c => c && c.id && c.p?.q);
  function putCollections(list) { const v = JSON.stringify(list); if (N()?.kv?.set) N().kv.set(colKey(), v); else localStorage.setItem(colKey(), v); }
  function saveCollection(P, ctx) {
    const name = (prompt(L('nameIt'), P.q) || '').trim().slice(0, 80); if (!name) return;
    const p = {}; for (const k of KEYS) if (P[k] && k !== 'c') p[k] = P[k];
    const c = { id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, p, at: new Date().toISOString() };
    putCollections([...collections(), c]); toast(L('saved', { name }), 3000);
    history.replaceState(null, '', location.pathname + location.search + pageHash({ ...p, c: c.id })); ctx && S().route();
  }
  function collMenu(c, ctx) {
    return () => [{ label: L('open'), icon: 'search', run: () => S().go(pageHash({ ...c.p, c: c.id })) },
      { label: L('practise'), icon: 'play', run: () => { warm().load().then(() => practise(run(c.p), c.p)); } },
      { label: L('rename'), icon: 'edit', run: () => { const n = (prompt(L('nameIt'), c.name) || '').trim().slice(0, 80); if (!n) return; putCollections(collections().map(x => x.id === c.id ? { ...x, name: n } : x)); S().route(); } },
      { label: L('copyLink'), icon: 'share', run: async () => { const u = location.origin + location.pathname + pageHash({ ...c.p, c: c.id }); try { await navigator.clipboard.writeText(u); toast(L('linkCopied'), 2500); } catch (e) { prompt(L('copyLink'), u); } } },
      '-', { label: L('del'), icon: 'trash', danger: true, run: () => { if (!confirm(L('delSure', { name: c.name }))) return; putCollections(collections().filter(x => x.id !== c.id)); if (parse().c === c.id) S().go(pageHash({ ...c.p })); else S().route(); } }];
  }

  /* ---------- "Practise these results": one round, place by place ---------- */
  const ROUND = 'noema-device:searchRound';
  const PRACTISABLE = ['exercise', 'card', 'word', 'meaning', 'field', 'lesson'];
  const round = () => { try { return JSON.parse(sessionStorage.getItem(ROUND) || 'null'); } catch (e) { return null; } };
  const putRound = R => { try { R ? sessionStorage.setItem(ROUND, JSON.stringify(R)) : sessionStorage.removeItem(ROUND); } catch (e) { } };
  /** The steps of a round from the results shown: per subject its exercises, then its flashcards; per language course the
      vocabulary fields of the words and meanings found (their recall drill), and the lessons found. */
  function stepsOf(res) {
    const I = index(), steps = [], bySj = new Map(), langs = new Map();
    const subjT = sj => I.byKey('s:' + sj)?.ti || sj;
    for (const [ty, list] of res.shown || res.groups) for (const { r } of list) {
      if (r.ty === 'exercise' || r.ty === 'card') {
        if (!bySj.has(r.sj)) bySj.set(r.sj, { ex: [], cards: [] });
        const g = bySj.get(r.sj);
        if (r.ty === 'exercise') g.ex.push(r.x.exid); else g.cards.push(r.x.card);
      } else if (r.w === 'lang' && (r.ty === 'word' || r.ty === 'meaning' || r.ty === 'field' || r.ty === 'lesson')) {
        const fields = r.ty === 'meaning' || r.ty === 'field' ? [r.x?.field] : r.ty === 'word' ? (r.x?.senses || []).map(s => I.byKey(`l:${r.co}:c:${s}`)?.x?.field) : [];
        for (const f of fields.filter(Boolean)) { const k = r.co + '|f|' + f; if (!langs.has(k)) langs.set(k, { kind: 'lang', co: r.co, title: L('pWords', { title: I.byKey(`l:${r.co}:f:${f}`)?.ti || f }), href: `#/lang/${encodeURIComponent(r.co)}/recall/${encodeURIComponent(f)}` }); }
        if (r.ty === 'lesson') { const k = r.co + '|l|' + r.x?.node; if (!langs.has(k)) langs.set(k, { kind: 'lang', co: r.co, title: r.ti, href: r.h }); }
      }
    }
    for (const [sj, g] of bySj) {
      if (g.ex.length) steps.push({ kind: 'ex', sj, title: `${subjT(sj)} · ${L('pEx', { n: Math.min(g.ex.length, 60) })}`, ids: g.ex.slice(0, 60) });
      if (g.cards.length) steps.push({ kind: 'cards', sj, title: `${subjT(sj)} · ${L('pCards', { n: Math.min(g.cards.length, 60) })}`, keys: g.cards.slice(0, 60) });
    }
    steps.push(...[...langs.values()].slice(0, 8));
    return steps;
  }
  function practise(res, P) {
    const steps = stepsOf(res);
    if (!steps.length) { toast(L('practiseNone'), 4500); return; }
    putRound({ q: P.q, back: pageHash(P), steps, i: 0, at: Date.now() });
    remember(P);
    goStep(0);
  }
  function goStep(i) {
    const R = round(); if (!R) return;
    if (i >= R.steps.length) { putRound(null); toast(L('roundDone'), 3500); S().go(R.back); return; }
    R.i = i; putRound(R);
    const st = R.steps[i];
    if (st.kind === 'lang') { S().go(st.href); return; }
    if (S().engine && N().subject?.id === st.sj) S().go('#/srun'); else S().open(st.sj, '#/srun');
  }
  /** For the engine's round (engine/src/40_views.js searchRunView): the button after this step. */
  function after() {
    const R = round(); if (!R) return null;
    const nx = R.steps[R.i + 1];
    return nx ? { label: L('next', { title: nx.title }), run: () => goStep(R.i + 1) } : { label: L('roundEnd'), run: () => goStep(R.steps.length) };
  }
  /** On the search page while a round goes on: where it is, the next step, the end. */
  function drawRound(box, { h }) {
    const R = round(); if (!R || !R.steps?.length) { box.replaceChildren(); return; }
    const st = R.steps[R.i], nx = R.steps[R.i + 1];
    box.replaceChildren(h('div', { class: 'ns-panel ns-srround' }, h('span', { class: 'grow' }, L('roundOf', { i: R.i + 1, n: R.steps.length, title: st?.title || '' })),
      h('button', { class: 'btn small primary', onclick: () => goStep(nx ? R.i + 1 : R.i) }, nx ? L('next', { title: nx.title }) : st?.title || L('open')),
      h('button', { class: 'btn small ghost', onclick: () => { putRound(null); drawRound(box, { h }); } }, L('roundEnd'))));
  }

  /* ---------- warm the index a little after start, when the learner has searched on this device before ---------- */
  addEventListener('load', () => setTimeout(() => { try { if (acc() && jget(`noema1:${acc()}:meta:searchUsed`, 0) && S()?.mounted) { const I = index(); I.load().then(() => I.refresh()); } } catch (e) { } }, 8000));

  return { quick, page, run, parse, pageHash, hereNow, collections, round, after, goStep, index, sources, openRec, words: T };
})();
