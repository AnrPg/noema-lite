/* noema-lite MCP connector — lets a user's OWN Claude (claude.ai / Desktop, their own subscription) create
   and update subject packs directly in their noema-lite cloud account. Docs: docs/CLAUDE_CONNECTOR.md

   Transport: MCP Streamable HTTP, stateless, JSON responses (POST /mcp).
   Auth: OAuth 2.1 by Supabase Auth (the user signs in with their noema-lite account and approves on
   /oauth/consent). Every call carries the user's own access token, so Supabase row-level security
   applies exactly as in the app — this function holds NO secret keys.

   tools/build.py (site) prepends `const CFG = {…}; const DOCS = {…};` + engine/packcheck.js and writes dist/functions/mcp.mjs. */

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

async function register(token, uid, p, counts) {
  const meta = { ...p.subject, counts: { ...(p.counts || {}), ...counts }, version: p.version || null, via: 'claude', updatedAt: new Date().toISOString() };
  await sb('/rest/v1/noema_kv?on_conflict=user_id,key', token, { method: 'POST', body: [{ user_id: uid, key: 'a:packmeta:' + p.subject.id, value: JSON.stringify(meta), updated_at: new Date().toISOString() }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
}
const summary = (p, r) => `✅ “${p.subject.title}” (${p.subject.id}) is in the noema-lite account: ${r.counts.chapters} chapters, ${r.counts.sections} sections, ${r.counts.exercises} exercises (${r.counts.visual} visual), ${r.counts.media} pictures.` +
  `\nIt appears in the subject picker the next time the app opens (or after tapping ☁️ → Sync now).` + (r.warnings.length ? `\n⚠️ Warnings:\n- ${r.warnings.slice(0, 20).join('\n- ')}` : '');

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
  { name: 'noema_start_upload', description: 'Step 1 of saving a pack built in your sandbox: returns a signed URL (valid 2 h) and the exact curl command to PUT the .json file to it. Then call noema_finish_upload.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string', description: 'pack.subject.id' } }, required: ['subject_id'] } },
  { name: 'noema_start_source_upload', description: 'Upload an ORIGINAL SOURCE FILE (the PDF, slides, document… the user gave you) so the learner can open it inside noema-lite (👁 preview, jump to the cited page). Call once per file-based source, with the source id used in sources.json; returns a signed URL + curl command. Do it before noema_finish_upload.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string' }, source_id: { type: 'string', description: 'the id in sources.json' }, filename: { type: 'string', description: 'original file name, e.g. ecb-ch5.pdf' } }, required: ['subject_id', 'source_id', 'filename'] } },
  { name: 'noema_finish_upload', description: 'Step 2: checks the uploaded pack and adds it to the user’s subject picker. Returns errors to fix (then upload again) or a summary.',
    inputSchema: { type: 'object', properties: { subject_id: { type: 'string' } }, required: ['subject_id'] } },
  { name: 'noema_save_pack', description: 'Save a SMALL pack (≤ 1.5 MB of JSON) passed inline as text. For bigger packs (pictures!) use noema_start_upload + noema_finish_upload.',
    inputSchema: { type: 'object', properties: { pack_json: { type: 'string', description: 'The whole noema-pack JSON document as a string' } }, required: ['pack_json'] } },
];

/* ---------- prompts (claude.ai: “+” → noema-lite → Create a subject) ---------- */
const PROMPTS = [{
  name: 'create_subject', title: 'Create a noema-lite subject', description: 'Turn the files attached to this chat into a noema-lite subject pack and save it to your account.',
  arguments: [{ name: 'title', description: 'Subject title, e.g. Human heart anatomy', required: true }, { name: 'language', description: 'Language of the material (en, el, …)', required: false }, { name: 'goal', description: 'exam / understanding / project', required: false }],
  text: a => `Create a noema-lite subject pack from the sources attached to this chat${a.title ? ` — title: "${a.title}"` : ''}${a.language ? `, language: ${a.language}` : ''}${a.goal ? `, goal: ${a.goal}` : ''}.\n` +
    `Use the noema-pack-builder skill if you have it; otherwise call noema_get_toolkit and noema_authoring_guide first. Cover every detail of the sources, include all three kinds of pictures (from the sources, from the web, drawn diagrams / function graphs) with several picture exercises each, validate with make_pack.py, and save the pack to my noema-lite account with the noema-lite tools. Do not ask me questions unless something essential is missing — choose sensible defaults.`,
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
      const mine = (list || []).filter(o => o.name.endsWith('.json')).map(o => `- ${o.name.replace(/\.json$/, '')} (private, ${Math.round((o.metadata?.size || 0) / 1024)} KB)`);
      const lib = (CFG.library || []).map(s => `- ${s.id} — ${s.title} (library: ${s.counts?.chapters || '?'} chapters, ${s.counts?.exercises || '?'} exercises)`);
      return text(`Library (shared, read-only — copy into a private pack to extend):\n${lib.join('\n') || '(none)'}\n\nThis user's private packs:\n${mine.join('\n') || '(none yet)'}`);
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
      return text(`Upload URL (valid 2 h):\n${u}\n\nRun in your sandbox:\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${CFG.supabaseKey}" --data-binary @/path/to/${sid}.json "${u}"\n\nThen call noema_finish_upload with subject_id "${sid}". If the sandbox cannot reach the internet, give the user the .json file instead (they import it with 📥 Import subject pack).`);
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
      await register(token, uid, p, res.counts);
      return text(summary(p, res));
    }
    case 'noema_save_pack': {
      const raw = String(args?.pack_json || '');
      if (raw.length > MAX_INLINE) return fail(`Too big for inline saving (${Math.round(raw.length / 1024)} KB). Use noema_start_upload + noema_finish_upload.`);
      let p; try { p = JSON.parse(raw); } catch (e) { return fail('pack_json is not valid JSON: ' + e.message); }
      const res = checkPack(p);
      if (res.errors.length) return fail(`${res.errors.length} error(s):\n- ${res.errors.slice(0, 40).join('\n- ')}`);
      if ((CFG.library || []).some(s => s.id === p.subject.id)) return fail(`"${p.subject.id}" is a library subject id — use a new id.`);
      await sb(`/storage/v1/object/${base}${p.subject.id}.json`, token, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-upsert': 'true' } });
      await register(token, uid, p, res.counts);
      return text(summary(p, res));
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
          instructions: 'noema-lite turns study sources into interactive subject packs. Before building a pack, use the noema-pack-builder skill if it is installed; otherwise call noema_get_toolkit (scripts) and noema_authoring_guide (the contract). Save finished packs with noema_start_upload → curl → noema_finish_upload (or noema_save_pack for small ones).' });
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
