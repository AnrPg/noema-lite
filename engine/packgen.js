/* noema-lite — builds a subject pack IN THE BROWSER with Gemini (the free key), for curriculum nodes when no
   Claude API key is available. (With a Claude key, nodes are built by the noema-pack-builder skill instead —
   engine/claude.js — which adds web pictures and function graphs.)
     1. research   — Gemini + Google Search: a fact-dense brief of the node from authoritative sources
     2. subject    — title, emoji, hero, tutor persona…
     3. chapters   — one call per planned chapter, in the app's own JSON format (tools/CONTENT_SPEC.md):
                     theory blocks, debug playbooks, pitfalls, flashcards and many exercise types, plus
                     1–2 diagrams drawn by the diagram kit below (SVG + clickable regions) with picture exercises
   Every chapter is checked by engine/packcheck.js (strict) + quantity rules; problems go back to Gemini
   for repair. Progress is saved after every step (IndexedDB), so generation resumes after a reload. */
window.NoemaPackGen = (() => {
  const L = () => window.NoemaLLM;

  /* ======================= diagram kit (JS cousin of tools/svgkit.py) ======================= */
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FILL = ['#eef2ff', '#ecfdf5', '#fff7ed', '#fdf2f8', '#f0f9ff', '#fefce8', '#f5f3ff', '#f1f5f9'];
  const STROKE = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#ca8a04', '#8b5cf6', '#64748b'];
  function wrap(t, max = 18, lines = 3) {
    const words = String(t || '').split(/\s+/); const out = [];
    let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) out.push(cur);
    if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/.{0,1}$/, '…'); }
    return out;
  }
  function box(x, y, w, h, label, i, extra = '') {
    const ls = wrap(label, Math.max(8, Math.floor(w / 9.2)), Math.max(1, Math.floor((h - 10) / 19)));
    const fs = ls.some(l => l.length > w / 8.6) ? 14 : 16;
    const ty = y + h / 2 - (ls.length - 1) * 9.5;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${FILL[i % 8]}" stroke="${STROKE[i % 8]}" stroke-width="2.5" ${extra}/>` +
      ls.map((l, k) => `<text x="${x + w / 2}" y="${ty + k * 19}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="#1e293b" font-family="Helvetica, Arial, sans-serif" font-weight="600">${esc(l)}</text>`).join('');
  }
  function arrow(x1, y1, x2, y2, label) {
    const a = Math.atan2(y2 - y1, x2 - x1), hx = x2 - 12 * Math.cos(a), hy = y2 - 12 * Math.sin(a);
    const head = `<polygon points="${x2},${y2} ${hx - 6 * Math.sin(a)},${hy + 6 * Math.cos(a)} ${hx + 6 * Math.sin(a)},${hy - 6 * Math.cos(a)}" fill="#475569"/>`;
    const lab = label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" font-size="13" text-anchor="middle" fill="#334155" font-family="Helvetica, Arial, sans-serif" paint-order="stroke" stroke="#fff" stroke-width="4">${esc(String(label).slice(0, 28))}</text>` : '';
    return `<line x1="${x1}" y1="${y1}" x2="${hx}" y2="${hy}" stroke="#475569" stroke-width="2.2"/>${head}${lab}`;
  }
  /** spec: { id, kind: flow|cycle|hub|layers|tree|compare, title, alt, items:[{id,label,note,parent,group}], links:[[from,to,label]], groups:[a,b] } */
  function render(spec) {
    const W = 800, items = spec.items || [], regs = []; let body = '', H = 520;
    const at = new Map();
    const put = (it, i, x, y, w, h) => { body += box(x, y, w, h, it.label, i); at.set(it.id, { x, y, w, h }); regs.push({ id: it.id, shape: 'rect', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rx: 12, label: it.label, ...(it.note ? { note: it.note } : {}) }); };
    const top = spec.title ? 64 : 24;
    const k = spec.kind;
    if (k === 'flow') {
      const per = items.length <= 4 ? items.length : Math.ceil(items.length / Math.ceil(items.length / 4));
      const rows = Math.ceil(items.length / per), bw = Math.min(170, (W - 60 - (per - 1) * 40) / per), bh = 78;
      H = top + rows * (bh + 60) + 10;
      items.forEach((it, i) => { const r = Math.floor(i / per), cIdx = r % 2 ? per - 1 - (i % per) : i % per; put(it, i, 30 + cIdx * (bw + 40) + (W - 60 - per * bw - (per - 1) * 40) / 2, top + r * (bh + 60), bw, bh); });
      for (let i = 0; i + 1 < items.length; i++) { const a = at.get(items[i].id), b = at.get(items[i + 1].id); if (Math.abs(a.y - b.y) < 1) body += arrow(a.x < b.x ? a.x + a.w : a.x, a.y + a.h / 2, a.x < b.x ? b.x : b.x + b.w, b.y + b.h / 2); else body += arrow(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y); }
    } else if (k === 'cycle' || k === 'hub') {
      const ring = k === 'hub' ? items.slice(1) : items, n = ring.length, cx = W / 2; H = Math.max(520, top + 420); const cy = top + (H - top) / 2 - 10, R = Math.min(210, (H - top) / 2 - 50), bw = 150, bh = 66;
      if (k === 'hub') put(items[0], 0, cx - 90, cy - 40, 180, 80);
      ring.forEach((it, i) => { const t = -Math.PI / 2 + i * 2 * Math.PI / n; put(it, i + 1, cx + R * 1.45 * Math.cos(t) - bw / 2, cy + R * Math.sin(t) - bh / 2, bw, bh); });
      if (k === 'cycle') ring.forEach((it, i) => { const a = at.get(it.id), b = at.get(ring[(i + 1) % n].id); const ac = [a.x + a.w / 2, a.y + a.h / 2], bc = [b.x + b.w / 2, b.y + b.h / 2]; const d = Math.hypot(bc[0] - ac[0], bc[1] - ac[1]), ux = (bc[0] - ac[0]) / d, uy = (bc[1] - ac[1]) / d; body += arrow(ac[0] + ux * 70, ac[1] + uy * 36, bc[0] - ux * 70, bc[1] - uy * 36); });
      else ring.forEach(it => { const b = at.get(it.id), bc = [b.x + b.w / 2, b.y + b.h / 2]; const d = Math.hypot(bc[0] - cx, bc[1] - cy); body = `<line x1="${cx + (bc[0] - cx) / d * 90}" y1="${cy + (bc[1] - cy) / d * 40}" x2="${bc[0] - (bc[0] - cx) / d * 75}" y2="${bc[1] - (bc[1] - cy) / d * 33}" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="6 5"/>` + body; });
    } else if (k === 'layers') {
      const bh = Math.min(76, (440 - (items.length - 1) * 12) / items.length); H = top + items.length * (bh + 12) + 14;
      items.forEach((it, i) => put(it, i, 60 + i * 0, top + i * (bh + 12), W - 120, bh));
    } else if (k === 'tree') {
      const depth = {}; const byId = new Map(items.map(it => [it.id, it])); const d = it => depth[it.id] ?? (depth[it.id] = it.parent && byId.has(it.parent) && it.parent !== it.id ? Math.min(6, d(byId.get(it.parent)) + 1) : 0);
      items.forEach(d); const levels = []; items.forEach(it => (levels[depth[it.id]] = levels[depth[it.id]] || []).push(it));
      const bh = 70; H = top + levels.length * (bh + 56) + 10;
      levels.forEach((lv, l) => { const bw = Math.min(170, (W - 40 - (lv.length - 1) * 16) / lv.length); const x0 = (W - (lv.length * bw + (lv.length - 1) * 16)) / 2; lv.forEach((it, i) => put(it, items.indexOf(it), x0 + i * (bw + 16), top + l * (bh + 56), bw, bh)); });
      items.forEach(it => { if (it.parent && at.has(it.parent) && it.parent !== it.id) { const a = at.get(it.parent), b = at.get(it.id); body += arrow(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y); } });
    } else if (k === 'compare') {
      const g = spec.groups?.length === 2 ? spec.groups : ['A', 'B']; const cols = [items.filter(it => !it.group), items.filter(it => it.group)];
      const rows = Math.max(cols[0].length, cols[1].length), bh = 60; H = top + 50 + rows * (bh + 14) + 10;
      g.forEach((t, j) => { body += `<text x="${j ? 590 : 210}" y="${top + 18}" font-size="19" font-weight="700" text-anchor="middle" fill="${STROKE[j * 2]}" font-family="Helvetica, Arial, sans-serif">${esc(String(t).slice(0, 34))}</text>`; });
      cols.forEach((col, j) => col.forEach((it, i) => put(it, j * 2 + (i % 2), j ? 420 : 40, top + 44 + i * (bh + 14), 340, bh)));
      body = `<line x1="400" y1="${top}" x2="400" y2="${H - 10}" stroke="#cbd5e1" stroke-width="2"/>` + body;
    } else throw new Error(`diagram "${spec.id}": unknown kind "${k}" (use flow, cycle, hub, layers, tree or compare)`);
    for (const [a, b, lab] of spec.links || []) { const p = at.get(a), q = at.get(b); if (!p || !q || k === 'flow' || k === 'cycle' || k === 'tree') continue; body += arrow(p.x + p.w / 2, p.y + p.h, q.x + q.w / 2, q.y, lab); }
    H = Math.round(H);
    const title = spec.title ? `<text x="${W / 2}" y="36" font-size="22" font-weight="700" text-anchor="middle" fill="#0f172a" font-family="Helvetica, Arial, sans-serif">${esc(String(spec.title).slice(0, 60))}</text>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${title}${body}</svg>`;
    return { svg, w: W, h: H, regions: regs };
  }
  const b64 = s => btoa(unescape(encodeURIComponent(s)));

  /* ======================= the contract text for the model ======================= */
  let SPEC = null;
  async function spec() {
    if (SPEC) return SPEC;
    if (window.NOEMA_AUTHORING) return (SPEC = window.NOEMA_AUTHORING);
    try { await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'engine/authoring.js'; sc.onload = res; sc.onerror = rej; document.head.append(sc); }); SPEC = window.NOEMA_AUTHORING; } catch (e) { }
    return SPEC || (SPEC = { content: '', visual: '' });
  }
  const DIAGRAM_KIT = `## Diagrams you draw (the app renders them; DO NOT write SVG)
Each chapter has "diagrams": 1–2 objects { "id": "lowercase-id", "kind": "flow|cycle|hub|layers|tree|compare", "title": "short", "alt": "what the picture shows", "caption": "one line", "items": [ { "id": "lowercase_id", "label": "2–5 words", "note": "one teaching sentence" , "parent": "item id (tree only)", "group": 0 or 1 (compare only) } ], "groups": ["left heading", "right heading"] (compare only), "links": [["from item id", "to item id", "optional label"]] (hub/layers/compare only) }.
- flow = a process left→right (3–8 steps, in order); cycle = a loop (3–7); hub = items[0] in the centre and 3–7 parts around it; layers = stacked levels top→bottom (3–7); tree = hierarchy via "parent" (4–12); compare = two columns (group 0 / group 1, 2–6 each).
- Every item becomes a clickable region of the picture whose id is the item id and whose label is the item label.
- Use the diagram in a {"t":"figure","media":"<diagram id>"} block of the section that teaches it, and in ≥ 3 picture exercises of ≥ 2 kinds, e.g.
  {"type":"img_hotspot","media":"<id>","answer":["item_id"],"q":"Click the part that …"}, {"type":"img_sequence","media":"<id>","answer":["a","b","c"],"q":"Trace …"} (flow/cycle),
  {"type":"img_drag","media":"<id>","distractors":["a wrong label"],"q":"Drag the labels…"}, {"type":"img_label","media":"<id>","targets":["a","b"],"q":"Name the covered parts"},
  {"type":"img_select","media":"<id>","q":"Pick the right label for each part"}, {"type":"img_occlusion","media":"<id>","q":"Recall each covered part"}.`;

  const S_META = { type: 'object', required: ['title', 'emoji', 'description', 'headline', 'mantra', 'searchExamples', 'math', 'code', 'tutor'], properties: {
    title: { type: 'string', minLength: 2, maxLength: 80 }, emoji: { type: 'string', minLength: 1, maxLength: 8 }, description: { type: 'string', minLength: 10, maxLength: 200 },
    headline: { type: 'string', minLength: 5, maxLength: 120 }, mantra: { type: 'string', minLength: 5, maxLength: 200 }, searchExamples: { type: 'string', maxLength: 120 },
    math: { type: 'boolean' }, code: { type: 'boolean' },
    tutor: { type: 'object', required: ['name', 'avatar', 'domain', 'examples', 'interviewer', 'simulation', 'terminology', 'examinerRole'], properties: { name: { type: 'string' }, avatar: { type: 'string' }, domain: { type: 'string' }, examples: { type: 'string' }, interviewer: { type: 'string' }, simulation: { type: 'string' }, terminology: { type: 'string' }, examinerRole: { type: 'string' } } } } };
  const S_CHAPTER = { type: 'object', required: ['id', 'num', 'title', 'subtitle', 'emoji', 'mantra', 'objectives', 'sections', 'debug', 'pitfalls', 'flashcards', 'exercises', 'diagrams'], properties: {
    id: { type: 'string', pattern: '^ch\\d\\d$' }, num: { type: 'integer', minimum: 1 }, title: { type: 'string', minLength: 2 }, subtitle: { type: 'string' }, emoji: { type: 'string' }, mantra: { type: 'string' },
    objectives: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string', minLength: 3 } },
    sections: { type: 'array', minItems: 3, maxItems: 10, items: { type: 'object', required: ['id', 'title', 'hook', 'blocks'], properties: { id: { type: 'string', pattern: '^ch\\d\\d-s\\d\\d$' }, title: { type: 'string', minLength: 2 }, hook: { type: 'string' }, blocks: { type: 'array', minItems: 3, maxItems: 24, items: { type: 'object', required: ['t'] } } } } },
    debug: { type: 'array', maxItems: 6, items: { type: 'object', required: ['id', 'title', 'section', 'symptom', 'askYourself', 'steps', 'rootCauses', 'fix'] } },
    pitfalls: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', required: ['title', 'text', 'fix'] } },
    flashcards: { type: 'array', minItems: 8, maxItems: 40, items: { type: 'object', required: ['q', 'a', 'section'] } },
    exercises: { type: 'array', minItems: 12, maxItems: 80, items: { type: 'object', required: ['id', 'type', 'section', 'difficulty', 'tags', 'explain'] } },
    diagrams: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object', required: ['id', 'kind', 'title', 'alt', 'items'], properties: { id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,30}$' }, kind: { type: 'string', enum: ['flow', 'cycle', 'hub', 'layers', 'tree', 'compare'] }, items: { type: 'array', minItems: 3, maxItems: 12, items: { type: 'object', required: ['id', 'label'], properties: { id: { type: 'string', pattern: '^[a-z0-9_-]{1,30}$' }, label: { type: 'string', minLength: 1, maxLength: 60 } } } } } } },
  } };

  /** Render the chapter's diagrams into pack media (global ids) and point the chapter's references at them. */
  function materialize(ch, prefix) {
    const media = {}; const map = {};
    for (const d of ch.diagrams || []) {
      const r = render(d); const gid = `${prefix}-${ch.id}-${d.id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60);
      map[d.id] = gid;
      media[gid] = { alt: d.alt || d.title, caption: d.caption || '', credit: 'Drawn by noema-lite (diagram kit)', license: 'own', origin: 'drawn', mime: 'image/svg+xml', w: r.w, h: r.h, regions: r.regions, data: 'data:image/svg+xml;base64,' + b64(r.svg) };
    }
    const out = JSON.parse(JSON.stringify(ch)); delete out.diagrams;
    for (const s of out.sections || []) for (const b of s.blocks || []) if (b.t === 'figure' && map[b.media]) b.media = map[b.media];
    for (const e of out.exercises || []) if (map[e.media]) e.media = map[e.media];
    return { chapter: out, media };
  }
  /** Quantity rules for browser-made chapters (scaled-down CONTENT_SPEC). */
  function quality(ch) {
    const E = []; const ex = ch.exercises || []; const secs = ch.sections || [];
    const types = new Set(ex.map(e => e.type)); const vis = ex.filter(e => String(e.type).startsWith('img_'));
    if (ex.length < secs.length * 4) E.push(`only ${ex.length} exercises for ${secs.length} sections — at least 4 per section`);
    for (const s of secs) if (ex.filter(e => e.section === s.id).length < 3) E.push(`section ${s.id} needs ≥ 3 exercises`);
    if (types.size < 7) E.push(`use more exercise types (only ${[...types].join(', ')}): mcq, tf, cloze, order, match, bucket, odd, scenario, free, calc/spotbug/write where they fit, and the picture types`);
    if (vis.length < 3) E.push('≥ 3 picture exercises (img_*) on your diagrams are required');
    const used = {}; vis.forEach(e => used[e.media] = (used[e.media] || 0) + 1);
    for (const d of ch.diagrams || []) if ((used[d.id] || 0) < 2) E.push(`diagram "${d.id}" needs ≥ 2 picture exercises`);
    if (!secs.some(s => (s.blocks || []).some(b => b.t === 'figure'))) E.push('add a {"t":"figure"} block showing a diagram');
    const tagged = ex.filter(e => (e.tags || []).some(t => ['pitfall', 'debug', 'exam'].includes(t))).length; if (tagged < ex.length * 0.25) E.push('≥ 25 % of the exercises must be tagged pitfall, debug or exam');
    const ids = ex.map(e => e.id); for (const id of ids) if (!new RegExp(`^${ch.id}-e\\d{3}$`).test(id)) { E.push(`exercise id "${id}" must look like ${ch.id}-e001`); break; }
    for (const f of ch.flashcards || []) if (!secs.some(s => s.id === f.section)) { E.push(`flashcard section "${f.section}" does not exist`); break; }
    return E;
  }

  /* ======================= resumable state ======================= */
  const DB = { db: null,
    open() { return this.db || (this.db = new Promise((res, rej) => { const q = indexedDB.open('noema-packgen', 1); q.onupgradeneeded = () => q.result.createObjectStore('runs', { keyPath: 'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })); },
    async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('runs', mode); const r = fn(t.objectStore('runs')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); },
    put(x) { return this.tx('readwrite', s => s.put(x)); }, get(id) { return this.tx('readonly', s => s.get(id)); }, del(id) { return this.tx('readwrite', s => s.delete(id)); },
  };

  /**
   * Generate the pack for one curriculum node with Gemini.
   * → the pack object (format noema-pack), ready for Noema.importPack
   */
  async function generate({ acc, curriculum: c, nodeId, packId, onLog = () => { }, signal, model }) {
    const n = c.nodes[nodeId]; const lang = (window.NoemaCurriculum?.LANG || {})[c.language] || c.language;
    const run = (await DB.get(packId).catch(() => null)) || { id: packId, created: Date.now(), chapters: [], media: {}, usage: { input: 0, output: 0 } };
    const keep = () => DB.put(run).catch(() => { });
    const add = u => { run.usage.input += u?.input || 0; run.usage.output += u?.output || 0; };
    const brief = window.NoemaCurriculum.nodeBrief(c, nodeId);
    const S = await spec();
    // 1. the learner's own files (imported maps, 📎 material) are THE sources: read them, no web research
    const mat = n.material?.files || [];
    if (mat.length && !run.material) {
      onLog('📖 Reading your material…'); run.material = [];
      for (const f of mat) {
        const rec = await window.NoemaCurriculum.materialFile(acc, c, nodeId, f).catch(() => null);
        if (!rec?.blob) { onLog(`   ⚠️ ${f.name} is not available on this device`); continue; }
        // only the pages that belong to this step (a textbook may serve several steps)
        const x = await window.NoemaViewer.extract(rec.blob, f.name, f.range ? { from: f.range[0], maxPages: f.range[1] - f.range[0] + 1, outline: false } : { maxPages: 1500, outline: false }).catch(e => { onLog(`   ⚠️ ${f.name}: ${e.message}`); return null; });
        if (x?.pages?.length) run.material.push({ srcId: f.srcId, name: f.name, pdf: x.kind === 'pdf', pages: x.pages, first: x.first || 1, range: f.range || null, pageCount: x.pageCount || null });
      }
      if (!run.material.length) throw new Error('None of the files of this step could be read on this device.');
      run.research = ''; run.sources = []; await keep();
      onLog(`   ✓ ${run.material.length} file(s), ${run.material.reduce((a, m) => a + m.pages.length, 0)} pages`);
    }
    /** The part of the material a chapter comes from ("file.pdf pp. 12–30" from the planner), else all of it (capped). */
    const materialFor = ch => {
      const M = run.material || []; if (!M.length) return null;
      const want = String(ch.material || ''); const nm = x => x.toLowerCase().replace(/\.[a-z0-9]+$/, '');
      const file = M.find(m => want.toLowerCase().includes(nm(m.name))) || (M.length === 1 ? M[0] : null);
      const r = want.match(/(\d{1,5})\s*[–-]\s*(\d{1,5})/) || want.match(/p{1,2}\.\s*(\d{1,5})/);
      if (file && r && file.pdf) { const a = +r[1], b = +(r[2] || r[1]); const txt = file.pages.slice(Math.max(0, a - file.first), Math.max(0, b - file.first + 1)).map((t, i) => `[${file.name} p. ${Math.max(a, file.first) + i}]\n${t}`).join('\n\n'); if (txt.trim()) return { text: txt.slice(0, 160000), refs: [{ id: file.srcId, pages: `σ. ${a}–${b}` }] }; }
      const all = (file ? [file] : M).map(m => m.pages.map((t, i) => `[${m.name} ${m.pdf ? 'p. ' + (m.first + i) : 'part ' + (i + 1)}]\n${t}`).join('\n\n')).join('\n\n');
      return { text: all.slice(0, 160000), refs: (file ? [file] : M).map(m => ({ id: m.srcId })) };
    };
    // 1b. research (steps without material)
    if (!run.research && !run.material) {
      onLog('🔎 Researching official sources with Google Search…');
      const r = await L().research(acc, { signal, model, system: 'You are a meticulous subject-matter researcher. Use Google Search. Prefer official documentation, standards bodies, university courses, open textbooks, reference works and review articles. Be precise and current; never invent facts.',
        prompt: `${brief}\n\nWrite a dense research brief (in ${lang}) for a teacher who will write this course: for EVERY planned chapter give the key definitions, principles, facts and numbers, formulas or procedures, worked examples, common misconceptions and pitfalls, typical errors and how to diagnose them, and current best practice. Cite sources inline as [n].` });
      add(r.usage); run.research = r.text; run.sources = r.sources.slice(0, 15); await keep();
      onLog(`   ✓ ${run.sources.length} sources`);
    }
    // 2. subject
    if (!run.meta) {
      onLog('🪪 Naming the subject…');
      const { data, usage } = await L().json({ acc, provider: 'gemini', model, signal, system: 'You design study apps. Answer in JSON only.', prompt: `${brief}\n\nCreate the identity of this subject in ${lang}: title (the node title), one emoji, a one-line description, hero headline (may use **bold**), one-sentence mantra (the mental model), searchExamples (3–5 comma-separated concepts), math (true if formulas matter), code (true if code matters), and a Socratic tutor persona: name, avatar (one emoji), domain, examples (concrete examples to use), interviewer, simulation, terminology (key terms in quotes), examinerRole.`, schema: S_META });
      add(usage); run.meta = data; await keep();
    }
    // 3. chapters
    const plan = n.chapters?.length ? n.chapters : [{ title: n.title, goals: n.learningGoals || [], coverage: [n.summary || n.title] }];
    const prefix = packId.slice(-18);
    for (let i = run.chapters.length; i < plan.length; i++) {
      if (signal?.aborted) throw new (L().LLMError)('Stopped.', 0, 'aborted');
      const id = 'ch' + String(i + 1).padStart(2, '0'); const ch = plan[i];
      onLog(`✍️ Chapter ${i + 1}/${plan.length}: ${ch.title}`);
      const mt = materialFor(ch);
      const prompt = `${brief}\n\n` + (mt ? `## The learner's material for this chapter (THE source — teach from it and stay faithful to it; do not add theory it does not contain beyond brief connecting explanations; page markers are in [brackets])\n${mt.text}` : `## Research brief (from Google Search; cite nothing, but stay faithful to it)\n${(run.research || '').slice(0, 24000)}`) + `\n\n## Write chapter ${i + 1} of ${plan.length} now: “${ch.title}”\nTeaching goals: ${(ch.goals || []).join('; ')}\nMust cover: ${(ch.coverage || []).join('; ')}\nEarlier chapters of this node: ${plan.slice(0, i).map(x => x.title).join('; ') || '(none)'} — do not repeat them.\n\nRules: language ${lang}. Chapter id "${id}", num ${i + 1}. 3–8 sections with ids "${id}-s01"…; 4–14 blocks each, varied (p, list, table, compare, flow, callout, reveal, ask, terms, code/diagram when useful, one figure). ≥ 4 exercises per section with ids "${id}-e001"… and ≥ 7 different types, incl. ≥ 3 picture exercises on your diagrams; ≥ 25 % tagged pitfall/debug/exam; every explanation teaches why the right answer is right and why the tempting one is wrong. 8–25 flashcards, ≥ 1 pitfall, debug playbooks where the topic has failure modes. ${S.content ? '' : 'Follow the noema-lite content format.'}`;
      const { data, usage } = await L().json({ acc, provider: 'gemini', model, signal, maxTokens: 65536, system: `You are an expert teacher and instructional designer writing one chapter of a noema-lite subject pack as JSON. Follow the content contract exactly.\n\n${S.content || ''}\n\n${S.visual ? S.visual.split('## 5.')[0] : ''}\n\n${DIAGRAM_KIT}`, prompt, schema: S_CHAPTER,
        validate: d => {
          if (d.id !== id) return [`"id" must be "${id}"`];
          let m; try { m = materialize(d, prefix); } catch (e) { return [e.message]; }
          const pack = { format: 'noema-pack', subject: { id: packId, title: 'x' }, chapters: [m.chapter], media: m.media };
          const r = window.NoemaPackCheck.checkPack(pack, null, { strict: true });
          return [...r.errors, ...quality(d)].slice(0, 30);
        }, onRepair: e => onLog(`   ↻ fixing ${e.length} problem(s)…`) });
      add(usage);
      const m = materialize(data, prefix); m.chapter.src = mt ? mt.refs[0].id : 'web'; if (mt) m.chapter.sources = mt.refs;
      run.chapters.push(m.chapter); Object.assign(run.media, m.media); await keep();
      onLog(`   ✓ ${m.chapter.sections.length} sections · ${m.chapter.exercises.length} exercises · ${m.chapter.flashcards.length} flashcards`);
    }
    // 4. assemble
    const M = run.meta;
    const subject = { id: packId, title: n.title, appTitle: n.title, emoji: M.emoji, group: 'curriculum', description: M.description, language: c.language, features: { math: !!M.math, code: !!M.code },
      hero: { headline: M.headline, mantra: M.mantra }, searchExamples: M.searchExamples, tutor: { ...M.tutor, prior: `Already mastered: ${c.edges.filter(e => e.to === nodeId).map(e => c.nodes[e.from]?.title).filter(Boolean).join('; ') || 'nothing specific'}.` } };
    const sources = run.material ? { sources: run.material.map(m => ({ id: m.srcId, title: m.name.replace(/\.[a-z0-9]+$/i, ''), fileName: m.name, file: 'sources/' + m.name, pages: m.range ? `${m.range[0]}–${m.range[1]}` : m.pageCount ? `1–${m.pageCount}` : '', added: new Date().toISOString().slice(0, 10), emoji: '📄' })), chapters: Object.fromEntries(run.chapters.map(ch => [ch.id, ch.src])), patches: {} } : { sources: [{ id: 'web', title: 'Web research (Gemini + Google Search)', subtitle: (run.sources || []).map(s => s.title).slice(0, 6).join(' · '), added: new Date().toISOString().slice(0, 10), emoji: '🔎' },
      ...(run.sources || []).map((s, i) => ({ id: 's' + (i + 1), title: s.title, url: s.url, added: new Date().toISOString().slice(0, 10), emoji: '🌐' }))], chapters: Object.fromEntries(run.chapters.map(ch => [ch.id, 'web'])), patches: {} };
    const pack = { format: 'noema-pack', v: 1, subject, sources, chapters: run.chapters, media: run.media, builtAt: new Date().toISOString(), generatedBy: 'gemini', curriculum: { id: c.id, node: nodeId } };
    const r = window.NoemaPackCheck.checkPack(pack, packId, { strict: true });
    if (r.errors.length) throw new Error('The generated pack is not valid: ' + r.errors.slice(0, 3).join('; '));
    pack.counts = { chapters: r.counts.chapters, sections: r.counts.sections, exercises: r.counts.exercises, visual: r.counts.visual, pictures: r.counts.media, flashcards: run.chapters.reduce((a, ch) => a + ch.flashcards.length, 0) };
    let h = 0; const js = JSON.stringify(pack.chapters); for (let i = 0; i < js.length; i += 7) h = (h * 31 + js.charCodeAt(i)) >>> 0; pack.version = 'g' + h.toString(16);
    await DB.del(packId).catch(() => { });
    return pack;
  }

  return { generate, render, materialize, quality, DIAGRAM_KIT, S_CHAPTER, S_META, forget: id => DB.del(id) };
})();
