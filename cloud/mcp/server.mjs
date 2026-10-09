/* noema-lite MCP connector — lets a user's OWN Claude (claude.ai / Desktop, their own subscription) create
   and update subject packs directly in their noema-lite cloud account. Docs: docs/CLAUDE_CONNECTOR.md

   Transport: MCP Streamable HTTP, stateless, JSON responses (POST /mcp).
   Auth: OAuth 2.1 by Supabase Auth (the user signs in with their noema-lite account and approves on
   /oauth/consent). Every call carries the user's own access token, so Supabase row-level security
   applies exactly as in the app — this function holds NO secret keys.

   Curricula (docs/CURRICULUM.md §7): the learner's Claude does the curriculum agents' work and prepares steps with the
   learner's Claude plan — noema_curricula → noema_curriculum_task → (answer) noema_curriculum_submit / (step) the usual
   upload. Tasks, checks and how an answer changes a curriculum come from the app's own code (engine/curriculum.js +
   engine/curjobs.js, bundled), and answers go to an inbox (KV a:curin:…) that the app applies — never into the
   curriculum record the app may be editing.

   tools/build.py (site) prepends `const CFG = {…}; const DOCS = {…};` + engine/packcheck.js + the curriculum code
   (engine/llm.js, curriculum.js, curjobs.js) and writes dist/functions/mcp.mjs. */

const VERSION = '1.0.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_INLINE = 1_500_000;          // noema_save_pack: bigger packs go through the signed upload URL
const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-expose-headers': 'www-authenticate' };
const MCP_URL = CFG.siteUrl.replace(/\/$/, '') + '/mcp';
const PRM_URL = CFG.siteUrl.replace(/\/$/, '') + '/.well-known/oauth-protected-resource/mcp';
const PRM = { resource: MCP_URL, authorization_servers: [CFG.supabaseUrl.replace(/\/$/, '') + '/auth/v1'], bearer_methods_supported: ['header'], scopes_supported: ['openid', 'email', 'profile'], resource_name: 'noema-lite', resource_documentation: CFG.siteUrl };

const J = (obj, status = 200, headers = {}) => new Response(obj === null ? null : JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS, ...headers } });
const challenge = () => ({ 'www-authenticate': `Bearer resource_metadata="${PRM_URL}"` });

async function sb(path, token, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const isBin = typeof body === 'string' || body instanceof Uint8Array;
  const r = await fetch(CFG.supabaseUrl.replace(/\/$/, '') + path, {
    method, body: body == null ? undefined : isBin ? body : JSON.stringify(body),
    headers: { apikey: CFG.supabaseKey, authorization: 'Bearer ' + token, ...(body != null && !isBin ? { 'content-type': 'application/json' } : {}), ...headers },
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); const e = new Error(`Supabase ${r.status}: ${t.slice(0, 300)}`); e.status = r.status; throw e; }
  if (raw) return r;
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

/* ---------- pack checks: engine/packcheck.js (shared with the app), prepended by tools/build.py ---------- */
const checkPack = (p, expectId) => globalThis.NoemaPackCheck.checkPack(p, expectId);

async function register(token, uid, p, counts, extra = {}) {
  const meta = { ...p.subject, counts: { ...(p.counts || {}), ...counts }, version: p.version || null, via: 'claude', updatedAt: new Date().toISOString(), ...extra };
  await sb('/rest/v1/noema_kv?on_conflict=user_id,key', token, { method: 'POST', body: [{ user_id: uid, key: 'a:packmeta:' + p.subject.id, value: JSON.stringify(meta), updated_at: new Date().toISOString() }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
}
/* ---------- the pack's own source files (make_pack.py packages them: file "sources/<name>" + size + sha256) ---------- */
const packaged = p => ((p?.sources?.sources) || []).filter(x => x && x.sha256 && /^sources\//.test(String(x.file || '')));
const extOf = name => ((String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || 'bin');
const CHUNK = () => CFG.storageChunkBytes || 45 * 1024 * 1024;   // = engine/cloud.js chunkBytes: big files are stored in parts (file.pdf.p000, .p001…)
const chunksOf = x => (x.size > CHUNK() ? Math.ceil(x.size / CHUNK()) : 0);
const partNames = (name, n) => (n ? Array.from({ length: n }, (_, i) => `${name}.p${String(i).padStart(3, '0')}`) : [name]);
const srcDir = (uid, sid, src) => `${uid}/sources/${sid}/${String(src).replace(/[^a-zA-Z0-9_-]/g, '_')}/`;   // = engine/srcfiles.js cloudPath
/** Which packaged source files are in the account's storage with the right size → { ok: [...], missing: [...] } */
async function sourceFileStatus(token, uid, sid, srcs, known = new Map()) {
  const out = { ok: [], missing: [] };
  await Promise.all(srcs.map(async x => {
    if (known.has(x.sha256)) { out.ok.push(x); return; }   // the learner's own file, already in the account (a curriculum's material)
    const want = partNames('file.' + extOf(x.fileName || x.file), chunksOf(x));
    const list = await sb('/storage/v1/object/list/noema-private', token, { method: 'POST', body: { prefix: srcDir(uid, sid, x.id), limit: 1000 } }).catch(() => []);
    const got = want.map(n => (list || []).find(o => o.name === n));
    const total = got.reduce((a, o) => a + Number(o?.metadata?.size || 0), 0);
    (got.every(Boolean) && total === Number(x.size) ? out.ok : out.missing).push(x);
  }));
  return out;
}
async function uploadCommands(token, uid, sid, srcs) {
  const lines = [];
  const sign = async path => { const r = await sb(`/storage/v1/object/upload/sign/noema-private/${path}`, token, { method: 'POST', headers: { 'x-upsert': 'true' } }); return `${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${r.url}`; };
  for (const x of srcs) {
    const base = srcDir(uid, sid, x.id) + 'file.' + extOf(x.fileName || x.file); const n = chunksOf(x); const local = `work/${sid}/${x.file}`;
    if (!n) { lines.push(`# ${x.id} — ${x.fileName || x.file} (${(x.size / 1048576).toFixed(1)} MB)\ncurl -sS -X PUT -H "x-upsert: true" -H "Content-Type: ${x.mime || 'application/octet-stream'}" -H "apikey: ${CFG.supabaseKey}" --data-binary @"${local}" "${await sign(base)}"`); continue; }
    // a big file: the storage takes ≤ 50 MB per object → upload it in ${n} parts (the app joins them again)
    const tmp = `/tmp/noema-${x.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.p`;
    const cmds = [`# ${x.id} — ${x.fileName || x.file} (${(x.size / 1048576).toFixed(1)} MB, in ${n} parts)`, `split -b ${CHUNK()} -d -a 3 "${local}" ${tmp}`];
    const names = partNames(base, n);
    for (let i = 0; i < n; i++) cmds.push(`curl -sS -X PUT -H "x-upsert: true" -H "Content-Type: application/octet-stream" -H "apikey: ${CFG.supabaseKey}" --data-binary @${tmp}${String(i).padStart(3, '0')} "${await sign(names[i])}"`);
    lines.push(cmds.join('\n'));
  }
  return lines.join('\n\n');
}
/** Register the files in the learner's synced index (a:srcfiles:<subject>) so every device shows 👁 for them. */
async function indexSourceFiles(token, uid, sid, srcs, known = new Map()) {
  if (!srcs.length) return;
  const key = 'a:srcfiles:' + sid; const cur = await sb(`/rest/v1/noema_kv?select=value&key=eq.${encodeURIComponent(key)}`, token).catch(() => []);
  let ix = {}; try { ix = JSON.parse(cur?.[0]?.value || '{}'); } catch (e) { }
  const now = new Date().toISOString();
  for (const x of srcs) { const name = x.fileName || String(x.file).split('/').pop(); const ref = known.get(x.sha256); ix[x.id] = { name: extOf(name) === extOf(x.file) ? name : name + '.' + extOf(x.file), type: x.mime || '', size: x.size, sha256: x.sha256, added: now, cloud: true, via: 'claude', ...(ref ? { ref } : chunksOf(x) ? { chunks: chunksOf(x) } : {}) }; }
  await sb('/rest/v1/noema_kv?on_conflict=user_id,key', token, { method: 'POST', body: [{ user_id: uid, key, value: JSON.stringify(ix), updated_at: now }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
}
/** 👥 A step of a shared curriculum is saved → the other participants get it (the pack now; its source files follow when
    the learner's app opens — it publishes them with the step). Somebody else's version that came first stays the shared one. */
async function publishStep(token, uid, step, p, files) {
  const { c, nid } = step, A = apiOf(token), path = CS().core.stepPath(c.id, uid, nid);
  try {
    const cur = await CS().core.row(A, c.id, nid);
    if (cur && cur.author !== uid && (cur.status === 'ready' || Date.parse(cur.claimed_until || '') > Date.now())) return `\n👥 ${cur.author_name || 'Another member'} had already ${cur.status === 'ready' ? 'prepared' : 'started'} this step of the shared curriculum — theirs is the shared version; this one stays in the learner's own account.`;
    await sb(`/storage/v1/object/${CS().BUCKET}/${path}`, token, { method: 'POST', body: JSON.stringify(p), headers: { 'content-type': 'application/json', 'x-upsert': 'true' } });
    const r = await CS().core.ready(A, { cid: c.id, nid, me: uid, name: nameOf(step.user), packId: CUR().packId(c, nid), version: p.version || null, path, meta: { chunks: 0, counts: p.counts || null, sharedFiles: {}, filePaths: [], sourceFiles: files, filesPending: files > 0 } });
    if (!r.ok) return `\n👥 ${r.row?.author_name || 'Another member'} prepared this step a moment earlier — theirs is the shared version; this one stays in the learner's own account.`;
    return `\n👥 Shared: every member of “${c.title || c.goal}” sees this step on their map now.`;
  } catch (e) { return `\n⚠️ Saved for the learner, but sharing it with the curriculum's members failed (${e.message.slice(0, 120)}) — the learner's app tries again when it opens.`; }
}
/** The pack is stored and valid: check its packaged files, then add it to the picker — or say which files to upload. */
async function complete(token, uid, sid, p, res, fail, text, user = null, attach = {}) {
  const need = packaged(p);
  const step = await findStep(token, sid).catch(() => null);   // a step of one of the learner's curricula?
  if (step) step.user = user;
  const known = new Map(step ? Object.entries(step.c.files || {}).filter(([, f]) => f.sha256).map(([fid, f]) => [f.sha256, { subj: CUR().curStore(step.c.id), src: fid }]) : []);
  if (need.length) {
    const st = await sourceFileStatus(token, uid, sid, need, known);
    if (st.missing.length) {
      return fail(`The pack is valid, but ${st.missing.length} of its ${need.length} source file(s) are not in the account yet: ${st.missing.map(x => x.id).join(', ')}.\n` +
        `The learner must get exactly the files the pack was built from (each part of a split PDF), so the subject is NOT saved yet. Upload them — run in your sandbox, from the folder that contains work/ (adjust the paths if your files are elsewhere; they are also inside ${sid}.noema.zip):\n\n` +
        await uploadCommands(token, uid, sid, st.missing) + `\n\nThen call noema_finish_upload with subject_id "${sid}" again.`);
    }
    await indexSourceFiles(token, uid, sid, need, known);
  }
  await register(token, uid, p, res.counts, step ? { curriculum: step.c.id, node: step.nid, curTitle: step.c.title } : {});
  let more = '';
  if (step) {
    await kvPut(token, uid, CJ().inboxKey(step.c.id), { v: 1, kind: 'step', nid: step.nid, packId: sid, version: p.version || null, at: new Date().toISOString(), via: 'claude-app' });
    await releaseStep(token, step.c.id, step.nid).catch(() => { });   // saved: its claim ends (the inbox entry + the subject keep it out of the queue)
    if (sharedOn(step.c)) more += await publishStep(token, uid, step, p, need.length);
    const left = CJ().work(await curState(token, step.c, uid)).steps.length;
    more += `\n🧭 This is the step “${step.c.nodes[step.nid].title}” of the curriculum “${step.c.title}”: it appears ready on the learner's map by itself (the app picks it up when it is open or next opened).` + (left ? `\n${left} more step(s) are queued — call noema_curriculum_task with curriculum_id "${step.c.id}" for the next one, if the learner asked for more.` : '');
  } else if (attach.step) {
    const a = await attachToStep(token, uid, sid, p, attach.curriculum_id, attach.step).catch(e => ({ error: e.message }));
    more += a.error ? `\n⚠️ Saved, but not attached to a step: ${a.error}\n📚 Until then it is on the learner's Shelf.` : '\n' + a.line;
  } else more += `\n📚 It is not on a step of any of the learner's curricula, so it is on their 📚 Shelf (study it from there, or “Put on a map…”). To attach it to a step of a curriculum, call this tool again with curriculum_id and step.`;
  return text(summary(p, res) + (need.length ? `\n📎 ${need.length} source file(s) attached — the learner opens them with 👁 in 📚 Sources, at the cited pages.` : '') + more);
}

/* ---------- curricula (the app's own code: engine/curriculum.js + engine/curjobs.js) ---------- */
const CJ = () => globalThis.NoemaCurJobs, CUR = () => globalThis.NoemaCurriculum, IMGL = () => globalThis.NoemaImgLib, CS = () => globalThis.NoemaCurShare;
/* 👥 shared curricula (docs/CURRICULUM.md §8): the same rules as the app (engine/curshare.js), as this user */
const apiOf = token => (path, o = {}) => sb(path, token, o);
const sharedOn = c => !!(c?.shared && !c.shared.ended && CS());
const nameOf = user => user?.user_metadata?.name || String(user?.email || '').split('@')[0] || '';
const kvRows = async (token, like) => (await sb(`/rest/v1/noema_kv?select=key,value,updated_at&order=key&key=like.${encodeURIComponent(like + '*')}`, token)) || [];
const kvPut = (token, uid, key, value) => sb('/rest/v1/noema_kv?on_conflict=user_id,key', token, { method: 'POST', body: [{ user_id: uid, key, value: JSON.stringify(value), updated_at: new Date().toISOString() }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
async function curricula(token) {
  const out = [];
  for (const r of await kvRows(token, 'a:curriculum:')) { try { const c = JSON.parse(r.value); if (c?.format === 'noema.curriculum/v1' && c.nodes) out.push(c); } catch (e) { } }
  return out.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
}
/** The curriculum as it will be once the app has applied the answers still waiting in the inbox — with its queue as it
    really is: steps whose subject is saved already are prepared, steps claimed by a run that is building them are taken. */
async function curState(token, c, uid = null) {
  const [inbox, claims, packs, remote] = await Promise.all([kvRows(token, `${CJ().IN}${c.id}:`), kvRows(token, `${CJ().CLAIM}${c.id}:`), kvRows(token, `a:packmeta:cur-${c.id.slice(1, 7)}-`),
    sharedOn(c) ? CS().core.rows(apiOf(token), c.id).catch(() => null) : null]);
  return CJ().settle(CJ().merged(c, inbox), { claims, packs, remote, me: uid });
}
/** Claim a step for this run — atomically, so two runs that ask at the same moment never get the same step:
    insert the claim if there is none; else take it over only when it has expired (or force). → true when this run has it */
async function claimStep(token, uid, cid, nid, { force = false, c = null, user = null } = {}) {
  const key = CJ().claimKey(cid, nid), now = new Date().toISOString();
  const value = JSON.stringify({ v: 1, nid, at: now, run: Math.random().toString(36).slice(2, 10) });
  const ins = await sb('/rest/v1/noema_kv?on_conflict=user_id,key', token, { method: 'POST', body: [{ user_id: uid, key, value, updated_at: now }], headers: { Prefer: 'resolution=ignore-duplicates,return=representation' } });
  let mine = Array.isArray(ins) && ins.length > 0;
  if (!mine) {
    const stale = new Date(Date.now() - CJ().LEASE).toISOString();
    const upd = await sb(`/rest/v1/noema_kv?key=eq.${encodeURIComponent(key)}` + (force ? '' : `&updated_at=lt.${encodeURIComponent(stale)}`), token, { method: 'PATCH', body: { value, updated_at: now }, headers: { Prefer: 'return=representation' } });
    mine = Array.isArray(upd) && upd.length > 0;
  }
  // 👥 a shared curriculum: the step is also reserved among its participants (somebody else may have it — then not this one)
  if (mine && sharedOn(c)) {
    const r = await CS().core.claim(apiOf(token), { cid, nid, me: uid, name: nameOf(user), packId: CUR().packId(c, nid) }).catch(() => ({ ok: false }));
    if (!r.ok) { await releaseStep(token, cid, nid).catch(() => { }); return false; }
  }
  return mine;
}
const releaseStep = (token, cid, nid) => sb(`/rest/v1/noema_kv?key=eq.${encodeURIComponent(CJ().claimKey(cid, nid))}`, token, { method: 'DELETE' });
/** 📦 Attach a saved subject to a step of one of the learner's curricula (docs/CURRICULUM.md §9): the app applies it from the
    inbox (Edit.assign) — the step is taught by this subject from then on, and only that step is re-planned to match it. */
async function attachToStep(token, uid, sid, p, cidArg, stepArg) {
  if (!cidArg) return { error: 'curriculum_id is needed with step (see noema_curricula).' };
  const pc = await pickCurriculum(token, cidArg); if (pc.error) return { error: pc.error };
  const c = await curState(token, pc.c, uid), s = String(stepArg).trim().toLowerCase();
  const nid = c.nodes[stepArg] ? stepArg : Object.keys(c.nodes).find(id => c.nodes[id].title.toLowerCase() === s) || Object.keys(c.nodes).find(id => c.nodes[id].title.toLowerCase().includes(s));
  if (!nid) return { error: `No step “${stepArg}” in “${c.title || c.goal}”. Its steps: ${Object.keys(c.nodes).slice(0, 60).map(id => `${id} (“${c.nodes[id].title}”)`).join(', ')}` };
  const no = CUR().Edit?.cannotAssign?.(c, c.nodes[nid]);
  if (no) return { error: no };
  const n = c.nodes[nid]; if (n.pack?.assigned && n.pack.id === sid) return { line: `📦 It already teaches the step “${n.title}” of “${c.title || c.goal}”.` };
  const chs = p.chapters || [];
  await kvPut(token, uid, CJ().inboxKey(c.id), { v: 1, kind: 'assign', nid, packId: sid, from: 'claude', at: new Date().toISOString(), title: p.subject.title, description: String(p.subject.description || '').slice(0, 400), outline: CUR().outlineOf(p),
    sections: chs.flatMap(ch => (ch.sections || []).map(x => x.id)), exercises: chs.reduce((a, ch) => a + (ch.exercises || []).length, 0), chapters: chs.length });
  return { line: `📦 Attached to the step “${n.title}” of “${c.title || c.goal}”: that step is taught by this subject from now on (it is never prepared), and only that step is re-planned to match it${sharedOn(c) ? ' (for this learner only: the curriculum is shared, its other members keep the shared step)' : ''} — the learner's app applies it when it is open or next opened${c.provider === 'claudeapp' ? '; then noema_curriculum_task hands you its new chapter plan' : ''}.` };
}
async function findStep(token, sid) {
  const m = /^cur-([a-z0-9]{1,6})-/.exec(sid); if (!m) return null;
  for (const r of await kvRows(token, 'a:curriculum:c' + m[1])) {
    let c; try { c = JSON.parse(r.value); } catch (e) { continue; }
    const nid = Object.keys(c.nodes || {}).find(id => CUR().packId(c, id) === sid); if (nid) return { c, nid };
  }
  return null;
}
function workLine(c) {
  const w = CJ().work(c); const bits = [];
  if (w.graph) bits.push(`its map is being built (next: ${w.graph === 'dag' ? 'agent 1, the map' : w.graph === 'audit' ? 'agent 1b, the prerequisite check' : 'agent 2, the goal in depth'})`);
  if (w.toPlan.length) bits.push(`${w.toPlan.length} step(s) need their chapter plan`);
  if (w.steps.length) bits.push(`${w.steps.length} step(s) queued to prepare: ${w.steps.slice(0, 5).map(id => '“' + c.nodes[id].title + '”').join(', ')}${w.steps.length > 5 ? '…' : ''}`);
  if (w.claimed.length) bits.push(`${w.claimed.length} step(s) being prepared by another run right now: ${w.claimed.slice(0, 5).map(id => '“' + c.nodes[id].title + '”').join(', ')}${w.claimed.length > 5 ? '…' : ''}`);
  const n = Object.keys(c.nodes).length, ready = Object.values(c.nodes).filter(x => x.pack?.status === 'ready').length;
  const sh = c.shared && !c.shared.ended ? (c.shared.role === 'member' ? ` · 👥 shared by ${c.shared.ownerName || 'its owner'}` : ' · 👥 shared by the learner') : '';
  return `- “${c.title || c.goal}” — curriculum_id ${c.id}${sh} · ${n} steps, ${ready} prepared · made with ${c.provider === 'claudeapp' ? 'the Claude app' : 'noema-lite (API key / Gemini)'}\n  ${bits.length ? 'To do: ' + bits.join('; ') : 'nothing waiting for you'}`;
}
/** How Claude gets one of the learner's files into its sandbox (signed links; big files are stored in parts). */
async function downloadLines(token, uid, dir, downloads, shared = null) {
  const out = [], index = {};
  for (const d of downloads) {
    if (!index[d.store]) { const r = await sb(`/rest/v1/noema_kv?select=value&key=eq.${encodeURIComponent('a:srcfiles:' + d.store)}`, token).catch(() => []); try { index[d.store] = JSON.parse(r?.[0]?.value || '{}'); } catch (e) { index[d.store] = {}; } }
    const meta = index[d.store][d.src];
    const local = `${dir}/${String(d.name).replace(/["$`\\]/g, '_')}`;
    const sf = !meta?.cloud && shared?.[d.src] && /^curfiles-/.test(d.store) ? shared[d.src] : null;   // 👥 a member: the owner's copy in the shared curriculum
    if (sf) {
      const urls = [];
      for (const pth of partNames(sf.path, sf.chunks || 0)) { const r = await sb(`/storage/v1/object/sign/${CS().BUCKET}/${pth}`, token, { method: 'POST', body: { expiresIn: 7200 } }); urls.push(`${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${r.signedURL}`); }
      out.push(`- ${d.name} (${((d.size || sf.size || 0) / 1048576).toFixed(1)} MB${d.pages ? `, ${d.pages} pages` : ''}, from the shared curriculum):\n  mkdir -p "${dir}"\n` + (urls.length === 1 ? `  curl -sSL -o "${local}" "${urls[0]}"` : urls.map((u, i) => `  curl -sSL -o "/tmp/noema-part.${String(i).padStart(3, '0')}" "${u}"`).join('\n') + `\n  cat /tmp/noema-part.* > "${local}" && rm /tmp/noema-part.*`));
      continue;
    }
    if (!meta?.cloud) { out.push(`- ${d.name}: ⚠️ not in the learner's cloud yet (it is uploaded when noema-lite is open on the device where it was added). Ask the learner to attach it to this chat, or build the step without it and say so.`); continue; }
    const base = `${uid}/sources/${d.store}/${String(d.src).replace(/[^a-zA-Z0-9_-]/g, '_')}/file.${extOf(meta.name || d.name)}`;
    const parts = partNames(base, meta.chunks || 0); const urls = [];
    for (const pth of parts) { const r = await sb(`/storage/v1/object/sign/noema-private/${pth}`, token, { method: 'POST', body: { expiresIn: 7200 } }); urls.push(`${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${r.signedURL}`); }
    out.push(`- ${d.name} (${((d.size || meta.size || 0) / 1048576).toFixed(1)} MB${d.pages ? `, ${d.pages} pages` : ''}):\n  mkdir -p "${dir}"\n` + (urls.length === 1 ? `  curl -sSL -o "${local}" "${urls[0]}"` : urls.map((u, i) => `  curl -sSL -o "/tmp/noema-part.${String(i).padStart(3, '0')}" "${u}"`).join('\n') + `\n  cat /tmp/noema-part.* > "${local}" && rm /tmp/noema-part.*`));
  }
  out.push('(The links are valid for 2 hours. If your sandbox cannot reach them, ask the learner to attach the files to this chat.)');
  return out;
}
async function pickCurriculum(token, id) {
  const all = await curricula(token); if (!all.length) return { error: 'This account has no curriculum yet. In noema-lite: 🧭 Curricula → ➕ New curriculum or 📥 Import a map (choose “Claude app” as the AI).' };
  if (id) { const c = all.find(x => x.id === id) || all.find(x => (x.title || x.goal || '').toLowerCase() === String(id).toLowerCase()); return c ? { c } : { error: `No curriculum “${id}”. The learner's curricula:\n${all.map(x => `- ${x.id}: “${x.title || x.goal}”`).join('\n')}` }; }
  const states = await Promise.all(all.map(c => curState(token, c)));
  const busy = states.filter(c => !CJ().work(c).done);
  if (busy.length === 1) return { c: all.find(x => x.id === busy[0].id) };
  return { error: `Which curriculum? Call again with curriculum_id:\n${states.map(workLine).join('\n')}` };
}
const summary = (p, r) => `✅ “${p.subject.title}” (${p.subject.id}) is in the noema-lite account: ${r.counts.chapters} chapters, ${r.counts.sections} sections, ${r.counts.exercises} exercises (${r.counts.visual} visual), ${r.counts.media} pictures.` +
  `\nThe learner's app gets it the next time it opens (or after tapping ☁️ → Sync now).` + (r.warnings.length ? `\n⚠️ Warnings:\n- ${r.warnings.slice(0, 20).join('\n- ')}` : '');

/* ---------- tools ---------- */
const TOOLS = [
  { name: 'noema_whoami', description: 'Which noema-lite account is connected, and its private subject packs.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'noema_authoring_guide', description: 'The noema-lite content contract. READ IT before creating or changing a subject pack: workflow, chapter/section/exercise schema, visual exercises & pictures (sources, web, function graphs), quantities, pack format.',
    inputSchema: { type: 'object', properties: { part: { type: 'string', enum: ['workflow', 'content', 'visual', 'all'], description: 'Default: all' } } }, annotations: { readOnlyHint: true } },
  { name: 'noema_get_toolkit', description: 'Use this when the noema-pack-builder skill is NOT installed: returns the download URL of the same toolkit (scripts: start_subject, pdf_text, extract_images, fetch_image, svgkit, make_pack, unpack + references) and the commands to unpack it in your sandbox. With it you work exactly as the skill describes.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'noema_list_subjects', description: 'Subjects available to this account: the shared library and the user’s own private packs (id, title, size, version).', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'noema_get_pack_url', description: 'A temporary download URL for an existing pack (the user’s private pack, or a library pack) — use it to make ADDITIVE updates (never renumber ids: progress is keyed by them).',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string' } }, required: ['subject_id'] }, annotations: { readOnlyHint: true } },
  { name: 'noema_start_upload', description: 'Step 1 of saving a pack built in your sandbox: returns a signed URL (valid 2 h) and the exact curl command to PUT the pack (work/<id>/build/<id>.json, written by make_pack.py) to it. Then call noema_finish_upload — it also asks for the source files packaged with the pack.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string', description: 'pack.subject.id' } }, required: ['subject_id'] } },
  { name: 'noema_start_source_upload', description: 'Upload ONE original source file (PDF, slides, document… or one part of a split PDF) so the learner can open it inside noema-lite (👁 preview, at the cited page). Normally not needed: noema_finish_upload gives the commands for every source file the pack contains. Use it to add or replace a single file; returns a signed URL + curl command.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string' }, source_id: { type: 'string', description: 'the id in sources.json' }, filename: { type: 'string', description: 'original file name, e.g. ecb-ch5.pdf' } }, required: ['subject_id', 'source_id', 'filename'] } },
  { name: 'noema_finish_upload', description: 'Step 2: checks the uploaded pack and its source files (every file packaged by make_pack.py — each part of a split PDF — must be uploaded, with the right size) and adds it to the user’s subject picker. Returns errors to fix, the upload commands of missing source files (run them, then call it again), or a summary.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string' }, curriculum_id: { type: 'string', description: 'optional, with step: attach the saved subject to this step of one of the learner\'s curricula (it then teaches that step; only that step is re-planned). Without it the subject goes to the learner\'s 📚 Shelf.' }, step: { type: 'string', description: 'optional: the step (id or title) of curriculum_id that this subject teaches' } }, required: ['subject_id'] } },
  { name: 'noema_save_pack', description: 'Save a SMALL pack (≤ 1.5 MB of JSON) passed inline as text. For bigger packs (pictures!) use noema_start_upload + noema_finish_upload.',
    inputSchema: { type: 'object', properties: { pack_json: { type: 'string', description: 'The whole noema-pack JSON document as a string' }, curriculum_id: { type: 'string', description: 'optional, with step: attach the saved subject to this step of one of the learner\'s curricula (it then teaches that step; only that step is re-planned). Without it the subject goes to the learner\'s 📚 Shelf.' }, step: { type: 'string', description: 'optional: the step (id or title) of curriculum_id that this subject teaches' } }, required: ['pack_json'] } },
  { name: 'noema_image_search', description: 'Search pictures for a pack on the whole web and in open collections at once: Bing Images and DuckDuckGo Images (any site — what a Google image search shows too), Wikimedia Commons, Openverse, NASA, iNaturalist, Wellcome Collection, Art Institute of Chicago. Returns candidates (image url, page, size, licence, credit). The packs are for the learner\'s personal study: any licence is fine, the source is recorded. Look at the best ones with noema_image_fetch.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What the picture shows, usually in English (e.g. "DNA replication fork diagram labeled")' }, n: { type: 'integer', description: 'How many (default 12, max 30)' }, sources: { type: 'array', items: { type: 'string', enum: ['bing', 'duckduckgo', 'commons', 'openverse', 'nasa', 'inaturalist', 'wellcome', 'artic'] }, description: 'Only these (default: bing, commons, openverse, duckduckgo)' } }, required: ['query'] }, annotations: { readOnlyHint: true } },
  { name: 'noema_image_fetch', description: 'Get one picture from the web — an image url, OR a page: Wikimedia / Wikipedia file pages (any language, “#/media/File:…”) and any other page are resolved to their picture. Shows you the picture and returns its file url, size (W×H pixels for regions) and a ready media.json entry ("fetch": "app": the noema-lite app downloads and embeds it). Use it when your sandbox cannot download the picture itself (no network to that site) — or simply to look at a candidate.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, media_id: { type: 'string', description: 'the id for media.json (optional)' }, alt: { type: 'string', description: 'what it shows (optional)' } }, required: ['url'] }, annotations: { readOnlyHint: true } },
  { name: 'noema_curricula', description: 'The learner\'s noema-lite curricula (maps of steps, each step becomes a subject) and what is waiting for you in each: building the map, planning the chapters of steps, preparing queued steps as subjects.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'noema_curriculum_task', description: 'The next piece of work on a curriculum, as complete instructions: an agent task of the map (answer with noema_curriculum_submit), a batch of chapter plans (same), or a step to prepare as a subject pack (build it with the noema-pack-builder workflow and save it with noema_start_upload/noema_finish_upload under the given subject_id). A step handed to you is claimed for you: other runs skip it until you save it (or for 4 hours), so each queued step is prepared once — prepare the step you got. When the learner only asks what is next, pass peek = true. Call it again after each accepted answer or saved step.',
    inputSchema: { type: 'object', properties: { curriculum_id: { type: 'string', description: 'from noema_curricula (may be omitted when only one curriculum has work)' }, want: { type: 'string', enum: ['any', 'map', 'plan', 'step'], description: 'only this kind of work (default any: map first, then plans, then queued steps)' }, step: { type: 'string', description: 'prepare this step (id or title) even if it is not queued' }, peek: { type: 'boolean', description: 'true = only SAY what is next (the learner asked what is next, you will not do it now): the step is not claimed, so another run can still take it' }, force: { type: 'boolean', description: 'with step: take over a step that another run claimed but stopped preparing without saving' } } } },
  { name: 'noema_curriculum_submit', description: 'Submit your answer to a map / chapter-plan task from noema_curriculum_task. It is checked exactly as noema-lite checks its own agents; problems come back as a list — fix all of them and submit again. Accepted answers reach the learner\'s app by themselves.',
    inputSchema: { type: 'object', properties: { curriculum_id: { type: 'string' }, task_id: { type: 'string', description: 'the task id given with the task (e.g. "dag", "plan:a,b,c")' }, result_json: { type: 'string', description: 'ONE JSON object matching the task\'s JSON Schema' } }, required: ['curriculum_id', 'task_id', 'result_json'] } },
];

/* ---------- prompts (claude.ai: “+” → noema-lite → Create a subject) ---------- */
const PROMPTS = [{
  name: 'create_subject', title: 'Create a noema-lite subject', description: 'Turn the files attached to this chat into a noema-lite subject pack and save it to your account.',
  arguments: [{ name: 'title', description: 'Subject title, e.g. Human heart anatomy', required: true }, { name: 'language', description: 'Language of the material (en, el, …)', required: false }, { name: 'goal', description: 'exam / understanding / project', required: false }],
  text: a => `Create a noema-lite subject pack from the sources attached to this chat${a.title ? ` — title: "${a.title}"` : ''}${a.language ? `, language: ${a.language}` : ''}${a.goal ? `, goal: ${a.goal}` : ''}.\n` +
    `Use the noema-pack-builder skill if you have it; otherwise call noema_get_toolkit and noema_authoring_guide first. Cover every detail of the sources, include all three kinds of pictures (from the sources, from the web, drawn diagrams / function graphs) with several picture exercises each, put every attached file in the package (if you split a PDF: its parts, each its own source, never the unsplit original too), validate with make_pack.py, and save the pack AND its source files to my noema-lite account with the noema-lite tools (noema_finish_upload asks for the files). Do not ask me questions unless something essential is missing — choose sensible defaults.`,
}, {
  name: 'curriculum_work', title: 'Work on my noema-lite curriculum', description: 'Build the map, plan the chapters and prepare the queued steps of a noema-lite curriculum — with your Claude plan.',
  arguments: [{ name: 'curriculum', description: 'Its name or id (optional when only one curriculum has work)', required: false }, { name: 'steps', description: 'How many steps to prepare in this chat (default 1)', required: false }],
  text: a => `Use the noema-lite connector to work on my noema-lite curriculum${a.curriculum ? ` “${a.curriculum}”` : ''}: build its map and plan the chapters of its steps if that is still open, then prepare ${+a.steps > 1 ? `the next ${+a.steps} queued steps, one after the other` : 'the next queued step'}.\nStart with noema_curricula, then call noema_curriculum_task${a.curriculum ? ` with that curriculum_id` : ''} and follow what it returns; after each accepted answer or saved step call it again. Do not ask me questions — choose sensible defaults.`,
}];

async function callTool(name, args, ctx) {
  const { token, user } = ctx; const uid = user.id; const base = `noema-private/${uid}/packs/`;
  const text = t => ({ content: [{ type: 'text', text: t }] });
  const fail = t => ({ content: [{ type: 'text', text: '❌ ' + t }], isError: true });
  const sid = String(args?.subject_id || '').trim();
  switch (name) {
    case 'noema_whoami': {
      const list = await sb('/storage/v1/object/list/noema-private', token, { method: 'POST', body: { prefix: `${uid}/packs/`, limit: 1000 } }).catch(() => []);
      return text(`Connected to noema-lite as ${user.email || uid}.\nPrivate packs: ${(list || []).filter(o => o.name.endsWith('.json')).map(o => o.name.replace(/\.json$/, '')).join(', ') || '(none yet)'}`);
    }
    case 'noema_authoring_guide': {
      const part = args?.part || 'all';
      const parts = { workflow: DOCS.workflow, content: DOCS.content, visual: DOCS.visual };
      return text(part === 'all' ? Object.values(parts).join('\n\n---\n\n') : parts[part] || DOCS.workflow);
    }
    case 'noema_get_toolkit': {
      const zip = `${CFG.siteUrl.replace(/\/$/, '')}/downloads/noema-pack-builder.zip`;
      return text(`The noema-pack-builder toolkit (same as the skill): ${zip}\n\nIn your sandbox:\ncurl -sSL -o /tmp/npb.zip "${zip}" && cd /tmp && unzip -oq npb.zip && ls /tmp/noema-pack-builder /tmp/noema-pack-builder/scripts\n\nThen follow /tmp/noema-pack-builder/SKILL.md (it is also returned by noema_authoring_guide part "workflow"); scripts are in /tmp/noema-pack-builder/scripts.\nIf the sandbox cannot download it: read noema_authoring_guide (all parts), write the pack JSON yourself (media as data: URIs, or web pictures as {"origin":"web","fetch":"app","url":<direct image url>,"w","h",…} which the app downloads) and save it with noema_save_pack.`);
    }
    case 'noema_list_subjects': {
      const list = await sb('/storage/v1/object/list/noema-private', token, { method: 'POST', body: { prefix: `${uid}/packs/`, limit: 1000 } }).catch(() => []);
      const on = {}; for (const c of await curricula(token).catch(() => [])) for (const [nid, n] of Object.entries(c.nodes || {})) if (n.pack?.id) (on[n.pack.id] = on[n.pack.id] || []).push(`“${n.title}” (${nid}) of “${c.title || c.goal}” (${c.id})`);
      const where = id => on[id] ? ` · teaches ${on[id].slice(0, 4).join(', ')}${on[id].length > 4 ? '…' : ''}` : ' · 📚 on the Shelf (no curriculum step)';
      const mine = (list || []).filter(o => o.name.endsWith('.json')).map(o => `- ${o.name.replace(/\.json$/, '')} (private, ${Math.round((o.metadata?.size || 0) / 1024)} KB)${where(o.name.replace(/\.json$/, ''))}`);
      const lib = (CFG.library || []).map(s => `- ${s.id} — ${s.title} (library: ${s.counts?.chapters || '?'} chapters, ${s.counts?.exercises || '?'} exercises)${s.kind === 'language' || String(s.id).startsWith('lang:') ? '' : where(s.id)}`);
      return text(`Library (shared, read-only — copy into a private pack to extend):\n${lib.join('\n') || '(none)'}\n\nThis user's private packs:\n${mine.join('\n') || '(none yet)'}\n\nA subject teaches a step of a curriculum (the way the learner studies) or waits on their 📚 Shelf; save a pack with curriculum_id + step to put it on a step.`);
    }
    case 'noema_get_pack_url': {
      if (!ID_RE.test(sid)) return fail('subject_id: lowercase letters, digits, hyphens');
      const lib = (CFG.library || []).find(s => s.id === sid);
      if (lib) return text(`Library pack (public): ${CFG.siteUrl.replace(/\/$/, '')}/library/subjects/${sid}/pack.json`);
      const r = await sb(`/storage/v1/object/sign/${base}${sid}.json`, token, { method: 'POST', body: { expiresIn: 3600 } }).catch(e => ({ error: e.message }));
      if (!r?.signedURL) return fail(`No private pack "${sid}" (${r?.error || 'not found'}).`);
      return text(`Download (valid 1 h): ${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${r.signedURL}\ncurl -sSL -o ${sid}.json "<that URL>"`);
    }
    case 'noema_start_upload': {
      if (!ID_RE.test(sid)) return fail('subject_id: lowercase letters, digits, hyphens (it must equal pack.subject.id)');
      if ((CFG.library || []).some(s => s.id === sid)) return fail(`"${sid}" is a library subject id — use a new id (e.g. "${sid}-mine").`);
      const r = await sb(`/storage/v1/object/upload/sign/${base}${sid}.json`, token, { method: 'POST', headers: { 'x-upsert': 'true' } });
      const u = `${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${r.url}`;
      return text(`Upload URL (valid 2 h):\n${u}\n\nRun in your sandbox:\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${CFG.supabaseKey}" --data-binary @work/${sid}/build/${sid}.json "${u}"\n\nThen call noema_finish_upload with subject_id "${sid}" (it gives you the upload commands for the pack's source files). If the sandbox cannot reach the internet, give the user the package ${sid}.noema.zip instead (they import it with 📥 Import subject pack — the source files come with it).`);
    }
    case 'noema_start_source_upload': {
      const src = String(args?.source_id || '').trim(), fname = String(args?.filename || '').trim().split(/[\\/]/).pop();
      if (!ID_RE.test(sid)) return fail('subject_id: lowercase letters, digits, hyphens');
      if (!/^[\w.-]{1,60}$/.test(src) || !fname) return fail('source_id (as in sources.json) and filename are required');
      const ext = ((fname.toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || 'bin');
      const path = `${uid}/sources/${sid}/${src.replace(/[^a-zA-Z0-9_-]/g, '_')}/file.${ext}`;
      const r = await sb(`/storage/v1/object/upload/sign/noema-private/${path}`, token, { method: 'POST', headers: { 'x-upsert': 'true' } });
      const u = `${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${r.url}`;
      // register it in the learner's synced index (a:srcfiles:<subject>) so every device shows 👁 for this source
      const key = 'a:srcfiles:' + sid; const cur = await sb(`/rest/v1/noema_kv?select=value&key=eq.${encodeURIComponent(key)}`, token).catch(() => []);
      let ix = {}; try { ix = JSON.parse(cur?.[0]?.value || '{}'); } catch (e) { }
      ix[src] = { name: fname, type: '', size: 0, added: new Date().toISOString(), cloud: true, via: 'claude' };
      await sb('/rest/v1/noema_kv?on_conflict=user_id,key', token, { method: 'POST', body: [{ user_id: uid, key, value: JSON.stringify(ix), updated_at: new Date().toISOString() }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      return text(`Upload URL for source "${src}" (valid 2 h):\n${u}\n\nRun in your sandbox:\ncurl -sS -X PUT -H "x-upsert: true" -H "apikey: ${CFG.supabaseKey}" --data-binary @"/path/to/${fname}" "${u}"`);
    }
    case 'noema_finish_upload': {
      if (!ID_RE.test(sid)) return fail('bad subject_id');
      let p;
      try { const r = await sb(`/storage/v1/object/authenticated/${base}${sid}.json`, token, { raw: true }); p = JSON.parse(await r.text()); }
      catch (e) { return fail(`No uploaded file found for "${sid}" (${e.message.slice(0, 120)}). Run the curl command from noema_start_upload first.`); }
      const res = checkPack(p, sid);
      if (res.errors.length) return fail(`The pack has ${res.errors.length} error(s) — fix them, rebuild with make_pack.py and upload again:\n- ${res.errors.slice(0, 40).join('\n- ')}`);
      return complete(token, uid, sid, p, res, fail, text, user, { curriculum_id: args?.curriculum_id, step: args?.step });
    }
    case 'noema_save_pack': {
      const raw = String(args?.pack_json || '');
      if (raw.length > MAX_INLINE) return fail(`Too big for inline saving (${Math.round(raw.length / 1024)} KB). Use noema_start_upload + noema_finish_upload.`);
      let p; try { p = JSON.parse(raw); } catch (e) { return fail('pack_json is not valid JSON: ' + e.message); }
      const res = checkPack(p);
      if (res.errors.length) return fail(`${res.errors.length} error(s):\n- ${res.errors.slice(0, 40).join('\n- ')}`);
      if ((CFG.library || []).some(s => s.id === p.subject.id)) return fail(`"${p.subject.id}" is a library subject id — use a new id.`);
      await sb(`/storage/v1/object/${base}${p.subject.id}.json`, token, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-upsert': 'true' } });
      return complete(token, uid, p.subject.id, p, res, fail, text, user, { curriculum_id: args?.curriculum_id, step: args?.step });
    }
    case 'noema_image_search': {
      const q = String(args?.query || '').trim(); if (!q) return fail('query is empty');
      const r = await IMGL().searchImages(q, { n: Math.min(30, Math.max(1, +args?.n || 12)), sources: Array.isArray(args?.sources) ? args.sources : null });
      if (!r.results.length) return fail(`No pictures found for “${q}”${Object.keys(r.errors).length ? ` (unavailable: ${Object.entries(r.errors).map(([k, v]) => k + ': ' + v).join('; ')})` : ''}. Try other words (English often works best), or web_search for pages with pictures.`);
      return text(`${r.results.length} pictures for “${q}” (personal study: any licence is fine — record the source):\n` + r.results.map((x, i) => `${i + 1}. ${x.title ? x.title.slice(0, 90) + ' — ' : ''}${x.w && x.h ? x.w + '×' + x.h + ' · ' : ''}${x.source} · ${x.license || '?'}${x.credit ? ' · ' + String(x.credit).slice(0, 60) : ''}\n   image: ${x.url}\n   page: ${x.page || '—'}`).join('\n') + (Object.keys(r.errors).length ? `\n(unavailable now: ${Object.keys(r.errors).join(', ')})` : '') + `\n\nLook at the best ones with noema_image_fetch (it shows you the picture and gives its size), or download them in your sandbox with fetch_image.py.`);
    }
    case 'noema_image_fetch': {
      const u = String(args?.url || '').trim(); if (!/^https?:\/\//.test(u)) return fail('url must start with http(s)://');
      let p; try { p = await IMGL().fetchPicture(u); } catch (e) { return fail(`Could not get the picture: ${e.message}. Take another candidate (noema_image_search), or give the image file url.`); }
      let show = p; if (p.bytes.byteLength > 3.5e6 || Math.max(p.w, p.h) > 2600) { const pv = IMGL().previewUrl(p.url); show = pv ? await IMGL().fetchPicture(pv).catch(() => null) : null; }
      const small = Math.max(p.w, p.h) < 800, mid = String(args?.media_id || '').trim() || 'web-' + Date.now().toString(36);
      const entry = { id: mid, origin: 'web', fetch: 'app', url: p.url, page: p.page || (u !== p.url ? u : undefined), retrieved: new Date().toISOString().slice(0, 10), w: p.w, h: p.h, alt: String(args?.alt || ''), credit: '…', license: '…' };
      const info = `✅ ${p.mime} ${p.w}×${p.h} px, ${(p.bytes.byteLength / 1048576).toFixed(1)} MB\nfile url: ${p.url}${p.page ? `\nfound on: ${p.page}` : ''}${small ? '\n⚠️ small (< 800 px on the long side): look for a larger version' : ''}\n\nEither download it in your sandbox (python3 scripts/fetch_image.py work/<id> ${mid} "${p.url}" --alt "…" --page "${entry.page || p.url}"), or — if your sandbox cannot reach it — register it in work/<id>/media/media.json WITHOUT a file (the app downloads and embeds it; regions in these W×H pixel coordinates; fill in credit + licence from the page):\n${JSON.stringify(entry)}`;
      const content = [{ type: 'text', text: info }];
      if (show && show.bytes.byteLength <= 3.5e6 && show.mime !== 'image/svg+xml') content.push({ type: 'image', data: Buffer.from(show.bytes).toString('base64'), mimeType: show.mime });
      else content.push({ type: 'text', text: show ? '(an SVG drawing — not shown here)' : '(too large to show here — it is fine for the pack)' });
      return { content };
    }
    case 'noema_curricula': {
      const all = await curricula(token);
      if (!all.length) return text('No curriculum yet. In noema-lite: 🧭 Curricula → ➕ New curriculum or 📥 Import a map, and choose “Claude app (your Claude plan)”.');
      const states = await Promise.all(all.map(c => curState(token, c, uid)));
      return text(`The learner's curricula:\n${states.map(workLine).join('\n')}\n\nCall noema_curriculum_task with a curriculum_id to get the next piece of work.`);
    }
    case 'noema_curriculum_task': {
      const pk = await pickCurriculum(token, String(args?.curriculum_id || '').trim()); if (pk.error) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
      const c = await curState(token, pk.c, uid), force = args?.force === true || args?.force === 'true', peek = args?.peek === true || args?.peek === 'true';
      let t = null;
      for (let tries = 0; tries < 8; tries++) {   // a step is handed out only once it is claimed for this run (another run may claim it a moment earlier → the next one)
        t = CJ().next(c, { want: args?.want || 'any', step: args?.step || '', force });
        if (!t || t.error || t.kind !== 'step') break;
        if (peek) return text(`Next step (not claimed — peek): “${t.stepTitle}” (${t.nid}) · subject_id ${t.packId}. ${CJ().work(c).steps.length} step(s) queued in all. To prepare it, call noema_curriculum_task again without peek.`);
        if (await claimStep(token, uid, c.id, t.nid, { force: force && !!args?.step, c, user })) break;
        if (args?.step) { const x = sharedOn(c) ? await CS().core.row(apiOf(token), c.id, t.nid).catch(() => null) : null; t = { error: x && x.author !== uid ? `“${t.stepTitle}” is ${x.status === 'ready' ? 'prepared' : 'being prepared'} by ${x.author_name || 'another member'} of this shared curriculum — do not prepare it again.` : `“${t.stepTitle}” has just been taken by another run — do not prepare it twice. If that run has stopped without saving it, call again with force = true.` }; break; }
        c.nodes[t.nid].pack = { ...c.nodes[t.nid].pack, claimedAt: new Date().toISOString() }; t = null;
      }
      if (t?.error) return fail(t.error);
      if (!t) {
        const busy = CJ().work(c).claimed;
        return text(`✅ Nothing is waiting in “${c.title || c.goal}”${args?.want && args.want !== 'any' ? ` (${args.want})` : ''}. ` + (busy.length ? `${busy.length} queued step(s) are being prepared by other runs right now (${busy.slice(0, 5).map(id => '“' + c.nodes[id].title + '”').join(', ')}) — do NOT prepare them again; stop here. ` : '') + (CJ().isApp(c) ? 'Steps reach this queue when the learner opens them on the map (or the app queues the next ones ahead). ' : '') + 'To prepare a particular step anyway, call noema_curriculum_task with step = its title.');
      }
      if (t.kind !== 'step') return text(CJ().taskText(c, t, 'connector', { fileLines: t.downloads?.length ? await downloadLines(token, uid, `work/plan-${c.id}`, t.downloads) : [] }));
      const lines = t.downloads.length ? await downloadLines(token, uid, `work/${t.packId}/sources`, t.downloads, sharedOn(c) ? c.shared.files : null) : [];
      return text(CJ().stepText(c, t, { mode: 'connector', fileLines: lines }));
    }
    case 'noema_curriculum_submit': {
      const pk = await pickCurriculum(token, String(args?.curriculum_id || '').trim()); if (pk.error) return fail(pk.error);
      const c = await curState(token, pk.c, uid); const tid = String(args?.task_id || '').trim();
      const t = CJ().byId(c, tid);
      if (!t) return fail(`Task "${tid}" is not open any more (already answered, or the curriculum changed). Call noema_curriculum_task for the current one.`);
      const raw = String(args?.result_json || '');
      let data; try { data = globalThis.NoemaLLM.parseJSON(raw); } catch (e) { return fail('result_json is not valid JSON — send ONE JSON object (no prose around it).'); }
      const errs = CJ().check(c, t, data);
      if (errs.length) return fail(`Your answer has ${errs.length} problem(s) — fix ALL of them and call noema_curriculum_submit again with the complete corrected object:\n- ${errs.slice(0, 40).join('\n- ')}`);
      await kvPut(token, uid, CJ().inboxKey(c.id), { v: 1, kind: t.kind, task: t.id, data, at: new Date().toISOString(), via: 'claude-app' });
      const after = CJ().merged(c, [{ key: CJ().inboxKey(c.id, 'zzzz'), value: JSON.stringify({ kind: t.kind, task: t.id, data }) }]);
      const w = CJ().work(after);
      return text(`✅ Accepted (${t.title}). It reaches the learner's app by itself.\n` + (w.graph || w.toPlan.length ? `Next: call noema_curriculum_task with curriculum_id "${c.id}" — ${w.graph ? 'the next agent of the map' : `${w.toPlan.length} step(s) still need their chapter plan`}.` : w.steps.length ? `The map and all plans are done. ${w.steps.length} step(s) are queued to prepare — call noema_curriculum_task if the learner asked you to prepare steps.` : `The map and all chapter plans are done 🎉. Steps are prepared when the learner sends them to the Claude app from the map (or queues the next ones).`));
    }
  }
  return fail('Unknown tool ' + name);
}

async function handle(m, ctx) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  const isNote = m.id === undefined || m.id === null;
  const ok = result => (isNote ? null : { jsonrpc: '2.0', id: m.id, result });
  try {
    switch (m.method) {
      case 'initialize': {
        const want = m.params?.protocolVersion;
        return ok({ protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'noema-lite', title: 'noema-lite study packs', version: VERSION },
          instructions: 'noema-lite turns study sources into interactive subject packs. Before building a pack, use the noema-pack-builder skill if it is installed; otherwise call noema_get_toolkit (scripts) and noema_authoring_guide (the contract). Save finished packs with noema_start_upload → curl → noema_finish_upload (or noema_save_pack for small ones); noema_finish_upload then asks for the source files packaged with the pack (the PDFs exactly as split) — upload them with the commands it returns and call it again. Pictures: search the whole web with noema_image_search (Bing / DuckDuckGo Images + open collections; any licence is fine for the learner\'s personal study, record the source) and look at / get one with noema_image_fetch (pages and Wikimedia file pages are resolved to the picture). Curricula (maps of steps): noema_curricula shows what is waiting; noema_curriculum_task gives the next task as complete instructions (answer map / plan tasks with noema_curriculum_submit; build a step as a pack with the given subject_id and save it as usual) — call it again after each accepted answer or saved step.' });
      }
      case 'notifications/initialized': case 'notifications/cancelled': return null;
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS });
      case 'tools/call': {
        const t = TOOLS.find(x => x.name === m.params?.name);
        if (!t) return { jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'Unknown tool: ' + m.params?.name } };
        return ok(await callTool(t.name, m.params?.arguments || {}, ctx));
      }
      case 'resources/list': return ok({ resources: [] });
      case 'prompts/list': return ok({ prompts: PROMPTS.map(({ name, title, description, arguments: a }) => ({ name, title, description, arguments: a })) });
      case 'prompts/get': {
        const pr = PROMPTS.find(x => x.name === m.params?.name);
        if (!pr) return { jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'Unknown prompt: ' + m.params?.name } };
        return ok({ description: pr.description, messages: [{ role: 'user', content: { type: 'text', text: pr.text(m.params?.arguments || {}) } }] });
      }
      default: return isNote ? null : { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found: ' + m.method } };
    }
  } catch (e) {
    return isNote ? null : { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: '❌ ' + e.message }], isError: true } };
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return J(PRM);
  if (req.method === 'GET' || req.method === 'DELETE') return new Response('noema-lite MCP endpoint: POST JSON-RPC (Streamable HTTP).', { status: 405, headers: { allow: 'POST', ...CORS } });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: CORS });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const unauth = () => J({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Sign in to noema-lite: authorization required' } }, 401, challenge());
  if (!token) return unauth();
  let user; try { user = await sb('/auth/v1/user', token); } catch (e) { return e.status === 401 || e.status === 403 ? unauth() : J({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Auth check failed: ' + e.message } }, 502); }
  if (!user?.id) return unauth();
  let msg; try { msg = await req.json(); } catch (e) { return J({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const batch = Array.isArray(msg) ? msg : [msg];
  const out = (await Promise.all(batch.map(m => handle(m, { token, user })))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return J(Array.isArray(msg) ? out : out[0]);
}
export { checkPack, TOOLS };
