/* =====================================================================================
   noema-lite — 文A language help for students who study in a language that is not their own (docs/BRIDGE.md).
   A *bridge* is a sidecar of one subject pack for one native language: the pack's content words (never articles,
   prepositions, conjunctions…) with the meaning they have in THIS subject, translated into the learner's language,
   plus per section its key terms and a short preview in that language. The pack itself never changes.
     · where bridges come from: the library (tools/build.py → library/subjects/<id>/bridge.<native>.js, listed in the
       registry as bridgeLocales) or the learner's account (a file imported with 📥, or saved by Claude through the
       connector: noema-private/<uid>/bridges/<pack>.<native>.json + the synced index a:bridges) — attached any time
       after the pack was made or published
     · direction: from the content's language (subject.language) to the learner's native language (a:settings.native,
       shared with the language courses, D19), else the UI language
     · three levels: open (glosses under most harder words) · balanced (key terms and rare words) · tap (nothing
       shown; every word opens its card). Help fades: a word glossed in many sections without a look-up loses its
       gloss; “I know it” removes it for good (a:bridgeWords:<source>, per source language, synced)
     · each section: a “Before you read” fold (preview + key terms), the words of the theory linked by the central
       word-linking core (engine/wordlink.js); never in exercises, code or maths
   API: NoemaBridge.section({ sid, body, head }) · tag(subject) · attach(acc, bridge) · available(acc, packId) ·
        load(acc, packId, native) · settings(acc) · menuItem() · panel(acc)
   ===================================================================================== */
window.NoemaBridge = (() => {
  'use strict';
  const I = () => window.NoemaI18n;
  const T = (k, p) => I() ? I().t(k, p) : k;
  const WL = () => window.NoemaWordlink;
  const N = () => window.Noema || {};
  /* i18n-ignore-start */   // storage keys, CSS classes, codes
  const P = 'noema1:';
  const FADE = 8;           // sections in which a word was glossed without being looked up → its gloss fades
  const DEF = { on: true, level: 'balanced' };
  const LEVELS = ['open', 'balanced', 'tap'];
  const CEFR = { a2: 'open', b1: 'balanced', b2: 'tap' };
  const POS = ['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV', 'NUM', 'X', 'SYM', 'INTJ', 'PHRASE'];
  /* i18n-ignore-end */
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { const s = JSON.stringify(v); if (N().kv) N().kv.set(k, s); else try { localStorage.setItem(k, s); } catch (e) { } };
  const accNow = acc => acc || N().account?.id || N().kv?.acc || jget(P + 'current', {})?.acc || null;
  const aKey = (acc, name) => `${P}${acc}:a:${name}`;
  const base = c => String(c || '').split('-')[0].toLowerCase();
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const endonym = code => { try { const n = new Intl.DisplayNames([code], { type: 'language' }).of(code); return n ? n.charAt(0).toLocaleUpperCase(code) + n.slice(1) : code; } catch (e) { return code; } };
  const langName = code => I()?.fmt?.langName ? I().fmt.langName(code) : endonym(code);
  const pct = r => I()?.fmt?.percent ? I().fmt.percent(r) : Math.round(r * 100) + '%';
  const hash36 = s => window.NoemaCatalog ? NoemaCatalog.hash36(s) : String(s.length);

  /* ---------- settings: a:settings.bridge { on, level, cefr, asked } and the native language a:settings.native ---------- */
  const accSettings = acc => jget(aKey(acc, 'settings'), {}) || {};
  function settings(acc) { acc = accNow(acc); return { ...DEF, ...(accSettings(acc).bridge || {}) }; }
  function setSettings(acc, patch) {
    acc = accNow(acc); const bridge = { ...settings(acc), ...patch };
    if (window.NoemaThemes?.putSettings) NoemaThemes.putSettings({ bridge }, acc);
    else { const s = accSettings(acc); s.bridge = bridge; put(aKey(acc, 'settings'), s); }
    return bridge;
  }
  /** The learner's native language as a base code ('ru'), else the UI language's. */
  function native(acc) {
    const n = accSettings(accNow(acc)).native;
    if (n?.code) return base(n.code);
    return null;
  }
  const nativeOrUi = acc => native(acc) || base(I()?.locale || accSettings(accNow(acc)).lang || 'en');
  function setNative(acc, code) {
    acc = accNow(acc); if (!code) return;
    if (window.NoemaThemes?.putSettings) NoemaThemes.putSettings({ native: { code } }, acc);
    else { const s = accSettings(acc); s.native = { code }; put(aKey(acc, 'settings'), s); }
  }

  /* ---------- the learner's words (per source language): { k: { known, seen, look, at } } ---------- */
  const words = (acc, src) => jget(aKey(accNow(acc), 'bridgeWords:' + base(src)), {}) || {};
  function touchWord(acc, src, k, patch) {
    acc = accNow(acc); const key = aKey(acc, 'bridgeWords:' + base(src)), all = jget(key, {}) || {};
    const w = { ...(all[k] || {}) };
    for (const [f, v] of Object.entries(patch)) { if (v === undefined) delete w[f]; else if (typeof v === 'function') w[f] = v(w[f]); else w[f] = v; }
    w.at = Date.now(); all[k] = w; put(key, all); return w;
  }

  /* ---------- where the bridges are ---------- */
  const mem = new Map();   // `${acc}|${pack}|${native}` → bridge
  const DB = {
    db: null,
    open() {
      if (this.db) return this.db;
      return this.db = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no IndexedDB'));   // i18n-ignore (a log)
        const r = indexedDB.open('noema-bridges', 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('b')) r.result.createObjectStore('b'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async get(k) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('b').objectStore('b').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async put(k, v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('b', 'readwrite'); t.objectStore('b').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
    async del(k) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('b', 'readwrite'); t.objectStore('b').delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  };
  /** The account's own bridges (synced index): { packId: { native: { v, status, coverage, chapters, of, previews, entries, at } } } */
  const index = acc => jget(aKey(accNow(acc), 'bridges'), {}) || {};
  const regEntry = id => (window.NOEMA_REGISTRY?.subjects || []).find(s => s.id === id) || null;
  const summary = b => ({ v: hash36(JSON.stringify(b.entries || []) + JSON.stringify(b.sections || {}) + JSON.stringify(b.anchors || [])), status: b.status, coverage: typeof b.coverage === 'number' ? b.coverage : null, everyday: typeof b.everyday === 'number' ? b.everyday : null,
    chapters: (b.chapters || []).length || null, of: b.of || null, previews: Object.values(b.sections || {}).filter(s => s?.preview).length, entries: (b.entries || []).length, at: Date.now() });
  /** Every native language with a bridge for this pack → { code: { status, coverage, chapters, of, previews, own } } (the account's own wins). */
  function available(acc, packId, subj) {
    const out = {}, reg = subj?.bridgeLocales || regEntry(packId)?.bridgeLocales || {};
    for (const [c, m] of Object.entries(reg)) out[base(c)] = { ...m, own: false };
    for (const [c, m] of Object.entries(index(acc)[packId] || {})) out[base(c)] = { ...m, own: true };
    return out;
  }
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.append(s); });
  /** The bridge of one pack for one native language, or null. */
  async function load(acc, packId, nat) {
    acc = accNow(acc); nat = base(nat); const key = `${acc}|${packId}|${nat}`;
    if (mem.has(key)) return mem.get(key);
    const ix = index(acc)[packId]?.[nat];
    let b = null;
    if (ix) {
      b = await DB.get(key).catch(() => null);
      if ((!b || summary(b).v !== ix.v) && window.NoemaCloud?.session?.()) {
        const r = await NoemaCloud.downloadObject(`bridges/${packId}.${nat}.json`).catch(() => null);
        const fresh = r ? await r.json().catch(() => null) : null;
        if (fresh?.format === 'noema-bridge') { b = fresh; DB.put(key, b).catch(() => { }); }
      }
    }
    if (!b) {
      const reg = regEntry(packId)?.bridgeLocales?.[nat];
      if (reg?.path) {
        const id = `${packId}|${nat}`;
        if (!window.NOEMA_BRIDGES?.[id]) await loadScript((window.NOEMA_LIBRARY_BASE || '') + reg.path).catch(e => console.warn('[bridge]', e));   // i18n-ignore (a log)
        b = window.NOEMA_BRIDGES?.[id] || null;
      }
    }
    if (b) b = prepare(b);
    mem.set(key, b); return b;
  }
  /** Lookup tables the page needs, built once per bridge. */
  function prepare(b) {
    if (b._idx) return b;
    const byK = new Map((b.entries || []).map(e => [e.k, e]));
    Object.defineProperties(b, {
      _byK: { value: byK }, _idx: { value: WL() ? WL().index(b.entries || []) : null },
      _anchors: { value: (b.anchors || []).reduce((m, a) => { const sid = String(a.at).split('/')[0]; (m[sid] = m[sid] || []).push(a); return m; }, {}) },
    });
    return b;
  }
  /** Attach a bridge to the account (a file imported with 📥 or a test): checked, kept on this device and in the cloud,
      listed in the synced index so every device finds it. → { pack, native, title } */
  async function attach(acc, b) {
    acc = accNow(acc);
    const C = window.NoemaPackCheck?.checkBridge;
    const subs = N().subjectsFor ? await N().subjectsFor(acc) : [];
    const meta = subs.find(s => s.id === b?.pack);
    let pack = null; try { pack = meta && N().loadSubject ? await N().loadSubject(acc, b.pack) : null; } catch (e) { }
    const r = C ? C(b, pack) : { errors: [] };
    if (r.errors.length) throw Object.assign(new Error(T('bridge.attach.invalid', { detail: r.errors.slice(0, 3).join(' · ') })), { code: 'bridge.invalid' });
    if (!meta) throw Object.assign(new Error(T('bridge.attach.noPack', { id: b.pack })), { code: 'bridge.no_pack' });
    const nat = base(b.native), key = `${acc}|${b.pack}|${nat}`;
    await DB.put(key, b).catch(() => { });
    if (window.NoemaCloud?.session?.() && acc === 'u_' + NoemaCloud.session().user.id) await NoemaCloud.uploadObject(`bridges/${b.pack}.${nat}.json`, new Blob([JSON.stringify(b)], { type: 'application/json' }), 'application/json').catch(e => console.warn('[bridge] upload', e));   // i18n-ignore (a log)
    const all = index(acc); all[b.pack] = { ...(all[b.pack] || {}), [nat]: summary(b) }; put(aKey(acc, 'bridges'), all);
    mem.delete(key);
    return { pack: b.pack, native: nat, title: meta.title || b.pack };
  }
  async function detach(acc, packId, nat) {
    acc = accNow(acc); nat = base(nat);
    await DB.del(`${acc}|${packId}|${nat}`).catch(() => { });
    const all = index(acc); if (all[packId]) { delete all[packId][nat]; if (!Object.keys(all[packId]).length) delete all[packId]; put(aKey(acc, 'bridges'), all); }
    mem.delete(`${acc}|${packId}|${nat}`);
  }

  /* ---------- the badge: 文A RU +2 (the learner's language first; endonyms in the tooltip) ---------- */
  const partial = m => typeof m.coverage === 'number' && m.coverage < 0.9;
  function tag(s, acc) {
    if (!s || s.kind === 'language' || String(s.id || '').startsWith('lang:')) return null;
    acc = accNow(acc);
    const av = available(acc, s.id, s), codes = Object.keys(av); if (!codes.length) return null;
    const mine = nativeOrUi(acc);
    codes.sort((a, b) => (b === mine) - (a === mine) || a.localeCompare(b));
    const first = codes[0], weak = codes.every(c => av[c].status !== 'reviewed' || partial(av[c]));
    const langs = codes.map(c => partial(av[c]) ? T('bridge.tag.partial', { lang: endonym(c), pct: pct(av[c].coverage) }) : av[c].status === 'reviewed' ? endonym(c) : T('bridge.tag.draft', { lang: endonym(c) }));
    const label = T('bridge.tag.tip', { langs: I()?.fmt?.list ? I().fmt.list(langs) : langs.join(', ') });
    return h('span', { class: 'nb-tag' + (weak ? ' nb-weak' : ''), title: label, 'aria-label': label, 'data-bridge': codes.join(' ') },
      h('span', { class: 'noema-i18n-skip', translate: 'no' }, '文A ' + first.toUpperCase() + (codes.length > 1 ? ' +' + (codes.length - 1) : '')));   // i18n-ignore (the icon and language codes: data, not words)
  }

  /* ---------- the page: one section ---------- */
  const cur = { b: null, sid: null, body: null, src: null, glossedIn: new Set(), seenOnce: new Set() };
  /** The gloss under a word: the first sense, without what is in brackets (the card has the rest). */
  function gloss(t) { const s = String(t || '').replace(/\s*[(（][^)）]*[)）]/g, '').split(/\s*[;,/]\s*/)[0].trim() || String(t || ''); return s.length > 26 ? s.slice(0, 25) + '…' : s; }
  /** The sense of a match: an anchor of this block (its quote at this place), else the entry's first sense. */
  function senseAt(b, e, ctx, sid) {
    const list = (b._anchors[sid] || []).filter(a => a.k === e.k); let s = null;
    if (list.length && ctx.block?.dataset) {
      const text = ctx.blockText ?? ctx.block.textContent, bid = ctx.block.dataset.bid;
      for (const a of list) {
        const inBlock = String(a.at).split('/')[1] === bid;
        for (let i = text.indexOf(a.quote); i >= 0; i = text.indexOf(a.quote, i + 1)) {
          if (a.prefix && !text.slice(0, i).replace(/\s+/g, ' ').endsWith(a.prefix.replace(/\s+/g, ' '))) continue;
          if (a.suffix && !text.slice(i + a.quote.length).replace(/\s+/g, ' ').startsWith(a.suffix.replace(/\s+/g, ' '))) continue;
          if (ctx.offset >= i && ctx.offset < i + a.quote.length && (inBlock || !list.some(x => String(x.at).split('/')[1] === bid))) { s = String(a.sense); break; }
        }
        if (s) break;
      }
    }
    const ss = e.senses || [], f = WL().fold(ctx.form || '');
    return ss.find(x => String(x.id) === s) || ss.find(x => (x.forms || []).some(y => WL().fold(y) === f)) || ss[0] || null;   // no anchor: a sense whose own forms hold this form, else the first
  }
  function picker(acc, b, sid, level) {
    const W = words(acc, b.source), keyT = new Set(b.sections?.[sid]?.terms || []), firstHere = new Set();
    return (e, ctx) => {
      const sense = senseAt(b, e, ctx, sid); if (!sense?.t) return null;
      const w = W[e.k] || {}, first = !firstHere.has(e.k); firstHere.add(e.k);
      const cls = w.known ? 'nw-known' : null;
      if (w.known || level === 'tap' || !first) return { sense: String(sense.id), cls };
      const faded = (w.seen || 0) >= FADE && !(w.look > 0 && Date.now() - (w.lookAt || 0) < 14 * 864e5);
      const want = level === 'open' ? (keyT.has(e.k) || e.key || (e.band || 2) >= 2) : (keyT.has(e.k) || e.key || e.band === 3);
      if (!want || faded) return { sense: String(sense.id), cls };
      const g = gloss(sense.t); if (WL().fold(g) === WL().fold(ctx.form)) return { sense: String(sense.id), cls };   // "ACID" under ACID helps nobody
      cur.glossedIn.add(e.k);
      return { sense: String(sense.id), gloss: g, glossLang: b.native, cls };
    };
  }
  /** Called by the engine after it drew a section's blocks (engine/src/40_views.js sectionView). */
  async function section({ sid, body, head }) {
    const acc = accNow(), subj = N().subject, pack = N().pack; if (!body || !subj || !pack?.subject?.id || !WL()) return;
    const src = base(subj.language || pack.subject.language || 'en'), packId = pack.subject.id;
    const av = available(acc, packId, N().subjectMeta || regEntry(packId));
    if (head && !head.querySelector('.nb-btn') && Object.keys(av).length) head.append(button(acc));
    const st = settings(acc), nat = nativeOrUi(acc);
    if (!Object.keys(av).length || (native(acc) && nat === src)) return clear(body);   // no help, or the content is in the learner's own language
    if (!st.asked) { if (!body.querySelector('.nb-ask')) body.prepend(askCard(acc, av, src)); return; }
    if (!st.on || !av[nat] || nat === src) return clear(body);
    const b = await load(acc, packId, nat);
    if (!b || base(b.source) !== src || !body.isConnected) return clear(body);
    cur.b = b; cur.sid = sid; cur.body = body; cur.src = src;
    body.classList.add('nb-root'); body.dataset.nbLevel = st.level;
    WL().undecorate(body); body.querySelector(':scope > .nb-prep')?.remove();
    const prep = prepCard(acc, b, sid, st.level); if (prep) body.prepend(prep);
    cur.glossedIn = new Set();
    WL().decorate(body, b._idx, { pick: picker(acc, b, sid, st.level), skip: '.nb-prep, .nb-ask, .newtag, .xbtn' });   // i18n-ignore (selectors)
    body.classList.toggle('nb-glossed', !!body.querySelector('.nw-g'));   // room under the lines for the glosses
    // a word whose gloss was shown in this section counts once per section and day (help that fades)
    const day = new Date().toISOString().slice(0, 10);
    for (const k of cur.glossedIn) { const once = `${sid}|${k}|${day}`; if (cur.seenOnce.has(once)) continue; cur.seenOnce.add(once); touchWord(acc, b.source, k, { seen: n => (n || 0) + 1 }); }
  }
  function clear(body) { if (!body) return; WL()?.undecorate(body); body.classList.remove('nb-root', 'nb-glossed'); body.querySelector(':scope > .nb-prep')?.remove(); }
  function redraw() { if (cur.body?.isConnected && cur.sid) section({ sid: cur.sid, body: cur.body, head: null }); }

  /** “Before you read”: the section's preview in the learner's language and its key terms, both ways. */
  function prepCard(acc, b, sid, level) {
    const sec = b.sections?.[sid]; if (!sec || (!sec.preview && !(sec.terms || []).length)) return null;
    const terms = (sec.terms || []).map(k => b._byK.get(k)).filter(e => e?.senses?.[0]?.t);
    const d = h('details', { class: 'nb-prep', 'data-nowl': '1' });
    if (level !== 'tap') d.open = true;
    d.append(h('summary', {}, h('span', { class: 'nb-i', 'aria-hidden': 'true' }, '文A'), ' ', T('bridge.prep.title'), terms.length ? h('small', {}, ' · ' + T('bridge.prep.terms', { n: terms.length })) : null),   // i18n-ignore (the icon)
      sec.preview ? h('p', { class: 'nb-preview', lang: b.native, dir: 'auto' }, sec.preview) : null,
      terms.length ? h('ul', { class: 'nb-terms' }, ...terms.map(e => h('li', {},
        h('button', { class: 'nb-term', type: 'button', lang: b.source, onclick: ev => openCard(ev.currentTarget, e.k, String(e.senses[0].id)) }, e.k),
        ' ', h('span', { lang: b.native, dir: 'auto' }, e.senses[0].t)))) : null);
    return d;
  }
  /** The first time a subject with language help is opened: the learner's native language (when unknown) and level. */
  function askCard(acc, av, src) {
    const box = h('div', { class: 'nb-ask', role: 'region', 'aria-label': T('bridge.toggle') });
    const codes = Object.keys(av).filter(c => c !== src);
    let nat = native(acc) || (codes.includes(nativeOrUi(acc)) ? nativeOrUi(acc) : null);
    const draw = () => {
      box.replaceChildren();
      if (!nat) {
        const sel = h('select', { class: 'nb-natsel', 'aria-label': T('bridge.ask.nativeQ') }, h('option', { value: '' }, '—'), ...[...codes, src].map(c => h('option', { value: c }, endonym(c))), h('option', { value: '*' }, T('bridge.ask.nativeOther')));   // i18n-ignore (a placeholder dash)
        sel.addEventListener('change', () => {
          if (sel.value === src) { setNative(acc, src); setSettings(acc, { asked: Date.now(), on: false }); box.remove(); return; }   // the content is in the learner's own language: nothing to help with
          if (sel.value === '*') { box.replaceChildren(h('p', {}, T('bridge.ask.noneYet')), h('button', { class: 'btn small', type: 'button', onclick: () => { setSettings(acc, { asked: Date.now(), on: false }); box.remove(); } }, T('bridge.ask.ok'))); return; }
          if (sel.value) { nat = sel.value; setNative(acc, nat); draw(); }
        });
        box.append(h('b', {}, h('span', { class: 'nb-i', 'aria-hidden': 'true' }, '文A'), ' ', T('bridge.ask.nativeQ')), h('p', { class: 'tiny' }, T('bridge.ask.nativeWhy', { source: langName(src) })), sel);   // i18n-ignore (the icon)
        return;
      }
      const pickL = c => () => { setSettings(acc, { asked: Date.now(), on: c !== 'off', ...(c !== 'off' ? { level: CEFR[c], cefr: c } : {}) }); box.remove(); redrawAfterAsk(); };
      box.append(h('b', {}, h('span', { class: 'nb-i', 'aria-hidden': 'true' }, '文A'), ' ', T('bridge.ask.title', { source: langName(src), native: endonym(nat) })),   // i18n-ignore (the icon)
        h('p', { class: 'tiny' }, T('bridge.ask.text', { source: langName(src) })),
        h('div', { class: 'nb-askrow' }, ...['a2', 'b1', 'b2'].map(c => h('button', { class: 'btn small', type: 'button', onclick: pickL(c) }, T('bridge.ask.' + c))),
          h('button', { class: 'btn small ghost', type: 'button', onclick: pickL('off') }, T('bridge.ask.later'))),
        h('p', { class: 'tiny nb-hint' }, T('bridge.ask.settings')));
    };
    draw();
    return box;
  }
  let pending = null;
  function redrawAfterAsk() { const body = document.querySelector('.nb-root') || pending?.body; if (pending) section(pending); else if (body) redraw(); }

  /* ---------- the 文A button and its panel ---------- */
  function button(acc) {
    const st = settings(acc);
    const b = h('button', { class: 'pill nb-btn' + (st.on && st.asked ? ' on' : ''), type: 'button', title: T('bridge.toggleTip'), 'aria-label': T('bridge.toggle'), 'aria-haspopup': 'dialog', 'data-nowl': '1',
      onclick: e => { e.stopPropagation(); openPanel(acc, e.currentTarget); } }, h('span', { 'aria-hidden': 'true' }, '文A'));   // i18n-ignore (the icon)
    return b;
  }
  function menuItem() {
    const acc = accNow(), pack = N().pack; if (!pack?.subject?.id) return null;
    if (!Object.keys(available(acc, pack.subject.id, N().subjectMeta)).length) return null;
    return { label: T('bridge.menu'), icon: '文A', run: () => openPanel(acc, document.querySelector('.nb-btn')) };   // i18n-ignore (the icon)
  }
  /** On/off, level and language — also used in Settings. */
  function panel(acc, { onChange } = {}) {
    acc = accNow(acc);
    const st = settings(acc), box = h('div', { class: 'nb-panel' });
    const pack = N().pack, av = pack?.subject?.id ? available(acc, pack.subject.id, N().subjectMeta) : {};
    const sw = h('input', { type: 'checkbox', class: 'nb-on' }); sw.checked = !!(st.on && st.asked);
    sw.addEventListener('change', () => { setSettings(acc, { on: sw.checked, asked: settings(acc).asked || Date.now() }); onChange?.(); });
    const lv = h('div', { class: 'nb-levels', role: 'radiogroup', 'aria-label': T('bridge.level.title') }, ...LEVELS.map(l => {
      const r = h('input', { type: 'radio', name: 'nb-level', value: l }); r.checked = st.level === l;
      r.addEventListener('change', () => { setSettings(acc, { level: l, on: true, asked: settings(acc).asked || Date.now() }); sw.checked = true; onChange?.(); });
      return h('label', { class: 'nb-level' }, r, h('span', {}, h('b', {}, T('bridge.level.' + l)), h('small', {}, T('bridge.level.' + l + 'Sub'))));   // i18n-ignore (a key suffix)
    }));
    const codes = [...new Set([...Object.keys(av), nativeOrUi(acc)])];
    const sel = h('select', { class: 'nb-natsel', 'aria-label': T('bridge.native.label') }, ...codes.map(c => h('option', { value: c }, endonym(c) + (av[c] ? '' : ' · ' + T('bridge.native.none')))));
    sel.value = nativeOrUi(acc);
    sel.addEventListener('change', () => { setNative(acc, sel.value); onChange?.(); });
    box.append(h('label', { class: 'nb-row' }, sw, h('b', {}, T('bridge.toggle'))), h('p', { class: 'tiny' }, T('bridge.panel.sub')),
      h('label', { class: 'nb-row' }, h('span', {}, T('bridge.native.label')), sel), lv);
    if (pack?.subject?.id && !av[nativeOrUi(acc)]) box.append(h('p', { class: 'tiny nb-hint' }, T('bridge.panel.none', { lang: endonym(nativeOrUi(acc)) })));
    return box;
  }
  function openPanel(acc, anchor) {
    closeCard();
    const pop = h('div', { class: 'nb-card nb-pop', role: 'dialog', 'aria-label': T('bridge.toggle') });
    pop.append(h('div', { class: 'nb-cardhead' }, h('b', {}, h('span', { 'aria-hidden': 'true' }, '文A '), T('bridge.toggle')), closeBtn()),   // i18n-ignore (the icon)
      panel(acc, { onChange: () => { document.querySelectorAll('.nb-btn').forEach(b => b.classList.toggle('on', !!(settings(acc).on && settings(acc).asked))); document.querySelector('.nb-ask')?.remove(); redraw(); if (!cur.body && pending) section(pending); } }));
    place(pop, anchor);
  }

  /* ---------- the word's card ---------- */
  let card = null;
  const closeBtn = () => h('button', { class: 'nb-x', type: 'button', 'aria-label': T('bridge.card.close'), onclick: () => closeCard(true) }, '×');   // i18n-ignore (a symbol)
  function closeCard(refocus = false) { if (card) { const back = card._from; card.remove(); card = null; if (refocus) back?.focus?.({ preventScroll: true }); } }
  function place(pop, anchor) {
    document.body.append(pop); card = pop; pop._from = anchor || null;
    const r = anchor?.getBoundingClientRect?.(), narrow = window.innerWidth < 600;
    if (r && !narrow) {
      const w = pop.offsetWidth, top = r.bottom + window.scrollY + 6;
      pop.style.top = top + 'px'; pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + window.scrollX)) + 'px';
    } else pop.classList.add('nb-sheet');
    setTimeout(() => (pop.querySelector('button.nb-known, .nb-x') || pop).focus(), 30);
  }
  function openCard(wEl, k, senseId) {
    const b = cur.b, acc = accNow(); if (!b) return;
    const e = b._byK.get(k); if (!e) return;
    const sense = (e.senses || []).find(s => String(s.id) === String(senseId)) || e.senses[0];
    closeCard();
    const form = wEl?.firstChild?.nodeType === 3 ? wEl.firstChild.data : (wEl?.textContent || k);
    const w = touchWord(acc, b.source, k, { look: n => (n || 0) + 1, lookAt: Date.now() });
    const known = !!w.known;
    const say = 'speechSynthesis' in window ? h('button', { class: 'nb-say', type: 'button', title: T('bridge.card.listen'), 'aria-label': T('bridge.card.listen'), onclick: () => { try { const u = new SpeechSynthesisUtterance(form); u.lang = b.source; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (er) { } } }, '🔊') : null;   // i18n-ignore (an icon)
    const p0 = sense.pos || e.pos, pos = p0 && POS.includes(p0) ? T('bridge.pos.' + p0) : '';
    const others = (e.senses || []).filter(x => x !== sense && x.t);   // the word's other meanings in this subject
    const rep = h('div', { class: 'nb-report', hidden: true });
    const pop = h('div', { class: 'nb-card', role: 'dialog', 'aria-label': form },
      h('div', { class: 'nb-cardhead' }, h('b', { class: 'nb-word', lang: b.source }, form), say, closeBtn()),
      h('div', { class: 'tiny nb-meta' }, [pos, WL().fold(form) !== WL().fold(e.k) ? T('bridge.card.form', { lemma: e.k }) : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'nb-t', lang: b.native, dir: 'auto' }, sense.t),
      sense.note ? h('p', { class: 'nb-note', lang: b.native, dir: 'auto' }, sense.note) : null,
      others.length ? h('details', { class: 'nb-other' }, h('summary', { class: 'tiny' }, T('bridge.card.other')),
        h('ul', {}, ...others.map(o => h('li', {}, h('span', { lang: b.native, dir: 'auto' }, o.t), o.gloss ? h('small', { lang: b.source }, ' · ' + o.gloss) : null)))) : null,   // i18n-ignore (a separator)
      sense.st === 'stale' ? h('p', { class: 'tiny nb-flag' }, T('bridge.card.stale')) : (sense.st || b.status) === 'draft' ? h('p', { class: 'tiny nb-flag', title: T('bridge.card.draftTip') }, T('bridge.card.draft')) : null,
      h('div', { class: 'nb-actions' },
        h('button', { class: 'btn small nb-known', type: 'button', onclick: () => { touchWord(acc, b.source, k, { known: known ? undefined : Date.now() }); closeCard(); redraw(); } }, known ? T('bridge.card.unknown') : T('bridge.card.known')),
        h('button', { class: 'btn small ghost nb-rep', type: 'button', onclick: () => { rep.hidden = !rep.hidden; rep.querySelector('textarea')?.focus(); } }, T('bridge.card.report'))),
      rep);
    const ta = h('textarea', { class: 'noema-input', rows: '2', maxlength: '300', placeholder: T('bridge.card.reportPh'), 'aria-label': T('bridge.card.report') });
    rep.append(ta, h('button', { class: 'btn small', type: 'button', onclick: () => { report(acc, { pack: b.pack, native: b.native, k, sense: String(sense.id), form, note: ta.value.trim(), sid: cur.sid }); rep.replaceChildren(h('p', { class: 'tiny' }, T('bridge.card.reported'))); } }, T('bridge.card.reportSend')));
    place(pop, wEl);
  }
  /** A reported translation: kept in the account (a:bridgeReports, synced) for whoever reviews the bridge next. */
  function report(acc, r) { const k = aKey(accNow(acc), 'bridgeReports'), all = jget(k, []) || []; all.push({ ...r, at: new Date().toISOString() }); put(k, all.slice(-200)); }

  if (typeof document !== 'undefined') {
    const open = (ev, w) => { if (!w.closest('.nb-root')) return; ev.preventDefault(); ev.stopPropagation(); openCard(w, w.dataset.k, w.dataset.s); };
    document.addEventListener('click', ev => {
      const w = ev.target.closest?.('.nb-root .nw'); if (w) return open(ev, w);   // i18n-ignore (a selector)
      if (card && !ev.target.closest?.('.nb-card') && !ev.target.closest?.('.nb-btn')) closeCard();
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && card) { closeCard(true); return; }
      const w = (ev.key === 'Enter' || ev.key === ' ') && ev.target.closest?.('.nb-root .nw'); if (w) open(ev, w);   // i18n-ignore (a selector)
    });
  }
  /** The engine asks for help on a section before it knows whether a bridge exists (the ask card waits for the first one). */
  function sectionHook(o) { pending = o; return section(o).catch(e => console.warn('[bridge]', e)); }   // i18n-ignore (a log)

  return { section: sectionHook, tag, attach, detach, available, load, settings, setSettings, native, setNative, words, menuItem, panel, report, FADE, LEVELS, _mem: mem };
})();
