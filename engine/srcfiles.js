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
  const MAX = 50 * 1024 * 1024;

  function index(acc, subj) { try { return JSON.parse(localStorage.getItem(idxKey(acc, subj)) || '{}'); } catch (e) { return {}; } }
  function setIndex(acc, subj, ix) { const v = JSON.stringify(ix); if (kv()) { if (Object.keys(ix).length) kv().set(idxKey(acc, subj), v); else kv().del(idxKey(acc, subj)); } else localStorage.setItem(idxKey(acc, subj), v); }

  /** Attach (or replace) the file of a source. */
  async function put(acc, subj, src, file, { name } = {}) {
    name = name || file.name || 'file'; const type = file.type || '';
    if (file.size > MAX) throw new Error(`The file is ${Math.round(file.size / 1048576)} MB — the limit is 50 MB. Split it (e.g. one PDF per chapter) and attach the parts to separate sources.`);
    await DB.put(key(acc, subj, src), { blob: file, name, type, size: file.size, added: new Date().toISOString() });
    const meta = { name, type, size: file.size, added: new Date().toISOString(), cloud: false };
    if (cloudOn(acc)) {
      try { await NoemaCloud.uploadObject(cloudPath(subj, src, name), file, type || 'application/octet-stream'); meta.cloud = true; }
      catch (e) { console.warn('[source files] cloud upload failed — kept on this device', e); meta.cloudError = e.message; }
    }
    const ix = index(acc, subj); ix[src] = meta; setIndex(acc, subj, ix);
    return meta;
  }
  /** The file of a source: this device first, else the cloud (then cached). null when there is none. */
  async function get(acc, subj, src) {
    const hit = await DB.get(key(acc, subj, src)).catch(() => null); if (hit?.blob) return hit;
    const meta = index(acc, subj)[src];
    if (meta?.cloud && cloudOn(acc)) {
      const r = await NoemaCloud.downloadObject(cloudPath(subj, src, meta.name)).catch(() => null);
      if (r?.ok) { const blob = await r.blob(); const rec = { blob, name: meta.name, type: meta.type || blob.type, size: blob.size, added: meta.added }; await DB.put(key(acc, subj, src), rec).catch(() => { }); return rec; }
    }
    return null;
  }
  async function remove(acc, subj, src) {
    const meta = index(acc, subj)[src];
    await DB.del(key(acc, subj, src)).catch(() => { });
    if (meta?.cloud && cloudOn(acc)) await NoemaCloud.deleteObjects('noema-private', [`${NoemaCloud.session().user.id}/${cloudPath(subj, src, meta.name)}`]).catch(() => { });
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
  return { put, get, remove, removeAll, index, available, webUrl, match, cloudPath, MAX };
})();
