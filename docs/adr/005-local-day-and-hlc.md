# ADR 005 · The learner's day is a LocalDay; ordering across devices uses a hybrid logical clock

* **Status:** accepted (phase 1, 2026-11-07). Replaces `engine/day.js` (`NoemaDay`, deleted).

## Context

The app has two time problems.

**Days.** Streaks, daily XP, due flashcards, daily caps and backup names are all counted in days. The audit fix
`engine/day.js` had already moved them from the UTC date to the device's local date. In Athens, the UTC date changes
at 02:00 or 03:00, so a session after midnight counted for the day before. But each caller still did its own
arithmetic:

- the shell computed "this week's Monday" from `new Date().getDay()`;
- nothing rejected a malformed stored day.

Day arithmetic through midnight breaks on DST changes: a "day" can be 23 or 25 hours, and in some zones midnight does
not exist at all.

**Order across devices.** Sync uses compare-and-swap with `updated_at` stamps (`isoAfter`: never equal to the
previous stamp). Phase 2 needs an order of learning events across devices that survives clock skew. Wall time alone
does not give one: two devices write in the same millisecond, or a clock runs behind.

## Decision

- **`LocalDay`** (`src/kernel/day.ts`) is a branded `"YYYY-MM-DD"` for the device's local calendar date.
  - `dayOf(moment)` reads the local fields.
  - Arithmetic goes through **local noon** (`addDays`, `weekStart`), so a DST jump never skips or repeats a day.
  - `daysBetween` uses `Date.UTC` of the two dates, so the result is exact whole days.
  - `parseDay` validates the text, including the real length of each month, and returns `day.invalid` otherwise.
  - The tests switch `TZ` and cover Athens, São Paulo, New York, Lord Howe (a 30-minute DST change) and UTC.
- **The Clock port** gives `now()` and `today()`. Nothing in the core calls `Date.now()` directly. The old UI uses
  `NoemaCore.clock.today()` and `NoemaCore.day.*`. Its stored days are checked with `day.is` before arithmetic, so a
  broken `lastDay` restarts the streak instead of producing `NaN`.
- **The hybrid logical clock** (`src/kernel/hlc.ts`) is a timestamp `{wall, count, node}`.
  - `hlcTick` makes a timestamp strictly after the last local one.
  - `hlcReceive` merges a remote timestamp. A remote one more than `HLC_MAX_DRIFT_MS` (5 min) ahead is refused with
    `hlc.drift`, so one bad clock cannot drag every device into the future.
  - `count` overflow fails with `hlc.overflow`.
  - `encodeHlc` gives `"<15-digit wall>-<5-digit count>-<node>"`, which sorts as text.
- **Remote versions** of rows stay ISO stamps for compatibility with the existing table and with `engine/cloud.js`.
  `versionAfter(prev, now)` keeps them strictly later than the stamp they replace (`max(now, prev + 1 ms)`). The
  Remote contract checks this with a frozen clock.

## Consequences

- There is one implementation of "today" and day arithmetic for the old UI, the new core and (through `tools.ts`) the
  Node tools.
- Learning events in phase 2 can be ordered by HLC across devices, without trusting any single clock.
- Stored days written by the old `NoemaDay` have the same format, so no migration is needed.
- `today()` depends on the device's time zone. A learner who travels can gain or lose a day at the change. This is
  accepted, because the alternative (one fixed home zone) is surprising in everyday use.

## Alternatives

- **UTC days.** This is the bug that the audit fixed.
- **A date library (Temporal polyfill, date-fns-tz, Luxon).** It would be heavy for three operations. `Temporal` will
  replace the internals of `day.ts` once browsers ship it, and the port stays the same.
- **Vector clocks.** They are exact, but they grow with the number of devices. HLC gives a total order that is close
  to wall time, in constant size.
- **Server-assigned sequence numbers.** They do not work offline, and the app is local-first.
