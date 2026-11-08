# noema-lite architecture

This is the target architecture of the redesign and how far phase 1 has come. The decisions behind it are in
`docs/adr/002-…` to `docs/adr/006-…`. The code is in `src/`, which is TypeScript 6 strict, bundled by esbuild. The old
UI in `engine/` keeps running and reaches the new code through one global, `window.NoemaCore` (see §6).

## 1. The picture

```
                       ┌──────────────────────────── composition roots (src/composition/) ───────────────────────────┐
                       │  app.ts → browser.ts   worker.ts        tools.ts           connector.ts                       │
                       │  (build/app.js)      (build/worker.js) (Node scripts)     (the MCP server)                    │
                       │  pick adapters · register them in the typed Container · publish window.NoemaCore (browser only)│
                       └───────┬──────────────────────────────┬──────────────────────────────────────────────┬───────┘
                               │ wires                        │ wires                                        │
             ┌─────────────────▼──────────────┐   ┌───────────▼───────────────────────┐            ┌─────────▼────────┐
             │ adapters (src/adapters/)       │   │ features / engines / plugins      │            │ the old UI       │
             │ browser · memory · local ·     │   │ (src/features, src/engines,       │            │ engine/*.js      │
             │ supabase · claude · gemini     │   │  src/plugins: phase 2 onward)     │  NoemaCore │ (phases 1–2)     │
             │ implement ▲ ports              │   │ use ▼ ports                       │◄───────────┤                  │
             └────────────┼───────────────────┘   └───────────┬───────────────────────┘            └──────────────────┘
                          │                                   │
                    ┌─────┴───────────────────────────────────▼─────┐
                    │ ports (src/ports/): Storage · Remote · Auth ·  │   interfaces + contract suites
                    │ Clock · AI · Compute · ErrorReporter · I18n ·  │   (src/ports/contract/*.contract.ts)
                    │ Telemetry · Notifier · Lifecycle               │
                    └─────────────────────┬─────────────────────────┘
                                          │ use
                    ┌─────────────────────▼─────────────────────────┐
                    │ kernel (src/kernel/): Result · NoemaError ·    │   pure TypeScript: no I/O, no globals
                    │ ids · LocalDay · HLC · statecharts · invariants│
                    └───────────────────────────────────────────────┘
```

## 2. Layers and the dependency rule

Dependencies point inward only: **roots → adapters → ports → kernel**. Features, engines and plugins use ports and the
kernel. They never use an adapter.

| Layer | May import | Never imports | Holds |
|---|---|---|---|
| `src/kernel/` | nothing outside itself | everything else | values and rules without I/O: `Result`, `NoemaError` and its codes, branded ids, `LocalDay`, the hybrid logical clock, `invariant` |
| `src/ports/` | kernel | adapters, roots, DOM types in signatures | the interfaces the core needs from the world, and their contract suites |
| `src/adapters/` | kernel, ports, `adapters/local` (shared helpers), the platform | roots, other vendors' adapters, features | one technology per folder; the vendor's formats stop at its anti-corruption layer (ADR 006) |
| `src/ui/` (the new UI, phase 3) | kernel, contracts, ports, itself (its tests in `src/ui/test/` also the adapters, as a root would) | adapters, roots, the old UI | a driving adapter: Lit components that reach the core through the ports they are handed (§6.3) |
| `src/composition/` | everything | (no one imports a root) | the only code that picks adapters; the only holders of a `Container` |
| `engine/` (old UI) | `window.NoemaCore` | `src/` modules directly | the screens phase 3 moves to `src/features/` |

Helper 1's ESLint `boundaries` configuration checks these rules. Inside the layers, the rules are:

- **Errors.** Every failure is a `NoemaError` with a stable code (ADR 004). The domain returns `Result<T, NoemaError>`
  and does not throw. Adapters turn exceptions into Results at their edge. Every user code has a catalog text
  (`i18n/errors/en.arb`, `err.<code>`). An internal code has none, because it never reaches the learner as itself.
- **No empty catch.** A caught failure is reported (`ErrorReporter.report` / `catcher`) or carries a comment that says
  why ignoring it is right.
- **Time.** All time comes from the Clock port. A learner's day is always a `LocalDay` (ADR 005).
- **Platform objects.** No module touches `document`, `localStorage`, `setTimeout` and the like when it is imported.
  Adapters look them up on first use, so every root also loads in a bare `vm` (tests) and in a Worker.

## 3. Kernel

| Module | What |
|---|---|
| `result.ts` | `ok`, `err`, `map`, `andThen`, `match`, `all`, `fromThrowable`, `fromPromise`, … ; `Result<T, E = NoemaError>`, `AsyncResult<T>` |
| `errors.ts` | `NoemaError {code, params, retryable, status}`; `USER_ERROR_CODES` (exactly the table of docs/i18n.md §6.2, checked by a test); `INTERNAL_ERROR_CODES`; `NoemaError.from(thrown)` |
| `ids.ts` | branded ids (`AccountId`, `CourseId`, `NodeId`, `CardId`, …) whose constructors return a `Result` |
| `day.ts` | `LocalDay` "YYYY-MM-DD"; arithmetic through local noon, so it is DST-safe (ADR 005) |
| `hlc.ts` | the hybrid logical clock `{wall, count, node}` with a drift guard, encoded so that it sorts as text |
| `statechart.ts` | a small typed statechart: states, events, guards, context updates, timed transitions, effects as data; `transition()` is pure, `createActor` runs one on an injected scheduler, `transitionIds` lists every transition for coverage tests (the sync loop and the lease, docs/SYNC.md) |
| `invariant.ts` | `invariant`, `defined`, `assertNever` |

## 4. Ports

Each port is an interface in `src/ports/<name>.ts`. Each one also has a contract suite in
`src/ports/contract/<name>.contract.ts` that every adapter of the port must pass. A network adapter passes it against a
fake of its service (`src/adapters/testing/`).

| Port | Purpose | Adapters |
|---|---|---|
| Storage | key-value store (sync), document store (IndexedDB-like, with transactions), quota, the **storage-full signal** | browser (localStorage + IndexedDB `noema-lite` v2 with the collection `sync`, the same DB the loader opens), memory |
| Remote | rows with compare-and-swap versions that are always strictly later, objects, rpc; an append-only **log** (idempotent by id, read by cursor) and last-writer-wins **registers** (by clock stamp, one from the future clamped) — docs/SYNC.md | supabase (PostgREST + Storage), memory |
| Auth | session, sign in/up/out, refresh, change events | supabase (GoTrue), memory |
| Clock | now, today (`LocalDay`), time zone, timers, `onDayChange` | browser (system), memory (manual) |
| AI | provider-neutral chat with tools, JSON mode, streaming deltas, usage | claude (Messages API, SSE), gemini (generateContent) |
| Compute | named jobs off the main thread, with timeouts, cancellation and progress | browser (Worker pool, which terminates a Worker on timeout), local (inline) |
| ErrorReporter | journal (persisted, bounded), console, telemetry count, learner notice (throttled) | local |
| I18n | `t`, `has`, `err`, `plural`, `format.*`, locale and direction | browser (over `NoemaI18n`), memory (catalogs) |
| Telemetry | local counters and events only, never sent | local |
| Notifier | toast · notice (at most 2 on screen, then overflow to the 🔔 bell) · alert (also the assertive live region `#noema-alert`) | browser (DOM), memory (recording) |
| EventStore | the learning log of each account: append-only, idempotent by event id (a forgotten event's id stays known), read in order or after a stamp, one snapshot of the fold (dropped when an event lands at or before it), meta values, a watch for other tabs, the **storage-full signal** (all or nothing per append); an append of events made here also queues them in the sync's outbox **in the same transaction** (`EventOutbox`; received ones never) | browser (the app's IndexedDB `noema-lite` v3, collections `log.events`, `log.ids`, `log.snapshots`, `log.meta` beside `sync`; BroadcastChannel to the other tabs), memory; both over the document store (`adapters/local/event-store.ts`) |
| Lifecycle | the page: shown or hidden, on line, left, touched; this device's kind and browser; this tab's id | browser (document, window, sessionStorage), memory (manual) |

## 5. Composition roots and the container

`src/composition/container.ts` is a small typed DI container. **Its API is stable. Changing it needs an ADR.**

```ts
const STORAGE = token<Storage>('core.storage', 'this device’s storage');
c.register(STORAGE, () => browserStorage());          // lazy singleton, made on first get
c.register(ERRORS, r => createErrorReporter({ notifier: r.get(NOTIFIER) }));
c.value(CONFIG, cfg);
c.get(STORAGE); c.has(STORAGE); c.keys();
c.freeze();                                            // a root is done: register/value now throw container.frozen
```

The rules:

- A token is registered once. `{ replace: true }` is for tests only.
- A cycle between factories fails with `container.cycle`.
- An unknown token fails with `container.unknown`.

The core's tokens are in `src/composition/tokens.ts`: `CONFIG`, `STORAGE`, `CLOCK`, `I18N`, `NOTIFIER`, `TELEMETRY`,
`ERRORS`, `JOBS`, `COMPUTE`, `AI` and `CLOUD`; `ENGINES` is the engine library (`src/engines`); `EVENT_STORE` and `LEARNING`
are the learning log (`src/composition/learning.ts`).

| Root | Built to | What it picks |
|---|---|---|
| `app.ts` → `browser.ts` | `build/app.js` (IIFE) | browser storage, clock, i18n and notifier; local reporter and telemetry; Worker Compute with the inline fallback; the Claude/Gemini factory; Supabase when `config.js` names a project; the engine library (`ENGINES`, on the bridge as `NoemaCore.engines`, its code in the lazy `build/engines.js`), the data contracts (`CONTRACTS`, `NoemaCore.contracts`, the validators in `build/contracts.js`; §6.1) and the content checks (`NoemaCore.content`, `src/features/content`). It wires `storage.onFull` to the reporter, which raises the learner's alert. |
| `harness.ts` | `build/harness.js` (IIFE) | `NoemaCore = { version, contracts, engines, content }` for a page that hosts one activity without the app: the skill's activity harness (its zip carries it as `activity_host/noema-core.js`) and the test pages that do the same. Never loaded beside `build/app.js`. |
| `noema-tools.ts` | `build/noema-tools.cjs` (Node, CommonJS) | the content checks with the contracts and the engine library, and the runtimes' package checkers (`engine/src/38`, `44`, `45`) run in a scope of their own: the one bridge of the Python tools and the skill's scripts (`tools/noema_core.py`; commands `validate`, `check-pack`, `rules`, `batch`) |
| `ui.ts` → `ui-root.ts` | `build/ui.js` (IIFE, kind `dev`: not in the site or the one-file bundle) | the I18n port over `engine/i18n.js`, the system clock, the device storage for the demo's appearance, the Notifier policy over the frame's toaster; defines the feature screens (the Roadmaps') and provides their data port (`roadmaps-ui.ts`); mounts the frame and the kit's demo for `#/ui-kit` (§6.3) |
| `worker.ts` | `build/worker.js` | the job registry (`jobs.ts`) served over `worker-protocol.ts` |
| `tools.ts` | (imported by Node scripts) | memory storage, the system clock, the given catalogs, a recording notifier and inline Compute; no network |
| `connector.ts` | the MCP server (Netlify function) | `register()` wires `src/connector` (one module per tool, sagas, the entry tables) with the app engine files it shares, loaded in a scope of their own (`src/connector/engine/legacy.ts`), and hands those files `NoemaCore = { contracts, engines }`: the ES modules of `src/contracts` and the engine library with every engine in hand (`src/engines/node.ts`, the pack checks are synchronous); bundled by `tools/connector_bundle.mjs` |

The Worker script comes from the one-file bundle's `<script type="text/plain" id="noema-worker:worker">` when that
exists. Otherwise it is the file next to `build/app.js` (`build/worker.js`). A page opened from `file://` gets no Worker, so its jobs run
inline. The Compute port promises the same results either way.

## 6. The phase bridge: `window.NoemaCore`

`index.html` and the bundle load `build/app.js` after the vendor scripts and before `engine/i18n.js` and every other
engine script. The global is defined once, non-writable and frozen. Surface version 1 (the source of truth is the
header of `src/composition/bridge.ts`):

```
NoemaCore.version                       1
NoemaCore.day.of(moment?)               "YYYY-MM-DD" of a Date / epoch ms / date text (now when left out)
NoemaCore.day.add(day, n)               n calendar days later (n < 0: earlier), DST-safe
NoemaCore.day.between(a, b)             whole days from a to b
NoemaCore.day.weekStart(day, first=1)   the Monday (first = 0: Sunday) of that week
NoemaCore.day.compare(a, b)             -1 | 0 | 1
NoemaCore.day.is(x)                     a real "YYYY-MM-DD" day?
NoemaCore.clock.now() · today() · timeZone() · onDayChange(fn) → unsubscribe
NoemaCore.errors.report(error, { where, severity, context, notify }) → journal entry
NoemaCore.errors.catcher(where, { severity, context, notify }) → (error) => undefined
NoemaCore.errors.journal() · clearJournal() · onReport(fn) → unsubscribe
NoemaCore.storage.kv.get(key) → text | null · set(key, text) → boolean · delete(key) · keys(prefix) → string[]
NoemaCore.storage.estimate() → Promise<{ usage, quota, persisted } | null> · persist() → Promise<boolean>
NoemaCore.notify.toast(text, { ms }) · notice(text, { ms }) · alert(text, { ms }) · onOverflow(fn) → unsubscribe
NoemaCore.i18n.t · has · err · plural · locale · dir · format.{number,percent,date,time,relative,list,compare} · onChange
NoemaCore.telemetry.count(name, by) · event(name, data) · snapshot() · reset()
NoemaCore.compute.run(job, input, { timeoutMs, signal, onProgress }) → Promise (rejects with a NoemaError)
NoemaCore.NoemaError                    the error class
NoemaCore.contracts                     the compiled data contracts (src/contracts)
NoemaCore.engines                       the engine library (src/engines/library.ts): expr, catalog, plugins, ids(), has(id),
                                        load(ids) → Promise<report>, loaded(id), engine(id), loadSchema(), schema(), supports(requires)
NoemaCore.runtimes                      the activity runtimes (src/runtimes/library.ts, §6.4): ids(), has(id), manifest(id),
                                        switchOf(id), isOn(id, flags), load(id) → Promise<module>, loaded(id), checks (null until
                                        build/contracts.js is in)
NoemaCore.learning.open(account) → Promise<report>   the learning log (src/composition/learning.ts, its header is the source)
NoemaCore.learning.record({ type, subject?, item?, data, origin?, id?, day? }) → event | null · recordOnce(drafts) → Promise
NoemaCore.learning.progress(subject) · progressOf(account, subject) · hasProgress · stats()
NoemaCore.learning.settings(subject?) · settingsWritten(value) · setSubjectSetting(subject, key, value) · onSettings · onChange
NoemaCore.learning.events() · eventsOf(account) · exportLog() · xapi(subject) · archive() · append(events) · restore(events, o)
NoemaCore.learning.cardRating(grade) · playbookRating(grade, ticked) · idFor(prefix, parts) · backupStamp · flush · pending · migrate
                                        · compact() · clear(account) · account()
NoemaCore.study                         the study domain (src/features/study, the source of truth is the header of
                                        src/composition/study.ts): grade(ex, answer, { regions }) → { ok: true|false|null, score,
                                        items, typos, missing, parts } · targets · hits · fsrs.{review, memory, isDue, dueDay,
                                        retrievability, later, box, defaults, optimize} · cards.{queue, countDue} ·
                                        practice.{mistakes, countMistakes, solved, order, spread, sibling} ·
                                        progress.{chapter, chaptersDone, levels} · xp.{today, goalReached, streak, level, dayOf} ·
                                        models.{current, apply, start, rebuild, optimize, refit, onChange}
NoemaCore.catalog                       the search index's records (src/features/catalog): fromPack · fromCurriculum ·
                                        fromLangCourse · fromConvos · blockIds · blockText · trapId · cardKey · hash36 · plain ·
                                        toneNumbers · BLOCK_KIND · SCHEMA · index(account, sources) → { load, refresh, records,
                                        byKey, state, on, forget } (the records built in the Worker, kept in noema-lite-search)
NoemaCore.content                       the content checks (src/features/content): checkPack, checkChapter, checkActivities,
                                        checkSimSpec, checkQuality, checkTranslation, checkBridge, the rules (a BRIDGE_EXTENSION)
NoemaCore.<extension>                   names helpers add through BRIDGE_EXTENSIONS (browser.ts)
NoemaCore.sync                          the sync loop, the lease, the settings registers (src/composition/sync.ts, docs/SYNC.md)
NoemaCore.search                        the query side of search (src/features/search): fold, forms, latin, matches,
                                        search(records, q, filters), snip(hit), params, saved, recent, keeper, roundSteps
NoemaCore.vault                         the vault (src/features/vault): FORMATS, checkFile, fields(), the server's use cases
NoemaCore.social                        people (src/features/social): state, onChange, refresh, search, putFile, the rules
NoemaCore.reports · engineRequests      problem reports ⚑ and engine requests (src/features/reports); promised calls
                                        reject with a NoemaError
NoemaCore.languages                     the language courses before any is loaded (src/features/languages, §6.5)
```

**The learning log.** What the learner does is an event (`noema.events/v1`,
`src/contracts/schemas/noema.events.v1.schema.json`: an id, an HLC stamp, the learner's day, the device, the account, the subject
and item, and the data of its type — answer given, card reviewed, section read, XP earned, setting changed, …). The log only
grows: an undo is itself an event (`log.restored` for a backup brought back, `subject.reset`). The progress the screens read
is its fold (`src/features/study/domain/events/projection.ts`; the old screens hold the same objects while events fold in),
kept as a snapshot with the tail after it; compaction forgets only events a later one of the same key supersedes ("latest"
types: an activity's saved state, a section opened, a setting). On each open the log converts what this device still keeps in
the old places (`s:<subject>:state`, `a:stats`, the first time `a:settings`): the old texts are archived in the log's meta, the
events are added (their ids are made from their content, so converting twice adds nothing), then the old keys leave the
key-value store. `a:settings` stays the old screens' copy: what they write there becomes `setting.changed` events
(the UI root (src/composition/ui-root.ts) and the areas (engine/app/*.js)) and the copy follows the log. Backups (version 3) carry the events. Cards and drills fold as the read
models fold them (FSRS-6 replayed on the imported schedule with the learner's `fsrs` setting; a change of it schedules every
card again). Events are stamped by the sync's device clock (`DEVICE_CLOCK`); the log fills the seams of the other features
(`src/composition/learning.ts` `learningSeams`): `STUDY_EVENTS` (the read models' feed, which merges the imports the way the
log does and asks for a rebuild after a restore), `SYNC_EVENT_LOG` (another device's events, kept once and never sent back),
`LEGACY_PROGRESS` (the cloud's old progress rows, converted like this device's own) and `ROADMAP_EVENTS` (levels reached and
tested, restructurings: `roadmap.*` events, the read models' level too); a restructuring hands the subjects the progress of
the items that moved to them (`adoptProgress`: what a subject lacks becomes its events; XP stays where it was earned).

The community parts are composed in `src/composition/community.ts` (`COMMUNITY_REGISTRATIONS`, `COMMUNITY_BRIDGE`): the
tokens `REST`, `VAULT`, `SOCIAL`, `REPORTS` and `ENGINE_REQUESTS`. `REST` is a second Supabase client over PostgREST, RPC
and Storage that shares the signed-in session (`noema1:cloud:session`) with `CLOUD`; without a cloud project every call
answers `auth.not_signed_in`.

#### 6.0 The study domain and its read models (phase 2)

- **Grading** (`src/features/study/domain/grading`): every exercise type is graded by one pure function from the
  exercise and the learner's answer in the exercise's own indices (the answer shapes are in the header of `grade.ts`).
  The old renderers (`engine/src/30_exercises.js`, `31_types.js`, `32_activities.js`, `35_visual.js`) only collect the
  answer (`answer()`) and show the verdict; `tests/thinking_types.js`, `visual.js`, `e2e.js` and the sweep in
  `grading.test.ts` (every exercise of the library and the fixtures) prove the results are the old ones.
- **FSRS-6** (`fsrs.ts`, `fsrs-optimizer.ts`): the scheduler of py-fsrs 6 (its reference values in the tests) and an
  optimiser that fits the 21 parameters to the learner's reviews (Adam on the log loss, in the Worker:
  `study.fsrs.optimize`). Cards (`S.fc`) and drills (`S.pb`) hold FSRS memories; an entry in the old Leitner shape
  `{ box, due }` is read as the memory it stands for (`fromLeitner`) and replaced at its next review, so no schedule is
  lost. The three card buttons are the ratings Again, Good, Easy; a drill's blank / partly / nailed are Again, Hard,
  and Easy (with ≥ 70 % of the checklist) or Good. The fitted parameters are kept in `a:settings.fsrs`.
- **Read models** (`projections/`, CQRS): the learning log's events folded into the model of every subject (answers,
  card and drill memories, reading, XP per day, the streak, the goal, levels, the FSRS setting). A rebuild runs in the
  Worker (`study.project`); after it the page folds each new event itself. The events the read models read are listed
  in `projections/input.ts`; the log reaches them through the `EventFeed` port of `application/read-models.ts`,
  registered as `STUDY_EVENTS` by the learning log's store.
- **Queries** (`queries.ts`): the card queue, due counts, the Mistakes gym, a round's order and siblings, chapter and
  level progress, the day's XP, the goal, the streak (days with XP, plus a run carried over from before) and the XP level.

The bridge speaks the old code's language. It returns plain values and throws exceptions instead of returning
Results: a failed write is `false`, and a bad day throws `day.invalid`. Every failure it swallows goes to the
ErrorReporter, once per code and page. A full storage needs no call from the caller. The adapter raises the
storage-full signal, and the root reports it as `storage.quota`. The reporter then shows the learner `⚠️` plus the text
of `loader.storage.full` at most once a minute, as a long toast and in the live region. In phase 1 these old globals
moved behind the bridge:

- `NoemaDay` (`engine/day.js`, deleted);
- the `noema:storagefull` event and its loader listener;
- the three toast implementations (`toastL`, `Notices.add` and the engine's `toast`);
- every empty catch in `loader.js`, `shell.js`, `cloud.js` and `engine/src/10_core.js`;
- the engine globals (`NoemaExpr`, `NoemaCircuit`, `NoemaSimKit`, `NoemaLibCore`, `NoemaLibSchema`, `NoemaEngineCatalog`, every
  `NoemaLib<Engine>`) and their page scripts `engine/src/35_simexpr.js`, `36_engine_circuit*.js`, `39–42_engine_*.js`,
  `43_engines_p6.js`, `46–49_lib_*.js`: they are `NoemaCore.engines` now (§6.1).

### 6.1 Engines and contracts out of the start path

Every engine of sim-spec@1 is an ES module in `src/engines/<name>/` and a plugin of the microkernel (`src/plugins`: a manifest
with its capabilities, a lazy entry, a lazy Worker bundle; `src/engines/plugins.ts` lists them). `tools/esbuild.mjs` builds the
library; its plugin `noemaWorkers` turns `noema-worker:<module>#<export>` into the engine's Worker bundle as text, with the
kernels several engines share built once.

**Lazy pieces.** The start path of the page is `build/app.js` (about 470 KB, 133 KB gzipped: the core, the expression
language, the catalogue and the 26 manifests of `src/engines/manifests.ts`; phase 2's learning log, sync, read models, Roadmaps
and community, about 330 KB; and the learning log's event contract, about 140 KB) and `build/ui.js` (the frame and the shell's
screens: about 240 KB). Four pieces of kind `lazy` stay out of it:

| piece | entry | what | when it runs |
|---|---|---|---|
| `build/engines.js` | `src/composition/engines.ts` | every engine's code, its Worker bundle (text) and the schema kernel (about 3.6 MB) | the first time `NoemaCore.engines.load()` or `schema()` asks (`src/engines/lazy.ts`): an activity before it mounts, the content checks before they check a pack that names an engine, the author |
| `build/lang-activities.js` | `src/composition/lang-activities.ts` | the screens of area 5 (languages and activities) on `build/ui.js`'s Lit and kit (about 36 KB) | the first language page (`NoemaShell.area5`, §6.5) |
| `build/runtimes.js` | `src/composition/runtimes.ts` | the code of every typed activity runtime (§6.4) | the first time an activity needs one (`ACT.runtime(id)`) |
| `build/contracts.js` | `src/composition/contracts.ts` | the compiled data contracts (`src/contracts`, about 1.4 MB) and the content checks built on them (`src/features/content`, about 120 KB) | before the shell opens a subject or a language course (`ui-root.ts` awaits `NoemaCore.contracts.ready()`, which brings both), after the first screen on Today, and before the Roadmaps start their jobs; a check before that is a bug and throws (`src/contracts/lazy.ts`, `src/features/content/application/lazy.ts`) |

The learning log checks every event it reads or makes, and it opens before the first screen: its contract
(`noema.events.v1#event`, `tools/contracts.mjs` `START_CONTRACTS`) is compiled a second time into
`src/contracts/validate-start.ts`, and `build/app.js` and `build/ui.js` bundle `src/contracts/page.ts` in place of
`src/contracts/index.ts` (the esbuild plugin `pageContracts`): that contract at once, every other one from the piece.

A piece is a classic script: the page adds it as `<script src>` next to `build/app.js` (`pieceLoader` in
`src/composition/browser.ts`), and the one-file bundle carries it as text (`<script type="text/plain" id="noema-lazy:<name>">`,
`tools/build.py`) and runs that, so the same path works from `file://`. The piece hands its module over on
`globalThis.__noema<Name>Piece`. A failed load (offline before the service worker has cached it) is tried again on the next ask.
`tools/esbuild.mjs` holds `build/app.js` to 480 KB, so a change that pulls the engines or the validators back into the start
path fails the build. `build/harness.js` (one activity without the app) and the Node bundles keep the whole library inline.

**Exact arithmetic.** No bundle is minified with `minifySyntax` (whitespace and names only): the engines must compute every
double as their source writes it, bit for bit with the golden outputs of their former Python twins (`tests/fixtures/parity/`).

The same library reaches the other environments as named entries of the same list: `build/harness.js` (above),
`build/engines-node.cjs` (`src/engines/node.ts`, every engine in hand, for the node suites through `tests/engines.cjs`), and the
connector, whose root imports `src/engines/node.ts` (`tools/connector_bundle.mjs` uses `noemaWorkers` too).

### 6.2 Design tokens

`src/ui/tokens/` holds the typed token sets (the base set and the 29 characters). `tools/esbuild.mjs` writes them on every build
as `engine/tokens.css` (`tools/tokens.mjs`; generated, never committed), which `index.html` links after `engine/engine.css` and
the one-file bundle inlines.

Contrast is part of the tokens, not of each rule: `contrast.ts` names which text token is read on which surface and derives
the text-safe colours — `--acc-text` (the accent as text), and for a colour used as a fill under text, `--<name>-fill` and
`--<name>-on` for c, violet, ok, warn, bad and info (`fillFor`: white, else a dark ink, else white on the colour darkened
just enough; a character: its accent under its accent ink, a tint's ink under its paper). A
chapter's colours (`chapters.ts`) are rules on `[data-ci="<n>"]`, in light and dark; `setAccent` only sets the number.
`tokens.test.ts` checks every pair at 4.5:1 for every character and chapter colour in both schemes; CSS never writes white
on a token colour or a token colour as text without such a pair.

**When the bridge goes:** phase 3 moves the last old screens into `src/features/`. That phase deletes
`src/composition/bridge.ts`, the global, and every `NoemaCore.` left in `engine/`, then `engine/` itself. Until then:

- the surface only grows (a new name, never a changed meaning);
- `version` goes up when a name is removed.

### 6.3 The UI foundation and the app's root

`src/ui/` is the new UI's foundation in Lit (`lit` 3.3.3): the parts every phase-3 screen is built from. The app's root is
`build/ui.js` (`src/composition/ui.ts` → `ui-root.ts`, kind `page`), loaded right after `engine/i18n.js`. It publishes the
bridge's UI half and starts the app:

| Part | Where | What |
|---|---|---|
| `window.Noema` | `src/composition/shell/core.ts` | the profiles, the timed key/value store, the stats, the Gemini key (this device only), the app's IndexedDB, backups and restore points, the auto-backup, the 🔔 news of this device, the start's overlays |
| `window.NoemaThemes` | `src/composition/shell/themes.ts` over `src/features/shell/domain/characters.ts` | the characters on the tokens: the 5-minute try, free changes for 15 days, then one every 5 days |
| `window.NoemaShell` | `src/composition/shell/host.ts`, `src/ui/screens/shell/` | the frame (`noema-shell-frame`), the router over every hash route (`routes.ts`), Today, Progress, Settings, the character gallery, the Me menu, the first-time questions, the profile picker; the toolkit the areas draw their pages with |
| the areas | `engine/app/library.js`, `community.js`, `roadmaps.js`, `languages.js` | the older screens of each feature: they add their parts to `Noema`, their pages with `NoemaShell.registerPage`, their steps of the start to `Noema.boot` (`openEngine`, `started`, `connectClaude`, `wanted`, `langBoot`, `startLanguage`); what one needs of another goes through `Noema.app` |

`NoemaCore.notify` draws on the kit's toaster once the root has started (`NoemaCore.toasts.use`); what does not fit goes to
the 🔔. With `config.shell: false` the classic screens run without the frame (the older browser suites use them).

| Folder | Holds |
|---|---|
| `core/` | `NoemaElement` (the base: services, `t()`, the direction, `emit()`), the services (`UiServices`: I18n, Clock, the interface languages) handed down by a `noema-ui-services` event from the nearest provider, the shared styles (`--u-*` aliases of the tokens), the keyboard helpers (`moveIndex`, type-ahead; ← → swap right to left), `place()` for popovers, focus helpers, the overlay stack (`openOverlay`: Escape and a press outside close the top one only, never past a modal) and the appearance (`applyAppearance`: `data-theme`, `data-m`, `data-motion`, the theme colour) |
| `kit/` | buttons and icon buttons, menus, dialogs (native `<dialog>`, modal or a sheet), the toaster (the Notifier port's surface: toasts, notices with `role="status"`, alerts through an assertive live region), tabs, chips, cards, ⓘ tips, form fields (form-associated: text, select, switch, radio group), lists and collapsibles, progress (bar, ring), the level badge, line icons |
| `router/` | `defineRoutes()` (typed hash routes: `:name`, `:name?`, `*rest`, the query) and `createRouter()` over a `HashLocation` (`browserHash`, `memoryHash` for tests) |
| `frame/` | `noema-app-frame` (top bar with back and crumbs, the tabs as a bottom bar on phones and a rail from 760 px, skip link, `<main>`) and `noema-layer` (toasts and dialogs; `confirmDialog`) |
| `demo/` | `noema-ui-kit`, the demo of every component (`#/ui-kit`) |

The rules:

- **Words.** Every text comes from the I18n port (`i18n/ui/`, keys `ui.*`, drafts in the 14 other locales); keys built at
  run time are listed in `i18n/ui/dynamic_keys.txt`. A component follows a locale change; the frame sets `lang` and `dir`.
- **Accessibility.** Each component carries its role, name and state; it works with the keyboard alone; every target is at
  least 24 × 24 px; nothing scrolls sideways at 320 px; logical properties and the `--u-flip` switch mirror right to left.
- **Look.** Only the tokens (`engine/tokens.css`), pale surfaces, few and short animations (`data-motion="reduced"` and the
  system setting stop them).
- **Loading.** `build/ui.js` is on the start path (with `build/app.js`, §6.1) and carries the feature screens; the kit's
  demo `build/ui-kit.js` is kind `dev`: the root adds it only for `#/ui-kit` on localhost.
- **Tests.** `src/ui/test/` (happy-dom: roles, keyboard, events, the catalogs), `src/composition/ui-kit-root.test.ts`,
  `src/features/shell/domain/domain.test.ts`, `src/composition/shell/kv.test.ts`, `src/ui/screens/shell/routes.test.ts`, and in a
  browser `tests/ui_kit.js` (layout, targets, focus, form association, right to left) and `tests/a11y.js` (axe).

**A feature's screens** live in its slice: `src/features/<name>/ui/` (eslint element `feature-ui`: it may import the kernel,
contracts, ports, its domain and application, `src/ui` and other feature UIs; its tests in `ui/test/` also the adapters).
Each slice hands its screens **one data port** the same way the kit hands its services: a bubbling, composed request event
that the nearest provider answers. The Roadmaps' (`src/features/roadmaps/ui/`, the event `noema-roadmaps-data`, port
`data.ts` `RoadmapsData`): the library and its invitations, the map (classic, treasure, list; level bands, `layout.ts`) with
the selected step and its preparation, the levels (the ladder, the level test, the level-reached moment, Claude's proposed
arrangement), a step's placement test, sharing, the Claude app's inbox, preparing ahead and From your sources. A screen
never reads a global: `src/composition/roadmaps-ui.ts` implements the port over the engine's scripts today, and the lead
swaps that file, never the screens. The root (`ui-root.ts`) defines the elements and provides the port on `<body>`; the
area `engine/app/roadmaps.js` mounts them: the Knowledge page (`#/learn`, the library) and the map page (`#/map/<id>`,
its ⋮ holding the legend, the view, sharing, settings and export) with the frame, and the same elements in an overlay
with `config.shell: false` (`Noema.curricula()`, `Noema.curriculumMap(id)`, `Noema.fromSources()`). What belongs to
another screen (opening a subject, editing a step) a screen asks for by an event (`roadmap-study`, `roadmap-edit-step` …);
the page that mounts it answers. The dialogs not yet in Lit (a new Roadmap, import, a step's editor, attaching subjects,
the Roadmap's settings, Roadmaps others share) stay in `engine/curmap.js`.

### 6.4 The activity runtimes

The runtimes that show an item of `pack.activities` are plugins of kind `runtime` in `src/runtimes/<name>/` (strict TypeScript,
layer `runtimes` of the ESLint boundaries: kernel, contracts, ports, plugins and itself). `manifests.ts` lists each with its
switch (`on`: unless `config.js` says false; `opt-in`: only when it says true), `plugins.ts` its lazy entry, `checks.ts` the
pure checks (`RUNTIME_CHECKS`, which the roots hand the content checks through `scopeCheckers`). A runtime module's
`create(host)` takes a `RuntimeHost` (`types.ts`: the app's words, the protocol's envelope, the account settings, the
deployment's switches) and returns the `ActivityRuntime` the activity core mounts (`mount(box, ctx) → port`, `waits`,
`failText(code, act)`), or null when it is off. The core (`engine/src/32_activities.js`) knows every runtime by its manifest
at once (`ACT.caps()`, `ACT.hasRuntime(id)`), loads its code when an activity starts (`ACT.runtime(id)` → Promise), and
`ACT.loadedRuntime(id)` is the registered one. A runtime may bring engines of sim-spec@1 (`ActivityRuntime.engines`, named in
its manifest line so that `ACT.engines()` and `ACT.caps()` know them at start): the core loads the runtime when an activity needs
one of them and registers them (`wasm-module@1` brings `wasm@1`). The host gives a runtime the open pack's items (`items()`), the
expression language (`expr()`), the runtimes registered now (`loadedRuntime(id)`), a deployment setting (`config(key)`), the
app's numbers (`num`) and the sim-spec view (`simView`, which `py-module@1` draws its controls with). Where a runtime can run at all,
when not everywhere, is its descriptor's `available` rule (`manifests.ts`, `availableHere`; `py-module@1`: only the website), so
`ACT.enabled(id)` and the fallback's words are known before its code is loaded. The page has the code in the lazy piece
`build/runtimes.js`; the node suites read `build/runtimes-node.cjs` (`src/runtimes/node.ts`); the activity host
(`build/harness.js`) holds it inline and makes them for its stub core (`NoemaCore.attachRuntimes(act, host)`). A runtime's styles
are `src/runtimes/<name>/*.css` (`tools/build.py` adds them to `engine/engine.css`). Moved so far: `external-embed@1`,
`wasm-module@1` / `wasm@1`, `py-module@1`. Still scripts of `engine/src`: `html-app@1` (34), `sim-spec@1` (35), `h5p@1` (38).

### 6.5 Area 5's screens: languages and activities (phase 3)

The screens of area 5 are Lit elements in the light DOM (`src/ui/screens/screen.ts`, `NoemaScreen`): the page's sheets
(`engine/engine.css`, the course sheet `engine/langui.css` generated from `engine/lang/*.css`) style them, so their markup
keeps the class names those sheets and the browser suites use. Each screen reads through one port of its own, a small
interface beside it (`languages-port.ts`, `course-port.ts`); the root that mounts a screen hands it the
adapter.

| File | Holds |
|---|---|
| `src/ui/screens/languages-activities.ts` | **the one route file of area 5**: `AREA5_ROUTES` (`#/lang`, `#/lang/:code`), `mountArea5(match, host, ports, t)` → the element and the frame's chrome (crumbs, back, tab), the parts that are not pages (`mountArea5Part`: `lang-strip`, `study-chooser`, `lang-courses`, `lang-today`, `lang-lanes`, `lang-lesson`), `defineArea5()` |
| `src/ui/screens/languages/` | the Languages tab (`languages-page.ts`, D21), the question "Which languages do you want to study?" (`study-chooser.ts`), Today's card (`lang-today.ts`), a language's home (`lang-home.ts`, D29: continue, the path, the study areas, the bookshelf, the tools) the chip strip (`lang-strip.ts`), ⫴ the parallel lanes (`lang-lanes.ts`), the head of a lesson: its four-step ladder, Continue, Deepen, Aa· (`lang-lesson-head.ts`); and the elements the course runtime makes itself (`document.createElement`, `.port` = the course: `screenEl` in `engine/lang/14_screens.js`): `noema-lang-word` — every foreign word and run, its reading under it (D24), its words underlined and opening their card, the new-word marker (D23), plain inside controls and exercises (`lang-word.ts`, with the Aa· switch `noema-lang-translit`) —, the aspect pages (`lang-aspect.ts`), 🧩 sorting and 🔁 principal parts (`lang-drills.ts`), the peculiarities (`lang-peculiar.ts`), a lesson's page, its run and its result (`lang-lesson.ts`), *In other languages* and the table of a meaning (`lang-others.ts`). The course's own parts not ported yet (grammar cards, word cards, exercises, notes) reach them as nodes |
| `src/features/languages/` | the courses of the device before any course is loaded: the pure rules (`domain/courses.ts`: the courses, the languages offered and studied, a course's progress from its stored records, the course of a language) and the service over the device's keys (`application/courses.ts`) |
| `src/composition/languages.ts` | `NoemaCore.languages`: that service over the root's storage, clock and settings writer (`NoemaThemes.putSettings`) |
| `src/composition/area5.ts` | `NoemaShell.area5`: `has(hash)`, `mount(hash, host, ctx)` → the chrome, `part(name, host, ctx, options)`, `load()`, `now()`; the first call runs the lazy piece `build/lang-activities.js` (`src/composition/pieces.ts`, kind `lazy`: next to `build/ui.js`, or the one-file bundle's inline copy) |
| `src/composition/ui-shared.ts` | the modules `build/ui.js` shares with that piece (Lit, its directives, the kit's core, dialog, icons, the router's routes) on `globalThis.__noemaUiShared`; the esbuild plugin `uiShared` (`tools/esbuild.mjs`) reads every such import from there and fails the build on any other module of Lit or `src/ui/{core,kit,frame,router}`, so the page keeps one Lit, one overlay stack and one class per element |
| `src/composition/lang-activities-root.ts` · `-ports.ts` | the root of that piece: the services (the I18n port over `engine/i18n.js`, the system clock, the interface languages) and the adapters of the ports (`NoemaCore.languages`, the open course's port that `engine/lang/14_screens.js` hands over) |

The pages mount these screens through `NoemaShell.area5`: `engine/app/languages.js` (the Languages tab, registered with
`NoemaShell.registerPage('lang', …)`; Today's card; Choose another course; the course runtime is loaded with the piece) and
the course runtime (`engine/lang/14_screens.js`: a language's home, the strip, the chooser inside a course, the lanes, a
lesson's head).
`#/engines` belongs to the Community area (`src/features/reports/ui/engines.ts`). A dialog of a screen goes to the frame, outside the screen, and gets
the screen's services itself (`NoemaScreen.openDialog`).

Tests: `src/ui/test/languages.test.ts` (happy-dom), `src/features/languages/application/courses.test.ts`, and in a browser
`tests/lang_home.js`, `tests/lang_select.js`, `tests/lang_lanes.js`, `tests/lang_lessons.js`.

## 7. Patterns

| Pattern | Where |
|---|---|
| Ports and adapters (hexagonal) | `src/ports`, `src/adapters`, ADR 002 |
| `Result` instead of exceptions, ErrorReporter port, no empty catch | `src/kernel/result.ts`, `errors.ts`, ADR 004 |
| Anti-corruption layer | `src/adapters/supabase`, `claude`, `gemini`, ADR 006 |
| Contract tests (one suite per port, every adapter passes it) | `src/ports/contract/` |
| Composition root + typed DI container | `src/composition/` |
| Hybrid logical clock, compare-and-swap versions | `src/kernel/hlc.ts`, `adapters/supabase/client.ts` `versionAfter`, ADR 005 |
| Schema-first contracts | `src/contracts/` (helper 2) |
| Microkernel plugins | `src/plugins/` (manifest, registry, capability checks), the engines in `src/engines/` (§6.1) |
| Design tokens | `src/ui/tokens/` → `engine/tokens.css` (§6.2) |
| Event sourcing of learning events (append-only log, content-hash ids, snapshots, compaction, undo as an event) | `src/features/study/domain/events/`, `application/learning-log.ts`, the EventStore port (§4, §6) |
| Web components, context by event, an overlay stack | `src/ui/` (§6.3) |
| CQRS read models in a Worker (Compute jobs `study.project`, `catalog.records`), followed on the page event by event | `src/features/study/application/read-models.ts`, `src/features/catalog/application/index-store.ts` (§6.0) |
| Pure domain graders and schedulers (Strategy per exercise type; FSRS-6) | `src/features/study/domain/grading`, `fsrs.ts` (§6.0) |
| Local-first with an outbox, statecharts | `src/features/sync` (the outbox in the event append's own transaction, the loop and the lease as statecharts), `src/kernel/statechart.ts`, docs/SYNC.md |
| Saga with idempotency keys, specifications | phases 2–3; Compute, Storage (documents and transactions), the HLC and the container already leave room for them |

## 8. How to add …

**A feature.**

1. Put its domain in `src/features/<name>/`. That code uses ports and the kernel only and returns Results.
2. Give its screens to the root through a `Registration` (`c => c.register(TOKEN, r => make(r.get(STORAGE), …))`)
   appended to `APP_REGISTRATIONS` in `browser.ts`.
3. While old screens still need it, add a `BridgeExtension` to `BRIDGE_EXTENSIONS`. A core name is refused.
4. Every word goes through `I18n` with keys in `i18n/<component>/en.arb` plus drafts.

**A port.**

1. Write `src/ports/<name>.ts`: the interface, with Result-returning methods and no platform types in the signatures.
2. Write `src/ports/contract/<name>.contract.ts`: the behaviour every adapter must have.
3. Add a token in `tokens.ts` and register an adapter in each root that needs it.
4. Add its internal error codes to `INTERNAL_ERROR_CODES`. A user code also goes into docs/i18n.md §6.2 and
   `i18n/errors/en.arb`.

**An adapter.**

1. Write `src/adapters/<technology>/`: one technology, its formats converted at the edge (ADR 006). Platform objects
   are looked up on first use, and options let tests pass fakes.
2. Write a test that runs the port's contract suite against it. A network adapter uses a fake in
   `src/adapters/testing/`.
3. Register it in the root that should use it. No other code changes.

**A plugin.**

1. Give it a manifest (`src/plugins/manifest.ts`: id, kind, version, needs, provides) and register it with the registry of its
   kind; an engine of sim-spec@1 is one line of `src/engines/plugins.ts` and of `src/engines/node.ts` (`src/engines/plugins.test.ts`
   checks they agree with the catalogue).
2. It reaches the core only through the ports its manifest names, which the root hands it.
3. A heavy job is a Compute job: append a `JobRegistration` to `JOB_REGISTRATIONS` in `src/composition/jobs.ts`, so
   the Worker and the inline fallback run the same code.

## 9. Building and testing

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc` over `src/` |
| `npm run test:unit` | `node --test --experimental-strip-types "src/**/*.test.ts"`: kernel, every adapter against its contract, the roots, and `build/app.js` in a bare `vm` |
| `npm run build` | esbuild, every entry of `tools/esbuild.mjs` `ENTRIES` within its size budget: `build/app.js`, the pieces `engines.js` and `contracts.js` (§6.1), `ui.js` (the UI root, §6.3), `pwa.js`, `worker.js`, `sw.js`, `harness.js`, `ui-kit.js` (development only), `engines-node.cjs`, `runtimes-node.cjs` (the activity runtimes for the node suites, §6.4), `roadmaps-node.cjs` (the Roadmaps domain for the node suites, `tests/roadmaps_core.js`), and `engine/tokens.css`. Generated, never committed. |

The old suites (`tests/*.js`) load `build/app.js` wherever they load engine scripts that use `NoemaCore`.
