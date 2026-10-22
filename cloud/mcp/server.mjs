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

/** The UI locales every accepted vault field is named in (= tools/i18n/icu.js, tools/vault_fields/build_seed.py). */
const VAULT_LOCALES = ['en', 'el', 'ru', 'fr', 'ar-EG', 'de', 'hi', 'zh-Hans', 'zh-Hant', 'ja', 'it', 'es-ES', 'sq', 'pt-PT', 'tr'];

/* ---------- pack checks: engine/packcheck.js (shared with the app), prepended by tools/build.py ---------- */
// tools/pack_rules.json: a pack made with the current toolkit (built since QUALITY.since, or hand-written) must declare
// subject.authoring.rules >= 2 and meet the quality rules (errors: authoring.by claude); older packs keep working (TD-11).
// Packs without the quality rules: only the quantity rules their own authoring.minPerKind asks for.
const checkPack = (p, expectId) => globalThis.NoemaPackCheck.checkPack(p, expectId, { requireQuality: true });

async function register(token, uid, p, counts, extra = {}) {
  const meta = { ...p.subject, counts: { ...(p.counts || {}), ...counts }, version: p.version || null, ...(p.translations ? { contentLocales: Object.keys(p.translations) } : {}), via: 'claude', updatedAt: new Date().toISOString(), ...extra };
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
/* ---------- translations in their own files (docs/i18n.md §10): packs/<id>.tr.<locale>.json beside the pack ---------- */
const PC = () => globalThis.NoemaPackCheck;
const trPath = (uid, sid, loc) => `${uid}/packs/${sid}.tr.${loc}.json`;
const trNamed = p => Object.entries(p?.translations || {}).filter(([, t]) => t && t.file === true).map(([loc]) => loc);
async function signUrl(token, path) { const r = await sb(`/storage/v1/object/upload/sign/noema-private/${path}`, token, { method: 'POST', headers: { 'x-upsert': 'true' } }); return `${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${r.url}`; }
const trCurl = async (token, uid, sid, loc) => `# translation ${loc}\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${CFG.supabaseKey}" --data-binary @work/${sid}/build/${sid}.tr.${loc}.json "${await signUrl(token, trPath(uid, sid, loc))}"`;
/** Every translation the pack names is in the account and matches it → { missing: [loc], bad: ["loc: errors"] } */
async function translationStatus(token, uid, sid, p) {
  const out = { missing: [], bad: [] };
  for (const loc of trNamed(p)) {
    const f = await storageJSON(token, trPath(uid, sid, loc));
    if (!f) { out.missing.push(loc); continue; }
    const r = PC().checkTranslation(f, p); if (r.errors.length) out.bad.push(`${loc}: ${r.errors.slice(0, 6).join('; ')}`);
  }
  return out;
}
/** The pack with its translations inline (a shared copy stands alone). */
async function withTranslations(token, uid, sid, p) {
  const locs = trNamed(p); if (!locs.length) return p;
  const q = { ...p, translations: { ...p.translations } };
  for (const loc of locs) { const f = await storageJSON(token, trPath(uid, sid, loc)); if (f?.chapters) q.translations[loc] = { chapters: f.chapters }; else delete q.translations[loc]; }
  return q;
}
/** What a new pack (subject.authoring.rules >= 2) still needs at the end of its flow: translations and 文A bridges (pack_rules.json "languages"). */
async function languagesTodo(token, p) {
  if (!(Number(p?.subject?.authoring?.rules) >= 2)) return '';
  const want = PC().requiredLocales(p.subject.language || 'en'), have = Object.keys(p.translations || {}).map(x => x.split('-')[0].toLowerCase());
  const br = Object.keys((await kvGet(token, 'a:bridges', {}))[p.subject.id] || {});
  const mt = want.translations.filter(l => !have.includes(l)), mb = want.bridges.filter(l => !br.includes(l));
  return mt.length || mb.length ? `\n🌐 Still to do before this subject's flow ends (every new pack gets them, docs/PIPELINES.md §4b):${mt.length ? ` full translations into ${mt.join(', ')} (translations/<locale>/chNN.json → make_pack.py → noema_finish_upload again, or noema_save_translation)` : ''}${mt.length && mb.length ? ';' : ''}${mb.length ? ` 文A bridges into ${mb.join(', ')} (tools/bridge.py → noema_save_bridge)` : ''}.` : `\n🌐 Translations (${want.translations.join(', ') || '—'}) and 文A bridges (${want.bridges.join(', ')}) are all there.`;
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
  const ts = await translationStatus(token, uid, sid, p);
  if (ts.bad.length) return fail(`The pack is valid, but ${ts.bad.length} of its translations do not match it — fix them (same ids, sections, answers and code as the pack), rebuild with make_pack.py and upload them again:\n- ${ts.bad.join('\n- ')}`);
  if (ts.missing.length) return fail(`The pack is valid, but ${ts.missing.length} of its translations are not in the account yet: ${ts.missing.join(', ')}. The subject is NOT saved yet. Upload them — run in your sandbox, from the folder that contains work/ (make_pack.py wrote them to work/${sid}/build/):\n\n` +
    (await Promise.all(ts.missing.map(loc => trCurl(token, uid, sid, loc)))).join('\n\n') + `\n\nThen call noema_finish_upload with subject_id "${sid}" again.`);
  await register(token, uid, p, res.counts, step ? { curriculum: step.c.id, node: step.nid, curTitle: step.c.title } : {});
  let more = '';
  if (step) {
    await kvPut(token, uid, CJ().inboxKey(step.c.id), { v: 1, kind: 'step', nid: step.nid, packId: sid, version: p.version || null, at: new Date().toISOString(), via: 'claude-app' });
    await releaseStep(token, step.c.id, step.nid).catch(() => { });   // saved: its claim ends (the inbox entry + the subject keep it out of the queue)
    if (sharedOn(step.c)) more += await publishStep(token, uid, step, await withTranslations(token, uid, sid, p), need.length);
    const left = CJ().work(await curState(token, step.c, uid)).steps.length;
    more += `\n🧭 This is the step “${step.c.nodes[step.nid].title}” of the curriculum “${step.c.title}”: it appears ready on the learner's map by itself (the app picks it up when it is open or next opened).` + (left ? `\n${left} more step(s) are queued — call noema_curriculum_task with curriculum_id "${step.c.id}" for the next one, if the learner asked for more.` : '');
  } else if (attach.step) {
    const a = await attachToStep(token, uid, sid, p, attach.curriculum_id, attach.step).catch(e => ({ error: e.message }));
    more += a.error ? `\n⚠️ Saved, but not attached to a step: ${a.error}\n📚 Until then it is on the learner's Shelf.` : '\n' + a.line;
  } else more += `\n📚 It is not on a step of any of the learner's curricula, so it is on their 📚 Shelf (study it from there, or “Put on a map…”). To attach it to a step of a curriculum, call this tool again with curriculum_id and step.`;
  more += await languagesTodo(token, p).catch(() => '');
  return text(summary(p, res) + (need.length ? `\n📎 ${need.length} source file(s) attached — the learner opens them with 👁 in 📚 Sources, at the cited pages.` : '') + (trNamed(p).length ? `\n🌐 Translations: ${trNamed(p).join(', ')}.` : '') + more);
}

/* ---------- curricula (the app's own code: engine/curriculum.js + engine/curjobs.js) ---------- */
const CJ = () => globalThis.NoemaCurJobs, CUR = () => globalThis.NoemaCurriculum, CI = () => globalThis.NoemaCurImport, SP = () => globalThis.NoemaSourcePlan, IMGL = () => globalThis.NoemaImgLib, CS = () => globalThis.NoemaCurShare;
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

/* ---------- language courses through Claude (docs/LANGUAGES.md §10.1): the app's own code (engine/langcore.js, P8 section) ----------
   The record a:langcourse:<id> lists the tasks; the content is the account's langs/<id>.json (written by the app only) or a
   library course on the website (+ the learner's patch langs/<id>.patch.json). Answers go to the inbox a:langin:<id>:<seq>;
   the app checks them again, merges them and empties the inbox. A task handed out is claimed (a:langclaim:<id>:<task>). */
const NL = () => globalThis.NoemaLang;
const LANG_PEERS = {};   // the library courses (D13), fetched once per instance
async function langRecords(token) {
  const out = [];
  for (const r of await kvRows(token, 'a:langcourse:')) { try { const c = JSON.parse(r.value); if (c?.format === NL().LANGJOBS.FORMAT && c.id) out.push(c); } catch (e) { } }
  return out.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
}
const siteFile = rel => CFG.siteUrl.replace(/\/$/, '') + '/' + String(rel).replace(/^\//, '');
async function fetchPack(rel) {
  const r = await fetch(siteFile(rel)); if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  const t = await r.text(); return JSON.parse(t.slice(t.indexOf('] = ') + 4).trim().replace(/;$/, ''));
}
async function langPeers() {
  const out = [];
  for (const m of CFG.languages || []) { if (!LANG_PEERS[m.id]) LANG_PEERS[m.id] = fetchPack(m.path).catch(() => null); const d = await LANG_PEERS[m.id]; if (d) out.push(d); }
  return out;
}
const langPath = (uid, id, ext = 'json') => `${uid}/langs/${id}.${ext}`;
async function storageJSON(token, path) { try { const r = await sb(`/storage/v1/object/authenticated/noema-private/${path}`, token, { raw: true }); return JSON.parse(await r.text()); } catch (e) { return null; } }
/** The course content as the app last saved it (+ for a library course: the learner's patch laid over it). */
async function langContent(token, uid, rec) {
  if (rec.origin === 'library') {
    const m = (CFG.languages || []).find(x => x.id === rec.id); if (!m) throw new Error(`The library course “${rec.id}” is not on this website.`);
    const d = JSON.parse(JSON.stringify(await (LANG_PEERS[m.id] = LANG_PEERS[m.id] || fetchPack(m.path))));
    const patch = await storageJSON(token, langPath(uid, rec.id, 'patch.json'));
    return { data: patch ? NL().langApplyPatch(d, patch) : d, meta: m, patch: !!patch };
  }
  const d = await storageJSON(token, langPath(uid, rec.id));
  if (!d) throw new Error(`The content of “${rec.title}” is not in the cloud yet — open the course once in noema-lite (signed in), then try again.`);
  return { data: d };
}
/** The course as it will be once the app has merged the answers in the inbox — with the queue as it really is (claims). */
async function langState(token, uid, rec, { peers = [] } = {}) {
  const [inbox, claims, content] = await Promise.all([kvRows(token, `${NL().LANGJOBS.IN}${rec.id}:`), kvRows(token, `${NL().LANGJOBS.CLAIM}${rec.id}:`), langContent(token, uid, rec)]);
  const m = NL().langMerged(rec, content.data, inbox, { peers });
  return { rec: NL().langSettle(m.rec, { claims }), data: m.data, content, pending: inbox.length };
}
async function claimLangTask(token, uid, cid, tid, force = false) {
  const key = NL().langClaimKey(cid, tid), now = new Date().toISOString(), value = JSON.stringify({ v: 1, task: tid, at: now });
  const ins = await sb('/rest/v1/noema_kv?on_conflict=user_id,key', token, { method: 'POST', body: [{ user_id: uid, key, value, updated_at: now }], headers: { Prefer: 'resolution=ignore-duplicates,return=representation' } });
  if (Array.isArray(ins) && ins.length) return true;
  const stale = new Date(Date.now() - NL().LANGJOBS.LEASE).toISOString();
  const upd = await sb(`/rest/v1/noema_kv?key=eq.${encodeURIComponent(key)}` + (force ? '' : `&updated_at=lt.${encodeURIComponent(stale)}`), token, { method: 'PATCH', body: { value, updated_at: now }, headers: { Prefer: 'return=representation' } });
  return Array.isArray(upd) && upd.length > 0;
}
const releaseLangTask = (token, cid, tid) => sb(`/rest/v1/noema_kv?key=eq.${encodeURIComponent(NL().langClaimKey(cid, tid))}`, token, { method: 'DELETE' });
function langLine(rec) {
  const w = NL().langWork(rec);
  const bits = [w.queued.length ? `${w.queued.length} task(s) queued: ${w.queued.slice(0, 5).map(t => t.id).join(', ')}${w.queued.length > 5 ? '…' : ''}` : '', w.claimed.length ? `${w.claimed.length} being written by another run: ${w.claimed.slice(0, 5).map(t => t.id).join(', ')}` : ''].filter(Boolean);
  return `- “${rec.title}” — course_id ${rec.id} · ${rec.origin === 'library' ? 'a library course (its refills)' : 'the learner\'s own course'} · ${rec.languages.join(', ')} · ${w.done} task(s) done\n  ${bits.length ? 'To do: ' + bits.join('; ') : 'nothing waiting for you'}`;
}
async function pickLangCourse(token, id) {
  const all = await langRecords(token);
  if (!all.length) return { error: 'This account has no language course made through Claude yet. In noema-lite: 🌍 Languages → ✨ New language course (or ✨ Ask Claude for more sentences on a grammar page).' };
  if (id) { const c = all.find(x => x.id === id) || all.find(x => String(x.title).toLowerCase() === String(id).toLowerCase()); return c ? { rec: c } : { error: `No language course “${id}”. The learner's courses:\n${all.map(x => `- ${x.id}: “${x.title}”`).join('\n')}` }; }
  const busy = all.filter(c => NL().langWork(c).queued.length);
  if (busy.length === 1) return { rec: busy[0] };
  return { error: `Which course? Call again with course_id:\n${all.map(langLine).join('\n')}` };
}
/** How Claude gets the course into its sandbox: a signed link (2 h) to the account's copy — or to a working copy with the
    answers still waiting in the inbox merged in (the connector never writes the course itself). */
async function langFiles(token, uid, st) {
  const sign = async path => `${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${(await sb(`/storage/v1/object/sign/noema-private/${path}`, token, { method: 'POST', body: { expiresIn: 7200 } })).signedURL}`;
  if (st.rec.origin === 'library') {
    const files = [{ url: siteFile(st.content.meta.path), name: 'course.pack.js' }]; if (st.content.meta.profiles) files.push({ url: siteFile(st.content.meta.profiles), name: 'course.profiles.js' });
    if (st.content.patch) files.push({ url: await sign(langPath(uid, st.rec.id, 'patch.json')), name: 'patch.json' });
    return files;
  }
  let path = langPath(uid, st.rec.id);
  if (st.pending) { path = langPath(uid, st.rec.id, 'view.json'); await sb(`/storage/v1/object/noema-private/${path}`, token, { method: 'POST', body: JSON.stringify(st.data), headers: { 'content-type': 'application/json', 'x-upsert': 'true' } }); }
  return [{ url: await sign(path), name: 'course.json' }];
}

/* ---------- §10.2 a whole language in one prompt: the language package (noema.langpack/v1) ----------
   The package is ONE language for ONE course, made in Claude's sandbox (skill noema-language-builder, lang_course.py package),
   uploaded into the learner's own storage langs/<course>.lang-<code>.json, checked here with the app's own code
   (langcore.checkLangPackage) and recorded as a:langpack:<course>:<code> (synced: every device's app applies it). */
/** A course a package can be for: a library course of the website or one of the learner's own (by id or title). */
async function packCourse(token, idArg) {
  const id = String(idArg || '').trim(), low = id.toLowerCase();
  const lib = (CFG.languages || []).find(m => m.id === id || String(m.title || '').toLowerCase() === low);
  if (lib) return { id: lib.id, title: lib.title, origin: 'library', meta: lib };
  const recs = (await langRecords(token)).filter(r => r.origin === 'account');
  const r = recs.find(x => x.id === id || String(x.title).toLowerCase() === low);
  if (r) return { id: r.id, title: r.title, origin: 'account', rec: r };
  const all = [...(CFG.languages || []).map(m => `- ${m.id}: “${m.title}” (library: ${(m.languages || []).join(', ')})`), ...recs.map(x => `- ${x.id}: “${x.title}” (the learner's own: ${(x.languages || []).join(', ')})`)];
  if (!id && all.length === 1) return (CFG.languages || []).length ? packCourse(token, CFG.languages[0].id) : { id: recs[0].id, title: recs[0].title, origin: 'account', rec: recs[0] };
  return { error: `${id ? `No language course “${id}”.` : 'Which course? Call again with course_id.'} The courses:\n${all.join('\n') || '(none)'}` };
}
/** The course a package is checked against: the library course file of the website, or the account course's content —
    WITHOUT the learner's packages (a package adds a language that is new to the course itself). */
async function packBase(token, uid, pc) {
  if (pc.origin === 'library') return JSON.parse(JSON.stringify(await (LANG_PEERS[pc.id] = LANG_PEERS[pc.id] || fetchPack(pc.meta.path))));
  const d = await storageJSON(token, langPath(uid, pc.id));
  if (!d) throw new Error(`The content of “${pc.title}” is not in the cloud yet — open the course once in noema-lite (signed in), then try again.`);
  return d;
}
/** A language code from a code or a name (Persian → fa): the course's profiles of the world's languages, then Intl. */
function langCodeOf(arg, data) {
  const a = String(arg || '').trim(); if (/^[a-z]{2,3}$/.test(a)) return a;
  const low = a.toLowerCase(); if (!low) return null;
  const w = (data?.world?.languages || []).find(l => String(l.name || '').toLowerCase() === low || String(l.code) === low); if (w) return w.code;
  try { const dn = new Intl.DisplayNames(['en'], { type: 'language' }); for (let i = 0; i < 676; i++) { const c = String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26)); if (String(dn.of(c) || '').toLowerCase() === low) return c; } } catch (e) { }
  return null;
}
const packStoragePath = (uid, cid, code) => `${uid}/${NL().langPackPath(cid, code)}`;

/* ---------- tools ---------- */
const TOOLS = [
  { name: 'noema_whoami', description: 'Which noema-lite account is connected, and its private subject packs.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'noema_authoring_guide', description: 'The noema-lite content contract. READ IT before creating or changing a subject pack: workflow, chapter/section/exercise schema, visual exercises & pictures (sources, web, function graphs), quantities, pack format.',
    inputSchema: { type: 'object', properties: { part: { type: 'string', enum: ['workflow', 'content', 'visual', 'languages', 'all'], description: 'Default: all (subject packs). "languages": the binding rules for language courses (docs/LANGUAGE_RULES.md — D19 first: taught through the learner\'s native language, docs/language-packs.md — and how to answer a task)' } } }, annotations: { readOnlyHint: true } },
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
  { name: 'noema_pipeline', description: 'Which content flow is this, and its steps in order (docs/PIPELINES.md). Call it FIRST for any content work: a Roadmap from sources or a goal, one Roadmap step, one subject, an addition, a translation, a language bridge, an import, a language-course task or a new language. action "detect" with the facts of the request gives the flow; "steps" gives each step: what to do, how it is checked (the local command python3 scripts/pipeline.py check …, a connector call, or a judgement) and its doc; "flows" lists every flow. In the sandbox the same steps run with scripts/pipeline.py (start → next → check), which records run.json; never skip a strict step.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['detect', 'steps', 'flows'] }, flow: { type: 'string', description: 'with steps: the flow id (1, 1b, 2 … 8, L1, L2)' },
      facts: { type: 'object', description: 'with detect: what the learner gave and asked', properties: { sources: { type: 'integer', description: 'how many source files' }, topics: { type: 'integer', description: 'how many topics building on each other' }, goal: { type: 'boolean' }, step: { type: 'boolean', description: 'a Roadmap step handed over by noema_curriculum_task' }, queue: { type: 'boolean' }, extend: { type: 'boolean', description: 'material for a subject that exists' }, bridge: { type: 'boolean' }, translate: { type: 'boolean' }, import: { type: 'boolean' }, lang_task: { type: 'boolean' }, new_language: { type: 'boolean' } } } }, required: ['action'] }, annotations: { readOnlyHint: true } },
  { name: 'noema_bridge_guide', description: 'Language help (文A, docs/BRIDGE.md) for students who study a subject in a language that is not their own: a sidecar per pack × native language with the words of the pack in the meaning they have IN it, translated, plus per section the key words and a short preview. Returns the format, the workflow (tools/bridge.py todo → core.json → <native>.json → check → build → noema_save_bridge), the bridges this account already has and the mistakes learners reported in them. Works for any pair of languages (tested: every direction among English, Greek, Russian and Arabic). Read it before writing a bridge.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string', description: 'Optional: only this pack' } } }, annotations: { readOnlyHint: true } },
  { name: 'noema_save_bridge', description: 'Save one built language bridge (format "noema-bridge", made by tools/bridge.py build, ≤ 1.5 MB) to the learner\'s account, for one of their own packs or a library pack. Bridges are usually 50–150 KB: do NOT paste the file — call with subject_id + native only to get an upload command, run it (curl), then call again with the same subject_id + native. bridge_json (inline) is only for small files. It is checked exactly as the app checks it (against the pack: its id, its language, plain text only, no function words); problems come back as a list. On success every device of the learner shows the 文A help for that pack and native language. To publish a draft (status reviewed), change "status" in the file and save it again the same way.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string', description: 'With native and no bridge_json: the pack of the bridge (its "pack") — returns the upload command, or saves the uploaded file' }, native: { type: 'string', description: 'With subject_id: the native language of the bridge (e.g. el, ru, ar)' }, bridge_json: { type: 'string', description: 'Optional, small files only: the whole bridge file as JSON text' } } } },
  { name: 'noema_save_translation', description: 'Save one full translation of a subject (format "noema-translation": the chapters in one language, same ids, sections, answers and code as the pack; make_pack.py writes work/<id>/build/<id>.tr.<locale>.json) to the learner\'s account, beside their pack. Every new pack gets full translations into English, Greek and Russian (minus its own language, docs/PIPELINES.md §4b). Small files: pass translation_json; bigger ones: call with subject_id + locale only to get an upload URL, upload, then call again with the same subject_id + locale. It is checked against the pack exactly as the app checks it; the pack then names the language and every device shows the subject in it.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string', description: 'The subject (pack.subject.id) — one of the learner\'s own packs' }, locale: { type: 'string', description: 'The language of the translation (e.g. el, ru, en)' }, translation_json: { type: 'string', description: 'Optional: the whole translation file as JSON text (≤ 1.5 MB)' } }, required: ['subject_id', 'locale'] } },
  { name: 'noema_image_search', description: 'Search pictures for a pack on the whole web and in open collections at once: Bing Images and DuckDuckGo Images (any site — what a Google image search shows too), Wikimedia Commons, Openverse, NASA, iNaturalist, Wellcome Collection, Art Institute of Chicago. Returns candidates (image url, page, size, licence, credit). The packs are for the learner\'s personal study: any licence is fine, the source is recorded. Look at the best ones with noema_image_fetch.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What the picture shows, usually in English (e.g. "DNA replication fork diagram labeled")' }, n: { type: 'integer', description: 'How many (default 12, max 30)' }, sources: { type: 'array', items: { type: 'string', enum: ['bing', 'duckduckgo', 'commons', 'openverse', 'nasa', 'inaturalist', 'wellcome', 'artic'] }, description: 'Only these (default: bing, commons, openverse, duckduckgo)' } }, required: ['query'] }, annotations: { readOnlyHint: true } },
  { name: 'noema_image_fetch', description: 'Get one picture from the web — an image url, OR a page: Wikimedia / Wikipedia file pages (any language, “#/media/File:…”) and any other page are resolved to their picture. Shows you the picture and returns its file url, size (W×H pixels for regions) and a ready media.json entry ("fetch": "app": the noema-lite app downloads and embeds it). Use it when your sandbox cannot download the picture itself (no network to that site) — or simply to look at a candidate.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, media_id: { type: 'string', description: 'the id for media.json (optional)' }, alt: { type: 'string', description: 'what it shows (optional)' } }, required: ['url'] }, annotations: { readOnlyHint: true } },
  { name: 'noema_curricula', description: 'The learner\'s noema-lite curricula (maps of steps, each step becomes a subject) and what is waiting for you in each: building the map, planning the chapters of steps, preparing queued steps as subjects.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'noema_create_roadmap', description: 'Make a new Roadmap (a curriculum: a map of steps, each step becomes a subject) in the learner\'s noema-lite account from the material the learner gave you — the From-your-sources way (skill §0b): use it when the material is several topics that build on each other, or more than one subject can hold; for ONE coherent topic build one subject pack instead. Read every file first, then send the steps (each with its prerequisites and the files and pages it is made from). It is checked like the app\'s own proposal; then plan the chapters and prepare the steps with noema_curriculum_task.',
    inputSchema: { type: 'object', required: ['plan_json'], properties: {
      plan_json: { type: 'string', description: 'ONE JSON object: { "title": "…", "summary": "…", "steps": [{ "ref": "s1", "title": "…", "summary": "what it covers", "role": "foundation|intro|aspect|subtopic|related|synthesis|application", "prerequisites": ["refs of earlier steps"], "files": ["path/of/file.pdf pp. 12–40", …] }], "files": [{ "path": "path/of/file.pdf", "pages": 120 }] } — "files" lists EVERY file the learner gave you (pages for PDFs); every file must be used by a step, and pages must exist.' },
      language: { type: 'string', description: 'language code of the Roadmap (en, el, fr, de …): the language the learner studies in' },
      learner: { type: 'string', description: 'optional: who the learner is and their goal (one line)' },
      prepare: { type: 'boolean', description: 'default true: every step is queued for you in study order, so noema_curriculum_task hands you first the chapter plans, then the steps one by one (the learner asked you for the whole course). false: only the map — the learner chooses in the app which steps to prepare.' } } } },
  { name: 'noema_curriculum_task', description: 'The next piece of work on a curriculum, as complete instructions: an agent task of the map (answer with noema_curriculum_submit), a batch of chapter plans (same), or a step to prepare as a subject pack (build it with the noema-pack-builder workflow and save it with noema_start_upload/noema_finish_upload under the given subject_id). A step handed to you is claimed for you: other runs skip it until you save it (or for 4 hours), so each queued step is prepared once — prepare the step you got. When the learner only asks what is next, pass peek = true. Call it again after each accepted answer or saved step.',
    inputSchema: { type: 'object', properties: { curriculum_id: { type: 'string', description: 'from noema_curricula (may be omitted when only one curriculum has work)' }, want: { type: 'string', enum: ['any', 'map', 'plan', 'step'], description: 'only this kind of work (default any: map first, then plans, then queued steps)' }, step: { type: 'string', description: 'prepare this step (id or title) even if it is not queued' }, peek: { type: 'boolean', description: 'true = only SAY what is next (the learner asked what is next, you will not do it now): the step is not claimed, so another run can still take it' }, force: { type: 'boolean', description: 'with step: take over a step that another run claimed but stopped preparing without saving' } } } },
  { name: 'noema_lang_courses', description: 'The learner\'s language courses made through Claude (🌍 Languages → ✨ New language course) and the refill queues of library courses, with the tasks waiting in each: the core of a course, a node in a language (words + paradigms + sentences), a grammar realization, a comparison, more sentences with the words the learner knows.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'noema_lang_task', description: 'The next task of a language course, as complete instructions: what to write, the binding rules, the course context, the link to the course file, the checks to run in your sandbox (lang_course.py, validate_lang.py, lang_refcheck.py from the toolkit) and the JSON Schema of the answer. D19 first: the language is taught through each learner\'s native language — neutral texts that name no language outside the course, and on every grammar page a contrast note for each supported native (en el ru fr ar de hi zh ja it es sq pt tr) and the five type notes; R1–R3: notes shown in three sections (the learner\'s own languages first, the languages being learned, the others folded), every note structured (paragraphs, "- " lists, **bold**, "→ " example lines), every word states every parameter of its part of speech (WORD_PARAMETERS.md / wordFeatures). The task is claimed for you (other runs skip it for 4 hours) — write the task you got and answer with noema_lang_submit. peek = true only says what is next.',
    inputSchema: { type: 'object', properties: { course_id: { type: 'string', description: 'from noema_lang_courses (may be omitted when only one course has work)' }, want: { type: 'string', enum: ['any', 'core', 'node', 'function', 'compare', 'refill'], description: 'only this kind of task (default any, in queue order)' }, task: { type: 'string', description: 'this task id (e.g. "node:fd.03:de")' }, peek: { type: 'boolean' }, force: { type: 'boolean', description: 'with task: take over a task another run claimed but stopped writing' } } } },
  { name: 'noema_lang_submit', description: 'Submit your answer to a task from noema_lang_task. It is checked exactly as noema-lite checks it (forms against the paradigm cells, the facade of every word, sentences, the parallel order, the D19 contrast notes …); problems come back as a list — fix all of them and submit again. Accepted answers reach the learner\'s app by themselves.',
    inputSchema: { type: 'object', properties: { course_id: { type: 'string' }, task_id: { type: 'string' }, result_json: { type: 'string', description: 'ONE JSON object matching the task\'s JSON Schema' } }, required: ['course_id', 'task_id', 'result_json'] } },
  { name: 'noema_language_package_guide', description: 'Add a whole new language to one of the learner\'s noema-lite language courses from ONE request (e.g. "add Persian to my polyglot course"): returns the complete instructions — the skill noema-language-builder specialised for this course and language (D19 first: the language is taught through each learner\'s native language — neutral texts that name no language outside the course, and on every grammar page a contrast note for each supported native (en el ru fr ar de hi zh ja it es sq pt tr) and the five type notes, every note structured (R2); R3: the FIRST step maps the word\'s parameters per part of speech, before any word): the playbook\'s steps in order (typology, phenomena and the word-parameter map WORD_PARAMETERS.md, the facade, the foundations, the fields, the core, links, audit; each step as a sub-agent with its audit turn), the batches with the node ids of THIS course, the toolkit and course file links, the checks, a progress file to resume, and the upload (noema_lang_package_start → curl → noema_lang_package_finish). Hours of work in a sandbox that runs long tasks; it cannot be done in a plain chat.',
    inputSchema: { type: 'object', properties: { course_id: { type: 'string', description: 'the course: a library course id (e.g. polyglot-semitic-zh-de) or the learner\'s own course (id or title); may be omitted when there is only one' }, language: { type: 'string', description: 'the language to add: ISO 639 code (fa) or English name (Persian)' } }, required: ['language'] }, annotations: { readOnlyHint: true } },
  { name: 'noema_lang_package_start', description: 'Step 1 of saving a language package (work/<code>.langpack.json, made by lang_course.py package): returns a signed URL (valid 2 h) into the learner\'s private storage and the exact curl command to PUT the package. Then call noema_lang_package_finish.',
    inputSchema: { type: 'object', properties: { course_id: { type: 'string', description: 'the course the package is for (library course id, or the learner\'s own course)' }, language: { type: 'string', description: 'the ISO 639 code of the language in the package' } }, required: ['course_id', 'language'] } },
  { name: 'noema_lang_package_finish', description: 'Step 2: checks the uploaded language package exactly as noema-lite does (every form against its paradigm cells, the facade of every word, sentences, grammar pages, the catalogue of phenomena, the parallel order — and that it fills the course\'s nodes without adding any) and, when it passes, records it in the learner\'s account: the app adds the language to the course on every device. Otherwise it lists every problem — fix them, package again, upload again.',
    inputSchema: { type: 'object', properties: { course_id: { type: 'string' }, language: { type: 'string', description: 'the ISO 639 code' } }, required: ['course_id', 'language'] } },
  { name: 'noema_vault_fields_queue', description: 'The field graph of the noema-lite vault (docs/VAULT.md §Fields: fields of study, each under one or more parents — a DAG, e.g. Medical physics under Physics AND Medicine; top: the ten ISCED-F broad fields b_ed … b_sv; Wikidata ids Q…; fields people proposed u_…). For admins of the app (the person in noema_admins): what waits — fields people PROPOSED (their name in one language, the parents they chose, how many files use them and some titles) and accepted fields still MISSING a name in some UI locale. Then decide with noema_vault_fields_save: accept (with names in every locale and the right parents), merge into an existing field, or reject; and fill the missing names.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: 'How many of each (default 50, max 200)' } } }, annotations: { readOnlyHint: true } },
  { name: 'noema_vault_fields_find', description: 'Find fields of the vault\'s field graph by name (any language, part of a word is enough): id, names, parents, status. Use it to find the ids of parents before noema_vault_fields_save, and to see whether a field already exists (then merge, never duplicate).',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, ids: { type: 'array', items: { type: 'string' }, description: 'Or: these ids (also shows their children)' } } }, annotations: { readOnlyHint: true } },
  { name: 'noema_vault_fields_save', description: 'Change the vault\'s field graph (admins only); everybody sees accepted fields at once. items: [{"id"?, "names"? {locale: name} (ADDED to its names), "aliases"? [other names, abbreviations], "parents"? [ids] (replace) | "add_parents"? [ids], "status"? "accepted"|"rejected", "merge_into"? id (its files and children move there, its names become aliases), "note"?}] — no id: a new accepted field (enrich the graph: missing sub-fields, extra parents). Rules: a short, natural, usual name in EVERY UI locale (' + VAULT_LOCALES.join(' ') + '), as a university of that language names the field (capital first letter where the script has one); every sensible parent (a field may sit in many places) but never a parent below the field; a duplicate of an existing field is merged, not accepted; a proposal that is not a field of study (a course code, a person, junk) is merged into the closest field or rejected.',
    inputSchema: { type: 'object', properties: { items_json: { type: 'string', description: 'The items, a JSON array (≤ 200)' } }, required: ['items_json'] } },
  { name: 'noema_curriculum_submit', description: 'Submit your answer to a map / chapter-plan task from noema_curriculum_task. It is checked exactly as noema-lite checks its own agents; problems come back as a list — fix all of them and submit again. Accepted answers reach the learner\'s app by themselves.',
    inputSchema: { type: 'object', properties: { curriculum_id: { type: 'string' }, task_id: { type: 'string', description: 'the task id given with the task (e.g. "dag", "plan:a,b,c")' }, result_json: { type: 'string', description: 'ONE JSON object matching the task\'s JSON Schema' } }, required: ['curriculum_id', 'task_id', 'result_json'] } },
];

/* ---------- prompts (claude.ai: “+” → noema-lite → Create a subject) ---------- */
const PROMPTS = [{
  name: 'create_subject', title: 'Create a noema-lite subject', description: 'Turn the files attached to this chat into a noema-lite subject pack and save it to your account.',
  arguments: [{ name: 'title', description: 'Subject title, e.g. Human heart anatomy', required: true }, { name: 'language', description: 'Language of the material (en, el, …)', required: false }, { name: 'goal', description: 'exam / understanding / project', required: false }],
  text: a => `Create a noema-lite subject pack from the sources attached to this chat${a.title ? ` — title: "${a.title}"` : ''}${a.language ? `, language: ${a.language}` : ''}${a.goal ? `, goal: ${a.goal}` : ''}.\n` +
    `Call noema_pipeline first (action detect) and follow its steps in order. Use the noema-pack-builder skill if you have it; otherwise call noema_get_toolkit and noema_authoring_guide first. Cover every detail of the sources and follow the quality rules Q1–Q8 (knowledge map per chapter first; self-contained exercises that never point to "Q2", pages or "the source"; every exercise of the sources included in full, a source's own solution taken as correct but explained more deeply, an unsolved one solved and double-checked; all three kinds of table in the theory: a comparative matrix, a summary table, a breakdown across parameters; difficulty about 20/25/55 %; blind solve and review at the end), include all three kinds of pictures (from the sources, from the web, drawn diagrams / function graphs) with several picture exercises each, put every attached file in the package (if you split a PDF: its parts, each its own source, never the unsplit original too), translate every chapter into English, Greek and Russian (those that are not the material's language) and make 文A bridges into English, Greek, Russian and Arabic, everyday words included, validate with make_pack.py, and save the pack AND its source files and translations to my noema-lite account with the noema-lite tools (noema_finish_upload asks for the files; noema_save_bridge for each bridge). Do not ask me questions unless something essential is missing — choose sensible defaults.`,
}, {
  name: 'language_help', title: 'Language help for a noema-lite subject', description: 'Make 文A language help for a subject the learner studies in a language that is not their own: the subject\'s words, in the meaning they have in it, in the learner\'s language — with your Claude plan.',
  arguments: [{ name: 'subject', description: 'The subject (its name or id)', required: true }, { name: 'native', description: 'The learner\'s own language (en, el, ru, ar, …)', required: true }, { name: 'chapters', description: 'Which chapters (default: all, the first ones first)', required: false }],
  text: a => `Make 文A language help for my noema-lite subject${a.subject ? ` “${a.subject}”` : ''} into ${a.native || 'my native language'}${a.chapters ? `, chapters ${a.chapters}` : ''}.\nCall noema_bridge_guide first and follow it exactly: get the pack (noema_get_pack_url), run the toolkit's bridge.py (todo → write bridges/core.json with content words only, their forms, senses as used in THIS subject and cues where a word has two senses → anchor → terms (key words per section) → write bridges/<native>.json with natural translations for a student and a preview per section → check, 0 errors → coverage) chapter by chapter, then build and save it with noema_save_bridge. Also fix the mistakes learners reported (listed by noema_bridge_guide). Do not ask me questions — choose sensible defaults.`,
}, {
  name: 'curriculum_work', title: 'Work on my noema-lite curriculum', description: 'Build the map, plan the chapters and prepare the queued steps of a noema-lite curriculum — with your Claude plan.',
  arguments: [{ name: 'curriculum', description: 'Its name or id (optional when only one curriculum has work)', required: false }, { name: 'steps', description: 'How many steps to prepare in this chat (default 1)', required: false }],
  text: a => `Use the noema-lite connector to work on my noema-lite curriculum${a.curriculum ? ` “${a.curriculum}”` : ''}: build its map and plan the chapters of its steps if that is still open, then prepare ${+a.steps > 1 ? `the next ${+a.steps} queued steps, one after the other` : 'the next queued step'}.\nStart with noema_curricula, then call noema_curriculum_task${a.curriculum ? ` with that curriculum_id` : ''} and follow what it returns; after each accepted answer or saved step call it again. Do not ask me questions — choose sensible defaults.`,
}, {
  name: 'language_course_work', title: 'Write my noema-lite language course', description: 'Work through the tasks of a language course made through Claude (the core, the nodes in each language, grammar, comparisons, refills) — with your Claude plan.',
  arguments: [{ name: 'course', description: 'Its name or id (optional when only one course has work)', required: false }, { name: 'tasks', description: 'How many tasks to do in this chat (default 1)', required: false }],
  text: a => `Use the noema-lite connector to write my noema-lite language course${a.course ? ` “${a.course}”` : ''}: do ${+a.tasks > 1 ? `the next ${+a.tasks} queued tasks, one after the other` : 'the next queued task'}.\nStart with noema_lang_courses, then call noema_lang_task${a.course ? ' with that course_id' : ''} and follow what it returns — follow its binding rules — D19 first: the language is taught through each learner's native language (neutral texts that name no language outside the course; a contrast note for every supported native and type on every grammar page; R2: every note structured — paragraphs, "- " lists, **bold** for the key point, "→ " example lines; R3: every word states every parameter of its part of speech) —, and check every answer in your sandbox with the toolkit (lang_course.py, validate_lang.py, lang_refcheck.py, lang_facade.py lint) before noema_lang_submit; after each accepted answer call noema_lang_task again. Do not ask me questions — choose sensible defaults.`,
}, {
  name: 'add_language', title: 'Add a language to my course', description: 'Build a whole new language for one of your noema-lite language courses (the playbook, run by Claude as sub-agents) and upload it straight into the app — with your Claude plan. Needs a sandbox that runs long tasks.',
  arguments: [{ name: 'language', description: 'The language to add, e.g. Persian', required: true }, { name: 'course', description: 'The course (name or id; optional when there is only one)', required: false }],
  text: a => `Add ${a.language || 'a new language'} to my noema-lite language course${a.course ? ` “${a.course}”` : ''} — the whole language, in full, and upload it to the app when it is done.\nCall noema_language_package_guide${a.course ? ` with course_id "${a.course}" and` : ' with'} language "${a.language || ''}" and follow its instructions exactly — D19 first (the language is taught through each learner's native language: neutral texts that name no language outside the course, a contrast note for every supported native and type on every grammar page, every note structured; R3: first the exhaustive map of the word's parameters per part of speech, before any word) —, every step in order (as sub-agents if you can), every audit turn, every check, the progress file; then package it and save it with noema_lang_package_start → curl → noema_lang_package_finish. Never invent a form. If this environment cannot run long tasks with code execution, tell me what is needed instead of starting. Do not ask me other questions — choose sensible defaults.`,
}];

/* ---------- 文A language bridges (docs/BRIDGE.md): <uid>/bridges/<pack>.<native>.json + the index a:bridges, as the app's engine/bridge.js keeps them ---------- */
const hash36 = s => { let h1 = 0x811c9dc5, h2 = 0; s = String(s); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = (h2 * 31 + c) >>> 0; } return (h1.toString(36) + h2.toString(36)).slice(0, 10); };   // = engine/catalog.js hash36
const bridgeSummary = b => ({ v: hash36(JSON.stringify(b.entries || []) + JSON.stringify(b.sections || {}) + JSON.stringify(b.anchors || [])), status: b.status, coverage: typeof b.coverage === 'number' ? b.coverage : null, everyday: typeof b.everyday === 'number' ? b.everyday : null,
  chapters: (b.chapters || []).length || null, of: b.of || null, previews: Object.values(b.sections || {}).filter(x => x?.preview).length, entries: (b.entries || []).length, at: Date.now(), via: 'claude' });   // = engine/bridge.js summary()
const kvGet = async (token, key, d) => { const r = await sb(`/rest/v1/noema_kv?select=value&key=eq.${encodeURIComponent(key)}`, token).catch(() => []); try { return JSON.parse(r?.[0]?.value ?? 'null') ?? d; } catch (e) { return d; } };
const brUpPath = (uid, pack, nat) => `${uid}/bridges/incoming/${pack}.${nat}.json`;   // uploaded here, live only once checked
/** Put one bridge's summary in a:bridges. The index is one value for every pack, so saves running at the same time
 *  (several agents) could overwrite each other's entry: re-read right before writing, and write again while ours is missing. */
async function indexBridge(token, uid, pack, nat, sum) {
  for (let i = 0; i < 4; i++) {
    const ix = await kvGet(token, 'a:bridges', {}); ix[pack] = { ...(ix[pack] || {}), [nat]: sum }; await kvPut(token, uid, 'a:bridges', ix);
    await new Promise(r => setTimeout(r, 150 + Math.random() * 350));
    const got = (await kvGet(token, 'a:bridges', {}))[pack]?.[nat]; if (got?.v === sum.v && got.status === sum.status) return;
  }
}
async function packFor(token, uid, id) {
  if ((CFG.library || []).some(s => s.id === id)) { const r = await fetch(siteFile(`library/subjects/${id}/pack.json`)).catch(() => null); return r?.ok ? r.json().catch(() => null) : null; }
  return storageJSON(token, `${uid}/packs/${id}.json`);
}

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
      if (part === 'languages') return text(DOCS.languages || 'No language rules in this build.');   // language courses: the binding rules (D1–D21, D19 first) + docs/language-packs.md
      return text(part === 'all' ? Object.values(parts).join('\n\n---\n\n') : parts[part] || DOCS.workflow);
    }
    case 'noema_get_toolkit': {
      const zip = `${CFG.siteUrl.replace(/\/$/, '')}/downloads/noema-pack-builder.zip`;
      return text(`The noema-pack-builder toolkit (same as the skill): ${zip}\n\nIn your sandbox:\ncurl -sSL -o /tmp/npb.zip "${zip}" && cd /tmp && unzip -oq npb.zip && ls /tmp/noema-pack-builder /tmp/noema-pack-builder/scripts\n\nThen follow /tmp/noema-pack-builder/SKILL.md (it is also returned by noema_authoring_guide part "workflow"); scripts are in /tmp/noema-pack-builder/scripts. (A whole new language for a language course: /tmp/noema-pack-builder/LANGUAGE_BUILDER.md — or call noema_language_package_guide.)\nIf the sandbox cannot download it: read noema_authoring_guide (all parts), write the pack JSON yourself (media as data: URIs, or web pictures as {"origin":"web","fetch":"app","url":<direct image url>,"w","h",…} which the app downloads) and save it with noema_save_pack.`);
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
    case 'noema_pipeline': {
      const F = DOCS.pipelineFlows || {}, S = DOCS.pipelineSteps || {}, act = args?.action;
      const show = f => `Flow ${f.id}: ${f.title} — ${f.when}\n\nIn the sandbox: python3 scripts/pipeline.py start ${f.id} work/<id> (then next → check after each step).\n\n` + f.steps.map((id, i) => { const x = S[id] || {}, c = x.check || {};
        return `${i + 1}. ${id} — ${x.title}${x.gate === 'planned' ? ' (planned, not enforced yet)' : x.gate === 'review' ? ' (recorded)' : ''}${x.per ? ' · per chapter' : ''}\n   ${x.what}\n   check: ${c.local || c.run ? `python3 scripts/pipeline.py check work/<id> ${id}` : c.mcp ? `call ${c.mcp}, then pipeline.py done work/<id> ${id} --note "…"` : `${c.manual} → pipeline.py done work/<id> ${id} --note "…"`}${x.doc ? `\n   doc: ${x.doc}` : ''}`; }).join('\n');
      if (act === 'flows') return text(Object.values(F).map(f => `${f.id} · ${f.title} — ${f.when}\n   ${f.steps.join(' → ')}`).join('\n'));
      if (act === 'steps') { const f = F[String(args?.flow || '')]; return f ? text(show(f)) : fail(`unknown flow "${args?.flow}" — flows: ${Object.keys(F).join(', ')}`); }
      if (act === 'detect') {   // the same order as tools/pipeline.py detect
        const x = args?.facts || {}, id = x.new_language ? 'L2' : x.lang_task ? 'L1' : x.import ? '8' : x.bridge ? '6' : x.translate ? '7' : x.extend ? '5' : x.step ? '2' : x.queue ? '3'
          : x.goal && !x.sources ? '1b' : (x.topics || 0) > 1 ? '1' : x.sources || x.goal ? '4' : null;
        return id ? text(show(F[id])) : fail('Say what the learner gave: facts.sources, facts.topics, goal, step, queue, extend, bridge, translate, import, lang_task, new_language.');
      }
      return fail('action: detect, steps or flows');
    }
    case 'noema_bridge_guide': {
      const ix = await kvGet(token, 'a:bridges', {}), reps = (await kvGet(token, 'a:bridgeReports', [])).filter(r => !sid || r.pack === sid);
      const mine = Object.entries(ix).filter(([p]) => !sid || p === sid).flatMap(([p, m]) => Object.entries(m || {}).map(([n, x]) => `- ${p} → ${n}: ${x.entries} words, ${x.coverage == null ? '?' : Math.round(x.coverage * 100) + '%'} of the content words, ${x.chapters || 0}/${x.of || '?'} chapters, ${x.status}`));
      const lib = (CFG.library || []).filter(m => m.bridgeLocales && (!sid || m.id === sid)).map(m => `- ${m.id} (library) → ${Object.entries(m.bridgeLocales).map(([n, x]) => `${n} ${Math.round((x.coverage || 0) * 100)}% ${x.status}`).join(', ')}`);
      return text(`${DOCS.bridge || 'docs/BRIDGE.md is missing in this build.'}\n\n---\n\nThis account's bridges:\n${mine.join('\n') || '(none yet)'}\n\nLibrary bridges:\n${lib.join('\n') || '(none)'}\n\nMistakes learners reported (${reps.length}):\n${reps.slice(-40).map(r => `- ${r.pack} → ${r.native} · ${r.k}#${r.sense} (“${r.form}” in ${r.sid}): ${r.note || '(no note)'}`).join('\n') || '(none)'}`);
    }
    case 'noema_save_translation': {
      const loc = String(args?.locale || '').trim();
      if (!ID_RE.test(sid)) return fail('subject_id: the pack\'s id (lowercase letters, digits, hyphens)');
      if (!/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/.test(loc)) return fail('locale: a language code such as el, ru, en, pt-PT');
      const p = await storageJSON(token, `${uid}/packs/${sid}.json`); if (!p) return fail(`No pack "${sid}" in this account (noema_list_subjects). Save the pack first (noema_finish_upload).`);
      let f, raw = String(args?.translation_json || '');
      if (raw) {
        if (raw.length > MAX_INLINE) return fail(`Too big for inline saving (${Math.round(raw.length / 1024)} KB): call noema_save_translation with subject_id and locale only, for an upload URL.`);
        try { f = JSON.parse(raw); } catch (e) { return fail('translation_json is not valid JSON: ' + e.message); }
      } else {
        f = await storageJSON(token, trPath(uid, sid, loc));
        if (!f) return text(`Upload the translation — run in your sandbox (URL valid 2 h):\n\n${await trCurl(token, uid, sid, loc)}\n\nThen call noema_save_translation with subject_id "${sid}" and locale "${loc}" again.`);
      }
      if (f.locale !== loc) return fail(`The file says locale "${f.locale}", you asked for "${loc}".`);
      const r = PC().checkTranslation(f, p);
      if (r.errors.length) return fail(`${r.errors.length} error(s):\n- ${r.errors.slice(0, 40).join('\n- ')}`);
      if (raw) await sb(`/storage/v1/object/noema-private/${trPath(uid, sid, loc)}`, token, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-upsert': 'true' } });
      const q = { ...p, v: 2, translations: { ...(p.translations || {}), [loc]: { file: true, chapters: f.chapters.length } } };
      await sb(`/storage/v1/object/${base}${sid}.json`, token, { method: 'POST', body: JSON.stringify(q), headers: { 'content-type': 'application/json', 'x-upsert': 'true' } });
      const pm = await kvGet(token, 'a:packmeta:' + sid, null);
      if (pm) await kvPut(token, uid, 'a:packmeta:' + sid, { ...pm, contentLocales: Object.keys(q.translations), updatedAt: new Date().toISOString() });
      return text(`✅ Saved: “${p.subject.title}” in ${loc} — ${f.chapters.length} of ${(p.chapters || []).length} chapters.${r.warnings.length ? `\n${r.warnings.length} warning(s):\n- ${r.warnings.slice(0, 20).join('\n- ')}` : ''}\nThe learner sees the subject in this language when their app is in it.` + await languagesTodo(token, q).catch(() => ''));
    }
    case 'noema_save_bridge': {
      let raw = String(args?.bridge_json || ''); const want = String(args?.native || '').split('-')[0].toLowerCase(), up = !raw && ID_RE.test(sid) && /^[a-z]{2,3}$/.test(want) ? brUpPath(uid, sid, want) : '';
      if (!raw && !up) return fail('Give subject_id + native (e.g. "ru") to get an upload command for the built bridge file, or bridge_json for a small one.');
      if (up) {
        const r = await sb(`/storage/v1/object/authenticated/noema-private/${up}`, token, { raw: true }).catch(() => null);
        raw = r ? await r.text() : '';
        if (!raw) return text(`Upload the bridge — run in your sandbox (URL valid 2 h):\n\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${CFG.supabaseKey}" --data-binary @${want}.bridge.json "${await signUrl(token, up)}"\n\n(${want}.bridge.json = the file tools/bridge.py build wrote.) Then call noema_save_bridge with subject_id "${sid}" and native "${want}" again.`);
      }
      if (raw.length > MAX_INLINE) return fail(`Too big (${Math.round(raw.length / 1024)} KB > 1.5 MB): build it per native language, and keep notes short.`);
      let b; try { b = JSON.parse(raw); } catch (e) { return fail((up ? 'The uploaded file' : 'bridge_json') + ' is not valid JSON: ' + e.message); }
      if (up && (b.pack !== sid || String(b.native).split('-')[0].toLowerCase() !== want)) return fail(`The uploaded file is the bridge ${b.pack} → ${b.native}, not ${sid} → ${want}. Upload the right file and call again.`);
      const C = globalThis.NoemaPackCheck.checkBridge;
      const first = C(b); if (first.errors.length) return fail(`${first.errors.length} error(s):\n- ${first.errors.slice(0, 40).join('\n- ')}`);
      if (!ID_RE.test(String(b.pack))) return fail('pack: not a subject id');
      const pack = await packFor(token, uid, b.pack); if (!pack) return fail(`No pack "${b.pack}" in this account or the library (noema_list_subjects).`);
      const res = C(b, pack); if (res.errors.length) return fail(`${res.errors.length} error(s):\n- ${res.errors.slice(0, 40).join('\n- ')}`);
      const nat = String(b.native).split('-')[0].toLowerCase();
      await sb(`/storage/v1/object/noema-private/${uid}/bridges/${b.pack}.${nat}.json`, token, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-upsert': 'true' } });
      await indexBridge(token, uid, b.pack, nat, bridgeSummary(b));
      if (up) await sb('/storage/v1/object/noema-private', token, { method: 'DELETE', body: { prefixes: [up] } }).catch(() => null);
      const c = res.counts || {};
      const mins = PC().LANGS.bridgeCoverage || {}, low = [typeof b.coverage === 'number' && b.coverage < mins.all ? `the content words ${Math.round(b.coverage * 100)}% < ${Math.round(mins.all * 100)}%` : '', typeof b.everyday === 'number' && b.everyday < mins.everyday ? `the everyday words ${Math.round(b.everyday * 100)}% < ${Math.round(mins.everyday * 100)}%` : ''].filter(Boolean);
      return text(`✅ Saved: 文A ${b.pack} → ${nat} (${b.status}) — ${(b.entries || []).length} words${typeof b.coverage === 'number' ? `, ${Math.round(b.coverage * 100)}% of the content words` : ''}${typeof b.everyday === 'number' ? `, ${Math.round(b.everyday * 100)}% of the everyday ones` : ''}${low.length ? ` ⚠️ below the minimum for a new pack (${low.join('; ')}): add the words bridge.py todo lists, build and save again` : ''}${c.anchors ? `, ${c.anchors} anchors` : ''}.${res.warnings.length ? `\n${res.warnings.length} warning(s):\n- ${res.warnings.slice(0, 20).join('\n- ')}` : ''}\nThe learner sees it on the pack's sections after the next sync (reload the app).`);
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
    case 'noema_create_roadmap': {
      let d; try { d = globalThis.NoemaLLM.parseJSON(String(args?.plan_json || '')); } catch (e) { return fail('plan_json is not valid JSON — send ONE JSON object (no prose around it).'); }
      const r = SP().fromClaude(d);
      if (r.errors) return fail(`Your Roadmap has ${r.errors.length} problem(s) — fix ALL of them and call noema_create_roadmap again with the complete corrected object:\n- ${r.errors.slice(0, 40).join('\n- ')}`);
      const lang = String(args?.language || 'en').trim().toLowerCase();
      if (!CUR().LANG[lang]) return fail(`Unknown language "${lang}". Use one of: ${Object.keys(CUR().LANG).join(', ')}`);
      const c = CI().record(r.parsed, { title: String(d.title).slice(0, 120), language: lang, learner: String(args?.learner || '').slice(0, 400), provider: 'claudeapp' });
      for (const [nid, f] of Object.entries(r.chat)) if (c.nodes[nid]) c.nodes[nid].chatFiles = f;
      if (args?.prepare !== false && args?.prepare !== 'false') { const t0 = Date.now(); CUR().order(c).forEach((nid, i) => { const n = c.nodes[nid]; n.pack = { id: CUR().packId(c, nid), status: 'app', queuedAt: new Date(t0 + i).toISOString(), error: null, auto: false }; n.reviewed = new Date(t0).toISOString(); }); }
      c.fromSources = { at: new Date().toISOString(), via: 'connector' }; if (r.plan.summary) c.summary = String(r.plan.summary).slice(0, 400);
      await kvPut(token, uid, 'a:curriculum:' + c.id, c);
      const n = Object.keys(c.nodes).length;
      return text(`✅ The Roadmap “${c.title}” (${c.id}) is in the learner's noema-lite account: ${n} steps, ${c.edges.length} ${c.edges.length === 1 ? 'link' : 'links'}. It appears under Roadmaps the next time the app syncs.\nNext: call noema_curriculum_task with curriculum_id "${c.id}" — first the chapter plans of its steps, then ${args?.prepare === false || args?.prepare === 'false' ? 'the steps the learner queues in the app' : 'every step in study order (all are queued for you)'}, one subject each, from the files of this chat.`);
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
    case 'noema_lang_courses': {
      const all = await langRecords(token);
      if (!all.length) return text('No language course made through Claude yet. In noema-lite: 🌍 Languages → ✨ New language course, and choose “Claude app”.');
      const states = await Promise.all(all.map(async r => { try { return (await langState(token, uid, r)).rec; } catch (e) { return r; } }));
      return text(`The learner's language courses:\n${states.map(langLine).join('\n')}\n\nCall noema_lang_task with a course_id to get the next task.`);
    }
    case 'noema_lang_task': {
      const pk = await pickLangCourse(token, String(args?.course_id || '').trim()); if (pk.error) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
      const peek = args?.peek === true || args?.peek === 'true', force = args?.force === true || args?.force === 'true';
      const want = args?.want && args.want !== 'any' ? 'lang.' + args.want : 'any';
      let st; try { st = await langState(token, uid, pk.rec); } catch (e) { return fail(e.message); }
      let t = null;
      for (let tries = 0; tries < 8; tries++) {
        t = NL().langNext(st.rec, { want, task: String(args?.task || '').trim(), force });
        if (!t || t.error) break;
        if (peek) return text(`Next task (not claimed — peek): ${t.id} (${t.kind}). ${NL().langWork(st.rec).queued.length} task(s) queued in all. To write it, call noema_lang_task again without peek.`);
        if (await claimLangTask(token, uid, st.rec.id, t.id, force && !!args?.task)) break;
        if (args?.task) { t = { error: `“${t.id}” has just been taken by another run — do not write it twice. If that run stopped, call again with force = true.` }; break; }
        t.claimedAt = new Date().toISOString(); t = null;
      }
      if (t?.error) return fail(t.error);
      if (!t) { const busy = NL().langWork(st.rec).claimed; return text(`✅ Nothing is waiting in “${st.rec.title}”${want !== 'any' ? ` (${args.want})` : ''}. ` + (busy.length ? `${busy.length} task(s) are being written by other runs right now (${busy.slice(0, 5).map(x => x.id).join(', ')}) — do NOT write them again; stop here.` : 'The learner queues more in the app (✨ Through Claude, 🌙 night queue, ✨ more sentences).')); }
      const peers = t.kind === NL().LANGJOBS.KIND.core ? await langPeers() : [];
      const files = await langFiles(token, uid, st);
      const lib = (CFG.languages || [])[0];
      return text(NL().langTaskText(st.rec, st.data, t, { mode: 'connector', files, peers, libraryUrl: lib ? siteFile(lib.path) : '' }));
    }
    case 'noema_lang_submit': {
      const pk = await pickLangCourse(token, String(args?.course_id || '').trim()); if (pk.error) return fail(pk.error);
      const tid = String(args?.task_id || '').trim();
      let st; try { st = await langState(token, uid, pk.rec); } catch (e) { return fail(e.message); }
      const t = NL().langTaskById(st.rec, tid);
      if (!t) return fail(`Task "${tid}" is not open any more (already answered, or not queued). Call noema_lang_task for the current one.`);
      let data; try { data = globalThis.NoemaLLM ? globalThis.NoemaLLM.parseJSON(String(args?.result_json || '')) : JSON.parse(String(args?.result_json || '')); } catch (e) { return fail('result_json is not valid JSON — send ONE JSON object (no prose around it).'); }
      const errs = NL().checkLangAnswer(st.rec, st.data, t, data, { peers: t.kind === NL().LANGJOBS.KIND.core ? await langPeers() : [] });
      if (errs.length) return fail(`Your answer has ${errs.length} problem(s) — fix ALL of them (validate_lang.py in your sandbox shows them too) and call noema_lang_submit again with the complete corrected object:\n- ${errs.slice(0, 40).join('\n- ')}`);
      await kvPut(token, uid, NL().langInboxKey(st.rec.id), { v: 1, kind: t.kind, task: t.id, data, at: new Date().toISOString(), via: 'claude-app' });
      await releaseLangTask(token, st.rec.id, t.id).catch(() => { });
      const after = NL().langMerged(st.rec, st.data, [{ key: NL().langInboxKey(st.rec.id, 'zzzz'), value: JSON.stringify({ task: t.id, data }) }]);
      const w = NL().langWork(after.rec);
      return text(`✅ Accepted (${t.id}). It reaches the learner's app by itself (merged into the course when noema-lite is open).\n` + (w.queued.length ? `${w.queued.length} task(s) still queued — call noema_lang_task with course_id "${st.rec.id}" if the learner asked for more.` : 'Nothing else is queued in this course 🎉.'));
    }
    case 'noema_language_package_guide': {
      const pc = await packCourse(token, args?.course_id); if (pc.error) return pc.error.startsWith('Which') ? text(pc.error) : fail(pc.error);
      let data; try { data = await packBase(token, uid, pc); } catch (e) { return fail(e.message); }
      const code = langCodeOf(args?.language, data); if (!code) return fail(`“${args?.language}”: give the language's ISO 639 code (e.g. fa for Persian).`);
      if ((data.course.languages || []).includes(code)) return fail(`${code} is already a language of “${pc.title}” — nothing to add.`);
      const prof = (data.world?.languages || []).find(l => l.code === code);
      let name = prof?.name; if (!name) { try { name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code); } catch (e) { } }
      const files = pc.origin === 'library' ? [{ url: siteFile(pc.meta.path), name: 'course.pack.js' }, ...(pc.meta.profiles ? [{ url: siteFile(pc.meta.profiles), name: 'course.profiles.js' }] : [])]
        : [{ url: `${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${(await sb(`/storage/v1/object/sign/noema-private/${langPath(uid, pc.id)}`, token, { method: 'POST', body: { expiresIn: 7200 } })).signedURL}`, name: 'course.json' }];
      const have = await sb(`/rest/v1/noema_kv?select=key&key=eq.${encodeURIComponent(NL().langPackKey(pc.id, code))}`, token).catch(() => []);
      return text(NL().langPackageGuide(data, code, { name: name || code, typ: prof?.typology || null, toolkitUrl: siteFile('downloads/noema-language-builder.zip'), files }) +
        (have?.length ? `\n\n(The learner already has a package for ${code} in this course: a new upload replaces it.)` : ''));
    }
    case 'noema_lang_package_start': {
      const pc = await packCourse(token, args?.course_id); if (pc.error) return fail(pc.error);
      const code = String(args?.language || '').trim(); if (!/^[a-z]{2,3}$/.test(code)) return fail('language: the ISO 639 code of the language in the package (2–3 small letters, e.g. fa)');
      const r = await sb(`/storage/v1/object/upload/sign/noema-private/${packStoragePath(uid, pc.id, code)}`, token, { method: 'POST', headers: { 'x-upsert': 'true' } });
      const u = `${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1${r.url}`;
      return text(`Upload URL for the ${code} package of “${pc.title}” (valid 2 h; the learner's private storage):\n${u}\n\nRun in your sandbox:\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${CFG.supabaseKey}" --data-binary @work/${code}.langpack.json "${u}"\n\nThen call noema_lang_package_finish with course_id "${pc.id}" and language "${code}".`);
    }
    case 'noema_lang_package_finish': {
      const pc = await packCourse(token, args?.course_id); if (pc.error) return fail(pc.error);
      const code = String(args?.language || '').trim(); if (!/^[a-z]{2,3}$/.test(code)) return fail('language: the ISO 639 code');
      const path = packStoragePath(uid, pc.id, code);
      let raw; try { const r = await sb(`/storage/v1/object/authenticated/noema-private/${path}`, token, { raw: true }); raw = await r.text(); }
      catch (e) { return fail(`No uploaded package for ${code} in “${pc.title}” (${e.message.slice(0, 120)}). Run the curl command from noema_lang_package_start first.`); }
      let pkg; try { pkg = JSON.parse(raw); } catch (e) { return fail('The uploaded file is not JSON — upload work/' + code + '.langpack.json as made by lang_course.py package.'); }
      if (pkg?.code !== code) return fail(`The uploaded package is for “${pkg?.code}”, not “${code}”.`);
      let data; try { data = await packBase(token, uid, pc); } catch (e) { return fail(e.message); }
      const peers = (await langPeers()).filter(d => d?.course?.id !== pc.id);
      const errs = NL().checkLangPackage(data, pkg, { peers });
      if (errs.length) return fail(`The package has ${errs.length} problem(s) — it is NOT added to the course (the file stays private and the next upload replaces it). Fix ALL of them in work/lang/${pc.id}, run the checks, package it again (lang_course.py package), upload it again (noema_lang_package_start → curl) and call noema_lang_package_finish again:\n- ${errs.join('\n- ')}`);
      const words = Object.values(pkg.lexicon || {}).reduce((a, f) => a + (f.lexemes || []).length, 0), absent = Object.values(pkg.lexicon || {}).reduce((a, f) => a + (f.absent || []).length, 0);
      const rec = { v: 1, course: pc.id, code, name: pkg.name, path: NL().langPackPath(pc.id, code), size: raw.length, built: pkg.built || null, checks: pkg.checks || null,
        counts: { nodes: Object.keys(pkg.lexicon || {}).length, words, absent, grammar: Object.keys(pkg.grammar || {}).length, sentences: (pkg.bank || []).length, phenomena: (pkg.phenomena?.phenomena || []).length }, at: new Date().toISOString(), via: 'claude' };
      await kvPut(token, uid, NL().langPackKey(pc.id, code), rec);
      return text(`✅ ${pkg.name} (${code}) is in the learner's noema-lite account for “${pc.title}”: ${words} words (${absent} absent) in ${rec.counts.nodes} nodes, ${rec.counts.grammar} grammar pages, ${rec.counts.sentences} sentences, ${rec.counts.phenomena} phenomena.` +
        `\nThe app adds it to the course by itself on every device the next time the course opens: a lane in ⫴ parallel lanes, a chip, a row on the course home (⋮ › ${pkg.name} › Remove this language takes it away again).` +
        `\nTell the learner what was written, what is absent, and what a native speaker should still check (work/${code}-native-check.md).`);
    }
    case 'noema_vault_fields_queue': {
      const lim = Math.max(1, Math.min(200, +args?.limit || 50));
      const q = await sb('/rest/v1/rpc/noema_vault_fields_queue', token, { method: 'POST', body: { locales: VAULT_LOCALES, lim } }).catch(e => ({ error: e.message }));
      if (q?.error) return fail(/admins only/.test(q.error) ? 'Only the app\'s admins (table noema_admins, docs/VAULT.md §Fields) review the vault\'s fields; this account is not one.' : q.error);
      return text(`Vault fields: ${q.counts.accepted} accepted, ${q.counts.proposed} proposed, ${q.counts.untranslated} accepted ones missing a name in some locale.\n` +
        `Every locale: ${VAULT_LOCALES.join(' ')}. Decide with noema_vault_fields_save (find parents with noema_vault_fields_find).\n\nPROPOSED:\n${JSON.stringify(q.proposed, null, 1)}\n\nMISSING NAMES:\n${JSON.stringify(q.untranslated)}`);
    }
    case 'noema_vault_fields_find': {
      const sel = 'select=id,names,parents,status,aliases';
      const ids = (Array.isArray(args?.ids) ? args.ids : []).map(String).filter(x => /^(Q\d+|b_[a-z]{2}|u_[0-9a-f]{12})$/.test(x)).slice(0, 50);
      if (ids.length) {
        const [rows, kids] = await Promise.all([sb(`/rest/v1/noema_vault_fields?${sel}&id=in.(${ids.join(',')})`, token), sb(`/rest/v1/noema_vault_fields?select=id,names->>en&parents=ov.{${ids.join(',')}}&status=eq.accepted&limit=300`, token)]);
        return text(JSON.stringify({ fields: rows, children: kids }));
      }
      const w = String(args?.query || '').trim().replace(/[*,()"\\]/g, ' ').trim().slice(0, 60);
      if (w.length < 2) return fail('query: at least 2 letters (or ids)');
      const or = ['en', 'el', 'ru', 'fr', 'de', 'es-ES', 'it'].map(l => `names->>${l}.ilike.*${w}*`).join(',');
      const rows = await sb(`/rest/v1/noema_vault_fields?${sel}&or=(${encodeURIComponent(or)},id.eq.${encodeURIComponent(w)})&limit=40`, token);
      return text(rows.length ? JSON.stringify(rows) : 'No field has that name (in en el ru fr de es it). Try another word, or another language.');
    }
    case 'noema_vault_fields_save': {
      let items; try { items = JSON.parse(String(args?.items_json || '')); } catch { return fail('items_json is not valid JSON — send ONE JSON array.'); }
      if (!Array.isArray(items) || !items.length || items.length > 200) return fail('items_json: an array of 1 to 200 items');
      const lacks = items.filter(it => !it.merge_into && it.status !== 'rejected' && (it.status === 'accepted' || !it.id) && VAULT_LOCALES.some(l => !String(it.names?.[l] || '').trim())).map(it => it.id || it.names?.en || '?');
      if (lacks.length) return fail(`An accepted field needs its name in every UI locale (${VAULT_LOCALES.join(' ')}); missing in: ${lacks.slice(0, 20).join(', ')}.`);
      const r = await sb('/rest/v1/rpc/noema_vault_fields_save', token, { method: 'POST', body: { items } }).catch(e => ({ error: e.message }));
      if (r?.error) return fail(r.error.replace(/^Supabase \d+: /, '') + '\nNothing was saved (all or nothing): fix it and send all items again.');
      return text(`✅ Saved ${r.saved.length} field(s): ${r.saved.join(', ')}. Everybody sees accepted fields at once. Call noema_vault_fields_queue for what still waits.`);
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
          instructions: 'noema-lite turns study sources into interactive subject packs. A pile of material that is several topics building on each other (or more than one subject can hold) becomes a Roadmap instead: noema_create_roadmap, then noema_curriculum_task. For any content work call noema_pipeline first (action detect): it names the flow and its steps in order, each with its check. Before building a pack, use the noema-pack-builder skill if it is installed; otherwise call noema_get_toolkit (scripts) and noema_authoring_guide (the contract). Every chapter follows the quality rules Q1–Q8 of the contract: an exhaustive knowledge map first (map/chNN.json), self-contained exercises (never "Q2", pages or "the source" in the text; the origin goes in "cite"), every exercise of the sources included in full (a source\'s own solution taken as correct but explained more deeply; an unsolved one solved and double-checked), all three kinds of table in the theory (compare, summary, breakdown), then a blind solve and review (review/chNN.json). Every new pack also gets full translations into English, Greek and Russian (those that are not its own language) and 文A bridges into English, Greek, Russian and Arabic with the everyday words too. Save finished packs with noema_start_upload → curl → noema_finish_upload (or noema_save_pack for small ones); noema_finish_upload then asks for the source files packaged with the pack (the PDFs exactly as split) and its translation files — upload them with the commands it returns and call it again; noema_save_translation adds a translation later, noema_save_bridge each bridge. Pictures: search the whole web with noema_image_search (Bing / DuckDuckGo Images + open collections; any licence is fine for the learner\'s personal study, record the source) and look at / get one with noema_image_fetch (pages and Wikimedia file pages are resolved to the picture). Curricula (maps of steps): noema_curricula shows what is waiting; noema_curriculum_task gives the next task as complete instructions (answer map / plan tasks with noema_curriculum_submit; build a step as a pack with the given subject_id and save it as usual) — call it again after each accepted answer or saved step. Language courses: noema_lang_courses → noema_lang_task → noema_lang_submit (check every answer with the toolkit first); every language is taught through the learner\'s native language (D19): neutral texts, contrast notes for every supported native and type. A whole new language for a course ("add Persian to my course"): noema_language_package_guide gives the complete instructions; save the package with noema_lang_package_start → curl → noema_lang_package_finish.' });
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
