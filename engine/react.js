/* =====================================================================================
   noema-lite — the character's reactions to what the learner did (docs/UI_MAP.md §Reactions).
   Small: always, on the tutor button (a hop when right, a tilt when wrong).
   Big: a little stage with the character and its props, top right on wide screens, rising from the bottom on phones.
   Rules (decided 2026-10-08):
   · a big one at random at most once every 3 minutes; milestones (timer, chapter, step, treasure, medal, boss won,
     level, streak) always play;
   · never while typing (milestones wait until the learner stops typing), never the same variant twice in a row;
   · it never takes clicks, leaves by itself (3″, the treasure 5″), Esc closes it;
   · game mode "calm" → only milestones; "off" or reduced motion → only the message, without moving;
   · a strict character (Prism) shows only the message, never props.
   ===================================================================================== */
window.NoemaReact = (() => {
  'use strict';
  const TH = () => window.NoemaThemes, ART = () => window.NoemaArt;
  const L = (k, v) => window.NoemaShell ? NoemaShell.L('rx.' + k, v) : k;
  const COOLDOWN = 180e3;
  const MILESTONE = new Set(['timer', 'timerwin', 'chapter', 'node', 'treasure', 'medal', 'bosswin', 'level', 'streak', 'goal', 'gym', 'hello']);
  const G = { streak: 0, wrongRun: 0, lastBig: 0, oops: false, last: '', started: Date.now(), restShown: false };
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const fx = () => document.getElementById('ns-fx');
  const fab = () => document.querySelector('#ns-fab .ns-fabface');
  const typing = () => !!document.activeElement?.matches?.('textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable="true"]');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mode = () => { const g = TH()?.game() || 'playful'; return reduced() ? 'off' : g; };
  const strict = () => TH()?.tone() === 'strict';

  /* ---------- small ---------- */
  const SMALL = { ok: 'hop', wrong: 'tilt', node: 'hop', gym: 'hop wiggle' };
  let sayT = 0;
  function react(kind, text) {
    const f = fab();
    if (f && mode() !== 'off') { f.classList.remove('hop', 'tilt', 'wiggle'); void f.offsetWidth; (SMALL[kind] || 'hop').split(' ').forEach(a => f.classList.add(a)); setTimeout(() => f.classList.remove('hop', 'tilt', 'wiggle'), 1900); }
    if (text && fx()) { const s = document.createElement('div'); s.className = 'ns-say'; s.setAttribute('role', 'status'); s.textContent = text; fx().querySelector('.ns-say')?.remove(); fx().append(s); clearTimeout(sayT); sayT = setTimeout(() => s.remove(), 2600); }
  }

  /* ---------- the props of the big ones ---------- */
  const GOLD = '#e8c25a', GOLD2 = '#b88a2e', WOOD = '#a8743f', WOOD2 = '#7f5530', PAPER = '#f3e6c4', PAPER2 = '#b9975a';
  const STAR = (f = GOLD) => `<svg viewBox="-12 -12 24 24"><path d="M0 -11 L3.2 -3.4 L11 -3 L5 2.2 L6.8 10 L0 5.8 L-6.8 10 L-5 2.2 L-11 -3 L-3.2 -3.4Z" fill="${f}"/></svg>`;
  const SPARK = f => `<svg viewBox="-10 -10 20 20"><path d="M0 -10 Q1.5 -1.5 10 0 Q1.5 1.5 0 10 Q-1.5 1.5 -10 0 Q-1.5 -1.5 0 -10Z" fill="${f}"/></svg>`;
  const P = (cls, style, inner) => `<span class="prop ${cls}" style="${style}">${inner}</span>`;
  const fire = (x, y, c, d) => P('pb fw', `left:${x}%;top:${y}%;color:${c};animation-delay:${d}s`, `<svg viewBox="-50 -50 100 100">${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, cx = Math.cos(a), sy = Math.sin(a); return `<path d="M${(cx * 12).toFixed(1)} ${(sy * 12).toFixed(1)} L${(cx * 38).toFixed(1)} ${(sy * 38).toFixed(1)}" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="${(cx * 46).toFixed(1)}" cy="${(sy * 46).toFixed(1)}" r="3.5" fill="currentColor"/>`; }).join('')}</svg>`);
  const CHEST = `<svg viewBox="0 0 100 72"><ellipse class="shine" cx="50" cy="30" rx="40" ry="14" fill="#ffe7a0" opacity="0"/><rect x="10" y="30" width="80" height="38" rx="5" fill="${WOOD}"/><rect x="10" y="40" width="80" height="5" fill="${WOOD2}"/><rect x="44" y="35" width="12" height="15" rx="2" fill="${GOLD}"/><g class="lid"><path d="M10 32 Q50 0 90 32Z" fill="#b98250"/><path d="M10 32 H90" stroke="${WOOD2}" stroke-width="4"/></g></svg>`;
  function burst(n, ox, oy, spread = 1) {   // collection items flying out: leaves, pearls, coins…
    const m = TH()?.current() || 'hedge';
    return Array.from({ length: n }, (_, i) => { const a = -Math.PI * (0.06 + 0.88 * i / (n - 1)), r = (90 + (i % 3) * 30) * spread;
      return `<span class="cf" style="left:${ox}%;top:${oy}%;--dx:${Math.round(Math.cos(a) * r)}px;--dy:${Math.round(Math.sin(a) * r - 10)}px;--rot:${(i * 47) % 360}deg;animation-delay:${(i % 4) * .08 + .2}s"><svg viewBox="-9 -9 18 18">${ART()?.item(m, 0, 0, (i * 53) % 180, ['var(--t1i)', 'var(--t2i)', 'var(--t3i)', 'var(--t4i)'][i % 4], 1) || ''}</svg></span>`; }).join('');
  }
  /* every variant: length in ms, props around the character (percent of the stage; the character fills its lower 82%) */
  const VARS = {
    dance: [3000, () => burst(14, 50, 40)],
    spin: [3000, () => burst(8, 50, 30, .8)],
    boing: [3000, () => P('pb spring', 'left:38%;top:84%;width:24%;height:16%', '<svg viewBox="0 0 40 20" preserveAspectRatio="none"><path d="M4 19 L36 16 L4 13 L36 10 L4 7 L36 4" stroke="var(--ink2)" stroke-width="3" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>')],
    wobble: [2600, () => ''],
    zoom: [2800, () => P('pb speed', 'left:62%;top:42%;width:46%;height:30%', '<svg viewBox="0 0 80 50"><g stroke="var(--ink3)" stroke-width="3" stroke-linecap="round"><path d="M10 8 H70"/><path d="M24 22 H78"/><path d="M4 36 H60"/><path d="M30 48 H70"/></g></svg>')],
    peek: [3300, () => P('', 'left:-6%;top:80%;width:112%;height:22%', '<svg viewBox="0 0 120 24" preserveAspectRatio="none"><path d="M0 24 V10 Q30 0 60 6 T120 8 V24Z" fill="var(--deco2)"/><path d="M0 24 V16 Q40 8 80 14 T120 14 V24Z" fill="var(--deco1)"/></svg>')],
    balloons: [3200, () => P('pb balloons', 'left:-4%;top:4%;width:46%;height:46%', '<svg viewBox="0 0 100 110"><path d="M26 40 Q40 80 74 108 M50 34 Q58 74 74 108 M74 42 Q70 80 74 108" stroke="var(--ink3)" stroke-width="1.4" fill="none"/><ellipse cx="26" cy="24" rx="15" ry="18" fill="#f2a7a0"/><ellipse cx="74" cy="26" rx="15" ry="18" fill="#a9b8ef"/><ellipse cx="50" cy="17" rx="16" ry="19" fill="#9fd0a5"/><g fill="#fff" opacity=".55"><ellipse cx="20" cy="17" rx="4" ry="6"/><ellipse cx="44" cy="10" rx="4" ry="6"/><ellipse cx="68" cy="19" rx="4" ry="6"/></g></svg>')],
    faint: [3000, () => P('orb', '', `<i>${STAR()}</i><i>${STAR()}</i><i>${STAR()}</i>`)],
    dizzy: [2600, () => P('orb', 'left:25%;top:6%', `<i>${STAR()}</i><i>${STAR()}</i><i>${STAR()}</i>`)],
    sweat: [2600, () => P('drop', 'left:66%;top:24%;width:9%;height:13%', '<svg viewBox="0 0 20 28"><path d="M10 0 Q20 16 16 22 A7 7 0 0 1 4 22 Q0 16 10 0Z" fill="#8cc7e8"/><ellipse cx="8" cy="19" rx="2" ry="3" fill="#fff" opacity=".7"/></svg>')],
    hearts: [2800, () => [[18, 50, -12, 0], [72, 46, 14, .25], [40, 40, -6, .5], [60, 58, 8, .75], [28, 62, 10, 1], [80, 60, -10, 1.2]].map(([x, y, r, d]) => P('ht', `left:${x}%;top:${y}%;--r:${r}deg;animation-delay:${d}s`, '<svg viewBox="0 0 26 24"><path d="M13 23 C4 16 0 11 0 6.5 A6.5 6.5 0 0 1 13 4 A6.5 6.5 0 0 1 26 6.5 C26 11 22 16 13 23Z" fill="var(--t3i)" opacity=".85"/></svg>')).join('')],
    zzz: [3200, () => [0, .7, 1.4].map(d => P('zz', `left:64%;top:22%;animation-delay:${d}s`, 'Z')).join('')],
    timer: [5300, () => P('watch', 'left:54%;top:16%;width:50%;height:48%', '<svg viewBox="0 0 100 110"><rect x="43" y="0" width="14" height="11" rx="3" fill="var(--ink2)"/><path d="M80 18 l8 -8" stroke="var(--ink2)" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="62" r="45" fill="var(--paper)" stroke="var(--ink2)" stroke-width="6"/><circle cx="50" cy="62" r="36" fill="none" stroke="var(--t3)" stroke-width="7"/><circle class="arc2" cx="50" cy="62" r="36" fill="none" stroke="var(--t3i)" stroke-width="7" stroke-dasharray="226" transform="rotate(-90 50 62)"/><text class="swn" x="50" y="78" text-anchor="middle" font-size="46" font-weight="800" fill="var(--ink)" style="font-family:var(--display)">5</text></svg>')],
    trophy: [3000, () => P('lift', 'left:30%;top:-8%;width:40%;height:36%', `<svg viewBox="0 0 100 90"><path d="M28 16 H14 a12 12 0 0 0 16 22" fill="none" stroke="${GOLD}" stroke-width="7"/><path d="M72 16 H86 a12 12 0 0 1 -16 22" fill="none" stroke="${GOLD}" stroke-width="7"/><path d="M27 8 H73 V32 a23 23 0 0 1 -46 0Z" fill="${GOLD}"/><rect x="44" y="54" width="12" height="16" fill="#d4a943"/><rect x="31" y="70" width="38" height="13" rx="3" fill="${GOLD2}"/><path d="M37 16 v14" stroke="#fff" stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/></svg>`) + [[18, 0, .2], [76, 4, .6], [64, -12, 1]].map(([x, y, d]) => P('twk', `left:${x}%;top:${y}%;animation-delay:${d}s`, SPARK(GOLD))).join('')],
    map: [3200, () => P('unroll', 'left:4%;top:58%;width:92%;height:34%', `<svg viewBox="0 0 200 80"><rect x="14" y="8" width="172" height="64" fill="${PAPER}" stroke="${PAPER2}" stroke-width="2"/><path d="M32 58 C60 22 92 70 120 36 S156 30 164 24" stroke="#9a7a45" stroke-width="3" stroke-dasharray="1 7" fill="none" stroke-linecap="round"/><path d="M158 16 l12 12 M170 16 l-12 12" stroke="#c0503c" stroke-width="4" stroke-linecap="round"/><rect x="3" y="3" width="15" height="74" rx="7.5" fill="#e3cf9e" stroke="${PAPER2}" stroke-width="2"/><rect x="182" y="3" width="15" height="74" rx="7.5" fill="#e3cf9e" stroke="${PAPER2}" stroke-width="2"/></svg>`)
      + P('plant', 'left:74%;top:26%;width:20%;height:40%', `<svg viewBox="0 0 40 80"><path d="M8 78 V6" stroke="${WOOD2}" stroke-width="4" stroke-linecap="round"/><path d="M10 7 L36 16 L10 26Z" fill="var(--t3i)"/></svg>`)],
    chest: [3200, () => P('chest', 'left:24%;top:60%;width:52%;height:36%', CHEST) + burst(12, 50, 68)],
    flex: [3000, () => P('bar2', 'left:2%;top:4%;width:96%;height:18%', '<svg viewBox="0 0 200 36"><rect x="20" y="15" width="160" height="7" rx="3.5" fill="var(--ink2)"/><rect x="6" y="2" width="16" height="32" rx="4" fill="var(--t4i)"/><rect x="22" y="6" width="10" height="24" rx="3" fill="var(--t4i)" opacity=".8"/><rect x="178" y="2" width="16" height="32" rx="4" fill="var(--t4i)"/><rect x="168" y="6" width="10" height="24" rx="3" fill="var(--t4i)" opacity=".8"/></svg>')],
    cake: [3200, n => P('', 'left:22%;top:56%;width:56%;height:40%', `<svg viewBox="0 0 100 90"><ellipse cx="50" cy="84" rx="46" ry="5" fill="var(--ink3)" opacity=".25"/><rect x="12" y="52" width="76" height="30" rx="6" fill="#f6d9c8"/><path d="M12 60 q9.5 9 19 0 q9.5 9 19 0 q9.5 9 19 0 q9.5 9 19 0" fill="none" stroke="#e9a6b4" stroke-width="5" stroke-linecap="round"/><rect x="24" y="30" width="52" height="24" rx="5" fill="#fbe8dd"/><text x="50" y="49" text-anchor="middle" font-size="15" font-weight="800" fill="#c0607a" style="font-family:var(--display)">${n || 7}</text>${[34, 50, 66].map(x => `<rect x="${x - 2}" y="16" width="4" height="14" rx="1" fill="var(--t4i)"/><ellipse class="fl" cx="${x}" cy="12" rx="3.2" ry="5" fill="#f2b544"/>`).join('')}</svg>`)],
    fireworks: [3000, () => fire(-6, -4, 'var(--t3i)', 0) + fire(60, -10, 'var(--t1i)', .45) + fire(30, 6, 'var(--t2i)', .9) + fire(66, 26, 'var(--t4i)', 1.3)],
    highfive: [2800, () => P('hand', 'left:-26%;top:28%;width:40%;height:40%', '<svg viewBox="0 0 60 70"><g fill="var(--paper)" stroke="var(--ink2)" stroke-width="2.5" stroke-linejoin="round"><rect x="9" y="6" width="9" height="34" rx="4.5"/><rect x="19" y="2" width="9" height="36" rx="4.5"/><rect x="29" y="4" width="9" height="34" rx="4.5"/><rect x="39" y="10" width="8.5" height="30" rx="4.2"/><path d="M8 30 H48 V50 a16 16 0 0 1 -16 16 H22 A14 14 0 0 1 8 52Z"/><path d="M48 40 q12 -6 10 8 q-4 8 -10 8"/></g></svg>')
      + P('pow', 'left:4%;top:22%;width:30%;height:26%', `<svg viewBox="-30 -26 60 52"><path d="M0 -24 L7 -10 L24 -14 L13 -2 L27 8 L10 9 L12 24 L0 13 L-12 24 L-10 9 L-27 8 L-13 -2 L-24 -14 L-7 -10Z" fill="${GOLD}"/></svg>`)],
    drum: [3000, () => P('', 'left:22%;top:60%;width:56%;height:34%', '<svg viewBox="0 0 100 66"><rect x="12" y="16" width="76" height="40" fill="var(--t3)" stroke="var(--t3i)" stroke-width="2"/><path d="M12 20 L25 52 L38 20 L50 52 L62 20 L75 52 L88 20" fill="none" stroke="var(--t3i)" stroke-width="2"/><ellipse cx="50" cy="56" rx="38" ry="8" fill="var(--t3)" stroke="var(--t3i)" stroke-width="2"/><ellipse cx="50" cy="16" rx="38" ry="9" fill="#f4efe4" stroke="var(--ink3)" stroke-width="2"/></svg>')
      + P('stick', 'left:18%;top:42%;width:22%;height:24%', `<svg viewBox="0 0 30 40"><path d="M4 38 L24 6" stroke="${WOOD2}" stroke-width="4" stroke-linecap="round"/><circle cx="25" cy="5" r="4.5" fill="${WOOD}"/></svg>`)
      + P('stick b', 'left:60%;top:42%;width:22%;height:24%;transform:scaleX(-1)', `<svg viewBox="0 0 30 40"><path d="M4 38 L24 6" stroke="${WOOD2}" stroke-width="4" stroke-linecap="round"/><circle cx="25" cy="5" r="4.5" fill="${WOOD}"/></svg>`)],
    sign: [3000, () => P('sign', 'left:-14%;top:2%;width:58%;height:52%', `<svg viewBox="0 0 120 108"><rect x="56" y="44" width="8" height="64" rx="2" fill="${WOOD}"/><rect x="4" y="4" width="112" height="54" rx="7" fill="${PAPER}" stroke="${PAPER2}" stroke-width="3"/><text x="60" y="37" text-anchor="middle" font-size="22" font-weight="800" fill="#4a3a22" style="font-family:var(--display)">${esc(L('signText'))}</text></svg>`)],
    treasure: [5000, () => fire(-8, -6, 'var(--t3i)', 0) + fire(62, -12, 'var(--t1i)', .5) + fire(28, 2, 'var(--t2i)', 1) + fire(68, 24, 'var(--t4i)', 1.5) + P('chest', 'left:24%;top:60%;width:52%;height:36%', CHEST) + burst(16, 50, 68, 1.2)] };
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  /* when each set plays (the texts are in engine/i18n_shell.js: sh.rx.<occasion>, picked at random) */
  const EV = {
    correct: ['boing', 'spin', 'wobble', 'zoom', 'hearts'], wrong: ['faint', 'dizzy', 'sweat'], wrong3: ['sign'],
    timer: ['timer'], timerwin: ['fireworks', 'trophy'], boss: ['drum'], bosswin: ['trophy', 'fireworks'],
    chapter: ['dance', 'spin', 'fireworks', 'chest'], node: ['map', 'zoom'], treasure: ['treasure'], gym: ['flex', 'boing'],
    streak: ['cake', 'fireworks'], goal: ['highfive', 'hearts'], level: ['balloons', 'spin'], medal: ['trophy', 'chest'],
    perfect: ['hearts', 'dance'], back: ['peek'], rest: ['zzz'], hello: ['peek', 'balloons'] };
  const textFor = (ev, v, vars) => rnd(L(ev === 'wrong' ? 'wrong.' + v : ev, vars).split('|'));   // several texts per occasion, "|"-separated

  /** A big reaction for an occasion. Returns the variant played (or null when the rules said no). */
  let pending = null;
  function big(ev, text, vars = {}) {
    if (!EV[ev] || !fx()) return null;
    const milestone = MILESTONE.has(ev), m = mode();
    if (!milestone && (m !== 'playful' || Date.now() - G.lastBig < COOLDOWN)) return null;
    if (typing() && ev !== 'timer') { if (milestone) { pending = [ev, text, vars]; waitTyping(); } return null; }
    const vs = EV[ev], pool = vs.length > 1 ? vs.filter(v => v !== G.last) : vs, v = rnd(pool);
    return play(v, text || textFor(ev, v, vars), { still: m === 'off' || strict(), arg: vars.n });
  }
  let waitT = 0;
  function waitTyping() { clearInterval(waitT); waitT = setInterval(() => { if (!pending) return clearInterval(waitT); if (!typing()) { clearInterval(waitT); const p = pending; pending = null; big(...p); } }, 1500); }
  let endT = 0, countT = 0;
  function play(v, text, { still = false, arg } = {}) {
    const [dur, props] = VARS[v]; G.last = v; G.lastBig = Date.now();
    const m = TH()?.current() || 'hedge';
    const box = document.createElement('div');
    box.className = `ns-cele v-${v}${still ? ' still' : ''}`; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    box.innerHTML = `<div class="cb"></div>${still ? '' : `<div class="stage"><span class="ns-face ${v === 'dance' ? 'wiggle' : ''}">${ART()?.mascot(m) || ''}</span>${props(arg)}</div>`}`;
    box.querySelector('.cb').textContent = text || '';
    fx().querySelectorAll('.ns-cele').forEach(x => x.remove()); fx().append(box);
    clearTimeout(endT); clearInterval(countT);
    if (v === 'timer' && !still) { let n = 5; countT = setInterval(() => { n--; const s = box.querySelector('.swn'); if (s && n > 0) s.textContent = n; else clearInterval(countT); }, 1000); }
    document.body.classList.add('celeon'); endT = setTimeout(end, still ? 2600 : dur);
    return v;
  }
  function end() { clearInterval(countT); clearTimeout(endT); const c = fx()?.querySelector('.ns-cele'); if (c) { c.classList.add('out'); setTimeout(() => { c.remove(); if (!fx()?.querySelector('.ns-cele')) document.body.classList.remove('celeon'); }, 450); } }
  /** The countdown of a running timer drill drives the stopwatch's number (5, 4, 3…). */
  function tick(n) { clearInterval(countT); const s = fx()?.querySelector('.ns-cele .swn'); if (s && n > 0) s.textContent = n; }

  /** After every answer: big ones are rare. hard = a difficult exercise (or 8/10+ on an open one). */
  function answered(ok, { hard = false } = {}) {
    if (ok) {
      G.wrongRun = 0; G.streak++; G.oops = false;
      const five = G.streak % 5 === 0, calm = Date.now() - G.lastBig > COOLDOWN;
      if (!typing() && mode() === 'playful' && calm && (five || hard || Math.random() < 1 / 8)) { if (big('correct', five ? L('correct.five') : hard ? L('correct.hard') : undefined)) return; }
      react('ok');
    } else {
      G.streak = 0; G.wrongRun++;
      if (G.wrongRun === 3 && mode() === 'playful' && Date.now() - G.lastBig > COOLDOWN) { if (big('wrong3')) return; }
      if (!typing() && !G.oops && mode() === 'playful' && Date.now() - G.lastBig > COOLDOWN && Math.random() < 1 / 10) { G.oops = true; if (big('wrong')) return; }
      G.oops = false; react('wrong');
    }
    restCheck();
  }
  /** 40 minutes of study without a break: once per session. */
  function restCheck() { if (!G.restShown && Date.now() - G.started > 40 * 60e3) { G.restShown = true; big('rest'); } }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && fx()?.querySelector('.ns-cele')) end(); });

  /** First open of the day: a 7/30-day streak, or coming back after 3+ days. Called once by the shell. */
  function dayStart(acc) {
    try {
      const k = `noema1:${acc}:meta:lastOpen`, last = +localStorage.getItem(k) || 0, now = Date.now(), d = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(k + 'Day') === d) return; localStorage.setItem(k, now); localStorage.setItem(k + 'Day', d);
      const sn = window.Noema?.stats?.streakNow() || 0;
      if (last && now - last > 3 * 864e5) setTimeout(() => big('back'), 1200);
      else if (sn === 7 || sn === 30 || (sn > 30 && sn % 30 === 0)) setTimeout(() => big('streak', null, { n: sn }), 1200);
    } catch (e) { }
  }

  return { react, big, play, end, tick, answered, dayStart, VARS, EV, COOLDOWN, MILESTONE, state: G };
})();
