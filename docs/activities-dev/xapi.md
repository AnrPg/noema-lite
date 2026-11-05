# xAPI / cmi5 export (P6, docs/adr/001 D12)

`engine/src/43_xapi.js` → `window.NoemaXAPI` (and `module.exports` for node). Pure functions: no network, no LRS posting.
The app turns the result into a JSON file the learner downloads (the wiring is not in this file). Tests: `node tests/xapi.js`.

## API
| call | gives |
|---|---|
| `statements(input, opts)` | `[statement]`, xAPI 1.0.3 |
| `exportFile(input, opts)` | `{format: 'noema.xapi-export/v1', xapiVersion, profile, pack: {id, activityBase}, registration, statements}` — schema `tools/schemas/noema.xapi-export.v1.schema.json` |
| `cmi5Package(course, opts)` | `{files: {'cmi5.xml': xml}, aus: [{id, chapter, exercise?}]}` |
| `validate(stmt)` / `validateAll(list)` | `[problem]` — the xAPI subset + the cmi5 rules (also across statements) |
| `duration(ms)`, `uuid5(name, ns?)` | ISO 8601 duration to 0.01 s; RFC 4122 UUID v5 (SHA-1) |

`input = { att: S.att, res?: S.res, pack?: {id, title, language}, chapters?: [chapter] }` — `S.att[exId] = {id, seed, t0, t,
hints, result: {score, passed, detail, checks?, t}, events: [{t, name, data}]}` (engine/src/32_activities.js `saveAttempt`: the
last 200 events); `S.res[exId] = {n, ok, last, t, conf?}` (10_core.js `record`). `att` may also be a list `[{exercise, …}]`.
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
| an `S.res` answer | `answered` | `<base>exercise/<exId>` (cmi.interaction, `interactionType` from the type) | `success` = last, `completion`, ext `answers-count`, `correct-count`, `confidence` |

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
Statement id = UUID v5 of registration | verb | object | attempt id | step; attempts sorted by `t0`, answers by id. The same
input and opts give the same bytes (a re-export is idempotent at an LRS). No `Date.now()`, no randomness.

## Limits
- Exactly what `S.att` keeps: the **last** attempt of each sim and its last 200 events; earlier attempts are gone.
- `S.res` keeps counts and the last outcome, not the learner's response: no `result.response`, one `answered` per exercise.
- `score.raw` = `scaled`, on 0–1 (the activity's own scale is not known).
- The export describes statements; a cmi5 *launch* (fetch URL, auth token, LMS.LaunchData) is not implemented.
