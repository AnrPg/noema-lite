# external-embed@1 — an allow-listed outside page as an activity (P6, docs/adr/001 D12)

An activity that is a page of a third-party provider (a PhET simulation, a GeoGebra applet, a Desmos graph) shown in a frame.
It is **opt-in, needs the network, and is explore only** (a theory block, never a graded `sim`). Files: the allow-list
`tools/embed_allow.json`, the runtime `engine/src/45_activity_embed.js` (+ `45_activity_embed.css`), the checks
`tools/embed_check.py` (= `NoemaEmbed.check` / `checkPack` in JS), the tests `tests/activities_embed.js`.

## 1. Providers and their terms (researched 2026-11; `notes` in the allow-list has the details)

| id | status | licence (`licenses`) | embedding | result channel |
|---|---|---|---|---|
| `phet` | allowed | CC BY 4.0 for HTML sims published before 2026-03-29; newer ones announced as CC BY-NC | every sim page offers an Embed code; the credit "PhET Interactive Simulations, University of Colorado Boulder", the licence and the URL near the point of use | none (PhET-iO is licensed separately) |
| `geogebra` | allowed | GeoGebra non-commercial licence (materials CC BY-NC-SA) | Share › Embed (`/material/iframe/id/…`); commercial use needs a licence | none cross-origin: `ggbApplet` needs deployggb.js in our page or same-origin access |
| `desmos` | allowed | Desmos Terms of Service (commercial use restricted) | Share › Embed of a saved graph (`?embed`), no API key | none: the JS API needs a key and runs in our page |
| `falstad` | **pending** | code GPLv2; site: classroom use unmodified, non-commercial redistribution with credit, "other uses: contact me" | framing the hosted page not addressed → ask Paul Falstad, or self-host the GPL build later | CircuitJS1 JS API, same-origin only |
| `circuitjs` | **pending** | GPLv2 (Iain Sharp's hosted copy) | no terms for framing the hosted service | same as falstad |
| `wokwi` | **pending** | Wokwi ToS | no public embed documentation found (only an "alpha, subject to change" partner embed) | none documented |

So **no provider has a documented cross-origin result channel**: `supportsResult` is `false` everywhere and the runtime is
explore only. A graded outside activity would need either a provider `postMessage` API with documented messages (none of
these has one) or a self-hosted copy (same origin) — that is a later decision, not this runtime.

## 2. The allow-list — `tools/embed_allow.json`

`{format: "noema.embed-allow/v1", providers: [{ id, name, status: "allowed"|"pending", origins: ["https://exact.host"],
path, query|null, hash|null, sandbox: [tokens], licenses: [...], creditMust, credit (template), terms, supportsResult, notes }]}`.
`path` / `query` / `hash` are regexes matched against the **whole** part (anchored; a subset JS and Python read alike);
`query: null` = no query allowed. The runtime carries an exact copy (`/*@providers*/ … /*@end*/`); the test fails when they differ.
Adding a provider: research its terms, add it as `pending`, switch to `allowed` only when embedding is clearly permitted.

## 3. The item (in `activities/activities.json`)

```json
{ "id": "ohm-phet", "runtime": "external-embed@1", "stateVersion": 1,
  "provider": "phet", "url": "https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html?locale=el",
  "credit": "PhET Interactive Simulations, University of Colorado Boulder · Ohm's Law · CC-BY-4.0 · https://phet.colorado.edu",
  "license": "CC-BY-4.0", "height": 480,
  "fallback": { "media": "ohm-still", "text": "Ohm's law: the current grows with the voltage … (>= 40 characters)" } }
```
with `strings.<locale>.title` (what opens, required in every language) and `.why` (optional, one line) — the consent card's own
words. No `entry`, `html`, `spec` or `capabilities` (the page does not speak the activity protocol).

**Rules** (codes; JS and Python identical): `runtime`, `provider-unknown`, `provider-pending`, `provider-sandbox`; the URL:
`url-missing`, `url-long` (> 2048), `url-scheme` (must start with `https://` exactly: no `http:`, `javascript:`, `data:`, `//`),
`url-chars` (spaces, controls, `\`, quotes, `<>`, non-ASCII), `url-userinfo`, `url-host` (lower-case, dotted), `url-origin`
(exact origin incl. port), `url-path` (also `//`, `.`/`..` segments, `%2e %2f %5c %00`), `url-query`, `url-hash`;
`credit-missing`, `credit-provider` (must contain `creditMust`), `license-missing`, `license-provider`; `fallback-missing`,
`capabilities`, `not-embed`, `strings-title`, `height`; in a pack `sim-embed` (a sim exercise on an embed). Warning
`license-nc` (non-commercial: the owner decides). The runtime also refuses a URL that is not in `new URL()`'s normal form.

## 4. The runtime (what the learner sees)

1. **The card first, never an auto-load.** When the block starts (in view, or Start), the runtime shows a quiet card: the
   pack's title, *"This activity opens {provider}. It needs the network, and {provider} may set cookies."*, the `why` line,
   the credit · licence · a link to the provider's terms (new tab, `noopener noreferrer`), and **Open {provider}**. Nothing of the
   provider is requested before Open (tested with a request counter).
2. **Remembered per provider.** Open stores `S.settings.embedOk[<provider>] = time` (an account setting, synced); next time the
   frame opens without the card. `NoemaEmbed.consent.list() / forget(id)` are for a Settings row "ask again".
3. **The frame.** Two frames as in `html-app@1`: the app's frame is a wrapper without scripts (CSP `script-src 'none';
   frame-src <provider origins>`); the provider's page runs in the wrapper's frame and can navigate only within its provider.
   Both: `sandbox` = the provider's tokens (for every listed provider `allow-scripts allow-same-origin` — the provider's own origin, for its
   storage; never `allow-top-navigation*`, `allow-popups-to-escape-sandbox`, modals, downloads; forms/popups only if listed),
   `referrerpolicy="no-referrer"`, devices off (`allow="camera 'none'; microphone 'none'; …"`), `credentialless` (Chromium:
   a throw-away cookie jar), `loading="lazy"`, a title. The credit line stays under the frame (attribution at the point of use).
4. **Offline or failing → fallback.** `navigator.onLine === false` at start or at Open → `onFail('embed-offline')`; a page that
   does not load in 20 s → `embed-timeout`; a refused item → `embed-refused`; mounted as an exercise → `embed-graded`.
5. **Protocol.** The page never talks to the app. The runtime answers for it: `ready` at once (the core's 15 s start timer),
   `pong` to each `ping`, an event `embed:open`, an announcement when the page has loaded. Messages the page posts are ignored.
6. **Off by default.** It registers only with `NOEMA_CONFIG.activities['external-embed@1'] === true`; without it the app lacks
   `runtime:external-embed@1` and the pack shows the fallback (D1).

## 5. Tests — `tests/activities_embed.js`

Node (`node tests/activities_embed.js`, 72 checks): the copy equals the allow-list; 41 URL cases and 20 item cases give the same
codes in JS and Python; `checkPack` refuses a sim; opt-in registration; no HTML from strings. Browser (`--browser`,
`BROWSERS=chromium,firefox,webkit`, under the shared browser lock): a stub host on `http://localhost:<a>` and a **local fake
provider** on `https://127.0.0.1:<b>` (self-signed, made with openssl; `ignoreHTTPSErrors`), a beacon server on a third port:
card first and 0 provider requests before Open; Open → exact sandbox tokens, no Referer, only the allowed origin; the choice
remembered (and across a reload), per provider; refused URLs (http, another path, javascript:, data:, extra query, user info,
pending/unknown provider, no credit) → fallback with 0 requests; a sim → refused; a hostile page (top navigation with and
without a gesture, `window.open`, a `_blank` link, a form to `_top`, `parent.location`, self-navigation to another origin, a
forged result) → 0 beacon hits, the top page unmoved, no popup; offline (before, at Open) → fallback.

## 6. Words the integrator adds to i18n (engine catalogue, every UI language)

| key | English | where |
|---|---|---|
| `engine.act.embed.ask` | This activity opens {provider}. It needs the network, and {provider} may set cookies. | the card |
| `engine.act.embed.open` | Open {provider} | the card's button |
| `engine.act.embed.terms` | {provider}'s terms | link on the card and under the frame |
| `engine.act.embed.frameTitle` | {title} — {provider} | the frame's title (screen readers) |
| `engine.act.embed.opened` | {provider} is open. | announced when the page has loaded |
| `engine.act.embed.offline` | This activity needs the network. You are offline. | note, onFail `embed-offline` |
| `engine.act.embed.refused` | This outside activity is not on the list of allowed sites. | note, onFail `embed-refused` |
| `engine.act.embed.timeout` | {provider} did not load. | note, onFail `embed-timeout` |
| `engine.act.embed.settings` / `.forget` | Outside activities you open without asking · Ask again | Settings row (optional) |

## 7. What the integrator changes (existing files)

1. `engine/src/32_activities.js` `onFail`: `embed-refused` / `embed-graded` → `stop(<note>, false)`; `embed-offline`,
   `embed-timeout` → `stop(<note>)` with Restart (= retry). Optionally do not count a card (no frame yet) in the live limit.
2. **Site CSP** (`tools/build.py` → `dist/site/_headers`, none today): when a CSP is added, `frame-src 'self'` + the
   `origins` of every `allowed` provider (generate it from `tools/embed_allow.json`) — the wrapper (`about:srcdoc`) inherits the
   page's policy, so the provider must be in both; never `allow-*` changes elsewhere. Then switch on in `config.js`.
3. Validators: `tools/activities.py` and `engine/packcheck.js` add `external-embed@1` to `RUNTIMES`, skip the bundle rules for
   it and call `embed_check.check_item` / the same rules (packcheck cannot load `45_…`: share or copy `check`), and refuse
   `sim-embed`; `make_pack.py` / `unpack.py` accept an item without `entry`; the skill zip ships `embed_check.py` + the allow-list.
4. `i18n/engine/*.arb`: the keys of §6. `docs/INTERACTIVE.md` §1 (a row), §10 (offline), the ADR "as built"; `tests/run_e2e.sh`
   runs `node tests/activities_embed.js` (+ `--browser`); `tests/activities.js` §4 may name `45_activity_embed.js` (its sandbox
   tokens come from the allow-list: the provider's origin, never pack content).
