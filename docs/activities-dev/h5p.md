# H5P items in packs — spike P4b and the `h5p@1` runtime

*Phase P4b of `docs/adr/001-interactive-activities.md` (decision D11). Date: 2026-11-04. Run again with `node tests/activities_h5p.js`.*

## Verdict

**H5P can run safely in the activity sandbox, with no change to the security model.** The H5P player and the content-type
libraries run in the same two frames as `html-app@1`: a wrapper document without scripts whose CSP says `frame-src 'none'`
(it blocks self-navigation), and inside it the item, in a frame with `sandbox="allow-scripts"` (opaque origin `null`) and a CSP with
`connect-src 'none'` and **scripts only by hash**. **No `'unsafe-inline'` and no `'unsafe-eval'` were needed.** The H5P core and
the libraries tested (MultiChoice, TrueFalse, DragQuestion with jQuery UI, Blanks, DragText, MarkTheWords, SingleChoiceSet, Summary,
Dialogcards) use no `eval`, no `new Function` and no inline event handlers. Every library script also gets the loop guard
(`33_activity_guard.js`), the same as a Tier A mini-app.

The frame never fetches anything. The host page reads the `.h5p` file, checks its sha256, unzips it, checks it against the
allow-list and builds the frame's document. The content's pictures, audio and video are sent over the MessagePort as ArrayBuffers
and turned into `blob:` URLs inside the frame. A service worker was not needed. It would not work in an opaque origin anyway.

## Results (Playwright 1.63: full Chromium 1243 (`channel: 'chromium'`), Firefox 1543, WebKit 2359)

`PLAYWRIGHT_BROWSERS_PATH=… BROWSERS=chromium,firefox,webkit node tests/activities_h5p.js` (the browsers run one after another):
**116 of 116 checks pass**. With `EXTRA_H5P=<dir>` there are 9 more per browser, which also pass. The Python/JS rule comparison runs
once, in the first browser, and Chromium has one extra block (below).

| check | Chromium | Firefox | WebKit |
|---|---|---|---|
| `mc.h5p` starts (hello → ready), first mount incl. loading the player / later mounts | 490 / 170 ms | 340 ms | 380 ms |
| CSP of the item: `default-src 'none'; script-src 'sha256-…'` × 20, no `unsafe-*`, `connect-src 'none'`; wrapper has 0 scripts, `frame-src 'none'` | ✅ | ✅ | ✅ |
| MultiChoice right through the DOM → `result {score: 1, passed: true, detail: "1/1 answered"}` passes `ACTP.check` | ✅ | ✅ | ✅ |
| MultiChoice wrong → `{score: 0, passed: false}` | ✅ | ✅ | ✅ |
| xAPI `interacted` / `answered` → `event h5p:interacted`, `h5p:answered {score:{raw,max}}` | ✅ | ✅ | ✅ |
| state `{h5p: {answers: [0]}}` sent; remounted with it → Jupiter is still chosen | ✅ | ✅ | ✅ |
| TrueFalse (h5p-standalone's own test item) right → score 1 | ✅ | ✅ | ✅ |
| DragQuestion dragged with the mouse: right → 2/2, wrong → 0/2 | ✅ | ✅ | ✅ |
| `h5pByLocale.el` (another content.json): the item shows in Greek, `lang="el"` | ✅ | ✅ | ✅ |
| package by `{url}`: fetched by the host page, sha256 checked; a wrong sha256 is refused before any frame exists | ✅ | ✅ | ✅ |
| a package the rules refuse never mounts (`onFail('h5p-check')`); a translation with an outside link is refused too | ✅ | ✅ | ✅ |
| hostile library (correct name, hostile code): `eval`, `new Function`, a script added at run time, an inline handler do not run | ✅ | ✅ | ✅ |
| hostile library: fetch, XHR, `<img>`, `sendBeacon`, CSS `url()`, `form.submit()`, `location.replace`, `location.href`, a clicked link, meta refresh, `window.open`, a `data:` page → **requests at the beacon server** | **0** | **0** | **0** |
| `while(true){}` in a library: the loop guard stops it (`error runaway` ≈ 2 s), the host still responds | ✅ | ✅ | ✅ |
| browser offline (`context.setOffline(true)`): the item plays and reports its score | ✅ | ✅ | ✅ |
| no CSP violation while the fixtures play; no page errors | ✅ | ✅ | ✅ |
| h5p.org examples, unchanged (not committed; `EXTRA_H5P=<dir>`): MultiChoice 1.16, TrueFalse 1.8, DragQuestion 1.14, Blanks 1.14, DragText 1.10, MarkTheWords 1.11, SingleChoiceSet 1.11, Summary 1.10, Dialogcards 1.9: play, pictures shown, 0 requests | 9/9 | 9/9 | 9/9 |

Extra block in Chromium: **sandboxed frames in their own process** (how Chromium ships). Playwright cannot reach a frame nested
inside an out-of-process sandboxed frame, so the DOM tests above run with `--disable-features=IsolateSandboxedIframes`. A second
pass with the default process model checks that the three fixtures start without a CSP violation and that every attack above gets
0 requests through.

What the spike found, and what the runtime does about each:

* **H5P drops the saved state unless `saveFreq` is truthy** (`h5p.js` `newRunnable`). The runtime sets `saveFreq: 3600`. With no
  `H5PIntegration.user`, H5P's own saving stops before any request ("Not signed in"). The state reaches the app only through
  `instance.getCurrentState()`, which the frame calls after each xAPI statement and on `pause` / `destroy`.
* **Opaque origin = no `localStorage`.** H5P's clipboard code would throw, so the frame gets a memory-only `localStorage` /
  `sessionStorage` before the core loads.
* **WebKit logs "Permission policy 'Fullscreen' check failed"** when H5P checks `document.fullscreenEnabled`. The runtime sets
  `fullscreenDisabled: true` (the frame cannot go full screen anyway; the app has its own Full screen button).
* **WebKit's offline mode fails `Blob.stream()`** ("The I/O read operation failed"). The unzip reads from a `ReadableStream` built
  from the bytes instead.
* **Library assets that JavaScript asks for by URL do not load.** `H5P.getLibraryPath()` answers `data:,`. Library CSS assets (fonts,
  pictures) are inlined as `data:` URIs and work. JavaScript-built URLs into a library folder do not: SingleChoiceSet's sound
  effects try `fetch('data:,/sounds/…')`, and `connect-src` blocks it. The item plays without sounds (4 CSP reports, no request).
  MarkTheWords triggers 2 harmless `base-uri` reports in Chromium. Fixing this later needs a `fetch` shim in the frame that answers
  from the library files. No such shim was added yet.
* Text fonts: H5P's Inter / Open Sans are not vendored (the frame uses the app's font). The two icon fonts (`h5p-core-30`, `h5p-theme`)
  and FontAwesome (woff2/woff only; eot/ttf/otf/svg fonts are dropped) are inlined.

## Design (as built)

**Files.** `engine/src/38_activity_h5p.js` (the runtime, `window.NoemaH5P`). `engine/vendor/h5p/3.8.2/` (the player, 468 KB,
committed; `tools/fetch_h5p.py` rebuilds it from the pinned npm tarball, `--check` verifies `SHA256SUMS`). `tools/h5p_check.py`
and `tools/h5p_allow.json` (the rules). `tests/activities_h5p.js` and `tests/fixtures/h5p/` (`build_fixtures.py` + 3 packages).

**The player.** h5p-standalone **3.8.2** (npm, published 2026-03-24; tarball sha256
`de7844ac07d5baddf5664c03738f25755914854b472f9b093251300ea1fec391`). Only its `frame.bundle.js` (jQuery 3 + the H5P core:
`h5p.js`, event dispatcher, xAPI, confirmation dialog, action bar, tooltip) and `styles/h5p.css` are used. Its loader
(`main.bundle.js`) is not used, because it fetches by URL and adds `<script src>`. The runtime does the loader's work in the host
instead: it orders the dependencies, builds `H5PIntegration`, and makes the scripts inline. `player.js` (generated) defines
`window.NoemaH5PPlayer = {version, js, css}`. The runtime loads it with a `<script>` tag (so it works from `file://` too) from
`<engine dir>/vendor/h5p/3.8.2/player.js`. `NOEMA_CONFIG.h5pPlayer` sets another URL. A page that defines `NoemaH5PPlayer` itself
skips the load (the one-file bundle).

**The registry item** (`pack.activities.items[]`, runtime `h5p@1`):

```js
{ id: 'planets-quiz', runtime: 'h5p@1', entry: 'activities/planets-quiz/item.h5p',
  sha256: '<hex sha256 of the .h5p file>', bytes: 750031, stateVersion: 1,
  capabilities: ['state', 'events', 'resize', 'result'],
  h5p: <source>,                       // see below; the integrator fills it in when the pack is opened
  h5pByLocale: { el: { content: {…content.json in Greek…}, l10n: {…optional H5P core strings…} },
                 ru: { h5p: <source>, sha256: '…' } },   // or a whole other package
  fallback: { media: '…', text: '…' } }
```

**File format: the `.h5p` zip itself**, not an unzipped map. One file has one identity: the sha256 of the file that travels beside
the pack (D11) is the sha256 the app checks. The author's file is unchanged (`unpack.py` gives it back byte for byte). Base64 of a
zip is about 1.33× the file; an unzipped `{path: base64}` map would be bigger and would lose the file identity. `act.h5p` may be:

* a base64 string or `{data: base64}` (inline, small items);
* an `ArrayBuffer`, a `Uint8Array` or a `Blob` (for example read from IndexedDB);
* a function that returns any of these, or a promise of one (lazy: the app's loader runs only when the item mounts);
* `{url, sha256}`: **the host page** fetches it (`credentials: 'same-origin'`). The frame never does. sha256 is required.

`act.sha256` is checked whenever it is given. The host unzips the file with `DecompressionStream('deflate-raw')` (no zip library;
Chrome 80+, Firefox 113+, Safari 16.4+). The limits: 5000 files, 100 MB unpacked, an entry larger than its header says is stopped
while it is being inflated (zip bombs), no zip64 and no encryption. The last 3 packages are cached in memory by sha256, so Restart is
quick. The frame's own document is the core plus the libraries actually used (about 700 KB for MultiChoice). Content media is at most
64 MB per item.

**Languages.** H5P content types keep **all** their words in `content.json`: the question and answers, and the button labels and
feedback (`UI`, `l10n` fields). The library `language/*.json` files are for the editor only. So a translation is a
`content.json` per language. `h5pByLocale[init.locale]` is picked (`init.locale` is the language the host chose for the pack; see
`ACT.strings()`):

* `{content}`: the package's own libraries and media with this content.json. Recommended. In a subject folder it could be
  `activities/<id>/content.<locale>.json`, and `make_pack.py` puts it inline (it is small).
* `{h5p, sha256}`: another package (other pictures, or a recording in that language).
* `l10n` (optional) is merged into H5P's core strings (`H5PIntegration.l10n.H5P`: confirm dialogs, "Close"…). Without it they are
  English.

A translation passes the same checks as the package. One with an outside link is refused.

**Protocol mapping** (frame side, `bootstrap()` in 38):

| H5P | protocol |
|---|---|
| xAPI `answered` / `completed` of the item itself (no `context.contextActivities.parent`) with a score | `result {score: scaled (or raw/max) clamped to 0..1, passed: result.success ?? score >= 0.5, detail: "raw/max verb"}` |
| every xAPI statement | `event {name: 'h5p:<verb>', data: {score?: {raw, max}, sub?: true}}`. The same verb at most every 250 ms (answered/completed always) |
| `instance.getCurrentState()` after each statement (300 ms debounce), on `pause`, on `destroy` | `state {version: stateVersion, data: {h5p: <state>}}` (only when it changed, ≤ 250 KB) |
| `init.state.data.h5p` (not after a `stateVersion` change: `migrateFrom` set → starts clean) | H5P `contentUserData[0].state` → the content type's `previousState` |
| CSP violation | `event h5p:csp {d: directive, u: blocked}` (at most 5, for authoring diagnostics) |
| a script error / H5P init failure / loop guard | `error {code: 'script' \| 'h5p-init' \| 'runaway'}` |

The theme tokens are set as `--noema-*` on `<html>` like in html-app. The H5P styles keep their own light look on a white card.
`resize` is measured like in html-app, and a window resize makes H5P resize too.

**Host side.** `mount()` has exactly the html-app@1 contract and returns `{send, close}`. The handshake is the same: `hello {nonce}`
from the item's window → one MessagePort. Right after `welcome` the host posts `{p: 'noema.h5p', type: 'files', files}` (transferred
ArrayBuffers, copies of the cached bytes), then `init`. A second `load` of the wrapper → `onFail('navigated')`. Failures go to
`onFail` with a code: `integrity`, `h5p-check`, `zip`, `size`, `player`, `fetch`, `nosource`, `unsupported`.

## Validation

`python3 tools/h5p_check.py ITEM.h5p [--json]` (pure stdlib) and `NoemaH5P.check(files)` in the app apply **the same rules with the
same messages**. `tests/activities_h5p.js` compares the two error and warning lists on the 3 fixtures and 12 hostile variants, and
checks that `tools/h5p_allow.json` equals `NoemaH5P.ALLOW`.

* Errors: no/invalid `h5p.json` or no title; the main library not an allowed **content type**; any library (h5p.json's and every
  `library.json`'s `preloadedDependencies`, transitively) missing, off the allow-list (machine name + major.minor), or on the refuse
  list (`H5P.MathDisplay` loads MathJax from a CDN, `H5P.IFrameEmbed`, `H5P.Twitter`, `H5P.GoogleMap`, …); a `preloadedJs/Css`
  file missing; an **outside link anywhere in content.json** (`http(s):`, `ftp:`, `//host/`, `youtube.com`, `youtu.be`,
  `javascript:`, `data:text/html`, `vbscript:`). So InteractiveVideo passes only with the video inside the package. A file type
  outside H5P's own default list (minus swf / office / gltf; so `.php`, `.html`, `.exe` are refused); a `.js` outside a library
  folder; a path that leaves the package; > 5000 files or > 100 MB.
* Warnings: attribution links (`source` / `link` under `metadata` or `copyright`: shown as text only, never loaded); libraries no
  content uses (editor libraries: left out when playing); a content file named but missing; > 20 MB; a content type marked not yet
  tested.
* `tested` in the allow-list: MultiChoice, TrueFalse, DragQuestion, Blanks, DragText, MarkTheWords, SingleChoiceSet, Summary,
  Dialogcards. **Allowed but not yet tested** (a warning): QuestionSet, InteractiveVideo, BranchingScenario, CoursePresentation.
  h5p.org's InteractiveVideo export URL answered 404, and no sample with a clear licence was at hand.

**The sandbox is the security boundary, not the allow-list.** A package can put any code under an allowed name (the hostile
MultiChoice in the test does). That code still runs only in the opaque, offline, hash-only frame with the loop guard, the same as
any Tier A mini-app. The allow-list says which content types are known to play offline and to report a score.

## What the integrator must do (existing files this phase did not touch)

1. **`engine/packcheck.js` `checkActivities`** and **`tools/activities.py`**: accept `runtime: 'h5p@1'`. Require `sha256` + `bytes`
   + `fallback` as for every activity. `entry` ends in `.h5p`, and `h5p` / `html` are not inline in the registry when the file
   travels beside the pack. Check `h5pByLocale` keys against the pack's locales. Run the package rules: in Python call
   `tools/h5p_check.check()` (the module is importable); in JS call `NoemaH5P.check(await NoemaH5P.unzip(bytes))` if `packcheck.js`
   runs where `38_activity_h5p.js` is loaded, otherwise mirror its `check()` there. Keep one copy of the allow-list in sync
   (`tests/activities_h5p.js` checks the engine copy against `tools/h5p_allow.json`).
2. **`make_pack.py` / `unpack.py`**: `activities/<id>/item.h5p` travels **beside** the pack (the `noema_finish_upload` source-file
   list, D11), with sha256 and bytes in the registry. `content.<locale>.json` goes inline in `h5pByLocale`. `pack.requires` gets
   `runtime:h5p@1`. `unpack.py` puts both back.
3. **When a pack is opened** (the app's pack loader): set `act.h5p` for each h5p@1 item. Use a loader function that reads the stored
   file (IndexedDB) or `{url, sha256}` for the website. Keep the file with the pack so the item works offline exactly when the pack
   does. Fetch early: the core stops a frame that has not said hello within 15 s. A slow first download should finish before mount.
4. **Feature flag**: the runtime registers itself whenever the file is in the engine, so `ACT.caps()` then names `runtime:h5p@1`. For a
   staged rollout set `NOEMA_CONFIG.activities['h5p@1'] = false`.
5. **One-file bundle** (`build.py bundle`): inline `engine/vendor/h5p/3.8.2/player.js` (it defines `window.NoemaH5PPlayer`).
   Otherwise h5p@1 items show their fallback there.
6. **Skill toolkit**: `activity_harness.js` runs html-app@1 only. Give it h5p@1 by loading `38_activity_h5p.js` + `player.js` the way
   this test's stub host does, and add both plus `h5p_check.py` / `h5p_allow.json` to the skill zip (`build.py skill`).
7. **Docs**: `docs/INTERACTIVE.md` §1 (status "available"), §2 (the `item.h5p` / `content.<locale>.json` files), §10 (works
   offline), the authoring checklist (`h5p_check.py`); ADR D11 status.

## Licences (a decision for the owner)

* **h5p-standalone** (Tunapanda) is MIT. But its `frame.bundle.js` **bundles the H5P core JavaScript from h5p/h5p-php-library,
  whose repository is GPL-3.0** ("The H5P PHP library is GPL licensed due to GPL code being used for purifying HTML provided by
  authors"; `composer.json` says `"license": "GPL-3.0"`). jQuery inside it is MIT. `engine/vendor/h5p/3.8.2/LICENSE-NOTICE.txt` says
  so. The core runs only in its own sandboxed frame and talks to the app by `postMessage`, which may count as a separate program.
  Whether that is enough, and whether to publish the corresponding source (the unminified `vendor/h5p/js/*.js` of h5p-standalone
  v3.8.2), is the owner's call **before this ships**. One alternative: vendor the unminified core files instead of the bundle (same
  code, easier to meet GPL source terms).
* The content-type libraries (MultiChoice, Question, JoubelUI, DragQuestion, …) are MIT (each `library.json`: `"license": "MIT"`).
  They come inside each `.h5p` and are not vendored.
* Fonts: `h5p-core-30.woff2` and `h5p-theme.woff2` come from the H5P core (same terms as above). FontAwesome 4.5 (SIL OFL 1.1 font,
  MIT CSS) comes inside the packages.

## Samples

| fixture (committed) | what | source | licence |
|---|---|---|---|
| `tests/fixtures/h5p/mc.h5p` (732 KB) | H5P.MultiChoice 1.16.14 "Which planet is the largest…" | our content (CC0); libraries unchanged from h5p.org's `multiple-choice-713.h5p` (sha256 `1c60785f…1fdc8fdb`) | content CC0, libraries MIT |
| `tests/fixtures/h5p/drag.h5p` (916 KB) | H5P.DragQuestion 1.14.23 + jQuery.ui 1.10.22, two text draggables, two zones | our content (CC0); libraries from h5p.org's `drag-and-drop-712.h5p` (sha256 `7d1c8879…b9273`) | content CC0, libraries MIT |
| `tests/fixtures/h5p/tf.h5p` (672 KB) | H5P.TrueFalse 1.6 "Hello World" | `test/h5p-test.h5p` of h5p-standalone v3.8.2, unchanged (sha256 `d6bf9b62…28a7`) | MIT (repository) |

The h5p.org example items themselves say `"license": "U"` (undisclosed), and some of their pictures are CC BY-ND, so they were only
played in the spike, never committed. `tests/fixtures/h5p/build_fixtures.py` rebuilds the fixtures from the pinned downloads.
Editor-only libraries are left out.

## Open items

* InteractiveVideo, CoursePresentation, BranchingScenario, QuestionSet: run them once with a sample with a clear licence
  (`EXTRA_H5P=<dir> node tests/activities_h5p.js`), then mark them `tested` (both copies of the allow-list). For QuestionSet only the
  top-level `answered`/`completed` counts as the result, and sub-question statements arrive as events with `sub: true`.
* A `fetch`/XHR shim inside the frame for library assets that JavaScript asks for by URL (SingleChoiceSet sounds).
* Large videos are copied once per mount into the frame (transferred, not shared). Fine up to the 64 MB cap. Streaming would need
  more work.
