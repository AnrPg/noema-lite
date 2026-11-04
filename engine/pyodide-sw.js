/* noema-lite · the service worker of the Python runtime py-module@1 (docs/INTERACTIVE_PYTHON.md, docs/adr/001 D7).
   Registered by engine/src/37_activity_py.js with the scope /vendor/pyodide/ only (the script needs the response header
   Service-Worker-Allowed: /vendor/ because it lives in /engine/). It controls nothing of the app: only the hidden, script-less
   loader page /vendor/pyodide/__loader.html, whose fetch() the app uses to read the pinned files. So:
     · cache-first for every file the manifest pins (/vendor/pyodide/<version>/… and /vendor/pywheels/…);
     · a file from the network is cached only when its sha256 is the manifest's; a mismatch is answered 502 and never cached;
     · anything under the scope that the manifest does not pin is refused (404) — no other file can be fetched through here;
     · the manifest itself: network first, the cached copy when offline;
     · on activate, cached files that the current manifest no longer names are deleted (an update of the pinned version).
   Requests outside /vendor/pyodide/ and /vendor/pywheels/ are not touched. */
'use strict';
/* i18n-ignore-start */   // code and protocol names: no text for learners
const CACHE = 'noema-py-v1';
const ME = new URL(self.location.href);
const MANIFEST = new URL(ME.searchParams.get('manifest') || '/vendor/pyodide/manifest.json', ME).pathname;
const SCOPES = ['/vendor/pyodide/', '/vendor/pywheels/'];
const LOADER = '/vendor/pyodide/__loader.html';
let MAN = null;   // { path → sha256 } of the manifest last seen

const hex = async buf => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('');
const TYPES = { js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm', json: 'application/json', zip: 'application/zip', whl: 'application/zip' };
const typeOf = p => TYPES[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
const fail = (status, why) => new Response(why, { status, headers: { 'content-type': 'text/plain', 'x-noema-error': why } });

/** the manifest's pinned files as { pathname: sha256 } */
function pinsOf(m) {
  const pins = {};
  if (!m || m.format !== 'noema.pyodide-manifest/v1') return pins;
  for (const [f, v] of Object.entries(m.files || {})) pins[m.base + f] = v.sha256;
  for (const w of Object.values(m.wheels || {})) pins[m.wheelsBase + w.file] = w.sha256;
  return pins;
}
async function manifest(fresh) {
  const url = new URL(MANIFEST, ME.origin).href, c = await caches.open(CACHE);
  if (fresh || !MAN) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) { const m = await r.clone().json(); await c.put(url, r); MAN = pinsOf(m); return { pins: MAN, response: () => c.match(url) }; }
    } catch (e) { /* offline: the cached copy */ }
    const hit = await c.match(url);
    if (hit) MAN = pinsOf(await hit.clone().json());
  }
  return { pins: MAN || {}, response: () => c.match(url) };
}

async function pinned(url) {
  const { pins } = await manifest(false);
  const want = pins[url.pathname];
  if (!want) return fail(404, 'not-pinned');
  const c = await caches.open(CACHE);
  const hit = await c.match(url.href);
  if (hit) return hit;
  let r;
  try { r = await fetch(url.href, { cache: 'no-cache', credentials: 'omit' }); } catch (e) { return fail(504, 'offline'); }
  if (!r.ok) return fail(r.status === 404 ? 404 : 502, 'http-' + r.status);
  const buf = await r.arrayBuffer();
  if (await hex(buf) !== want) return fail(502, 'integrity');
  const res = new Response(buf, { headers: { 'content-type': typeOf(url.pathname), 'content-length': String(buf.byteLength), 'x-noema-sha256': want } });
  await c.put(url.href, res.clone());
  return res;
}

/** the loader page: no scripts can run in it (its own policy); the app only calls its fetch() so that the requests come from a
    document this worker controls. */
const loaderPage = () => new Response('<!doctype html><meta charset="utf-8"><title>noema python files</title>', {
  headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; connect-src 'self'; frame-ancestors 'self'", 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

self.addEventListener('install', e => { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await self.clients.claim();
    const names = await caches.keys();
    for (const n of names) if (n.startsWith('noema-py-') && n !== CACHE) await caches.delete(n);
    try {   // drop files that the current manifest no longer pins (a new Pyodide version)
      const { pins } = await manifest(true); if (!Object.keys(pins).length) return;
      const c = await caches.open(CACHE), man = new URL(MANIFEST, ME.origin).href;
      for (const req of await c.keys()) { const p = new URL(req.url).pathname; if (req.url !== man && !pins[p]) await c.delete(req); }
    } catch (x) { }
  })());
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== ME.origin || e.request.method !== 'GET' || !SCOPES.some(s => url.pathname.startsWith(s))) return;   // not ours: as usual
  if (url.pathname === LOADER) return e.respondWith(loaderPage());
  if (url.pathname === MANIFEST) return e.respondWith(manifest(true).then(m => m.response()).then(r => r || fail(504, 'offline')));
  e.respondWith(pinned(url).catch(() => fail(500, 'sw')));
});
/* i18n-ignore-end */
