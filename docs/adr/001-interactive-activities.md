# ADR 001 · Interactive activities in packs (mini-apps, minigames, simulations)

* **Status:** accepted (2026-11-04). The owner approved the four plan changes in §2; P1 (core + `html-app@1`) is implemented. Where this
  record and the owner's decisions doc differ, the doc wins (items 6 and 7 are applied below: D7, D8).
* **Date:** 2026-11-04 · **Requested by:** ANR · **Brief:** the "Handoff: Interactive Activities for noema-lite" message (thread "Add interactive activities to packs").
* **Scope of this ADR:** the design for all phases P1–P5 and the results of the four P0 spikes. No feature code ships with it; the spike
  scripts are kept in `tests/spikes/activities/` so anyone can run them again.

---

## 1. What the repository really looks like (the brief's VERIFY items)

| Brief assumption | What the code says | Consequence |
|---|---|---|
| `tools/make_pack.py` builds packs | It is `skill/noema-pack-builder/scripts/make_pack.py` (and `unpack.py`); `tools/validate.py` and `tools/noema_lib.py` are shared with it; `tools/build.py skill` zips the skill, and `noema_get_toolkit` hands out that zip. | The new activity scripts go in `skill/noema-pack-builder/scripts/` (so the skill and the toolkit get them at once); shared logic goes in `tools/`. |
| ~25 exercise types | `engine/packcheck.js` `TYPES`: 18 classic + 7 picture types = 25. Block types: `BLOCKS` (12 + `figure`). | `sim` becomes type 26, `interactive` a new block. |
| Pictures in `media/media.json` | Pictures live in the subject's `media/` folder, are loaded by `noema_lib.load_media` and end up in `pack.media` (data URIs). | The fallback picture of an activity is an ordinary `pack.media` entry. |
| Translations `translations/<locale>/chNN.json` | Yes; each locale becomes its own file `translations/<locale>.json` in the `.noema.zip` (`pack.translations[loc] = {file: true}`), checked by `checkTranslation` / `validate.py --source`. | Activity string tables ride in the same per-locale translation file (§5.4). |
| Packs are `"v": 2`, old apps refuse newer ones | **No engine checks `v` at all.** `make_pack.py` writes `v: 1`, `pack_i18n` raises it to 2 when there are translations. | Bumping to `v: 3` protects nobody (spike b). |
| Old apps ignore unknown things | Unknown **block**: `renderBlock` renders an empty box (harmless). Unknown **exercise type**: `R[ex.type] \|\| R.mcq` → `ex.options.map` → **TypeError, the exercise view breaks** (spike b). | See decision D1. |
| The app is a PWA with a service worker | **There is no service worker.** The website needs the network; offline means the `file://` copy or the one-file bundle (`build.py bundle`). Packs themselves are kept in IndexedDB (`noema-lite` DB, store `packs`). | See decision D9. |
| The app sets `frame-ancestors` / a CSP | `dist/site/_headers` (written by `build.py site`) sets only `nosniff`, `Referrer-Policy`, caching, and CORS on `/library/*`. No CSP. | P1 adds `frame-ancestors 'self'` for the app and CORS + CORP headers for the Python assets (P4). |
| Stale apps | `NoemaCurriculumJobs.stale()` compares `build.json` with the tab's build and reloads the tab when it comes back to the front. | Reused for "this pack needs a newer app" (D1). |
| UI strings | Engine strings go through `tE()` and the engine catalogues `engine/i18n/<locale>.js` (built from `i18n/`), shell strings through `engine/i18n_shell.js`; every UI language gets every key (project rule). | All host UI of activities (Restart, Skip activity, notices, the Tier B controls) goes through `tE()` in every UI language. Content strings of an activity are pack content (en/el/ru + the pack's own language). |

---

## 2. Spike results, and the four places they change the plan

All spikes ran on 2026-11-04 in this sandbox with Playwright 1.63: **Chromium 153** (the full browser, not only the headless shell),
**Firefox 155** and **WebKit 26.6** (the engine of Safari). Scripts: `tests/spikes/activities/`.

### Spike (b): an older app meets the new content

A copy of the demo-physics fixture with one `interactive` block and one `sim` exercise, opened with today's engine:

| Where | Result |
|---|---|
| Section with the `interactive` block | renders; the block is an empty box (only the 💡 button) |
| `#/ex/<sim exercise>` (and so any round that reaches it: practice, drills, Mistakes gym, reviews) | **`TypeError: Cannot read properties of undefined (reading 'map')`** — the exercise view breaks |
| Chapter page, mixed practice list, lightning, Mistakes gym list, home | fine |

**Plan change 1.** The brief's default ("bump to `v: 3` so old apps refuse") does not work: no app reads `v`. → decision D1.

### Spike (c): `srcdoc` iframe, `sandbox="allow-scripts"`, CSP meta first, nonce + MessagePort handshake

The hostile probe tried every attack of the brief's §9 table. A local server counted every request that reached it.

| Attack | Chromium | Firefox | WebKit |
|---|---|---|---|
| `self.origin` | `"null"` | `"null"` | `"null"` |
| `parent.document`, `top.localStorage`, own `localStorage` / `sessionStorage` / `indexedDB` | SecurityError | SecurityError | SecurityError |
| `document.cookie` | SecurityError | SecurityError | returns `""` (not the app's cookie) |
| remove `frameElement.sandbox` | `frameElement` is `null` | same | same |
| `fetch`, XHR, WebSocket, `<img>` beacon | blocked | blocked | blocked |
| `sendBeacon`, CSS `url()` beacon, `<link rel=prefetch>`, `form.submit()` | call "succeeds", **0 requests reach the server** | same | same |
| `window.open`, `top.location =`, `alert` | no popup, no navigation, no dialog | same | same |
| `new Worker(blob:)`, `WebAssembly.compile`, `eval` | blocked by the CSP | blocked | blocked |
| forged `postMessage` to the parent / wrong nonce | ignored; only the port works | same | same |
| **Server hits during the whole probe** | **0** | **0** | **0** |

So the sandbox + CSP recipe of the brief holds in all three engines **for everything the probe tried — but not for self-navigation**
(review of this PR, reproduced on the P1 runtime): a sandboxed frame may always navigate itself (`location.replace(url)`,
`location.href =`, a clicked link, a `<meta http-equiv=refresh>`, a `data:` page), the request leaves, and the new page has no policy.
4 of 5 tricks reached the server in Chromium, Firefox and WebKit (`window.open` was already blocked). **Fix (P1):** the app's frame holds
only a wrapper document without scripts whose CSP says `frame-src 'none'`, and the mini-app runs in the wrapper's own sandboxed frame:
the embedder's `frame-src` blocks every navigation of the inner frame. With it, 0 requests in all three engines
(`tests/activities_app.js`, "self-navigation"); the mini-app's srcdoc inherits the wrapper's policy, so both list the same script hashes.

**But: an endless loop** (`while(true){}`) in the activity:

| | Chromium (full browser) | Firefox | WebKit |
|---|---|---|---|
| `srcdoc` sandboxed frame | **app stays responsive** (sandboxed frames get their own process) | **the whole app freezes** | **the whole app freezes** |
| frame from another site (`origin` mode) | app stays responsive | **freezes** | **freezes** |

(Chromium's *headless shell* also froze; the full browser did not. Firefox was tried with Fission switched on.)

**Plan change 2.** "A hostile Tier A app freezes only its own frame and is recoverable" is **false in Firefox and Safari**, whatever the
hosting mode; the watchdog cannot run while the app's own thread is blocked. → decision D3.

### Spike (a): Python (Pyodide 0.27.7 + numpy 2.0.2) inside an opaque-origin sandboxed runner

Runner = `srcdoc` iframe with `sandbox="allow-scripts"` and CSP `script-src 'unsafe-inline' 'wasm-unsafe-eval' <asset dir>; worker-src blob:; connect-src <asset dir>`;
it starts a `blob:` Worker that loads Pyodide from the app's own server, loads numpy with `checkIntegrity`, computes a Bode magnitude,
and then probes from Python.

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Assets **without** CORS headers | hangs silently (60 s, nothing) | hangs | hangs |
| Assets with `Access-Control-Allow-Origin: *` + `Cross-Origin-Resource-Policy: cross-origin` | works | works | works |
| Start of Python / numpy load | 2.7 s / 0.8 s | 3.0 s / 1.2 s | 2.3 s / 1.0 s |
| Result `20·log10\|H\|` of a 1 kHz low-pass at 1, 31.6, 1000, 31 623, 10⁶ rad/s | 0, −0.004, −3.01, −30.0, −60 dB | same | same |
| From Python: `js.self.origin` / `js.indexedDB.open` | `"null"` / blocked | same | same |
| `fetch` to anything but the asset folder | blocked by `connect-src` | blocked | blocked |

Sizes: `pyodide.asm.wasm` 10.1 MB, `python_stdlib.zip` 2.4 MB, `pyodide.asm.js` 1.3 MB, numpy wheel 3.1 MB → **≈ 17 MB** on first use.

**Plan change 3 (small).** It works as the brief proposed, with two additions: the asset folder must be served with the two headers above
(Netlify `_headers`), and the runner needs its own start-up timeout, because a missing header shows up as a silent hang, not an error.

### Spike (d): caching of large assets

The app has **no service worker**, so the brief's "cache with the service worker" has nothing to attach to. Serving the Pyodide folder
with `Cache-Control: public, max-age=31536000, immutable` under a versioned path made a second run work with the folder blocked in
Chromium, but the block may not have reached the runner's worker, so this is **not proven** yet. **Plan change 4:** no service worker is
added by this project (it would change how the whole app updates, a separate decision). Instead: Tier A and Tier B activities live inside
the pack (so they are offline exactly when the pack is, IndexedDB); the Python runtime uses versioned immutable URLs and the HTTP cache,
and P4 proves offline use with a real test before it claims it. On a `file://` copy and the one-file bundle Tier C is **not available**
(a `blob:` worker from an opaque origin cannot read `file://`), so those copies show the activity's fallback. → decision D9.

---

## 3. Decisions

**D1 · Compatibility with older apps (open decision 1).** Packs stay `v: 2` (a bump protects nobody). Instead:
1. `pack.requires` lists capabilities (`activities/v1`, `runtime:html-app@1`, `runtime:sim-spec@1`, `runtime:py-module@1`, `engine:circuit-mna@1`, …).
2. The new engine never crashes on an exercise type it does not know: it shows a small card "This exercise needs a newer version of the
   app" (and skips it in rounds). Same for a block. This also protects the next new type after `sim`.
3. When an app opens a pack whose `requires` names something it lacks, it runs the existing stale-tab check (`build.json`); if a newer
   build exists it reloads, otherwise it shows each activity's fallback.
4. Already deployed engines (open tabs that have not reloaded, old one-file bundles) can still break on a `sim` exercise. The window is
   **not** bounded by the stale-tab check alone: before P1 that check runs only while a signed-in tab polls a non-empty curriculum
   inbox (review of this PR). So the rollout is compatibility-first: P1 (the "newer" card, `requires`, `checkRequires()` on every pack
   open) is deployed before any pack with activities exists, and the content work starts only after the handback (days later). A pre-P1
   tab that is never reloaded can still break on one `sim` exercise view (no data is lost); **no degraded twins** are generated. Accepted.

**D2 · Where activities live (open decision 2).** Registry `pack.activities` (format `noema.activities/v1`, the brief's §5.1, ids
`[a-z0-9-]+`, never reused) with `sha256` + `bytes` per entry. In the subject folder: `activities/activities.json` +
`activities/<id>/…`. **Revised with the owner (P1): every bundle is inline in `pack.json`, like the pictures** (Tier A at most 512 KB,
a warning above 256 KB), with its `sha256` checked by the app before it mounts it and by the connector. No second upload path; the
mixed 64 KB rule was dropped because one path is simpler to test and the packs go through `noema_start_upload` (no 1.5 MB limit).

**D3 · Tier A runaway code (new, from spike c).** The host rewrites every loop of a Tier A app's inline scripts at mount time, adding a
time guard (`for`/`while`/`do`/`for … of`). Code the rewrite never saw cannot run: the CSP allows scripts **only by the hashes of the
rewritten scripts** (no `'unsafe-inline'`, no `'unsafe-eval'`), so inline handlers, `javascript:` URLs, scripts added at run time,
`eval` and `new Function` are refused by the browser (the spike's `'unsafe-inline'` policy is not the one P1 ships). **As built:** a small tokenizer (`engine/src/33_activity_guard.js`, no vendored parser)
that skips strings, template literals, comments and regular expressions and adds `G()&&(…)` to each loop condition; the scripts are
then allowed by their hashes in the frame's CSP, so only the guarded scripts can run. After 1.5 s of uninterrupted running, the guard throws and the bootstrap reports `error {code:"runaway"}`; the host then shows
*This activity stopped responding · Restart*. The lint also refuses obvious traps (`while(true)` without a `break`, huge array sizes,
`setInterval` at 0 ms). What the guard cannot catch (one huge regular expression, a giant allocation) is left to the browser's own
"page is not responding" prompt. Chromium additionally keeps the app alive on its own. Graded activities should prefer Tier B, where no
author code runs.

**D4 · Hosting mode (open decision 3).** `srcdoc` by default. The `origin` mode (a second static site with a `CSP: sandbox` header) is
kept behind `ACTIVITY_HOST_MODE` for P5; spike (c) shows it does not fix runaway code in Firefox/WebKit, so it is only defence in depth.

**D5 · Expression language (open decision 4).** In-house Pratt parser + AST interpreter: allow-listed functions, no `eval` /
`new Function`, `__proto__` / `constructor` / `prototype` refused at parse time, AST size ≤ 2000 nodes and depth ≤ 64, a step budget per
evaluation, plus a fuzz corpus. The same language and the same corpus in Python (`tools/simexpr.py`) so the validator, the replay harness
and the app agree.

**D6 · `pack_rules` for `sim` (open decision 5).** Opt-in: `sim` counts only when a chapter map lists it in `fits.types`; then
`minPerKind.sim = 1` (not the usual 3). It counts toward the `think` mix by its declared `think`; `unfit` reasons are allowed; every other
quota (recall ≤ 25 %, difficulty 20/25/55, paradigms) is unchanged. An `interactive` block is explained right after it (same check as
figures, Q7b: `figure.explained` gets an `interactive.explained` twin).

**D7 · Python packages (open decision 6, the owner's choice).** numpy + scipy + micropip, Pyodide 0.27.7 pinned, files self-hosted under
`engine/vendor/pyodide/0.27.7/` with their sha256 checked by the build (`checkIntegrity` for wheels). scipy and every extra load lazily,
only when an activity asks for them. `micropip` may install only from our own pinned, hash-checked package index and only allow-listed
packages, never from open PyPI; an activity that needs a downloaded package declares `requiresNetwork`, and the app tells the learner.
The security suite tests the pinned index and the allow-list (P4). **Offline (the owner, 2026-11-04):** activities without Python always work offline. The Pyodide
files, numpy and scipy are cached on the device after the first use by a small service worker (pinned files, sha256-checked), and Settings
offers "Prepare Python for offline" to download them ahead (never automatically on mobile data); packages installed through micropip are
cached the same way, so an activity opened before works offline and only a first use needs the network (`requiresNetwork` is shown only
then). `navigator.storage.persist()` is asked for; if the browser evicts the cache, the fallback shows until the device is online.

**D8 · Hints and live activities (open decisions 7, 8).** Each hint used multiplies the score by 0.85, with a floor of 0.5 (the owner's decisions doc, item 7); a hint never contains the answer
(the solvability harness searches every shipped string for it). At most 1 live activity on phones (< 720 px, the engine's existing
breakpoint), 2 on wider screens; the rest show their fallback with a "Start" button.

**D9 · Offline (new, from spike d).** See plan change 4. Documented in `INTERACTIVE.md`: "Tier A and B work wherever the pack works;
Tier C needs the website the first time and is unavailable in the one-file bundle".

**D11 · H5P items (the owner, 2026-11-04 17:33; phase P4b, before the handback).** A fourth runtime `h5p@1`: an ordinary `.h5p`
package (h5p.json + content/ + the content-type libraries) played by a pinned, self-hosted, sha256-checked H5P standalone player inside the
same sandboxed frame and CSP as `html-app@1` (never loaded from h5p.org). H5P's xAPI `answered`/`completed` statements with a score become
`result {score, passed}`; its saved user state maps to `state`. Validators allow-list the content types and refuse outside links and
scripts outside the libraries; every item keeps a fallback; its own texts need a version per pack language. Because an item with its
libraries often exceeds 512 KB, `.h5p` files travel beside the pack like the source files (the `noema_finish_upload` list), sha256-checked.
P4b starts with a spike: the player in the opaque sandbox, offline, in Chromium, Firefox and WebKit.

**D12 · The brief's §14 extension points are built (the owner, 2026-11-04 17:35; phase P6, after P1–P4b are done and verified).**
`wasm-module@1` (precompiled WASM in a worker) and `external-embed@1` (allow-listed third-party frames with licence/credit metadata, opt-in,
network needed) through `registerRuntime`; thermal, RF propagation, PID control-loop and digital-twin engines through `registerEngine`;
xAPI/cmi5 statements exported from the event log and an import of simple H5P content types into the existing exercise types; an
authoring UI generated from the same JSON Schemas as the validators.

**D10 · The authoring contract.** `docs/INTERACTIVE.md` (served by `noema_authoring_guide` as the new `part: "interactive"` and included in
`all`), a short section in `tools/CONTENT_SPEC.md` (the `interactive` block, the `sim` type, the Quality rules), `docs/INTERACTIVE_AUTHORING.md`
(the playbook), the skill's `SKILL.md` step, the connector's tool descriptions and instructions, `noema_pipeline` (a new `activities`
step with its check in `tools/pipelines/`), and the toolkit scripts `activity_new.py`, `activity_lint.py`, `activity_preview.py`,
`activity_test.py` (+ `make_pack.py` / `unpack.py` support). The handback summary (§16 of the brief) lists them.

---

## 4. Architecture (as in the brief, with the names it will have in the code)

* **Core** `engine/src/32_activities.js` (`ActivityHost`): lifecycle `prepare → mount → running ⇄ paused → destroy`, lazy mount with
  `IntersectionObserver`, the live limit (D8), the watchdog (ping every 2 s, restart after 3 misses or a `runaway` error), persistence,
  the event log, grading, theme / locale / reduced-motion plumbing, the "Skip activity" link, the fallback.
  * **Ports & adapters:** the core only knows the `RuntimeAdapter` port: `{ id, version, prepare(entry, bundle), mount(el, ctx) → session }`.
    `registerRuntime()` adds one; there is no `switch` on runtime ids in the core.
  * **Strategy:** graders `checks` and `reported` behind one `Grader` interface, `registerGrader()`.
  * **Event sourcing (lite):** per attempt an append-only capped log; derived state and the grade are pure functions of
    `{spec, seed, events}`, which is what makes the replay tests possible.
  * **Anti-corruption layer:** `engine/src/33_activity_protocol.js` is the only code that reads messages from an activity: JSON shape per
    `type` (a small schema checker generated from the JSON Schema files, since the engine has no build step for Ajv), size / rate limits,
    strikes, never `innerHTML`.
  * **Feature flags:** `NOEMA_CONFIG.activities = { 'html-app@1': true, 'sim-spec@1': true, 'py-module@1': false }` for staged rollout.
* **Runtimes:** `engine/activities/html_app.js` (Tier A), `engine/activities/sim_spec.js` + `engine/activities/sim_worker.js` and engines in
  `engine/activities/engines/` (Tier B; `registerEngine()`), `engine/activities/py_runner.js` (Tier C).
* **Schemas (schema-first, JSON Schema 2020-12)** in `tools/schemas/`: `noema.activities.v1.schema.json`, `noema.activity-protocol.v1.schema.json`,
  `sim-spec.v1.schema.json`, `noema.events.v1.schema.json`. Python validates with `jsonschema` when it is installed and otherwise with the
  same hand-written checks as `packcheck.js` (the repo's existing pattern: `validate.py` and `packcheck.js` keep the same rules).
* **Protocol** `noema.activity/v1`: exactly the brief's §8 (envelope, message table, limits). Handshake as tested in spike (c):
  `hello{nonce}` → host checks `event.source === iframe.contentWindow` and the nonce → `welcome` with one transferred `MessagePort` →
  everything else on the port.
* **Data model:** the brief's §5 shapes (`interactive` block, `sim` exercise with `activity`, `task`, `grade`, `hints`, `reveal`),
  `pack.requires`, strings `{"$t": "key"}` with the per-locale tables stored under `strings` in each translation file.

## 5. Test strategy

* **Security suite** (`tests/activities_sandbox.js`, Chromium + Firefox + WebKit): the spike (c) probe grows into the hostile twin of
  `alias-lab`; it must fail every attack, with 0 requests reaching the test server, plus the flood test (strikes then stop) and the runaway
  test (D3: the guard trips and Restart works in all three).
* **Contract tests:** the same fixture files checked by `validate.py` and `packcheck.js` (as `tests/pack_rules.js` does today).
* **Golden numeric tests** for the engines (RC vs `1 − e^(−t/RC)`, dividers, RLC, documented tolerances); **replay tests** for every graded
  `sim` (`solutions/*.events.json` must pass, `wrongs/*.events.json` must fail, the answer must not appear in any shipped string or field).
* **Round trip:** subject folder → `make_pack.py` → `.noema.zip` → app import → `unpack.py` → identical folder.
* **Accessibility:** axe on the host harness for each reference activity (axe-core vendored for tests only).
* CI = `tests/run_e2e.sh` (the repo has no hosted CI); `tests/lang_frame.js` stays skipped. Firefox and WebKit need
  `playwright install firefox webkit` (+ `install-deps webkit`) once per machine; the suites skip with a notice when they are missing.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Runaway Tier A code freezes the app in Firefox/Safari | D3 loop guards + lint; Tier B preferred for graded work |
| Stale deployed tabs crash on `sim` | short window (stale-tab reload); D1 makes every future type safe |
| Pyodide is 17 MB and 3–4 s to start | lazy, only when a Tier C activity is opened, visible progress, HTTP cache, numpy only |
| The MNA circuit engine is the largest piece (P3) | golden tests against hand calculations and analytic solutions; parts added in stages |
| Content author misses a rule | every rule lives in the contract (`INTERACTIVE.md`) **and** is checked by the lint / validator / pipeline step |
| Learner data from activities grows | state ≤ 256 KB, log ≤ 2000 events / attempt, only the last attempt's log kept per exercise |

## 7. Phases (one PR each)

P1 core + Tier A (+ `alias-lab`, security suite, D1 safety cards, pack/upload/unpack, contract v1) · P2 Tier B S1 (+ `rc-step-explorer`) ·
P3 circuit bench (+ `fault-bench-led-driver`, replay harness) · P4 Tier C (+ `filter-designer-py`, offline proof) · P5 S3 engines, origin
mode, audits. The content work (the electronics Roadmap) starts only after the handback of the brief's §16.
