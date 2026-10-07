/* noema-lite — "Create with Claude" INSIDE the app, with the learner's own Claude API key (docs/CLAUDE_CONNECTOR.md §A).
   The browser talks to the Claude API directly (the key never reaches a noema-lite server):
     1. uploads the noema-pack-builder skill to the key's workspace (once; a new version when the skill changes),
     2. uploads the sources (Files API) into a code-execution container,
     3. runs the conversation loop (pause_turn, client tool noema_web_image, max_tokens) until Claude
        copies the built pack to $OUTPUT_DIR, then downloads it.
   The job is saved after every step (IndexedDB), so a closed tab or a network error can be resumed.
   Web pictures: the sandbox has no internet → Claude searches with web_search and calls noema_web_image;
   the APP downloads the picture (directly, or through /api/img when the host blocks browsers), shows it to
   Claude, and embeds it when importing the pack ("fetch": "app" pictures, docs/VISUAL.md §6). */
window.NoemaClaude = (() => {
  const CFG = () => window.NOEMA_CONFIG || {};
  const API = () => (CFG().anthropicBase || 'https://api.anthropic.com').replace(/\/$/, '');
  const SITE = () => (CFG().siteUrl || (location.protocol.startsWith('http') ? location.origin : '')).replace(/\/$/, '');
  const VERSION_HDR = '2023-06-01';
  const SKILL_NAME = 'noema-pack-builder';
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- the key: on THIS device only (never synced to the cloud, never in backups) ---------- */
  const kk = acc => 'noema-device:anthropicKey:' + acc;
  const Key = {
    get(acc) { try { return sessionStorage.getItem(kk(acc)) || localStorage.getItem(kk(acc)) || ''; } catch (e) { return ''; } },
    set(acc, key, remember) { try { this.forget(acc); (remember ? localStorage : sessionStorage).setItem(kk(acc), key.trim()); } catch (e) { } },
    remembered(acc) { try { return !!localStorage.getItem(kk(acc)); } catch (e) { return false; } },
    forget(acc) { try { localStorage.removeItem(kk(acc)); sessionStorage.removeItem(kk(acc)); } catch (e) { } },
    looksValid: k => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(k || '').trim()),
  };

  /* ---------- HTTP with friendly errors and retries ---------- */
  class ApiError extends Error { constructor(msg, status, type) { super(msg); this.status = status; this.type = type; } }
  function friendly(status, type, msg) {
    const m = String(msg || '');
    if (status === 401) return 'The key was not accepted — check that you copied all of it (it starts with sk-ant-), or create a new one.';
    if (status === 403) return 'This key is not allowed to do that (' + m + '). Use a key from your own workspace.';
    if (/credit balance|billing|purchase credits/i.test(m)) return 'Your Claude API account has no credit left. Add credit: platform.claude.com → Settings → Billing.';
    if (status === 413) return 'A file is too big for the Claude API (' + m + '). Split the PDF or attach fewer files.';
    if (status === 429) return 'Too many requests or the spending limit was reached — waiting and trying again… (' + m + ')';
    if (status === 529 || type === 'overloaded_error') return 'Claude is busy right now — trying again…';
    return m || ('HTTP ' + status);
  }
  async function api(key, path, { method = 'GET', json, form, raw = false, signal, retries = 6 } = {}) {
    const headers = { 'x-api-key': key, 'anthropic-version': VERSION_HDR, 'anthropic-dangerous-direct-browser-access': 'true' };
    if (json !== undefined) headers['content-type'] = 'application/json';
    for (let attempt = 0; ; attempt++) {
      let r;
      try { r = await fetch(API() + path, { method, headers, body: json !== undefined ? JSON.stringify(json) : form, signal }); }
      catch (e) {
        if (signal?.aborted) throw new ApiError('Stopped.', 0, 'aborted');
        if (attempt < retries) { await wait(Math.min(30000, 1500 * 2 ** attempt)); continue; }
        throw new ApiError('No connection to Claude (' + e.message + '). Check the internet connection and press Resume.', 0, 'network');
      }
      if (r.ok) return raw ? r : (r.status === 204 ? null : r.json());
      let body = {}; try { body = await r.json(); } catch (e) { }
      const type = body?.error?.type || '', msg = body?.error?.message || '';
      const transient = r.status === 429 || r.status === 529 || r.status >= 500;
      if (transient && attempt < retries && !/credit balance/i.test(msg)) {
        const ra = +r.headers.get('retry-after'); await wait(ra > 0 ? Math.min(ra * 1000, 60000) : Math.min(60000, 2000 * 2 ** attempt)); continue;
      }
      throw new ApiError(friendly(r.status, type, msg), r.status, type);
    }
  }

  /* ---------- models ---------- */
  async function models(key) {
    const r = await api(key, '/v1/models?limit=100', { retries: 2 });
    return (r?.data || []).map(m => ({ id: m.id, name: m.display_name || m.id, created: m.created_at }));
  }
  /** Default: the newest Sonnet (good quality per dollar), else the newest model. */
  const defaultModel = list => (list.find(m => /sonnet/i.test(m.id)) || list[0] || {}).id || '';
  /** Rough price per million tokens by family (only for the on-screen estimate; Console → Usage is exact). */
  function priceOf(model) {
    const P = CFG().claudePrices || {};
    const fam = /opus/i.test(model) ? 'opus' : /haiku/i.test(model) ? 'haiku' : 'sonnet';
    return P[fam] || { opus: { in: 5, out: 25 }, sonnet: { in: 3, out: 15 }, haiku: { in: 1, out: 5 } }[fam];
  }
  function cost(usage, model) {
    const p = priceOf(model), u = usage || {};
    return ((u.input || 0) * p.in + (u.cacheWrite || 0) * p.in * 1.25 + (u.cacheRead || 0) * p.in * 0.1 + (u.output || 0) * p.out) / 1e6 + (u.searches || 0) * 0.01;
  }

  /* ---------- the skill: uploaded once per API workspace, re-uploaded as a new version when it changes ---------- */
  async function sha(buf) { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''); }
  const skKey = async key => 'noema-device:claudeSkill:' + await sha(new TextEncoder().encode(key));
  async function ensureSkill(key, onLog = () => { }) {
    const zr = await fetch(SITE() + '/downloads/noema-pack-builder.zip', { cache: 'no-cache' });
    if (!zr.ok) throw new Error('Could not load the skill from noema-lite (' + zr.status + ').');
    const zip = await zr.arrayBuffer(); const ver = await sha(zip);
    const sk = await skKey(key); let cached = null; try { cached = JSON.parse(localStorage.getItem(sk) || 'null'); } catch (e) { }
    let field = 'files[]';
    const form = () => { const f = new FormData(); f.append(field, new Blob([zip], { type: 'application/zip' }), SKILL_NAME + '.zip'); return f; };
    // the multipart field is "files[]" in the API reference and "files" in some examples: try both
    const post = async (path, extra) => { try { return await api(key, path, { method: 'POST', form: extra(form()) }); } catch (e) { if (e.status !== 400 || field === 'files') throw e; field = 'files'; return api(key, path, { method: 'POST', form: extra(form()) }); } };
    const remember = id => { try { localStorage.setItem(sk, JSON.stringify({ id, ver })); } catch (e) { } return id; };
    let id = cached?.id;
    if (id) { try { await api(key, '/v1/skills/' + id, { retries: 2 }); } catch (e) { if (e.status === 404) id = null; else throw e; } }
    if (!id) {   // maybe uploaded from another device or browser: find it by name
      try { const l = await api(key, '/v1/skills?source=custom&limit=100', { retries: 2 }); const f = (l?.data || []).find(s => (s.display_title || s.display_name || s.name) === SKILL_NAME || s.name === SKILL_NAME); if (f) id = f.id; } catch (e) { }
    }
    if (id && cached?.id === id && cached.ver === ver) return id;
    if (id) { onLog('📦 Updating the noema-pack-builder skill in your Claude workspace…'); await post(`/v1/skills/${id}/versions`, f => f); return remember(id); }
    onLog('📦 Adding the noema-pack-builder skill to your Claude workspace (only the first time)…');
    const r = await post('/v1/skills', f => { f.append('display_title', SKILL_NAME); return f; });
    return remember(r.id);
  }

  /* ---------- the job store (IndexedDB; survives reloads) ---------- */
  const DB = { db: null,
    open() { return this.db || (this.db = new Promise((res, rej) => { const q = indexedDB.open('noema-claude', 1); q.onupgradeneeded = () => q.result.createObjectStore('jobs', { keyPath: 'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })); },
    async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('jobs', mode); const r = fn(t.objectStore('jobs')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); },
    put(job) { return this.tx('readwrite', s => s.put(job)); },
    get(id) { return this.tx('readonly', s => s.get(id)); },
    del(id) { return this.tx('readwrite', s => s.delete(id)); },
    all() { return this.tx('readonly', s => s.getAll()); },
  };
  async function jobs(acc) { return ((await DB.all().catch(() => [])) || []).filter(j => j.acc === acc).sort((a, b) => b.created - a.created); }

  /* ---------- pictures from the web (client tool) ---------- */
  const blobToDataUrl = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
  /** Some hosts send pictures as application/octet-stream: recognise them by their first bytes. */
  async function sniff(b) {
    const a = new Uint8Array(await b.slice(0, 64).arrayBuffer()); const t = new TextDecoder().decode(a).trim().toLowerCase();
    if (a[0] === 0x89 && a[1] === 0x50) return 'image/png'; if (a[0] === 0xff && a[1] === 0xd8) return 'image/jpeg';
    if (t.startsWith('gif8')) return 'image/gif'; if (t.slice(8, 12) === 'webp') return 'image/webp';
    if (t.startsWith('<svg') || (t.startsWith('<?xml') && /<svg/.test(new TextDecoder().decode(new Uint8Array(await b.slice(0, 1024).arrayBuffer())))) ) return 'image/svg+xml';
    return null;
  }
  async function downloadImage(url) {
    const tries = [() => fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' })];
    if (SITE()) tries.push(() => fetch(SITE() + '/api/img?url=' + encodeURIComponent(url)));
    let last = '';
    for (const t of tries) {
      try {
        const r = await t();
        if (!r.ok) { last = (await r.text().catch(() => '')).slice(0, 160) || 'HTTP ' + r.status; continue; }
        let b = await r.blob();
        if (!/^image\//.test(b.type)) { const t = await sniff(b); if (!t) { last = 'not a picture (' + (b.type || 'unknown type') + ') — give the direct image file url, not the page'; continue; } b = new Blob([b], { type: t }); }
        return b;
      } catch (e) { last = e.message; }
    }
    throw new Error('Could not download the picture: ' + last);
  }
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('the file is not a readable picture')); i.src = src; }); }
  function encode(img, maxSide, type = 'image/jpeg', q = 0.86) {
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL(type, q), w: c.width, h: c.height };
  }
  /** → { data (data URI kept for the pack), w, h, mime, preview (base64 JPEG ≤ 1568 px for Claude to look at) } */
  async function webImage(url) {
    const blob = await downloadImage(url);
    if (blob.size > 15 * 1024 * 1024) throw new Error('picture larger than 15 MB');
    let data = await blobToDataUrl(blob); const img = await loadImg(data);
    let w = img.naturalWidth || 0, h = img.naturalHeight || 0, mime = blob.type;
    if (/svg/.test(mime) && (!w || !h)) { w = 1200; h = 900; }
    // keep packs light: big rasters are stored at ≤ 2000 px (JPEG 88 %); region coordinates use the stored size
    if (!/svg/.test(mime) && (blob.size > 700 * 1024 || Math.max(w, h) > 2400)) { const e = encode(img, 2000, /png/.test(mime) && blob.size < 1.5e6 ? 'image/png' : 'image/jpeg', 0.88); data = e.url; w = e.w; h = e.h; mime = data.slice(5, data.indexOf(';')); }
    const pv = encode(img, 1568, 'image/jpeg', 0.85);
    return { data, w, h, mime, preview: pv.url.split(',')[1], pw: pv.w, ph: pv.h };
  }

  /** Fill the "fetch": "app" pictures of a pack (cache first, then the web). Pictures that fail keep their url. */
  async function fillWebPictures(pack, cache = {}, onLog = () => { }) {
    let n = 0, failed = [];
    for (const [id, m] of Object.entries(pack.media || {})) {
      if (m.data || m.fetch !== 'app' || !m.url) continue;
      try {
        const got = cache[m.url] || await webImage(m.url);
        m.data = got.data; m.mime = got.mime; n++;
        if (got.w && m.w && Math.abs(got.w / got.h - m.w / m.h) > 0.02) console.warn('[pictures] aspect differs for', id);
      } catch (e) { failed.push(id); }
    }
    if (n) onLog(`🖼️ ${n} web picture(s) embedded`); if (failed.length) onLog(`⚠️ ${failed.length} picture(s) could not be downloaded now — they load from the web when shown: ${failed.join(', ')}`);
    return { embedded: n, failed };
  }

  /* ---------- the conversation ---------- */
  const today = () => new Date().toISOString().slice(0, 10);
  const SYSTEM = (job = {}) => `You are building a noema-lite subject pack for the user, running inside the noema-lite app through the Claude API (the user is watching a progress screen; they are not technical).
The noema-pack-builder skill is available in your code-execution container — follow its SKILL.md and both references completely (coverage, quality bar, ≥ 3 picture exercises per picture, all three kinds of pictures). Differences in THIS environment:
${job.kind === 'node' ? NODE_SOURCES : `1. The user's source files are uploaded into the container. Find them first (e.g. \`ls -la /mnt/user-data/uploads 2>/dev/null; find / -xdev -type f \\( -iname '*.pdf' -o -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.txt' -o -iname '*.md' -o -iname '*.docx' \\) -mmin -1440 2>/dev/null | grep -v -E '^/(proc|sys|usr|lib|opt|etc|var)' | head -50\`). If some PDFs were attached as documents instead (see the user message), read them directly.`}
2. The sandbox has NO internet. For pictures from the web: use the web_search tool to find high-quality, information-rich photographs and diagrams (prefer Wikimedia Commons, OpenStax, NIH, NASA, open-source docs; any licence is fine for this personal app as long as the source is recorded), then call the noema_web_image tool with the DIRECT image file url (Wikimedia: the upload.wikimedia.org original file). You will see the picture and get its size. Register it in media/media.json WITHOUT a file:
   {"id": "…", "origin": "web", "fetch": "app", "url": "<direct image url>", "page": "<page it came from>", "retrieved": "${today()}", "w": W, "h": H, "alt": "…", "credit": "author / site", "license": "…"}
   The app downloads and embeds it when importing. Regions use the W×H pixel coordinates reported by the tool. You cannot open these pictures with Pillow, so place regions carefully from what you see (generous rectangles/circles).
3. Do not ask the user anything unless something essential is missing — choose sensible defaults and say them in one line.
4. Keep tool output short: print counts and summaries, never whole files or long JSON — every printed line costs the user money.
5. Write chapters with Python scripts. Validate with make_pack.py until it has zero errors. Then copy the built pack to the output directory, in the same command:
   python3 <skill>/scripts/make_pack.py work/<id> /tmp/out && cp /tmp/out/<id>.json "$OUTPUT_DIR/"
   That file is imported into noema-lite automatically. Finish with a short summary for the user (chapters, exercises, picture exercises, pictures) in the language of the sources.
6. SKILL.md step 6 (connector / upload) does not apply here.`;

  /** Curriculum nodes (engine/curriculum.js) have no uploaded sources: Claude researches them. */
  const NODE_SOURCES = `1. This pack is ONE NODE of a learning curriculum (the user message has the plan: the node, what the learner already knows, the chapters to write). There are no uploaded files: research the material yourself with web_search and web_fetch — official, authoritative sources first (official documentation and standards, university course pages, open textbooks such as OpenStax and LibreTexts, review articles, reference works; Wikipedia only as a pointer to better sources). Read what you cite. Record every source in sources.json (title, url, retrieved date) and map each chapter to its main source. Write one pack chapter per planned chapter, in the planned order and with the planned titles, covering every teaching goal and every "must cover" item; facts must be correct and current. Do not re-teach the prerequisites the learner already mastered; connect to them briefly where needed.`;
  const TOOL_WEB_IMAGE = {
    name: 'noema_web_image',
    description: 'Download a picture from the web for the pack (your sandbox has no internet; the noema-lite app downloads it). Returns the picture so you can check it is correct, relevant and sharp, plus its size W×H in pixels (use these coordinates for regions). Then register it in media.json as a "fetch": "app" web picture.',
    input_schema: { type: 'object', properties: { url: { type: 'string', description: 'Direct URL of the image file (jpg/png/webp/svg), not the web page' }, page_url: { type: 'string', description: 'The page where you found it (for the credit)' } }, required: ['url'] },
  };
  function toolsFor(job) {
    return [{ type: 'code_execution_20250825', name: 'code_execution' },
      ...(job.noSearch ? [] : [{ type: 'web_search_20250305', name: 'web_search', max_uses: job.maxSearches || 20 }]),
      ...(job.kind === 'node' && !job.noFetch ? [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 40 }] : []), TOOL_WEB_IMAGE];
  }
  /** Prompt caching: system + the newest user turn (≤ 4 breakpoints in total). */
  function withCache(messages) {
    const ms = messages.map(m => ({ ...m, content: Array.isArray(m.content) ? m.content.map(b => { if (!b.cache_control) return b; const { cache_control, ...rest } = b; return rest; }) : m.content }));
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].role === 'user' && Array.isArray(ms[i].content) && ms[i].content.length) { const c = ms[i].content; c[c.length - 1] = { ...c[c.length - 1], cache_control: { type: 'ephemeral' } }; break; }
    return ms;
  }
  function firstMessage(job, pdfAsDocument) {
    if (job.kind === 'node') return { role: 'user', content: [{ type: 'text', text: [`Create a noema-lite subject pack for one node of my curriculum.`, `Title: ${job.title}`, `Subject id: ${job.subjectId}`, `Language of the material: ${job.language || 'en'}`, '', job.brief || ''].join('\n') }] };
    const files = job.files || [];
    const lines = [`Create a noema-lite subject pack.`, `Title: ${job.title}`, `Subject id: ${job.subjectId}`, `Language of the material: ${job.language || 'same as the sources'}`, `My goal: ${job.goal || 'understanding'}`];
    if (job.notes) lines.push(`Notes from me: ${job.notes}`);
    if (job.links?.length) lines.push(`Links to read as sources (use web search / your knowledge of them; the sandbox has no internet):\n- ${job.links.join('\n- ')}`);
    lines.push(`Uploaded sources: ${files.map(f => f.name).join(', ') || '(none — use the links and your knowledge, and say so)'}`);
    const blocks = [{ type: 'text', text: lines.join('\n') }];
    for (const f of files) {
      if (pdfAsDocument && /pdf/.test(f.type)) blocks.push({ type: 'document', source: { type: 'file', file_id: f.fileId }, title: f.name });
      else blocks.push({ type: 'container_upload', file_id: f.fileId });
    }
    if (pdfAsDocument && files.some(f => /pdf/.test(f.type))) blocks.push({ type: 'text', text: 'Note: the PDFs above are attached as documents (not inside the container): read them directly; for pictures from the PDFs, redraw the important figures with svgkit.' });
    return { role: 'user', content: blocks };
  }
  const fileIdsIn = blocks => {
    const ids = [];
    for (const b of blocks || []) {
      const c = b?.content;
      if (/code_execution_tool_result$/.test(b?.type || '') && c && Array.isArray(c.content)) c.content.forEach(x => x?.file_id && ids.push(x.file_id));
    }
    return ids;
  };
  const describe = b => {
    if (b.type === 'text') return b.text.trim() ? '💬 ' + b.text.trim().split('\n')[0].slice(0, 220) : '';
    if (b.type === 'server_tool_use' && b.name === 'web_search') return '🔎 Searching: ' + (b.input?.query || '');
    if (b.type === 'server_tool_use' && b.name === 'web_fetch') return '📖 Reading: ' + String(b.input?.url || '').replace(/^https?:\/\//, '').slice(0, 90);
    if (b.type === 'server_tool_use' && /bash/.test(b.name)) { const c = String(b.input?.command || ''); return '🛠️ ' + (/make_pack/.test(c) ? 'Checking and building the pack' : /pdf_text|pdftotext/.test(c) ? 'Reading the PDF' : /extract_images/.test(c) ? 'Finding pictures in the sources' : /svgkit|Diagram|Plot/.test(c) ? 'Drawing diagrams' : /chapters|json\.dump/.test(c) ? 'Writing chapters' : 'Working: ' + c.split('\n')[0].slice(0, 90)); }
    if (b.type === 'server_tool_use' && /text_editor/.test(b.name)) return '📝 ' + (b.input?.command === 'view' ? 'Reading ' : 'Writing ') + String(b.input?.path || '').split('/').pop();
    if (b.type === 'tool_use' && b.name === 'noema_web_image') return '🖼️ Fetching a picture: ' + String(b.input?.url || '').split('/').pop().slice(0, 80);
    return '';
  };

  async function uploadFile(key, file, signal) {
    const f = new FormData(); f.append('file', file, file.name);
    return (await api(key, '/v1/files', { method: 'POST', form: f, signal, retries: 3 })).id;
  }

  /** Create a job (uploads skill + files) — returns the saved job. */
  async function create({ acc, key, model, title, subjectId, language, goal, notes, links = [], files = [], budget = 20, onLog = () => { }, kind = 'subject', brief = '', meta = null }) {
    const job = { id: 'cj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), acc, model, title, subjectId, language, goal, notes, links, budget, kind, brief, meta,
      created: Date.now(), status: 'starting', usage: {}, log: [], messages: [], containerId: null, outputIds: [], images: {}, turns: 0, files: [] };
    const log = t => { job.log.push({ t: Date.now(), m: t }); onLog(t); };
    job.skillId = await ensureSkill(key, log);
    for (const f of files) { log('⬆️ Uploading ' + f.name + '…'); job.files.push({ name: f.name, type: f.type || '', size: f.size, fileId: await uploadFile(key, f) }); }
    job.messages.push(firstMessage(job, false)); job.status = 'running';
    await DB.put(job); return job;
  }

  /** Run (or resume) a job until it finishes, needs an answer, hits the budget, or is stopped. */
  async function run(job, key, { onLog = () => { }, onUpdate = () => { }, signal } = {}) {
    const log = t => { if (!t) return; job.log.push({ t: Date.now(), m: t }); if (job.log.length > 400) job.log.splice(0, job.log.length - 400); onLog(t); };
    const save = () => DB.put(job).catch(e => console.warn('[claude job]', e));
    /** Answer the client tool calls of the last assistant turn (also after a reload in the middle of one). */
    const runTools = async () => {
      const last = job.messages[job.messages.length - 1];
      const pending = last?.role === 'assistant' && Array.isArray(last.content) ? last.content.filter(b => b.type === 'tool_use') : [];
      if (!pending.length) return false;
      const results = [];
      for (const b of pending) {
        if (b.name !== 'noema_web_image') { results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: 'Unknown tool' }); continue; }
        try {
          const url = String(b.input?.url || ''); if (!/^https?:\/\//.test(url)) throw new Error('url must start with https://');
          const got = job.images[url] || await webImage(url);
          job.images[url] = { data: got.data, w: got.w, h: got.h, mime: got.mime };
          const small = Math.max(got.w, got.h) < 800;
          results.push({ type: 'tool_result', tool_use_id: b.id, content: [
            { type: 'text', text: JSON.stringify({ ok: true, url, w: got.w, h: got.h, mime: got.mime, shown_at: got.pw ? `${got.pw}×${got.ph}` : undefined, note: small ? 'TOO SMALL (< 800 px on the long side): find a larger version or do not use it' : `Register it with "w": ${got.w}, "h": ${got.h}; region coordinates in that size.` }) },
            ...(got.preview ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: got.preview } }] : [])] });
          log(`   ✓ picture ${got.w}×${got.h}${small ? ' (too small)' : ''}`);
        } catch (e) { results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: e.message + ' — try another picture (a direct image url).' }); log('   ✗ ' + e.message); }
      }
      job.messages.push({ role: 'user', content: results }); await save();
      return true;
    };
    job.status = 'running'; job.error = null; await save(); onUpdate(job);
    try {
      await runTools();
      for (; ;) {
        if (signal?.aborted) throw new ApiError('Stopped.', 0, 'aborted');
        if (job.turns >= (job.maxTurns || 200)) { job.status = 'paused'; job.error = 'Claude has worked for a very long time. Press Resume to let it continue, or Stop.'; break; }
        if (cost(job.usage, job.model) >= job.budget) { job.status = 'budget'; job.error = `The spending limit of $${job.budget} is reached (≈ $${cost(job.usage, job.model).toFixed(2)} so far). Raise it and press Resume, or stop.`; break; }
        const body = { model: job.model, max_tokens: 16000, system: [{ type: 'text', text: SYSTEM(job), cache_control: { type: 'ephemeral' } }],
          container: { ...(job.containerId ? { id: job.containerId } : {}), skills: [{ type: 'custom', skill_id: job.skillId, version: 'latest' }] },
          tools: toolsFor(job), messages: withCache(job.messages) };
        let r;
        try { r = await api(key, '/v1/messages', { method: 'POST', json: body, signal }); }
        catch (e) {
          // some accounts may not accept PDFs inside the container: attach them as documents instead (once)
          if (e.status === 400 && job.turns === 0 && !job.pdfAsDoc && /container_upload|file type|not supported/i.test(e.message) && job.files.some(f => /pdf/.test(f.type))) {
            job.pdfAsDoc = true; job.messages[0] = firstMessage(job, true); log('ℹ️ Attaching the PDFs as documents instead'); await save(); continue;
          }
          // web search is switched off for some API organisations (Console → Settings → Privacy / Web search): go on without it
          if (e.status === 400 && !job.noSearch && /web.?search/i.test(e.message)) {
            job.noSearch = true; job.messages.push({ role: 'user', content: [{ type: 'text', text: 'Note from the app: the web_search tool is not available for this API key. For web pictures use direct image URLs you know well (Wikimedia Commons originals on upload.wikimedia.org, OpenStax, NIH, NASA) with noema_web_image.' }] });
            log('ℹ️ Web search is off for this API key (it can be switched on in the Claude Console) — continuing without it'); await save(); continue;
          }
          if (e.status === 400 && job.kind === 'node' && !job.noFetch && /web.?fetch/i.test(e.message)) { job.noFetch = true; log('ℹ️ Web fetch is off for this API key — continuing with web search only'); await save(); continue; }
          if (e.status === 404 && job.containerId && /container/i.test(e.message)) { job.containerId = null; log('ℹ️ The previous sandbox expired — Claude starts a fresh one and rebuilds from the conversation'); continue; }
          throw e;
        }
        job.turns++;
        const u = r.usage || {}; const U = job.usage;
        U.input = (U.input || 0) + (u.input_tokens || 0); U.output = (U.output || 0) + (u.output_tokens || 0);
        U.cacheRead = (U.cacheRead || 0) + (u.cache_read_input_tokens || 0); U.cacheWrite = (U.cacheWrite || 0) + (u.cache_creation_input_tokens || 0);
        U.searches = (U.searches || 0) + (u.server_tool_use?.web_search_requests || 0);
        if (r.container?.id) job.containerId = r.container.id;
        const content = r.content || [];
        job.messages.push({ role: 'assistant', content });
        content.forEach(b => log(describe(b)));
        job.outputIds.push(...fileIdsIn(content));
        await save(); onUpdate(job);
        if (r.stop_reason === 'pause_turn') continue;
        if (r.stop_reason === 'tool_use') { await runTools(); continue; }
        if (r.stop_reason === 'max_tokens') { job.messages.push({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] }); await save(); continue; }
        // end_turn / refusal: is there a pack?
        const pack = await findPack(job, key, log);
        if (pack) { job.status = 'done'; job.result = { subjectId: pack.subject.id }; job.pack = pack; await save(); onUpdate(job); return job; }
        const lastText = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (r.stop_reason === 'refusal') { job.status = 'failed'; job.error = 'Claude declined to continue: ' + lastText.slice(0, 400); break; }
        job.status = 'question'; job.question = lastText || 'Claude stopped without a pack. Tell it what to do next (for example: “Continue and finish the pack”).'; break;
      }
    } catch (e) {
      job.status = e.type === 'aborted' ? 'paused' : 'error'; job.error = e.type === 'aborted' ? 'Stopped — press Resume to continue later.' : e.message;
    }
    await save(); onUpdate(job); return job;
  }
  async function answer(job, key, text, opts) {
    job.messages.push({ role: 'user', content: [{ type: 'text', text: String(text || 'Continue and finish the pack.') }] }); job.question = null;
    return run(job, key, opts);
  }
  async function findPack(job, key, log) {
    for (const id of [...new Set(job.outputIds)].reverse()) {
      let meta; try { meta = await api(key, '/v1/files/' + id, { retries: 3 }); } catch (e) { continue; }
      if (!/\.json$/i.test(meta?.filename || '')) continue;
      try {
        const r = await api(key, `/v1/files/${id}/content`, { raw: true, retries: 3 }); const p = JSON.parse(await r.text());
        if (p?.subject?.id && Array.isArray(p.chapters) && p.chapters.length) { log(`📦 Pack received: ${meta.filename} (${Math.round((meta.size_bytes || 0) / 1024)} KB)`); await fillWebPictures(p, job.images, log); return p; }
      } catch (e) { log('⚠️ ' + meta.filename + ' is not a valid pack: ' + e.message); }
    }
    return null;
  }

  return { Key, ApiError, api, models, defaultModel, cost, priceOf, ensureSkill, uploadFile, create, run, answer, jobs, getJob: id => DB.get(id), deleteJob: id => DB.del(id), saveJob: j => DB.put(j), webImage, fillWebPictures, SYSTEM };
})();
