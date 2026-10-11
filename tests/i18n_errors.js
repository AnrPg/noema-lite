/* The error-code contract and the account e-mails (docs/i18n.md §6), in Node — no browser, no network, no real account:
   • engine/cloud.js, engine/llm.js, engine/claude.js, engine/srcfiles.js throw errors with .code/.params whose English catalog
     text is exactly their .message, and NoemaI18n.err() turns them into the UI language;
   • Supabase Auth answers (new error_code, older messages, HTTP status, network) → err.auth.*; the UI language goes to
     user_metadata.locale at sign-up and once per page when it differs;
   • cloud/img/proxy.mjs answers { error: { code, params, message } } to JSON clients and the old plain text to the others;
   • every code of the contract table in docs/i18n.md §6 has an English text (or is listed as shown as the server wrote it);
   • tools/i18n/emails.js: one template per e-mail, Go-template branches per locale, drafts only in the preview set. */
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
cp.execFileSync('node', [path.join(ROOT, 'tools/i18n/build.js')], { stdio: 'ignore' });

/** A window with the i18n runtime and the given engine files; fetch is answered by `route(url, init)`. */
function boot({ languages = ['en'], files = [], route = () => J(404, {}) } = {}) {
  const store = {}, ses = {}, sent = [];
  const storage = o => ({ getItem: k => o[k] ?? null, setItem: (k, v) => { o[k] = String(v); }, removeItem: k => { delete o[k]; } });
  const w = { console: { warn() { }, log() { } }, navigator: { languages, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', maxTouchPoints: 0 }, location: { hostname: 'noema-lite.netlify.app', protocol: 'https:', origin: 'https://noema-lite.netlify.app' },
    localStorage: storage(store), sessionStorage: storage(ses), document: { visibilityState: 'visible', addEventListener() { } }, addEventListener() { }, dispatchEvent() { }, CustomEvent: class { },
    Intl, Promise, Date, Array, Object, JSON, Math, String, Number, Map, Set, Error, TypeError, Blob, Response, Request, Headers, TextDecoder, TextEncoder, URL, URLSearchParams,
    encodeURIComponent, decodeURIComponent, setTimeout: f => { f(); return 0; }, clearTimeout() { }, setInterval() { return 0; } };
  w.window = w; w.NOEMA_CONFIG = {}; w.store = store; w.sent = sent;
  w.fetch = async (url, init = {}) => { sent.push({ url: String(url), init }); const r = await route(String(url), init); if (r instanceof Error) throw r; return r; };
  vm.createContext(w);
  for (const f of ['engine/vendor/intl-messageformat.iife.js', 'engine/i18n/en.js', 'engine/i18n/el.js', 'engine/i18n/ru.js', 'engine/i18n/fr.js', 'engine/i18n.js', ...files]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), w, { filename: f });
  return w;
}
const J = (status, body, headers = {}) => new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const catch_ = async p => { try { await p; return null; } catch (e) { return e; } };
/** The contract: a coded error's English catalog text is its .message (when the code has a catalog entry); codes that classify a
    server's answer keep the server's words in .message (docs/i18n.md §6.1, “server's words”) and show the catalog's words.
    enParams: params as an English reader gets them (a translated nested reason). */
const seen = new Set();
const SERVER_WORDS = new Set(['auth.session_expired', 'auth.server', 'cloud.schema_old', 'cloud.permission', 'cloud.too_large', 'cloud.rate_limit', 'cloud.server']);
function contract(w, e, what, enParams) {
  const I = w.NoemaI18n, code = e && e.code;
  if (!code) return ok(false, what + ': no code (' + (e && e.message) + ')');
  seen.add(code);
  const has = I.has('err.' + code, 'en'), en = has ? I.t('err.' + code, enParams || e.params || {}, 'en') : null;
  if (SERVER_WORDS.has(code)) return ok(has && I.err(e) === I.t('err.' + code, e.params || {}) && I.err(e) !== e.message, `${what}: ${code} → “${I.err(e)}” (.message keeps the server’s “${e.message}”)`);
  ok(en === null ? I.err(e) === e.message : en === e.message, `${what}: ${code} → “${e.message}”${en === null ? ' (no catalog entry: shown as written)' : ''}`);
}

(async () => {
  console.log('Supabase Auth → err.auth.* (engine/cloud.js)');
  let reply = null;
  const w = boot({ languages: ['el'], files: ['engine/cloud.js'], route: (url, init) => reply(url, init) });
  const C = w.NoemaCloud; await C.init({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_test' });
  const signIn = async r => { reply = () => r; return catch_(C.signIn('ana@example.com', 'pw')); };
  let e = await signIn(J(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }));
  contract(w, e, 'error_code invalid_credentials');
  ok(w.NoemaI18n.locale === 'el' && w.NoemaI18n.err(e) === 'Λάθος e-mail ή κωδικός', 'NoemaI18n.err → the UI language (el draft): ' + w.NoemaI18n.err(e));
  e = await signIn(J(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })); contract(w, e, 'an older server (no error_code)');
  e = await signIn(J(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' })); contract(w, e, 'email_not_confirmed');
  reply = () => J(422, { msg: 'User already registered' }); e = await catch_(C.signUp('ana@example.com', 'pw', 'Ana')); contract(w, e, 'sign-up, the test emulator’s answer');
  reply = () => J(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.', weak_password: { reasons: ['length'] } });
  e = await catch_(C.signUp('ana@example.com', 'pw', 'Ana')); contract(w, e, 'weak_password with its minimum'); ok(e.params.min === 6 && /6/.test(w.NoemaI18n.err(e)), 'params.min = 6 → ' + w.NoemaI18n.err(e));
  e = await signIn(J(429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' })); contract(w, e, 'over_email_send_rate_limit');
  e = await signIn(J(429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' })); contract(w, e, 'over_request_rate_limit');
  e = await signIn(J(403, { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' })); contract(w, e, 'otp_expired');
  e = await signIn(J(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })); contract(w, e, 'user_already_exists');
  e = await signIn(J(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }));
  ok(e.code === 'auth.session_expired' && e.message === 'Invalid Refresh Token: Refresh Token Not Found', 'refresh_token_not_found → auth.session_expired, .message unchanged');
  e = await signIn(J(503, '')); ok(e.code === 'auth.server' && e.params.status === 503 && e.message === 'HTTP 503' && /503/.test(w.NoemaI18n.err(e)), 'HTTP 503 → auth.server {status}: ' + w.NoemaI18n.err(e));
  e = await signIn(new TypeError('Failed to fetch')); contract(w, e, 'network failure'); ok(e.network === true, '… still marked .network');
  e = await signIn(J(400, { code: 400, error_code: 'something_new', msg: 'A brand new message' })); contract(w, e, 'an unknown code');
  ok(w.NoemaI18n.err(e) === 'A brand new message', 'an unknown code shows the server’s English message');

  console.log('cloud data → err.cloud.* / err.share.*');
  reply = (url, init) => /token/.test(url) ? J(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { id: 'u1', email: 'ana@example.com', user_metadata: { name: 'Ana', locale: 'el' } } }) : J(200, []);
  await C.signIn('ana@example.com', 'pw');
  reply = () => J(403, { code: '42501', message: 'new row violates row-level security policy' }); e = await catch_(C.kvDelete('x')); contract(w, e, 'row-level security');
  reply = () => J(404, { code: 'PGRST205', message: 'Could not find the table public.noema_kv in the schema cache' }); e = await catch_(C.kvDelete('x')); contract(w, e, 'an older database');
  reply = () => J(500, { message: 'boom' }); e = await catch_(C.kvDelete('x')); contract(w, e, 'a server failure');
  reply = () => new TypeError('Failed to fetch'); e = await catch_(C.kvDelete('x')); contract(w, e, 'offline');
  e = await catch_(C.shareWith('not-an-address', { subject: { id: 's' } }, {})); contract(w, e, 'share: invalid address');
  e = await catch_(C.shareWith('Ana@Example.com', { subject: { id: 's' } }, {})); contract(w, e, 'share: own address');

  console.log('the UI language in user_metadata.locale');
  const w2 = boot({ languages: ['fr'], files: ['engine/cloud.js'], route: (url, init) => reply(url, init) });
  await w2.NoemaCloud.init({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_test' });
  reply = () => J(200, { id: 'u2', email: 'b@example.com', user_metadata: {} });
  await w2.NoemaCloud.signUp('b@example.com', 'pw', 'Bea');
  const up = JSON.parse(w2.sent.find(s => /\/auth\/v1\/signup/.test(s.url)).init.body);
  ok(up.data.locale === 'fr' && up.data.name === 'Bea', 'sign-up sends options.data.locale = the UI language (fr)');
  reply = (url, init) => /token/.test(url) ? J(200, { access_token: 'at2', refresh_token: 'rt2', expires_in: 3600, user: { id: 'u2', email: 'b@example.com', user_metadata: { name: 'Bea' } } }) : J(200, { id: 'u2', user_metadata: { name: 'Bea', locale: 'fr' } });
  await w2.NoemaCloud.signIn('b@example.com', 'pw'); await new Promise(r => setImmediate(r));
  const puts = () => w2.sent.filter(s => /\/auth\/v1\/user$/.test(s.url) && s.init.method === 'PUT');
  ok(puts().length === 1 && JSON.parse(puts()[0].init.body).data.locale === 'fr', 'an account without locale → updateUser({ data: { locale: "fr" } }) once');
  ok(JSON.parse(w2.store['noema1:cloud:session']).user.user_metadata.locale === 'fr', 'the stored session knows it');
  ok(await w2.NoemaCloud.syncLocale() === false && puts().length === 1, 'the same language again → nothing sent');
  await w2.NoemaI18n.use('el'); await new Promise(r => setImmediate(r));
  ok(puts().length === 2 && JSON.parse(puts()[1].init.body).data.locale === 'el', 'the UI language changes → sent once more (el)');

  console.log('AI providers → err.ai.* (engine/llm.js, engine/claude.js)');
  let ai = null;
  const w3 = boot({ languages: ['ru'], files: ['engine/claude.js', 'engine/llm.js', 'engine/srcfiles.js'], route: (url, init) => ai(url, init) });
  const L = w3.NoemaLLM, CL = w3.NoemaClaude;
  e = await catch_(L.json({ acc: 'a1', prompt: 'x', schema: {} })); contract(w3, e, 'no key at all');
  ok(/Claude/.test(w3.NoemaI18n.err(e)) && /[а-я]/.test(w3.NoemaI18n.err(e)), 'in Russian: ' + w3.NoemaI18n.err(e));
  w3.localStorage.setItem('noema-device:anthropicKey:a1', 'sk-ant-' + 'x'.repeat(30)); w3.localStorage.setItem('noema-device:geminiKey:a1', 'g-key');
  const call = o => catch_(L.claudeCall('a1', { model: 'm', system: 's', messages: [], tool: { name: 't', input_schema: {} }, ...o }));
  ai = () => J(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }); contract(w3, await call(), 'Claude 401 (llm.js)');
  ai = () => J(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }); contract(w3, await call(), 'no credit (llm.js)');
  ai = () => J(400, { error: { type: 'invalid_request_error', message: 'max_tokens too large' } }); contract(w3, await call(), 'another Claude error (llm.js)');
  ai = () => new TypeError('Failed to fetch'); contract(w3, await call(), 'Claude unreachable (llm.js)');
  const gem = () => catch_(L.geminiCall('a1', { system: 's', contents: [] }));
  ai = () => J(429, { error: { message: 'quota' } }); contract(w3, await gem(), 'Gemini 429 (quota)');
  ai = () => J(400, { error: { message: 'bad' } }); contract(w3, await gem(), 'another Gemini error');
  contract(w3, await catch_(Promise.resolve().then(() => L.parseJSON('no json here'))), 'not JSON');
  const api = st => { ai = () => J(st, { error: { type: st === 529 ? 'overloaded_error' : 'x', message: st === 402 ? 'Your credit balance is too low' : 'detail ' + st } }); return catch_(CL.api('k', '/v1/models', { retries: 0 })); };
  for (const st of [401, 402, 403, 413, 429, 529, 418]) contract(w3, await api(st), 'Claude API ' + st + ' (claude.js)');
  ai = () => new Response('', { status: 500 }); contract(w3, await catch_(CL.api('k', '/v1/models', { retries: 0 })), 'an empty failure (claude.js)');
  ai = () => new TypeError('Failed to fetch'); contract(w3, await catch_(CL.api('k', '/v1/models', { retries: 0 })), 'Claude unreachable (claude.js)');
  ai = () => new Response('the picture host answered 404', { status: 502, headers: { 'x-error-code': 'img.upstream', 'x-error-params': encodeURIComponent('{"status":404}') } });
  w3.NOEMA_CONFIG.siteUrl = 'https://noema-lite.netlify.app'; w3.NoemaImgLib = null;
  e = await catch_(CL.webImage('https://pics.example.org/a.png')); contract(w3, e, 'a picture through an older /api/img (plain text + headers)', { detail: 'the picture host answered 404' });
  ok(e.message === 'Could not download the picture: the picture host answered 404' && /404/.test(e.params.detail) && /[а-я]/.test(e.params.detail), 'the inner reason is kept in English for Claude and translated for the learner: ' + w3.NoemaI18n.err(e));
  ai = () => J(415, { error: { code: 'img.no_main_picture', params: {}, message: 'this page has no main picture — give the image file url' } });
  e = await catch_(CL.webImage('https://pics.example.org/page')); ok(/no main picture/.test(e.message) && e.params.detail === w3.NoemaI18n.t('err.img.no_main_picture'), 'a picture through /api/img answering JSON');

  console.log('source files and packages → err.files.* (engine/srcfiles.js)');
  w3.JSZip = { loadAsync: async () => { throw new Error('bad zip'); } };
  contract(w3, await catch_(w3.NoemaSrcFiles.readBundle(new Blob(['x']))), 'not a zip');
  w3.JSZip = { loadAsync: async () => ({ file: () => null, files: {} }) };
  contract(w3, await catch_(w3.NoemaSrcFiles.readBundle(new Blob(['x']))), 'no pack.json');
  w3.JSZip = { loadAsync: async () => ({ file: n => n === 'pack.json' ? { name: 'pack.json', async: async () => '{oops' } : null, files: {} }) };
  contract(w3, await catch_(w3.NoemaSrcFiles.readBundle(new Blob(['x']))), 'pack.json broken');
  contract(w3, await catch_(w3.NoemaSrcFiles.put('a1', 's', 'src', { size: 3 * 1024 ** 3, name: 'huge.mp4' })), 'a file too big');

  console.log('the picture service (cloud/img/proxy.mjs): JSON for new clients, the old text for the others');
  const proxy = await import(require('url').pathToFileURL(path.join(ROOT, 'cloud/img/proxy.mjs')).href);
  const req = (q, headers = {}) => proxy.default(new Request('https://noema-lite.netlify.app/api/img' + q, { headers: { origin: 'https://noema-lite.netlify.app', ...headers } }));
  let r = await req('?url=http://127.0.0.1/x.png');
  ok(r.status === 400 && await r.text() === 'this address is not allowed' && r.headers.get('x-error-code') === 'img.blocked', 'plain text as before (+ x-error-code)');
  r = await req('?url=http://127.0.0.1/x.png', { accept: 'image/*, application/json;q=0.5' }); const jb = await r.json();
  ok(r.status === 400 && jb.error.code === 'img.blocked' && jb.error.message === 'this address is not allowed' && jb.error.params && typeof jb.error.params === 'object', 'JSON: { error: { code, params, message } }');
  r = await proxy.default(new Request('https://noema-lite.netlify.app/api/imgsearch', { headers: { origin: 'https://noema-lite.netlify.app', accept: 'application/json' } }));
  ok((await r.json()).error.code === 'img.no_query', 'image search without words → img.no_query');
  r = await proxy.default(new Request('https://noema-lite.netlify.app/api/img?url=x', { headers: { origin: 'https://evil.example', accept: 'application/json' } }));
  const ev = await r.json(); ok(r.status === 403 && ev.error.code === 'img.origin', 'other websites → img.origin');
  ok(w.NoemaI18n.t('err.' + ev.error.code, ev.error.params, 'en') === ev.error.message, 'the English catalog text equals the proxy’s message');

  console.log('the contract table (docs/i18n.md §6)');
  const doc = fs.readFileSync(path.join(ROOT, 'docs/i18n.md'), 'utf8'), at6 = doc.indexOf('## 6.'), end6 = doc.indexOf('\n## ', at6 + 1);
  const sec = doc.slice(at6, end6 > 0 ? end6 : undefined);   // §6 only: later sections have tables of files (`config.js` …), not codes
  const listed = [...sec.matchAll(/^\| `([a-z_]+(?:\.[a-z_]+)+)`/gm)].map(m => m[1]);
  ok(listed.length > 60, listed.length + ' codes in the table');
  const enCat = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n/errors/en.arb'), 'utf8'));
  const noEntry = new Set(['auth.unknown', 'cloud.unknown', 'ai.api']);
  const missing = listed.filter(c => !noEntry.has(c) && enCat['err.' + c] == null);
  ok(!missing.length, 'every listed code has an English text' + (missing.length ? ': missing ' + missing.join(', ') : ''));
  const unlisted = Object.keys(enCat).filter(k => /^err\.(?!ui\.)/.test(k) && !listed.includes(k.slice(4)));
  ok(!unlisted.length, 'every err.* code of the catalog is in the table' + (unlisted.length ? ': ' + unlisted.join(', ') : ''));
  const notSeen = [...seen].filter(c => !listed.includes(c));
  ok(!notSeen.length, 'every code thrown above is in the table' + (notSeen.length ? ': ' + notSeen.join(', ') : ''));

  console.log('the account e-mails (tools/i18n/emails.js)');
  const E = require(path.join(ROOT, 'tools/i18n/emails.js'));
  const prod = E.render(false), prev = E.render(true);
  ok(E.TEMPLATES.length === 6 && Object.keys(prod).length === 12, '6 e-mails (confirm, invite, magic link, change e-mail, reset, reauthentication) + their subjects');
  const balanced = s => (s.match(/\{\{ (if|with|range)\b/g) || []).length === (s.match(/\{\{ end \}\}/g) || []).length;
  ok(Object.values({ ...prod, ...prev }).every(balanced), 'every {{ if }} has its {{ end }}');
  ok(/\{\{ \.ConfirmationURL \}\}/.test(prod['confirm-signup.html']) && /\{\{ \.Email \}\}/.test(prod['confirm-signup.html']) && /\{\{ \.NewEmail \}\}/.test(prod['change-email.html']) && /\{\{ \.Token \}\}/.test(prod['reauthentication.html']), 'Supabase’s variables: ConfirmationURL, Email, NewEmail, Token');
  const draftsOnly = !fs.readdirSync(path.join(ROOT, 'i18n/email')).some(f => /^(el|ru|fr)\.arb$/.test(f));
  ok(!draftsOnly || Object.values(prod).every(s => !/\.Data\.locale/.test(s)), 'production: only reviewed translations (none yet → English only, no branch)');
  ok(/\{\{ \$l := printf "%v" \.Data\.locale \}\}\{\{ if eq \$l "el" \}\}/.test(prev['magic-link.html']) && /\{\{ else if eq \$l "ru" \}\}/.test(prev['magic-link.html']) && /\{\{ else if eq \$l "fr" \}\}/.test(prev['magic-link.html']) && /\{\{ else \}\}\n<div lang="en"/.test(prev['magic-link.html']), 'preview (--drafts): el / ru / fr branches on .Data.locale, English last');
  ok(/Σύνδεση/.test(prev['magic-link.html']) && /Войти/.test(prev['magic-link.html']) && /Se connecter/.test(prev['magic-link.html']) && /<div lang="fr"/.test(prev['magic-link.html']), 'the drafts are in the preview, each block with its lang');
  ok(/\{\{ if eq \$l "el" \}\}Επιβεβαίωσε/.test(prev['confirm-signup.subject.txt']) && !/</.test(prev['confirm-signup.subject.txt']), 'subjects branch too (Supabase templates the subject), plain text');
  ok(!/&lt;|&gt;/.test(prev['change-email.html'].replace(/<!--[\s\S]*?-->/, '')) && /{{ \.Email }} σε {{ \.NewEmail }}/.test(prev['change-email.html']), 'placeholders become Go values, nothing double-escaped');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-mail-'));
  cp.execFileSync('node', [path.join(ROOT, 'tools/i18n/emails.js'), '--out', tmp]); cp.execFileSync('node', [path.join(ROOT, 'tools/i18n/emails.js'), '--drafts', '--out', tmp]);
  ok(fs.readFileSync(path.join(tmp, 'reset-password.html'), 'utf8') === prod['reset-password.html'] && fs.existsSync(path.join(tmp, 'preview/reset-password.html')), 'the command writes the production set and, with --drafts, the preview set');
  let chk = 0; try { cp.execFileSync('node', [path.join(ROOT, 'tools/i18n/emails.js'), '--check'], { stdio: 'ignore' }); } catch (x) { chk = x.status; }
  ok(chk === 0, 'cloud/email/ is up to date with the catalogs (--check)');
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
