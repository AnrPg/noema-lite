/* noema-lite — the original files of a subject's sources (PDFs, slides, documents…), for 👁 preview.
   A file lives in three places:  this device (IndexedDB "noema-files", instant and offline)
                                  the private cloud folder <user>/sources/<subject>/<source>/file.<ext> (every device)
                                  an index in the synced key a:srcfiles:<subject> {sourceId: {name, type, size, added, cloud}}
   Sources without a file but with a web address (url, or a link in their subtitle) are previewed from the web. */
window.NoemaSrcFiles = (() => {
  const DB = { db: null,
    open() { return this.db || (this.db = new Promise((res, rej) => { const q = indexedDB.open('noema-files', 1); q.onupgradeneeded = () => q.result.createObjectStore('files'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })); },
    async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('files', mode); const r = fn(t.objectStore('files')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); },
    put(k, v) { return this.tx('readwrite', s => s.put(v, k)); }, get(k) { return this.tx('readonly', s => s.get(k)); }, del(k) { return this.tx('readwrite', s => s.delete(k)); },
  };
  const key = (acc, subj, src) => `${acc}|${subj}|${src}`;
  const idxKey = (acc, subj) => `noema1:${acc}:a:srcfiles:${subj}`;
  const kv = () => window.Noema?.kv;
  const cloudOn = acc => !!(window.NoemaCloud && NoemaCloud.session() && acc === 'u_' + NoemaCloud.session().user.id);
  const safeExt = name => ((String(name).toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || 'bin');
  const cloudPath = (subj, src, name) => `sources/${subj}/${String(src).replace(/[^a-zA-Z0-9_-]/g, '_')}/file.${safeExt(name)}`;
  const MAX = 2 * 1024 * 1024 * 1024;   // a practical browser limit; the cloud stores big files in parts (NoemaCloud.putFile)
  const fullPath = (subj, src, name) => `${NoemaCloud.session().user.id}/${cloudPath(subj, src, name)}`;

  function index(acc, subj) { try { return JSON.parse(localStorage.getItem(idxKey(acc, subj)) || '{}'); } catch (e) { return {}; } }
  function setIndex(acc, subj, ix) { const v = JSON.stringify(ix); if (kv()) { if (Object.keys(ix).length) kv().set(idxKey(acc, subj), v); else kv().del(idxKey(acc, subj)); } else localStorage.setItem(idxKey(acc, subj), v); }

  /** Attach (or replace) the file of a source. */
  async function put(acc, subj, src, file, { name } = {}) {
    name = name || file.name || 'file'; const type = file.type || '';
    if (file.size > MAX) throw new Error(`The file is ${Math.round(file.size / 1048576)} MB — too big for a browser to keep (limit ${Math.round(MAX / 1073741824)} GB).`);
    await DB.put(key(acc, subj, src), { blob: file, name, type, size: file.size, added: new Date().toISOString() });
    const meta = { name, type, size: file.size, added: new Date().toISOString(), cloud: false };
    const old = index(acc, subj)[src];
    if (cloudOn(acc)) {
      try {
        if (old?.cloud && (old.chunks || cloudPath(subj, src, old.name) !== cloudPath(subj, src, name))) await NoemaCloud.deleteObjects('noema-private', NoemaCloud.partPaths(fullPath(subj, src, old.name), old.chunks || 0)).catch(() => { });
        const r = await NoemaCloud.putFile('noema-private', fullPath(subj, src, name), file, type || 'application/octet-stream'); meta.cloud = true; if (r.chunks) meta.chunks = r.chunks;
      }
      catch (e) { console.warn('[source files] cloud upload failed — kept on this device', e); meta.cloudError = e.message; }
    }
    const ix = index(acc, subj); ix[src] = meta; setIndex(acc, subj, ix);
    return meta;
  }
  /** A source that uses a file stored elsewhere (e.g. a textbook shared by several curriculum steps): no copy. */
  function link(acc, subj, src, ref, meta = {}) { const ix = index(acc, subj); ix[src] = { name: meta.name || '', type: meta.type || '', size: meta.size || 0, added: new Date().toISOString(), cloud: true, ref: { subj: ref.subj, src: ref.src } }; setIndex(acc, subj, ix); return ix[src]; }
  /** The file of a source: this device first, else the cloud (then cached). null when there is none. */
  async function get(acc, subj, src) {
    { const m0 = index(acc, subj)[src]; if (m0?.ref) return get(acc, m0.ref.subj, m0.ref.src); }
    const hit = await DB.get(key(acc, subj, src)).catch(() => null); if (hit?.blob) return hit;
    const meta = index(acc, subj)[src];
    if (meta?.cloud && cloudOn(acc)) {
      const blob = await NoemaCloud.getFile('noema-private', fullPath(subj, src, meta.name), meta.chunks || 0, { type: meta.type }).catch(() => null);
      if (blob) { const rec = { blob, name: meta.name, type: meta.type || blob.type, size: blob.size, added: meta.added }; await DB.put(key(acc, subj, src), rec).catch(() => { }); return rec; }
    }
    return null;
  }
  async function remove(acc, subj, src) {
    const meta = index(acc, subj)[src];
    if (meta?.ref) { const ix = index(acc, subj); delete ix[src]; setIndex(acc, subj, ix); return; }   // a link: the file itself stays where it is
    await DB.del(key(acc, subj, src)).catch(() => { });
    if (meta?.cloud && cloudOn(acc)) await NoemaCloud.deleteObjects('noema-private', NoemaCloud.partPaths(fullPath(subj, src, meta.name), meta.chunks || 0)).catch(() => { });
    const ix = index(acc, subj); delete ix[src]; setIndex(acc, subj, ix);
  }
  /** Remove every file of a subject (when the subject is deleted). */
  async function removeAll(acc, subj) { for (const src of Object.keys(index(acc, subj))) await remove(acc, subj, src); }
  /** A web address for the source, if it has one (url field, or a link written in its subtitle / file). */
  function webUrl(s) { for (const v of [s.url, s.file, s.subtitle, s.title]) { const m = String(v || '').match(/https?:\/\/[^\s)»"']+/); if (m) return m[0]; } return null; }
  /** What can be previewed for a source: { file meta } | { url } | null */
  function available(acc, subj, s) { const m = index(acc, subj)[s.id]; if (m) return { meta: m }; const u = webUrl(s); return u ? { url: u } : null; }

  /** Match files the learner gave to "Create with Claude" with the sources Claude wrote (by file name). */
  function match(sources, files) {
    const norm = x => String(x || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9α-ω]+/g, ' ').trim();
    const pairs = []; const left = new Set(files.map((f, i) => i)); const used = new Set();
    const score = (s, f) => { const fn = norm(f.name), sf = norm(String(s.file || '').split('/').pop()); if (sf && sf === fn) return 100; if (sf && (sf.includes(fn) || fn.includes(sf))) return 70; const a = new Set(fn.split(' ').filter(w => w.length > 2)); const b = norm(s.title + ' ' + (s.subtitle || '') + ' ' + (s.file || '')).split(' ').filter(w => w.length > 2); const hit = b.filter(w => a.has(w)).length; return hit ? 20 + hit * 10 : 0; };
    const cands = []; sources.forEach((s, si) => files.forEach((f, fi) => { const sc = score(s, f); if (sc) cands.push([sc, si, fi]); }));
    cands.sort((a, b) => b[0] - a[0]).forEach(([sc, si, fi]) => { if (!used.has(si) && left.has(fi) && sc >= 30) { pairs.push([sources[si], files[fi]]); used.add(si); left.delete(fi); } });
    // the same number of files and of file-like sources, nothing matched by name → keep their order
    const fileSrcs = sources.filter((s, i) => !used.has(i) && !webUrl(s));
    if (left.size && left.size === fileSrcs.length) [...left].forEach((fi, k) => pairs.push([fileSrcs[k], files[fi]]));
    return pairs;
  }

  /* ---------- packages: <id>.noema.zip = pack.json + sources/<file> (docs/SOURCES.md §3) ---------- */
  const loadZip = async buf => { if (!window.JSZip) { if (!window.NoemaViewer?.loadZip) throw new Error('The package reader is not available.'); return NoemaViewer.loadZip(buf); } return JSZip.loadAsync(buf); };
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  async function sha256(blob) { if (!crypto?.subtle) return null; return hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())); }
  /** Is this file a zip (a package)? */
  async function isZip(file) { if (/\.zip$/i.test(file.name || '')) return true; const b = new Uint8Array(await file.slice(0, 4).arrayBuffer()); return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; }
  /** The sources of a pack whose original file travels with it (written by make_pack.py: file + size + sha256). */
  const packaged = p => ((p?.sources?.sources) || []).filter(s => s && s.sha256 && /^sources\//.test(String(s.file || '')));
  /** Read a package → { pack, file(path) → Blob|null }. */
  async function readBundle(blob) {
    let z; try { z = await loadZip(await blob.arrayBuffer()); } catch (e) { throw new Error('This file is not a noema-lite package (not a readable zip).'); }
    const pj = z.file('pack.json') || Object.values(z.files).find(f => !f.dir && /(^|\/)pack\.json$/.test(f.name));
    if (!pj) throw new Error('This zip is not a noema-lite package (no pack.json inside).');
    let pack; try { pack = JSON.parse(await pj.async('string')); } catch (e) { throw new Error('pack.json inside the package is not valid: ' + e.message); }
    const root = pj.name.replace(/pack\.json$/, '');
    return { pack, file: async path => { const f = z.file(root + path); return f ? f.async('blob') : null; } };
  }
  /** Attach the packaged files of a pack (from a package, or from Claude's outputs) to its sources — each checked
      against the size and SHA-256 recorded by make_pack.py, so exactly the files Claude used (and split) arrive. */
  async function attachPackaged(acc, pack, fileOf, { onLog = () => { }, refFor = null } = {}) {
    const res = { attached: [], missing: [], bad: [] };
    for (const s of packaged(pack)) {
      const ref = refFor && refFor(s);
      if (ref) { link(acc, pack.subject.id, s.id, ref, { name: s.fileName || String(s.file).split('/').pop(), type: s.mime, size: s.size }); res.attached.push(s.id); continue; }   // the same file is already stored (same SHA-256)
      let blob = null; try { blob = await fileOf(s.file, s); } catch (e) { }
      if (!blob) { res.missing.push(s.id); continue; }
      if (s.size && blob.size !== s.size) { res.bad.push(s.id); onLog(`⚠️ ${s.file}: size differs from the pack — not attached`); continue; }
      const sum = await sha256(blob).catch(() => null);
      if (sum && sum !== s.sha256) { res.bad.push(s.id); onLog(`⚠️ ${s.file}: content differs from the pack — not attached`); continue; }
      const name = s.fileName || String(s.file).split('/').pop();
      const f = new File([blob], name, { type: s.mime || blob.type || '' });
      try { await put(acc, pack.subject.id, s.id, f, { name }); res.attached.push(s.id); } catch (e) { res.bad.push(s.id); onLog('⚠️ ' + name + ': ' + e.message); }
    }
    return res;
  }
  /** A package of a subject: pack.json + every attached source file (also files attached by hand). */
  async function makeBundle(acc, pack) {
    if (!window.JSZip && window.NoemaViewer?.jszip) await NoemaViewer.jszip();
    if (!window.JSZip) throw new Error('The package writer is not available.');
    const seen = new WeakSet(); const p = JSON.parse(JSON.stringify(pack, (k, v) => { if (v && typeof v === 'object') { if (seen.has(v)) return undefined; seen.add(v); } return v; })); const z = new JSZip(); const used = new Set(); let n = 0;
    for (const s of (p.sources?.sources || [])) {
      const rec = await get(acc, p.subject.id, s.id).catch(() => null); if (!rec?.blob) continue;
      let fn = String(rec.name || s.fileName || s.id).split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '_') || s.id; while (used.has(fn.toLowerCase())) fn = s.id + '-' + fn; used.add(fn.toLowerCase());
      Object.assign(s, { file: 'sources/' + fn, fileName: rec.name || fn, size: rec.blob.size, mime: rec.type || rec.blob.type || '', sha256: await sha256(rec.blob) });
      z.file('sources/' + fn, rec.blob, { createFolders: false, compression: /pdf|zip|image|video|audio|openxml|epub/.test(s.mime) ? 'STORE' : 'DEFLATE' }); n++;
    }
    p.counts = { ...(p.counts || {}), sourceFiles: n };
    z.file('pack.json', JSON.stringify(p));
    return { blob: await z.generateAsync({ type: 'blob', mimeType: 'application/zip' }), files: n };
  }
  /** Save a subject as a package file (download). */
  async function downloadBundle(acc, pack) {
    const { blob, files } = await makeBundle(acc, pack);
    const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = pack.subject.id + '.noema.zip'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
    return files;
  }
  /** The page of the FILE for a page the chapters cite: parts of a split PDF start at "firstPage" of the original. */
  function filePage(s, page) {
    const p = parseInt(page, 10); if (!p) return page || undefined;
    const fp = parseInt(s?.firstPage, 10) || 1; let q = p - fp + 1;
    if (q < 1) q = p >= 1 && (!s?.pageCount || p <= s.pageCount) && fp > 1 ? p : 1;   // already a page of the part
    if (s?.pageCount && q > s.pageCount) q = s.pageCount;
    return q;
  }
  /** The attached files of a subject, ready to share: [{ srcId, blob, name, type }] (downloads the ones not on this device). */
  async function forSharing(acc, subj) {
    const out = [];
    for (const [src, m] of Object.entries(index(acc, subj))) { const rec = await get(acc, subj, src).catch(() => null); if (rec?.blob) out.push({ srcId: src, blob: rec.blob, name: rec.name || m.name, type: rec.type || m.type || '' }); }
    return out;
  }
  /** After importing a shared / public subject: fetch the files it came with into this account. */
  async function attachShared(acc, pack, bucket, { onLog = () => { } } = {}) {
    const res = { attached: 0, failed: [] };
    for (const [src, f] of Object.entries(pack.sharedFiles || {})) {
      try {
        onLog(`📎 ${f.name}…`);
        const blob = await NoemaCloud.getFile(bucket, f.path, f.chunks || 0, { isPublic: bucket === 'noema-public', type: f.type });
        if (f.size && blob.size !== f.size) throw new Error('incomplete download');
        await put(acc, pack.subject.id, src, new File([blob], f.name, { type: f.type || blob.type || '' }), { name: f.name }); res.attached++;
      } catch (e) { console.warn('[shared files]', f.name, e); res.failed.push(f.name); }
    }
    return res;
  }
  return { link, forSharing, attachShared, put, get, remove, removeAll, index, available, webUrl, match, cloudPath, MAX, isZip, packaged, readBundle, attachPackaged, makeBundle, downloadBundle, sha256, filePage };
})();
