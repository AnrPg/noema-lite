# ADR 004 · Result instead of exceptions, coded NoemaErrors, one ErrorReporter, no empty catch

* **Status:** accepted (phase 1, 2026-11-07).
* **Builds on:** the error-code contract of docs/i18n.md §6 (the codes, their catalog texts in `i18n/errors/`).

## Context

- **Swallowed failures.** The old code had about 70 empty `catch` blocks and `.catch(() => {})` handlers. Some of them
  hid real losses:
  - a backup to the folder that failed;
  - a sync push that failed;
  - settings that could not be read;
  - a listener that threw and stopped the others.
- **The full-storage warning.** It travelled as a DOM event (`noema:storagefull`) that three files fired and one file
  listened to.
- **Mixed error styles.** Some functions threw, some returned `null`, and some returned `false`.

The error-code contract (docs/i18n.md §6) already gave user-facing failures stable codes with catalog texts, but
nothing in the code held to it as a type.

## Decision

- **`NoemaError`** (`src/kernel/errors.ts`) carries `code`, frozen `params`, `retryable` and an optional `status`.
  `ErrorCode` is a union of two lists:
  - **`USER_ERROR_CODES`** are exactly the table of docs/i18n.md §6.2. A unit test checks the table and
    `i18n/errors/en.arb`. The learner sees these as `err.<code>`.
  - **`INTERNAL_ERROR_CODES`** cover `storage.*`, `remote.*`, `compute.*`, `ai.unsupported`, `hlc.*`, `day.invalid`,
    `id.invalid`, `container.*`, `invariant.failed` and `internal.unexpected`. They have no catalog text, because they
    never reach the learner as themselves.

  `NoemaError.from(thrown)` wraps anything else.
- **`Result<T, E = NoemaError>`** (`src/kernel/result.ts`). Ports, adapters and the domain return a Result and do not
  throw. An adapter converts exceptions at its edge. An exception is left only for a broken invariant.
- **The ErrorReporter port** (`src/ports/error-reporter.ts`, adapter `src/adapters/local/error-reporter.ts`):
  - `report(error, {where, severity, context, notify})` writes a bounded journal, persisted on the device under
    `noema-device:errors`, logs to the console and counts in telemetry;
  - with `notify`, it also tells the learner, at most once a minute per code: `error` and above as an alert in the
    assertive live region, lower severities as a toast;
  - `catcher(where, options)` is the same thing as a function for `.catch(...)`;
  - a listener that throws, or a journal write that fails, never reports again, so a report can never loop.
- **The storage-full signal** is part of the Storage port (`onFull`). The browser root turns it into a
  `storage.quota` report with `notify`. The reporter maps that code to the catalog key `loader.storage.full`, so the
  learner sees the same words as before, in the same live region `#noema-alert`. The DOM event and its listener are
  deleted.
- **No empty catch.** A caught failure is reported, or it carries a comment that says why ignoring it is right. Two
  examples of such comments:
  - "a language this browser cannot name: the code is shown instead";
  - "only waiting for the other run to end: its error is its caller's".

  Phase 1 applied this to `engine/loader.js`, `engine/shell.js`, `engine/cloud.js` and `engine/src/10_core.js`.

## Consequences

- Failures that were invisible now land in the journal, with a `where` that names the place, for example
  `loader.autobackup`, `cloud.sync.push` or `engine.remote.state`. Support can read the journal.
- Background sync failures are reported at `info`, because the cloud status already shows "offline" and the journal
  should not fill with the same thing. Failures that lose work, such as a failed save on leaving or a failed backup,
  are `warning` or `error`.
- The old UI speaks plain values through the bridge (`false` / `null`), and the bridge reports what it swallows once
  per code and page.
- A new user code needs three steps: the §6.2 table, `i18n/errors/en.arb` plus drafts, and `USER_ERROR_CODES`. The
  test fails until all three agree.

## Alternatives

- **Exceptions everywhere with a global `window.onerror`.** An async rejection that is caught and ignored never
  reaches it, and "where did it fail" is lost.
- **A Result library (neverthrow, ts-results).** It would be a dependency for about 100 lines. Our own Result is
  typed against `NoemaError` by default and plays well with type stripping.
- **A hosted error service (Sentry).** It sends data off the device, which the privacy rules of the app do not allow
  by default. The journal stays local. Sending it would be a separate, opt-in decision.
