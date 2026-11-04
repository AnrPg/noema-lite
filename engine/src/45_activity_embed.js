/* ===================== interactive activities — runtime external-embed@1 (a third-party interactive page, opt-in) =====================
   docs/activities-dev/embed.md, docs/adr/001 D12. An activity that is a page of an allow-listed provider (PhET, GeoGebra, Desmos…)
   shown in a frame. It is an EXPLORER only (a theory block): no provider offers a documented cross-origin result channel, so it is
   never a graded sim (checkPack refuses one; the runtime refuses an exercise).
     • Nothing loads by itself: the learner first sees a quiet card (what opens, that it needs the network and may set cookies, the
       credit, the licence, a link to the provider's terms) and an Open button. Open is remembered per provider (S.settings.embedOk,
       an account setting); the card is skipped next time, the credit line stays under the frame (attribution at the point of use).
     • The URL must match the allow-list exactly (PROVIDERS = tools/embed_allow.json): https, the origin one of the provider's, path,
       query and hash fully matching its patterns, no user info, no tricks (check / match below; tools/embed_check.py the same rules).
     • Two frames, as in html-app@1: the app's frame holds a WRAPPER without scripts (CSP script-src 'none') whose policy says
       frame-src <the provider's origins>, and the provider's page runs in the wrapper's frame. So the page can navigate only within
       its provider; every other navigation is blocked by the wrapper's policy. Both frames: sandbox with the provider's tokens only
       (allow-scripts + allow-same-origin — the PROVIDER's own origin, which it needs for its storage; never allow-top-navigation,
       never allow-popups-to-escape-sandbox, no forms or popups unless the allow-list names them), referrerpolicy no-referrer,
       devices off (allow: … 'none'), credentialless where the browser has it, loading lazy.
     • Offline (navigator.onLine false) or a page that never loads → onFail with a code; the core shows the activity's fallback.
   No words here: the visible texts are tE() keys (engine.act.embed.*) and the pack's own strings (title, why).
   Off unless the deployment switches it on: NOEMA_CONFIG.activities['external-embed@1'] === true (the site CSP must list the
   providers in frame-src first). Loads in Node too (module.exports: the checks, for tests/activities_embed.js). */
const NoemaEmbed = (() => {
  /* i18n-ignore-start */   // code: codes, patterns, attribute values
  const PROVIDERS = /*@providers*/[
    {"id": "phet", "name": "PhET", "status": "allowed", "origins": ["https://phet.colorado.edu"], "path": "/sims/html/[a-z0-9-]+/(latest|[0-9]+\\.[0-9]+\\.[0-9]+)/[a-z0-9-]+_(all|[a-z]{2}(_[A-Z]{2})?)\\.html", "query": "(locale=[A-Za-z_]{2,6})?", "hash": null, "sandbox": ["allow-scripts", "allow-same-origin"], "licenses": ["CC-BY-4.0", "CC-BY-NC-4.0"], "creditMust": "PhET Interactive Simulations, University of Colorado Boulder", "credit": "PhET Interactive Simulations, University of Colorado Boulder · {title} · {license} · https://phet.colorado.edu", "terms": "https://phet.colorado.edu/en/licensing/html", "supportsResult": false, "notes": "HTML sims published before 2026-03-29: CC BY 4.0 (commercial use allowed; the credit, the licence and https://phet.colorado.edu as close to the point of use as possible; translating the credit is allowed). PhET's 2025 impact report announces a shift to CC BY-NC for newer sims, and its FAQ says commercial use needs a licence: read the sim's publication date in its About dialog and pick the licence. Every HTML sim page offers an Embed code. No result channel: PhET-iO (the instrumented API) is licensed separately. Language: ?locale=."},
    {"id": "geogebra", "name": "GeoGebra", "status": "allowed", "origins": ["https://www.geogebra.org"], "path": "/material/iframe/id/[A-Za-z0-9]{4,16}(/[a-z]{1,8}/[A-Za-z0-9]{1,16})*", "query": null, "hash": null, "sandbox": ["allow-scripts", "allow-same-origin"], "licenses": ["GeoGebra-NC", "CC-BY-NC-SA-3.0", "CC-BY-NC-SA-4.0"], "creditMust": "GeoGebra", "credit": "{author} · {title} · GeoGebra (geogebra.org) · {license}", "terms": "https://www.geogebra.org/license", "supportsResult": false, "notes": "GeoGebra licence: the apps and the materials are free for non-commercial use with attribution (materials CC BY-NC-SA); commercial use (e.g. inside a non-academic e-book or a paid product) needs a licence from GeoGebra. Share > Embed gives the material/iframe URL. Explore only: the ggbApplet API needs deployggb.js running in OUR page (a third-party script in the app's origin: refused) or same-origin access to the frame; the iframe embed has no documented postMessage channel."},
    {"id": "desmos", "name": "Desmos", "status": "allowed", "origins": ["https://www.desmos.com"], "path": "/(calculator|geometry|3d)/[a-z0-9]{6,24}", "query": "embed", "hash": null, "sandbox": ["allow-scripts", "allow-same-origin"], "licenses": ["Desmos-ToS"], "creditMust": "Desmos", "credit": "{title} · Desmos (desmos.com) · {license}", "terms": "https://www.desmos.com/terms", "supportsResult": false, "notes": "A saved graph's Share > Embed gives https://www.desmos.com/calculator/<id>?embed (no API key; Desmos staff on the API forum: the iframe route needs no API). The JS API (calculator.js) needs an API key and runs in OUR page: refused. The Terms of Service restrict commercial use. Explore only."},
    {"id": "falstad", "name": "Falstad Circuit Simulator", "status": "pending", "origins": ["https://www.falstad.com", "https://falstad.com"], "path": "/circuit/circuitjs\\.html", "query": "(ctz|cct)=[A-Za-z0-9._~%+$!*'(),;:@/=-]{1,1900}", "hash": null, "sandbox": ["allow-scripts", "allow-same-origin"], "licenses": ["GPL-2.0-or-later"], "creditMust": "Paul Falstad", "credit": "Circuit simulator by Paul Falstad (falstad.com/circuit) · {license}", "terms": "https://www.falstad.com/licensing.html", "supportsResult": false, "notes": "Code: CircuitJS1, GPLv2. Site terms: use in a classroom unmodified; non-commercial modification or redistribution with credit and a link; 'for any other uses, contact me'. Framing the hosted page on another site is not addressed: PENDING until Paul Falstad confirms, or self-host the GPL build later (same origin: then its CircuitJS1 JS API could give a result channel). Cross-origin, that API is out of reach."},
    {"id": "circuitjs", "name": "CircuitJS1 (Lush Projects)", "status": "pending", "origins": ["https://lushprojects.com"], "path": "/circuitjs/circuitjs(\\.html)?", "query": "(ctz|cct)=[A-Za-z0-9._~%+$!*'(),;:@/=-]{1,1900}", "hash": null, "sandbox": ["allow-scripts", "allow-same-origin"], "licenses": ["GPL-2.0-or-later"], "creditMust": "CircuitJS1", "credit": "CircuitJS1 by Paul Falstad and Iain Sharp (lushprojects.com/circuitjs) · {license}", "terms": "https://github.com/sharpie7/circuitjs1", "supportsResult": false, "notes": "Iain Sharp's hosted CircuitJS1 (GPLv2; the README says to embed the full-page version in an iframe, written for self-hosted copies). No terms for framing the hosted service: PENDING. Same API situation as falstad."},
    {"id": "wokwi", "name": "Wokwi", "status": "pending", "origins": ["https://wokwi.com"], "path": "/projects/[0-9]{6,24}", "query": "(embed=1)?", "hash": null, "sandbox": ["allow-scripts", "allow-same-origin"], "licenses": ["Wokwi-ToS"], "creditMust": "Wokwi", "credit": "{title} · simulated on Wokwi (wokwi.com) · {license}", "terms": "https://docs.wokwi.com", "supportsResult": false, "notes": "Arduino / ESP32 / Pi Pico simulator, free to use. No public documentation of iframe embedding or of its terms was found (2026-11): only an 'early prototype, subject to change' partner embed (/_alpha/wembed/) in wokwi-embed-bridge-example. PENDING until Wokwi documents or confirms embedding. A project compiles the learner's code on Wokwi's servers."},
  ]/*@end*/;
  const RUNTIME = 'external-embed@1', MAX_URL = 2048, FALLBACK_MIN = 40, LOAD_TIMEOUT = 20000;
  /** the sandbox tokens a provider may be given; everything else (allow-top-navigation*, allow-popups-to-escape-sandbox, allow-modals,
      allow-downloads, allow-storage-access-by-user-activation, allow-presentation, allow-orientation-lock) is refused */
  const SANDBOX_OK = new Set(['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-pointer-lock', 'allow-popups']);
  const DEVICES = ['accelerometer', 'autoplay', 'camera', 'display-capture', 'encrypted-media', 'geolocation', 'gyroscope', 'magnetometer', 'microphone', 'midi', 'payment', 'publickey-credentials-get', 'screen-wake-lock', 'serial', 'usb', 'hid', 'bluetooth', 'web-share', 'xr-spatial-tracking'].map(f => f + " 'none'").join('; ');
  const SAFE = /^[A-Za-z0-9\-._~%!$&'()*+,;=:@\/?#]+$/;
  const URL_RE = /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(:[0-9]{1,5})?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/;
  const BAD_PATH = /\/\/|\/\.\.?(\/|$)|%2e|%2f|%5c|%00/i;
  const isStr = v => typeof v === 'string' && v.trim().length > 0;
  const full = (re, s) => { try { return new RegExp('^(?:' + re + ')$').test(s); } catch (e) { return false; } };
  const provider = (id, list) => (Array.isArray(list) ? list : []).find(p => p && p.id === id) || null;

  /** a URL string → { origin, path, query, hash } (query / hash without ? / #, null when absent) | { code } */
  function parse(u) {
    if (typeof u !== 'string' || !u) return { code: 'url-missing' };
    if (u.length > MAX_URL) return { code: 'url-long' };
    if (!u.startsWith('https://')) return { code: 'url-scheme' };   // http:, javascript:, data:, //host, HTTPS:… all refused
    if (!SAFE.test(u)) return { code: 'url-chars' };                 // spaces, controls, backslashes, quotes, <>, non-ASCII
    if (u.slice(8).split(/[/?#]/)[0].includes('@')) return { code: 'url-userinfo' };
    const m = URL_RE.exec(u); if (!m) return { code: 'url-host' };
    const path = m[3] || '/';
    if (BAD_PATH.test(path)) return { code: 'url-path' };
    return { origin: 'https://' + m[1] + (m[2] || ''), path, query: m[4] == null ? null : m[4].slice(1), hash: m[5] == null ? null : m[5].slice(1) };
  }
  /** does the URL match this provider exactly? → { ok: true, provider, origin } | { code } */
  function match(url, p) {
    const u = parse(url); if (u.code) return u;
    if (!p || !Array.isArray(p.origins) || !p.origins.includes(u.origin)) return { code: 'url-origin' };
    if (!full(p.path, u.path)) return { code: 'url-path' };
    if (u.query != null && (p.query == null || !full(p.query, u.query))) return { code: 'url-query' };
    if (u.query == null && p.query != null && !full(p.query, '')) return { code: 'url-query' };
    if (u.hash != null && (p.hash == null || !full(p.hash, u.hash))) return { code: 'url-hash' };
    return { ok: true, provider: p, origin: u.origin };
  }
  /** one registry item → { errors: ['code: what'], warnings } — the same rules as tools/embed_check.py check_item */
  function check(a, opts) {
    const list = (opts && opts.providers) || PROVIDERS, E = [], W = [];
    const e = (code, what) => E.push(code + ': ' + what);
    if (!a || typeof a !== 'object' || Array.isArray(a)) return { errors: ['item: not an object'], warnings: W };
    if (a.runtime !== RUNTIME) e('runtime', 'runtime must be ' + RUNTIME);
    const p = typeof a.provider === 'string' ? provider(a.provider, list) : null;
    if (!p) e('provider-unknown', 'provider must be one of the allow-list (tools/embed_allow.json)');
    else {
      if (p.status !== 'allowed') e('provider-pending', 'provider ' + p.id + ' is not allowed yet (its embedding terms are not confirmed)');
      if (!Array.isArray(p.sandbox) || p.sandbox.some(t => !SANDBOX_OK.has(t)) || !p.sandbox.includes('allow-scripts')) e('provider-sandbox', 'the provider asks for sandbox tokens outside ' + [...SANDBOX_OK].join(' '));
      const m = match(a.url, p); if (!m.ok) e(m.code, 'url does not match provider ' + p.id + ' exactly');
      if (!isStr(a.credit)) e('credit-missing', 'credit is required');
      else if (isStr(p.creditMust) && !a.credit.includes(p.creditMust)) e('credit-provider', 'credit must name "' + p.creditMust + '"');
      if (!isStr(a.license)) e('license-missing', 'license is required');
      else if (!Array.isArray(p.licenses) || !p.licenses.includes(a.license)) e('license-provider', 'license must be one of ' + (p.licenses || []).join(', '));
    }
    if (p == null && typeof a.url === 'string') { const u = parse(a.url); if (u.code) e(u.code, 'url'); }
    const fb = a.fallback && typeof a.fallback === 'object' ? a.fallback : {};
    if (!(isStr(fb.text) && fb.text.trim().length >= FALLBACK_MIN) || !isStr(fb.media)) e('fallback-missing', 'fallback {media, text >= ' + FALLBACK_MIN + ' characters} is required (offline, refused, not chosen)');
    if (a.capabilities != null && !(Array.isArray(a.capabilities) && a.capabilities.length === 0)) e('capabilities', 'an embed has no capabilities (it does not speak the activity protocol)');
    if ('html' in a || 'spec' in a || 'entry' in a) e('not-embed', 'an embed carries no bundle, spec or entry');
    const st = a.strings;
    if (!st || typeof st !== 'object' || Array.isArray(st) || !Object.keys(st).length || Object.values(st).some(t => !t || typeof t !== 'object' || Array.isArray(t) || !isStr(t.title))) e('strings-title', 'strings.<locale>.title (what opens, in each language) is required');
    if (a.height != null && !(typeof a.height === 'number' && a.height >= 120 && a.height <= 2000)) e('height', 'height must be 120–2000');
    if (p && p.status === 'allowed' && /NC/.test(String(a.license || ''))) W.push('license-nc: ' + a.license + ' is non-commercial: fine for a free study app, not for a paid one');
    return { errors: E, warnings: W };
  }
  /** a pack → { errors, warnings } for its embed items, and the sim exercises that would grade one (none can) */
  function checkPack(pack, opts) {
    const list = (opts && opts.providers) || PROVIDERS, E = [], W = [], items = {};
    for (const a of (pack && pack.activities && Array.isArray(pack.activities.items) ? pack.activities.items : [])) {
      if (!a || a.runtime !== RUNTIME) continue;
      items[a.id] = a; const r = check(a, { providers: list });
      E.push(...r.errors.map(m => 'activity ' + a.id + ': ' + m)); W.push(...r.warnings.map(m => 'activity ' + a.id + ': ' + m));
    }
    for (const c of (pack && Array.isArray(pack.chapters) ? pack.chapters : []))
      for (const ex of (Array.isArray(c.exercises) ? c.exercises : []))
        if (ex && ex.type === 'sim' && Object.prototype.hasOwnProperty.call(items, ex.activity)) {
          const p = provider(items[ex.activity].provider, list);
          if (!(p && p.supportsResult === true)) E.push(ex.id + ': sim-embed: activity ' + ex.activity + ' is an outside page (explore only): use it in a theory block');
        }
    return { errors: E, warnings: W };
  }

  /* ---------- the learner's choice, per provider (an account setting: S.settings.embedOk = { <provider>: time }) ---------- */
  const consent = {
    has(id) { try { return !!(typeof S !== 'undefined' && S.settings && S.settings.embedOk && Object.prototype.hasOwnProperty.call(S.settings.embedOk, id) && S.settings.embedOk[id]); } catch (e) { return false; } },
    set(id) { try { if (typeof S === 'undefined' || !S.settings) return; S.settings.embedOk = Object.assign({}, S.settings.embedOk || {}, { [id]: Date.now() }); if (typeof save === 'function') save(); } catch (e) { } },
    forget(id) { try { if (typeof S === 'undefined' || !S.settings || !S.settings.embedOk) return; const o = Object.assign({}, S.settings.embedOk); delete o[id]; S.settings.embedOk = o; if (typeof save === 'function') save(); } catch (e) { } },
    list() { try { return typeof S !== 'undefined' && S.settings && S.settings.embedOk ? Object.keys(S.settings.embedOk) : []; } catch (e) { return []; } },
  };

  /* ---------- the runtime ---------- */
  const T = (k, v) => (typeof tE === 'function' ? tE(k, v) : k);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  function creditLine(a, p) {
    const line = el('p', 'act-embed-credit');
    line.append(el('span', '', a.credit), document.createTextNode(' · '), el('span', '', a.license), document.createTextNode(' · '));
    const terms = el('a', '', T('engine.act.embed.terms', { provider: p.name }));
    terms.href = p.terms; terms.target = '_blank'; terms.rel = 'noopener noreferrer'; terms.referrerPolicy = 'no-referrer';
    line.append(terms);
    return line;
  }
  /** the wrapper document: no scripts; its policy lets its one frame show only the provider's origins */
  function wrapperDoc(url, p, tokens, title) {
    const csp = ["default-src 'none'", "script-src 'none'", "style-src 'unsafe-inline'", 'frame-src ' + p.origins.join(' '), "form-action 'none'", "base-uri 'none'", "object-src 'none'"].join('; ');
    const w = document.implementation.createHTMLDocument('');
    const m = w.createElement('meta'); m.setAttribute('http-equiv', 'Content-Security-Policy'); m.setAttribute('content', csp);
    const s = w.createElement('style'); s.textContent = 'html,body{margin:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;border:0;width:100%;height:100%}';
    const f = w.createElement('iframe');
    f.setAttribute('sandbox', tokens); f.setAttribute('allow', DEVICES); f.setAttribute('referrerpolicy', 'no-referrer');
    f.setAttribute('credentialless', ''); f.setAttribute('title', title); f.setAttribute('src', url);
    w.head.replaceChildren(m, s); w.body.replaceChildren(f);
    return '<!doctype html>' + w.documentElement.outerHTML;
  }
  function register() {
    if (typeof ACT !== 'object' || !ACT || typeof ACT.registerRuntime !== 'function' || typeof document === 'undefined') return;
    if (!(window.NOEMA_CONFIG && window.NOEMA_CONFIG.activities && window.NOEMA_CONFIG.activities[RUNTIME] === true)) return;   // opt-in per deployment
    ACT.registerRuntime({
      id: RUNTIME, version: 1,
      /** → port { send(type), close() }; the page itself does not speak the activity protocol: this trusted host answers for it */
      mount(box, { act, init, title, onMessage, onFail }) {
        const later = f => Promise.resolve().then(f);   // never call back before the core holds the port
        let closed = false, timer = null;
        const out = (type, payload) => { if (!closed) onMessage(ACTP.out(type, payload)); };
        const fail = code => later(() => { if (!closed) onFail(code); });
        const root = el('div', 'act-embed');
        const port = { send(type) { if (type === 'ping') later(() => out('pong')); }, close() { closed = true; clearTimeout(timer); root.remove(); } };
        const r = check(act);
        const p = provider(act && act.provider, PROVIDERS);
        if (r.errors.length || !p) { console.warn('[noema] external-embed', act && act.id, r.errors.join(' | ')); fail('embed-refused'); return port; }
        let href = ''; try { href = new URL(act.url).href; } catch (e) { }
        if (href !== act.url) { console.warn('[noema] external-embed', act.id, 'url is not in its normal form'); fail('embed-refused'); return port; }
        if (init && init.exerciseId) { fail('embed-graded'); return port; }   // explore only (docs/activities-dev/embed.md §4)
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { fail('embed-offline'); return port; }
        const tokens = p.sandbox.filter(t => SANDBOX_OK.has(t)).join(' ');
        const words = (init && init.strings) || {};
        const name = words.title || act.id;
        box.append(root);
        later(() => out('ready', { protocols: [1] }));
        function open() {
          if (closed) return;
          if (typeof navigator !== 'undefined' && navigator.onLine === false) return fail('embed-offline');
          root.replaceChildren();
          const f = el('iframe', 'act-frame act-embed-frame');
          f.setAttribute('sandbox', tokens); f.setAttribute('allow', DEVICES); f.setAttribute('referrerpolicy', 'no-referrer');
          f.setAttribute('credentialless', ''); f.setAttribute('loading', 'lazy'); f.setAttribute('title', T('engine.act.embed.frameTitle', { title: name, provider: p.name }));
          f.setAttribute('data-provider', p.id);
          f.addEventListener('load', () => { clearTimeout(timer); out('a11y:announce', { text: String(T('engine.act.embed.opened', { provider: p.name })).slice(0, 300) }); }, { once: true });
          timer = setTimeout(() => fail('embed-timeout'), LOAD_TIMEOUT);
          f.srcdoc = wrapperDoc(act.url, p, tokens, name);
          root.append(f, creditLine(act, p));
          out('event', { name: 'embed:open', data: { provider: p.id } });
        }
        if (consent.has(p.id)) { open(); return port; }
        // the quiet card: nothing of the provider is requested before Open
        const card = el('div', 'act-embed-card'); card.setAttribute('role', 'group'); card.setAttribute('aria-label', name);
        card.append(el('p', 'act-embed-title', name), el('p', 'act-embed-ask', T('engine.act.embed.ask', { provider: p.name })));
        if (typeof words.why === 'string' && words.why.trim()) card.append(el('p', 'act-embed-why', words.why));
        card.append(creditLine(act, p));
        const go = el('button', 'btn primary small act-embed-open', T('engine.act.embed.open', { provider: p.name })); go.type = 'button';
        go.addEventListener('click', () => { if (closed) return; consent.set(p.id); open(); });
        card.append(go);
        root.append(card);
        return port;
      },
    });
  }
  register();
  /* i18n-ignore-end */
  return { RUNTIME, PROVIDERS, SANDBOX_OK, parse, match, check, checkPack, consent };
})();
if (typeof module === 'object' && module && module.exports) module.exports = NoemaEmbed;
else if (typeof window !== 'undefined') window.NoemaEmbed = NoemaEmbed;
