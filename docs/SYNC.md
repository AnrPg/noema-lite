# Sync between devices (cloud accounts)

Sync is automatic. You never press a button, and no device can overwrite progress made on another one.
The code lives in `engine/cloud.js`, the "in use" card in `engine/loader.js`, and the in-memory refresh in `engine/src/10_core.js`.

## The three rules

1. **Version-checked saves (compare-and-swap).** Each device remembers which cloud version of every key its copy came from
   (`meta:base`, the row's `updated_at`) and which keys it changed since then (`meta:unsynced`, kept across reloads).
   A save to the cloud is `PATCH … &updated_at=eq.<that version>`. If another device or the Claude connector changed the row
   in the meantime, the cloud refuses the save. The device then combines the two copies and tries again.
   Device clocks never decide anything; they are only a tie-breaker when two copies have to be combined.
2. **Combining instead of choosing.** When both sides changed a key:
   * subject progress (`s:<subject>:state`): answers keep the copy with more attempts; flashcards and playbooks keep the
     later review; read sections, beaten bosses and applied inbox rows are kept from both; XP takes the higher value. A
     **reset** (`resetAt`) wins over older progress, but answers given after the reset on the other device are kept.
   * XP and streak (`a:stats`): XP per day takes the higher value, and total XP adds the days only the other device had.
     The streak comes from the copy that studied more recently.
   * curricula (`a:curriculum:*`): the newer copy wins, and the chapter plans of both are kept (`NoemaCurriculum.mergePlans`).
     Plans are also merged on every pull and push, because an older app version or the connector can write a stale copy whole.
   * settings and other records: every field from both copies; where both set the same field, the newer one wins.
   * anything else: the newer copy wins.
   Before combining can drop something this device had, a **restore point** is saved on the device (at most one every 10 minutes).
   A key deleted on one device and changed on the other is kept, because losing data is worse than keeping it.
3. **One device at a time.** The row `a:inuse` (cloud only, never copied into localStorage) holds the tab that is being used
   right now: visible and touched in the last 2 minutes. It is renewed every 30 s and released when the tab is hidden or closed.
   * Is the other device idle, hidden or closed? This one takes over silently, pulls, and the open page folds the new progress
     into what it holds in memory (`noema:remote` event), so its next save can't write the older copy back.
   * Is the other device in use right now? This one shows **"Noema is open on iPhone · Safari"** with a single **Use here**
     button. Nothing is saved on the waiting device (`Noema.kv.frozen`). "Use here" pauses the other device, which shows the
     same card, and brings its progress here. The paused device also resumes on its own once the other one is put away.
   * Offline: a device that can't reach the cloud keeps working. Its changes wait in `meta:unsynced` and are combined when it
     reconnects, even if another device was used in the meantime.

## Edge cases and what happens now

| Case | Before | Now |
|---|---|---|
| Two devices or tabs used at the same time | the last save wiped the other's answers | the second one waits behind the "in use" card |
| Offline device comes back online | it uploaded first, so older offline data could overwrite newer cloud progress, or the newer copy wiped the offline answers | the save is refused, both copies are combined, and nothing is lost |
| A device clock is wrong | the wrong copy counted as "newer" | versions are compared exactly; clocks only break ties |
| An open page holds an old copy in memory | its next save wrote that old copy back | `noema:remote` folds the new progress in first |
| Something deleted on one device | another device uploaded it again | the deletion reaches the other devices (unless they changed that item since) |
| Restoring a backup or snapshot | other devices could undo it | it reaches every device; the confirm boxes say so, and a restore point/snapshot comes first |
| Reset of a subject | another device brought the old progress back | `resetAt` wins over older progress |
| Phone storage full | the download was counted as done, and the change was lost on that device | it is not counted; the sync dot shows the error and the next pull tries again |
| Claude connector writes while a device saves | last write won | the device's save is refused and combined |
| Tab closed before the upload finished | pending changes were forgotten in memory | `meta:unsynced` survives the reload and is uploaded next time |

## Not covered (yet)

* Conversations (`noema_conversations`) still use "the newer conversation wins" for each conversation; they are append-mostly, so this rarely matters.
* Two people sharing one account cannot study in parallel. That is by design.
* With combining, a subject's XP can come out slightly low when two devices studied the same subject on the same day while both were offline.

## For other parts of the app (e.g. the language courses)

Every `Noema.kv` key of a cloud account syncs this way automatically. If a new key holds progress that should only grow,
add a rule for it in `mergeValue` (`engine/cloud.js`). If a page keeps that data in memory, listen for
`noema:remote` (`detail.keys` = full localStorage keys that another device changed) and fold the stored copy into it,
the way `engine/src/10_core.js` does for `S`.
