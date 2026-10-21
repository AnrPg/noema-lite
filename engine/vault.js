/* =====================================================================================
   noema-lite — 🗄️ the vault (docs/VAULT.md): files students share with each other — lecture notes, slides, past exams
   (with or without solutions), exercise sets, lab work, summaries, books, recordings, anything else for study.
   Organised: every file carries its type, its fields (1–12 of the shared field graph, below) and its languages; its
   university, department, course, year and semester when known — so the folders (by school: university › department ›
   course, or by field down the graph; then the files by type) and every filter work across all of them ("biology notes,
   any university, any year, 3rd semester"). The fields (cloud/supabase.sql §13b): a graph, not a tree — Medical physics
   sits under Physics and under Medicine — seeded from ISCED-F and Wikidata, named in every UI language; people propose
   new ones (usable by them at once) and Claude, through the connector, accepts, names and places them for everybody.
   Anonymous: the server keeps the uploader for deleting and take-downs, nobody else sees it (view noema_vault); a person
   may choose to show their name. Restrictive: only the formats of FORMATS (no programs, scripts, archives or SVG), each
   file checked by its first bytes, ≤ 20 MB a file, ≤ 50 MB a person; reports hide a file (cloud/supabase.sql §13).
   The page: #/vault?q=…&<filters> (Files or Folders); the list is read once and filtered here, so a search matches the
   words in any script, accents or not, Greek and Cyrillic also in Latin letters.
   ===================================================================================== */
window.NoemaVault = (() => {
  'use strict';
  const N = () => window.Noema, CL = () => window.NoemaCloud, CAT = () => window.NoemaCatalog;
  const T = (k, p) => window.NoemaI18n ? NoemaI18n.t('vault.' + k, p) : k;
  const acc = () => N()?.account?.id || null;
  const toast = (m, ms) => N()?.toast?.(m, ms);
  const enc = encodeURIComponent;
  const BUCKET = 'noema-vault', MAX_FILE = 20 * 1048576, QUOTA = 50 * 1048576;
  const KINDS = ['notes', 'slides', 'exam', 'exam_solved', 'exercises', 'lab', 'summary', 'book', 'recording', 'other'];
  /* the formats a file may have: extension → [mime, group, check of its first bytes]. Nothing else is accepted. */
  const at = (b, off, s) => [...s].every((ch, i) => b[off + i] === ch.charCodeAt(0));
  const ZIP = b => at(b, 0, 'PK\x03\x04'), OLE = b => b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0, FTYP = b => at(b, 4, 'ftyp');
  const TEXT = b => !b.slice(0, 4096).includes(0);
  const FORMATS = {
    pdf: ['application/pdf', 'doc', b => at(b, 0, '%PDF')],   // i18n-ignore (file signatures)
    doc: ['application/msword', 'doc', OLE], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc', ZIP],
    odt: ['application/vnd.oasis.opendocument.text', 'doc', ZIP], rtf: ['application/rtf', 'doc', b => at(b, 0, '{\\rtf')],   // i18n-ignore (file signatures)
    txt: ['text/plain', 'text', TEXT], md: ['text/markdown', 'text', TEXT], tex: ['text/x-tex', 'text', TEXT], csv: ['text/csv', 'sheet', TEXT],
    ppt: ['application/vnd.ms-powerpoint', 'slides', OLE], pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'slides', ZIP],
    odp: ['application/vnd.oasis.opendocument.presentation', 'slides', ZIP],
    xls: ['application/vnd.ms-excel', 'sheet', OLE], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet', ZIP],
    ods: ['application/vnd.oasis.opendocument.spreadsheet', 'sheet', ZIP], epub: ['application/epub+zip', 'book', ZIP],
    png: ['image/png', 'image', b => b[0] === 0x89 && at(b, 1, 'PNG')], jpg: ['image/jpeg', 'image', b => b[0] === 0xFF && b[1] === 0xD8], jpeg: ['image/jpeg', 'image', b => b[0] === 0xFF && b[1] === 0xD8],
    gif: ['image/gif', 'image', b => at(b, 0, 'GIF8')], webp: ['image/webp', 'image', b => at(b, 0, 'RIFF') && at(b, 8, 'WEBP')], heic: ['image/heic', 'image', FTYP],
    mp3: ['audio/mpeg', 'audio', b => at(b, 0, 'ID3') || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)], m4a: ['audio/mp4', 'audio', FTYP],
    wav: ['audio/wav', 'audio', b => at(b, 0, 'RIFF') && at(b, 8, 'WAVE')], ogg: ['audio/ogg', 'audio', b => at(b, 0, 'OggS')], flac: ['audio/flac', 'audio', b => at(b, 0, 'fLaC')],
    mp4: ['video/mp4', 'video', FTYP], mov: ['video/quicktime', 'video', FTYP], webm: ['video/webm', 'video', b => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3],
  };
  const GROUPS = ['doc', 'slides', 'sheet', 'book', 'image', 'audio', 'video', 'text'];
  const extOf = name => ((String(name).toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || '');
  const groupOf = f => FORMATS[extOf(f.file_name || f.name)]?.[1] || 'doc';
  const ACCEPT = Object.keys(FORMATS).map(e => '.' + e).join(',');
  /** Is this file one the vault takes? → '' or the reason (for the learner). Reads its first bytes. */
  async function checkFile(file, usedBytes = 0) {
    const f = FORMATS[extOf(file.name)];
    if (!f) return T('badFormat');
    if (file.size > MAX_FILE) return T('tooBig', { mb: 20 });
    if (!file.size) return T('empty');
    if (usedBytes + file.size > QUOTA) return T('quotaFull', { mb: 50 });
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (!f[2](head)) return T('notWhatItSays');
    return '';
  }

  /* ---------- text: the same words in any script — accents or not, Greek and Cyrillic also in Latin letters ---------- */
  const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
  const GR2 = { ...GR, β: 'b', η: 'e', υ: 'u', χ: 'kh' };   // the scholarly letters (biologia, kh…)
  const CY = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const fold = s => CAT()?.fold ? CAT().fold(s) : String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const latin = (s, map) => s.replace(/ου/g, 'ou').replace(/[α-ωа-яё]/g, ch => map[ch] ?? CY[ch] ?? ch);
  /** The forms a text is searched in: as written (folded), in plain Latin letters, in scholarly Latin letters. */
  const forms = s => { const f = fold(s); return [f, latin(f, GR), latin(f, GR2)]; };
  const matches = (hay, q) => { const H = forms(hay); return forms(q).every(() => true) && q.split(/\s+/).filter(Boolean).every(w => { const W = forms(w); return W.some(x => H.some(y => y.includes(x))); }); };

  /* ---------- the server (row-level security applies: cloud/supabase.sql §13) ---------- */
  const api = (path, o) => CL().api(path, o);
  const Server = {
    list: () => api('/rest/v1/noema_vault?select=*&order=created_at.desc&limit=5000'),
    myRatings: () => api('/rest/v1/noema_vault_ratings?select=file_id,stars'),
    myReports: () => api('/rest/v1/noema_vault_reports?select=file_id,reason'),
    async upload(meta, file, onProgress) {
      const id = crypto.randomUUID(), ext = extOf(file.name), path = `files/${id}.${ext}`;
      await api('/rest/v1/noema_vault_files', { method: 'POST', body: [{ ...meta, id, file_name: file.name.slice(0, 200), mime: FORMATS[ext][0], size: file.size, path }], headers: { Prefer: 'return=minimal' } });
      try {
        await CL().putFile(BUCKET, path, file, FORMATS[ext][0], { onProgress });
        await api('/rest/v1/rpc/noema_vault_finish', { method: 'POST', body: { fid: id } });
      } catch (e) { await Server.remove({ id, path }).catch(() => { }); throw e; }
      return id;
    },
    async remove(f) { await CL().deleteObjects(BUCKET, [f.path]).catch(() => { }); await api('/rest/v1/noema_vault_files?id=eq.' + enc(f.id), { method: 'DELETE' }); },
    edit: (id, patch) => api('/rest/v1/noema_vault_files?id=eq.' + enc(id), { method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' } }),
    rate: (id, stars) => api('/rest/v1/noema_vault_ratings?on_conflict=file_id,user_id', { method: 'POST', body: [{ file_id: id, user_id: CL().uid(), stars }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } }),
    report: (id, reason, note) => api('/rest/v1/noema_vault_reports', { method: 'POST', body: [{ file_id: id, reporter: CL().uid(), reason, note: note || null }], headers: { Prefer: 'return=minimal' } }),
    count: (id, what) => api('/rest/v1/rpc/noema_vault_count', { method: 'POST', body: { fid: id, what } }).catch(() => { }),
    blob: f => CL().getFile(BUCKET, f.path, 0, { type: f.mime }),
    async fields() {   // every accepted field (and my own proposals), 1000 rows a page (the server's limit)
      const out = [];
      for (let o = 0; ; o += 1000) { const r = (await api(`/rest/v1/noema_vault_fields?select=id,names,aliases,parents,status&status=in.(accepted,proposed)&order=id&limit=1000&offset=${o}`)) || []; out.push(...r); if (r.length < 1000) return out; }
    },
    fieldsStamp: () => api('/rest/v1/noema_vault_fields?select=updated_at&order=updated_at.desc&limit=1'),
    propose: (name, lang, parents) => api('/rest/v1/rpc/noema_vault_field_propose', { method: 'POST', body: { name, lang, parents } }),
    suggest: (title, course) => api('/rest/v1/rpc/noema_vault_field_suggest', { method: 'POST', body: { title: title || '', course: course || null } }),
  };

  /* ---------- 🧭 the fields: one shared graph (cloud/supabase.sql §13b); a field may sit under many parents ---------- */
  const Fields = (() => {
    let byId = new Map(), kids = new Map(), ups = new Map(), hay = new Map(), loading = null;
    const loc = () => window.NoemaI18n?.locale || globalThis.document?.documentElement?.lang || 'en';
    function set(rows) {
      byId = new Map(rows.map(r => [r.id, r])); kids = new Map(); ups = new Map(); hay = new Map();
      for (const r of rows) for (const p of r.parents || []) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(r.id); }
    }
    const get = id => byId.get(id);
    /** its name in the menus' language (else the same language of another country, else English) */
    const name = id => { const n = byId.get(id)?.names; if (!n) return String(id); const l = loc(), b = l.split('-')[0];
      return n[l] || n[b] || Object.entries(n).find(([k]) => k.split('-')[0] === b)?.[1] || n.en || Object.values(n)[0] || String(id); };
    const allNames = id => { const r = byId.get(id); return r ? [...Object.values(r.names || {}), ...(r.aliases || [])] : []; };
    /** the field and every field above it, by any path */
    const up = id => { let s = ups.get(id); if (s) return s; s = new Set(); const st = [id]; while (st.length) { const x = st.pop(); if (s.has(x)) continue; s.add(x); for (const p of byId.get(x)?.parents || []) st.push(p); } ups.set(id, s); return s; };
    const children = id => (kids.get(id) || []).filter(x => byId.get(x)?.status === 'accepted' || byId.get(x)?.status === 'proposed');
    const roots = () => [...byId.values()].filter(r => !(r.parents || []).length && r.status === 'accepted').map(r => r.id);
    const formsOf = id => { let f = hay.get(id); if (!f) { f = allNames(id).flatMap(forms); hay.set(id, f); } return f; };
    /** fields whose names (any language) start with or contain the words; the closest first */
    function find(q, n = 12) {
      const W = forms(String(q || '').trim()); if (!W[0]) return [];
      const out = [];
      for (const id of byId.keys()) { let best = 0;
        for (const x of formsOf(id)) for (const w of W) { const sc = x === w ? 4 : x.startsWith(w) ? 3 : x.includes(' ' + w) ? 2 : x.includes(w) ? 1 : 0; if (sc > best) best = sc; }
        if (best) out.push([best, id]); }
      return out.sort((a, b) => b[0] - a[0] || name(a[1]).length - name(b[1]).length).slice(0, n).map(x => x[1]);
    }
    /** the fields a text names (a title, a course: "Σημειώσεις Γενετικής" → Genetics), the most specific first */
    function fromText(text, n = 6) {
      const toks = fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean); if (!toks.length) return [];
      const like = (t, w) => w.length >= 5 ? t.startsWith(w.slice(0, Math.max(4, w.length - 2))) : t === w;   // endings differ (Γενετική, Γενετικής)
      const hits = [];
      for (const id of byId.keys()) { if (byId.get(id).status !== 'accepted') continue;
        for (const nm of allNames(id)) { const ws = fold(nm).split(/[^\p{L}\p{N}]+/u).filter(Boolean); if (!ws.length || ws.join('').length < 4) continue;
          if (toks.some((_, i) => ws.every((w, j) => toks[i + j] && like(toks[i + j], w)))) { hits.push([ws.length, nm.length, id]); break; } } }
      const ids = hits.sort((a, b) => b[0] - a[0] || b[1] - a[1]).map(x => x[2]);
      return ids.filter(id => !ids.some(o => o !== id && up(o).has(id))).slice(0, n);   // Medical physics, not also Physics
    }
    /** read once (the browser keeps a copy; it is read again when a field changed, or a day later) */
    function load() {
      if (loading) return loading;
      const key = 'noema-vault-fields-v1:' + (CL()?.uid?.() || '');
      return loading = (async () => {
        let c = null; try { c = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { }
        const stamp = (await Server.fieldsStamp().catch(() => null))?.[0]?.updated_at || '';
        if (c && c.stamp === stamp && Date.now() - c.at < 864e5 && Array.isArray(c.rows)) { set(c.rows); return; }
        const rows = await Server.fields(); set(rows);
        try { localStorage.setItem(key, JSON.stringify({ stamp, at: Date.now(), rows })); } catch (e) { }
      })().catch(e => { loading = null; throw e; });
    }
    /** a field I just proposed: mine at once */
    const addLocal = r => { set([...byId.values(), r]); };
    return { load, get, name, allNames, up, children, roots, find, fromText, addLocal, set, loc, size: () => byId.size };
  })();

  /* ---------- the page's settings, in the address: #/vault?q=…&u=…&sem=3&k=notes,exam … ---------- */
  const KEYS = ['q', 'v', 'by', 'f', 'u', 'd', 'c', 'p', 'y', 'sem', 'k', 'sub', 'x', 'sol', 'hw', 'lg', 'ft', 'r', 'used', 'mine', 'g', 'sort', 'id'];   // g: a study group's folder · id: open that file
  const parse = () => { const q = new URLSearchParams((location.hash.split('?')[1] || '')); const P = {}; for (const k of KEYS) if (q.get(k)) P[k] = q.get(k); return P; };
  const hashOf = P => { const q = new URLSearchParams(); for (const k of KEYS) if (P[k]) q.set(k, P[k]); const s = q.toString(); return '#/vault' + (s ? '?' + s : ''); };
  const listOf = s => String(s || '').split(',').filter(Boolean);
  /* the folders: a view of the one table, never copies. Two ways in — by school (the default) and by field — then the files, grouped by type */
  const SCHOOL = ['university', 'department', 'course'];   // by field: the path goes down the field graph
  const same = (a, b) => fold(a) === fold(b);
  /* a file's languages: a list (el,ru) · university, department, course, year, semester: optional (null: not given; no semester: any) */
  const NONE = '-';   // the folder of the files without that detail (in the address: f=-›…)
  const fieldsOf = f => Array.isArray(f.fields) ? f.fields : [];
  const fieldNames = f => fieldsOf(f).map(Fields.name).join(', ');
  const inField = (f, id) => fieldsOf(f).some(x => Fields.up(x).has(id));   // filed under it, or under a field below it
  const uni = v => v == null || v === '' || v === NONE ? T('unspecified') : String(v);
  const langsOf = f => listOf(f.language);
  const semName = n => +n ? T('semN', { n: +n }) : T('semAny');
  const given = v => v != null && v !== '';
  /** What the search words look in: the title and every field (a year, a type, a subject, a language, in the menus' words). */
  // the menus' words in every language this page holds (the menus' own, English, any other already loaded): "notes" and "Σημειώσεις" both find the type
  const every = k => { const out = new Set([T(k)]); for (const c of Object.values(window.NOEMA_I18N || {})) { const w = c?.m?.['vault.' + k] ?? c?.d?.['vault.' + k]; if (typeof w === 'string' && !/[{}]/.test(w)) out.add(w); } return [...out]; };
  const langWords = c => { const out = new Set([langName(c)]); for (const tag of Object.keys(window.NOEMA_I18N || {})) try { out.add(new Intl.DisplayNames([tag], { type: 'language' }).of(c)); } catch (e) { } return [...out]; };
  const hayOf = f => [f.title, f.description, f.university, f.department, f.course, f.professor, f.file_name, ...every('kind.' + f.kind), ...fieldsOf(f).flatMap(Fields.allNames), f.uploader_name,
    f.year ? String(f.year) : '', f.semester ? semName(f.semester) : '', ...langsOf(f).flatMap(langWords), ...(f.has_exercises ? every('c.exercises') : []), ...(f.has_solutions ? every('c.solutions') : []),
    ...(f.handwritten ? every('c.handwritten') : [])].filter(Boolean).join(' · ');
  /** The files that pass every filter (and the words of the search). */
  function filter(all, P) {
    const k = listOf(P.k), ft = listOf(P.ft);
    return all.filter(f => (!P.u || same(f.university, P.u)) && (!P.d || same(f.department, P.d)) && (!P.c || same(f.course, P.c)) && (!P.p || same(f.professor || '', P.p))
      && (!P.y || String(f.year) === P.y) && (!P.sem || String(f.semester) === P.sem || !f.semester) && (!k.length || k.includes(f.kind)) && (!P.sub || inField(f, P.sub))
      && (!P.x || f.has_exercises) && (!P.sol || f.has_solutions) && (!P.hw || (P.hw === 'hand' ? f.handwritten : !f.handwritten)) && (!P.lg || langsOf(f).includes(P.lg))
      && (!ft.length || ft.includes(groupOf(f))) && (!P.r || (f.rating_n && f.rating_sum / f.rating_n >= +P.r)) && (!P.used || f.used > 0) && (!P.mine || f.mine) && (!P.g || f.room === P.g)
      && (!P.q || matches(hayOf(f), P.q)));
  }
  const SORTS = { new: (a, b) => String(b.created_at).localeCompare(String(a.created_at)), rating: (a, b) => stars(b) - stars(a) || b.rating_n - a.rating_n, downloads: (a, b) => b.downloads - a.downloads, year: (a, b) => b.year - a.year };
  const stars = f => f.rating_n ? f.rating_sum / f.rating_n : 0;
  /** distinct values of a field (the way they were first written), most used first */
  function values(rows, field) {
    const m = new Map(); for (const r of rows) { const v = r[field]; if (v == null || v === '') continue; const key = fold(v); const x = m.get(key) || { v, n: 0 }; x.n++; m.set(key, x); }
    return [...m.values()].sort((a, b) => b.n - a.n || String(a.v).localeCompare(String(b.v), undefined, { numeric: true }));
  }

  /* ---------- small helpers for the view ---------- */
  const num = n => window.NoemaI18n ? NoemaI18n.fmt.number(n) : String(n);
  const mb = n => (window.NoemaI18n ? NoemaI18n.fmt.number(Math.max(0.1, n / 1048576), { maximumFractionDigits: 1 }) : (n / 1048576).toFixed(1)) + ' MB';   // i18n-ignore (unit)
  const langName = c => { try { return window.NoemaI18n?.fmt?.langName ? NoemaI18n.fmt.langName(c) : new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'language' }).of(c); } catch (e) { return c; } };
  const LANGS = () => Object.keys(window.NoemaCurriculum?.LANG || { en: 1, el: 1, de: 1, fr: 1, es: 1, it: 1, ru: 1 });
  const when = f => f.year && f.semester ? T('yearSem', { year: f.year, sem: f.semester }) : f.year ? String(f.year) : f.semester ? semName(f.semester) : '';
  const where = f => [f.course, f.university, when(f)].filter(Boolean).join(' · ') || fieldNames(f) || T('unspecified');
  const GICON = { doc: 'doc', slides: 'grid', sheet: 'rows', book: 'book', image: 'eye', audio: 'mic', video: 'play', text: 'doc' };
  let cache = null, mineR = {}, mineRep = {}, groups = [];   // groups: my study groups [{ id, name }] (engine/social.js)
  const groupName = id => groups.find(g => g.id === id)?.name || T('aGroup');
  async function load(force = false) {
    if (cache && !force) return cache;
    const [rows, rt, rp, gs] = await Promise.all([Server.list(), Server.myRatings().catch(() => []), Server.myReports().catch(() => []), window.NoemaSocial ? NoemaSocial.groups().catch(() => []) : [],
      Fields.load().catch(e => console.warn('vault fields', e))]);   // without them the files still show
    groups = gs || [];
    cache = rows || []; mineR = Object.fromEntries((rt || []).map(r => [r.file_id, r.stars])); mineRep = Object.fromEntries((rp || []).map(r => [r.file_id, r.reason]));
    return cache;
  }

  /* ======================= the page ======================= */
  function page(ctx) {
    const { h, page: pg, go, sheet, svg, ico, chev, pill } = ctx;
    let P = parse();
    const v = pg({ tab: 'vault', crumbs: [[T('title')]], cls: 'vt-view',
      menu: () => [{ label: T('myUploads'), sub: T('myUploadsSub'), icon: 'upload', run: () => setP({ mine: P.mine ? '' : '1' }) }, { label: T('howItWorks'), icon: 'info', run: () => about(ctx) }] });
    v.append(h('h1', {}, T('title')), h('p', { class: 'ns-muted vt-lead' }, T('lead')));
    if (!CL()?.session?.()) {
      v.append(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, T('signIn')), h('button', { class: 'btn primary', onclick: () => N()?.openAccountPicker?.() }, T('signInBtn'))));
      return;
    }
    const inp = h('input', { class: 'noema-input ns-srin vt-q', type: 'search', value: P.q || '', placeholder: T('searchPh'), 'aria-label': T('search'), autocomplete: 'off' });
    const upBtn = h('button', { class: 'btn primary vt-upbtn', onclick: () => upload(ctx, () => refresh(true), { room: P.g || '' }) }, svg('upload'), ' ', T('upload'));
    const viewSeg = h('div', { class: 'ns-seg small vt-viewseg', role: 'radiogroup', 'aria-label': T('view') });
    const filtBtn = h('button', { class: 'btn small ghost vt-filtbtn', 'aria-haspopup': 'dialog', onclick: () => openFilters() });
    const sortSel = h('select', { class: 'noema-input small vt-sort', 'aria-label': T('sort'), onchange: () => setP({ sort: sortSel.value === 'new' ? '' : sortSel.value }) }, ...Object.keys(SORTS).map(k => h('option', { value: k }, T('sort.' + k))));
    const filt = h('div', { class: 'vt-filters' });
    const FKEYS = () => KEYS.filter(k => !['q', 'v', 'by', 'f', 'sort', 'id'].includes(k) && P[k]);
    const clearAll = () => h('button', { class: 'btn small ghost vt-clearall', disabled: FKEYS().length ? null : true, onclick: () => setP(Object.fromEntries(FKEYS().map(k => [k, '']))) }, svg('close'), ' ', T('clear'));
    const fhead = h('div', { class: 'row vt-fhead' });
    /** the filters: a side panel; the page behind follows every choice at once */
    const openFilters = () => sheet(T('filters'), body => { body.append(fhead, filt); drawFilters(); }, { cls: 'vt-filtsheet' });
    const chips = h('div', { class: 'vt-active' });
    const out = h('div', { class: 'vt-out' }, h('p', { class: 'ns-muted' }, T('loading')));
    v.append(h('div', { class: 'row vt-bar' }, inp, upBtn), h('div', { class: 'row vt-row' }, viewSeg, filtBtn, sortSel), chips, out);
    const setP = patch => { P = { ...P, ...patch }; for (const k of Object.keys(P)) if (!P[k]) delete P[k]; history.replaceState(null, '', location.pathname + location.search + hashOf(P)); draw(); };
    let t = 0; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => setP({ q: inp.value.trim() }), 140); });
    let all = [];
    async function refresh(force) { try { all = await load(force); } catch (e) { out.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, T('offline')), h('p', { class: 'tiny ns-muted' }, window.NoemaI18n ? NoemaI18n.err(e) : e.message))); return; } if (v.isConnected) draw(); }

    const sel = (label, key, opts, { bare = false } = {}) => h('label', { class: 'vt-f' }, bare ? null : h('span', { class: 'ns-label' }, label),
      (() => { const s = h('select', { class: 'noema-input small', 'data-f': key, 'aria-label': label, onchange: () => setP({ [key]: s.value }) }, h('option', { value: '' }, T('any')), ...opts.map(([val, l]) => h('option', { value: val }, l))); s.value = P[key] || ''; return s; })());
    const chip = (key, val, label, multi = false) => { const on = multi ? listOf(P[key]).includes(val) : P[key] === val; return h('button', { class: 'ns-srchip' + (on ? ' on' : ''), 'aria-pressed': String(on), 'data-f': key, 'data-v': val, onclick: () => {
      if (!multi) return setP({ [key]: on ? '' : val }); const s = new Set(listOf(P[key])); on ? s.delete(val) : s.add(val); setP({ [key]: [...s].join(',') }); } }, label, on ? h('span', { class: 'vt-chipx', 'aria-hidden': 'true' }, '×') : null); };   // i18n-ignore (×)
    const group = (label, ...kids) => h('div', { class: 'vt-fgroup' }, h('b', { class: 'vt-fhead' }, label), h('div', { class: 'vt-fbody' }, ...kids));
    /** the fields of the files here and every field above them, with how many files each holds */
    const fieldOpts = () => { const n = new Map(); for (const f of all) { const s = new Set(); for (const x of fieldsOf(f)) for (const y of Fields.up(x)) s.add(y); for (const y of s) n.set(y, (n.get(y) || 0) + 1); }
      return [...n].map(([id, c]) => [id, `${Fields.name(id)} (${num(c)})`]).sort((a, b) => a[1].localeCompare(b[1])); };
    function drawFilters() {
      // each list offers the values that exist under the choices made above it (university › department › course)
      const inU = all.filter(f => !P.u || same(f.university, P.u)), inD = inU.filter(f => !P.d || same(f.department, P.d)), inC = inD.filter(f => !P.c || same(f.course, P.c));
      const opt = (rows, k) => values(rows, k).map(x => [String(x.v), `${k === 'university' ? uni(x.v) : x.v} (${num(x.n)})`]);
      filt.replaceChildren(
        group(T('g.where'), sel(T('f.university'), 'u', opt(all, 'university')), sel(T('f.department'), 'd', opt(inU, 'department')), sel(T('f.course'), 'c', opt(inD, 'course')), sel(T('f.professor'), 'p', opt(inC, 'professor'))),
        group(T('g.when'), sel(T('f.year'), 'y', values(all, 'year').sort((a, b) => b.v - a.v).map(x => [String(x.v), String(x.v)])), sel(T('f.semester'), 'sem', Array.from({ length: 12 }, (_, i) => [String(i + 1), semName(i + 1)]))),
        group(T('g.type'), h('div', { class: 'ns-srchips' }, ...KINDS.map(k => chip('k', k, T('kind.' + k), true)))),
        group(T('g.subject'), sel(T('f.subject'), 'sub', fieldOpts(), { bare: true })),
        group(T('g.contents'), h('div', { class: 'ns-srchips' }, chip('x', '1', T('c.exercises')), chip('sol', '1', T('c.solutions')), chip('hw', 'hand', T('c.handwritten')), chip('hw', 'typed', T('c.typed')))),
        group(T('g.format'), sel(T('f.language'), 'lg', values(all.flatMap(f => langsOf(f).map(language => ({ language }))), 'language').map(x => [x.v, langName(x.v)])), h('div', { class: 'ns-srchips' }, ...GROUPS.map(g => chip('ft', g, T('ft.' + g), true)))),
        group(T('g.quality'), sel(T('f.rating'), 'r', [['3', T('r.3')], ['4', T('r.4')]])),
        group(T('g.use'), h('div', { class: 'ns-srchips' }, chip('used', '1', T('c.used')))),
        groups.length ? group(T('g.group'), sel(T('f.group'), 'g', groups.map(g => [g.id, g.name]), { bare: true })) : '');   // '' not null: the DOM would write "null"
      const n = KEYS.filter(k => !['q', 'v', 'by', 'f', 'sort', 'id'].includes(k) && P[k]).length;
      filtBtn.replaceChildren(svg('filter'), ' ', n ? T('filtersN', { n }) : T('filters'));
      // the filters in use, each one removable
      const label = k => ({ u: uni(P.u), d: P.d, c: P.c, p: P.p, y: P.y, sem: semName(P.sem), k: listOf(P.k).map(x => T('kind.' + x)).join(', '), sub: Fields.name(P.sub), x: T('c.exercises'), sol: T('c.solutions'),
        hw: T(P.hw === 'hand' ? 'c.handwritten' : 'c.typed'), lg: langName(P.lg), ft: listOf(P.ft).map(x => T('ft.' + x)).join(', '), r: T('r.' + P.r), used: T('c.used'), mine: T('myUploads'), g: groupName(P.g) })[k];
      const on = KEYS.filter(k => !['q', 'v', 'by', 'f', 'sort', 'id'].includes(k) && P[k]);
      chips.replaceChildren(...on.map(k => h('button', { class: 'ns-srchip on vt-chip', 'data-f': k, title: T('removeFilter', { what: label(k) }), 'aria-label': T('removeFilter', { what: label(k) }), onclick: () => setP({ [k]: '' }) }, label(k), h('span', { class: 'vt-chipx', 'aria-hidden': 'true' }, '×'))),   // i18n-ignore (×)
        on.length > 1 ? h('button', { class: 'linkish vt-clearchips', onclick: () => setP(Object.fromEntries(on.map(k => [k, '']))) }, T('clear')) : '');
      fhead.replaceChildren(h('small', { class: 'tiny ns-muted' }, T('results', { n: filter(all, P).length })), clearAll());
    }
    function card(f, i) {
      const rating = f.rating_n ? `★ ${num(Math.round(stars(f) * 10) / 10)}` : '';
      return h('button', { class: 'ns-item vt-file', 'data-id': f.id, onclick: () => details(ctx, f, () => refresh(true)) }, ico(GICON[groupOf(f)] || 'doc', (i % 4) + 1),
        h('span', { class: 't' }, h('b', {}, f.title), h('small', {}, [T('kind.' + f.kind), where(f)].join(' · '))),
        h('span', { class: 'vt-meta tiny' }, f.room ? pill(groupName(f.room), 2, 'vt-grouppill') : null, f.mine && f.status !== 'ok' ? pill(T('status.' + f.status)) : null, rating ? h('span', { title: T('ratingN', { n: f.rating_n }) }, rating) : null, f.downloads ? h('span', { title: T('downloadsN', { n: f.downloads }) }, '⬇ ' + num(f.downloads)) : null), chev());   // i18n-ignore (★ ⬇: signs)
    }
    function files(list) {
      const sorted = [...list].sort(SORTS[P.sort] || SORTS.new);
      return sorted.length ? h('div', { class: 'ns-list vt-list' }, ...sorted.slice(0, 300).map(card)) : empty();
    }
    const empty = () => h('div', { class: 'ns-panel ns-empty vt-empty' }, ctx.faceEl(undefined, 'breathe'), h('p', {}, all.length ? T('none') : T('emptyVault')), h('button', { class: 'btn small primary', onclick: () => upload(ctx, () => refresh(true)) }, T('upload')));
    /* 📁 the folders: school › department › course, or down the field graph; at the end the files by type, with chips for language, year, semester */
    const valsOf = (f, lev) => given(f[lev]) ? [f[lev]] : [];
    const folderName = (lev, v) => v === NONE ? T('misc') : lev === 'field' ? Fields.name(v) : String(v);
    const pinKey = () => `noema1:${acc()}:a:vaultpins`;
    const pins = () => { try { return JSON.parse(N()?.kv?.get(pinKey()) || '[]'); } catch (e) { return []; } };
    const putPins = l => N()?.kv?.set(pinKey(), JSON.stringify(l.slice(0, 12)));
    function folders(list) {
      const by = P.by === 'field' ? 'field' : 'school', path = (P.f || '').split('›').filter(Boolean);
      const LV = by === 'field' ? path.map(() => 'field') : SCHOOL, depth = Math.min(path.length, LV.length);
      const here = list.filter(f => path.slice(0, depth).every((p, i) => { const vs = valsOf(f, LV[i]); return vs.length ? vs.some(v => String(v) === p || same(v, p)) : p === NONE; }));
      const ways = h('div', { class: 'ns-seg small vt-ways', role: 'radiogroup', 'aria-label': T('folders') }, ...[['school', T('bySchool')], ['field', T('byField')]].map(([k, l]) =>
        h('button', { class: by === k ? 'on' : '', role: 'radio', 'aria-checked': String(by === k), 'data-by': k, onclick: () => setP({ by: k === 'school' ? '' : k, f: '' }) }, l)));
      const label = path.slice(0, depth).map((p, i) => folderName(LV[i], p)).join(' › ');
      const mine = pins(), pinned = mine.some(x => x.by === by && x.f === (P.f || ''));
      const pinBtn = depth ? h('button', { class: 'linkish tiny vt-pin', onclick: () => { putPins(pinned ? mine.filter(x => !(x.by === by && x.f === P.f)) : [{ by, f: P.f, label }, ...mine]); draw(); } }, pinned ? T('unpin') : T('pin')) : null;
      const pinRow = mine.length ? h('div', { class: 'row vt-pins' }, h('small', { class: 'tiny ns-muted' }, T('pinned')), ...mine.map(x => h('button', { class: 'chip', onclick: () => setP({ by: x.by === 'school' ? '' : x.by, f: x.f }) }, x.label))) : null;
      const crumbs = h('nav', { class: 'vt-path', 'aria-label': T('folders') }, h('button', { class: 'linkish', onclick: () => setP({ f: '' }) }, by === 'school' ? T('allSchools') : T('allFields')),
        ...path.slice(0, depth).flatMap((p, i) => [h('span', { 'aria-hidden': 'true' }, ' › '), h('button', { class: 'linkish', onclick: () => setP({ f: path.slice(0, i + 1).join('›') }) }, folderName(LV[i], p))]), pinBtn ? ' ' : null, pinBtn);
      const head = [pinRow, ways, crumbs].filter(Boolean);
      if (by === 'field') return h('div', {}, ...head, fieldFolder(list, path));
      if (depth >= LV.length) return h('div', {}, ...head, ending(here));
      const lev = LV[depth], kids = values(here.flatMap(f => valsOf(f, lev).map(v => ({ [lev]: v }))), lev), none = here.filter(f => !valsOf(f, lev).length).length;
      kids.sort((a, b) => b.n - a.n || folderName(lev, a.v).localeCompare(folderName(lev, b.v)));
      if (none) kids.push({ v: NONE, n: none });
      return h('div', {}, ...head, kids.length ? h('div', { class: 'ns-list vt-folders' }, ...kids.map(x => h('button', { class: 'ns-item vt-folder', 'data-v': String(x.v), onclick: () => setP({ f: [...path.slice(0, depth), String(x.v)].join('›') }) },
        h('span', { class: 'ns-ico' }, svg('vault')), h('span', { class: 't' }, h('b', {}, folderName(lev, x.v)), h('small', {}, T('nFiles', { n: x.n }))), chev()))) : empty());
    }
    const folderRow = (x, name, to) => h('button', { class: 'ns-item vt-folder', 'data-v': String(x.v), onclick: () => setP({ f: to }) },
      h('span', { class: 'ns-ico' }, svg('vault')), h('span', { class: 't' }, h('b', {}, name), h('small', {}, T('nFiles', { n: x.n }))), chev());
    /** By field: the fields under this one that hold files (a file under two of them shows in both: a view, not a copy),
        then the files filed under this field itself. At the top: the broad fields, and Misc for fields not known here. */
    function fieldFolder(list, path) {
      const node = path[path.length - 1];
      if (node === NONE) return ending(list.filter(f => !fieldsOf(f).some(x => Fields.get(x))));
      const here = node ? list.filter(f => inField(f, node)) : list;
      const kids = (node ? Fields.children(node) : Fields.roots()).map(v => ({ v, n: here.filter(f => inField(f, v)).length })).filter(x => x.n)
        .sort((a, b) => b.n - a.n || Fields.name(a.v).localeCompare(Fields.name(b.v)));
      if (!node) { const lost = here.filter(f => !fieldsOf(f).some(x => Fields.get(x))).length; if (lost) kids.push({ v: NONE, n: lost }); }
      const direct = node ? here.filter(f => fieldsOf(f).includes(node)) : [];
      if (!kids.length) return ending(here);
      return h('div', {}, h('div', { class: 'ns-list vt-folders' }, ...kids.map(x => folderRow(x, folderName('field', x.v), [...path, String(x.v)].join('›')))),
        direct.length ? h('h3', { class: 'vt-directhead' }, T('filedHere', { name: Fields.name(node) })) : null, direct.length ? ending(direct) : null);
    }
    /** The end of a way: chips for the languages, years and semesters there (each one a filter), then the files by type. */
    function ending(list) {
      if (!list.length) return empty();
      const chipsOf = (key, vals, name) => vals.length > 1 ? vals.map(v => h('button', { class: 'ns-srchip' + (P[key] === String(v) ? ' on' : ''), 'data-f': key, 'data-v': String(v), onclick: () => setP({ [key]: P[key] === String(v) ? '' : String(v) }) }, name(v))) : [];
      const uniq = a => [...new Set(a)];
      const bar = [...chipsOf('lg', uniq(list.flatMap(langsOf)), langName), ...chipsOf('y', uniq(list.map(f => f.year).filter(Boolean)).sort((a, b) => b - a), String),
        ...chipsOf('sem', uniq(list.map(f => f.semester).filter(Boolean)).sort((a, b) => a - b), semName)];
      const sorted = [...list].sort(SORTS[P.sort] || SORTS.new), kinds = KINDS.filter(k => sorted.some(f => f.kind === k));
      return h('div', {}, bar.length ? h('div', { class: 'ns-srchips vt-endchips' }, ...bar) : null,
        ...kinds.map(k => h('section', { class: 'vt-kindgroup', 'data-kind': k }, h('h3', { class: 'vt-kindhead' }, T('kind.' + k), ' ', h('small', { class: 'ns-muted' }, num(sorted.filter(f => f.kind === k).length))),
          h('div', { class: 'ns-list vt-list' }, ...sorted.filter(f => f.kind === k).slice(0, 300).map(card)))));
    }
    function draw() {
      viewSeg.replaceChildren(...[['', T('files')], ['folders', T('folders')]].map(([k, l]) => h('button', { class: (P.v || '') === k ? 'on' : '', role: 'radio', 'aria-checked': String((P.v || '') === k), 'data-v': k || 'files', onclick: () => setP({ v: k, f: '', by: '' }) }, l)));
      sortSel.value = P.sort || 'new';
      drawFilters();
      const list = filter(all, P);
      out.replaceChildren(P.g ? h('p', { class: 'ns-panel tiny vt-groupnote' }, T('groupNote', { name: groupName(P.g) })) : '', h('p', { class: 'tiny ns-muted vt-count' }, T('results', { n: list.length })), P.v === 'folders' ? folders(list) : files(list));
      if (P.id) { const f = all.find(x => x.id === P.id); setP({ id: '' }); if (f) details(ctx, f, () => refresh(true)); else toast(T('fileGone'), 4000); }   // a vault file sent in a conversation
    }
    refresh(false);
  }

  /* ---------- one file: what it is, a preview, download, make a course from it, rate, report ---------- */
  function details(ctx, f, onChange) {
    const { h, sheet, svg } = ctx;
    sheet(f.title, (body, close) => {
      const facts = [[T('f.university'), f.university], [T('f.department'), f.department], [T('f.course'), f.course], [T('f.professor'), f.professor], [T('f.when'), when(f)],
        [T('f.type'), T('kind.' + f.kind)], [T('f.fields'), fieldNames(f)], [T('f.language'), langsOf(f).map(langName).join(', ')],
        [T('f.contents'), [f.has_exercises && T('c.exercises'), f.has_solutions && T('c.solutions'), T(f.handwritten ? 'c.handwritten' : 'c.typed')].filter(Boolean).join(' · ')],
        [T('f.file'), `${f.file_name} · ${mb(f.size)}${f.pages ? ' · ' + T('pagesN', { n: f.pages }) : ''}`], [T('f.sharedBy'), f.uploader_name || T('anonymous')], [T('f.group'), f.room ? groupName(f.room) : null]].filter(([, x]) => x);
      const busy = async (b, fn) => { b.disabled = true; try { await fn(); } catch (e) { toast('⚠️ ' + (window.NoemaI18n ? NoemaI18n.err(e) : e.message), 6000); } b.disabled = false; };
      const getFile = async () => new File([await Server.blob(f)], f.file_name, { type: f.mime });
      const g = groupOf(f), canPreview = ['doc', 'image', 'audio', 'video', 'text', 'sheet'].includes(g) && (g !== 'doc' || f.mime === 'application/pdf') && (g !== 'sheet' || f.mime === 'text/csv');
      const starRow = h('div', { class: 'vt-stars', role: 'radiogroup', 'aria-label': T('rate') });
      const drawStars = () => starRow.replaceChildren(...[1, 2, 3, 4, 5].map(n => h('button', { class: 'vt-star' + ((mineR[f.id] || 0) >= n ? ' on' : ''), role: 'radio', 'aria-checked': String(mineR[f.id] === n), 'aria-label': T('starsN', { n }), disabled: f.mine || null,
        onclick: e => busy(e.currentTarget, async () => { await Server.rate(f.id, n); mineR[f.id] = n; drawStars(); onChange(); }) }, '★')));   // i18n-ignore (the star sign)
      drawStars();
      const tile = (icon, label, cls, onclick, title) => h('button', { class: 'vt-tile ' + cls, title: title || label, onclick }, h('span', { class: 'vt-tileico', 'aria-hidden': 'true' }, svg(icon)), h('span', { class: 'vt-tilelb' }, label));
      const more = f.mine ? [{ label: T('edit'), icon: 'edit', cls: 'vt-edit', run: () => edit(ctx, f, onChange) },
        { label: T('delete'), icon: 'trash', cls: 'vt-delete', danger: true, run: () => { if (!confirm(T('deleteAsk', { title: f.title }))) return; Server.remove(f).then(() => { close(); toast(T('deleted'), 3000); onChange(); }, e => toast('⚠️ ' + (window.NoemaI18n ? NoemaI18n.err(e) : e.message), 6000)); } }]
        : mineRep[f.id] ? [] : [{ label: T('report'), icon: 'flag', cls: 'vt-report', run: () => report(ctx, f, () => { mineRep[f.id] = 'x'; close(); onChange(); }) }];
      body.append(
        f.description ? h('p', { class: 'vt-desc' }, f.description) : null,
        f.mine && f.status !== 'ok' ? h('p', { class: 'ns-panel tiny vt-status' }, T('statusLong.' + f.status)) : null,
        h('dl', { class: 'vt-facts' }, ...facts.flatMap(([k, x]) => [h('dt', {}, k), h('dd', {}, x)])),
        h('p', { class: 'tiny ns-muted' }, [f.rating_n ? T('ratingN', { n: f.rating_n }) : T('noRating'), T('downloadsN', { n: f.downloads }), f.used ? T('usedN', { n: f.used }) : ''].filter(Boolean).join(' · ')),
        // what one does with it: one row of tiles (the usual actions); editing, deleting and reporting behind ⋮
        h('div', { class: 'vt-acts', role: 'group', 'aria-label': T('actions') },
          tile('download', T('download'), 'vt-download primary', e => busy(e.currentTarget, async () => { const file = await getFile(); const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = f.file_name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); Server.count(f.id, 'download'); })),
          canPreview ? tile('eye', T('preview'), 'vt-prevbtn', e => busy(e.currentTarget, async () => previewWin(ctx, f, await Server.blob(f)))) : null,
          window.NoemaSocial && f.status === 'ok' ? tile('send', T('sendTo'), 'vt-sendto', () => NoemaSocial.sendTo(ctx, { kind: 'vault', id: f.id, title: f.title }, { title: f.title })) : null,
          window.NoemaCurMap?.fromSources ? tile('spark', T('makeCourseShort'), 'vt-course', e => busy(e.currentTarget, async () => { const file = await getFile(); close(); Server.count(f.id, 'used'); NoemaCurMap.fromSources(acc(), { files: [file], onStudy: id => N()?.open?.(id) }); }), T('makeCourse')) : null,
          more.length ? h('span', { class: 'vt-moremenu' }, ctx.menuButton(more, { label: T('moreActions'), cls: 'vt-tile vt-moretile', content: h('span', { class: 'vt-tilein' }, h('span', { class: 'vt-tileico', 'aria-hidden': 'true' }, '⋮'), h('span', { class: 'vt-tilelb' }, T('moreActions'))) })) : null),   // i18n-ignore (⋮)
        f.mine ? null : h('div', { class: 'vt-rate' }, h('span', { class: 'ns-label' }, T('rate')), mineRep[f.id] ? null : starRow, mineRep[f.id] ? h('span', { class: 'tiny ns-muted' }, T('reported')) : null));
    }, { cls: 'vt-sheet' });
  }
  /** The preview in a window of its own over the page (the file's panel stays behind it); ✕, Esc or a click outside close it. */
  async function previewWin(ctx, f, blob) {
    const { h, svg } = ctx, box = h('div', { class: 'vt-preview' }), opener = document.activeElement;
    const shut = () => { win.remove(); URL.revokeObjectURL(box.dataset.url || ''); opener?.focus?.(); };
    const win = h('div', { class: 'vt-prevwin', role: 'dialog', 'aria-modal': 'true', 'aria-label': f.title, onkeydown: e => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } } },
      h('div', { class: 'ns-scrim', onclick: shut }), h('div', { class: 'vt-prevbox' }, h('div', { class: 'vt-prevhead' }, h('b', {}, f.title), h('button', { class: 'ns-iconbtn vt-prevclose', 'aria-label': ctx.L('close'), onclick: shut }, svg('close'))), box));
    document.body.append(win); await preview(h, box, f, blob); win.querySelector('.vt-prevclose').focus();
  }
  async function preview(h, box, f, blob) {
    const url = URL.createObjectURL(new Blob([blob], { type: f.mime })), g = groupOf(f); box.dataset.url = url;
    if (g === 'image') box.replaceChildren(h('img', { src: url, alt: f.title }));
    else if (g === 'audio') box.replaceChildren(h('audio', { src: url, controls: true }));
    else if (g === 'video') box.replaceChildren(h('video', { src: url, controls: true }));
    else if (f.mime === 'application/pdf') box.replaceChildren(h('iframe', { src: url, title: f.title }));
    else box.replaceChildren(h('pre', {}, (await blob.text()).slice(0, 20000)));
  }

  /** A dialog of the frame (NoemaShell.modal) with its title and ✕; build(body, close) */
  const dialog = (ctx, title, build, o) => ctx.modal(title, ({ head, body, close }) => {
    head.append(ctx.h('b', {}, title), ctx.h('button', { class: 'ns-iconbtn', 'aria-label': ctx.L('close'), onclick: close }, ctx.svg('close'))); build(body, close); }, o);
  /* ---------- report: copyright, answers of an exam not held yet, wrong labels, abuse, spam ---------- */
  function report(ctx, f, onDone) {
    const { h } = ctx;
    dialog(ctx, T('reportTitle'), (body, close) => {
      const reasons = ['copyright', 'live_exam', 'wrong', 'abuse', 'spam', 'other'];
      const pick = h('select', { class: 'noema-input vt-reason', 'aria-label': T('reason') }, ...reasons.map(r => h('option', { value: r }, T('reason.' + r))));
      const note = h('textarea', { class: 'noema-input', rows: 3, maxlength: 600, placeholder: T('reportNote') });
      body.append(h('p', { class: 'tiny ns-muted' }, T('reportLead')), pick, note, h('div', { class: 'row' },
        h('button', { class: 'btn primary vt-sendreport', onclick: async e => { e.currentTarget.disabled = true; try { await Server.report(f.id, pick.value, note.value.trim()); toast(T('reportThanks'), 4000); close(); onDone(); } catch (er) { toast('⚠️ ' + (window.NoemaI18n ? NoemaI18n.err(er) : er.message), 5000); e.currentTarget.disabled = false; } } }, T('sendReport')),
        h('button', { class: 'btn ghost', onclick: close }, T('cancel'))));
    });
  }

  /* ---------- the form of a file's place and contents: upload (many files at once) and edit share it ---------- */
  function fields(h, all, init = {}, { text = () => init.title || '' } = {}) {
    const list = (id, field) => h('datalist', { id }, ...values(all, field).slice(0, 200).map(x => h('option', { value: String(x.v) })));
    const txt = (key, label, { req = true, max = 120, dl = '' } = {}) => { const i = h('input', { class: 'noema-input', 'data-k': key, maxlength: max, required: req || null, list: dl || null, value: init[key] || '' }); return [h('label', { class: 'vt-fld' }, h('span', { class: 'ns-label' }, label + (req ? ' *' : '')), i), i]; };
    const pickOf = (key, label, opts, val, { req = true, none = T('choose') } = {}) => { const s = h('select', { class: 'noema-input', 'data-k': key, required: req || null }, h('option', { value: '' }, none), ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = val ?? ''; return [h('label', { class: 'vt-fld' }, h('span', { class: 'ns-label' }, label + (req ? ' *' : '')), s), s]; };
    const year = new Date().getFullYear();
    // where and when: optional (they differ from place to place); what and in which language: always
    const [uL, u] = txt('university', T('f.university'), { req: false, dl: 'vt-dl-u' }), [dL, d] = txt('department', T('f.department'), { req: false, dl: 'vt-dl-d' }), [cL, c] = txt('course', T('f.course'), { req: false, max: 160, dl: 'vt-dl-c' }), [pL, p] = txt('professor', T('f.professor'), { req: false, dl: 'vt-dl-p' });
    cL.firstChild.append(' ', h('small', { class: 'tiny ns-muted vt-hint' }, T('courseHint')));   // its own name, not the field
    const [yL, y] = pickOf('year', T('f.year'), Array.from({ length: year - 1979 }, (_, i) => [String(year - i), String(year - i)]), init.year ? String(init.year) : '', { req: false, none: T('unspecified') });
    const [sL, s] = pickOf('semester', T('f.semester'), Array.from({ length: 12 }, (_, i) => [String(i + 1), semName(i + 1)]), init.semester ? String(init.semester) : '', { req: false, none: T('semAny') });
    const [kL, k] = pickOf('kind', T('f.type'), KINDS.map(x => [x, T('kind.' + x)]), init.kind || '');
    const pick = fieldPicker(h, fieldsOf(init), () => [text(), c.value].join(' · '), () => ({ title: text(), course: c.value.trim() }));
    const bL = h('div', { class: 'vt-fld vt-fieldsfld' }, h('span', { class: 'ns-label' }, T('f.fields') + ' *'), h('small', { class: 'tiny ns-muted vt-hint' }, T('fieldHelp')), pick.el);
    c.addEventListener('change', () => pick.suggest());
    // a past exam without its year is of little use: say so (still not required)
    const yHint = h('small', { class: 'tiny ns-muted vt-yhint', hidden: true }, T('yearForExams'));
    const hintY = () => { yHint.hidden = !(/^exam/.test(k.value) && !y.value); }; k.addEventListener('change', hintY); y.addEventListener('change', hintY); yL.append(yHint);
    const uiLang = (window.NoemaI18n?.locale || 'en').slice(0, 2);
    // the languages: one or more (a dictionary, a bilingual course) — chips, and a list to add one more
    let langs = init.language ? listOf(init.language) : [LANGS().includes(uiLang) ? uiLang : 'en'];
    const chipsL = h('div', { class: 'row vt-langs' }), l = h('select', { class: 'noema-input', 'data-k': 'language', 'aria-label': T('addLanguage') });
    const drawLangs = () => {
      chipsL.replaceChildren(...langs.map(x => h('button', { type: 'button', class: 'chip on', title: T('removeLanguage'), onclick: () => { langs = langs.filter(y => y !== x); drawLangs(); } }, langName(x) + ' ×')));
      l.replaceChildren(h('option', { value: '' }, langs.length ? T('addLanguage') : T('choose')), ...LANGS().filter(x => !langs.includes(x)).map(x => h('option', { value: x }, langName(x))));
    };
    l.addEventListener('change', () => { if (l.value && langs.length < 8) langs.push(l.value); drawLangs(); }); drawLangs();
    const lL = h('label', { class: 'vt-fld' }, h('span', { class: 'ns-label' }, T('f.languages') + ' *'), chipsL, l);
    const box = (key, label) => { const i = h('input', { type: 'checkbox', 'data-k': key, checked: init[key] || null }); return [h('label', { class: 'vt-check' }, i, ' ', label), i]; };
    const [exL, ex] = box('has_exercises', T('c.exercises')), [soL, so] = box('has_solutions', T('c.solutions')), [hwL, hw] = box('handwritten', T('c.handwritten'));
    const [shL, sh] = box('show_name', T('showName'));
    const desc = h('textarea', { class: 'noema-input', 'data-k': 'description', rows: 2, maxlength: 1000, placeholder: T('descPh') }); desc.value = init.description || '';
    // a name already in the vault, written another way (case, accents, spaces) → that one: the folders stay one per place
    const snap = (i, field) => i.addEventListener('change', () => { const m = values(all, field).find(x => fold(String(x.v)).replace(/\s+/g, ' ').trim() === fold(i.value).replace(/\s+/g, ' ').trim()); if (m) i.value = String(m.v); });
    snap(u, 'university'); snap(d, 'department'); snap(c, 'course'); snap(p, 'professor');
    const el = h('div', { class: 'vt-form' }, list('vt-dl-u', 'university'), list('vt-dl-d', 'department'), list('vt-dl-c', 'course'), list('vt-dl-p', 'professor'),
      h('fieldset', { class: 'vt-fs' }, h('legend', {}, T('g.where')), uL, dL, cL, pL),
      h('fieldset', { class: 'vt-fs' }, h('legend', {}, T('g.whatWhen')), yL, sL, kL, bL, lL),
      h('fieldset', { class: 'vt-fs' }, h('legend', {}, T('g.contents')), h('div', { class: 'row' }, exL, soL, hwL), desc),
      h('div', { class: 'vt-anon' }, shL, h('small', { class: 'tiny ns-muted' }, T('anonTip'))));
    const read = () => {
      const miss = [[k, 'f.type']].filter(([i]) => !i.value.trim());
      if (!pick.ids().length) miss.push([null, 'f.fields']);
      const short = [[u, 'f.university'], [d, 'f.department'], [c, 'f.course']].filter(([i]) => i.value.trim().length === 1);   // a name, if given, has 2 letters at least
      if (short.length) return { error: T('tooShort', { what: short.map(([, key]) => T(key)).join(', ') }) };
      if (!langs.length) miss.push([l, 'f.languages']);
      if (miss.length) return { error: T('missing', { what: miss.map(([, key]) => T(key)).join(', ') }) };
      return { meta: { university: u.value.trim() || null, department: d.value.trim() || null, course: c.value.trim() || null, professor: p.value.trim() || null, year: +y.value || null, semester: +s.value || null, kind: k.value, fields: pick.ids(), language: langs.join(','),
        has_exercises: ex.checked, has_solutions: so.checked, handwritten: hw.checked, show_name: sh.checked, description: desc.value.trim() || null } };
    };
    return { el, read, suggest: () => pick.suggest() };
  }
  /** Choose a file's fields: search them in any language (each shown with the fields it sits under), take a suggestion
      (from the title and course, and from what others chose for files like it), or propose a new one. */
  function fieldPicker(h, init, textOf, askOf) {
    let chosen = [...init], fromOthers = [], t = 0;
    const box = h('div', { class: 'row vt-fchips' }), sug = h('div', { class: 'row vt-fsug' }), res = h('div', { class: 'vt-fres' }), note = h('small', { class: 'tiny ns-muted vt-fnote', hidden: true }, T('proposed'));
    const q = h('input', { class: 'noema-input', type: 'search', 'data-k': 'fieldq', placeholder: T('fieldSearchPh'), 'aria-label': T('f.fields'), autocomplete: 'off' });
    const under = id => (Fields.get(id)?.parents || []).map(Fields.name).join(', ');
    const add = id => { if (!chosen.includes(id) && chosen.length < 12) chosen.push(id); q.value = ''; draw(); };
    function draw() {
      box.replaceChildren(...chosen.map(id => h('button', { type: 'button', class: 'chip on vt-fchip', 'data-id': id, title: T('removeField', { name: Fields.name(id) }), onclick: () => { chosen = chosen.filter(x => x !== id); draw(); } },
        Fields.name(id) + (Fields.get(id)?.status === 'proposed' ? ' · ' + T('proposedPill') : '') + ' ×')));   // i18n-ignore (×)
      const ideas = [...new Set([...Fields.fromText(textOf()), ...fromOthers])].filter(id => !chosen.includes(id) && Fields.get(id)).slice(0, 6);
      sug.replaceChildren(...(ideas.length ? [h('small', { class: 'tiny ns-muted' }, T('suggested')), ...ideas.map(id => h('button', { type: 'button', class: 'chip vt-fsugchip', 'data-id': id, title: under(id) ? T('fieldIn', { parents: under(id) }) : null, onclick: () => add(id) }, '+ ' + Fields.name(id)))] : []));
      const w = q.value.trim().replace(/\s+/g, ' ');
      if (w.length < 2) { res.replaceChildren(); return; }
      const hits = Fields.find(w).filter(id => !chosen.includes(id)), known = Fields.find(w, 1).some(id => Fields.allNames(id).some(x => fold(x) === fold(w)));
      res.replaceChildren(...hits.map(id => h('button', { type: 'button', class: 'ns-item vt-fopt', 'data-id': id, onclick: () => add(id) }, h('span', { class: 't' }, h('b', {}, Fields.name(id)), under(id) ? h('small', {}, T('fieldIn', { parents: under(id) })) : null))),
        hits.length ? null : h('p', { class: 'tiny ns-muted' }, T('noFieldMatch')),
        known || w.length > 80 ? null : h('button', { type: 'button', class: 'btn small ghost vt-propose', title: T('proposeHint'), onclick: e => propose(e.currentTarget, w) }, T('proposeField', { name: w })));
    }
    async function propose(b, w) {
      b.disabled = true;
      const parents = chosen.filter(id => Fields.get(id)?.status === 'accepted');   // under the fields chosen already; Claude places it for good
      try {
        const id = await Server.propose(w, Fields.loc(), parents);
        if (!Fields.get(id)) Fields.addLocal({ id, names: { [Fields.loc()]: w }, aliases: [], parents, status: 'proposed' });
        note.hidden = false; add(id);
      } catch (e) { toast('⚠️ ' + (window.NoemaI18n ? NoemaI18n.err(e) : e.message), 6000); b.disabled = false; }
    }
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 120); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); res.querySelector('.vt-fopt')?.click(); } });
    // what others chose for files with a similar title or course (the server counts; no names)
    let asked = '';
    const suggest = () => { draw(); const a = askOf(); const k = a.title + '|' + a.course; if (k === asked || (!a.title && !a.course)) return; asked = k;
      Server.suggest(a.title, a.course).then(r => { fromOthers = (r || []).map(x => x.field); draw(); }).catch(() => { }); };
    draw(); suggest();
    return { el: h('div', { class: 'vt-fpick' }, box, q, res, sug, note), ids: () => [...chosen], suggest };
  }
  async function upload(ctx, onDone, { room = '' } = {}) {
    const { h } = ctx;
    let all = []; try { all = await load(); } catch (e) { }
    let usedBytes = all.filter(f => f.mine).reduce((a, f) => a + (f.size || 0), 0);
    if (window.NoemaSocial) usedBytes = await NoemaSocial.Server.used().catch(() => usedBytes);   // the files sent in conversations count too
    const used = () => usedBytes;
    dialog(ctx, T('uploadTitle'), (body, close) => {
      let items = [];   // [{ file, title, problem }]
      const pick = h('input', { type: 'file', multiple: true, accept: ACCEPT, class: 'vt-pick', style: { display: 'none' }, onchange: e => { add([...e.target.files]); e.target.value = ''; } });
      const drop = h('label', { class: 'cg-drop vt-drop', ondragover: e => { e.preventDefault(); drop.classList.add('on'); }, ondragleave: () => drop.classList.remove('on'), ondrop: e => { e.preventDefault(); drop.classList.remove('on'); add([...e.dataTransfer.files]); } },
        pick, T('chooseFiles'), h('span', { class: 'tiny' }, ' ' + T('dragHere')));
      const flist = h('ul', { class: 'vt-files' }), quota = h('div', { class: 'tiny ns-muted vt-quota' });
      const form = fields(h, all, {}, { text: () => items.filter(x => !x.problem).map(x => x.title).join(' · ') });
      const ok = h('input', { type: 'checkbox', class: 'vt-rules' });
      // who sees it: everybody, or only the members of one of my study groups (its own folder)
      const where = groups.length ? h('select', { class: 'noema-input vt-where', 'aria-label': T('shareWith') }, h('option', { value: '' }, T('everyone')), ...groups.map(g => h('option', { value: g.id }, T('onlyGroup', { name: g.name })))) : null;
      if (where) where.value = groups.some(g => g.id === room) ? room : '';
      const err = h('div', { class: 'cg-kstat bad vt-err', role: 'alert' });
      const go = h('button', { class: 'btn primary vt-go', onclick: send }, T('uploadBtn'));
      async function add(list) {
        for (const file of list) { if (items.some(x => x.file.name === file.name && x.file.size === file.size)) continue; const pending = items.filter(x => !x.problem).reduce((a, x) => a + x.file.size, 0);
          items.push({ file, title: file.name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').trim(), problem: await checkFile(file, used() + pending) }); }
        drawFiles(); form.suggest();
      }
      function drawFiles() {
        flist.replaceChildren(...items.map((x, i) => h('li', { class: x.problem ? 'bad' : '' }, x.problem ? h('span', {}, x.file.name) : h('input', { class: 'noema-input small vt-title', 'aria-label': T('fileTitle'), maxlength: 160, value: x.title, oninput: e => { x.title = e.target.value; }, onchange: () => form.suggest() }),
          h('span', { class: 'tiny' }, ' ' + mb(x.file.size) + ' '), x.problem ? h('span', { class: 'tiny vt-problem' }, x.problem) : null,
          h('button', { class: 'btn small ghost', 'aria-label': T('removeFile', { name: x.file.name }), onclick: () => { items.splice(i, 1); drawFiles(); } }, '✕'))));   // i18n-ignore (✕)
        quota.textContent = T('quota', { used: mb(used()), max: mb(QUOTA), mb: 20 });
      }
      async function send() {
        err.textContent = '';
        const good = items.filter(x => !x.problem);
        if (!good.length) { err.textContent = T('needFile'); return; }
        const r = form.read(); if (r.error) { err.textContent = r.error; return; }
        if (!ok.checked) { err.textContent = T('needRules'); return; }
        if (good.some(x => !x.title.trim())) { err.textContent = T('needTitle'); return; }
        go.disabled = true; let n = 0;
        for (const x of good) {
          go.textContent = T('uploading', { i: n + 1, n: good.length });
          let pages = null;
          if (/\.pdf$/i.test(x.file.name) && window.NoemaViewer?.extract) { try { pages = (await NoemaViewer.extract(x.file, { maxPages: 1 })).pageCount || null; } catch (e) { } }
          try { await Server.upload({ ...r.meta, title: x.title.trim().slice(0, 160), pages, ...(where?.value ? { room: where.value } : {}) }, x.file); n++; usedBytes += x.file.size; items = items.filter(y => y !== x); drawFiles(); }
          catch (e) { err.textContent = T('failed', { name: x.file.name, why: window.NoemaI18n ? NoemaI18n.err(e) : e.message }); go.disabled = false; go.textContent = T('uploadBtn'); if (n) onDone(); return; }
        }
        close(); toast(T('uploaded', { n }), 4000); onDone();
      }
      drawFiles();
      body.append(h('p', { class: 'tiny ns-muted' }, T('uploadLead')), drop, h('p', { class: 'tiny ns-muted vt-formats' }, T('formats', { mb: 20 })), flist, quota, form.el,
        where ? h('label', { class: 'vt-fld vt-wherefld' }, h('span', { class: 'ns-label' }, T('shareWith')), where) : null,
        h('label', { class: 'vt-check vt-rulesrow' }, ok, ' ', T('rules')), err, h('div', { class: 'row' }, go, h('button', { class: 'btn ghost', onclick: close }, T('cancel'))));
    }, { cls: 'vt-upload' });
  }
  function edit(ctx, f, onDone) {
    const { h } = ctx;
    dialog(ctx, T('editTitle'), (body, close) => {
      const title = h('input', { class: 'noema-input vt-title', maxlength: 160, value: f.title, 'aria-label': T('fileTitle') });
      const form = fields(h, cache || [], { ...f, show_name: !!f.uploader_name }, { text: () => title.value });
      const err = h('div', { class: 'cg-kstat bad', role: 'alert' });
      body.append(h('label', { class: 'vt-fld' }, h('span', { class: 'ns-label' }, T('fileTitle') + ' *'), title), form.el, err, h('div', { class: 'row' },
        h('button', { class: 'btn primary vt-save', onclick: async e => { const r = form.read(); if (r.error || !title.value.trim()) { err.textContent = r.error || T('needTitle'); return; } e.currentTarget.disabled = true;
          try { await Server.edit(f.id, { ...r.meta, title: title.value.trim() }); close(); onDone(); } catch (er) { err.textContent = window.NoemaI18n ? NoemaI18n.err(er) : er.message; e.currentTarget.disabled = false; } } }, T('save')),
        h('button', { class: 'btn ghost', onclick: close }, T('cancel'))));
    });
  }
  function about(ctx) {
    ctx.sheet(T('howItWorks'), body => body.append(...['about1', 'about2', 'about3', 'about4', 'about5'].map(k => ctx.h('p', {}, T(k, { mb: 20, quota: 50 })))));
  }

  return { page, filter, matches, forms, checkFile, values, KINDS, FORMATS, GROUPS, Server, Fields, hashOf, parse, load, reset: () => { cache = null; } };
})();
