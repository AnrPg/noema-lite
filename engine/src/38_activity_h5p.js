/* ===================== interactive activities — runtime h5p@1 (an ordinary .h5p package; docs/activities-dev/h5p.md, docs/adr/001 D11) =====================
   An H5P item (quiz, drag and drop, fill in the blanks …) is played by the app's own pinned H5P player (h5p-standalone 3.8.2's core,
   engine/vendor/h5p/3.8.2/player.js, never loaded from h5p.org) in exactly the frames of html-app@1: the app's frame holds a wrapper
   without scripts whose policy says frame-src 'none' (no self-navigation), the item runs in the wrapper's own frame with
   sandbox="allow-scripts" (opaque origin) and a CSP with no network at all and scripts ONLY by hash.
   The frame never fetches anything. The HOST page reads the package (inline base64, bytes, a loader function, or a URL it fetches
   itself), checks its sha256, unzips it (DecompressionStream, no zip library), checks it against the allow-list (check(), the same
   rules as tools/h5p_check.py) and builds the frame's document: the core and every library's preloadedJs as inline scripts (each with
   the loop guard of 33_activity_guard.js, then allowed by its hash), every preloadedCss as an inline style with its url()s turned into
   data: URIs, content.json inside H5PIntegration. The content's own files (pictures, audio, video) are handed over the MessagePort as
   transferred ArrayBuffers right after the handshake; inside, H5P.getPath answers with blob: URLs made from them.
   What H5P says becomes the activity protocol (docs/INTERACTIVE.md §8):
     xAPI answered / completed of the item itself (no parent) with a score → result { score: scaled 0..1, passed: success ?? score >= 0.5, detail }
     every xAPI statement → event { name: 'h5p:<verb>', data: { score?, sub? } } (throttled)
     instance.getCurrentState() after each statement, on pause and before destroy → state { version, data: { h5p: <state> } };
     init.state comes back as H5P's contentUserData, so the item resumes where the learner left it.
   act (a registry item, runtime 'h5p@1'):
     h5p        the .h5p file: a base64 string (or { data: base64 }), an ArrayBuffer / Uint8Array / Blob, a function returning one of
                these (or a promise), or { url } — fetched by this page, never by the frame
     sha256     hex sha256 of the .h5p file (required for { url }; checked whenever given)
     h5pByLocale { <locale>: { content: <content.json>, l10n?: {…H5P core strings} } | { h5p: <source>, sha256 } } — the item in the
                language the pack is shown in (init.locale); without one the package's own content.json plays */
(() => {
  /* i18n-ignore-start */   // code, protocol names and H5P's own English defaults (replaced by h5pByLocale[locale].l10n)
  const PLAYER_VERSION = '3.8.2';
  const LIM = { files: 5000, bytes: 100 * 1024 * 1024, warnBytes: 20 * 1024 * 1024, media: 64 * 1024 * 1024 };
  /** a copy of tools/h5p_allow.json (tests/activities_h5p.js checks that they agree) */
  const ALLOW = {
    content: { 'H5P.MultiChoice': ['1.14', '1.15', '1.16'], 'H5P.TrueFalse': ['1.6', '1.7', '1.8'], 'H5P.DragQuestion': ['1.13', '1.14'], 'H5P.Blanks': ['1.12', '1.13', '1.14'],
      'H5P.DragText': ['1.8', '1.9', '1.10'], 'H5P.MarkTheWords': ['1.9', '1.10', '1.11'], 'H5P.SingleChoiceSet': ['1.10', '1.11'], 'H5P.Summary': ['1.10'], 'H5P.Dialogcards': ['1.8', '1.9'],
      'H5P.QuestionSet': ['1.17', '1.18', '1.19', '1.20'], 'H5P.InteractiveVideo': ['1.24', '1.25', '1.26', '1.27'], 'H5P.BranchingScenario': ['1.7', '1.8'], 'H5P.CoursePresentation': ['1.24', '1.25', '1.26'] },
    untested: ['H5P.QuestionSet', 'H5P.InteractiveVideo', 'H5P.BranchingScenario', 'H5P.CoursePresentation'],
    libraries: { 'H5P.Question': ['1.4', '1.5'], 'H5P.JoubelUI': ['1.3'], 'H5P.FontIcons': ['1.0'], 'H5P.Transition': ['1.0'], FontAwesome: ['4.5'], 'jQuery.ui': ['1.10'], Drop: ['1.0'], Tether: ['1.0'],
      'H5P.AdvancedText': ['1.1'], 'H5P.Text': ['1.1'], 'H5P.Image': ['1.1'], 'H5P.Audio': ['1.4', '1.5'], 'H5P.Video': ['1.5', '1.6'], 'H5P.TextUtilities': ['1.3'], 'H5P.DragNBar': ['1.5'],
      'H5P.DragNDrop': ['1.1'], 'H5P.DragNResize': ['1.2'], 'H5P.Shape': ['1.0'], 'H5P.Table': ['1.1', '1.2'], 'H5P.Link': ['1.3'], 'H5P.Column': ['1.15', '1.16', '1.18'], 'H5P.Components': ['1.0'],
      'H5P.SoundJS': ['0.6'], 'H5P.Timer': ['0.4'], 'H5P.ImageHotspots': ['1.10'], 'H5P.Nil': ['1.0'] },
    refuse: { 'H5P.MathDisplay': 'loads MathJax from a CDN at run time', 'H5P.GoToQuestion': 'needs a host that is not there', 'H5P.Twitter': 'embeds an outside site', 'H5P.IFrameEmbed': 'embeds an outside page',
      'H5P.GoogleMap': 'loads Google Maps', 'H5P.ThreeImage': 'loads outside panoramas', 'H5P.Chart': 'not checked yet' },
    extensions: ['json', 'js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'm4a', 'wav', 'ogg', 'oga', 'mp4', 'm4v', 'webm', 'ogv', 'vtt', 'txt', 'md', 'xml', 'map', 'patch', 'diff', 'csv', 'pdf', 'webvtt', 'tif', 'tiff'],
    noExtension: ['LICENSE', 'LICENCE', 'README', 'COPYING', 'AUTHORS', 'CHANGELOG'],
  };
  const URL_RE = /(\bhttps?:|\bftp:|(^|[\s"'(=])\/\/[a-z0-9-]+(\.[a-z0-9-]+)+|youtube\.com|youtu\.be|\bjavascript:|\bdata:text\/html|\bvbscript:)/i;
  const ATTRIBUTION = new Set(['source', 'link', 'licenseExtras', 'changes']);
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
    ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', vtt: 'text/vtt', webvtt: 'text/vtt', json: 'application/json', txt: 'text/plain' };
  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
  const extOf = n => { const b = n.split('/').pop(); return b.includes('.') ? b.split('.').pop().toLowerCase() : ''; };
  const utf8 = u8 => new TextDecoder('utf-8').decode(u8);

  /* ---------- the package: bytes → {path: Uint8Array} ---------- */
  async function inflate(raw, size) {
    // a stream made from the bytes, not Blob.stream(): WebKit's offline mode fails blob reads ("The I/O read operation failed")
    const src = new ReadableStream({ start(c) { c.enqueue(raw); c.close(); } });
    const rd = src.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const out = new Uint8Array(size); let n = 0;
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      if (n + value.length > size) { try { rd.cancel(); } catch (e) { } throw fail('zip', 'an entry is bigger than it says'); }   // a zip bomb stops here
      out.set(value, n); n += value.length;
    }
    if (n !== size) throw fail('zip', 'an entry is shorter than it says');
    return out;
  }
  /** unzip(bytes) → { path: Uint8Array } (stored and deflated entries; no zip64, no encryption) */
  async function unzip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw fail('zip', 'not a zip file');
    const count = dv.getUint16(e + 10, true), cdOff = dv.getUint32(e + 16, true);
    if (count === 0xffff || cdOff === 0xffffffff) throw fail('zip', 'zip64 is not supported');
    if (count > LIM.files) throw fail('size', count + ' files');
    const out = {}, dec = new TextDecoder(); let p = cdOff, total = 0;
    for (let k = 0; k < count; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw fail('zip', 'a broken central directory');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      if (flags & 1) throw fail('zip', 'an encrypted entry');
      total += usize; if (total > LIM.bytes) throw fail('size', 'more than ' + LIM.bytes + ' bytes unpacked');
      if (loff + 30 > u8.length || dv.getUint32(loff, true) !== 0x04034b50) throw fail('zip', 'a broken entry');
      const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true), raw = u8.subarray(start, start + csize);
      if (method === 0) { if (csize !== usize) throw fail('zip', 'a broken stored entry'); out[name] = raw.slice(); }
      else if (method === 8) out[name] = await inflate(raw, usize);
      else throw fail('zip', 'compression method ' + method);
    }
    return out;
  }

  /* ---------- the rules (the same as tools/h5p_check.py; the messages are the same too) ---------- */
  const allowed = (name, mm) => (ALLOW.content[name] || []).includes(mm) || (ALLOW.libraries[name] || []).includes(mm);
  function walk(v, path, out) {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, path.concat(String(i)), out));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], path.concat(k), out);
    else if (typeof v === 'string') out.push([path, v]);
  }
  /** check(files) → { errors, warnings, main, order (library folders, dependencies first), libs { folder: library.json } } */
  function check(files) {
    const E = [], W = [], names = Object.keys(files);
    const total = names.reduce((s, n) => s + files[n].length, 0);
    if (names.length > LIM.files) E.push(`${names.length} files (at most ${LIM.files})`);
    if (total > LIM.bytes) E.push(`${total} bytes unpacked (at most ${LIM.bytes})`);
    else if (total > LIM.warnBytes) W.push(`${Math.floor(total / (1024 * 1024))} MB unpacked: large for a phone`);
    for (const n of names) {
      const parts = n.split('/');
      if (n.startsWith('/') || n.includes('\\') || parts.some(x => x === '..' || x === '') || parts[0].includes(':')) { E.push(`${n}: a path that leaves the package`); continue; }
      const base = parts[parts.length - 1], ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
      if (!ext && !ALLOW.noExtension.includes(base)) E.push(`${n}: a file without a known type`);
      else if (ext && !ALLOW.extensions.includes(ext)) E.push(`${n}: files of type .${ext} are not allowed`);
      if (ext === 'js' && (n.startsWith('content/') || !n.includes('/'))) E.push(`${n}: a script outside a library folder`);
    }
    const rj = p => JSON.parse(utf8(files[p]));
    if (!files['h5p.json']) { E.push('no h5p.json'); return { errors: E, warnings: W }; }
    let h5p; try { h5p = rj('h5p.json'); } catch (e) { E.push(`h5p.json is not JSON (${e.message})`); return { errors: E, warnings: W }; }
    const main = h5p.mainLibrary, deps = h5p.preloadedDependencies;
    if (typeof h5p.title !== 'string' || !h5p.title.trim()) E.push('h5p.json: no title');
    if (typeof main !== 'string' || !Array.isArray(deps) || !deps.length) { E.push('h5p.json: no mainLibrary or preloadedDependencies'); return { errors: E, warnings: W }; }
    const libs = {}, order = [], seen = new Set(), seenNames = new Set();
    const key = d => { const a = parseInt(d?.majorVersion, 10), b = parseInt(d?.minorVersion, 10); return d && typeof d.machineName === 'string' && d.machineName && String(a) === String(d.majorVersion).trim() && String(b) === String(d.minorVersion).trim() ? [d.machineName, a + '.' + b] : null; };
    function visit(d, why) {
      const k = key(d);
      if (!k) { E.push(`${why}: a dependency without machineName / majorVersion / minorVersion`); return; }
      const [name, mm] = k, id = name + ' ' + mm;
      if (seen.has(id)) return;
      seen.add(id); seenNames.add(name);
      if (Object.prototype.hasOwnProperty.call(ALLOW.refuse, name)) { E.push(`${name} ${mm}: refused (${ALLOW.refuse[name]})`); return; }
      if (!allowed(name, mm)) E.push(`${name} ${mm}: not on the allow-list (tools/h5p_allow.json)`);
      const folder = `${name}-${mm}`;
      if (!files[folder + '/library.json']) { E.push(`${name} ${mm}: missing from the package (${folder}/library.json)`); return; }
      let lj; try { lj = rj(folder + '/library.json'); } catch (e) { E.push(`${folder}/library.json is not JSON`); return; }
      if (lj.machineName !== name || `${lj.majorVersion}.${lj.minorVersion}` !== mm) E.push(`${folder}/library.json names another library`);
      for (const d2 of lj.preloadedDependencies || []) visit(d2, folder);
      for (const kind of ['preloadedJs', 'preloadedCss']) for (const f of lj[kind] || []) { const p = `${folder}/${f?.path || ''}`; if (!files[p]) E.push(`${p}: named in ${kind} but missing`); }
      libs[folder] = lj; order.push(folder);
    }
    for (const d of deps) visit(d, 'h5p.json');
    if (!seenNames.has(main)) E.push(`mainLibrary ${main} is not among the preloadedDependencies`);
    else if (!ALLOW.content[main]) E.push(`${main}: not an allowed content type (tools/h5p_allow.json "content")`);
    else if (ALLOW.untested.includes(main)) W.push(`${main}: allowed, but not yet tested in the sandbox`);
    const tops = [...new Set(names.filter(n => n.includes('/')).map(n => n.split('/')[0]))].filter(t => t !== 'content' && !libs[t]).sort();
    for (const t of tops) W.push(`${t}/: a library no content uses (left out when playing)`);
    let content = null;
    if (!files['content/content.json']) E.push('no content/content.json');
    else {
      try {
        content = rj('content/content.json'); const strs = []; walk(content, [], strs);
        for (const [path, s] of strs) {
          const m = URL_RE.exec(s); if (!m) continue;
          const where = path.join('.');
          if (path.length && ATTRIBUTION.has(path[path.length - 1]) && path.some(x => x === 'metadata' || x === 'copyright')) W.push(`content.json ${where}: an outside link in the attribution (shown as text only)`);
          else E.push(`content.json ${where}: an outside link (${m[0].trim().slice(0, 40)}) — everything must be inside the package`);
        }
        for (const [path, s] of strs) if (path[path.length - 1] === 'path' && !URL_RE.test(s) && !files['content/' + s.split('#')[0]]) W.push(`content.json ${path.join('.')}: ${s} is not in the package`);
      } catch (e) { E.push(`content/content.json is not JSON (${e.message})`); }
    }
    return { errors: E, warnings: W, main, h5p, order, libs, content, bytes: total };
  }

  /* ---------- reading the source of a package (the host page does it; the frame never fetches) ---------- */
  const hex = async u8 => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8)), b => b.toString(16).padStart(2, '0')).join('');
  function b64(s) {
    s = String(s).replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
    const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8;
  }
  async function bytesOf(src, depth = 0) {
    if (src == null) throw fail('nosource', 'act.h5p is missing');
    if (typeof src === 'function' && depth < 2) return bytesOf(await src(), depth + 1);
    if (src instanceof Uint8Array) return src;
    if (src instanceof ArrayBuffer) return new Uint8Array(src);
    if (typeof Blob !== 'undefined' && src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
    if (typeof src === 'string') return b64(src);
    if (typeof src === 'object' && typeof src.data === 'string') return b64(src.data);
    if (typeof src === 'object' && typeof src.url === 'string') {
      if (!src.sha256) throw fail('integrity', 'a package by URL needs its sha256');
      const r = await fetch(src.url, { credentials: 'same-origin', cache: 'force-cache' });
      if (!r.ok) throw fail('fetch', 'HTTP ' + r.status);
      return new Uint8Array(await r.arrayBuffer());
    }
    throw fail('nosource', 'act.h5p has an unknown shape');
  }
  const CACHE = new Map();   // sha256 → { files, check } (the last few packages, so Restart is quick)
  async function load(src, want) {
    const u8 = await bytesOf(src), sum = await hex(u8);
    const w = want || (src && typeof src === 'object' && src.sha256) || null;
    if (w && sum !== String(w).toLowerCase()) throw fail('integrity', 'sha256 mismatch');
    if (CACHE.has(sum)) { const v = CACHE.get(sum); CACHE.delete(sum); CACHE.set(sum, v); return v; }
    const files = await unzip(u8), c = check(files);
    const v = { sha256: sum, files, check: c };
    CACHE.set(sum, v); while (CACHE.size > 3) CACHE.delete(CACHE.keys().next().value);
    return v;
  }
  /** the package for this locale: its own, another package (h5pByLocale[loc].h5p), or its own with another content.json */
  async function prepare(act, locale) {
    const alt = act.h5pByLocale && typeof act.h5pByLocale === 'object' && Object.prototype.hasOwnProperty.call(act.h5pByLocale, locale) ? act.h5pByLocale[locale] : null;
    const pkg = alt && alt.h5p != null ? await load(alt.h5p, alt.sha256) : await load(act.h5p, act.sha256);
    let c = pkg.check, files = pkg.files;
    if (alt && alt.content && typeof alt.content === 'object' && alt.h5p == null) {
      files = Object.assign({}, files, { 'content/content.json': new TextEncoder().encode(JSON.stringify(alt.content)) });
      c = check(files);
    }
    if (c.errors.length) { console.warn('[noema] h5p', act.id, c.errors.slice(0, 5)); throw fail('h5p-check', c.errors[0]); }
    return { files, check: c, l10n: alt && alt.l10n && typeof alt.l10n === 'object' ? alt.l10n : null, sha256: pkg.sha256 };
  }

  /* ---------- the player (the app's own file; a script tag, so it works from file:// as well) ---------- */
  const ME = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  const playerUrl = () => window.NOEMA_CONFIG?.h5pPlayer || (ME.includes('/engine/') ? ME.slice(0, ME.lastIndexOf('/engine/') + 8) : 'engine/') + `vendor/h5p/${PLAYER_VERSION}/player.js`;
  let playerP = null;
  function player() {
    if (window.NoemaH5PPlayer) return Promise.resolve(window.NoemaH5PPlayer);
    return playerP || (playerP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = playerUrl(); s.async = true;
      s.onload = () => window.NoemaH5PPlayer ? res(window.NoemaH5PPlayer) : (playerP = null, rej(fail('player', 'player.js defined nothing')));
      s.onerror = () => { playerP = null; rej(fail('player', 'player.js did not load')); };
      document.head.append(s);
    }));
  }

  /* ---------- the frame's document ---------- */
  const CSP = hashes => ["default-src 'none'", 'script-src ' + hashes.map(x => `'sha256-${x}'`).join(' '), "style-src 'unsafe-inline'", 'img-src data: blob:', 'font-src data:', 'media-src data: blob:',
    "connect-src 'none'", "frame-src 'none'", "child-src 'none'", "worker-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'", "manifest-src 'none'"].join('; ');
  const ALLOWF = ['accelerometer', 'autoplay', 'camera', 'display-capture', 'encrypted-media', 'fullscreen', 'geolocation', 'gyroscope', 'magnetometer', 'microphone', 'midi', 'payment', 'picture-in-picture', 'publickey-credentials-get', 'screen-wake-lock', 'usb', 'web-share', 'xr-spatial-tracking'].map(f => f + " 'none'").join('; ');
  const sha256b64 = async text => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
  const rndName = p => p + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  const L10N = { fullscreen: 'Fullscreen', disableFullscreen: 'Disable fullscreen', download: 'Download', copyrights: 'Rights of use', embed: 'Embed', size: 'Size', close: 'Close', title: 'Title', author: 'Author',
    year: 'Year', source: 'Source', license: 'License', thumbnail: 'Thumbnail', noCopyrights: 'No copyright information available for this content.', reuse: 'Reuse', by: 'by', showMore: 'Show more', showLess: 'Show less',
    subLevel: 'Sublevel', confirmDialogHeader: 'Confirm action', confirmDialogBody: 'Please confirm that you wish to proceed. This action is not reversible.', cancelLabel: 'Cancel', confirmLabel: 'Confirm',
    contentChanged: 'This content has changed since you last used it.', startingOver: "You'll be starting over.", licenseU: 'Undisclosed', licenseCC010: 'CC0 1.0 Universal (CC0 1.0) Public Domain Dedication', licenseC: 'Copyright' };
  /** a library's css with its url()s as data: URIs from its own folder (fonts: only woff2 / woff; nothing is fetched) */
  function css(text, dir, files) {
    return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)(\s*format\(\s*['"]?([^'")]+)['"]?\s*\))?/g, (all, q, ref, fm, fmt) => {
      const r = ref.trim();
      if (/^data:/i.test(r)) return all;
      const keep = s => 'url(' + s + ')' + (fm || '');
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(r)) return keep('data:,');
      const path = (dir + '/' + r.split(/[?#]/)[0]).split('/').reduce((a, x) => (x === '..' ? a.pop() : x && x !== '.' && a.push(x), a), []).join('/');
      const ext = extOf(path), f = files[path];
      if (!f || ['eot', 'ttf', 'otf'].includes(ext) || (fmt && !/^woff2?$/i.test(fmt)) || (ext === 'svg' && /#/.test(r)) || f.length > 2 * 1024 * 1024) return keep('data:,');
      let s = ''; for (let i = 0; i < f.length; i += 0x8000) s += String.fromCharCode.apply(null, f.subarray(i, i + 0x8000));
      return keep('"data:' + (MIME[ext] || 'application/octet-stream') + ';base64,' + btoa(s) + '"');
    });
  }

  /** The frame side: claims the port, takes the files, starts H5P once the document, the files and init are there, and speaks the protocol. */
  function bootstrap(nonce, KEY) {
    return `(function(){'use strict';var N=${JSON.stringify(nonce)},P='noema.activity',APP=parent.parent,port=null,q=[],init=null,files=null,inst=null,last='',stT=null,evT={},csp=0,started=false;
function send(type,payload){var m={p:P,v:1,type:type,payload:payload||{}};if(port)port.postMessage(m);else q.push(m);}
function on(e){if(e.source!==APP||!e.data||e.data.t!=='welcome'||e.data.nonce!==N||!e.ports||!e.ports[0]||port)return;port=e.ports[0];removeEventListener('message',on,true);port.onmessage=msg;port.start();while(q.length)port.postMessage(q.shift());}
addEventListener('message',on,true);
Object.defineProperty(window,${JSON.stringify(KEY)},{value:Object.freeze({runaway:function(){send('error',{code:'runaway',message:'the item ran too long'});}}),writable:false,configurable:false,enumerable:false});
function theme(t){if(!t)return;var r=document.documentElement;try{for(var k in t.tokens)r.style.setProperty('--noema-'+k,String(t.tokens[k]));r.dataset.noemaScheme=t.scheme;r.dataset.noemaMotion=t.reducedMotion?'reduce':'full';if(t.dir)r.dir=t.dir;}catch(x){}}
function saveNow(){if(!inst||typeof inst.getCurrentState!=='function')return;var s;try{s=inst.getCurrentState();}catch(x){return;}if(s===undefined)return;var j;try{j=JSON.stringify(s);}catch(x){return;}if(j===last||j.length>250000)return;last=j;send('state',{version:init&&init.stateVersion||1,data:{h5p:s}});}
function saveSoon(){clearTimeout(stT);stT=setTimeout(saveNow,300);}
function msg(e){var m=e.data;if(!m)return;
 if(m.p==='noema.h5p'&&m.type==='files'&&!files){files={};(m.files||[]).forEach(function(f){try{files[f.path]=URL.createObjectURL(new Blob([f.buf],{type:f.type||''}));}catch(x){}});go();return;}
 if(m.p!==P)return;var p=m.payload||{};
 if(m.type==='ping'){send('pong');return;}
 if(m.type==='init'){init=p;theme(p.theme);if(p.locale)document.documentElement.lang=p.locale;go();return;}
 if(m.type==='theme'){theme(p);return;}
 if(m.type==='pause'||m.type==='destroy'){saveNow();return;}}
function verb(st){var v=st&&st.verb&&st.verb.id||'';return v.slice(v.lastIndexOf('/')+1).toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||'statement';}
function xapi(ev){var st=ev&&ev.data&&ev.data.statement;if(!st)return;var v=verb(st),r=st.result||null,ctx=st.context&&st.context.contextActivities,sub=!!(ctx&&ctx.parent&&ctx.parent.length);
 var sc=r&&r.score?r.score:null,data={};if(sc&&typeof sc.max==='number'){data.score={raw:+sc.raw||0,max:+sc.max};}if(sub)data.sub=true;
 var now=Date.now();if(now-(evT[v]||0)>=250||v==='answered'||v==='completed'){evT[v]=now;send('event',{name:'h5p:'+v,data:data});}
 if(!sub&&(v==='answered'||v==='completed')&&sc){var s=typeof sc.scaled==='number'?sc.scaled:(sc.max>0?(+sc.raw||0)/sc.max:null);
  if(s!=null&&isFinite(s)){s=Math.max(0,Math.min(1,s));send('result',{score:s,passed:typeof r.success==='boolean'?r.success:s>=0.5,detail:(sc.max>0?(+sc.raw||0)+'/'+sc.max+' ':'')+v});}}
 saveSoon();}
function go(){if(started||!init||!files||document.readyState==='loading')return;started=true;
 try{var H=window.H5P,I=window.H5PIntegration,c=I.contents['cid-noema'];
  var st=init.state&&!init.state.migrateFrom&&init.state.data&&init.state.data.h5p!==undefined?init.state.data.h5p:undefined;
  if(st!==undefined){try{c.contentUserData=[{state:JSON.stringify(st)}];last=JSON.stringify(st);}catch(x){}}
  H.getPath=function(path){var k=String(path||'').split('#')[0].replace(/^\\.?\\//,'');if(Object.prototype.hasOwnProperty.call(files,k))return files[k];return 'data:,';};
  H.getLibraryPath=function(){return 'data:,';};
  H.externalDispatcher.on('xAPI',xapi);
  H.init(document.body);inst=H.instances&&H.instances[0]||null;
  if(!inst){send('error',{code:'h5p-init',message:'no instance'});return;}
  addEventListener('resize',function(){try{H.trigger(inst,'resize');}catch(x){}});
  send('ready',{protocols:[1]});
 }catch(x){send('error',{code:'h5p-init',message:String(x&&x.message||x).slice(0,300)});}}
document.addEventListener('DOMContentLoaded',function(){go();measure();try{new ResizeObserver(measure).observe(document.documentElement);}catch(x){setInterval(measure,500);}});
var lastH=0;function measure(){var h=Math.ceil(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0));if(Math.abs(h-lastH)>2){lastH=h;send('resize',{h:h});}}
document.addEventListener('securitypolicyviolation',function(e){if(++csp<=5)send('event',{name:'h5p:csp',data:{d:String(e.effectiveDirective||e.violatedDirective||'').slice(0,40),u:String(e.blockedURI||'').slice(0,80)}});});
addEventListener('error',function(e){try{send('error',{code:'script',message:String(e.message||'').slice(0,300)});}catch(x){}});
APP.postMessage({t:'hello',nonce:N},'*');
})();`;
  }
  /** before the core: H5PIntegration and memory-only storage (an opaque origin has none; H5P's clipboard asks for it).
      saveFreq must be truthy, or H5P ignores the saved state (h5p.js newRunnable); with no H5PIntegration.user its own saving stops
      before any request ("Not signed in"), so the state reaches the app only through getCurrentState() above.
      fullscreenDisabled: the frame may not go full screen (the app offers its own); it also keeps WebKit from logging a policy error. */
  function pre(c, act, init, l10n) {
    const lib = c.libs[c.order.find(f => c.libs[f].machineName === c.main)];
    const integ = { baseUrl: 'about:srcdoc', url: 'urn:noema:activity:' + act.id, siteUrl: 'about:srcdoc', urlLibraries: 'data:,', postUserStatistics: false, saveFreq: 3600, reportingIsEnabled: false, fullscreenDisabled: true, ajax: {}, loadedJs: [], loadedCss: [],
      core: { styles: [], scripts: [] }, l10n: { H5P: Object.assign({}, L10N, l10n || {}) },
      contents: { 'cid-noema': { library: `${lib.machineName} ${lib.majorVersion}.${lib.minorVersion}`, jsonContent: JSON.stringify(c.content), fullScreen: false, exportUrl: '', embedCode: '', resizeCode: '', url: 'urn:noema:activity:' + act.id,
        title: String(c.h5p.title || act.id), styles: [], scripts: [], displayOptions: { frame: false, export: false, embed: false, copyright: false, icon: false, copy: false },
        metadata: { title: String(c.h5p.title || act.id), license: String(c.h5p.license || 'U') } } } };
    return `(function(){function mem(){var d=Object.create(null);return{getItem:function(k){k=String(k);return k in d?d[k]:null;},setItem:function(k,v){d[String(k)]=String(v);},removeItem:function(k){delete d[String(k)];},clear:function(){d=Object.create(null);},key:function(i){return Object.keys(d)[i]||null;},get length(){return Object.keys(d).length;}};}
['localStorage','sessionStorage'].forEach(function(n){try{window[n].length;}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true});}catch(x){}}});
window.H5PIntegration=${JSON.stringify(integ).replace(/</g, '\\u003c')};window.H5P=window.H5P||{};window.H5P.preventInit=true;})();`;
  }

  /** → { doc (the wrapper's srcdoc), media [{path, type, bytes}] } */
  async function buildDoc(pkg, nonce, act, init, core) {
    const c = pkg.check, files = pkg.files, G = rndName('__noemaGuard'), KEY = rndName('__noemaH5P');
    const scripts = [], styles = [core.css];
    for (const f of c.order) {
      const lj = c.libs[f];
      for (const x of lj.preloadedCss || []) { const p = f + '/' + x.path; styles.push(css(utf8(files[p]), p.slice(0, p.lastIndexOf('/')), files)); }
      for (const x of lj.preloadedJs || []) scripts.push(utf8(files[f + '/' + x.path]));
    }
    const guardOf = s => NoemaLoopGuard.transform(s, G).code;
    const boot = bootstrap(nonce, KEY), guard = NoemaLoopGuard.runtime(G, 1500, `function(){try{window[${JSON.stringify(KEY)}].runaway()}catch(e){}}`);
    const all = [boot, guard, pre(c, act, init, pkg.l10n), guardOf(core.js), ...scripts.map(guardOf)];
    const hashes = await Promise.all(all.map(sha256b64));
    const d = document.implementation.createHTMLDocument('');
    const add = (tag, attrs, text) => { const e = d.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
    d.documentElement.setAttribute('lang', init.locale || 'en'); d.documentElement.className = 'h5p-iframe';
    d.head.replaceChildren(add('meta', { charset: 'utf-8' }), add('meta', { 'http-equiv': 'Content-Security-Policy', content: CSP(hashes) }), add('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      add('style', {}, 'html,body{margin:0;background:#fff;color:#222;font-family:var(--noema-font,system-ui,sans-serif)}.h5p-content{font-family:inherit}'), ...styles.map(s => add('style', {}, s)), ...all.map(s => add('script', {}, s)));
    d.body.replaceChildren(add('div', { class: 'h5p-content', 'data-content-id': 'noema' }));
    const inner = '<!doctype html>' + d.documentElement.outerHTML;
    const w = document.implementation.createHTMLDocument('');
    const wm = w.createElement('meta'); wm.setAttribute('http-equiv', 'Content-Security-Policy'); wm.setAttribute('content', CSP(hashes));
    const ws = w.createElement('style'); ws.textContent = 'html,body{margin:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;border:0;width:100%;height:100%}';
    const wf = w.createElement('iframe'); wf.setAttribute('sandbox', 'allow-scripts'); wf.setAttribute('allow', ALLOWF); wf.setAttribute('referrerpolicy', 'no-referrer'); wf.setAttribute('srcdoc', inner);
    w.head.replaceChildren(wm, ws); w.body.replaceChildren(wf);
    let mediaBytes = 0; const media = [];
    for (const n of Object.keys(files)) {
      if (!n.startsWith('content/') || n === 'content/content.json') continue;
      const ext = extOf(n); if (!MIME[ext] || ext === 'json') continue;
      mediaBytes += files[n].length; if (mediaBytes > LIM.media) throw fail('size', 'the content files are too big');
      media.push({ path: n.slice(8), type: MIME[ext], bytes: files[n] });
    }
    return { doc: '<!doctype html>' + w.documentElement.outerHTML, media, scripts: all.length };
  }

  const NoemaH5P = Object.freeze({ PLAYER_VERSION, ALLOW, LIM, unzip, check, load, prepare, player, buildDoc, CACHE });
  window.NoemaH5P = NoemaH5P;

  if (typeof ACT === 'undefined' || !ACT.registerRuntime) return;
  ACT.registerRuntime({
    id: 'h5p@1', version: 1,
    /** the same contract as html-app@1 → port { send(type, payload, extra), close() } */
    mount(box, { act, init, title, onMessage, onFail }) {
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');   // exactly this token: never allow-same-origin
      frame.setAttribute('allow', ALLOWF);
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('title', title);
      frame.className = 'act-frame';
      let ch = null, closed = false, loads = 0, media = [];
      const pending = [];
      const port = {
        send(type, payload, extra) { const m = ACTP.out(type, payload, extra); if (ch) ch.port1.postMessage(m); else pending.push(m); },
        close() { closed = true; removeEventListener('message', hello); try { ch?.port1.close(); } catch (e) { } frame.remove(); },
      };
      function hello(e) {
        const app = (() => { try { return frame.contentWindow?.frames[0] || null; } catch (x) { return null; } })();
        if (closed || ch || !app || e.source !== app) return;
        const d = e.data; if (!d || d.t !== 'hello' || d.nonce !== nonce) return;
        removeEventListener('message', hello);
        ch = new MessageChannel();
        ch.port1.onmessage = m => { if (!closed) onMessage(m.data); };
        app.postMessage({ t: 'welcome', nonce }, '*', [ch.port2]);
        const fl = media.map(f => ({ path: f.path, type: f.type, buf: f.bytes.slice().buffer }));   // copies: the cached package keeps its bytes
        ch.port1.postMessage({ p: 'noema.h5p', type: 'files', files: fl }, fl.map(f => f.buf));
        ch.port1.postMessage(ACTP.out('init', init));
        while (pending.length) ch.port1.postMessage(pending.shift());
      }
      addEventListener('message', hello);
      frame.addEventListener('load', () => { if (++loads > 1 && !closed) onFail('navigated'); });
      (async () => {
        if (!crypto?.subtle || typeof DecompressionStream === 'undefined') throw fail('unsupported', 'this browser cannot unpack H5P');
        const [core, pkg] = await Promise.all([player(), prepare(act, init.locale)]);
        if (closed) return;
        const b = await buildDoc(pkg, nonce, act, init, core);
        if (closed) return;
        media = b.media; frame.srcdoc = b.doc; box.append(frame);
      })().catch(e => { console.warn('[noema] h5p', act.id, e.code || '', e.message); if (!closed) onFail(e.code || 'build'); });
      return port;
    },
  });
  /* i18n-ignore-end */
})();
