/* =====================================================================================
   noema-lite — characters (themes). One character = one theme: palette (light and dark), fonts, the shape of
   cards, buttons and icon tiles, the still landscape, the collection on Progress, and the tutor's face; the names and words of the characters are in i18n/characters/.
   29 characters in three groups (animals, fairy tales, grown-up). Their look is the design tokens (src/ui/tokens: one token set
   per character, engine/tokens.css): this file puts the character on the page (html[data-m], html[data-tone]) and keeps the
   learner's choice. Loaded before the loader, so the first screen already wears the learner's character. Pictures live in
   engine/art.js. docs/UI_MAP.md
   ===================================================================================== */
window.NoemaThemes = (() => {
  'use strict';
  /* i18n-ignore-start — ids, no words for learners */
  /* each character: its group in the gallery and its tone (cute · serious · strict: how much game it brings); the order is the gallery's
     and the token sets' (src/ui/tokens/characters.ts) */
  const DATA = {
    hedge: { group: 'animals', tone: 'cute' },
    owl: { group: 'animals', tone: 'cute' },
    axo: { group: 'animals', tone: 'cute' },
    dragon: { group: 'animals', tone: 'cute' },
    alien: { group: 'animals', tone: 'cute' },
    bear: { group: 'animals', tone: 'cute' },
    fruit: { group: 'animals', tone: 'cute' },
    knight: { group: 'animals', tone: 'cute' },
    berry: { group: 'animals', tone: 'cute' },
    hood: { group: 'tales', tone: 'cute' },
    piglet: { group: 'tales', tone: 'cute' },
    candy: { group: 'tales', tone: 'cute' },
    jack: { group: 'tales', tone: 'cute' },
    frog: { group: 'tales', tone: 'cute' },
    puss: { group: 'tales', tone: 'cute' },
    wolf: { group: 'grown', tone: 'serious' },
    eagle: { group: 'grown', tone: 'serious' },
    robot: { group: 'grown', tone: 'serious' },
    heron: { group: 'grown', tone: 'serious' },
    litM: { group: 'grown', tone: 'serious' },
    litF: { group: 'grown', tone: 'serious' },
    techM: { group: 'grown', tone: 'serious' },
    techF: { group: 'grown', tone: 'serious' },
    physM: { group: 'grown', tone: 'serious' },
    physF: { group: 'grown', tone: 'serious' },
    bioM: { group: 'grown', tone: 'serious' },
    bioF: { group: 'grown', tone: 'serious' },
    hydra: { group: 'grown', tone: 'serious' },
    prism: { group: 'grown', tone: 'strict' }
  };
  /* i18n-ignore-end */
  /* The characters' words live in the catalog i18n/characters/<locale>.arb (docs/i18n.md), keys char.<id>.…: the tutor's name
     (name; nameNom with article as a subject, nameAcc as an object, nameTo after "to/at" — every language gives the forms it needs,
     English has the plain name in all four) and the character's title, short title, world, the place of level 7, the collection
     on Progress and one item of it. Names were picked by the owner on 2026-10-08; fairy-tale characters keep the name their tale
     gives them in each language (2026-10-09). Hansel and Gretel are two: their name goes with plural verbs (x-plural in en.arb). */
  const PLURAL = { candy: true };
  const ORDER = Object.keys(DATA);
  const GROUPS = { animals: ORDER.filter(k => DATA[k].group === 'animals'), tales: ORDER.filter(k => DATA[k].group === 'tales'), grown: ORDER.filter(k => DATA[k].group === 'grown') };
  /* a text-friendly face for places where only a character fits (titles of conversations, plain-text buttons) */
  const EMOJI = { hedge: '🦔', owl: '🦉', axo: '🦎', dragon: '🐉', alien: '👽', bear: '🐻', fruit: '🍊', knight: '🛡️', berry: '🍓', hood: '🧺', piglet: '🐷', candy: '🍬', jack: '🌱', frog: '🐸', puss: '🐱', wolf: '🐺', eagle: '🦅', robot: '🤖', heron: '🪶', prism: '🔷',
    litM: '📚', litF: '✒️', techM: '💻', techF: '🖥️', physM: '⚛️', physF: '🪐', bioM: '🧪', bioF: '🧬', hydra: '🐲' };
  const DAY = 864e5, FREE_DAYS = 15, CHANGE_DAYS = 5, PREVIEW_MS = 5 * 60e3, DEFAULT = 'hedge';

  /* ---------- the learner's character: a:settings.character (synced). Changes are free for 15 days after the first choice, then once every
     5 days; any other can be tried for 5 minutes. current() is THE character on screen: every surface asks it, never owned() or settings. ---------- */
  const P = 'noema1:';
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const accNow = () => window.Noema?.account?.id || window.Noema?.kv?.acc || jget(P + 'current', {}).acc || null;
  const settingsOf = (acc = accNow()) => acc ? jget(`${P}${acc}:a:settings`, {}) || {} : {};
  function putSettings(patch, acc = accNow()) {
    if (!acc) return;
    const k = `${P}${acc}:a:settings`, s = Object.assign(jget(k, {}) || {}, patch);
    Object.keys(patch).forEach(x => patch[x] === undefined && delete s[x]);
    const v = JSON.stringify(s);
    if (window.Noema?.kv) window.Noema.kv.set(k, v); else try { localStorage.setItem(k, v); } catch (e) { }
    try { if (window.S?.settings) Object.assign(window.S.settings, patch); } catch (e) { }
  }
  const cfg = () => window.NOEMA_CONFIG || {};
  /** An organisation can fix the character for everybody (config.js: character: 'prism', lockCharacter: true). */
  const locked = () => !!(cfg().lockCharacter && DATA[cfg().character]);
  function owned(acc) { if (locked()) return cfg().character; const m = settingsOf(acc).character; return DATA[m] ? m : (DATA[cfg().character] ? cfg().character : DEFAULT); }
  function preview() { try { const p = JSON.parse(sessionStorage.getItem('noema-preview') || 'null'); return p && DATA[p.m] && p.until > Date.now() && !locked() ? p : null; } catch (e) { return null; } }
  /** The character on screen now: the one on a 5-minute try, else the learner's own. The frame, the tutor, the reactions, the Roadmap and the exercises all use it. */
  const current = acc => preview()?.m || owned(acc);
  /** Until when changes are free: 15 days after the first choice (settings made before 2026-10-10 count from their last choice). */
  function freeUntil(acc) { const s = settingsOf(acc), since = s.characterSince || s.characterAt; return s.character && since ? since + FREE_DAYS * DAY : 0; }
  /** When the next change is possible (0 or a past time: now). */
  function nextChangeAt(acc) { const s = settingsOf(acc); if (!s.character || Date.now() < freeUntil(acc)) return 0; return (s.characterAt || 0) + CHANGE_DAYS * DAY; }
  const canChange = acc => !locked() && Date.now() >= nextChangeAt(acc);
  const listeners = [];
  const onChange = f => { listeners.push(f); return () => listeners.splice(listeners.indexOf(f), 1); };
  function apply(m = current()) {
    if (typeof document === 'undefined') return m;
    const root = document.documentElement;
    if (root.dataset.m !== m) { root.dataset.m = m; root.dataset.tone = DATA[m].tone; listeners.forEach(f => { try { f(m); } catch (e) { } }); }
    return m;
  }
  /** Choose (keep) a character: as often as the learner likes for 15 days after the first choice, then once every 5 days. */
  function choose(m, { acc = accNow(), force = false } = {}) {
    if (!DATA[m] || locked()) return false;
    const s = settingsOf(acc);
    if (!force && s.character && s.character !== m && !canChange(acc)) return false;
    putSettings({ character: m, characterAt: s.character && s.character !== m ? Date.now() : (s.characterAt || Date.now()), characterSince: s.characterSince || s.characterAt || Date.now() }, acc);
    endPreview(false); apply(m); return true;
  }
  let pvTimer = 0;
  function startPreview(m) {
    if (!DATA[m] || locked()) return;
    try { sessionStorage.setItem('noema-preview', JSON.stringify({ m, until: Date.now() + PREVIEW_MS })); } catch (e) { }
    apply(m); watchPreview();
  }
  function endPreview(reapply = true) { try { sessionStorage.removeItem('noema-preview'); } catch (e) { } clearInterval(pvTimer); pvTimer = 0; if (reapply) apply(owned()); }
  function watchPreview() { clearInterval(pvTimer); pvTimer = setInterval(() => { if (!preview()) endPreview(); listeners.forEach(f => { try { f(current(), 'tick'); } catch (e) { } }); }, 1000); }

  /* ---------- names and words of a character, per interface language, from the catalog (i18n/characters/; English as the fallback).
     The forms of the tutor's name are the translator's: Greek "Ρώτα τον Αγκαθούλη", Russian "Спроси Колючку", French "Demande à Piquou". ---------- */
  const uiLang = () => { try { return window.NoemaI18n ? NoemaI18n.lang(settingsOf().lang) : 'en'; } catch (e) { return 'en'; } };
  /** The UI locale to read a character's words in: the given one when the app offers it, else English. */
  const charLoc = lang => { try { return (window.NoemaI18n && NoemaI18n.match(lang)) || 'en'; } catch (e) { return 'en'; } };
  const word = (key, loc) => window.NoemaI18n ? NoemaI18n.t(key, undefined, loc) : key;
  /** tutor('hedge') → { n: 'Αγκαθούλης', nom: 'ο Αγκαθούλης', acc: 'τον Αγκαθούλη', to: 'στον Αγκαθούλη', pl: false } in the interface language. */
  function tutor(m = current(), lang = uiLang()) {
    if (!DATA[m]) m = DEFAULT;
    const loc = charLoc(lang), k = f => `char.${m}.${f}`, n = word(k('name'), loc);
    // a form a language has not given (yet) is its own plain name, never the English form
    const form = f => { const v = word(k(f), loc); return loc !== 'en' && v === word(k(f), 'en') ? n : v; };
    return { n, nom: form('nameNom'), acc: form('nameAcc'), to: form('nameTo'), pl: !!PLURAL[m], emoji: EMOJI[m] };
  }
  /** { name (the title), short, world, place, coll (the collection), item } of a character in the interface language. */
  function text(m = current(), lang = uiLang()) {
    if (!DATA[m]) m = DEFAULT;
    const loc = charLoc(lang), w = f => word(`char.${m}.${f}`, loc);
    return { name: w('title'), short: w('short'), world: w('world'), place: w('place'), coll: w('coll'), item: w('item') };
  }

  /* ---------- the rest of the look & feel the learner picks: what to learn and how much "game" ---------- */
  const world = (acc) => settingsOf(acc).world || 'know';                       // know · lang · both
  const game = (acc) => locked() && DATA[cfg().character].tone === 'strict' ? (settingsOf(acc).game === 'off' ? 'off' : 'calm') : (settingsOf(acc).game || (DATA[current(acc)].tone === 'strict' ? 'calm' : 'playful'));   // playful · calm · off

  if (typeof window !== 'undefined' && preview()) watchPreview();   // a try that goes on after a reload still ends on time
  /* a character chosen on another device (the sync brings a:settings) or in another tab: this page wears it at once, everywhere
     (apply() tells every listener, so the frame, the tutor and the open screen redraw) */
  const isSettings = k => !k || /:a:settings$/.test(k);
  if (typeof window !== 'undefined') {
    addEventListener('noema:remote', e => { if ((e.detail?.keys || []).some(isSettings)) apply(); });
    addEventListener('storage', e => { if (isSettings(e.key)) apply(); });
  }
  return { DATA, ORDER, GROUPS, EMOJI, apply, current, owned, preview, startPreview, endPreview, choose, canChange, nextChangeAt, freeUntil, locked, onChange,
    tutor, text, uiLang, world, game, settings: settingsOf, putSettings, tone: (m = current()) => DATA[m].tone, PREVIEW_MS, CHANGE_DAYS, FREE_DAYS };
})();
if (window.NoemaThemes) window.NoemaThemes.apply();
