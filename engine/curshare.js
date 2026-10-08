/* noema-lite — 👥 shared curricula (docs/CURRICULUM.md §8).
   The owner shares a curriculum — 🌍 public (anyone finds it in “Explore curricula” and joins) or with people by e-mail
   (they accept the invitation). Everybody who joined studies the SAME map with their OWN progress (their own account),
   and the prepared steps are COMMON:
     • any participant may prepare a step that nobody has prepared yet (with their own AI: API key, Gemini or their
       Claude app) — first come, first served: the step is reserved while it is prepared (a lease), then published;
     • everybody sees it (⚡ with the author's name) and gets it when they study it;
     • a prepared step is never overwritten by someone else: only its author may replace it (the owner may remove it,
       and then it can be prepared again). The database enforces this (cloud/supabase.sql §10), not only this code.
   Only the owner changes the map (steps, links, chapter plans); their changes reach the members by themselves.

   Storage:  table noema_curricula_shared   the map (record = the curriculum without anybody's progress), public flag
             table noema_curriculum_members  invitations and members (by e-mail)
             table noema_curriculum_steps    one row per prepared / reserved step (author, status, where its pack is)
             bucket noema-curricula          <cid>/steps/<author>/<step>.json (+ <step>/src-… its source files)
                                             <cid>/files/<file>.<ext> the curriculum's material (owner's files)
   Locally the shared curriculum is an ordinary curriculum record with the SAME id everywhere (so the step subjects have
   the same ids, and every person's progress is keyed the same way in their own account), plus
             c.shared = { id, role: 'owner'|'member', owner, ownerName, public, version, at, hash, files }
             c.remote = { <step>: { status: 'ready'|'preparing', author, by, mine, version, at, until, path, meta } }

   The core (no browser needed) is bundled into the Claude connector (cloud/mcp/server.mjs) too, so a step prepared in
   someone's Claude app is reserved and published by exactly the same rules. */
(function (root) {
  'use strict';
  const BUCKET = 'noema-curricula', LEASE = 4 * 3600e3;
  const enc = s => encodeURIComponent(s);
  const T = { cur: '/rest/v1/noema_curricula_shared', mem: '/rest/v1/noema_curriculum_members', steps: '/rest/v1/noema_curriculum_steps' };
  /* what stays with each person (their own settings, progress and AI work) — everything else is the shared map */
  const LOCAL = ['log', 'usage', 'prefetch', 'nodeBudget', 'provider', 'model', 'autoApprove', 'shared', 'remote', 'error', 'updated'];
  const NODE_LOCAL = ['pack', 'reviewed', 'planWish', 'replan', 'assignedAt', 'planFrom', 'groupPlan'];   // 📦 an attached subject is the learner's own
  const NODE_PLAN = ['chapters', 'learningGoals', 'plannedAt', 'replanAt'];   // a step's chapter plan (= NoemaCurriculum.PLAN_KEYS): with an attached subject, the learner's own
  const clone = o => JSON.parse(JSON.stringify(o));

  /** The map everybody shares: the curriculum without anybody's settings, progress or preparation state. */
  function strip(c) {
    const r = {}; for (const k of Object.keys(c)) if (!LOCAL.includes(k)) r[k] = c[k];
    r.nodes = {}; for (const [id, n] of Object.entries(c.nodes || {})) {
      const x = { ...n }; if (n.pack?.assigned && n.groupPlan) { for (const k of NODE_PLAN) delete x[k]; Object.assign(x, n.groupPlan); }   // 📦 my own subject teaches it: the group gets the step's shared plan, not mine
      for (const k of NODE_LOCAL) delete x[k]; r.nodes[id] = x;
    }
    return clone(r);
  }
  function hash(o) { const s = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36) + ':' + s.length.toString(36); }
  /** The owner's new map → this person's copy: their settings and each step's local state stay. */
  function merge(local, rec) {
    const out = { ...clone(rec) };
    for (const k of LOCAL) if (local && local[k] !== undefined) out[k] = local[k];
    out.nodes = {};
    for (const [id, n] of Object.entries(rec.nodes || {})) {
      const old = local?.nodes?.[id]; const x = clone(n); if (old) for (const k of NODE_LOCAL) if (old[k] !== undefined) x[k] = old[k];
      if (old?.pack?.assigned) { x.groupPlan = {}; for (const k of NODE_PLAN) { if (n[k] !== undefined) x.groupPlan[k] = clone(n[k]); if (old[k] !== undefined) x[k] = old[k]; else delete x[k]; } }   // 📦 my own subject teaches it: I keep my plan, the group's waits aside
      out.nodes[id] = x;
    }
    if (local?.id) out.id = local.id;
    return out;
  }
  /* ---------- 🔔 the owner's changes, offered to a member: they take what they want (docs/CURRICULUM.md §8) ---------- */
  const TOP_INFO = ['title', 'goal', 'scope', 'depth', 'language', 'goalId', 'description'];
  const nodeInfo = n => { const r = {}; for (const [k, v] of Object.entries(n || {})) if (!NODE_LOCAL.includes(k) && !NODE_PLAN.includes(k) && k !== 'material') r[k] = v; return r; };
  const planSig = n => ({ chapters: n?.chapters || null, learningGoals: n?.learningGoals || null });
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const edgeKey = e => e.from + '>' + e.to;
  const topInfo = o => { const r = {}; for (const k of TOP_INFO) if (o?.[k] !== undefined) r[k] = o[k]; return r; };
  /** What the newest shared map would change in my copy → [{ key, sig, kind, nid, text, own }], without what I said no to
      (unless it changed again since). own: the step is taught by my own subject — taking its plan brings the group's step back. */
  function changes(local, rec, declined = {}) {
    const mine = strip(local || {}), out = [];
    const add = (key, val, x) => { const sig = hash(val ?? null); if (declined[key] !== sig) out.push({ key, sig, ...x }); };
    if (!same(topInfo(mine), topInfo(rec))) add('map', topInfo(rec), { kind: 'map', text: (rec.title || rec.goal) !== (mine.title || mine.goal) ? `The curriculum is now called “${rec.title || rec.goal}”` : 'The curriculum’s description changed' });
    for (const [id, r] of Object.entries(rec.nodes || {})) {
      const l = mine.nodes?.[id], own = !!local.nodes?.[id]?.pack?.assigned;
      if (!l) { add('add:' + id, r, { kind: 'add', nid: id, text: `New step “${r.title}”` }); continue; }
      if (!same(nodeInfo(l), nodeInfo(r))) add('info:' + id, nodeInfo(r), { kind: 'info', nid: id, text: l.title !== r.title ? `“${l.title}” is now called “${r.title}”` : `“${r.title}”: its description changed` });
      if (!same(planSig(l), planSig(r))) add('plan:' + id, planSig(r), { kind: 'plan', nid: id, own, text: own ? `“${r.title}”: a new chapter plan for the group. You study this step from your own subject; taking this brings the group’s version of the step back` : `“${r.title}”: a new chapter plan` });
      if (!same(l.material, r.material)) add('mat:' + id, r.material || null, { kind: 'mat', nid: id, text: `“${r.title}”: its material changed` });
    }
    for (const id of Object.keys(mine.nodes || {})) if (!rec.nodes?.[id]) add('del:' + id, 'gone', { kind: 'del', nid: id, text: `Step “${mine.nodes[id].title}” removed` });
    const le = new Set((mine.edges || []).map(edgeKey)), re = new Set((rec.edges || []).map(edgeKey));
    if (le.size !== re.size || [...re].some(k => !le.has(k))) add('links', [...re].sort(), { kind: 'links', text: 'The links between the steps changed' });
    return out;
  }
  /** My copy with the changes I take (keys of changes()) → { c, declined: { key: sig } for the ones I leave }. Everything of
      mine stays (progress, settings, my own subjects on steps); the group's plan of a step I teach with my own subject is kept
      aside (n.groupPlan) whether or not I take it. */
  function take(local, rec, keys = [], list = []) {
    const pick = new Set(keys), c = clone(local), at = new Date().toISOString();
    for (const k of Object.keys(rec)) if (!LOCAL.includes(k) && !['nodes', 'edges', 'files', ...TOP_INFO].includes(k)) c[k] = clone(rec[k]);   // the rest of the map's state, as it is
    if (pick.has('map')) for (const k of TOP_INFO) { if (rec[k] !== undefined) c[k] = clone(rec[k]); else delete c[k]; }
    c.files = { ...(local.files || {}), ...clone(rec.files || {}) };
    c.nodes = c.nodes || {};
    for (const [id, r] of Object.entries(rec.nodes || {})) {
      const x = c.nodes[id];
      if (!x) { if (pick.has('add:' + id)) c.nodes[id] = clone(r); continue; }
      if (pick.has('info:' + id)) { for (const k of Object.keys(nodeInfo(x))) delete x[k]; Object.assign(x, clone(nodeInfo(r))); }
      if (pick.has('mat:' + id)) { if (r.material) x.material = clone(r.material); else delete x.material; }
      const gp = {}; for (const k of NODE_PLAN) if (r[k] !== undefined) gp[k] = clone(r[k]);
      const toPlan = () => { for (const k of NODE_PLAN) delete x[k]; Object.assign(x, gp); };
      if (x.pack?.assigned) {
        if (pick.has('plan:' + id)) { toPlan(); x.pack = null; x.assignedAt = at; delete x.groupPlan; delete x.replan; delete x.planFrom; delete x.reviewed; }   // back to the group's version of the step
        else x.groupPlan = gp;
      } else if (pick.has('plan:' + id)) toPlan();
    }
    for (const id of Object.keys(local.nodes || {})) if (!rec.nodes?.[id] && pick.has('del:' + id)) delete c.nodes[id];
    // links: the group's when taken (plus mine to steps the group does not have), else mine plus those of a step I took
    const has = id => !!c.nodes[id], took = id => pick.has('add:' + id), mineE = new Set((local.edges || []).map(edgeKey));
    c.edges = pick.has('links')
      ? (rec.edges || []).filter(e => has(e.from) && has(e.to)).map(clone).concat((local.edges || []).filter(e => has(e.from) && has(e.to) && !(rec.nodes?.[e.from] && rec.nodes?.[e.to])))
      : (local.edges || []).filter(e => has(e.from) && has(e.to)).concat((rec.edges || []).filter(e => (took(e.from) || took(e.to)) && has(e.from) && has(e.to) && !mineE.has(edgeKey(e))).map(clone));
    const declined = {}; for (const ch of list) if (!pick.has(ch.key)) declined[ch.key] = ch.sig;
    return { c, declined };
  }
  /** Step rows → c.remote. A reservation that ran out counts as nothing (anybody may take it over). */
  function remoteOf(rows, me, now = Date.now()) {
    const r = {};
    for (const x of rows || []) {
      if (x.status !== 'ready' && !(Date.parse(x.claimed_until || '') > now)) continue;
      r[x.node_id] = { status: x.status, author: x.author, by: x.author_name || '', mine: x.author === me, version: x.version || null, at: x.updated_at || null, until: x.claimed_until || null, path: x.path || null, packId: x.pack_id || null, meta: x.meta || {} };
    }
    return r;
  }
  /** Is this step someone else's business? (prepared by anybody — get it instead — or being prepared by someone else) */
  const taken = (c, nid) => { const x = c?.shared && c.remote?.[nid]; return !!x && (x.status === 'ready' || !x.mine); };
  const isMember = c => c?.shared?.role === 'member' && !c.shared.ended;
  const stepPath = (cid, author, nid) => `${cid}/steps/${author}/${nid}.json`;
  const filePath = (cid, fid, name) => `${cid}/files/${String(fid).replace(/[^a-zA-Z0-9_-]/g, '_')}.${((String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || 'bin')}`;
  const dup = e => /duplicate|23505|already exists|conflict|409/i.test(String(e && e.message || e));

  /* ---------- the rules of a step, through any Supabase caller api(path, { method, body, headers }) → JSON ---------- */
  const one = (cid, nid) => `${T.steps}?curriculum=eq.${enc(cid)}&node_id=eq.${enc(nid)}`;
  const Core = {
    BUCKET, LEASE, T, strip, merge, changes, take, hash, remoteOf, taken, isMember, stepPath, filePath,
    rows: (api, cid) => api(`${T.steps}?select=*&curriculum=eq.${enc(cid)}&order=node_id`),
    async row(api, cid, nid) { return ((await api(one(cid, nid) + '&select=*')) || [])[0] || null; },
    /** Reserve a step for preparing it → { ok, row } — or { ok: false, row } when somebody else has it (prepared, or
        reserved and not run out). An expired reservation is taken over; my own one is renewed. */
    async claim(api, { cid, nid, me, name = '', packId = null, lease = LEASE }) {
      const until = new Date(Date.now() + lease).toISOString();
      try {
        const ins = await api(T.steps, { method: 'POST', body: [{ curriculum: cid, node_id: nid, status: 'preparing', author: me, author_name: name, pack_id: packId, claimed_until: until }], headers: { Prefer: 'return=representation' } });
        if (Array.isArray(ins) && ins.length) return { ok: true, row: ins[0] };
      } catch (e) { if (!dup(e)) throw e; }
      const row = await Core.row(api, cid, nid);
      if (!row) return { ok: false, row: null };
      if (row.author === me && row.status === 'preparing') return { ok: true, row: (await Core.renew(api, { cid, nid, me, lease })) || row };
      if (row.status === 'preparing' && Date.parse(row.claimed_until || '') < Date.now()) {
        const upd = await api(one(cid, nid) + `&status=eq.preparing&claimed_until=lt.${enc(new Date().toISOString())}`, { method: 'PATCH', body: { author: me, author_name: name, pack_id: packId, claimed_until: until }, headers: { Prefer: 'return=representation' } });
        if (Array.isArray(upd) && upd.length) return { ok: true, row: upd[0] };
      }
      return { ok: false, row };
    },
    async renew(api, { cid, nid, me, lease = LEASE }) {
      const upd = await api(one(cid, nid) + `&author=eq.${enc(me)}&status=eq.preparing`, { method: 'PATCH', body: { claimed_until: new Date(Date.now() + lease).toISOString() }, headers: { Prefer: 'return=representation' } });
      return Array.isArray(upd) && upd[0] || null;
    },
    /** Give a reservation back (preparing failed / stopped). A prepared step is never released this way. */
    release: (api, { cid, nid, me }) => api(one(cid, nid) + `&author=eq.${enc(me)}&status=eq.preparing`, { method: 'DELETE' }),
    /** The step is prepared and its pack uploaded → the row says so (my reservation or my earlier version; a new row if
        there is none; an expired reservation of someone else is taken over). → { ok, row } | { ok: false, row } (someone else's) */
    async ready(api, { cid, nid, me, name = '', packId, version = null, path, meta = {} }) {
      const body = { status: 'ready', author: me, author_name: name, pack_id: packId, version, path, meta, claimed_until: null };
      const mine = await api(one(cid, nid) + `&author=eq.${enc(me)}`, { method: 'PATCH', body, headers: { Prefer: 'return=representation' } });
      if (Array.isArray(mine) && mine.length) return { ok: true, row: mine[0] };
      try {
        const ins = await api(T.steps, { method: 'POST', body: [{ curriculum: cid, node_id: nid, ...body }], headers: { Prefer: 'return=representation' } });
        if (Array.isArray(ins) && ins.length) return { ok: true, row: ins[0] };
      } catch (e) { if (!dup(e)) throw e; }
      const upd = await api(one(cid, nid) + `&status=eq.preparing&claimed_until=lt.${enc(new Date().toISOString())}`, { method: 'PATCH', body, headers: { Prefer: 'return=representation' } });
      if (Array.isArray(upd) && upd.length) return { ok: true, row: upd[0] };
      return { ok: false, row: await Core.row(api, cid, nid) };
    },
  };

  const Share = root.NoemaCurShare = { core: Core, BUCKET, LEASE, taken, isMember, strip, merge, remoteOf };
  if (!root.document) return;   // the connector needs only the core

  /* ======================= in the app ======================= */
  const C = () => root.NoemaCurriculum, CL = () => root.NoemaCloud, SF = () => root.NoemaSrcFiles;
  const api = (p, o) => CL().api(p, o);
  const me = () => CL()?.session?.()?.user?.id || null;
  const cloudOn = acc => !!(CL()?.session?.() && acc === 'u_' + CL().session().user.id);
  const myName = acc => { const a = root.Noema?.getAccount?.(acc); const s = CL()?.session?.()?.user; return (a && a.name) || s?.user_metadata?.name || (s?.email || '').split('@')[0] || ''; };
  const toast = (m, ms) => root.Noema?.toast?.(m, ms);
  const listeners = new Set(); const emit = () => listeners.forEach(f => { try { f(); } catch (e) { } });
  Share.onChange = f => { listeners.add(f); return () => listeners.delete(f); };
  const need = acc => { if (!cloudOn(acc)) throw new Error('Sharing a curriculum needs a ☁️ cloud account (⚙️ → Cloud).'); };
  const save = (acc, c) => C().save(acc, c);
  function patchNode(acc, cid, nid, pack) { const c = C().get(acc, cid); if (!c?.nodes[nid]) return null; c.nodes[nid].pack = { ...(c.nodes[nid].pack || {}), ...pack }; save(acc, c); return c; }
  const stats = c => ({ steps: Object.keys(c.nodes || {}).length, files: Object.keys(c.files || {}).length, chapters: Object.values(c.nodes || {}).reduce((a, n) => a + (n.chapters?.length || 0), 0) });

  /* ---------- the owner: share, change, stop ---------- */
  /** Upload the curriculum's material files that are not in the shared bucket yet → the files map (meta.files). */
  async function uploadFiles(acc, c, have = {}, onLog = () => { }) {
    const out = { ...have };
    for (const [fid, f] of Object.entries(c.files || {})) {
      if (out[fid] && (!f.sha256 || out[fid].sha256 === f.sha256)) continue;
      const rec = await SF().get(acc, C().curStore(c.id), fid).catch(() => null);
      if (!rec?.blob) { onLog(`⚠️ ${f.name}: not on this device — not shared (members cannot prepare its steps from it)`); continue; }
      onLog(`📎 ${f.name}…`);
      const path = Core.filePath(c.id, fid, f.name || rec.name); const r = await CL().putFile(BUCKET, path, rec.blob, rec.type || f.type || 'application/octet-stream');
      out[fid] = { path, chunks: r.chunks || 0, name: f.name || rec.name, type: rec.type || f.type || '', size: rec.blob.size, sha256: f.sha256 || null };
    }
    for (const fid of Object.keys(out)) if (!c.files?.[fid]) delete out[fid];   // removed from the map
    return out;
  }
  /** Share one of my curricula (or change how): isPublic, the steps prepared so far, the material files. */
  Share.publish = async (acc, cid, { isPublic = false, steps = true, onLog = () => { } } = {}) => {
    need(acc); let c = C().get(acc, cid);
    if (!c) throw new Error('Curriculum not found.');
    if (isMember(c)) throw new Error('This curriculum belongs to ' + (c.shared.ownerName || 'someone else') + ' — only its owner shares it.');
    if (!Object.keys(c.nodes || {}).length || (!c.imported && ['dag', 'audit', 'expand'].includes(c.stage) && c.status !== 'ready')) throw new Error('Its map is not ready yet — share it when the map is built.');
    if (!/^c[a-z0-9]{2,30}$/.test(c.id)) throw new Error('This curriculum has an old id that cannot be shared.');
    const rec = Core.strip(c), h = Core.hash(rec), at = new Date().toISOString();
    onLog('🗺️ The map…');
    const base = { id: cid, owner: me(), owner_name: myName(acc), title: c.title || c.goal, description: c.goal !== c.title ? c.goal : (c.scope || null), language: c.language || null, public: !!isPublic, record: rec };
    const old = ((await api(`${T.cur}?select=id,version,meta&id=eq.${enc(cid)}`).catch(() => [])) || [])[0];
    const meta = { ...(old?.meta || {}), counts: stats(c) };
    if (old) await api(`${T.cur}?id=eq.${enc(cid)}`, { method: 'PATCH', body: { ...base, meta, version: (old.version || 1) + 1 }, headers: { Prefer: 'return=minimal' } });
    else await api(T.cur, { method: 'POST', body: [{ ...base, meta, version: 1 }], headers: { Prefer: 'return=minimal' } });
    meta.files = await uploadFiles(acc, c, meta.files || {}, onLog);
    await api(`${T.cur}?id=eq.${enc(cid)}`, { method: 'PATCH', body: { meta }, headers: { Prefer: 'return=minimal' } });
    c = C().get(acc, cid);
    c.shared = { id: cid, role: 'owner', owner: me(), ownerName: myName(acc), public: !!isPublic, version: (old?.version || 0) + 1, at, hash: h, files: meta.files };
    (c.log = c.log || []).push({ t: Date.now(), m: isPublic ? '👥 shared — 🌍 public' : '👥 shared' }); save(acc, c); emit();
    if (steps) for (const [nid, n] of Object.entries(c.nodes)) if (n.pack?.status === 'ready' && !n.pack.assigned && !(n.pack.author && n.pack.author !== me())) {
      onLog(`⚡ “${n.title}”…`);
      try { await Share.contribute(acc, cid, nid); } catch (e) { onLog(`⚠️ “${n.title}”: ${e.message}`); }
    }
    await Share.refresh(acc, cid).catch(() => { });
    onLog('✅ Shared'); return C().get(acc, cid);
  };
  Share.setPublic = async (acc, cid, isPublic) => {
    need(acc); await api(`${T.cur}?id=eq.${enc(cid)}`, { method: 'PATCH', body: { public: !!isPublic }, headers: { Prefer: 'return=minimal' } });
    const c = C().get(acc, cid); if (c?.shared) { c.shared.public = !!isPublic; save(acc, c); } emit();
  };
  /** The owner's map changed → the shared map (new material files too). Called by itself shortly after every change. */
  Share.push = async (acc, cid) => {
    const c = C().get(acc, cid); if (c?.shared?.role !== 'owner' || !cloudOn(acc)) return false;
    const rec = Core.strip(c), h = Core.hash(rec); if (h === c.shared.hash) return false;
    const files = await uploadFiles(acc, c, c.shared.files || {});
    const [row] = (await api(`${T.cur}?id=eq.${enc(cid)}`, { method: 'PATCH', body: { record: rec, title: c.title || c.goal, meta: { counts: stats(c), files }, version: (c.shared.version || 1) + 1 }, headers: { Prefer: 'return=representation' } })) || [];
    const cur = C().get(acc, cid); if (!cur?.shared) return false;
    if (!row) { cur.shared = null; cur.remote = null; save(acc, cur); emit(); return false; }   // the sharing was stopped elsewhere
    cur.shared = { ...cur.shared, hash: h, version: row.version, at: row.updated_at, files }; save(acc, cur); emit(); return true;
  };
  /** 🔔 The owner's newest map, as changes I may take → { list, record, version, at } (list empty: nothing new). */
  Share.incoming = async (acc, cid) => {
    const c = C().get(acc, cid); if (c?.shared?.role !== 'member' || c.shared.ended) return { list: [] };
    const full = ((await api(`${T.cur}?select=record,version,updated_at,meta&id=eq.${enc(cid)}`)) || [])[0]; if (!full?.record) return { list: [] };
    return { list: Core.changes(c, full.record, c.shared.declined || {}), record: full.record, version: full.version, at: full.updated_at, files: full.meta?.files || {} };
  };
  /** Take some of the owner's changes (keys from Share.incoming; [] = keep my copy). The others are not offered again until they change. */
  Share.takeChanges = async (acc, cid, keys, inc) => {
    inc = inc || await Share.incoming(acc, cid); const cur = C().get(acc, cid); if (!cur?.shared || !inc.record) return cur;
    const { c, declined } = Core.take(cur, inc.record, keys, inc.list);
    const dec = { ...(cur.shared.declined || {}) }; for (const k of keys) delete dec[k]; Object.assign(dec, declined);
    c.shared = { ...cur.shared, version: inc.version, seen: inc.version, at: inc.at, files: inc.files || cur.shared.files || {}, incoming: null, declined: dec }; c.autoApprove = true;
    (c.log = c.log || []).push({ t: Date.now(), m: `👥 ${keys.length ? `took ${keys.length} of ${inc.list.length} change(s)` : 'kept my copy'} from ${cur.shared.ownerName || 'the owner'}` });
    save(acc, c); emit(); return C().get(acc, cid);
  };
  /** Keep the version of a prepared step I have (its author made a new one) — until they make another. */
  Share.keepStep = (acc, cid, nid) => { const c = C().get(acc, cid), x = c?.remote?.[nid]; if (!c?.nodes[nid]?.pack) return; c.nodes[nid].pack = { ...c.nodes[nid].pack, stale: false, keptAt: x?.at || null }; save(acc, c); emit(); };
  /** 🔔 What waits for me in my shared curricula: the owner's changes, new versions of prepared steps I have. */
  Share.updates = acc => {
    const out = [];
    for (const c of C().list(acc)) {
      if (!c.shared || c.shared.ended) continue;
      const t = c.title || c.goal;
      if (c.shared.incoming) out.push({ id: 'curup:' + c.id, kind: 'curupdate', curriculum: c.id, title: t, from_name: c.shared.ownerName || '', count: c.shared.incoming.count, lines: c.shared.incoming.lines || [] });
      for (const [nid, n] of Object.entries(c.nodes || {})) if (n.pack?.stale) out.push({ id: `stepup:${c.id}:${nid}`, kind: 'stepupdate', curriculum: c.id, node: nid, title: n.title, curTitle: t, from_name: n.pack.by || '' });
    }
    return out;
  };
  /** Stop sharing: the members keep their copies (and the steps they downloaded); the shared steps and files go. */
  Share.unpublish = async (acc, cid) => {
    need(acc);
    const rows = (await Core.rows(api, cid).catch(() => [])) || [];
    const row = ((await api(`${T.cur}?select=meta&id=eq.${enc(cid)}`).catch(() => [])) || [])[0];
    const paths = [];
    for (const r of rows) { if (r.path) paths.push(...CL().partPaths(r.path, r.meta?.chunks || 0)); paths.push(...(r.meta?.filePaths || [])); }
    for (const f of Object.values(row?.meta?.files || {})) paths.push(...CL().partPaths(f.path, f.chunks || 0));
    for (let i = 0; i < paths.length; i += 100) await CL().deleteObjects(BUCKET, paths.slice(i, i + 100)).catch(() => { });
    await api(`${T.cur}?id=eq.${enc(cid)}`, { method: 'DELETE' });
    const c = C().get(acc, cid); if (c) { c.shared = null; c.remote = null; (c.log = c.log || []).push({ t: Date.now(), m: '👥 sharing stopped' }); save(acc, c); } emit();
  };
  Share.invite = async (acc, cid, email, message = '') => {
    need(acc); const to = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('Please type a valid e-mail address.');
    if (to === (CL().session().user.email || '').toLowerCase()) throw new Error('That is your own e-mail address.');
    const old = ((await api(`${T.mem}?select=status&curriculum=eq.${enc(cid)}&email=eq.${enc(to)}`).catch(() => [])) || [])[0];
    if (old?.status === 'joined') throw new Error(to + ' is already in this curriculum.');
    if (old) await api(`${T.mem}?curriculum=eq.${enc(cid)}&email=eq.${enc(to)}`, { method: 'DELETE' });   // invited again (after a “no”, leaving or removal)
    await api(T.mem, { method: 'POST', body: [{ curriculum: cid, email: to, message: message || null, status: 'pending', invited_by: me() }], headers: { Prefer: 'return=minimal' } });
    emit();
  };
  Share.members = async cid => (await api(`${T.mem}?select=*&curriculum=eq.${enc(cid)}&order=created_at.asc`)) || [];
  Share.removeMember = async (cid, email, { pending = false } = {}) => {
    if (pending) await api(`${T.mem}?curriculum=eq.${enc(cid)}&email=eq.${enc(email)}`, { method: 'DELETE' });
    else await api(`${T.mem}?curriculum=eq.${enc(cid)}&email=eq.${enc(email)}`, { method: 'PATCH', body: { status: 'revoked' }, headers: { Prefer: 'return=minimal' } });
    emit();
  };
  /** The owner removes a step someone prepared (it can be prepared again). */
  Share.removeStep = async (acc, cid, nid) => {
    const r = await Core.row(api, cid, nid); if (!r) return;
    const paths = [...(r.path ? CL().partPaths(r.path, r.meta?.chunks || 0) : []), ...(r.meta?.filePaths || [])];
    if (paths.length) await CL().deleteObjects(BUCKET, paths).catch(() => { });
    await api(one(cid, nid), { method: 'DELETE' });
    await Share.refresh(acc, cid);
  };

  /* ---------- everybody: what is there, join, leave ---------- */
  /** 🌍 Public curricula (also for signed-out visitors), with how many steps are prepared. */
  Share.explore = async () => {
    const auth = !!CL()?.session?.();
    const list = (await api(`${T.cur}?select=id,owner,owner_name,title,description,language,meta,version,updated_at,published_at&public=eq.true&order=updated_at.desc&limit=200`, { auth })) || [];
    if (list.length) {
      const st = (await api(`${T.steps}?select=curriculum,status&status=eq.ready&curriculum=in.(${list.map(x => enc(x.id)).join(',')})`, { auth }).catch(() => [])) || [];
      for (const x of list) x.prepared = st.filter(s => s.curriculum === x.id).length;
    }
    return list;
  };
  /** Invitations waiting for me → [{ curriculum, title, owner_name, message, meta, … }] */
  Share.invites = async () => {
    const em = (CL()?.session?.()?.user?.email || '').toLowerCase(); if (!em) return [];
    const inv = (await api(`${T.mem}?select=*&email=eq.${enc(em)}&status=eq.pending`)) || []; if (!inv.length) return [];
    const curs = (await api(`${T.cur}?select=id,owner,owner_name,title,description,language,meta,updated_at&id=in.(${inv.map(x => enc(x.curriculum)).join(',')})`)) || [];
    return inv.map(i => { const c = curs.find(x => x.id === i.curriculum); return c ? { ...i, title: c.title, owner_name: c.owner_name, owner: c.owner, description: c.description, language: c.language, meta: c.meta || {} } : null; }).filter(Boolean);
  };
  /** Join (an invitation, or a public curriculum) → this person's copy of the map; their progress is their own. */
  Share.join = async (acc, cid) => {
    need(acc);
    const row = ((await api(`${T.cur}?select=*&id=eq.${enc(cid)}`)) || [])[0];
    if (!row) throw new Error('This curriculum is not shared any more.');
    if (row.owner === me()) throw new Error('This is your own curriculum.');
    const em = CL().session().user.email.toLowerCase(), body = { status: 'joined', user_id: me(), name: myName(acc), responded_at: new Date().toISOString() };
    const upd = await api(`${T.mem}?curriculum=eq.${enc(cid)}&email=eq.${enc(em)}`, { method: 'PATCH', body, headers: { Prefer: 'return=representation' } }).catch(e => { throw new Error(/row-level|403|permission/i.test(e.message) ? 'You cannot join this curriculum (the owner removed you, or it is not public).' : e.message); });
    if (!upd?.length) {
      if (!row.public) throw new Error('This curriculum is shared with invited people only.');
      await api(T.mem, { method: 'POST', body: [{ curriculum: cid, email: em, ...body }], headers: { Prefer: 'return=minimal' } }).catch(e => { throw new Error(dup(e) || /row-level|403/i.test(e.message) ? 'You cannot join this curriculum any more (its owner removed you).' : e.message); });
    }
    const local = C().get(acc, cid);
    const L = root.NoemaLLM; const provider = local?.provider || (L?.pick?.(acc, 'auto') ? 'auto' : 'claudeapp');
    const base = local || { prefetch: 0, nodeBudget: 8, provider, model: '', autoApprove: true, log: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    const c = Core.merge(base, row.record || {});
    Object.assign(c, { format: 'noema.curriculum/v1', id: cid, status: c.status === 'waiting' ? 'ready' : (c.status || 'ready'), autoApprove: true,
      shared: { id: cid, role: 'member', owner: row.owner, ownerName: row.owner_name || '', public: !!row.public, version: row.version, at: row.updated_at, files: row.meta?.files || {} } });
    (c.log = c.log || []).push({ t: Date.now(), m: `👥 joined — shared by ${row.owner_name || 'its owner'}` });
    save(acc, c); emit();
    await Share.refresh(acc, cid).catch(e => console.warn('[curshare]', e));
    return C().get(acc, cid);
  };
  Share.decline = async cid => { const em = CL().session().user.email.toLowerCase(); await api(`${T.mem}?curriculum=eq.${enc(cid)}&email=eq.${enc(em)}`, { method: 'PATCH', body: { status: 'rejected', user_id: me(), responded_at: new Date().toISOString() }, headers: { Prefer: 'return=minimal' } }); emit(); };
  /** Leave a curriculum someone shared: my copy of the map goes, the steps I studied stay in my subjects (with my progress). */
  Share.leave = async (acc, cid) => {
    if (cloudOn(acc)) { const em = CL().session().user.email.toLowerCase(); await api(`${T.mem}?curriculum=eq.${enc(cid)}&email=eq.${enc(em)}`, { method: 'PATCH', body: { status: 'left', user_id: me() }, headers: { Prefer: 'return=minimal' } }).catch(() => { }); }
    C().remove(acc, cid); emit();
  };

  /* ---------- keeping a copy up to date ---------- */
  /** The newest shared map (for members) and who prepared / is preparing which step (everybody) → saved when it changed. */
  Share.refresh = async (acc, cid) => {
    let c = C().get(acc, cid); if (!c?.shared || c.shared.ended || !cloudOn(acc)) return c;
    const head = ((await api(`${T.cur}?select=id,owner_name,public,version,updated_at,title,meta&id=eq.${enc(cid)}`)) || [])[0];
    const before = JSON.stringify([c.shared, c.remote, c.nodes]);
    if (!head) {   // no longer shared (stopped, or I was removed): my copy stays, as my own curriculum
      c = C().get(acc, cid);
      if (c.shared.role === 'member') { c.shared = { ...c.shared, ended: true }; (c.log = c.log || []).push({ t: Date.now(), m: '👥 no longer shared with you — your copy and your prepared steps stay' }); }
      else c.shared = null;
      c.remote = null; save(acc, c); emit(); return c;
    }
    if (c.shared.role === 'member' && head.version !== (c.shared.seen || c.shared.version)) {   // 🔔 the owner changed the map: nothing changes here until I take it
      const full = ((await api(`${T.cur}?select=record,version,updated_at,meta&id=eq.${enc(cid)}`)) || [])[0];
      if (full?.record) {
        const cur = C().get(acc, cid), list = Core.changes(cur, full.record, cur.shared.declined || {});
        if (list.length) { c = cur; c.shared = { ...c.shared, seen: full.version, files: full.meta?.files || {}, incoming: { version: full.version, at: full.updated_at, count: list.length, lines: list.slice(0, 3).map(x => x.text) } }; }
        else { c = Core.take(cur, full.record).c; c.shared = { ...c.shared, version: full.version, seen: full.version, at: full.updated_at, files: full.meta?.files || {}, incoming: null }; c.autoApprove = true; }   // nothing I would see
      }
    }
    c.shared = { ...c.shared, ownerName: head.owner_name || c.shared.ownerName, public: !!head.public };
    const rows = (await Core.rows(api, cid)) || [];
    c.remote = Core.remoteOf(rows, me());
    for (const [nid, n] of Object.entries(c.nodes || {})) {
      const x = c.remote[nid];
      if (n.pack?.status === 'app' && Core.taken(c, nid)) n.pack = { ...n.pack, status: null, queuedAt: null };   // someone else has it: out of my Claude app's queue
      if (n.pack?.status === 'ready' && x?.status === 'ready' && n.pack.shared && x.author === n.pack.author && x.at && n.pack.sharedAt && x.at > n.pack.sharedAt && x.at !== n.pack.keptAt && !x.mine) n.pack = { ...n.pack, stale: true };   // its author replaced it: 🔔, it waits for me
    }
    if (JSON.stringify([c.shared, c.remote, c.nodes]) !== before) { save(acc, c); emit(); }
    return c;
  };
  Share.refreshAll = async acc => {
    for (const c0 of C().list(acc)) {
      if (!c0.shared || c0.shared.ended) continue;
      const c = await Share.refresh(acc, c0.id).catch(e => { console.warn('[curshare]', e.message); return null; });
      for (const [nid, n] of Object.entries(c?.nodes || {})) if (n.pack?.status === 'ready' && n.pack.shareError) {   // sharing a step failed earlier: again
        const r = await Share.contribute(acc, c.id, nid).catch(e => ({ error: e.message }));
        if (!r.error) patchNode(acc, c.id, nid, { shareError: null });
      }
    }
  };

  /* ---------- a step: reserve, publish, get ---------- */
  /** Before preparing a step of a shared curriculum: reserve it → true, or false when somebody else has it. */
  Share.claim = async (acc, c, nid) => {
    if (!c?.shared || c.shared.ended) return true;
    if (!cloudOn(acc)) return false;
    let r;
    try { r = await Core.claim(api, { cid: c.id, nid, me: me(), name: myName(acc), packId: C().packId(c, nid) }); }
    catch (e) { console.warn('[curshare] claim', e.message); toast(/row-level|403|permission/i.test(e.message) ? '👥 You cannot prepare steps of this curriculum any more (you left it, or its owner removed you).' : '⚠️ ' + e.message, 6000); r = { ok: false }; }
    if (!r.ok) await Share.refresh(acc, c.id).catch(() => { });
    return r.ok;
  };
  Share.renew = (acc, c, nid) => c?.shared && !c.shared.ended && cloudOn(acc) ? Core.renew(api, { cid: c.id, nid, me: me() }).catch(() => null) : null;
  Share.release = (acc, c, nid) => c?.shared && !c.shared.ended && cloudOn(acc) ? Core.release(api, { cid: c.id, nid, me: me() }).catch(() => null) : null;
  /** A step I prepared (here, in my Claude app, or imported) → everybody gets it. → { ok } | { taken: row } */
  Share.contribute = async (acc, cid, nid) => {
    let c = C().get(acc, cid); const n = c?.nodes[nid]; if (!c?.shared || c.shared.ended || !n || n.pack?.status !== 'ready' || n.pack.assigned || !cloudOn(acc)) return { ok: false };   // 📦 a subject of my own on the step is never shared
    const pid = C().packId(c, nid), uid = me();
    const cur = await Core.row(api, cid, nid);
    if (cur && cur.author !== uid && (cur.status === 'ready' || Date.parse(cur.claimed_until || '') > Date.now())) {   // somebody else's: I keep my own version, theirs is the shared one
      patchNode(acc, cid, nid, { own: true }); await Share.refresh(acc, cid).catch(() => { }); return { taken: cur };
    }
    const pack = await root.Noema.getPackById(acc, pid);
    const store = C().curStore(cid), ix = SF() ? SF().index(acc, pid) : {};
    const files = [];   // its own source files (the curriculum's material travels once, with the map)
    if (SF()) for (const [src, m] of Object.entries(ix)) { if (m.ref?.subj === store) continue; const rec = await SF().get(acc, pid, src).catch(() => null); if (rec?.blob) files.push({ srcId: src, blob: rec.blob, name: rec.name || m.name, type: rec.type || m.type || '' }); }
    const up = files.length ? await CL().uploadShareFiles(BUCKET, f => `${cid}/steps/${uid}/${nid}/src-${f.safe}.${f.ext}`, files) : { map: {}, paths: [] };
    const out = { ...pack, sharedFiles: up.map }; delete out._sharedFiles;
    const path = Core.stepPath(cid, uid, nid);
    const w = await CL().putFile(BUCKET, path, new Blob([JSON.stringify(out)], { type: 'application/json' }), 'application/json');
    const counts = pack.counts || { chapters: (pack.chapters || []).length };
    const old = cur && cur.author === uid ? cur : null;
    const r = await Core.ready(api, { cid, nid, me: uid, name: myName(acc), packId: pid, version: pack.version || null, path, meta: { chunks: w.chunks || 0, counts, sharedFiles: up.map, filePaths: up.paths, sourceFiles: files.length } });
    if (!r.ok) {   // taken a moment earlier by somebody else
      await CL().deleteObjects(BUCKET, [...CL().partPaths(path, w.chunks || 0), ...up.paths]).catch(() => { });
      patchNode(acc, cid, nid, { own: true }); await Share.refresh(acc, cid).catch(() => { }); return { taken: r.row };
    }
    if (old?.meta?.filePaths?.length) { const stale = old.meta.filePaths.filter(x => !up.paths.includes(x)); if (stale.length) await CL().deleteObjects(BUCKET, stale).catch(() => { }); }
    patchNode(acc, cid, nid, { shared: true, author: uid, by: myName(acc), sharedAt: r.row.updated_at, own: false, stale: false });
    c = C().get(acc, cid); c.remote = { ...(c.remote || {}), ...Core.remoteOf([r.row], uid) }; save(acc, c); emit();
    return { ok: true };
  };
  /** The curriculum's material file → this device / my account (members need it to prepare a step from it). */
  Share.ensureFile = async (acc, c, fid) => {
    const store = C().curStore(c.id); if (SF().index(acc, store)[fid]) return true;
    const f = c.shared?.files?.[fid]; if (!f) return false;
    const blob = await CL().getFile(BUCKET, f.path, f.chunks || 0, { type: f.type });
    await SF().put(acc, store, fid, new File([blob], f.name || fid, { type: f.type || blob.type || '' }), { name: f.name });
    return true;
  };
  Share.ensureNodeFiles = async (acc, c, nid) => { if (!isMember(c)) return; for (const f of c.nodes[nid]?.material?.files || []) if (f.fileId) await Share.ensureFile(acc, c, f.fileId).catch(e => console.warn('[curshare] file', f.name, e.message)); };
  const getting = new Map();
  /** Somebody prepared this step: get it into my account (the same subject id for everybody) and study it. */
  Share.download = (acc, cid, nid) => {
    const k = cid + '/' + nid; if (getting.has(k)) return getting.get(k);
    const job = (async () => {
      let c = await Share.refresh(acc, cid); const x = c?.remote?.[nid];
      if (c?.nodes[nid]?.pack?.assigned) throw new Error('Your own subject teaches this step — take it off the step (↩) to get the shared one.');
      if (!x || x.status !== 'ready' || !x.path) throw new Error('This step is not prepared in the shared curriculum (any more).');
      const pid = C().packId(c, nid);
      const blob = await CL().getFile(BUCKET, x.path, x.meta?.chunks || 0, { type: 'application/json' });
      const pack = JSON.parse(await blob.text());
      const shared = pack.sharedFiles || x.meta?.sharedFiles || {};
      pack.subject.id = pid; pack.curriculum = { id: cid, node: nid };
      await root.Noema.importPack(acc, pack, { curriculum: cid, node: nid, curTitle: c.title, sharedBy: x.by || '', via: 'shared' });
      if (SF() && Object.keys(shared).length) await SF().attachShared(acc, { ...pack, sharedFiles: shared }, BUCKET).catch(e => console.warn('[curshare] files', e));
      // the curriculum's material: one copy for every step that uses it
      const n = C().get(acc, cid).nodes[nid];
      for (const f of n.material?.files || []) {
        if (!f.fileId || !(pack.sources?.sources || []).some(s => s.id === f.srcId) || SF().index(acc, pid)[f.srcId]) continue;
        if (await Share.ensureFile(acc, c, f.fileId).catch(() => false)) SF().link(acc, pid, f.srcId, { subj: C().curStore(cid), src: f.fileId }, { name: f.name, type: f.type, size: f.size });
      }
      const secs = pack.chapters.flatMap(ch => (ch.sections || []).map(s => s.id)), exN = pack.chapters.reduce((a, ch) => a + (ch.exercises || []).length, 0);
      patchNode(acc, cid, nid, { id: pid, status: 'ready', version: pack.version || null, sections: secs, exercises: exN, chapters: pack.chapters.length, generatedAt: x.at, error: null, shared: true, author: x.author, by: x.by, sharedAt: x.at, stale: false, own: false });
      emit(); return pid;
    })();
    getting.set(k, job); job.finally(() => getting.delete(k)).catch(() => { });
    return job;
  };
  /** Get the next prepared steps ahead (in study order), so they open at once. */
  Share.prefetch = async (acc, cid, n = 2) => {
    const c = C().get(acc, cid); if (!c?.remote) return;
    const want = C().nextUp(acc, c).filter(id => c.remote[id]?.status === 'ready' && c.nodes[id].pack?.status !== 'ready' && !c.nodes[id].pack?.own).slice(0, n);   // a new version of one I have waits for me (🔔)
    for (const id of want) await Share.download(acc, cid, id).catch(e => console.warn('[curshare] prefetch', e.message));
  };

  /* ---------- by itself: the owner's changes go out, everybody's view comes in ---------- */
  const pushT = {};
  Share.start = acc => {
    if (Share.acc === acc || !cloudOn(acc)) return; Share.acc = acc;
    C().onChange((a, c) => {
      if (a !== acc || c?.shared?.role !== 'owner') return;
      clearTimeout(pushT[c.id]); pushT[c.id] = setTimeout(() => Share.push(acc, c.id).catch(e => console.warn('[curshare] push', e.message)), 2500);
    });
    const tick = () => { if (document.visibilityState === 'visible') Share.refreshAll(acc).catch(() => { }); };
    document.addEventListener('visibilitychange', tick);
    Share.timer = setInterval(tick, 60000); tick();
  };
})(typeof window !== 'undefined' ? window : globalThis);
