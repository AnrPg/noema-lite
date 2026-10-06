/* =====================================================================================
   noema-lite — canonical store for every LLM interaction ("conversations")
   Schema: noema.conversation/v1  (see docs/CONVERSATIONS.md)

   One record = one thread with the AI: tutor chats (all modes) AND one-shot AI tasks
   (grading an answer, reviewing code, generating a question, grading a debug checklist).
   Records are persisted automatically, in the background, to:
     1. IndexedDB  (store "convos", key "<account>|<id>")         — primary, no 5 MB limit
     2. the backup folder (if chosen): conversations/<subject>/<YYYY-MM>/<id>.json + .md + index.json
     3. the cloud (cloud accounts): table noema_conversations (row-level security)
     4. every backup file / cloud snapshot / the SQLite database (tools/db_sync.py)
   Records are never hard-deleted by the app: deletion writes a tombstone (deleted:true, messages:[])
   so the deletion propagates to the folder and the cloud.
   ===================================================================================== */
(function () {
  'use strict';
  const SCHEMA = 'noema.conversation/v1';
  const KINDS = ['tutor', 'grading', 'code-review', 'question', 'drill-grading'];
  const MODES = ['socratic', 'explain', 'quiz', 'interview', 'debug', null];
  const listeners = [];
  const iso = t => new Date(t ?? Date.now()).toISOString();
  const rnd = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => (b % 36).toString(36)).join('');
  /** time-sortable id: cv_<10 chars base36 ms><6 random> — sorts chronologically as a string */
  const newId = (t = Date.now()) => 'cv_' + t.toString(36).padStart(10, '0') + rnd(6);
  const msgId = (t = Date.now()) => 'm_' + t.toString(36).padStart(10, '0') + rnd(4);

  /** Normalise anything (older app versions, partial objects) into a valid canonical record. */
  function normalize(r, defaults = {}) {
    const now = Date.now();
    const created = r.createdAt ? Date.parse(r.createdAt) : (r.created || now);
    const msgs = (r.messages || r.msgs || []).map((m, i) => ({
      seq: i,
      id: m.id || msgId((m.createdAt ? Date.parse(m.createdAt) : m.t) || created + i),
      role: m.role === 'model' ? 'assistant' : (m.role || 'user'),
      content: String(m.content ?? m.text ?? ''),
      createdAt: m.createdAt || iso(m.t || created + i),
      ...(m.meta ? { meta: m.meta } : {}),
    }));
    const ctx = r.context || (r.ctx ? { type: r.ctx.kind || 'course', id: r.ctx.id || null, label: r.ctx.label || null } : { type: 'course', id: null, label: null });
    const rec = {
      schema: SCHEMA,
      id: r.id && /^cv_/.test(r.id) ? r.id : newId(created),
      account: r.account || defaults.account || null,                       // { id, kind }
      subject: r.subject || defaults.subject || null,                       // { id, title, packVersion }
      kind: KINDS.includes(r.kind) ? r.kind : 'tutor',
      mode: r.kind && r.kind !== 'tutor' ? null : (MODES.includes(r.mode) ? r.mode : 'socratic'),
      title: r.title || null,
      titleSource: r.titleSource || (r.title ? (r.titledLen >= 1e9 ? 'user' : 'ai') : 'none'),
      context: { type: ctx.type || 'course', id: ctx.id ?? null, label: ctx.label ?? null, ...(ctx.chapterId ? { chapterId: ctx.chapterId } : {}), ...(ctx.sectionId ? { sectionId: ctx.sectionId } : {}) },
      model: typeof r.model === 'object' && r.model ? r.model : { provider: 'google', name: r.model || null },
      createdAt: r.createdAt || iso(created),
      updatedAt: r.updatedAt || iso(r.updated || created),
      deleted: !!r.deleted,
      stats: { messages: msgs.length, userMessages: msgs.filter(m => m.role === 'user').length, chars: msgs.reduce((a, m) => a + m.content.length, 0) },
      messages: r.deleted ? [] : msgs,
      ...(r.tutorState && !r.deleted ? { tutorState: r.tutorState } : {}),        // Socratic thread tracker: { threads[], lessons[], focus, learnerTurns }
      ...(r.meta ? { meta: r.meta } : {}),
    };
    if (r.titledLen != null && r.titledLen < 1e9) rec.meta = Object.assign({}, rec.meta, { titledAtMessage: r.titledLen });
    return rec;
  }

  /** Human-readable Markdown rendition of a record (used for folder files and exports). */
  const KIND_NAME = { tutor: 'Tutor conversation', grading: 'AI grading', 'code-review': 'AI code review', question: 'AI-generated question', 'drill-grading': 'Debug-drill grading' };
  const MODE_NAME = { socratic: 'Socratic dialogue', explain: 'Explanation', quiz: 'Quiz', interview: 'Mock interview', debug: 'Debugging simulation' };
  const fmt = s => { const d = new Date(s), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  function demote(text, minLevel) { let fence = false; return text.split('\n').map(l => { if (/^\s*(```|~~~)/.test(l)) fence = !fence; if (fence) return l; return l.replace(/^(#{1,6})\s+/, (m, hs) => '#'.repeat(Math.min(6, hs.length + minLevel - 1)) + ' '); }).join('\n'); }
  function toMarkdown(rec, { level = 1, tutorName = 'Tutor', tutorAvatar = '🦉', appName = 'noema-lite' } = {}) {
    const H = '#'.repeat(level), esc = s => String(s ?? '').replace(/\|/g, '\\|');
    const lines = [`${H} ${rec.title || (rec.context?.label ? rec.context.label : KIND_NAME[rec.kind])}`, '',
      '| | |', '|---|---|',
      `| **Type** | ${KIND_NAME[rec.kind]}${rec.mode ? ' · ' + MODE_NAME[rec.mode] : ''} |`,
      `| **Subject** | ${esc(rec.subject?.title || rec.subject?.id || '—')} |`,
      `| **Context** | ${esc(rec.context?.label || 'Whole course')} |`,
      `| **Started** | ${fmt(rec.createdAt)} |`, `| **Last message** | ${fmt(rec.updatedAt)} |`,
      `| **Messages** | ${rec.stats.messages} |`, `| **Model** | ${esc(rec.model?.name || '—')} |`,
      `| **Id** | \`${rec.id}\` |`, `| **Source** | ${appName} |`, '', '---', ''];
    if (rec.deleted) lines.push('*This conversation was deleted.*');
    const lessons = rec.tutorState?.lessons || [];
    if (lessons.length) lines.push(`${H}# 📌 Lessons learned`, '', ...lessons.map((l, i) => `${i + 1}. ${l.text}`), '', '---', '');
    rec.messages.forEach(m => lines.push(`${H}# ${m.role === 'user' ? '🧑 You' : `${tutorAvatar} ${tutorName}`} · ${fmt(m.createdAt).slice(11)}`, '', demote(m.content.trim(), level + 2), ''));
    return lines.join('\n');
  }

  /* ---------- storage ---------- */
  const store = () => Noema.idb;
  const key = (acc, id) => `${acc}|${id}`;
  const dirtyKey = acc => `noema1:${acc}:meta:convoDirty`;
  function markDirty(acc, id) { const d = Noema.jget(dirtyKey(acc), []); if (!d.includes(id)) { d.push(id); Noema.jset(dirtyKey(acc), d); } Noema.jset(`noema1:${acc}:meta:dirty`, Date.now()); }
  const api = {
    SCHEMA, KINDS, newId, msgId, normalize, toMarkdown, KIND_NAME, MODE_NAME,
    onChange(f) { listeners.push(f); },
    async list(acc, { subject = null, kinds = null, includeDeleted = false } = {}) {
      const rows = (await store().entries('convos', acc + '|')).map(([, v]) => v);
      return rows.filter(r => (includeDeleted || !r.deleted) && (!subject || r.subject?.id === subject) && (!kinds || kinds.includes(r.kind))).sort((a, b) => a.id < b.id ? -1 : 1);
    },
    async get(acc, id) { return store().get('convos', key(acc, id)); },
    /** Save (insert/update). Background persistence (folder, cloud) is triggered via onChange listeners. */
    async put(acc, rec, { silent = false, keepUpdatedAt = false } = {}) {
      const r = normalize(rec);
      if (!keepUpdatedAt) r.updatedAt = iso();
      await store().put('convos', key(acc, r.id), r);
      if (!silent) { markDirty(acc, r.id); listeners.forEach(f => { try { f(acc, r); } catch (e) { } }); }
      return r;
    },
    async remove(acc, id) { const r = await this.get(acc, id); if (!r) return; return this.put(acc, { ...r, deleted: true, messages: [] }); },
    async clear(acc) { for (const [k] of await store().entries('convos', acc + '|')) await store().del('convos', k); },
    /** One-time import of conversations kept by older app versions in "noema1:<acc>:s:<subject>:convos". */
    async migrateLegacy(acc, subjects) {
      const flag = `noema1:${acc}:meta:convosMigrated`;
      const done = Noema.jget(flag, {});
      let n = 0;
      for (const k of Object.keys(Noema.kv.accountData(acc))) {
        const m = k.match(/^s:([^:]+):convos$/); if (!m || done[m[1]]) continue;
        const sid = m[1]; let list = [];
        try { list = JSON.parse(localStorage.getItem(`noema1:${acc}:${k}`) || '[]'); } catch (e) { }
        const meta = (subjects || []).find(s => s.id === sid) || { id: sid, title: sid };
        for (const cv of list) {
          if (!cv.msgs?.length) continue;
          const rec = normalize({ ...cv, kind: 'tutor' }, { account: { id: acc }, subject: { id: sid, title: meta.title } });
          if (!(await this.get(acc, rec.id))) { await this.put(acc, rec, { keepUpdatedAt: true }); n++; }
        }
        done[sid] = Date.now(); Noema.jset(flag, done);
      }
      return n;
    },
    /** Write dirty (or all) records to <dir>/conversations/<subject>/<YYYY-MM>/<id>.json|.md and refresh index.json */
    async writeToFolder(acc, dirHandle, { all = false } = {}) {
      const ids = all ? (await this.list(acc, { includeDeleted: true })).map(r => r.id) : Noema.jget(dirtyKey(acc), []);
      if (!ids.length) return 0;
      const root = await dirHandle.getDirectoryHandle('conversations', { create: true });
      const wf = async (dir, name, text) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(text); await w.close(); };
      let n = 0;
      for (const id of ids) {
        const r = await this.get(acc, id); if (!r) continue;
        const sdir = await root.getDirectoryHandle(r.subject?.id || '_general', { create: true });
        const mdir = await sdir.getDirectoryHandle(r.createdAt.slice(0, 7), { create: true });
        await wf(mdir, `${r.id}.json`, JSON.stringify(r, null, 1));
        if (r.deleted) { try { await mdir.removeEntry(`${r.id}.md`); } catch (e) { } }
        else await wf(mdir, `${r.id}.md`, toMarkdown(r, { appName: Noema.config.appName }));
        n++;
      }
      const all_ = await this.list(acc, { includeDeleted: true });
      await wf(root, 'index.json', JSON.stringify({ schema: 'noema.conversation-index/v1', account: acc, generatedAt: iso(), count: all_.length,
        conversations: all_.map(r => ({ id: r.id, subject: r.subject?.id || null, kind: r.kind, mode: r.mode, title: r.title, context: r.context?.label || null, createdAt: r.createdAt, updatedAt: r.updatedAt, messages: r.stats.messages, deleted: r.deleted, path: `${r.subject?.id || '_general'}/${r.createdAt.slice(0, 7)}/${r.id}.json` })) }, null, 1));
      Noema.jset(dirtyKey(acc), Noema.jget(dirtyKey(acc), []).filter(x => !ids.includes(x)));
      return n;
    },
  };
  window.NoemaConvos = api;
})();
