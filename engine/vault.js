/* =====================================================================================
   noema-lite — 🗄️ the vault (docs/VAULT.md): files students share with each other — lecture notes, slides, past exams
   (with or without solutions), exercise sets, lab work, summaries, books, recordings, anything else for study.
   Strictly organised: every file carries its university, department, course, year, semester, type, subject (one key of
   SUBJECTS, the shared list) and language — all required at upload — so the folders (university › department › course
   › year › type) and every filter work across all of them ("biology notes, any university, any year, 3rd semester").
   Anonymous: the server keeps the uploader for deleting and take-downs, nobody else sees it (view noema_vault); a person
   may choose to show their name. Restrictive: only the formats of FORMATS (no programs, scripts, archives or SVG), each
   file checked by its first bytes, ≤ 20 MB a file, ≤ 50 MB a person; reports hide a file (cloud/supabase.sql §12).
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
  /** The shared list of subjects (keys stored with every file; their names come from i18n/vault). */
  const SUBJECTS = ['math', 'statistics', 'physics', 'chemistry', 'biology', 'medicine', 'nursing', 'pharmacy', 'dentistry', 'veterinary',
    'cs', 'electrical', 'mechanical', 'civil', 'chemical_eng', 'architecture', 'economics', 'business', 'accounting', 'law', 'political',
    'sociology', 'psychology', 'education', 'philosophy', 'history', 'archaeology', 'literature', 'linguistics', 'languages', 'arts', 'music',
    'geography', 'geology', 'environment', 'agriculture', 'communication', 'theology', 'sports', 'other'];
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

  /* ---------- the server (row-level security applies: cloud/supabase.sql §12) ---------- */
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
  };

  /* ---------- the page's settings, in the address: #/vault?q=…&u=…&sem=3&k=notes,exam … ---------- */
  const KEYS = ['q', 'v', 'f', 'u', 'd', 'c', 'p', 'y', 'sem', 'k', 'sub', 'x', 'sol', 'hw', 'lg', 'ft', 'r', 'used', 'mine', 'sort'];
  const parse = () => { const q = new URLSearchParams((location.hash.split('?')[1] || '')); const P = {}; for (const k of KEYS) if (q.get(k)) P[k] = q.get(k); return P; };
  const hashOf = P => { const q = new URLSearchParams(); for (const k of KEYS) if (P[k]) q.set(k, P[k]); const s = q.toString(); return '#/vault' + (s ? '?' + s : ''); };
  const listOf = s => String(s || '').split(',').filter(Boolean);
  const LEVELS = ['university', 'department', 'course', 'year', 'kind'];
  const same = (a, b) => fold(a) === fold(b);
  /** The files that pass every filter (and the words of the search). */
  function filter(all, P) {
    const k = listOf(P.k), ft = listOf(P.ft);
    return all.filter(f => (!P.u || same(f.university, P.u)) && (!P.d || same(f.department, P.d)) && (!P.c || same(f.course, P.c)) && (!P.p || same(f.professor || '', P.p))
      && (!P.y || String(f.year) === P.y) && (!P.sem || String(f.semester) === P.sem) && (!k.length || k.includes(f.kind)) && (!P.sub || f.subject === P.sub)
      && (!P.x || f.has_exercises) && (!P.sol || f.has_solutions) && (!P.hw || (P.hw === 'hand' ? f.handwritten : !f.handwritten)) && (!P.lg || f.language === P.lg)
      && (!ft.length || ft.includes(groupOf(f))) && (!P.r || (f.rating_n && f.rating_sum / f.rating_n >= +P.r)) && (!P.used || f.used > 0) && (!P.mine || f.mine)
      && (!P.q || matches([f.title, f.description, f.university, f.department, f.course, f.professor, f.file_name, T('kind.' + f.kind), T('subject.' + f.subject), f.uploader_name].filter(Boolean).join(' · '), P.q)));
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
  const where = f => [f.course, f.university, T('yearSem', { year: f.year, sem: f.semester })].join(' · ');
  const GICON = { doc: 'doc', slides: 'grid', sheet: 'rows', book: 'book', image: 'eye', audio: 'mic', video: 'play', text: 'doc' };
  let cache = null, mineR = {}, mineRep = {};
  async function load(force = false) {
    if (cache && !force) return cache;
    const [rows, rt, rp] = await Promise.all([Server.list(), Server.myRatings().catch(() => []), Server.myReports().catch(() => [])]);
    cache = rows || []; mineR = Object.fromEntries((rt || []).map(r => [r.file_id, r.stars])); mineRep = Object.fromEntries((rp || []).map(r => [r.file_id, r.reason]));
    return cache;
  }

  /* ======================= the page ======================= */
  function page(ctx) {
    const { h, page: pg, go, sheet, svg, ico, chev, pill } = ctx;
    let P = parse();
    const v = pg({ tab: 'discover', crumbs: [[ctx.L('discover'), '#/discover'], [T('title')]], back: '#/discover', cls: 'vt-view',
      menu: () => [{ label: T('myUploads'), sub: T('myUploadsSub'), icon: 'upload', run: () => setP({ mine: P.mine ? '' : '1' }) }, { label: T('howItWorks'), icon: 'info', run: () => about(ctx) }] });
    v.append(h('h1', {}, T('title')), h('p', { class: 'ns-muted vt-lead' }, T('lead')));
    if (!CL()?.session?.()) {
      v.append(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, T('signIn')), h('button', { class: 'btn primary', onclick: () => N()?.openAccountPicker?.() }, T('signInBtn'))));
      return;
    }
    const inp = h('input', { class: 'noema-input ns-srin vt-q', type: 'search', value: P.q || '', placeholder: T('searchPh'), 'aria-label': T('search'), autocomplete: 'off' });
    const upBtn = h('button', { class: 'btn primary vt-upbtn', onclick: () => upload(ctx, () => refresh(true)) }, svg('upload'), ' ', T('upload'));
    const viewSeg = h('div', { class: 'ns-seg small vt-viewseg', role: 'radiogroup', 'aria-label': T('view') });
    const filtBtn = h('button', { class: 'btn small ghost vt-filtbtn', 'aria-expanded': 'false', onclick: () => { filt.hidden = !filt.hidden; filtBtn.setAttribute('aria-expanded', String(!filt.hidden)); } });
    const sortSel = h('select', { class: 'noema-input small vt-sort', 'aria-label': T('sort'), onchange: () => setP({ sort: sortSel.value === 'new' ? '' : sortSel.value }) }, ...Object.keys(SORTS).map(k => h('option', { value: k }, T('sort.' + k))));
    const filt = h('div', { class: 'ns-panel vt-filters', hidden: true });
    const chips = h('div', { class: 'vt-active' });
    const out = h('div', { class: 'vt-out' }, h('p', { class: 'ns-muted' }, T('loading')));
    v.append(h('div', { class: 'row vt-bar' }, inp, upBtn), h('div', { class: 'row vt-row' }, viewSeg, filtBtn, sortSel), filt, chips, out);
    const setP = patch => { P = { ...P, ...patch }; for (const k of Object.keys(P)) if (!P[k]) delete P[k]; history.replaceState(null, '', location.pathname + location.search + hashOf(P)); draw(); };
    let t = 0; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => setP({ q: inp.value.trim() }), 140); });
    let all = [];
    async function refresh(force) { try { all = await load(force); } catch (e) { out.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, T('offline')), h('p', { class: 'tiny ns-muted' }, window.NoemaI18n ? NoemaI18n.err(e) : e.message))); return; } if (v.isConnected) draw(); }

    const sel = (label, key, opts, { bare = false } = {}) => h('label', { class: 'vt-f' }, bare ? null : h('span', { class: 'ns-label' }, label),
      (() => { const s = h('select', { class: 'noema-input small', 'data-f': key, 'aria-label': label, onchange: () => setP({ [key]: s.value }) }, h('option', { value: '' }, T('any')), ...opts.map(([val, l]) => h('option', { value: val }, l))); s.value = P[key] || ''; return s; })());
    const chip = (key, val, label, multi = false) => { const on = multi ? listOf(P[key]).includes(val) : P[key] === val; return h('button', { class: 'ns-srchip' + (on ? ' on' : ''), 'aria-pressed': String(on), 'data-f': key, 'data-v': val, onclick: () => {
      if (!multi) return setP({ [key]: on ? '' : val }); const s = new Set(listOf(P[key])); on ? s.delete(val) : s.add(val); setP({ [key]: [...s].join(',') }); } }, label); };
    const group = (label, ...kids) => h('div', { class: 'vt-fgroup' }, h('b', { class: 'vt-fhead' }, label), h('div', { class: 'vt-fbody' }, ...kids));
    function drawFilters() {
      // each list offers the values that exist under the choices made above it (university › department › course)
      const inU = all.filter(f => !P.u || same(f.university, P.u)), inD = inU.filter(f => !P.d || same(f.department, P.d)), inC = inD.filter(f => !P.c || same(f.course, P.c));
      const opt = (rows, k) => values(rows, k).map(x => [String(x.v), `${x.v} (${num(x.n)})`]);
      filt.replaceChildren(
        group(T('g.where'), sel(T('f.university'), 'u', opt(all, 'university')), sel(T('f.department'), 'd', opt(inU, 'department')), sel(T('f.course'), 'c', opt(inD, 'course')), sel(T('f.professor'), 'p', opt(inC, 'professor'))),
        group(T('g.when'), sel(T('f.year'), 'y', values(all, 'year').sort((a, b) => b.v - a.v).map(x => [String(x.v), String(x.v)])), sel(T('f.semester'), 'sem', Array.from({ length: 12 }, (_, i) => [String(i + 1), T('semN', { n: i + 1 })]))),
        group(T('g.type'), h('div', { class: 'ns-srchips' }, ...KINDS.map(k => chip('k', k, T('kind.' + k), true)))),
        group(T('g.subject'), sel(T('f.subject'), 'sub', SUBJECTS.map(s => [s, T('subject.' + s)]).sort((a, b) => a[1].localeCompare(b[1])), { bare: true })),
        group(T('g.contents'), h('div', { class: 'ns-srchips' }, chip('x', '1', T('c.exercises')), chip('sol', '1', T('c.solutions')), chip('hw', 'hand', T('c.handwritten')), chip('hw', 'typed', T('c.typed')))),
        group(T('g.format'), sel(T('f.language'), 'lg', values(all, 'language').map(x => [x.v, langName(x.v)])), h('div', { class: 'ns-srchips' }, ...GROUPS.map(g => chip('ft', g, T('ft.' + g), true)))),
        group(T('g.quality'), sel(T('f.rating'), 'r', [['3', T('r.3')], ['4', T('r.4')]])),
        group(T('g.use'), h('div', { class: 'ns-srchips' }, chip('used', '1', T('c.used')))));
      const n = KEYS.filter(k => !['q', 'v', 'f', 'sort'].includes(k) && P[k]).length;
      filtBtn.replaceChildren(svg('filter'), ' ', n ? T('filtersN', { n }) : T('filters'));
      // the filters in use, each one removable
      const label = k => ({ u: P.u, d: P.d, c: P.c, p: P.p, y: P.y, sem: T('semN', { n: +P.sem }), k: listOf(P.k).map(x => T('kind.' + x)).join(', '), sub: T('subject.' + P.sub), x: T('c.exercises'), sol: T('c.solutions'),
        hw: T(P.hw === 'hand' ? 'c.handwritten' : 'c.typed'), lg: langName(P.lg), ft: listOf(P.ft).map(x => T('ft.' + x)).join(', '), r: T('r.' + P.r), used: T('c.used'), mine: T('myUploads') })[k];
      const on = KEYS.filter(k => !['q', 'v', 'f', 'sort'].includes(k) && P[k]);
      chips.replaceChildren(...on.map(k => h('button', { class: 'ns-srchip on vt-chip', 'data-f': k, 'aria-label': T('removeFilter', { what: label(k) }), onclick: () => setP({ [k]: '' }) }, label(k), ' ✕')),
        on.length > 1 ? h('button', { class: 'linkish', onclick: () => setP(Object.fromEntries(on.map(k => [k, '']))) }, T('clear')) : '');
    }
    function card(f, i) {
      const rating = f.rating_n ? `★ ${num(Math.round(stars(f) * 10) / 10)}` : '';
      return h('button', { class: 'ns-item vt-file', 'data-id': f.id, onclick: () => details(ctx, f, () => refresh(true)) }, ico(GICON[groupOf(f)] || 'doc', (i % 4) + 1),
        h('span', { class: 't' }, h('b', {}, f.title), h('small', {}, [T('kind.' + f.kind), where(f)].join(' · '))),
        h('span', { class: 'vt-meta tiny' }, f.mine && f.status !== 'ok' ? pill(T('status.' + f.status)) : null, rating ? h('span', { title: T('ratingN', { n: f.rating_n }) }, rating) : null, f.downloads ? h('span', { title: T('downloadsN', { n: f.downloads }) }, '⬇ ' + num(f.downloads)) : null), chev());   // i18n-ignore (★ ⬇: signs)
    }
    function files(list) {
      const sorted = [...list].sort(SORTS[P.sort] || SORTS.new);
      return sorted.length ? h('div', { class: 'ns-list vt-list' }, ...sorted.slice(0, 300).map(card)) : empty();
    }
    const empty = () => h('div', { class: 'ns-panel ns-empty vt-empty' }, ctx.faceEl(undefined, 'breathe'), h('p', {}, all.length ? T('none') : T('emptyVault')), h('button', { class: 'btn small primary', onclick: () => upload(ctx, () => refresh(true)) }, T('upload')));
    /* 📁 the folders: university › department › course › year › type, the filters applied */
    function folders(list) {
      const path = (P.f || '').split('›').filter(Boolean), depth = path.length;
      const here = list.filter(f => path.every((p, i) => String(f[LEVELS[i]]) === p || (LEVELS[i] !== 'year' && LEVELS[i] !== 'kind' && same(f[LEVELS[i]], p))));
      const crumbs = h('nav', { class: 'vt-path', 'aria-label': T('folders') }, h('button', { class: 'linkish', onclick: () => setP({ f: '' }) }, T('allUniversities')),
        ...path.flatMap((p, i) => [h('span', { 'aria-hidden': 'true' }, ' › '), h('button', { class: 'linkish', onclick: () => setP({ f: path.slice(0, i + 1).join('›') }) }, LEVELS[i] === 'kind' ? T('kind.' + p) : p)]));
      if (depth >= LEVELS.length) return h('div', {}, crumbs, files(here));
      const lev = LEVELS[depth], kids = values(here, lev);
      if (lev === 'year') kids.sort((a, b) => b.v - a.v);
      return h('div', {}, crumbs, kids.length ? h('div', { class: 'ns-list vt-folders' }, ...kids.map(x => h('button', { class: 'ns-item vt-folder', 'data-v': String(x.v), onclick: () => setP({ f: [...path, String(x.v)].join('›') }) },
        h('span', { class: 'ns-ico' }, svg('vault')), h('span', { class: 't' }, h('b', {}, lev === 'kind' ? T('kind.' + x.v) : String(x.v)), h('small', {}, T('nFiles', { n: x.n }))), chev()))) : empty());
    }
    function draw() {
      viewSeg.replaceChildren(...[['', T('files')], ['folders', T('folders')]].map(([k, l]) => h('button', { class: (P.v || '') === k ? 'on' : '', role: 'radio', 'aria-checked': String((P.v || '') === k), 'data-v': k || 'files', onclick: () => setP({ v: k, f: '' }) }, l)));
      sortSel.value = P.sort || 'new';
      drawFilters();
      const list = filter(all, P);
      out.replaceChildren(h('p', { class: 'tiny ns-muted vt-count' }, T('results', { n: list.length })), P.v === 'folders' ? folders(list) : files(list));
    }
    refresh(false);
  }

  /* ---------- one file: what it is, a preview, download, make a course from it, rate, report ---------- */
  function details(ctx, f, onChange) {
    const { h, sheet, svg } = ctx;
    sheet(f.title, (body, close) => {
      const facts = [[T('f.university'), f.university], [T('f.department'), f.department], [T('f.course'), f.course], [T('f.professor'), f.professor], [T('f.when'), T('yearSem', { year: f.year, sem: f.semester })],
        [T('f.type'), T('kind.' + f.kind)], [T('f.subject'), T('subject.' + f.subject)], [T('f.language'), langName(f.language)],
        [T('f.contents'), [f.has_exercises && T('c.exercises'), f.has_solutions && T('c.solutions'), T(f.handwritten ? 'c.handwritten' : 'c.typed')].filter(Boolean).join(' · ')],
        [T('f.file'), `${f.file_name} · ${mb(f.size)}${f.pages ? ' · ' + T('pagesN', { n: f.pages }) : ''}`], [T('f.sharedBy'), f.uploader_name || T('anonymous')]].filter(([, x]) => x);
      const prev = h('div', { class: 'vt-preview' });
      const busy = async (b, fn) => { b.disabled = true; try { await fn(); } catch (e) { toast('⚠️ ' + (window.NoemaI18n ? NoemaI18n.err(e) : e.message), 6000); } b.disabled = false; };
      const getFile = async () => new File([await Server.blob(f)], f.file_name, { type: f.mime });
      const g = groupOf(f), canPreview = ['doc', 'image', 'audio', 'video', 'text', 'sheet'].includes(g) && (g !== 'doc' || f.mime === 'application/pdf') && (g !== 'sheet' || f.mime === 'text/csv');
      const starRow = h('div', { class: 'vt-stars', role: 'radiogroup', 'aria-label': T('rate') });
      const drawStars = () => starRow.replaceChildren(...[1, 2, 3, 4, 5].map(n => h('button', { class: 'vt-star' + ((mineR[f.id] || 0) >= n ? ' on' : ''), role: 'radio', 'aria-checked': String(mineR[f.id] === n), 'aria-label': T('starsN', { n }), disabled: f.mine || null,
        onclick: e => busy(e.currentTarget, async () => { await Server.rate(f.id, n); mineR[f.id] = n; drawStars(); onChange(); }) }, '★')));   // i18n-ignore (the star sign)
      drawStars();
      body.append(
        f.description ? h('p', { class: 'vt-desc' }, f.description) : null,
        f.mine && f.status !== 'ok' ? h('p', { class: 'ns-panel tiny vt-status' }, T('statusLong.' + f.status)) : null,
        h('dl', { class: 'vt-facts' }, ...facts.flatMap(([k, x]) => [h('dt', {}, k), h('dd', {}, x)])),
        h('p', { class: 'tiny ns-muted' }, [f.rating_n ? T('ratingN', { n: f.rating_n }) : T('noRating'), T('downloadsN', { n: f.downloads }), f.used ? T('usedN', { n: f.used }) : ''].filter(Boolean).join(' · ')),
        h('div', { class: 'row vt-acts' },
          h('button', { class: 'btn primary vt-download', onclick: e => busy(e.currentTarget, async () => { const file = await getFile(); const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = f.file_name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); Server.count(f.id, 'download'); }) }, svg('download'), ' ', T('download')),
          canPreview ? h('button', { class: 'btn ghost vt-prevbtn', onclick: e => busy(e.currentTarget, async () => { await preview(h, prev, f, await Server.blob(f)); e.currentTarget.remove(); }) }, svg('eye'), ' ', T('preview')) : null,
          window.NoemaCurMap?.fromSources ? h('button', { class: 'btn ghost vt-course', onclick: e => busy(e.currentTarget, async () => { const file = await getFile(); close(); Server.count(f.id, 'used'); NoemaCurMap.fromSources(acc(), { files: [file], onStudy: id => N()?.open?.(id) }); }) }, svg('spark'), ' ', T('makeCourse')) : null),
        prev,
        f.mine ? null : h('div', { class: 'vt-rate' }, h('span', { class: 'ns-label' }, T('rate')), starRow),
        h('div', { class: 'row vt-more' },
          f.mine ? h('button', { class: 'btn small ghost vt-edit', onclick: () => edit(ctx, f, onChange) }, svg('edit'), ' ', T('edit')) : null,
          f.mine ? h('button', { class: 'btn small ghost danger vt-delete', onclick: e => { if (!confirm(T('deleteAsk', { title: f.title }))) return; busy(e.currentTarget, async () => { await Server.remove(f); close(); toast(T('deleted'), 3000); onChange(); }); } }, svg('trash'), ' ', T('delete')) : null,
          !f.mine ? (mineRep[f.id] ? h('span', { class: 'tiny ns-muted' }, T('reported')) : h('button', { class: 'btn small ghost vt-report', onclick: () => report(ctx, f, () => { mineRep[f.id] = 'x'; close(); onChange(); }) }, svg('flag'), ' ', T('report'))) : null));
    }, { cls: 'vt-sheet' });
  }
  async function preview(h, box, f, blob) {
    const url = URL.createObjectURL(new Blob([blob], { type: f.mime })), g = groupOf(f);
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
  function fields(h, all, init = {}) {
    const list = (id, field) => h('datalist', { id }, ...values(all, field).slice(0, 200).map(x => h('option', { value: String(x.v) })));
    const txt = (key, label, { req = true, max = 120, dl = '' } = {}) => { const i = h('input', { class: 'noema-input', 'data-k': key, maxlength: max, required: req || null, list: dl || null, value: init[key] || '' }); return [h('label', { class: 'vt-fld' }, h('span', { class: 'ns-label' }, label + (req ? ' *' : '')), i), i]; };
    const pickOf = (key, label, opts, val) => { const s = h('select', { class: 'noema-input', 'data-k': key, required: true }, h('option', { value: '' }, T('choose')), ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = val ?? ''; return [h('label', { class: 'vt-fld' }, h('span', { class: 'ns-label' }, label + ' *'), s), s]; };
    const year = new Date().getFullYear();
    const [uL, u] = txt('university', T('f.university'), { dl: 'vt-dl-u' }), [dL, d] = txt('department', T('f.department'), { dl: 'vt-dl-d' }), [cL, c] = txt('course', T('f.course'), { max: 160, dl: 'vt-dl-c' }), [pL, p] = txt('professor', T('f.professor'), { req: false, dl: 'vt-dl-p' });
    const [yL, y] = pickOf('year', T('f.year'), Array.from({ length: year - 1979 }, (_, i) => [String(year - i), String(year - i)]), init.year ? String(init.year) : '');
    const [sL, s] = pickOf('semester', T('f.semester'), Array.from({ length: 12 }, (_, i) => [String(i + 1), T('semN', { n: i + 1 })]), init.semester ? String(init.semester) : '');
    const [kL, k] = pickOf('kind', T('f.type'), KINDS.map(x => [x, T('kind.' + x)]), init.kind || '');
    const [bL, b] = pickOf('subject', T('f.subject'), SUBJECTS.map(x => [x, T('subject.' + x)]).sort((a, z) => a[1].localeCompare(z[1])), init.subject || '');
    const uiLang = (window.NoemaI18n?.locale || 'en').slice(0, 2);
    const [lL, l] = pickOf('language', T('f.language'), LANGS().map(x => [x, langName(x)]), init.language || (LANGS().includes(uiLang) ? uiLang : 'en'));
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
      const miss = [[u, 'f.university'], [d, 'f.department'], [c, 'f.course'], [y, 'f.year'], [s, 'f.semester'], [k, 'f.type'], [b, 'f.subject'], [l, 'f.language']].filter(([i]) => !i.value.trim() || (i.tagName === 'INPUT' && i.value.trim().length < 2));
      if (miss.length) return { error: T('missing', { what: miss.map(([, key]) => T(key)).join(', ') }) };
      return { meta: { university: u.value.trim(), department: d.value.trim(), course: c.value.trim(), professor: p.value.trim() || null, year: +y.value, semester: +s.value, kind: k.value, subject: b.value, language: l.value,
        has_exercises: ex.checked, has_solutions: so.checked, handwritten: hw.checked, show_name: sh.checked, description: desc.value.trim() || null } };
    };
    return { el, read };
  }
  async function upload(ctx, onDone) {
    const { h } = ctx;
    let all = []; try { all = await load(); } catch (e) { }
    const used = () => all.filter(f => f.mine).reduce((a, f) => a + (f.size || 0), 0);
    dialog(ctx, T('uploadTitle'), (body, close) => {
      let items = [];   // [{ file, title, problem }]
      const pick = h('input', { type: 'file', multiple: true, accept: ACCEPT, class: 'vt-pick', style: { display: 'none' }, onchange: e => { add([...e.target.files]); e.target.value = ''; } });
      const drop = h('label', { class: 'cg-drop vt-drop', ondragover: e => { e.preventDefault(); drop.classList.add('on'); }, ondragleave: () => drop.classList.remove('on'), ondrop: e => { e.preventDefault(); drop.classList.remove('on'); add([...e.dataTransfer.files]); } },
        pick, T('chooseFiles'), h('span', { class: 'tiny' }, ' ' + T('dragHere')));
      const flist = h('ul', { class: 'vt-files' }), quota = h('div', { class: 'tiny ns-muted vt-quota' });
      const form = fields(h, all);
      const ok = h('input', { type: 'checkbox', class: 'vt-rules' });
      const err = h('div', { class: 'cg-kstat bad vt-err', role: 'alert' });
      const go = h('button', { class: 'btn primary vt-go', onclick: send }, T('uploadBtn'));
      async function add(list) {
        for (const file of list) { if (items.some(x => x.file.name === file.name && x.file.size === file.size)) continue; const pending = items.filter(x => !x.problem).reduce((a, x) => a + x.file.size, 0);
          items.push({ file, title: file.name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').trim(), problem: await checkFile(file, used() + pending) }); }
        drawFiles();
      }
      function drawFiles() {
        flist.replaceChildren(...items.map((x, i) => h('li', { class: x.problem ? 'bad' : '' }, x.problem ? h('span', {}, x.file.name) : h('input', { class: 'noema-input small vt-title', 'aria-label': T('fileTitle'), maxlength: 160, value: x.title, oninput: e => { x.title = e.target.value; } }),
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
          try { await Server.upload({ ...r.meta, title: x.title.trim().slice(0, 160), pages }, x.file); n++; items = items.filter(y => y !== x); drawFiles(); }
          catch (e) { err.textContent = T('failed', { name: x.file.name, why: window.NoemaI18n ? NoemaI18n.err(e) : e.message }); go.disabled = false; go.textContent = T('uploadBtn'); if (n) onDone(); return; }
        }
        close(); toast(T('uploaded', { n }), 4000); onDone();
      }
      drawFiles();
      body.append(h('p', { class: 'tiny ns-muted' }, T('uploadLead')), drop, h('p', { class: 'tiny ns-muted vt-formats' }, T('formats', { mb: 20 })), flist, quota, form.el,
        h('label', { class: 'vt-check vt-rulesrow' }, ok, ' ', T('rules')), err, h('div', { class: 'row' }, go, h('button', { class: 'btn ghost', onclick: close }, T('cancel'))));
    }, { cls: 'vt-upload' });
  }
  function edit(ctx, f, onDone) {
    const { h } = ctx;
    dialog(ctx, T('editTitle'), (body, close) => {
      const title = h('input', { class: 'noema-input vt-title', maxlength: 160, value: f.title, 'aria-label': T('fileTitle') });
      const form = fields(h, cache || [], { ...f, show_name: !!f.uploader_name });
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

  return { page, filter, matches, forms, checkFile, values, KINDS, SUBJECTS, FORMATS, GROUPS, Server, hashOf, parse, load, reset: () => { cache = null; } };
})();
