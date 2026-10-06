/* ===================== Visual exercises & figures — canonical schema: docs/VISUAL.md (noema.visual/v1) ===================== */
const MEDIA = (Noema.pack && Noema.pack.media) || {};
Object.assign(TYPE_LABEL, { img_hotspot: '📍 Find it on the image', img_sequence: '🧭 Trace the path', img_reveal: '🧩 Reveal & answer', img_drag: '🏷️ Drag the labels', img_label: '✏️ Label the image', img_select: '🔽 Pick the labels', img_occlusion: '🙈 Cover & recall' });
const isVisual = ex => /^img_/.test(ex.type || '');
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}) { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; }

/* ---------- geometry (image units) ---------- */
function rBox(r) {
  if (r.shape === 'circle') return { x: r.cx - r.r, y: r.cy - r.r, w: 2 * r.r, h: 2 * r.r };
  if (r.shape === 'poly') { const xs = r.points.map(p => p[0]), ys = r.points.map(p => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}
function rCenter(r) {
  if (r.anchor) return r.anchor;
  if (r.shape === 'circle') return [r.cx, r.cy];
  if (r.shape === 'poly') return [r.points.reduce((a, p) => a + p[0], 0) / r.points.length, r.points.reduce((a, p) => a + p[1], 0) / r.points.length];
  return [r.x + r.w / 2, r.y + r.h / 2];
}
function rHit(r, x, y) {
  if (r.shape === 'circle') return (x - r.cx) ** 2 + (y - r.cy) ** 2 <= r.r ** 2;
  if (r.shape === 'poly') { let ins = false; const P = r.points; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
const rArea = r => { const b = rBox(r); return b.w * b.h; };
function rShape(r, cls, pad = 0) {
  if (r.shape === 'circle') return sv('circle', { cx: r.cx, cy: r.cy, r: r.r + pad, class: cls });
  if (r.shape === 'poly') return sv('polygon', { points: r.points.map(p => p.join(',')).join(' '), class: cls });
  return sv('rect', { x: r.x - pad, y: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, rx: r.rx ?? 8, class: cls });
}
/** Regions of an exercise / figure: its own, else the picture's (docs/VISUAL.md §3). */
const vRegions = (ex, m) => (Array.isArray(ex.regions) ? ex.regions : (m && m.regions) || []);
const vTargets = (ex, regs) => (ex.targets ? ex.targets.map(id => regs.find(r => r.id === id)).filter(Boolean) : regs);

/* ---------- typed answers: exact / alias / one small typo ---------- */
function lev(a, b) { const m = a.length, n = b.length; if (!m || !n) return m + n; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
function labelMatch(r, val, fuzzy = true) {
  const v = norm(val); if (!v) return { ok: false };
  const alts = [r.label, ...(r.accept || [])].map(norm);
  if (alts.includes(v)) return { ok: true };
  if (fuzzy) for (const a of alts) if (a.length >= 4 && lev(a, v) <= Math.max(1, Math.floor(a.length / 7))) return { ok: true, typo: true };
  return { ok: false };
}

/** Attribution line: author · licence · link to the original (required by CC BY / Apache-2.0). */
function vCredit(m) {
  if (!m.credit) return null;
  const txt = m.credit + (m.license && m.license !== 'own' ? ' · ' + m.license : '');
  return /^https?:\/\//.test(m.url || '') ? h('a', { class: 'tiny vx-credit', href: m.url, target: '_blank', rel: 'noopener', title: 'Where this picture comes from' }, txt + ' ↗') : h('span', { class: 'tiny vx-credit' }, txt);
}
/* ---------- the stage: picture + SVG overlay + positioned controls ---------- */
function vStage(ex, { regions } = {}) {
  const m = MEDIA[ex.media];
  if (!m) return { missing: true, el: h('div', { class: 'fb bad' }, `🖼️ Picture “${ex.media}” is missing from this subject pack.`) };
  const W = m.w, H = m.h;
  const regs = regions || vRegions(ex, m);
  const RG = Object.fromEntries(regs.map(r => [r.id, r]));
  const img = h('img', { src: m.data || m.url, referrerpolicy: 'no-referrer', alt: m.alt || '', draggable: 'false', class: 'vx-img' });
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vx-svg', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const gOut = sv('g'), gMask = sv('g'), gTop = sv('g'); svg.append(gOut, gMask, gTop);
  const layer = h('div', { class: 'vx-layer' });
  const stage = h('div', { class: 'vx-stage', style: { aspectRatio: `${W} / ${H}`, maxWidth: `min(${m.mime === 'image/svg+xml' ? '100%' : W + 'px'}, calc(76vh * ${(W / H).toFixed(4)}))` }   /* tall pictures fit on screen; ⤢ for more */ }, img, svg, layer);
  stage.style.setProperty('--ar', String(W / H));
  const below = h('div', { class: 'vx-below' });
  const zoomBtn = h('button', { class: 'iconbtn vx-zoom', title: 'Bigger picture (Esc to close)', 'aria-label': 'Toggle full screen picture', onclick: () => toggleFull() }, '⤢');
  const wrap = h('div', { class: 'vx' }, h('div', { class: 'vx-tools' }, vCredit(m), h('span', { class: 'grow' }), zoomBtn), stage, below);
  // Full screen: the picture moves to <body> (an animated/transformed ancestor would otherwise trap position:fixed)
  // and comes back to its placeholder afterwards; the accent colours travel with it.
  let holder = null;
  function toggleFull(on = !wrap.classList.contains('full')) {
    if (on === wrap.classList.contains('full')) return;
    if (on) {
      const cs = getComputedStyle(wrap); wrap.style.setProperty('--c', cs.getPropertyValue('--c')); wrap.style.setProperty('--c-bg', cs.getPropertyValue('--c-bg'));
      holder = document.createComment('vx'); wrap.replaceWith(holder); document.body.append(wrap);
    } else if (holder) { holder.replaceWith(wrap); holder = null; }
    wrap.classList.toggle('full', on); document.body.classList.toggle('vx-noscroll', on); zoomBtn.textContent = on ? '✕' : '⤢';
    requestAnimationFrame(layoutAll);
  }
  wrap._exitFull = () => toggleFull(false);
  const pos = (x, y) => ({ left: (x / W * 100) + '%', top: (y / H * 100) + '%' });
  const toImg = ev => { const b = stage.getBoundingClientRect(); return [(ev.clientX - b.left) / b.width * W, (ev.clientY - b.top) / b.height * H]; };
  const masks = {};
  function mask(id, on = true, cls = '') {
    const r = RG[id]; if (!r) return;
    if (!masks[id]) { masks[id] = rShape(r, 'vx-mask ' + cls, 2); masks[id].dataset.rid = id; gMask.append(masks[id]); }
    masks[id].classList.toggle('off', !on);
    return masks[id];
  }
  const outline = (id, cls) => { const r = RG[id]; if (!r) return; const e = rShape(r, 'vx-out ' + cls, 3); gOut.append(e); return e; };
  const tag = (id, text, cls = '') => { const r = RG[id]; if (!r) return; const [x, y] = rCenter(r); const t = h('span', { class: 'vx-tag ' + cls, style: pos(x, y) }, text); layer.append(t); return t; };
  /** Regions containing the point, smallest first (so nested parts win). */
  const hits = (x, y, among = regs) => among.filter(r => rHit(r, x, y)).sort((a, b) => rArea(a) - rArea(b));
  const layouts = [];
  let crowded = false;      // controls would overlap on the picture → list them under it instead
  const narrow = () => !wrap.classList.contains('full') && stage.clientWidth > 0 && stage.clientWidth < 540;
  const compact = () => narrow() || crowded;
  function layoutAll() {
    crowded = false; wrap.classList.toggle('compact', narrow());
    layouts.forEach(f => f());
    wrap.classList.toggle('compact', compact());
  }
  if (window.ResizeObserver) new ResizeObserver(() => layoutAll()).observe(stage);
  /** Highlight the part under the pointer (pointer-events stay on the stage). */
  function hover(among) {
    const shapes = among.slice().sort((a, b) => rArea(b) - rArea(a)).map(r => { const e = rShape(r, 'vx-hov'); e.dataset.rid = r.id; gTop.append(e); return e; });
    const set = rid => shapes.forEach(e => e.classList.toggle('hl', e.dataset.rid === rid));
    stage.addEventListener('mousemove', ev => { const [x, y] = toImg(ev); set(hits(x, y, among)[0]?.id); });
    stage.addEventListener('mouseleave', () => set(null));
    shapes.set = set;
    return shapes;
  }
  /** Keyboard answering (TD-3): arrows move a crosshair (Shift = fine steps), Enter/Space taps, Backspace undoes.
      Keys are kept away from the card's global shortcuts while the picture has focus. */
  function keyboard({ tap, undo, describe }) {
    stage.tabIndex = 0; stage.setAttribute('role', 'application');
    stage.setAttribute('aria-label', 'Picture. Arrow keys move the crosshair (Shift for small steps), Enter or Space taps, Backspace removes the last tap.');
    const cross = h('span', { class: 'vx-cross', 'aria-hidden': 'true' }); layer.append(cross);
    const live = h('span', { class: 'vx-sr', 'aria-live': 'polite' }); wrap.append(live);
    let cx = W / 2, cy = H / 2, shown = false;
    const say = t => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 20); };
    const show = () => { Object.assign(cross.style, pos(cx, cy)); cross.classList.add('on'); shown = true; if (describe) say(describe(cx, cy)); };
    stage.addEventListener('keydown', e => {
      const k = e.key, f = e.shiftKey ? 0.01 : 0.04;
      const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (mv) { e.preventDefault(); e.stopPropagation(); if (shown) { cx = Math.min(W, Math.max(0, cx + mv[0] * W * f)); cy = Math.min(H, Math.max(0, cy + mv[1] * H * f)); } show(); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); e.stopPropagation(); if (!shown) return show(); const t = tap(cx, cy, true); if (t) say(t); return; }
      if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); e.stopPropagation(); const t = undo(); if (t) say(t); }
    });
    stage.addEventListener('blur', () => { cross.classList.remove('on'); shown = false; });
    stage.addEventListener('mousedown', () => { cross.classList.remove('on'); shown = false; });
  }
  return { m, W, H, regs, RG, el: wrap, hover, keyboard, wrap, stage, svg, gTop, layer, below, pos, toImg, mask, masks, outline, tag, hits, compact, onLayout: f => { layouts.push(f); f(); }, relayout: layoutAll, setCrowded: () => { crowded = true; } };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.vx.full').forEach(w => w._exitFull?.()); });
addEventListener('hashchange', () => $$('.vx.full').forEach(w => w._exitFull?.()));

/** One control per target region: on the picture when there is room, else in a numbered list under it. */
function vSlots(st, targets, makeCtl) {
  const list = h('div', { class: 'vx-list' });
  const slots = targets.map((r, k) => {
    const [x, y] = rCenter(r);
    const s = { r, k, ctl: makeCtl(r, k) };
    s.pin = h('div', { class: 'vx-pin', style: st.pos(x, y) });
    s.marker = h('span', { class: 'vx-num vx-marker', style: st.pos(x, y) }, k + 1);
    s.row = h('div', { class: 'vx-row' }, h('span', { class: 'vx-num' }, k + 1));
    st.layer.append(s.pin, s.marker); list.append(s.row);
    return s;
  });
  st.below.append(list);
  const put = c => slots.forEach(s => { const dst = c ? s.row : s.pin; if (s.ctl.parentElement !== dst) dst.append(s.ctl); });
  st.onLayout(() => {
    if (st.compact()) return put(true);
    put(false);
    if (vOverlap(slots.map(s => s.ctl), st.stage)) { st.setCrowded(); put(true); }
  });
  return { list, slots };
}
/** True if any two controls overlap, or one sticks out of the picture (only measurable once on screen). */
function vOverlap(els, stage) {
  const sb = stage.getBoundingClientRect(); if (!sb.width) return false;
  const R = els.map(e => e.getBoundingClientRect());
  if (R.some(r => r.left < sb.left - 4 || r.right > sb.right + 4 || r.top < sb.top - 4 || r.bottom > sb.bottom + 4)) return true;
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.left < b.right + 2 && b.left < a.right + 2 && a.top < b.bottom + 2 && b.top < a.bottom + 2) return true; }
  return false;
}
/** Result list after checking (label / select / drag). */
function vResults(rows) {
  return h('div', { class: 'vx-results' }, ...rows.map(({ k, r, ok, typo, given }) => h('div', { class: 'vx-res ' + (ok ? 'ok' : 'bad') },
    h('span', { class: 'vx-num' }, k + 1), h('b', {}, ok ? '✓' : '✗'), ' ', F(r.label),
    !ok ? h('span', { class: 'muted' }, given ? ` — you: “${given}”` : ' — left empty') : typo ? h('span', { class: 'muted' }, ` — accepted “${given}” (spelling: ${r.label})`) : null,
    r.note ? h('div', { class: 'tiny', html: fmt(r.note) }) : null)));
}
const vHint = text => h('div', { class: 'tiny vx-hint' }, text);
const vFail = st => ({ el: st.el, check: () => null });

/* ---------- 📍 hotspot: tap the place(s) ---------- */
R.img_hotspot = (ex, api) => {
  const st = vStage(ex); if (st.missing) return vFail(st);
  const ans = ex.answer.map(id => st.RG[id]).filter(Boolean);
  const any = !!ex.any;                       // any: one tap inside ANY of the answer regions is enough
  const multi = !any && (ans.length > 1 || !!ex.multi);
  if (ex.maskLabels) st.regs.forEach(r => st.mask(r.id, true, 'plain'));
  const pins = [];
  st.stage.classList.add('vx-aim');
  const inAns = p => ans.filter(r => rHit(r, p.x, p.y));
  function drop(p) { p.el.remove(); pins.splice(pins.indexOf(p), 1); pins.forEach((q, i) => { if (multi) q.el.textContent = i + 1; }); }
  // Pins never catch the tap themselves (on a small picture they would cover the neighbouring part):
  // a tap within ~10 screen px of an existing pin removes that pin, anywhere else adds one.
  function tapAt(x, y) {
    if (api.locked()) return '';
    const sb = st.stage.getBoundingClientRect(), sx = sb.width / st.W, sy = sb.height / st.H;
    const near = pins.find(q => Math.hypot((q.x - x) * sx, (q.y - y) * sy) <= 10);
    if (near) { drop(near); beep('tap'); return 'Pin removed.'; }
    if (!multi) pins.slice().forEach(drop);
    const p = { x, y };
    p.el = h('span', { class: 'vx-pick', style: st.pos(x, y) }, multi ? pins.length + 1 : '');
    pins.push(p); st.layer.append(p.el); beep('tap');
    return multi ? `Pin ${pins.length} of ${ans.length} placed.` : 'Pin placed. Press Tab to reach the Check button.';
  }
  st.stage.addEventListener('click', ev => tapAt(...st.toImg(ev)));
  const where = (x, y) => `${['left', 'centre', 'right'][Math.min(2, Math.floor(3 * x / st.W))]} ${['top', 'middle', 'bottom'][Math.min(2, Math.floor(3 * y / st.H))]} (${Math.round(100 * x / st.W)}%, ${Math.round(100 * y / st.H)}%)`;
  st.keyboard({ tap: tapAt, undo: () => { if (api.locked() || !pins.length) return ''; drop(pins[pins.length - 1]); return 'Last pin removed.'; }, describe: where });
  st.below.prepend(vHint(multi ? `Tap ${ans.length} places on the picture (tap a pin again to remove it). Small picture? ⤢ makes it bigger. ⌨️ Tab to the picture, arrows + Enter.` : any ? 'Tap one right place on the picture (several are right) — then Check. ⌨️ arrows + Enter.' : 'Tap the right place on the picture — then Check. ⌨️ Tab to the picture, arrows move, Enter taps.'));
  return {
    el: st.el,
    check() {
      if (!pins.length) return null;
      if (multi && pins.length < ans.length) return null;
      return pins.every(p => inAns(p).length) && (any || ans.every(r => pins.some(p => rHit(r, p.x, p.y))));
    },
    reveal() {
      Object.values(st.masks).forEach(e => e.classList.add('off'));
      ans.forEach(r => { st.outline(r.id, 'right'); if (r.label) st.tag(r.id, r.label, 'right'); });
      const notes = [];
      pins.forEach(p => {
        const ok = inAns(p).length > 0; p.el.classList.add(ok ? 'right' : 'wrong');
        if (!ok) { const r = st.hits(p.x, p.y)[0]; if (r) { st.outline(r.id, 'wrong'); if (ex.why?.[r.id]) notes.push(h('div', { html: `❌ <b>${esc(r.label || r.id)}</b>: ` + fmt(ex.why[r.id]) })); } }
      });
      if (notes.length) st.below.append(h('div', { class: 'fb bad' }, ...notes));
    },
  };
};

/* ---------- 🧭 sequence: tap the parts in order ---------- */
R.img_sequence = (ex, api) => {
  const st = vStage(ex); if (st.missing) return vFail(st);
  const among = vTargets(ex, st.regs);
  const picks = [];
  st.stage.classList.add('vx-aim');
  const hov = st.hover(among);
  const badges = {};
  function draw() {
    Object.values(badges).forEach(b => b.remove());
    picks.forEach((r, i) => { const [x, y] = rCenter(r); badges[r.id] = h('span', { class: 'vx-num vx-step', style: st.pos(x, y) }, i + 1); st.layer.append(badges[r.id]); });
    $$('.vx-hov', st.svg).forEach(e => e.classList.toggle('on', picks.some(r => r.id === e.dataset.rid)));
    counter.textContent = `${picks.length} / ${ex.answer.length} steps`;
  }
  const counter = h('b', {});
  function tapAt(x, y) {
    if (api.locked()) return '';
    const r = st.hits(x, y, among)[0];
    if (!r) { st.stage.classList.remove('vx-miss'); void st.stage.offsetWidth; st.stage.classList.add('vx-miss'); return 'No part here.'; }
    const i = picks.indexOf(r);
    if (i >= 0) picks.splice(i); else if (picks.length < ex.answer.length) { picks.push(r); beep('tap'); }
    draw();
    return i >= 0 ? `Removed from step ${i + 1} on.` : `Step ${picks.length}: ${r.label || r.id}.`;
  }
  st.stage.addEventListener('click', ev => tapAt(...st.toImg(ev)));
  st.keyboard({ tap: tapAt, undo: () => { if (api.locked() || !picks.length) return ''; picks.pop(); draw(); return 'Last step removed.'; },
    describe: (x, y) => { const r = st.hits(x, y, among)[0]; hov.set(r?.id); return r ? (r.label || r.id) + (picks.includes(r) ? ` (step ${picks.indexOf(r) + 1})` : '') : 'No part here.'; } });
  st.below.prepend(h('div', { class: 'tiny vx-hint' }, 'Tap the parts in the right order. Tap a numbered part again to undo from there. ⌨️ arrows + Enter, Backspace undoes. · ', counter));
  draw();
  return {
    el: st.el,
    check: () => picks.length < ex.answer.length ? null : picks.every((r, i) => r.id === ex.answer[i]),
    reveal() {
      picks.forEach((r, i) => badges[r.id]?.classList.add(r.id === ex.answer[i] ? 'right' : 'wrong'));
      if (!picks.every((r, i) => r.id === ex.answer[i])) st.below.append(h('div', { class: 'fb info' }, h('b', {}, '🧭 Correct path: '), ...ex.answer.flatMap((id, i) => [i ? ' → ' : '', h('span', { class: 'vx-chipref' }, `${i + 1}. ${st.RG[id]?.label || id}`)])));
    },
  };
};

/* ---------- 🧩 reveal: uncover tiles, answer early ---------- */
R.img_reveal = (ex, api) => {
  let tiles;
  const m = MEDIA[ex.media];
  if (ex.grid && m) { const [c, rr] = ex.grid; tiles = []; for (let j = 0; j < rr; j++) for (let i = 0; i < c; i++) tiles.push({ id: `t${j * c + i}`, shape: 'rect', x: i * m.w / c, y: j * m.h / rr, w: m.w / c, h: m.h / rr, rx: 0 }); }
  const st = vStage(ex, tiles ? { regions: tiles } : {}); if (st.missing) return vFail(st);
  const T = st.regs; const start = new Set(ex.start || []);
  let opened = 0;
  T.forEach((r, i) => {
    if (start.has(r.id)) return;
    const e = st.mask(r.id, true, 'tile c' + (i % 6)); e.setAttribute('tabindex', '0');
    const open = () => { if (e.classList.contains('off')) return; e.classList.add('off'); opened++; beep('tap'); count(); };
    e.addEventListener('click', open); e.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
  });
  const hidden = T.length - start.size;
  const counter = h('b', {});
  const count = () => { counter.textContent = `🔍 ${opened} / ${hidden} tiles opened`; };
  count();
  const mc = R.mcq({ ...ex, type: 'mcq' }, api);
  st.below.append(h('div', { class: 'tiny vx-hint' }, counter, ' · tap tiles to uncover the picture — answer as early as you dare: fewer tiles = more XP'), mc.el);
  return {
    el: st.el, auto: !(ex.multi || (Array.isArray(ex.answer) && ex.answer.length > 1)), keys: mc.keys,
    check: mc.check,
    reveal() { mc.reveal(); Object.values(st.masks).forEach(e => e.classList.add('off')); },
    bonus: () => Math.round(6 * (hidden - opened) / Math.max(1, hidden)),
  };
};

/* ---------- 🏷️ drag: drop the label chips on the covered parts ---------- */
function vDraggable(el, onDrop, { enabled = () => true, onMiss = null } = {}) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !enabled()) return;
    const sx = e.clientX, sy = e.clientY; let ghost = null;
    const target = ev => document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.vx-drop');
    const move = ev => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!ghost) { ghost = el.cloneNode(true); ghost.classList.add('vx-ghost'); document.body.append(ghost); el.classList.add('dragging'); }
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
      $$('.vx-drop.hot').forEach(z => z.classList.remove('hot')); target(ev)?.classList.add('hot');
    };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('blur', up);
      if (!ghost) return;
      ghost.remove(); el.classList.remove('dragging'); $$('.vx-drop.hot').forEach(z => z.classList.remove('hot'));
      el._justDragged = true; setTimeout(() => { el._justDragged = false; }, 50);
      const z = ev.type === 'pointerup' ? target(ev) : null;
      if (z && z !== el) onDrop(z); else if (!z && onMiss) onMiss();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('blur', up);
  });
}
R.img_drag = (ex, api) => {
  const st = vStage(ex); if (st.missing) return vFail(st);
  const targets = vTargets(ex, st.regs);
  if (ex.mask !== false) targets.forEach(r => st.mask(r.id, true));
  const chips = shuffle([...targets.map(r => r.label), ...(ex.distractors || [])]).map((text, i) => ({ text, i }));
  const zoneW = Math.min(170, 26 + Math.max(...chips.map(c => c.text.length)) * 7.4);   // fits any label → layout check stays valid
  const place = new Map();            // slot k -> chip
  let sel = null;
  const bank = h('div', { class: 'pool vx-bank' });
  const { slots } = vSlots(st, targets, (r, k) => {
    const z = h('button', { class: 'vx-drop', 'data-k': k, 'aria-label': `Drop zone ${k + 1}`, style: { minWidth: zoneW + 'px' }, onclick: e => { e.stopPropagation(); if (!z._justDragged) tapZone(k); } });
    // a placed label can be dragged on to another place, or off the picture back to the bank
    vDraggable(z, to => { if (!api.locked() && place.has(k)) put(+to.dataset.k, place.get(k)); }, { enabled: () => !api.locked() && place.has(k), onMiss: () => { if (!api.locked()) { place.delete(k); draw(); } } });
    return z;
  });
  function put(k, chip) { for (const [kk, c] of [...place]) if (c === chip) place.delete(kk); place.set(k, chip); sel = null; beep('tap'); draw(); }
  function tapZone(k) {
    if (api.locked()) return;
    if (sel) return put(k, sel);
    if (place.has(k)) { sel = place.get(k); place.delete(k); draw(); }
  }
  function chipEl(c) {
    const b = h('button', { class: 'chipx vx-chip' + (sel === c ? ' sel' : ''), onclick: e => { e.stopPropagation(); if (api.locked() || b._justDragged) return; sel = sel === c ? null : c; draw(); } }, c.text);
    vDraggable(b, z => { if (!api.locked()) put(+z.dataset.k, c); });
    return b;
  }
  function draw() {
    bank.innerHTML = '';
    const used = new Set(place.values());
    chips.filter(c => !used.has(c)).forEach(c => bank.append(chipEl(c)));
    if (!bank.children.length) bank.append(h('span', { class: 'tiny' }, 'All placed — check it! (tap a placed label to move it)'));
    slots.forEach(s => { const c = place.get(s.k); s.ctl.textContent = c ? c.text : '?'; s.ctl.title = c ? c.text : ''; s.ctl.classList.toggle('filled', !!c); s.ctl.classList.toggle('hot', !!sel && !c); });
  }
  st.below.prepend(vHint('Drag each label onto its place — or tap a label, then tap the place.'), bank);
  draw();
  const okAt = s => !!place.get(s.k) && norm(place.get(s.k).text) === norm(s.r.label);
  return {
    el: st.el,
    check: () => place.size < slots.length ? null : slots.every(okAt),
    reveal() {
      Object.values(st.masks).forEach(e => e.classList.add('off'));
      slots.forEach(s => { const ok = okAt(s); s.ctl.classList.add(ok ? 'right' : 'wrong'); st.outline(s.r.id, ok ? 'right' : 'wrong'); });
      bank.remove();
      st.below.append(vResults(slots.map(s => ({ k: s.k, r: s.r, ok: okAt(s), given: place.get(s.k)?.text }))));
    },
  };
};

/* ---------- ✏️ label: type the names ---------- */
R.img_label = (ex, api) => {
  const st = vStage(ex); if (st.missing) return vFail(st);
  const targets = vTargets(ex, st.regs);
  if (ex.mask !== false) targets.forEach(r => st.mask(r.id, true));
  const { slots } = vSlots(st, targets, (r, k) => h('input', { class: 'vx-input', placeholder: `${k + 1} ?`, 'aria-label': `Name of part ${k + 1}`, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); const nx = slots[k + 1]; if (nx) nx.ctl.focus(); else api.check(); } } }));
  st.below.prepend(vHint('Type the name of each numbered part. Enter → next.'));
  const res = s => labelMatch(s.r, s.ctl.value, ex.fuzzy !== false);
  return {
    el: st.el, focus: () => !st.compact() && slots[0]?.ctl.focus({ preventScroll: true }),
    check: () => slots.some(s => !s.ctl.value.trim()) ? null : slots.every(s => res(s).ok),
    reveal() {
      Object.values(st.masks).forEach(e => e.classList.add('off'));
      slots.forEach(s => { const r = res(s); s.ctl.readOnly = true; s.ctl.classList.add(r.ok ? 'right' : 'wrong'); st.outline(s.r.id, r.ok ? 'right' : 'wrong'); });
      st.below.append(vResults(slots.map(s => ({ k: s.k, r: s.r, ...res(s), given: s.ctl.value.trim() }))));
    },
  };
};

/* ---------- 🔽 select: dropdown per part ---------- */
R.img_select = (ex, api) => {
  const st = vStage(ex); if (st.missing) return vFail(st);
  const targets = vTargets(ex, st.regs);
  if (ex.mask !== false) targets.forEach(r => st.mask(r.id, true));
  const shared = [...new Set([...targets.map(r => r.label), ...(ex.distractors || [])])].sort((a, b) => a.localeCompare(b));
  const { slots } = vSlots(st, targets, (r, k) => h('select', { class: 'vx-select', 'aria-label': `Part ${k + 1}` }, h('option', { value: '' }, `${k + 1} · choose…`), ...(r.options || shared).map(o => h('option', { value: o }, o))));
  st.below.prepend(vHint('Choose the right name at every numbered part.'));
  const okAt = s => norm(s.ctl.value) === norm(s.r.label);
  return {
    el: st.el,
    check: () => slots.some(s => !s.ctl.value) ? null : slots.every(okAt),
    reveal() {
      Object.values(st.masks).forEach(e => e.classList.add('off'));
      slots.forEach(s => { const ok = okAt(s); s.ctl.disabled = true; s.ctl.classList.add(ok ? 'right' : 'wrong'); st.outline(s.r.id, ok ? 'right' : 'wrong'); });
      st.below.append(vResults(slots.map(s => ({ k: s.k, r: s.r, ok: okAt(s), given: s.ctl.value }))));
    },
  };
};

/* ---------- 🙈 occlusion: one covered part at a time, recall, reveal, rate ---------- */
R.img_occlusion = (ex, api) => {
  const st = vStage(ex); if (st.missing) return vFail(st);
  const targets = ex.order === 'random' ? shuffle(vTargets(ex, st.regs)) : vTargets(ex, st.regs);
  targets.forEach((r, k) => { st.mask(r.id, true, 'occ'); });
  const nums = targets.map((r, k) => { const [x, y] = rCenter(r); const n = h('span', { class: 'vx-num vx-marker always', style: st.pos(x, y) }, k + 1); st.layer.append(n); return n; });
  let k = 0, knew = 0; const marks = [];
  const panel = h('div', { class: 'vx-occ' });
  function focusOn() {
    targets.forEach((r, i) => { st.masks[r.id].classList.toggle('cur', i === k); nums[i].classList.toggle('cur', i === k); });
    panel.innerHTML = '';
    if (k >= targets.length) return finish();
    const r = targets[k];
    const revealBtn = h('button', { class: 'btn primary', onclick: show }, '👁 Reveal');
    panel.append(h('div', { class: 'vx-occq' }, h('span', { class: 'vx-num' }, k + 1), h('span', { html: fmt(r.q || 'What is hidden here? Say it (or think it) first.') })), h('div', { class: 'actions' }, revealBtn, h('span', { class: 'tiny' }, `${k + 1} / ${targets.length}`)));
    st.masks[r.id].onclick = () => !api.locked() && show();
    setTimeout(() => revealBtn.focus({ preventScroll: true }), 30);
  }
  function show() {
    const r = targets[k]; if (!r || st.masks[r.id].classList.contains('off')) return;
    st.masks[r.id].classList.add('off'); nums[k].classList.add('seen');
    panel.innerHTML = '';
    const rate = ok => { marks[k] = ok; if (ok) knew++; nums[k].classList.add(ok ? 'right' : 'wrong'); st.outline(r.id, ok ? 'right' : 'wrong'); beep(ok ? 'ok' : 'bad'); k++; focusOn(); };
    panel.append(h('div', { class: 'vx-occq' }, h('span', { class: 'vx-num' }, k + 1), h('b', { html: fmt(r.label) }), r.note ? h('div', { class: 'tiny', html: fmt(r.note) }) : null),
      h('div', { class: 'actions' }, h('button', { class: 'btn small vx-yes', onclick: () => rate(true) }, '✓ I knew it'), h('button', { class: 'btn small vx-no', onclick: () => rate(false) }, '✗ I didn’t')));
  }
  function finish() {
    const pass = ex.pass ?? 0.8, score = knew / targets.length;
    panel.append(h('div', { class: 'fb ' + (score >= pass ? 'ok' : 'bad') }, h('b', {}, `You recalled ${knew} / ${targets.length}. `), score >= pass ? 'Strong!' : 'These come back soon in your review.'));
    api.done(score >= pass);
  }
  st.below.append(panel);
  focusOn();
  return { el: st.el, selfDone: true };
};

/* ---------- figure block (theory): explorable picture ---------- */
function figureBlock(b) {
  const st = vStage(b); if (st.missing) return st.el;
  const regs = st.regs;
  const box = h('figure', { class: 'vx-fig' }, st.el);
  const cap = b.caption || st.m.caption;
  if (regs.length && b.explore !== false) {
    st.hover(regs);
    const tipEl = h('div', { class: 'vx-tip' });
    st.layer.append(tipEl);
    let pinned = null;
    const showTip = (r, x, y) => { tipEl.innerHTML = ''; tipEl.append(h('b', { html: fmt(r.label || r.id) }), r.note ? h('div', { html: fmt(r.note) }) : null); Object.assign(tipEl.style, st.pos(x, y)); tipEl.classList.add('on'); tipEl.classList.toggle('below', y < st.H * 0.3); };
    st.stage.addEventListener('mousemove', ev => { if (pinned) return; const [x, y] = st.toImg(ev); const r = st.hits(x, y)[0]; r ? showTip(r, ...rCenter(r)) : tipEl.classList.remove('on'); });
    st.stage.addEventListener('mouseleave', () => { if (!pinned) tipEl.classList.remove('on'); });
    st.stage.addEventListener('click', ev => {
      const [x, y] = st.toImg(ev); const r = st.hits(x, y)[0];
      const m = r && st.masks[r.id];
      if (m && !m.classList.contains('off')) { m.classList.add('off'); return; }
      pinned = r && pinned !== r ? r : null;
      pinned ? showTip(r, ...rCenter(r)) : tipEl.classList.remove('on');
    });
    st.keyboard({   // keyboard exploring: arrows move, the part under the crosshair is shown and announced; Enter peeks under a cover
      tap: (x, y) => { const r = st.hits(x, y)[0]; const m = r && st.masks[r.id]; if (m && !m.classList.contains('off')) { m.classList.add('off'); return 'Uncovered: ' + (r.label || r.id); } return r ? (r.label || r.id) + (r.note ? '. ' + r.note : '') : 'Nothing here.'; },
      undo: () => '',
      describe: (x, y) => { const r = st.hits(x, y)[0]; if (r) showTip(r, ...rCenter(r)); else tipEl.classList.remove('on'); return r ? (r.label || r.id) : 'Nothing here.'; } });
    const named = regs.filter(r => r.label && !/-area$/.test(r.id));
    let hidden = false;
    const hideBtn = h('button', { class: 'btn small ghost', onclick: () => { hidden = !hidden; named.forEach(r => st.mask(r.id, hidden)); hideBtn.textContent = hidden ? '👀 Show labels' : '🙈 Hide labels'; } }, '🙈 Hide labels');
    st.below.append(h('div', { class: 'row vx-figbar' }, h('span', { class: 'tiny grow' }, '👆 Hover or tap a part to see what it is. Hide the labels to test yourself, then tap a cover to peek.'), named.length ? hideBtn : null));
  }
  if (cap) box.append(h('figcaption', { class: 'caption', html: fmt(cap) }));
  return box;
}

/* ---------- text versions (tutor context, search) ---------- */
function visualAsText(ex) {
  const m = MEDIA[ex.media] || {}; const regs = vRegions(ex, m); const L = id => (regs.find(r => r.id === id) || {}).label || id;
  let t = `Picture: ${m.alt || ex.media}${m.caption ? ' — ' + m.caption : ''}\n`;
  const named = vTargets(ex, regs).filter(r => r.label);
  if (named.length) t += 'Labeled parts: ' + named.map(r => r.label + (r.note ? ` (${r.note})` : '')).join('; ') + '\n';
  if (ex.type === 'img_hotspot') t += 'Correct place(s): ' + ex.answer.map(L).join(', ') + '\n';
  if (ex.type === 'img_sequence') t += 'Correct order: ' + ex.answer.map(L).join(' → ') + '\n';
  if (ex.distractors?.length) t += 'Distractor labels: ' + ex.distractors.join(', ') + '\n';
  return t;
}
function figureAsText(b) { const m = MEDIA[b.media] || {}; const regs = vRegions(b, m).filter(r => r.label && !/-area$/.test(r.id)); return `[FIGURE] ${m.alt || b.media}${(b.caption || m.caption) ? ' — ' + (b.caption || m.caption) : ''}${regs.length ? '\nParts: ' + regs.map(r => r.label + (r.note ? ': ' + r.note : '')).join('; ') : ''}`; }
