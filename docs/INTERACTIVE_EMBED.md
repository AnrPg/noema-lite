# external-embed@1 — an allow-listed outside page as an activity

An activity that is a page of a third-party provider (a PhET simulation, a GeoGebra applet, a Desmos graph) shown in a frame.
It is **opt-in, needs the network, and is explore only**: a theory block, never a graded `sim` exercise. The contract of every
activity is `docs/INTERACTIVE.md`; the decision is the ADR's D12 (P6), as built in its §11.

Files: the allow-list `tools/embed_allow.json` (in the toolkit as `embed_allow.json`), the runtime
`engine/src/45_activity_embed.js` (+ `45_activity_embed.css`), the checks `embed_check.py` (= `NoemaEmbed.check` /
`checkPack` in JS; `tools/activities.py` and `engine/packcheck.js` call them), tests `tests/activities_embed.js`.

**Use it rarely.** A pack is meant to work offline and on its own. Prefer a `sim-spec@1` activity of your own; embed an outside
page only when it is clearly better than anything you could build (a famous PhET simulation), and always write the theory so
that it stands without it — the learner may be offline, may decline, or the app may have the runtime switched off (§5).

## 1. Providers, their licences and their terms (researched 2026-11; `notes` in the allow-list has the details)

| id | status | licence (`licenses`) | embedding | result channel |
|---|---|---|---|---|
| `phet` | allowed | **CC BY 4.0** for the HTML sims published before 2026-03-29; **newer ones are announced as CC BY-NC** | every sim page offers an Embed code; the credit "PhET Interactive Simulations, University of Colorado Boulder", the licence and the URL near the point of use | none (PhET-iO is licensed separately) |
| `geogebra` | allowed | GeoGebra's **non-commercial** licence (materials CC BY-NC-SA) | Share › Embed (`/material/iframe/id/…`); commercial use needs a licence from GeoGebra | none cross-origin |
| `desmos` | allowed | the Desmos **Terms of Service (commercial use restricted)** | Share › Embed of a saved graph (`?embed`), no API key | none (the JS API needs a key and runs in our page) |
| `falstad` | **pending** | code GPLv2; site: classroom use unmodified, non-commercial redistribution with credit, "other uses: contact me" | framing the hosted page is not addressed → ask Paul Falstad, or self-host the GPL build later | CircuitJS1 JS API, same-origin only |
| `circuitjs` | **pending** | GPLv2 (the hosted copy at lushprojects.com) | no terms for framing the hosted service | same as falstad |
| `wokwi` | **pending** | Wokwi ToS | no public embed documentation (only an "alpha, subject to change" partner embed) | none documented |

**What this means for a pack:**

* **PhET:** credit and licence at the point of use (the runtime shows the credit line under the frame); check the sim's own
  page for its licence — a sim under CC BY-NC is fine for personal and classroom study, not for a commercial product.
* **GeoGebra:** non-commercial only. A pack sold, or used in a paid course, needs GeoGebra's commercial licence.
* **Desmos:** its Terms of Service limit commercial use; the same caution as GeoGebra.
* The validators warn (`license-nc`) for every non-commercial licence: the owner of the pack decides, the tools never do.
* **Falstad, CircuitJS and Wokwi stay refused** (`provider-pending`) until their terms clearly allow framing. For circuits use
  `circuit-mna@1` (`docs/INTERACTIVE_CIRCUIT.md`).

No provider has a documented cross-origin result channel: `supportsResult` is `false` everywhere, so the runtime is explore
only. A graded outside activity would need a provider `postMessage` API with documented messages or a self-hosted copy (same
origin) — a later decision, not this runtime.

## 2. The allow-list — `embed_allow.json`

`{format: "noema.embed-allow/v1", providers: [{ id, name, status: "allowed"|"pending", origins: ["https://exact.host"],
path, query|null, hash|null, sandbox: [tokens], licenses: [...], creditMust, credit (template), terms, supportsResult, notes }]}`.
`path` / `query` / `hash` are regexes matched against the **whole** part (anchored; a subset JS and Python read alike);
`query: null` = no query allowed. The runtime carries an exact copy (`/*@providers*/ … /*@end*/`); the test fails when they
differ. Adding a provider: research its terms, add it as `pending`, switch to `allowed` only when embedding is clearly permitted.

## 3. The item (in `activities/activities.json`)

```json
{ "id": "ohm-phet", "runtime": "external-embed@1", "stateVersion": 1,
  "provider": "phet", "url": "https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html?locale=el",
  "credit": "PhET Interactive Simulations, University of Colorado Boulder · Ohm's Law · CC-BY-4.0 · https://phet.colorado.edu",
  "license": "CC-BY-4.0", "height": 480,
  "fallback": { "media": "ohm-still", "text": "Ohm's law: the current grows with the voltage … (>= 40 characters)" } }
```

with `activities/<id>/strings.<lang>.json` holding `title` (what opens, required in every language of the pack) and `why`
(optional, one line) — the consent card's own words. **No `entry`**, `html`, `spec` or `capabilities` (the page does not speak
the activity protocol); `make_pack.py` and `unpack.py` keep an item without a file.

**Rules** (codes; JS and Python identical, `tests/activities_embed.js` and `tests/activities.js` compare them):
`runtime`, `provider-unknown`, `provider-pending`, `provider-sandbox`; the URL: `url-missing`, `url-long` (> 2048),
`url-scheme` (`https://` exactly: no `http:`, `javascript:`, `data:`, `//`), `url-chars` (spaces, controls, `\`, quotes,
`<>`, non-ASCII), `url-userinfo`, `url-host` (lower-case, dotted), `url-origin` (exact origin incl. port), `url-path` (also
`//`, `.`/`..` segments, `%2e %2f %5c %00`), `url-query`, `url-hash`; `credit-missing`, `credit-provider` (must contain
`creditMust`), `license-missing`, `license-provider`; `fallback-missing`, `capabilities`, `not-embed`, `strings-title`,
`height`. In a pack: `sim-embed` (a sim exercise on an outside page: use it in a theory block). Warning `license-nc`. The
runtime also refuses a URL that is not in `new URL()`'s normal form.

Check them with `python3 embed_check.py <subject-dir>/activities/activities.json` (or a built `pack.json`); `make_pack.py` and
`activity_lint.py` run the same rules.

## 4. What the learner sees

1. **The card first, never an auto-load.** When the block starts (in view, or Start) the runtime shows a quiet card: the pack's
   title, *"This activity opens {provider}. It needs the network, and {provider} may set cookies."*, the `why` line, the credit ·
   licence · a link to the provider's terms (new tab, `noopener noreferrer`), and **Open {provider}**. Nothing of the provider
   is requested before Open.
2. **Remembered per provider.** Open stores `S.settings.embedOk[<provider>] = time` (an account setting, synced); next time the
   frame opens without the card. **Me › Data and sync** shows one quiet line, *"Outside activities that open without asking:
   PhET, …"* with an ⓘ and **Ask again** (`NoemaEmbed.consent.list()` / `forget(id)`); the line is absent when nothing was opened.
3. **The frame.** Two frames as in `html-app@1`: the app's frame is a wrapper without scripts (CSP `script-src 'none';
   frame-src <provider origins>`); the provider's page runs in the wrapper's frame and can navigate only within its provider.
   Both: `sandbox` = the provider's tokens (`allow-scripts allow-same-origin` — the provider's own origin, for its storage;
   never `allow-top-navigation*`, `allow-popups-to-escape-sandbox`, modals or downloads), `referrerpolicy="no-referrer"`,
   devices off (`allow="camera 'none'; microphone 'none'; …"`), `credentialless` (Chromium: a throw-away cookie jar),
   `loading="lazy"`, a title. The credit line stays under the frame (attribution at the point of use).
4. **Offline or failing → the fallback** (the core's notes, in every UI language):

   | code | when | the learner sees |
   |---|---|---|
   | `embed-offline` | `navigator.onLine === false` at start or at Open | "This activity needs the network. You are offline." + the fallback, **Restart** (= try again) |
   | `embed-timeout` | the page has not loaded in 20 s | "{provider} did not load." + the fallback, **Restart** |
   | `embed-refused` | the item breaks a rule of §3 (an old pack, an edited allow-list) | "This outside activity is not on the list of allowed sites." + the fallback, no Restart |
   | `embed-graded` | mounted as an exercise | the same note, no Restart |

5. **Protocol.** The page never talks to the app. The runtime answers for it: `ready` at once (the core's 15 s start timer),
   `pong` to each `ping`, an event `embed:open`, an announcement when the page has loaded. Messages the page posts are ignored.

## 5. Off by default

The runtime registers only with **`NOEMA_CONFIG.activities['external-embed@1'] === true`** in `config.js`; the shipped config
does not set it. Without it the app lacks `runtime:external-embed@1` and the pack's block shows its fallback (the ADR's D1: an
app that cannot run an activity shows the fallback, never an error). Switch it on only together with a CSP (§6) on a site
whose owner has read §1.

## 6. A future site CSP

The site has **no Content-Security-Policy today** (no `_headers`, no meta in `index.html`). Whoever adds one must allow:

* `frame-src 'self'` **plus the `origins` of every `allowed` provider** in `tools/embed_allow.json` (today `https://phet.colorado.edu https://www.geogebra.org https://www.desmos.com`).
  Generate the list from the allow-list in `tools/build.py`, never by hand: the wrapper frame (`about:srcdoc`) inherits the
  page's policy, so a provider must be allowed in both. Never add `pending` providers.
* `script-src … 'wasm-unsafe-eval'` and `worker-src blob:` for `wasm-module@1` and the sim engines' workers
  (`docs/INTERACTIVE_WASM.md` §5).
* No `connect-src` change: the outside page loads inside its own frame; the app itself never contacts a provider.

## 7. Tests

`node tests/activities_embed.js` (node): the copy equals the allow-list; URL and item cases give the same codes in JS and
Python; `checkPack` refuses a sim; opt-in registration; no HTML from strings. `--browser` (Chromium, Firefox, WebKit): a stub
host and a **local fake provider** (self-signed HTTPS), a beacon server: card first and 0 provider requests before Open; Open →
exact sandbox tokens, no Referer, only the allowed origin; the choice remembered, per provider; refused URLs → fallback with 0
requests; a hostile page (top navigation, `window.open`, a `_blank` link, a form to `_top`, `parent.location`, a forged result)
→ 0 beacon hits, the top page unmoved, no popup; offline → fallback. `tests/activities_app.js`: the runtime off by default; with
it on, the card, Open, the Settings line and Ask again, offline → fallback with Restart, an exercise → refused.
