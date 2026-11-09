# xAPI / cmi5 export — the learning record of a subject

The learner can take their record of a subject to a learning record store (LRS) or an LMS: **⋮ (the subject's menu) › Export
learning record (xAPI)** downloads `<subject>.xapi.json` — every attempt of an activity, its events and results, and each
exercise's answers, as xAPI 1.0.3 statements. Nothing is sent anywhere; the app has no LRS connection.
The decision is the ADR's D12 (P6), as built in its §13.

Code: `engine/src/43_xapi.js` → `window.NoemaXAPI` (and `module.exports` for node): pure functions, no network, no
`Date.now()`, no randomness. The menu item: `exportXAPI` in `engine/src/40_views.js`. The file's schema:
`src/contracts/schemas/noema.xapi-export.v1.schema.json`. Tests: `node tests/xapi.js`; the app: `tests/activities_app.js`.

## In the app

* The item sits beside "Export package" in the subject menu, quiet (one line + a sub-line); with nothing recorded yet it says
  so (a toast) instead of writing an empty file. Next to it, **Course package for an LMS (cmi5)** downloads `<subject>.cmi5.zip`
  (`cmi5.xml` only, zipped with the app's zip writer, JSZip, as the package export): the course and one AU per chapter, with the
  same activity base as the record, each AU launching `<site>?subject=<id>#/ch/<chId>`.
* The shell's **My subjects** ⋮ has the same two items for every subject: the record is made from the learning log
  (`NoemaCore.learning.xapi(subject)`) and the subject's pack, so it needs no open subject; the shell loads
  `engine/src/43_xapi.js` on its own (once: `engine.js` leaves it out, see `PAGE_SRC` in `tools/build.py`). Both menus call
  `NoemaXAPI.subjectRecord` / `subjectCmi5` / `zip`, so the files are the same.
* **The actor is the account, never an e-mail:** `{account: {homePage: <site>/, name: <account id>}}`. `mbox`,
  `mbox_sha1sum` and `openid` are never written, a `name` with `@` is dropped, an actor without an account throws.
* `activityBase` = `<site>/xapi/<subject id>/`; the registration is a UUID v5 of the account and the subject, so a re-export
  gives the same ids (idempotent at an LRS).
* Profile `xapi`. The cmi5 package describes the course; a launch *from* an LMS (fetch URL, auth token) is not implemented
  (see Limits), so an LMS can list and open the chapters but receives no statements by itself.

## API
| call | gives |
|---|---|
| `statements(input, opts)` | `[statement]`, xAPI 1.0.3 |
| `exportFile(input, opts)` | `{format: 'noema.xapi-export/v1', xapiVersion, profile, pack: {id, activityBase}, registration, statements}` — schema `src/contracts/schemas/noema.xapi-export.v1.schema.json` |
| `cmi5Package(course, opts)` | `{files: {'cmi5.xml': xml}, aus: [{id, chapter, exercise?}]}` |
| `subjectRecord({attempts, answers, pack, chapters, accountId, site, now})` | `{name: '<id>.xapi.json', file}` (the app's export), or `null` when nothing is recorded |
| `subjectCmi5({pack, chapters, site})` / `zip(files)` | `{name: '<id>.cmi5.zip', files}` · a zip Blob of `files` (browser: JSZip through `NoemaViewer`) |
| `validate(stmt)` / `validateAll(list)` | `[problem]` — the xAPI subset + the cmi5 rules (also across statements) |
| `duration(ms)`, `uuid5(name, ns?)` | ISO 8601 duration to 0.01 s; RFC 4122 UUID v5 (SHA-1) |

`input = { attempts, answers?, pack?: {id, title, language}, chapters?: [chapter] }`, both from the learning log
(`NoemaCore.learning.xapi(subject)`, `src/features/study/domain/events/xapi.ts`; only what counts: a reset or a restore leaves
the rest out) — `attempts = [{exercise, id, seed, t0, t, hints, result: {score, passed, detail, checks?, t}, events: [{t, name,
data}]}]`: every attempt of an interactive exercise in its last version (`activity.attempted`, engine/src/32_activities.js
`saveAttempt`: its last 200 events); `answers = [{id, exercise, ok, t, conf?, n?, okCount?}]`: every answer to an ordinary
exercise (`answer.given`, 10_core.js `record`; `id` is the event's), and one entry per exercise for the answers counted before
the log (`answers.imported`: `n` answers, `okCount` right).
`chapters` only gives names and the parent chapter (otherwise the chapter is read from the id `chNN-eNNN`).

`opts`: `actor: {name?, account: {homePage, name}}` (required; **never an email**: `mbox`, `mbox_sha1sum`, `openid` are never
written, a `name` with `@` is dropped, an actor without an account throws) · `activityBase` (IRI, default
`https://noema-lite.netlify.app/xapi/<packId>/`) · `registration` (a UUID) or `registrationSeed` (any JSON → UUID v5) ·
`locale` (default: the pack's language, else `en`) · `profile: 'xapi' | 'cmi5'` · `granularity: 'chapter' | 'activity'` (cmi5)
· `extBase` (default `https://noema-lite.netlify.app/xapi/ext/`) · `now` (ms; only then `exportFile` writes `generated`).

## Mapping — profile `xapi` (default)
| noema | verb | object | result / extensions |
|---|---|---|---|
| attempt start (`t0`) | `attempted` | `<base>exercise/<exId>` (simulation) | ctx ext `attempt-id`, `seed`, `hints-used` |
| each event | `interacted` | the exercise | ctx ext `event-name`, `event-index`, `event-data` (if any); timestamp = the event's `t` |
| `result` | `passed` / `failed` | the exercise | `score {scaled, raw, min: 0, max: 1}`, `success`, `completion: true`, `duration` (t0 → result.t), ext `hints-used`, `detail`, `checks` [{label, ok}] |
| an attempt without a result | — (only `attempted` + `interacted`) | | |
| an answer | `answered` | `<base>exercise/<exId>` (cmi.interaction, `interactionType` from the type) | `success` = ok, `completion`, ext `answers-count` (1, or `n`), `correct-count`, `confidence` |

Context of every statement: `registration`, `language`, `parent` = `<base>chapter/<chId>`, `grouping` = the pack (`<base>`).
Interaction types: mcq/odd/predict/inquiry/spotbug/img_hotspot → choice · tf → true-false · cloze/img_label → fill-in ·
match/bucket/img_drag/img_select → matching · order/img_sequence → sequencing · calc → numeric · free/write → long-fill-in · else other.

## Mapping — profile `cmi5`
One session per attempt (`sessionid` = UUID v5 of registration + attempt id, on every statement). The AU is
`<base>au/<chId>` (`granularity: 'chapter'`) or `<base>au/<exId>` (`'activity'`: sims; the chapter's other exercises share `<base>au/<chId>`).

| step | verb | object | cmi5 category | notes |
|---|---|---|---|---|
| start | `initialized` | AU | cmi5 | |
| each event | `interacted` | exercise, parent = AU | — (cmi5 *allowed*) | |
| result | `answered` | exercise, parent = AU | — | the exercise's own score, success, duration |
| passed, AU not passed yet | `passed` | AU | cmi5 + moveOn | `score`, `success: true`, `duration`, no `completion` |
| failed, AU neither passed nor failed yet | `failed` | AU | cmi5 + moveOn | `success: false`, `duration` |
| the AU's first result | `completed` | AU | cmi5 + moveOn | `completion: true`, `duration` |
| end | `terminated` | AU | cmi5 | `duration` |

Per AU and registration: `passed` and `completed` at most once, no `failed` after `passed` (cmi5 §9.3) — `validateAll` checks it.
`launched`, `satisfied`, `waived`, `abandoned` belong to the LMS and are never written.

## cmi5.xml
`courseStructure` (namespace `https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd`) → `course id=<base>` {title,
description} → per chapter: an `au` (`granularity: 'chapter'`), or a `block id=<base>block/<chId>` with an `au` per sim
exercise + one for the rest (`'activity'`). Each `au`: `id`, `moveOn` (`CompletedOrPassed` by default; Passed, Completed,
CompletedAndPassed, NotApplicable), `masteryScore` (only when given), `launchMethod="AnyWindow"`, `title`, `description`, `url`
= `<launchBase>?subject=<packId>#/ch/<chId>` (launchBase default `https://noema-lite.netlify.app/`). The AU ids are the ones
the cmi5 statements use. Zipping it (cmi5.xml alone: the AUs are on the web) is up to the caller.

## Determinism
Statement id = UUID v5 of registration | verb | object | attempt id | step (an answer: its event id); attempts sorted by `t0`,
answers by time, then id. The same
input and opts give the same bytes (a re-export is idempotent at an LRS). No `Date.now()`, no randomness.

## Limits
- Every attempt of a sim is kept with its last 200 events (attempts made before the learning log: only the last one of each sim).
- An answer keeps its outcome and confidence, not the learner's response: no `result.response`. Answers counted before the
  learning log are one `answered` per exercise (with their counts).
- `score.raw` = `scaled`, on 0–1 (the activity's own scale is not known).
- The export describes statements; a cmi5 *launch* (fetch URL, auth token, LMS.LaunchData) is not implemented.
