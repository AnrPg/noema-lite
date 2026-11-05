# H5P items in packs — the `h5p@1` runtime

*Tier B of [`INTERACTIVE.md`](INTERACTIVE.md); decision D11 of [`adr/001-interactive-activities.md`](adr/001-interactive-activities.md)
(phase P4b, as built 2026-11-04). For when to choose H5P and how to write one, see
[`INTERACTIVE_AUTHORING.md`](INTERACTIVE_AUTHORING.md) §H5P. Browser tests: `node tests/activities_h5p.js` (the runtime alone) and
`node tests/activities_app.js` (in the real app).*

An `h5p@1` activity is an **ordinary `.h5p` file**, the file H5P's own editors (h5p.org, Lumi, Moodle, WordPress…) export: a quiz,
drag and drop, fill in the blanks, mark the words, dialog cards… The app plays it with its own vendored H5P player, **in the same
sandbox as a Tier A mini-app**, with no network. It can be the theory block `{"t": "interactive", "activity": "<id>"}` or a sim exercise (`grade: "reported"`:
the score H5P reports is the answer).

## 1. The files

In a subject folder (`skill/noema-pack-builder`, `tools/activities_examples/planets-quiz/` is the reference):

```
activities/<id>/
  activity.json          { id, runtime: "h5p@1", title, height, fallback, licence … }  (entry, sha256, bytes are filled in)
  item.h5p               the package, unchanged
  content.<locale>.json  optional: the same content.json in another language of the pack (one per translation)
  l10n.<locale>.json     optional: H5P's own core strings in that language ("Close", confirm dialogs…)
  fallback.svg …         the fallback picture, as for every activity
  tests.json             cases for activity_test.py
```

The registry item (`pack.activities.items[]`), as `make_pack.py` writes it:

```js
{ id: 'planets-quiz', runtime: 'h5p@1', entry: 'activities/planets-quiz/item.h5p',
  sha256: '<hex sha256 of the .h5p file>', bytes: 750031, stateVersion: 1,
  capabilities: ['state', 'events', 'resize', 'result'],
  h5pByLocale: { el: { content: {…content.json in Greek…}, l10n: {…optional…} },
                 ru: { h5p: '<base64 of another package>', sha256: '…' } },   // rare: other pictures or a recording
  fallback: { media: '…', text: '…' } }
```

`strings` is optional for h5p@1 (all the item's words are in its content.json). `html` is never there, and the package itself is
not inline in the registry: **the file travels beside the pack** (D11), identified by its sha256.

## 2. How the file travels and loads

| where | where the `.h5p` file is | who reads it |
|---|---|---|
| a `.noema.zip` (`make_pack.py`, the app's Export) | the entry `activities/<id>/item.h5p`, stored (not deflated), byte for byte | Import keeps it on this device |
| the account (connector, cloud) | `<uid>/packs/<subject>/activities/<id>/item.h5p` (the same path as the pack's source files) | `noema_finish_upload` asks for it with a curl command, checks size, sha256 and the package rules before it accepts the pack |
| this device | IndexedDB `noema-files`, key `act|<account>|<subject>|<sha256>` | the app, offline |
| the website library | `library/subjects/<id>/<entry>` beside `pack.js` (`build.py site` copies it) | fetched by URL |
| the one-file bundle (`dist/noema-lite.html`) | inline as base64 when ≤ `NOEMA_H5P_INLINE_MAX` (default 2 MB) | a bigger item shows its fallback there |
| a share (public, with a person, a Roadmap step) | beside the shared source files, as `sharedFiles["act:<id>"]` (always sent: the file is the activity) | `attachShared` checks it against the item's `sha256` and keeps it as the item's file |

When a pack is opened, `NoemaSrcFiles.wireActivities` gives each h5p@1 item a **loader function** as a non-enumerable `act.h5p`
(so it is never stored, synced or shared) and starts reading the file early: this device first, then the account, then the URL
beside the pack. Every copy is checked against `sha256` and kept on the device, so the item works offline exactly when the pack
does (when the device cannot keep it, storage full, the checked copy still plays). Export takes the file from what the app holds
(the one-file bundle's inline copy, the loader) or from beside the library pack, and names any item whose file it cannot get. **The host page reads the file; the frame never fetches anything.**

`act.h5p` (what `NoemaH5P.load` accepts) may be a base64 string or `{data}`, an `ArrayBuffer` / `Uint8Array` / `Blob`, a function
returning one of these (or a promise of one), or `{url, sha256}` (fetched by the host page with `credentials: 'same-origin'`).
`act.sha256` is checked whenever it is given.

## 3. How it runs

The H5P player and the content-type libraries run in the same two frames as `html-app@1`: a wrapper document without scripts whose
CSP says `frame-src 'none'` (it blocks self-navigation), and inside it the item, in a frame with `sandbox="allow-scripts"` (opaque
origin `null`) and a CSP with `connect-src 'none'` and **scripts only by hash**. **No `'unsafe-inline'`, no `'unsafe-eval'`.** Every
library script also gets the loop guard (`33_activity_guard.js`).

The host page unzips the file (`DecompressionStream('deflate-raw')`; Chrome 80+, Firefox 113+, Safari 16.4+), checks it (§5) and
builds the frame's document: the core plus the libraries actually used (about 700 KB for MultiChoice). The content's pictures,
audio and video are sent over the MessagePort as ArrayBuffers and become `blob:` URLs inside the frame. Limits: 5000 files, 100 MB
unpacked (an entry larger than its header says is stopped while it is inflated), no zip64, no encryption, 64 MB of media per item.
The last 3 packages are cached in memory by sha256, so Restart is quick.

**The player** is h5p-standalone **3.8.2** (`engine/vendor/h5p/3.8.2/`, rebuilt and checked by `tools/fetch_h5p.py [--check]`):
only its `frame.bundle.js` (jQuery 3 + the H5P core) and `styles/h5p.css` with the two icon fonts. Its loader is not used (it
fetches by URL); the runtime does the loader's work in the host. `player.js` (generated) defines
`window.NoemaH5PPlayer = {version, js, css}`; the runtime loads it with a `<script>` tag from `<engine dir>/vendor/h5p/3.8.2/`
(`NOEMA_CONFIG.h5pPlayer` sets another URL; the one-file bundle defines it inline).

**On by default.** The runtime registers itself whenever it is in the engine, so `ACT.caps()` names `runtime:h5p@1`, and a pack
whose `requires` lists it opens. `NOEMA_CONFIG.activities['h5p@1'] = false` turns it off (its items then show their fallback).

### Protocol mapping (frame side, `bootstrap()` in `38_activity_h5p.js`)

| H5P | protocol |
|---|---|
| xAPI `answered` / `completed` of the item itself (no parent) with a score | `result {score: scaled (or raw/max) clamped to 0..1, passed: result.success ?? score >= 0.5, detail: "raw/max verb"}` |
| every xAPI statement | `event {name: 'h5p:<verb>', data: {score?: {raw, max}, sub?: true}}` (the same verb at most every 250 ms; answered/completed always) |
| `instance.getCurrentState()` after each statement (300 ms debounce), on `pause`, on `destroy` | `state {version: stateVersion, data: {h5p: <state>}}` (only when changed, ≤ 250 KB) |
| `init.state.data.h5p` (not after a `stateVersion` change) | H5P `contentUserData[0].state` → the content type's `previousState` |
| CSP violation | `event h5p:csp {d, u}` (at most 5, for authoring diagnostics) |
| a script error / H5P init failure / loop guard | `error {code: 'script' \| 'h5p-init' \| 'runaway'}` |

Host side, `mount()` has exactly the html-app@1 contract (`{send, close}`, `hello {nonce}` → one MessagePort). Right after
`welcome` the host posts `{p: 'noema.h5p', type: 'files', files}` (transferred ArrayBuffers), then `init`. Failures go to `onFail`
with a code: `integrity`, `h5p-check`, `zip`, `size`, `player`, `fetch`, `nosource`, `unsupported`; the activity then shows its
fallback, as every activity does.

What the runtime does about H5P's habits: `saveFreq: 3600` (H5P drops the saved state otherwise; with no user its own saving stops
before any request); a memory-only `localStorage` / `sessionStorage` (an opaque origin has none); `fullscreenDisabled: true` (the
app has its own Full screen button); the unzip reads a `ReadableStream` built from the bytes (WebKit offline fails `Blob.stream()`);
`H5P.getLibraryPath()` answers `data:,`, and library CSS assets are inlined as `data:` URIs.

## 4. Languages

H5P content types keep **all** their words in `content.json`: the question, the answers, the button labels and the feedback
(`UI` / `l10n` fields). The libraries' `language/*.json` files are for the editor only. So **a translation is a `content.json` per
language**: `h5pByLocale[locale]`, picked for the language the learner reads the pack in.

* `{content}` (recommended): the package's own libraries and media with this content.json — `activities/<id>/content.<locale>.json`,
  put inline by `make_pack.py` (it is small).
* `{h5p, sha256}`: another whole package (other pictures, a recording in that language).
* `l10n` (optional, `l10n.<locale>.json`) is merged into H5P's core strings (`H5PIntegration.l10n.H5P`). Without it they are English.

Each key must be a language the pack is read in (its own or a translation's), and every translation of the pack needs one
(`content.<locale>.json` missing is an error). A translation passes the same package rules; one with an outside link is refused.

## 5. Validation

The pack rules (`tools/activities.py` and `engine/packcheck.js`, same messages, compared by `tests/activities.js`): `entry` is
`activities/<id>/item.h5p`; `sha256`, `bytes` (≤ 100 MB) and `fallback` are required; no `html`; `h5pByLocale` keys are the pack's
languages; then the **package rules** on the file itself (`check_h5p_packages` / `checkActivityPackages`: the file is there, sha256
and bytes match, it is a zip, the rules below), in `make_pack.py`, `activity_lint.py`, `build.py` and the connector.

The package rules: `python3 tools/h5p_check.py ITEM.h5p [--json]` (pure stdlib) and `NoemaH5P.check(files)` in the app apply **the
same rules with the same messages** against **one allow-list**, `tools/h5p_allow.json` (the engine's copy is checked against it).

* Errors: no/invalid `h5p.json` or no title; the main library not an allowed **content type**; any library (transitively) missing,
  off the allow-list (machine name + major.minor), or on the refuse list (`H5P.MathDisplay` loads MathJax from a CDN,
  `H5P.IFrameEmbed`, `H5P.Twitter`, `H5P.GoogleMap`, …); a `preloadedJs/Css` file missing; an **outside link anywhere in
  content.json** (`http(s):`, `ftp:`, `//host/`, `youtube.com`, `youtu.be`, `javascript:`, `data:text/html`, `vbscript:`), so
  InteractiveVideo passes only with the video inside the package; a file type outside H5P's own default list (minus swf / office /
  gltf: `.php`, `.html`, `.exe` are refused); a `.js` outside a library folder; a path that leaves the package; > 5000 files or
  > 100 MB.
* Warnings: attribution links (`source` / `link` under `metadata` or `copyright`: shown as text, never loaded); libraries no content
  uses (editor libraries, left out when playing); a content file named but missing; > 20 MB; a content type not yet tested.
* **Tested** (played and scored in Chromium, Firefox and WebKit): MultiChoice, TrueFalse, DragQuestion, Blanks, DragText,
  MarkTheWords, SingleChoiceSet, Summary, Dialogcards. **Allowed, not yet tested** (a warning): QuestionSet, InteractiveVideo,
  BranchingScenario, CoursePresentation.

**The sandbox is the security boundary, not the allow-list.** A package can put any code under an allowed name; that code still runs
only in the opaque, offline, hash-only frame with the loop guard. The allow-list says which content types are known to play offline
and to report a score.

## 6. Licences

* **The H5P core** (`h5p.js`, event dispatcher, xAPI, content type, confirmation dialog, request queue, action bar, tooltip; Joubel
  AS / H5P Group, from h5p/h5p-php-library) is **GPL-3.0**. It ships with its **readable source** beside the player:
  `engine/vendor/h5p/3.8.2/source/` holds the unminified files of h5p-standalone v3.8.2 that `frame.bundle.js` is built from (with
  `src/frame.ts`, their order, and `webpack.common.js`, the build), each pinned by sha256 in `tools/fetch_h5p.py`, and the licence
  text (`source/COPYING`). `LICENSE-NOTICE.txt` says who, what, where the source is, and that the core runs only in its own
  sandboxed frame and talks to the app by `postMessage`. The skill zip carries the notice and the source beside `player.js`.
  `frame.bundle.js` itself is kept as the code that runs (the tested build).
* **jQuery** 3.5.1 (inside the bundle) and **h5p-standalone** (Tunapanda): MIT (`LICENSE`).
* The **content-type libraries** (MultiChoice, Question, JoubelUI, DragQuestion, …) come inside each `.h5p`, each with its own
  licence (`library.json` `"license"`; those of the reference items are MIT). FontAwesome (in the packages): SIL OFL 1.1 font, MIT CSS.
* An item's content has the author's licence (`activity.json` `licence`).

## 7. Samples

| file | what | source | licence |
|---|---|---|---|
| `tests/fixtures/h5p/mc.h5p` (732 KB) | H5P.MultiChoice 1.16.14 "Which planet is the largest…" | our content (CC0); libraries unchanged from h5p.org's `multiple-choice-713.h5p` (sha256 `1c60785f…1fdc8fdb`) | content CC0, libraries MIT |
| `tests/fixtures/h5p/drag.h5p` (916 KB) | H5P.DragQuestion 1.14.23 + jQuery.ui 1.10.22, two text draggables, two zones | our content (CC0); libraries from h5p.org's `drag-and-drop-712.h5p` (sha256 `7d1c8879…b9273`) | content CC0, libraries MIT |
| `tests/fixtures/h5p/tf.h5p` (672 KB) | H5P.TrueFalse 1.6 "Hello World" | `test/h5p-test.h5p` of h5p-standalone v3.8.2, unchanged (sha256 `d6bf9b62…28a7`) | MIT |
| `tools/activities_examples/planets-quiz/` | the reference activity: `mc.h5p` with `content.el.json` and `content.ru.json`, a fallback and tests | from the fixture | content CC0, libraries MIT |

The h5p.org example items say `"license": "U"` (undisclosed), and some of their pictures are CC BY-ND, so they were only played,
never committed. `tests/fixtures/h5p/build_fixtures.py` rebuilds the fixtures from the pinned downloads.

## 8. Evidence (spike P4b, Playwright 1.63: Chromium 1243, Firefox 1543, WebKit 2359)

`BROWSERS=chromium,firefox,webkit node tests/activities_h5p.js`: **116 of 116 checks pass** (with `EXTRA_H5P=<dir>`, 9 more per
browser, which also pass).

| check | Chromium | Firefox | WebKit |
|---|---|---|---|
| `mc.h5p` starts (hello → ready), first mount incl. loading the player / later mounts | 490 / 170 ms | 340 ms | 380 ms |
| CSP of the item: scripts only by hash, no `unsafe-*`, `connect-src 'none'`; wrapper has 0 scripts, `frame-src 'none'` | ✅ | ✅ | ✅ |
| MultiChoice right → `result {score: 1, passed: true}`; wrong → `{score: 0, passed: false}` | ✅ | ✅ | ✅ |
| xAPI `interacted` / `answered` → events | ✅ | ✅ | ✅ |
| state sent; remounted with it → the answer is still chosen | ✅ | ✅ | ✅ |
| TrueFalse right; DragQuestion dragged with the mouse: right 2/2, wrong 0/2 | ✅ | ✅ | ✅ |
| `h5pByLocale.el`: the item shows in Greek, `lang="el"` | ✅ | ✅ | ✅ |
| package by `{url}` with its sha256; a wrong sha256 is refused before any frame exists | ✅ | ✅ | ✅ |
| a package (or a translation) the rules refuse never mounts | ✅ | ✅ | ✅ |
| hostile library: `eval`, `new Function`, a script added at run time, an inline handler do not run | ✅ | ✅ | ✅ |
| hostile library: fetch, XHR, `<img>`, `sendBeacon`, CSS `url()`, form submit, navigation, `window.open`, a `data:` page → **requests at the beacon server** | **0** | **0** | **0** |
| `while(true){}` in a library: the loop guard stops it (≈ 2 s), the host still responds | ✅ | ✅ | ✅ |
| browser offline: the item plays and reports its score | ✅ | ✅ | ✅ |
| h5p.org examples (MultiChoice, TrueFalse, DragQuestion, Blanks, DragText, MarkTheWords, SingleChoiceSet, Summary, Dialogcards): play, pictures shown, 0 requests | 9/9 | 9/9 | 9/9 |

Chromium puts sandboxed frames in their own process; Playwright cannot reach a frame nested inside one, so the DOM tests (and
`activity_harness.js`) run with `--disable-features=IsolateSandboxedIframes`. A second pass with the default process model checks
that the fixtures start without a CSP violation and that every attack gets 0 requests through.

## 9. Open items

* InteractiveVideo, CoursePresentation, BranchingScenario, QuestionSet: run once with a sample with a clear licence
  (`EXTRA_H5P=<dir> node tests/activities_h5p.js`), then mark them `tested` in `tools/h5p_allow.json` and the engine copy. For
  QuestionSet only the top-level `answered`/`completed` counts as the result.
* Library assets that JavaScript asks for by URL do not load (SingleChoiceSet's sounds: 4 CSP reports, no request; the item plays
  silently). A `fetch`/XHR shim in the frame answering from the library files would fix it.
* Large videos are copied once per mount into the frame (transferred, not shared); fine up to the 64 MB cap.
