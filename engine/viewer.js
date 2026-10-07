/* noema-lite — 👁 file preview overlay. NoemaViewer.open({ blob | url, name, type, page, title, subtitle })
   Opens a source file (or any file) on top of the app. Libraries are loaded only for the type that needs them
   (engine/vendor/pdfjs, engine/vendor/viewer — see engine/vendor/viewer/README.md).
   Supported: PDF (pages, zoom, jump to a page) · images (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, SVG, HEIC/HEIF, TIFF)
   · text & code (TXT, LOG, MD, JSON, XML, YAML, INI, CSV/TSV as a table, source code) · HTML (sandboxed) · Word
   DOCX · OpenDocument ODT/ODP · RTF · spreadsheets XLSX/XLSM/XLSB/XLS/ODS/NUMBERS · PowerPoint PPTX · EPUB ·
   Jupyter IPYNB · e-mail EML · ZIP (browse and open inner files) · audio & video · YouTube / web pages ·
   legacy DOC/PPT/MSG and anything else: readable text extracted, else a hex view — always with ⬇️ download. */
window.NoemaViewer = (() => {
  const BASE = () => window.NOEMA_VENDOR_BASE || 'engine/vendor/';
  const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v); else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
  const loaded = {};
  const script = src => loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE() + src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('could not load ' + src)); }; document.head.append(s); }));
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
  const sanitize = html => window.DOMPurify ? DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) : html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const ext = name => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/) || [])[1] || '';

  const KINDS = {
    pdf: ['pdf'], image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'jfif', 'apng'], heic: ['heic', 'heif'], tiff: ['tif', 'tiff'],
    markdown: ['md', 'markdown', 'mdown'], csv: ['csv', 'tsv'], json: ['json', 'geojson', 'jsonl'], html: ['html', 'htm', 'xhtml'],
    text: ['txt', 'log', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'toml', 'sql', 'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'r', 'm', 'swift', 'kt', 'scala', 'lua', 'pl', 'tex', 'bib', 'srt', 'vtt', 'css', 'scss', 'less', 'svgz', 'properties', 'env', 'gradle', 'dockerfile', 'makefile'],
    docx: ['docx', 'docm', 'dotx'], odt: ['odt', 'odp', 'ott'], rtf: ['rtf'], sheet: ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'numbers', 'fods'], pptx: ['pptx', 'ppsx', 'potx'],
    epub: ['epub'], ipynb: ['ipynb'], eml: ['eml', 'mht', 'mhtml'], zip: ['zip', 'jar', 'kmz'], audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'], video: ['mp4', 'webm', 'ogv', 'mov', 'm4v'],
    legacy: ['doc', 'ppt', 'msg', 'wps', 'pages', 'key'],
  };
  function kindOf(name, type = '') {
    const e = ext(name); for (const [k, list] of Object.entries(KINDS)) if (list.includes(e)) return k;
    const t = type.toLowerCase();
    if (t.includes('pdf')) return 'pdf'; if (/heic|heif/.test(t)) return 'heic'; if (t.includes('tiff')) return 'tiff'; if (t.startsWith('image/')) return 'image';
    if (t.startsWith('audio/')) return 'audio'; if (t.startsWith('video/')) return 'video'; if (t.includes('html')) return 'html'; if (t.includes('json')) return 'json';
    if (t.includes('csv')) return 'csv'; if (t.includes('markdown')) return 'markdown'; if (t.includes('wordprocessingml')) return 'docx'; if (t.includes('spreadsheet') || t.includes('excel')) return 'sheet';
    if (t.includes('presentationml')) return 'pptx'; if (t.includes('epub')) return 'epub'; if (t.includes('zip')) return 'zip'; if (t.startsWith('text/')) return 'text'; if (t.includes('rfc822')) return 'eml';
    return 'unknown';
  }
  const LABEL = { pdf: 'PDF', image: 'Picture', heic: 'HEIC photo', tiff: 'TIFF picture', markdown: 'Markdown', csv: 'Table (CSV)', json: 'JSON', html: 'Web page', text: 'Text', docx: 'Word document', odt: 'OpenDocument', rtf: 'Rich text', sheet: 'Spreadsheet', pptx: 'PowerPoint', epub: 'E-book', ipynb: 'Jupyter notebook', eml: 'E-mail', zip: 'ZIP archive', audio: 'Audio', video: 'Video', legacy: 'Older Office file', unknown: 'File', youtube: 'YouTube video', web: 'Web page' };

  /* ---------- text helpers ---------- */
  function decode(buf) {
    const u = new Uint8Array(buf);
    if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder('utf-16le').decode(u);
    if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder('utf-16be').decode(u);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch (e) { }
    let greek = 0; for (let i = 0; i < Math.min(u.length, 4000); i++) if (u[i] >= 0xc1 && u[i] <= 0xfe) greek++;
    try { return new TextDecoder(greek > 30 ? 'windows-1253' : 'windows-1252').decode(u); } catch (e) { return new TextDecoder().decode(u); }
  }
  function csvParse(text) {
    const first = text.split('\n')[0]; const d = [',', ';', '\t', '|'].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true; else if (ch === d) { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; if (rows.length > 5000) break; } else f += ch;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  const table = rows => { const t = h('table', { class: 'vw-table' }); rows.slice(0, 5000).forEach((r, i) => t.append(h('tr', {}, ...r.map(c => h(i ? 'td' : 'th', {}, c))))); return t; };
  const pre = t => h('pre', { class: 'vw-pre' }, t);
  const sandboxed = html => { const f = h('iframe', { class: 'vw-frame', sandbox: 'allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer' }); f.srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1e293b}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>${html}`; return f; };
  function strings(buf) {   // readable text inside a binary file (legacy DOC/PPT/MSG…)
    const u = new Uint8Array(buf); const out = []; let cur = '';
    for (let i = 0; i + 1 < u.length; i += 2) { const c = u[i] | (u[i + 1] << 8); if ((c >= 32 && c < 0xd800 && c !== 0xfffd) || c === 10 || c === 13 || c === 9) cur += String.fromCharCode(c); else { if (cur.trim().length >= 6) out.push(cur); cur = ''; } }
    if (cur.trim().length >= 6) out.push(cur); cur = '';
    for (let i = 0; i < u.length; i++) { const c = u[i]; if (c >= 32 && c < 127 || c === 10 || c === 13) cur += String.fromCharCode(c); else { if (cur.trim().length >= 8) out.push(cur); cur = ''; } }
    const seen = new Set(); return out.map(s => s.replace(/\r/g, '\n').trim()).filter(s => /[A-Za-zΑ-ωА-я]{3}/.test(s) && !seen.has(s) && seen.add(s)).join('\n\n');
  }
  function hex(buf) { const u = new Uint8Array(buf.slice(0, 4096)); const lines = []; for (let i = 0; i < u.length; i += 16) { const b = [...u.slice(i, i + 16)]; lines.push(i.toString(16).padStart(6, '0') + '  ' + b.map(x => x.toString(16).padStart(2, '0')).join(' ').padEnd(48) + '  ' + b.map(x => x >= 32 && x < 127 ? String.fromCharCode(x) : '.').join('')); } return lines.join('\n'); }
  const isTexty = buf => { const u = new Uint8Array(buf.slice(0, 2000)); let bad = 0; for (const c of u) if (c < 9 || (c > 13 && c < 32)) bad++; return u.length && bad / u.length < 0.02; };

  /* ---------- renderers: (ctx) → element ---------- */
  const R = {};
  R.pdf = async ({ buf, page, url, bar }) => {
    let lib;
    try { lib = await import(new URL(BASE() + 'pdfjs/pdf.min.mjs', location.href).href); }
    catch (e) { const u = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })); return h('iframe', { class: 'vw-frame', src: u + (page ? '#page=' + page : '') }); }   // file:// pages: the browser's own PDF viewer
    lib.GlobalWorkerOptions.workerSrc = new URL(BASE() + 'pdfjs/pdf.worker.min.mjs', location.href).href;
    const root = new URL(BASE() + 'pdfjs/', location.href).href;
    let doc;
    try { doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), cMapUrl: root + 'cmaps/', cMapPacked: true, standardFontDataUrl: root + 'standard_fonts/', wasmUrl: root + 'wasm/', isEvalSupported: false }).promise; }
    catch (e) { if (/password/i.test(e.name + e.message)) throw new Error('the PDF is password-protected'); console.warn('[viewer] pdf.js', e); const u = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })); return h('iframe', { class: 'vw-frame', src: u + (page ? '#page=' + page : '') }); }
    const wrap = h('div', { class: 'vw-pdf' }); let scale = Math.min(1.6, (innerWidth - 48) / 640); const pages = [];
    const status = h('span', { class: 'vw-pg' }); const goto = h('input', { class: 'vw-pgin', type: 'number', min: 1, max: doc.numPages, value: page || 1, 'aria-label': 'Page' });
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) draw(+e.target.dataset.n); }), { root: null, rootMargin: '600px 0px' });
    const vp0 = (await doc.getPage(1)).getViewport({ scale: 1 });
    for (let n = 1; n <= doc.numPages; n++) { const d = h('div', { class: 'vw-page', 'data-n': n, style: { width: vp0.width * scale + 'px', height: vp0.height * scale + 'px' } }, h('span', { class: 'vw-pgno' }, n)); pages.push(d); wrap.append(d); io.observe(d); }
    const drawn = {};
    async function draw(n) {
      if (drawn[n] === scale) return; drawn[n] = scale;
      const p = await doc.getPage(n); const vp = p.getViewport({ scale }); const ratio = window.devicePixelRatio || 1;
      const c = h('canvas', { width: Math.floor(vp.width * ratio), height: Math.floor(vp.height * ratio), style: { width: vp.width + 'px', height: vp.height + 'px' } });
      const d = pages[n - 1]; d.style.width = vp.width + 'px'; d.style.height = vp.height + 'px';
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise;
      d.querySelector('canvas')?.remove(); d.prepend(c);
    }
    const jump = n => { n = Math.max(1, Math.min(doc.numPages, n | 0)); pages[n - 1].scrollIntoView({ block: 'start' }); goto.value = n; };
    const rezoom = f => { const cur = +goto.value || 1; scale = Math.max(0.4, Math.min(4, scale * f)); pages.forEach(d => { d.style.width = vp0.width * scale + 'px'; d.style.height = vp0.height * scale + 'px'; }); Object.keys(drawn).forEach(k => delete drawn[k]); setTimeout(() => jump(cur), 30); };
    goto.addEventListener('change', () => jump(+goto.value));
    status.textContent = '/ ' + doc.numPages;
    bar.append(h('button', { class: 'vw-btn', 'aria-label': 'Previous page', onclick: () => jump(+goto.value - 1) }, '‹'), goto, status, h('button', { class: 'vw-btn', 'aria-label': 'Next page', onclick: () => jump(+goto.value + 1) }, '›'),
      h('button', { class: 'vw-btn', 'aria-label': 'Zoom out', onclick: () => rezoom(1 / 1.2) }, '−'), h('button', { class: 'vw-btn', 'aria-label': 'Zoom in', onclick: () => rezoom(1.2) }, '+'));
    wrap.addEventListener('scroll', () => { const t = wrap.scrollTop; let n = 1; for (const d of pages) { if (d.offsetTop - 40 <= t) n = +d.dataset.n; else break; } goto.value = n; }, { passive: true });
    wrap._after = () => { if (page && page > 1) jump(page); };
    wrap.dataset.pages = doc.numPages;
    return wrap;
  };
  R.image = async ({ blob }) => { const u = URL.createObjectURL(blob); const img = h('img', { class: 'vw-img', src: u, alt: '' }); img.addEventListener('click', () => img.classList.toggle('zoom')); return h('div', { class: 'vw-center' }, img); };
  R.heic = async ({ blob }) => { await script('viewer/heic2any.min.js'); const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 }); return R.image({ blob: Array.isArray(out) ? out[0] : out }); };
  R.tiff = async ({ buf }) => {
    await script('viewer/pako_inflate.min.js').catch(() => { }); await script('viewer/UTIF.js');
    const ifds = UTIF.decode(buf); const wrap = h('div', { class: 'vw-center vw-col' });
    for (const ifd of ifds.slice(0, 30)) { UTIF.decodeImage(buf, ifd); const rgba = UTIF.toRGBA8(ifd); const c = h('canvas', { width: ifd.width, height: ifd.height, class: 'vw-img' }); const ctx = c.getContext('2d'); const im = ctx.createImageData(ifd.width, ifd.height); im.data.set(rgba); ctx.putImageData(im, 0, 0); wrap.append(c); }
    return wrap;
  };
  R.text = async ({ buf }) => pre(decode(buf));
  R.markdown = async ({ buf }) => { const d = h('div', { class: 'vw-doc' }); d.innerHTML = sanitize(window.marked ? marked.parse(decode(buf)) : '<pre>' + decode(buf).replace(/</g, '&lt;') + '</pre>'); return d; };
  R.csv = async ({ buf }) => h('div', { class: 'vw-scroll' }, table(csvParse(decode(buf))));
  R.json = async ({ buf, name }) => { const t = decode(buf); if (ext(name) === 'jsonl') return pre(t); try { return pre(JSON.stringify(JSON.parse(t), null, 2)); } catch (e) { return pre(t); } };
  R.html = async ({ buf }) => sandboxed(sanitize(decode(buf)));
  R.docx = async ({ buf }) => { await script('viewer/mammoth.browser.min.js'); const r = await mammoth.convertToHtml({ arrayBuffer: buf }, { convertImage: mammoth.images.dataUri }); const d = h('div', { class: 'vw-doc' }); d.innerHTML = sanitize(r.value); return d; };
  const zip = async buf => { await script('viewer/jszip.min.js'); return JSZip.loadAsync(buf); };
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  R.odt = async ({ buf }) => {
    const z = await zip(buf); const doc = xml(await z.file('content.xml').async('string')); const d = h('div', { class: 'vw-doc' });
    const walk = n => { for (const c of n.childNodes) { if (c.nodeType !== 1) continue; const ln = c.localName; if (ln === 'h') d.append(h('h3', {}, c.textContent)); else if (ln === 'p') { if (c.textContent.trim()) d.append(h('p', {}, c.textContent)); } else if (ln === 'page' || ln === 'frame') { d.append(h('hr')); walk(c); } else walk(c); } };
    walk(doc.documentElement); if (!d.children.length) d.append(h('p', {}, '(no text found)')); return d;
  };
  R.rtf = async ({ buf }) => {
    let s = new TextDecoder('latin1').decode(new Uint8Array(buf)); const cp = +(s.match(/\\ansicpg(\d+)/) || [])[1] || 1252;
    let dec; try { dec = new TextDecoder('windows-' + cp); } catch (e) { dec = new TextDecoder('windows-1252'); }
    s = s.replace(/\{\\\*[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '').replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}\s*\}/g, '');
    s = s.replace(/\\u(-?\d+)\??/g, (m, n) => String.fromCharCode(n < 0 ? 65536 + +n : +n)).replace(/\\'([0-9a-f]{2})/gi, (m, x) => dec.decode(new Uint8Array([parseInt(x, 16)])));
    s = s.replace(/\\(par|line)\b ?/g, '\n').replace(/\\tab\b ?/g, '\t').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n');
    return h('div', { class: 'vw-doc' }, ...s.trim().split(/\n+/).filter(x => x.trim()).map(p => h('p', {}, p)));
  };
  R.sheet = async ({ buf }) => {
    await script('viewer/xlsx.full.min.js'); const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    const out = h('div', { class: 'vw-sheet' }); const tabs = h('div', { class: 'vw-tabs' }); const body = h('div', { class: 'vw-scroll' });
    const show = n => { body.innerHTML = sanitize(XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' })); [...tabs.children].forEach(b => b.classList.toggle('on', b.textContent === n)); };
    wb.SheetNames.forEach(n => tabs.append(h('button', { class: 'vw-tab', onclick: () => show(n) }, n))); out.append(tabs, body); show(wb.SheetNames[0]); return out;
  };
  R.pptx = async ({ buf }) => {
    const z = await zip(buf); const files = Object.keys(z.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    const wrap = h('div', { class: 'vw-slides' });
    for (const [i, f] of files.entries()) {
      const doc = xml(await z.file(f).async('string')); const card = h('div', { class: 'vw-slide' }, h('div', { class: 'vw-slideno' }, 'Slide ' + (i + 1)));
      const relF = f.replace('slides/', 'slides/_rels/') + '.rels'; const rels = {};
      if (z.file(relF)) for (const r of xml(await z.file(relF).async('string')).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
      for (const p of doc.getElementsByTagNameNS('*', 'p')) { const t = [...p.getElementsByTagNameNS('*', 't')].map(x => x.textContent).join(''); if (t.trim()) card.append(h('p', {}, t)); }
      for (const b of doc.getElementsByTagNameNS('*', 'blip')) { const id = b.getAttribute('r:embed') || b.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'); const tgt = rels[id]; if (!tgt) continue; const path = 'ppt/' + tgt.replace(/^\.\.\//, ''); const zf = z.file(path); if (zf && /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(path)) card.append(h('img', { class: 'vw-img', src: URL.createObjectURL(await zf.async('blob')), alt: '' })); }
      wrap.append(card);
    }
    if (!files.length) wrap.append(h('p', {}, '(no slides found)'));
    return wrap;
  };
  R.epub = async ({ buf }) => {
    const z = await zip(buf); const cont = xml(await z.file('META-INF/container.xml').async('string')); const opfPath = cont.getElementsByTagName('rootfile')[0].getAttribute('full-path');
    const opf = xml(await z.file(opfPath).async('string')); const dir = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
    const items = {}; for (const it of opf.getElementsByTagName('item')) items[it.getAttribute('id')] = it.getAttribute('href');
    const resolve = (base, rel) => { const parts = (base.replace(/[^/]+$/, '') + rel).split('/'); const out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); } return decodeURIComponent(out.join('/')); };
    let html = '';
    for (const ref of opf.getElementsByTagName('itemref')) {
      const href = items[ref.getAttribute('idref')]; if (!href) continue; const path = dir + href; const f = z.file(decodeURIComponent(path)); if (!f) continue;
      const doc = new DOMParser().parseFromString(await f.async('string'), 'text/html');
      for (const img of doc.querySelectorAll('img, image')) { const src = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href'); const zf = src && z.file(resolve(path, src)); if (zf) { const u = URL.createObjectURL(await zf.async('blob')); img.setAttribute('src', u); img.setAttribute('href', u); } }
      html += `<section>${doc.body ? doc.body.innerHTML : ''}</section><hr>`;
    }
    const d = h('div', { class: 'vw-doc' }); d.innerHTML = sanitize(html || '<p>(empty book)</p>'); return d;
  };
  R.ipynb = async ({ buf }) => {
    const nb = JSON.parse(decode(buf)); const d = h('div', { class: 'vw-doc' }); const src = x => Array.isArray(x) ? x.join('') : String(x || '');
    for (const c of nb.cells || []) {
      if (c.cell_type === 'markdown') { const m = h('div'); m.innerHTML = sanitize(window.marked ? marked.parse(src(c.source)) : src(c.source)); d.append(m); }
      else { d.append(h('pre', { class: 'vw-pre vw-code' }, src(c.source))); for (const o of c.outputs || []) { if (o.text) d.append(h('pre', { class: 'vw-pre vw-out' }, src(o.text))); if (o.data?.['image/png']) d.append(h('img', { class: 'vw-img', src: 'data:image/png;base64,' + src(o.data['image/png']).replace(/\s/g, '') })); else if (o.data?.['text/plain']) d.append(h('pre', { class: 'vw-pre vw-out' }, src(o.data['text/plain']))); } }
    }
    return d;
  };
  R.eml = async ({ buf }) => {
    const raw = new TextDecoder('latin1').decode(new Uint8Array(buf));
    const split = s => { const i = s.search(/\r?\n\r?\n/); const head = i < 0 ? s : s.slice(0, i); const body = i < 0 ? '' : s.slice(i).replace(/^\r?\n\r?\n/, ''); const H = {}; head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(l => { const m = l.match(/^([\w-]+):\s*(.*)$/); if (m) H[m[1].toLowerCase()] = m[2]; }); return { H, body }; };
    const words = s => String(s || '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (m, cs, enc, t) => { try { const bytes = enc.toLowerCase() === 'b' ? Uint8Array.from(atob(t), c => c.charCodeAt(0)) : Uint8Array.from(t.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (x, hh) => String.fromCharCode(parseInt(hh, 16))), c => c.charCodeAt(0)); return new TextDecoder(cs).decode(bytes); } catch (e) { return t; } });
    const body = (p) => { const cte = (p.H['content-transfer-encoding'] || '').toLowerCase(); const cs = (p.H['content-type'] || '').match(/charset="?([\w-]+)/i)?.[1] || 'utf-8'; let bytes; if (cte === 'base64') bytes = Uint8Array.from(atob(p.body.replace(/\s/g, '')), c => c.charCodeAt(0)); else if (cte === 'quoted-printable') bytes = Uint8Array.from(p.body.replace(/=\r?\n/g, '').replace(/=([0-9a-f]{2})/gi, (x, hh) => String.fromCharCode(parseInt(hh, 16))), c => c.charCodeAt(0)); else bytes = Uint8Array.from(p.body, c => c.charCodeAt(0)); try { return new TextDecoder(cs).decode(bytes); } catch (e) { return new TextDecoder().decode(bytes); } };
    const top = split(raw); let html = null, text = null;
    const visit = part => { const raw = part.H['content-type'] || 'text/plain'; const ct = raw.toLowerCase(); const b = raw.match(/boundary="?([^";]+)"?/i); /* the boundary is case-sensitive */ if (ct.startsWith('multipart/') && b) part.body.split('--' + b[1]).slice(1).forEach(s => { if (!s.startsWith('--')) visit(split(s.replace(/^\r?\n/, ''))); }); else if (ct.startsWith('text/html') && html == null) html = body(part); else if (ct.startsWith('text/plain') && text == null) text = body(part); };
    visit(top);
    const head = h('div', { class: 'vw-mailhead' }, ...['from', 'to', 'date', 'subject'].filter(k => top.H[k]).map(k => h('div', {}, h('b', {}, k[0].toUpperCase() + k.slice(1) + ': '), words(top.H[k]))));
    return h('div', { class: 'vw-col' }, head, html != null ? sandboxed(sanitize(html)) : pre(text || '(empty)'));
  };
  R.zip = async ({ buf, openInner }) => {
    const z = await zip(buf); const entries = Object.values(z.files).filter(f => !f.dir);
    const t = h('table', { class: 'vw-table' }, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Size'), h('th', {}, '')));
    for (const f of entries.slice(0, 2000)) t.append(h('tr', {}, h('td', {}, f.name), h('td', {}, fmtSize(f._data?.uncompressedSize || 0)), h('td', {}, h('button', { class: 'vw-btn', onclick: async () => openInner({ blob: await f.async('blob'), name: f.name.split('/').pop() }) }, '👁 Open'))));
    return h('div', { class: 'vw-scroll' }, h('p', { class: 'vw-note' }, `${entries.length} files`), t);
  };
  R.audio = async ({ blob }) => h('div', { class: 'vw-center' }, h('audio', { controls: true, src: URL.createObjectURL(blob), class: 'vw-media' }));
  R.video = async ({ blob }) => h('div', { class: 'vw-center' }, h('video', { controls: true, src: URL.createObjectURL(blob), class: 'vw-media', playsinline: true }));
  R.legacy = async ({ buf }) => { const t = strings(buf); return h('div', { class: 'vw-col' }, h('p', { class: 'vw-note' }, 'Older binary Office format: showing the text found inside it. Download the file for the full layout.'), pre(t || '(no readable text found)')); };
  R.unknown = async ({ buf }) => isTexty(buf) ? pre(decode(buf)) : h('div', { class: 'vw-col' }, h('p', { class: 'vw-note' }, 'This type cannot be shown here — download it to open it in its own program. First bytes:'), pre(hex(buf)), (() => { const t = strings(buf); return t ? h('details', {}, h('summary', {}, 'Readable text inside'), pre(t)) : null; })());

  /* ---------- web addresses ---------- */
  function youtube(u, start) {
    const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/); if (!m) return null;
    const t = start ?? (+(String(u).match(/[?&]t=(\d+)/) || [])[1] || 0);
    return `https://www.youtube-nocookie.com/embed/${m[1]}${t ? '?start=' + t : ''}`;
  }
  async function fetchFile(url) {
    const site = (window.NOEMA_CONFIG?.siteUrl || (location.protocol.startsWith('http') ? location.origin : '')).replace(/\/$/, '');
    for (const get of [() => fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' }), site ? () => fetch(site + '/api/file?url=' + encodeURIComponent(url)) : null].filter(Boolean)) {
      try { const r = await get(); if (r.ok) { const b = await r.blob(); return b; } } catch (e) { }
    }
    return null;
  }

  /* ---------- the overlay ---------- */
  async function open(o) {
    document.querySelector('.vw-ov')?.remove();
    const bar = h('div', { class: 'vw-tools' }); const body = h('div', { class: 'vw-body' }, h('div', { class: 'vw-loading' }, '⏳ Opening…'));
    const close = () => { ov.remove(); document.removeEventListener('keydown', esc); o.onClose?.(); };
    const esc = e => { if (e.key === 'Escape') close(); };
    const title = h('div', { class: 'vw-title' }, h('b', {}, o.title || o.name || 'File'), h('span', { class: 'vw-sub' }, o.subtitle || ''));
    const right = h('div', { class: 'vw-right' });
    const ov = h('div', { class: 'vw-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Preview: ' + (o.title || o.name || 'file') },
      h('div', { class: 'vw-head' }, title, bar, right, h('button', { class: 'vw-btn vw-close', 'aria-label': 'Close', onclick: close }, '✕')), body);
    document.body.append(ov); document.addEventListener('keydown', esc);
    const fail = (m, extra) => { body.innerHTML = ''; body.append(h('div', { class: 'vw-center vw-col' }, h('p', { class: 'vw-note' }, '⚠️ ' + m), extra || null)); };
    try {
      let blob = o.blob, name = o.name || (o.url ? decodeURIComponent(String(o.url).split(/[?#]/)[0].split('/').pop() || 'file') : 'file');
      if (!blob && o.url) {
        const yt = youtube(o.url, o.start);
        right.append(h('a', { class: 'vw-btn', href: o.url, target: '_blank', rel: 'noopener' }, '↗ Open'));
        if (yt) { body.innerHTML = ''; body.append(h('iframe', { class: 'vw-frame vw-yt', src: yt, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true })); return { close, kind: 'youtube' }; }
        if (kindOf(name) === 'unknown' || kindOf(name) === 'html') {   // a web page: show it framed (some sites refuse to be framed → the ↗ Open button)
          body.innerHTML = ''; body.append(h('p', { class: 'vw-note' }, 'Web page — if it stays empty, the site does not allow previews: use ↗ Open.'), h('iframe', { class: 'vw-frame', src: o.url, sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms', referrerpolicy: 'no-referrer' }));
          return { close, kind: 'web' };
        }
        blob = await fetchFile(o.url);
        if (!blob) { fail('The file could not be downloaded for a preview.', h('a', { class: 'vw-btn', href: o.url, target: '_blank', rel: 'noopener' }, '↗ Open the original')); return { close, kind: 'error' }; }
      }
      const kind = o.kind || kindOf(name, o.type || blob.type);
      title.querySelector('.vw-sub').textContent = [o.subtitle, LABEL[kind], fmtSize(blob.size)].filter(Boolean).join(' · ');
      const dl = URL.createObjectURL(blob);
      right.append(h('a', { class: 'vw-btn', href: dl, download: name, title: 'Download' }, '⬇️'), h('a', { class: 'vw-btn', href: dl, target: '_blank', rel: 'noopener', title: 'Open in a new tab' }, '↗'));
      const buf = await blob.arrayBuffer();
      const el = await R[kind]({ blob, buf, name, page: o.page, bar, openInner: x => open({ ...x, onClose: null }) });
      body.innerHTML = ''; body.append(el); el._after?.();
      ov.dataset.kind = kind; return { close, kind };
    } catch (e) { console.warn('[viewer]', e); fail('This file could not be shown (' + e.message + '). You can still download it.'); return { close, kind: 'error' }; }
  }
  return { open, kindOf, LABEL, KINDS, youtube };
})();
