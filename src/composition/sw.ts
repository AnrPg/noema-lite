/* noema-lite — the ONE service worker of the site (/sw.js, scope /). Built by tools/esbuild.mjs into build/sw.js; tools/build.py
   writes the site's /sw.js as `self.NOEMA_SW = { version, shell }` + this bundle, so every deploy is a new worker.

   What it does:
     · the app shell (index.html, the scripts and styles the page loads, the UI catalogs, the manifest and icons): precached on
       install into noema-shell-<build hash>, answered from there (navigations to the app get the cached index.html: offline
       after the first visit). A new deploy installs a new worker, which takes over at once (as a new deploy without a worker
       did: an open tab of the older build is told so — build/pwa.js shows "update ready" — and engine/curjobs.js App.stale
       still reloads it before it touches the cloud inbox);
     · packs and data (/library/…, /data/…): network first, the last copy when offline (noema-data);
     · any other same-origin file the app loads later (fonts, vendor libraries, lazy scripts): cache first, into
       noema-rt-<build hash>, so it is versioned with the shell;
     · never cached: other origins (Supabase, Gemini, Google Fonts, …), /build.json (how a tab learns it is old), the
       connector and the functions (/mcp, /api/…, /.well-known/…, /oauth/…, /.netlify/…) and any Supabase path;
     · the Python files of py-module@1 (docs/INTERACTIVE_PYTHON.md, docs/adr/001 D7):
       cache first for every file the manifest /vendor/pyodide/manifest.json pins, a network copy kept only when its sha256
       is the manifest's (else 502, never cached), anything else under /vendor/pyodide/ or /vendor/pywheels/ refused (404),
       the manifest itself network first, and the hidden script-less loader page /vendor/pyodide/__loader.html, whose fetch()
       src/runtimes/py-module/runner.ts uses to read the pinned files through this worker;
     · on activate: every noema-* cache of another build is deleted; Python files the current manifest no longer pins too.
   On `npm run dev` the prelude is { version: 'dev', shell: [] }: only the Python part works, everything else goes to the
   network, so a reload always shows the code as it is. */

interface SwConfig {
  readonly version: string;
  readonly shell: readonly string[];
}
interface PyManifest {
  readonly format?: string;
  readonly base?: string;
  readonly wheelsBase?: string;
  readonly files?: Readonly<Record<string, { readonly sha256: string }>>;
  readonly wheels?: Readonly<Record<string, { readonly file: string; readonly sha256: string }>>;
}
type Pins = Readonly<Record<string, string>>;

const sw = globalThis as unknown as ServiceWorkerGlobalScope & { NOEMA_SW?: SwConfig };
const CFG: SwConfig = sw.NOEMA_SW ?? { version: 'dev', shell: [] };
const ORIGIN = sw.location.origin;
const SHELL = `noema-shell-${CFG.version}`;
const RUNTIME = `noema-rt-${CFG.version}`;
const DATA = 'noema-data-v1';
const PY = 'noema-py-v1'; // the same name src/runtimes/py-module/runner.ts reads when no worker is there
const KEEP = new Set([SHELL, RUNTIME, DATA, PY]);
const at = (p: string): string => new URL(p, ORIGIN + '/').href;
const SHELL_URLS = new Set(CFG.shell.map(at));
const INDEX = at('index.html');

/* ---------- what is never touched ---------- */
const NEVER = [
  /^\/build\.json$/,
  /^\/mcp(\/|$)/,
  /^\/api\//,
  /^\/\.well-known\//,
  /^\/oauth\//,
  /^\/\.netlify\//,
  /^\/(rest|auth|storage|realtime|functions)\/v1\//,
];
const DATA_PATHS = [/^\/library\//, /^\/data\//];

/* ---------- the Python files (py-module@1) ---------- */
const PY_MANIFEST = '/vendor/pyodide/manifest.json';
const PY_SCOPES = ['/vendor/pyodide/', '/vendor/pywheels/'];
const PY_LOADER = '/vendor/pyodide/__loader.html';
const TYPES: Readonly<Record<string, string>> = {
  js: 'text/javascript',
  mjs: 'text/javascript',
  wasm: 'application/wasm',
  json: 'application/json',
  zip: 'application/zip',
  whl: 'application/zip',
};
const typeOf = (p: string): string => TYPES[(p.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';
const fail = (status: number, why: string): Response =>
  new Response(why, { status, headers: { 'content-type': 'text/plain', 'x-noema-error': why } });
const hex = async (buf: ArrayBuffer): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('');

let pinsSeen: Pins | null = null; // { pathname: sha256 } of the manifest last read

function pinsOf(m: PyManifest | null): Pins {
  const pins: Record<string, string> = {};
  if (m?.format !== 'noema.pyodide-manifest/v1') return pins;
  for (const [f, v] of Object.entries(m.files ?? {})) pins[(m.base ?? '') + f] = v.sha256;
  for (const w of Object.values(m.wheels ?? {})) pins[(m.wheelsBase ?? '') + w.file] = w.sha256;
  return pins;
}
async function pyManifest(fresh: boolean): Promise<{ pins: Pins; response: () => Promise<Response | undefined> }> {
  const url = at(PY_MANIFEST.slice(1)),
    c = await caches.open(PY);
  const response = (): Promise<Response | undefined> => c.match(url);
  if (fresh || !pinsSeen) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) {
        const m = (await r.clone().json()) as PyManifest;
        await c.put(url, r);
        pinsSeen = pinsOf(m);
        return { pins: pinsSeen, response };
      }
    } catch (e) {
      console.info('[noema sw] python manifest: offline, the cached copy', e);
    }
    const hit = await c.match(url);
    if (hit) pinsSeen = pinsOf((await hit.clone().json()) as PyManifest);
  }
  return { pins: pinsSeen ?? {}, response };
}
async function pinned(url: URL): Promise<Response> {
  const want = (await pyManifest(false)).pins[url.pathname];
  if (!want) return fail(404, 'not-pinned');
  const c = await caches.open(PY),
    hit = await c.match(url.href);
  if (hit) return hit;
  let r: Response;
  try {
    r = await fetch(url.href, { cache: 'no-cache', credentials: 'omit' });
  } catch (e) {
    console.info('[noema sw] offline', url.pathname, e);
    return fail(504, 'offline');
  }
  if (!r.ok) return fail(r.status === 404 ? 404 : 502, 'http-' + String(r.status));
  const buf = await r.arrayBuffer();
  if ((await hex(buf)) !== want) return fail(502, 'integrity');
  const res = new Response(buf, {
    headers: { 'content-type': typeOf(url.pathname), 'content-length': String(buf.byteLength), 'x-noema-sha256': want },
  });
  await c.put(url.href, res.clone());
  return res;
}
/** the loader page: no script can run in it (its own policy); the app only calls its fetch(), so the requests come from a
    document this worker controls */
const loaderPage = (): Response =>
  new Response('<!doctype html><meta charset="utf-8"><title>noema python files</title>', {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; connect-src 'self'; frame-ancestors 'self'",
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
async function prunePython(): Promise<void> {
  const { pins } = await pyManifest(true);
  if (!Object.keys(pins).length) return;
  const c = await caches.open(PY),
    man = at(PY_MANIFEST.slice(1));
  for (const req of await c.keys()) if (req.url !== man && !pins[new URL(req.url).pathname]) await c.delete(req);
}
function python(e: FetchEvent, url: URL): void {
  if (url.pathname === PY_LOADER) {
    e.respondWith(loaderPage());
    return;
  }
  if (url.pathname === PY_MANIFEST) {
    e.respondWith(pyManifest(true).then(async m => (await m.response()) ?? fail(504, 'offline')));
    return;
  }
  e.respondWith(
    pinned(url).catch((x: unknown) => {
      console.warn('[noema sw] python', x);
      return fail(500, 'sw');
    }),
  );
}

/* ---------- the app shell, the data, the rest ---------- */
const cacheable = (r: Response): boolean => r.ok && r.status === 200 && r.type === 'basic';
async function networkFirst(req: Request): Promise<Response> {
  const c = await caches.open(DATA);
  try {
    const r = await fetch(req);
    if (cacheable(r)) await c.put(req, r.clone());
    return r;
  } catch (e) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw e instanceof Error ? e : new Error(String(e));
  }
}
async function cacheFirst(req: Request): Promise<Response> {
  const hit = (await caches.match(req, { cacheName: SHELL })) ?? (await caches.match(req, { cacheName: RUNTIME }));
  if (hit) return hit;
  const r = await fetch(req);
  if (cacheable(r)) await (await caches.open(RUNTIME)).put(req, r.clone());
  return r;
}
async function navigation(req: Request): Promise<Response> {
  const hit = await caches.match(INDEX, { cacheName: SHELL });
  if (hit) return hit;
  return fetch(req);
}

sw.addEventListener('install', e => {
  e.waitUntil(
    (async () => {
      if (SHELL_URLS.size) await (await caches.open(SHELL)).addAll([...SHELL_URLS].map(u => new Request(u, { cache: 'reload' })));
      await sw.skipWaiting();
    })(),
  );
});
sw.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      await sw.clients.claim();
      for (const n of await caches.keys()) if (n.startsWith('noema-') && !KEEP.has(n)) await caches.delete(n);
      try {
        await prunePython();
      } catch (x) {
        console.info('[noema sw] python files not pruned (offline?)', x);
      }
    })(),
  );
});
sw.addEventListener('message', e => {
  const d: unknown = e.data;
  if (d && typeof d === 'object' && (d as { type?: unknown }).type === 'noema:version')
    e.source?.postMessage({ type: 'noema:version', version: CFG.version });
});
sw.addEventListener('fetch', e => {
  const req = e.request,
    url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== ORIGIN || req.headers.has('range')) return; // not ours: as usual (Supabase and every other origin)
  if (NEVER.some(r => r.test(url.pathname))) return;
  if (PY_SCOPES.some(s => url.pathname.startsWith(s))) {
    python(e, url);
    return;
  }
  if (!SHELL_URLS.size) return; // npm run dev: always the network
  if (req.mode === 'navigate') {
    if (url.pathname === '/' || url.href.split(/[?#]/)[0] === INDEX) e.respondWith(navigation(req));
    return;
  }
  if (DATA_PATHS.some(r => r.test(url.pathname))) {
    e.respondWith(networkFirst(req));
    return;
  }
  e.respondWith(cacheFirst(req));
});
