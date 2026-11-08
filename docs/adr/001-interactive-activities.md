# ADR 001 · Interactive activities in packs (mini-apps, minigames, simulations)

* **Status:** accepted (2026-11-04). The owner approved the four plan changes in §2; P1 (core + `html-app@1`) and P2 (`sim-spec@1`, the
  expression language, the `checks` grader, `registerEngine`) are implemented (§8 "As built"), P3 (`circuit-mna@1`, §9) and P4 (`py-module@1`, on by default since batch 1, §10) and P4b (`h5p@1`, §11). Where this record and the owner's
  decisions doc differ, the doc wins (items 6 and 7 are applied below: D7, D8).
  The P6 runtimes of D12 (`wasm-module@1` + engine `wasm@1`, `external-embed@1`, the xAPI export, the H5P import) are built: §13; the P6 engines (`thermal@1`, `pid@1`, `rf@1`, `twin@1`) §12, the authoring UI §14.
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
P4b starts with a spike: the player in the opaque sandbox, offline, in Chromium, Firefox and WebKit. **Status: implemented** (§11
"As built — P4b"; docs/INTERACTIVE_H5P.md). Licence (the owner, 2026-11-04): ship it, with the H5P core's readable GPL-3.0 source
beside the player and its notice; on by default.

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
  * **Feature flags:** `NOEMA_CONFIG.activities = { 'html-app@1': true, 'sim-spec@1': true, 'py-module@1': false }` for staged rollout (as built: every runtime on by default, py-module@1 since batch 1, §10).
* **Runtimes:** `engine/activities/html_app.js` (Tier A), `engine/activities/sim_spec.js` + `engine/activities/sim_worker.js` and engines in
  `engine/activities/engines/` (Tier B; `registerEngine()`), `engine/activities/py_runner.js` (Tier C).
* **Schemas (schema-first, JSON Schema 2020-12)** in `src/contracts/schemas/`: `noema.activities.v1.schema.json`, `noema.activity-protocol.v1.schema.json`,
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

## 8. As built — P2 (`sim-spec@1`, 2026-11-04)

* **No frame.** A spec is data: the app's own code (`engine/src/35_activity_sim.js`) renders the controls, readouts and plots in the
  page with the app's DOM, styles and tokens, and computes them with NoemaExpr and the registered engines. Nothing of the pack is
  ever executed or put in the page as HTML (labels are text nodes, plots are SVG built element by element), so the sandbox, the CSP
  and the loop guard that protect the app from *code* have nothing to guard here; a frame would only cost what the brief wanted
  tier B for — the app's look, dark mode, the 320 px layout, the keyboard and screen-reader behaviour of real form controls — and a
  second rendering path to keep in step. The trust boundary moves to the **spec check**: before anything is shown the runtime runs
  `NoemaPackCheck.checkSimSpec` (the same rules as `tools/activities.py check_spec`, which the connector and `make_pack.py` run too)
  and the engine's own `check`; a spec that fails, or an engine this app does not have, shows the fallback. Every expression is
  compiled by NoemaExpr (no `eval`, ≤ 2000 nodes, no loops); a function plot evaluates at most 2000 points per line.
* **Engines.** `ACT.registerEngine({ id, check?, create, workerSource? })`. `formula@1` is built in (the derived values are the model).
  An engine with `workerSource` runs in a `blob:` Worker (tested in Chromium, Firefox and WebKit from the `file://` app; if a browser
  refuses the worker the engine runs inline), latest inputs win, a run over 5 s terminates the worker and stops the activity
  (Restart). Formulas run inline. The circuit engine (P3) registers through the same hook; the validators' `ENGINES` lists
  (Python and JS) must name it too. `pack.requires` lists `engine:<id>` for every engine but `formula@1`, and `checkRequires()` now
  checks engines like runtimes (`ACT.caps()` includes `engine:<id>` of every registered engine).
* **Protocol.** The runtime talks to the core with the ACTP messages of every runtime (`ready`, `pong`, `state`, `event`; `pause`,
  `resume`, `destroy`), so the live limit, the watchdog, pausing offscreen, S.act (the values of the controls) and S.att (events
  `param` / `reset`) are unchanged. The core learned `autoHeight` (a runtime that renders in the page takes its own height) and three
  failure codes: `unsupported` (→ "cannot run in this version", no Restart), `spec` (→ "could not start", no Restart), `runaway`.
* **The checks grader** (`registerGrader('checks')`) evaluates `grade.checks[].expr` on `port.values()` (consts, params, derived,
  scalar outputs); score = the weighted share × 0.85 per hint (floor 0.5); passed = share ≥ `pass` (default 1); nothing changed yet →
  `null` (Check waits, as for `reported`). The exercise shows "n of m conditions met" and each labelled check with ✓ / ✗. The
  validators refuse `checks` for runtimes that cannot expose values (html-app@1) and `reported` for sim-spec@1.
* **Found on the way:** a sim session whose card had left the page was torn down up to 2 s later and saved its attempt over the
  newer attempt of the next card; `saveAttempt` now keeps an attempt begun later (`t0`). Playwright cannot reach a sandboxed
  `srcdoc` frame nested in another one in the full Chromium on a `file://` page (sandboxed frames get their own process); the app
  test runs the full Chromium with `--disable-features=IsolateSandboxedIframes` (the loop guard, not the process model, is what
  stops runaway code, as in Firefox and WebKit).

## 9. As built — P3 (`circuit-mna@1` and the fault-finding bench, 2026-11-04)

* **The engine in sim-spec.** `src/engines/circuit/circuit.js` (NoemaCircuit: MNA, Newton, trapezoidal transients, faults,
  instruments, seeded noise) is registered by `src/engines/circuit/sim.js` as `circuit-mna@1` with `{bench: true, check,
  prepare, create, workerSource}`. `workerSource` is the engine's own source (`NoemaCircuit.source()`, the module's
  `Function.toString`) plus the adapter's: one copy of the code, the same in the page and in the worker. `prepare` evaluates the
  spec's expressions (bindings, transient times, `at`) with the app's NoemaExpr on the main thread, so the worker gets numbers only
  and needs no expression language. The model is `{netlist, bindings, transient, noise}`; outputs are node/branch series, DC or
  transient scalars (`at`, `stat`) and probe readings (docs/INTERACTIVE_CIRCUIT.md §1).
* **A bench is a minimal extension of the spec** (`spec.bench`: faults, points, instruments, budget, diagnosis) rendered by the
  sim-spec runtime itself (`makeBench` in 35_activity_sim.js), for engines that declare `bench: true`; the engine adds
  `measure(inputs, probe)` next to `run`. The runner queues runs and measurements: the latest run wins, measurements are first in,
  first out, and every result still passes the P2 gate (`values()` is null while the latest inputs are not computed). The bench's
  values `diagnosis`, `measurements`, `correct` join the checks' names only (not readouts or marks, never declarable), and
  `values()` stays null until a diagnosis is chosen, so Check waits.
* **The hidden fault.** It is picked in the runtime's closure (`task.params.fault`: an id or a list, else all faults; drawn by the
  seed) and reaches the engine only as the change to the circuit (`opts.faults`). No label, log entry, event, saved state or value
  names it before the diagnosis; `R.sim.reveal()` (Check) and "Check my diagnosis" call `port.reveal()`, the only place that words
  it. The comparison (`correct`) is made in the runtime. The spec in the pack lists the faults — a learner with the developer tools
  can read them, as they can read any exercise's answer; nothing a learner reads in the UI reveals it (tests/activities_app.js
  checks the page's HTML and text before the diagnosis, and the saved state).
* **New fault kind `reverse`** (a part soldered the other way round: two pins swap), needed by the LED bench; `checkFaults` lists
  what `create` would throw, and `tools/circuit.py` is its Python twin (and of `check` and `num`), so `tools/activities.py` and
  `engine/packcheck.js` check a circuit spec with the same messages (`tests/activities.js` compares them on 39 circuit specs and on
  netlist and fault corpora). `NoemaCircuit` is now loaded beside packcheck.js wherever NoemaExpr is (the shell, the site, the
  one-file bundle, the connector), so a circuit pack is checked before any subject is open.
* **Reference activities** `rc-transient` (RC charging from a pulse source, the "63 % at 1 ms" exercise) and `led-bench` (5 V, a
  switch, 330 Ω, a red LED; faults LED reversed / open, resistor open / ×10, an open track); `activity_new.py --from` starts from
  either; the harness has `measure` / `diagnose` steps and `readings` / `log` expectations.
* **Found on the way:** the harness's host page replaced `{name}` placeholders with a regex written inside a template literal, which
  lost its backslashes (no host string with a placeholder was ever filled); with four activities in one section the two live slots
  are taken by the first ones in view, so the app test presses Start on a parked block (as a learner would).

## 10. As built — P4 (`py-module@1`, Python, 2026-11-04)

* **The binding: a spec drawn by the app, numbers from Python.** A py-module@1 item carries `python` (its `main.py`, inline with
  `sha256` and `bytes`), `packages` (⊆ numpy, scipy and the allow-listed extras of `tools/pywheels_allow.json`), `requiresNetwork`
  (required `true` with an extra), `stepMs` (100–10 000) and a `spec` in the sim-spec@1 format without `engine`, `model` or `bench` and
  with at least one `output`. The app mounts the sim-spec view of 35_activity_sim.js (`ACT.simView`, the P2 runtime turned into a
  function with an optional host: its engine id, its spec check, its runner, extra state, a decoration) with a runner that calls
  Python's `step(inputs, state)` one at a time, the latest inputs winning. So the learner gets the app's own controls, readouts and
  plots (theme, 360 px, keyboard, screen reader) and **the checks grader works on Python's outputs unchanged** (the P2 rev gate keeps
  Check on the latest results); `reported` through `noema.result` also works. One hidden runner frame per mounted activity (the D8
  live limit applies). A pack-authored Python UI (an html-app talking to Python) was not built: no case needed it, and it would bring
  back everything sim-spec@1 makes automatic.
* **The validators** (`engine/packcheck.js` `lintPython`, `checkSimSpec(..., {python: true})`; `tools/activities.py` the twin, the
  same messages — tests/activities.js compares them on 33 items): a top-level `def step(` is required, no network, `js`/`pyodide_js`,
  `micropip` or `input()`, every imported package declared, ≤ 256 KB; `while True` and `time.sleep` warn. `make_pack.py` puts main.py
  inline and adds `runtime:py-module@1` to `pack.requires`; `unpack.py` writes main.py and spec.json back byte for byte.
* **The flag (ADR §4 "Feature flags").** `NOEMA_CONFIG.activities['py-module@1']` was false at first for the staged rollout; it is
  **true by default** since batch 1 (P2–P4b together), once tests/activities_py.js, tests/activities_app.js and the harness passed in
  Chromium, Firefox and WebKit and the deploy carries the Python files (the owner asked for Python with offline support).
  `false` in config.js switches it off: the item shows its fallback ("cannot run in this version") and the Settings line is hidden; on,
  `ACT.enabled()` also needs `NoemaPy.available()` (an http(s) secure origin with Cache Storage, a Worker, WebAssembly, not
  `window.NOEMA_BUNDLE`), otherwise the fallback says Python works only on the website.
* **The learner's side.** One quiet line above the controls: the first-use size from the manifest (`NoemaPy.need`), the
  requiresNetwork note, loading progress, a "Download … and start" button on Save-Data or cellular. Failures map to the core's
  fallback with a reason (`failText`: offline → "not on this device yet, and there is no connection" + Restart; timeout → slow +
  Restart). Settings: a section in the backup view (its header has a line icon, `accSection({ line: 'download' }, …)`, no emoji) (`accView('backup')`, so the classic Backup tab and the shell's Me › Data and
  sync), one line with a pill, the size on the device and the Prepare button with a progress bar; the per-part detail and whether
  `persist()` was granted are in its ⓘ. All words in the 15 UI catalogs.
* **Deploy.** `build_site` writes the app's one service worker `/sw.js` (from `src/composition/sw.ts`; it replaced the separate
  `engine/pyodide-sw.js` in phase 1 of the redesign) and the Python headers into the real `_headers` (immutable versioned files, a no-cache manifest, `application/wasm`); `netlify.toml` runs
  `tools/fetch_pyodide.py` after the site build with the downloads in Netlify's build cache, and a failed fetch only prints a warning
  (the deploy goes out; Python activities show their fallback there). `docs/activities-dev/pyodide.md` and its headers file are folded
  into `docs/INTERACTIVE_PYTHON.md`, which the connector's 'interactive' guide and the skill's references now include.
* **Reference activity** `py-filter` (numpy: a moving average of N samples or a first-order filter at 8 kHz; the exercise asks for a
  filter that removes a 1 kHz tone while 300 Hz loses < 3 dB: N = 8 passes, N = 16 removes the tone but loses 6 dB). The harness runs
  py-module@1 over a local http server when `NOEMA_PYODIDE_SITE` (or `dist/site`) has the files, and skips them otherwise (exit 2 when
  nothing else was checked).

## 11. As built — P4b (`h5p@1`, 2026-11-04)

* **The runtime** is the spike's (`engine/src/38_activity_h5p.js`, `window.NoemaH5P`: unzip, check, load, mount; the vendored player
  `engine/vendor/h5p/3.8.2/`), unchanged in its security model: the item frame is opaque, offline, scripts by hash, inside the
  navigation-blocking wrapper; xAPI → `result` / `event` / `state` (docs/INTERACTIVE_H5P.md §3). It registers itself whenever it is
  in the engine (on by default; `NOEMA_CONFIG.activities['h5p@1'] = false` turns it off).
* **One rule set, two languages.** `tools/activities.py` and `engine/packcheck.js` accept `h5p@1` with the same messages
  (`tests/activities.js` compares them): `entry` = `activities/<id>/item.h5p`, `sha256` + `bytes` (≤ 100 MB) + `fallback` required,
  no `html`, `strings` optional, `h5pByLocale` keys checked against the pack's languages and one required per translation. The
  package rules run on the file through `tools/h5p_check.py` (`check_h5p_packages`) and `NoemaH5P.check` (`checkActivityPackages`,
  async: the connector and the app load `38_activity_h5p.js` beside packcheck.js; in Node it loads with `window = globalThis`), against
  one allow-list (`tools/h5p_allow.json`, the engine's copy checked equal). Parity is checked on 16 packages (the fixtures and hostile
  variants, a wrong sha256 / size, a missing file, translations).
* **The file travels beside the pack**, never inline in the registry: the `.noema.zip` entry `activities/<id>/item.h5p` (stored, byte
  for byte; `make_pack.py`, the app's Export and the job bundles), the account path `<uid>/packs/<subject>/<entry>` (the connector's
  `noema_finish_upload` lists the missing files with curl commands and checks size, sha256 and the package rules before it accepts
  the pack; the app's upload puts it at the same path), IndexedDB `noema-files` on the device (key `act|<account>|<subject>|<sha256>`),
  and beside `pack.js` on the website (`build.py site`). When a pack opens, `NoemaSrcFiles.wireActivities` gives each item a
  non-enumerable loader `act.h5p` (never stored, synced or exported) and reads the file early (device → account → URL), verified by
  sha256. The host page reads it; the frame never fetches. Import, job results and deleting a subject handle the files too.
* **Languages** are the item's own `content.json` translated (`activities/<id>/content.<locale>.json`, inline in `h5pByLocale`;
  optional `l10n.<locale>.json`); another whole package per language stays possible (`{h5p, sha256}`).
* **The one-file bundle** inlines the player and every h5p@1 file up to `NOEMA_H5P_INLINE_MAX` (2 MB) as base64 (a non-enumerable
  `h5p`); a bigger one gets `null` and shows its fallback.
* **Toolkit:** `activity_new.py --runtime h5p@1 [--from FILE.h5p]` (reference activity `planets-quiz`, from the CC0 fixture, in
  English, Greek and Russian), `activity_lint.py` runs the package rules, `activity_test.py` / `activity_preview.py` play the item
  through the harness in every language (the player and runtime ship in the skill zip with `h5p_check.py` and `h5p_allow.json`).
* **Licence:** the H5P core (h5p/h5p-php-library, Joubel / H5P Group) is GPL-3.0. `frame.bundle.js`, the tested build, is kept as
  the code that runs; its readable source (the unminified core files and jQuery of h5p-standalone v3.8.2, `src/frame.ts` and
  `webpack.common.js`) is vendored beside it in `engine/vendor/h5p/3.8.2/source/` with the GPL-3.0 text, each file pinned by sha256 in
  `tools/fetch_h5p.py`; `LICENSE-NOTICE.txt` says who, what, where the source is and that the core runs only in its own sandboxed
  frame. jQuery and h5p-standalone keep their MIT notices; the content-type libraries come inside each package with their own.
* **Not done:** a pack shared by link does not carry its `.h5p` files (the receiver sees the fallbacks); the `fetch`/XHR shim for
  library assets asked for by URL (SingleChoiceSet's sounds); QuestionSet, InteractiveVideo, BranchingScenario and
  CoursePresentation are allowed but not yet tested.

## 12. As built — P6 engines (`thermal@1`, `pid@1`, `rf@1`, `twin@1`, 2026-11-04)

* **Registration like `circuit-mna@1`.** The four engines (`src/engines/thermal/thermal.js` … `src/engines/twin/twin.js`, each with its
  Python twin `tools/{thermal,pid,rf,twin}.py`) are registered by `engine/src/43_page_runtimes.js`, one `ACT.registerEngine(…engine)`
  each: `{id, check, prepare, create, workerSource}`, and `bench: true` for `twin@1`. Every run is in a Worker built from the
  engine's own source; `prepare` evaluates the expressions on the main thread. Formats and APIs: `docs/INTERACTIVE_ENGINES.md`
  (folded from the four development notes, now removed).
* **Validators.** `ENGINES` in `engine/packcheck.js` and `tools/activities.py` lists the four; `BENCH_ENGINES` is
  `{circuit-mna@1, twin@1}`. Each validator calls the engine's own spec check (`checkSpec` / `check_spec`) and reports its errors as
  `spec.<path>: <msg>`. The engines take any non-empty text as an expression, so the validators check every expression of the
  model as formulas over the spec's names: each binding's `expr`, and for the timed engines (`thermal@1`, `pid@1`) the
  transient's `tEnd` / `dt` and every output's `at`. `tests/activities.js` compares JS and Python on 54 P6 specs (15 thermal, 11
  pid, 10 rf, 18 twin, with benches), checks that both validators list the same engines, that the worker's source gives the
  page's numbers, and that `pack.requires` gets `engine:<id>`.
* **The twin bench is a minimal extension of P3's.** Points are `vbat`, `vload`, `i` and `gnd`; `V` reads `vbat` / `vload`
  against `gnd`; `I` is the average supply current on one part `{"element": "battery"}`; the scope shows the supply current (the
  engine's result now carries `unit: 'A'`, and the face labels its axis "Current (A)"); two new device-level instruments, `log`
  (resets, lost messages, overrun wake-ups) and `rssi` (dBm), take only `kind` and hide the lead rows. The faults go through
  `NoemaTwin.checkFaults` / `twin.check_faults`. Four new UI strings (`engine.act.bench.inst.log`, `…inst.rssi`,
  `engine.act.bench.current`, `engine.act.bench.logStats`) are in every UI language. Not covered: the twin's sensor faults
  (`sensor-stuck`, `sensor-drift`) change only the readings the server receives, and no bench instrument shows those; a bench
  should not list them (INTERACTIVE_AUTHORING.md).
* **Loaded wherever NoemaCircuit is.** The four engine files sit beside `packcheck.js` in the shell (`index.html`), the site, the
  one-file bundle and the MCP connector (`tools/build.py`, `tests/connector.js`); the skill zip ships the Python twins next to
  `activities.py`, and the activity harness loads the engines and `engine/src/43_page_runtimes.js` after the circuit engine.
* **Reference activities** `heatsink` (thermal), `pid-tune`, `lora-link` and `sensor-node` (twin), each with en/el/ru/fr strings, a
  fallback picture and text and six `tests.json` cases; `tests/activities_pack.py` builds them into a pack (11 activities with
  wasm-oscillator, py-filter and planets-quiz) and back; `activity_new.py --from heatsink | pid-tune | lora-link | sensor-node` starts from them.
  Found on the way: a short wake period over a long simulated month exceeds the twin's event budget (NaN), so `sensor-node`'s
  slider starts at 30 s; `digits` must be 1–8, so a readout of whole days is `round(life / 86400)` with `digits: 4`.
* **Browser tests.** `tests/activities_app.js` has a section (`p6engines`): the engine capabilities, each of the four blocks
  against the engine on the page, eight graded tries and the twin bench on a modified `sensor-node` (five instruments, the
  readings, the hidden lead rows, the current scope, the verdict); it passes in Chromium, Firefox and WebKit (batch P6).

## 13. As built — P6 runtimes (`wasm-module@1`, `external-embed@1`, xAPI, H5P import; 2026-11-04)

* **`wasm-module@1` is a sim-spec, not a page of its own.** The module only computes; the page is always the sim runtime's
  renderer, through the engine `wasm@1` (`engine/src/44_activity_wasm.js`, `docs/INTERACTIVE_WASM.md`). An item with its own
  `spec` is a whole activity (the runtime completes the spec: `engine: "wasm@1"`, `model.module` = the item); an item without one
  is a module only, used by another sim-spec's `model.module`, and the validators refuse it in a block or a sim (it shows nothing).
  The module gets no imports but a host ABI of three functions and one memory; the bytes are checked twice (our binary reader on
  the page, `WebAssembly.Module.imports()` in the worker) and the worker removes every network global before anything runs —
  the app has no CSP to lean on (§1). `tools/wasm_check.py` is the Python twin of the reader (same codes, same messages).
  Failures reuse the core's codes, so the runtime adds no UI words. Reference activity `wasm-oscillator` (a damped oscillator,
  `tests/fixtures/wasm/osc.wat`): `activity_new.py --from wasm-oscillator`; the harness runs the module in a real worker.
* **`external-embed@1` is opt-in, explore only and asks first** (`45_activity_embed.js`, `docs/INTERACTIVE_EMBED.md`). It registers
  only with `NOEMA_CONFIG.activities['external-embed@1'] === true` (not set in the shipped `config.js`), so by D1 every pack shows
  the fallback until a site owner turns it on. The allow-list `tools/embed_allow.json` has PhET, GeoGebra and Desmos allowed;
  **Falstad, CircuitJS and Wokwi pending** (refused: their terms do not address framing). The licence limits are recorded in
  `docs/INTERACTIVE.md` §1 (PhET CC BY, newer sims CC BY-NC; GeoGebra non-commercial; Desmos ToS restrict commercial use) and the
  validators warn `license-nc`. The core maps the runtime's failures: `embed-refused` / `embed-graded` stop without Restart,
  `embed-offline` / `embed-timeout` with Restart. Consent is an account setting (`S.settings.embedOk`); Me › Data and sync shows one
  quiet line with an ⓘ and "Ask again" (`NoemaEmbed.consent`). The card's words are in the engine catalogue in every UI language.
* **No site CSP was added.** What a future one must allow is written down (`docs/INTERACTIVE_EMBED.md` §6): `frame-src 'self'` +
  the allowed providers' origins generated from the allow-list; `'wasm-unsafe-eval'` and `worker-src blob:`.
* **One validator rule set, four places.** `NoemaWasm` and `NoemaEmbed` are loaded beside `packcheck.js` wherever it runs (the
  shell, the site, the one-file bundle, the connector); `engine/packcheck.js` and `tools/activities.py` call them (and
  `wasm_check.py` / `embed_check.py`) and add the pack rules (`sim-embed`, a module without a spec, a spec naming another
  module, `reported` impossible: the module reports nothing). `tests/activities.js` compares the messages on 27 packs.
  `make_pack.py` inlines `module.wasm` as base64 + sha256; `unpack.py` writes it back byte for byte; an embed has no file.
  `45_activity_embed.js` declares `var NoemaEmbed`, because the app loads it both on its own (for packcheck) and inside `engine.js`.
* **xAPI export** (`43_xapi.js`, `docs/INTERACTIVE_XAPI.md`): the subject's ⋮ menu has "Export learning record (xAPI)"; it
  writes `<subject>.xapi.json` (`noema.xapi-export/v1`, xAPI 1.0.3 statements from the learning log's attempts and answers). The actor is
  `{account: {homePage: <site>, name: <account id>}}` — never an e-mail. Next to it **Course package for an LMS (cmi5)**
  downloads `<subject>.cmi5.zip` (cmi5.xml, zipped with JSZip like the package export); an LMS launch is not implemented, and
  there is no LRS posting. The shell's "My subjects" ⋮ has both items too (from the subject's saved state and pack:
  `NoemaXAPI.subjectRecord` / `subjectCmi5`, so both menus write the same files; `43_xapi.js` declares `var` and is loaded by the
  shell as well).
* **H5P import** (`tools/h5p_import.py`, in the toolkit): `.h5p` quizzes become the pack's own exercise types; the playbook
  (`INTERACTIVE_AUTHORING.md` "Importing H5P quizzes"), `SKILL.md`, `CONTENT_SPEC.md`, `docs/PIPELINES.md` and the connector's
  instructions say that an import is a draft of exercises of the sources to which every rule Q1–Q8 still applies.
* **Docs** `docs/INTERACTIVE_WASM.md`, `INTERACTIVE_EMBED.md`, `INTERACTIVE_XAPI.md` (folded from `docs/activities-dev/`) are in the
  skill's references and in the connector guide's part `interactive`.
* **A card holds no live slot.** A runtime may declare `waits(act)`: while it shows only a card (external-embed@1 before consent)
  the core neither parks another activity for it nor counts it toward the two (one on a phone) live activities; the runtime calls
  `ctx.onLive()` when it opens its frame, and only then does the core make room.
* **Batch P6 (2026-11-04).** Engines, runtimes and the author merged; every browser check ran in Chromium, Firefox and WebKit.
  Found: `wasm@1` looked for module-only items on `window.ACT`, which the app (engine.js declares `const ACT`) does not have — a
  spec naming a module-only item was refused in the app (now the global binding); the wasm-oscillator exercise collided with
  heatsink's id in the test pack (now `ch01-e908`).
  Merged with batch 1 (P2–P4b, #56): `checkSimSpec(spec, tables, engines, opts)` takes `{python, items}` (both sides had
  added a fourth argument); py-filter's exercise moved from `ch01-e904` (heatsink's) to `ch01-e911`.
* **Left for later:** a site CSP; engine-specific host words (`engine.act.wasm.*`) for an emulator UI built on `NoemaWasm.load`;
  a cmi5 launch from an LMS.

## 14. As built — P6 (the authoring UI, 2026-11-04)

* **A route, not a page of its own.** The preview must be the real `sim-spec@1` runtime, which lives in `engine.js` and starts only
  with a subject open, so the author is the engine route `#/author` (`authorView` in `engine/src/40_views.js`; `author` is one of
  the shell's `ENGINE_ROUTES`, so the frame draws it with `shellChrome({ sub: true, crumbs: [[Activity author]] })`). It works
  with any subject open and never changes that subject: the activity leaves the device only as the downloaded folder.
* **One quiet way in**: subject ⋮ › *Create an activity* (line icon `wrench`, a one-line explanation under it), next to Edit —
  where docs/UI_MAP.md keeps the tools that change content. No button on the subject page, nothing in Me.
* **Loaded on first use.** `schemaform.js`, `activity_author_schemas.js`, `activity_author.js` and `activity_author.css` (≈ 110 KB)
  are fetched from `NOEMA_ENGINE_BASE` the first time the route opens (the pattern of the language UI); the site copies them, the
  one-file bundle has them inline. Leaving the route destroys the page (its keys, its preview session).
* **The schemas** are copied into `engine/activity_author_schemas.js` by `tools/build.py` (a `file://` page cannot fetch them);
  `python3 tools/build.py --author-schemas` prints the copy, and `tests/activity_author.js` checks that the committed one is current.
* **The words are engine strings.** The 287 `engine.author.*` keys (UI, field labels `f.<schema title>` / `p.<netlist property>`,
  help lines `h.*`, schema messages `v.<keyword>`) live in `i18n/engine/en.arb` with descriptions and are drafted in all 14 other UI
  locales (`i18n/engine/drafts/`); the page reads them through `NoemaI18n` like every engine text (the side table it was written
  with is gone; a key the catalog lacks gives `null`, so a label falls back to the field's own name). Keys built at run time are
  covered by `engine.author.*` in `i18n/engine/dynamic_keys.txt`.
* **Tests.** `tests/activity_author.js` (Node: schemas against the validators, the form generator, files / zip, the words in every
  locale) and `--browser <prepared repo>` from `tests/run_e2e.sh`: `#/author` in the built site, the classic router and the frame
  (subject ⋮ › Create an activity, the crumbs, 320 px), rc-lowpass built from scratch, the preview, undo / redo, the .zip through
  `activity_lint.py`, dark mode.

## 15. Addendum — the engine library and requests for new engines (2026-11-05)

Decision (ANR, 2026-11-05): of three ways to make simulations general (A: only free code and formulas; B: a new engine built on
request for each subject; Γ: a library of general engines), **Γ is the canonical way, with A always inside it and B as a button**.

- **Γ, the library** (`docs/INTERACTIVE_LIBRARY.md`): general engines, each for a whole family of subjects — mathematics (`formula@1`,
  `ode@1`, `prob@1`, `graph@1`, `geom@1`), life sciences and medicine (`genetics@1`, `seq@1`, `med@1`, `clinic@1` — clinical reasoning,
  its own engine and the deepest — `anatomy@1`), humanities, arts and crafts (`timeline@1` with every calendar first-class, `music@1`,
  `map@1`, `text@1`, `craft@1`). One contract (`src/engines/kernel/core.js` + a module per engine + a Python twin of its checks), new output kinds
  `scene` and `sound` and line styles for library engines only. Models follow current published science; every source, validity
  range and "check before release" value is in the engine's chapter (`docs/library/<name>.md`).
- **A, the free way**, stays: `formula@1` is in the library; `html-app@1` and `py-module@1` when no engine fits.
- **B, requests**: `#/engines` (the catalogue, *Request a new engine*, the answers), the table `noema_engine_requests`, and three new,
  separate connector tools (`noema_request_engine`, `noema_engine_requests`, `noema_engine_request_update`); the app's admins answer.
- **Additive only**: no existing spec, message, engine or tool changes; the validators keep every old message word for word.
- **External code** is allowed for any engine (also the P3–P6 ones) when it is robust and free (MIT, BSD, Apache-2.0, ISC, public
  domain): vendored and pinned under `engine/vendor/`, with its licence, runnable in the Worker, no network.
- **Engines in mini-apps** (ANR, 2026-11-05): an `html-app@1` item may list engines of the library (`"engines": ["graph@1"]`) and call
  them with `noema.engine(id).run(spec, inputs)`. The frame's policy is unchanged (no Worker, no network): the HOST checks each
  request and runs the model in the engine's own Worker (the sim runner, 5 s, ended on unmount), only for declared library engines
  (never `formula@1` or a plugin with hidden faults), and returns only the named outputs, ≤ 512 KB (`docs/INTERACTIVE.md` §8.1).

## 16. Addendum — parts: several engines in one spec (2026-11-07)

Decision (the owner, 2026-11-07): a `sim-spec@1` spec may combine engines as **parts** (`docs/INTERACTIVE.md` §12.8), additive only:
a spec without `parts` is checked, run and graded exactly as before, and every old message stays word for word.

- **Data, not code.** Parts, their inputs and the coupling (`couple`: a chain, fixed-point loops, a co-simulation) are data checked
  by both validators with the same messages; every formula is NoemaExpr's. Undeclared cycles are refused, with the cycle named.
- **The stepper contract** (`docs/INTERACTIVE_LIBRARY.md` §1.6) is an optional `stepper` of `makeEngine`: `init`, `step`, optional
  `snapshot` / `restore` / `output` / `onEvent`, the signature of `NoemaSimKit.stepper`. Only engines with one may be co-simulated
  (`STEPPERS`, the same list in both validators).
- **Runtime.** `ACT.partsRunner` (35_activity_sim.js) runs the plan: one engine instance and Worker per part (each job ≤ 5 s), the
  whole graph ≤ 5 s, the latest inputs win. A loop that does not settle or a part that fails gives NaN and a visible note
  (`engine.act.sim.noConverge`, `engine.act.sim.partFailed`), never a crash or a stale value.
- **Reuse.** `activities/_parts/<name>.json`, referenced with `use` / `with`, travels as `pack.activities.parts` (hashed with the
  pack); every part's engine goes into `pack.requires`.
- **Mini-apps.** `noema.sim(spec).run(inputs)` (message `sim:run`) runs a spec with parts through the same orchestrator, only with
  engines the item declares, under the same host checks as `noema.engine` (§15).
- **Tests.** `tests/parts.js` (the plan, both validators on `tests/fixtures/parts_cases.json`, the steppers, the orchestrator, the
  mini-app bridge, the three references), `tests/activities_pack.py` (the `_parts` round trip) and the activity harness in Chromium.

## 17. Addendum — the engines as ES modules, plugins of the microkernel (2026-11-07)

The sections above describe the engines as page scripts (`engine/src/35–49_*.js`, globals such as `NoemaCircuit`, `NoemaLibCore`,
a Worker source made with `Function.toString`). They are now ES modules in `src/engines/<name>/` (the shared kernel in
`src/engines/kernel/`), each a plugin of the microkernel (`src/plugins`, one line of `src/engines/plugins.ts`: its manifest
`engine:<id>`, its module, its Worker bundle). The page reaches them only through `NoemaCore.engines` (`src/engines/library.ts`):
`ids()`, `load(ids)` (lazy: an activity loads the engines it needs before it starts; `packcheck.js` loads `enginesNamed(pack)` before
checking a pack), `loaded(id)`, `engine(id)`, `catalog`, `expr`, `schema()`. A Worker runs the engine's **Worker bundle**, built by
esbuild from the same module (`noemaWorkers` in `tools/esbuild.mjs`), so the page and the Worker still run one copy of the
code. The library is in three entries of `tools/esbuild.mjs`: `build/app.js` (the app root registers it as `NoemaCore.engines`: the
site, the one-file bundle), `build/harness.js` (`NoemaCore` of an activity host: the skill's `activity_host/noema-core.js`) and
`build/engines-node.cjs` (`tests/engines.cjs`); the connector imports `src/engines/node.ts` in its root. The Python twins and
the parity fixtures are unchanged; the outputs of every engine were compared run by run with the page scripts they replace.
`engine/src/43_engines_p6.js` became `engine/src/43_page_runtimes.js` (only `wasm-module@1` and `external-embed@1` stay page runtimes).

## 18. Addendum — one source for the checks, no Python twins (2026-11-08)

The sections above name Python twins of the validators and the engines' checks (`tools/activities.py`, `simexpr.py`,
`circuit.py`, `thermal.py`, `pid.py`, `rf.py`, `twin.py`, `enginelib.py`, `lib_<name>.py`, `wasm_check.py`, `embed_check.py`,
`h5p_check.py`) and `engine/packcheck.js`. They are gone. The checks of a pack and its activities are one TypeScript source,
`src/features/content` (the app's `NoemaCore.content`, the connector, the Gemini generator), and the Python tools and the skill's
scripts run the same code in node through one bridge, `build/noema-tools.cjs` (`tools/noema_core.py`; the skill ships it as
`scripts/noema-tools.cjs`). The runtimes' package checkers stay where they were (`engine/src/38_activity_h5p.js`,
`44_activity_wasm.js`, `45_activity_embed.js`) and the content checks call them. The JS = Python parity tests became JS tests
against the golden outputs of the twins, captured from them before they were deleted (`tests/golden.cjs`,
`tests/fixtures/parity/`).
