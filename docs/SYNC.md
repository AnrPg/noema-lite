# Sync between devices (cloud accounts)

Sync is automatic and **local-first**: everything is written on this device first, and the app works the same without a
network. The sync brings in what the other devices did and sends what waits here. You never press a button, and no device
can overwrite what another one did.

| Part | Where |
|---|---|
| the statechart library (states, guards, timed transitions, effects as data) | `src/kernel/statechart.ts` |
| the sync loop and the "one device at a time" lease, as statecharts (pure) | `src/features/sync/domain/sync-machine.ts`, `lease.ts` |
| the settings as per-field registers (pure) | `src/features/sync/domain/registers.ts` |
| the outbox, the channels, the loop and lease services | `src/features/sync/application/` |
| the tokens, the registration, the phase bridge `NoemaCore.sync` | `src/composition/sync.ts` |
| the cloud side: `noema_events`, `noema_settings`, their read functions | `cloud/supabase.sql` §19 |
| the key/value channel (curricula, language courses, records, the entry tables, conversations) | `engine/cloud.js` |
| the "in use" card, the start | the UI root (src/composition/ui-root.ts) and the areas (engine/app/*.js) |
| the open subject takes in what changed under it | `engine/src/10_core.js` (`noema:remote`) |

## What travels how

| Data | Cloud | How it merges |
|---|---|---|
| the learning log: answers, reviews, progress (events of `src/features/study`) | `noema_events` — append-only rows, one per event id, owner only | **by id**: the union of every device's events; a repeated send changes nothing |
| the settings (`a:settings`) | `noema_settings` — one row per field (`settings.<field>`) | **per field, the later stamp wins** (hybrid logical clock); a removal is a `null` value |
| curricula, language courses (`s:lang:…`), other records (`a:…`) | `noema_kv` — one row per key | compare-and-swap on the row's version, two changed copies combined (below) |
| the 👁 source files' and the 文A bridges' indexes | `noema_source_files`, `noema_bridges` — one row per entry | per entry (docs/CLAUDE_CONNECTOR.md §Tables) |
| conversations | `noema_conversations` — one row each | the newer conversation wins |
| who is using the account right now | `noema_kv` row `a:inuse` | compare-and-swap (the lease, below) |

A device's secrets (the Gemini key: `apiKey`) are never sent; they stay in `noema-device:geminiKey:<account>`.

## The clock

Every device has an id (`noema-device:id`) and a **hybrid logical clock** (`src/kernel/hlc.ts`, its last stamp kept in
`noema-device:hlc`): a stamp `"<15-digit ms>-<5-digit counter>-<device>"` whose text order is the time order, never goes
backwards on a device, and moves past every stamp the device has seen from the others. A stamp more than **5 minutes**
ahead of the cloud's clock is stored as the cloud's time (the `noema_settings` trigger; `storedStamp` in
`src/ports/remote.ts`), so a device whose clock runs ahead can never win for ever; a device whose clock runs behind loses
nothing, because a field it changes is stamped past every stamp it has seen.

## The outbox and the events

The learning log's append (`src/features/study`, the event store) writes each new event **and** its outbox entry in one
IndexedDB transaction (`OUTBOX.enqueueIn(tx, account, events)`, collection `sync`, keys `outbox|<account>|<hlc>|<id>`),
then calls `OUTBOX.notify(account)`, which wakes the loop. Only cloud accounts (`u_<uid>`) queue anything; a local profile's
events never leave the device.

* **Push** (`events-channel.ts`): the oldest 500 entries are appended to `noema_events` (`on_conflict=user_id,id`,
  `ignore-duplicates`), then taken out of the outbox. A push whose answer was lost is sent again and changes nothing.
  Leaving the page sends with `keepalive` (at most 48 KB a request).
* **Pull**: `noema_events_since(after, max_rows)` from the cursor kept in `cursor|<account>|events`, page by page (1000);
  every event goes to the log (`SYNC_EVENT_LOG.receive`, which keeps it once by id), the clock moves past the newest stamp,
  then the cursor is saved. An entry that is not an event (no id, type, stamp or device) is reported and skipped.

**Cursors.** Each row gets the id of the transaction that wrote it (`tx xid8`) and a number (`seq`); a read passes only
rows of transactions older than every running one (`tx < pg_snapshot_xmin(pg_current_snapshot())`), in `(tx, seq)` order,
with the cursor `"<tx>:<seq>"`. A row that commits later with a smaller number is therefore never skipped.

## The settings

`a:settings` stays where the app reads it; the settings channel (`settings-channel.ts`) keeps a register per field
(`reg|<account>|settings` in the collection `sync`: value, stamp, sent).

* After every write of the record (`NoemaCore.sync.settings.changed`, from `Noema.kv`'s listener) and before every pull,
  the fields that changed are stamped with the clock.
* The first time a device registers the record, its fields are as old as possible, not "now": the defaults a new device
  writes at sign-in, or an old copy on a device that comes back after months, never win over choices made elsewhere. Only a
  change the old key/value sync had not sent yet (`meta:unsynced`) gets its own time (`meta:mtime`).
* Push: the unsent fields go to `noema_settings`; the cloud keeps a field only when its stamp is later than the stored one
  (the trigger `noema_sync_stamp`) and answers with what it stored.
* Pull: `noema_settings_since` from the cursor; a field with a later stamp than this device's is written into the record,
  and the open page takes it in (`noema:remote`).

## The key/value rows

What is neither progress nor settings stays in `noema_kv` (the channel `kv` of `engine/cloud.js`):

1. **Version-checked saves (compare-and-swap).** Each device remembers which cloud version of every key its copy came from
   (`meta:base`, the row's `updated_at`) and which keys it changed since then (`meta:unsynced`, kept across reloads). A save
   is `PATCH … &updated_at=eq.<that version>`. If another device or the Claude connector changed the row meanwhile, the cloud
   refuses it; the device combines the two copies and tries again. Clocks never decide anything here.
2. **Combining instead of choosing** (`mergeValue`):
   * curricula (`a:curriculum:*`): the newer copy wins, and the chapter plans of both are kept (`NoemaCurriculum.mergePlans`).
     Plans are also merged on every pull and push, because an older app version or the connector can write a stale copy
     whole. A plan the other copy made for a subject attached to a step never comes back over a copy that has taken that
     subject off since (`assignedAt` is later).
   * language courses (`s:lang:<course>:…`, `mergeLang`): per word and track the later review wins, the earliest first-seen
     day is kept, a lesson check keeps the best score and the most tries, the lesson ladder's read-the-theory step keeps its
     earliest day (D22), a grammar function's log keeps every day.
   * other records: every field from both copies; where both set the same field, the newer copy wins.
   * anything else: the newer copy wins.
   Before combining can drop something this device had, a **restore point** is saved on the device (at most one every 10
   minutes). A key deleted on one device and changed on the other is kept.
3. The rows other apps write for this one (`a:inbox:…`, `a:curin:…`, the Claude app's claims), the lease row and the entry
   tables' caches are never mirrored here.

**The rows from before the log and the registers.** The cloud may still hold an account's old progress rows
(`s:<subject>:state`, `a:stats`) and its old `a:settings` row. Each is read once per version (`meta:legacy`) and never
written back: an old settings row is taken in field by field, stamped with the row's own time (so a newer choice is never
replaced by it; a Gemini key an older version synced is moved to this device and taken out of the row); an old progress
row goes to the learning log's migration (`LEGACY_PROGRESS`; until it is there, the row is kept on a device that has none).
The rows stay in the cloud for apps not yet updated (§Cleaning up).

## The loop

`sync-machine.ts`, run by `sync-service.ts` over the channels (settings, events, then `kv`):

```
stopped ──START──▶ pulling ──PULLED──▶ pushing ──PUSHED──▶ idle ──CHANGED──▶ waiting ──(3 s, at most 10 s)──▶ pushing
                      └──FAILED──────────┴──▶ offline  no network: when back on line, or after a minute
                                              backoff  retryable (server, rate limit): 2 s · 2ⁿ, at most 5 min
                                              failed   needs the learner or an update (an old schema, permissions): 10 min, or when woken
```

* `idle` pulls again every 5 minutes (the Claude connector writes too), and when woken: the page is shown again, the
  device is back on line, the learner presses **🔄 Sync now** (`NoemaCloud.pull` / `push` → `NoemaCore.sync`).
* A steady stream of changes cannot starve the push: it runs at most 10 s after the first one.
* The lease held elsewhere holds the loop in `paused`; taking the account over pulls at once.
* Leaving (the page hidden or closed): the open page saves first (`flushSave`), then everything that waits is sent with
  `keepalive`, whatever the loop was doing. What does not make it waits for the next start: nothing is lost.
* One pull or push runs at a time. `NoemaCore.sync.ready()` resolves after the first pull of a start (the app waits for it
  at most 7 s before its first screen).

## One device at a time

`lease.ts`, run by `lease-service.ts`: the row `a:inuse` names the tab being used right now (visible and touched in the
last 2 minutes: `sid` = the tab, `dev` = the device, `os` + `br` for the card). It is written by compare-and-swap, renewed
every 30 s while the tab is used and released when the tab is hidden or closed.

* Is the other device idle, hidden or closed (released, or not renewed for 2 minutes)? This one takes over silently and
  pulls; the open page reads again what changed under it (`noema:remote`, every key of the account after a takeover,
  because another tab of the same browser may have written it).
* Is it in use right now? This one shows **"Noema is open on iPhone · Safari"** with one **Use here** button
  (the UI root (src/composition/ui-root.ts) and the areas (engine/app/*.js)). Nothing is saved on the waiting device (`Noema.kv.frozen`) and its loop is paused; it looks again
  every 10 s while it is shown. "Use here" takes the lease anyway, which pauses the other device (same card) and brings its
  work here. The paused device carries on by itself once the other one is put away.
* Two tabs writing the row at once: one wins, the other reads again (at most twice, then it waits).
* Offline: the device keeps working; its changes wait and merge when it reconnects.

## The cloud (cloud/supabase.sql §19)

* `noema_events (user_id, id, type, hlc, device, body jsonb ≤ 64 KB, tx, seq, created_at)`, primary key `(user_id, id)`;
  row-level security: the owner reads and adds, nobody changes or deletes.
* `noema_settings (user_id, key, value jsonb|null, hlc, device, tx, seq, updated_at)`, primary key `(user_id, key)`; the
  owner reads, adds and changes; the trigger keeps the later stamp and clamps one from the future.
* `noema_events_since(after, max_rows)` / `noema_settings_since(after, max_rows)`: the owner's rows after a cursor (≤ 1000).
* Tested on a real PostgreSQL by `tests/sql_policies.py`; the app's 🩺 cloud check has a step for them.

### Cleaning up (optional, later)

Once every device runs an app with the learning log, the old rows can go (the owner's choice; nothing reads them then):

```sql
delete from public.noema_kv where key = 'a:stats' or key = 'a:settings' or (key ~ '^s:.+:state$' and key not like 's:lang:%');
```

## NoemaCore.sync (the phase bridge)

`start(account)` · `stop()` · `ready()` · `changed()` · `now()` · `pull()` · `push({ keepalive })` ·
`status()` → `{ signedIn, state, syncing, lastSync, error (NoemaError), errorInfo, pending, lease }` · `onStatus(fn)` ·
`onRemote(fn(account, keys))` · `channel({ name, pending, pull, push, beforeLeave })` (the key/value channel of
`engine/cloud.js`) · `settings.changed(account)` · `settings.importLegacy(account, text, version)` ·
`legacyProgress(account, key, text)` · `lease.state` · `lease.holder` · `lease.device` · `lease.check({ take })` ·
`lease.release()` · `lease.onChange(fn(state, holder))`. `NoemaCloud.status()` / `onStatus()` give the same state with
`error` as words in the UI language (the sync dot, Me › Cloud).

## Seams for the other features

* `SYNC_EVENT_LOG` (`src/composition/sync.ts`): the learning log registers it (`receive(account, events)` → how many were
  new); the events channel runs only when it is there.
* `OUTBOX`: the log's append calls `enqueueIn(tx, account, events)` inside its own transaction (the collection `sync` is
  part of it), then `notify(account)`.
* `LEGACY_PROGRESS`: the log's one-time migration of the cloud's old progress rows (`accept(account, key, text)`).
* `DEVICE_CLOCK`: this device's id and clock; the log stamps its events with it (`now()`).

## Edge cases

| Case | What happens |
|---|---|
| Two devices or tabs used at the same time | the second one waits behind the "in use" card |
| The same answer given on two devices offline | both events are kept (different ids); the read models count them |
| An event sent twice (the answer to a push was lost) | the cloud keeps it once (unique id) |
| A setting changed on two devices | the later change wins for that field; other fields of both are kept |
| A device clock years behind | its new changes are stamped past everything it has seen, so they still count |
| A device clock far ahead | its stamps are stored as the cloud's time (5 minutes at most ahead) |
| A new device, or an old one back after months | its first registration is as old as possible: the choices made elsewhere win |
| Offline for days | events wait in the outbox, settings in their registers, keys in `meta:unsynced`; all go when it reconnects |
| Tab closed before the upload finished | the outbox, the registers and `meta:unsynced` survive the reload and go next time |
| A row written while a read runs | the read's cursor never passes a transaction still running |
| Phone storage full | what could not be stored is not counted as taken in; the error is reported and the next pull tries again |
| The cloud has no §19 tables yet | the events and settings channels fail (`cloud.schema_old`), the loop retries every 10 minutes; nothing is lost |

## Tests

`src/kernel/statechart.test.ts`, `src/features/sync/domain/*.test.ts` (every state and transition of both machines),
`src/composition/sync.test.ts` (devices sharing a memory cloud: the outbox, idempotent pushes, offline, the settings, the
lease, the loop), `src/ports/contract/remote.contract.ts` (the log and the registers, for the memory and Supabase adapters),
`tests/sql_policies.py` (§19 on PostgreSQL), `tests/e2e.js` (two browsers on the Supabase emulator `tests/mock_supabase.js`:
the settings, the legacy rows, the lease, compare-and-swap), `tests/lang_sync.js` (language courses).
