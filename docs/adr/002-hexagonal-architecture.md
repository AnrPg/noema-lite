# ADR 002 · Hexagonal architecture: kernel, ports, adapters, composition roots

* **Status:** accepted (phase 1 of the redesign, 2026-11-07).
* **See:** docs/ARCHITECTURE.md (the picture, the layers, the rules, how to add things).

## Context

The app is about 40 hand-written scripts in `engine/` that share globals (`NoemaDay`, `NoemaCloud`, `NoemaClaude`,
`Noema`, …). Each script reaches `localStorage`, `fetch`, `Date` and the DOM directly. This causes four problems:

- **Testing.** A test of the logic needs a browser (Playwright), or a `vm` context faked by hand for each test file.
- **Duplication.** The same mechanism exists several times: three toast implementations, two quota checks, four
  `today()` helpers.
- **Lost errors.** About 70 empty `catch` blocks swallow failures, so nobody, not even a log, learns that a backup or
  a sync failed.
- **Spread vendor formats.** The formats of Supabase, Claude and Gemini are spread through the screens.

The redesign (phases 1–3) moves the code to TypeScript and needs a structure that lets the work proceed in parallel
areas, while the old UI keeps working, so that each part can be tested in Node and swapped without touching its users.

## Decision

The app is organised as ports and adapters with composition roots:

- **`src/kernel/`** holds pure values and rules: Result, NoemaError, ids, LocalDay, HLC and invariants. It does no I/O.
- **`src/ports/`** holds one interface per need of the core: Storage, Remote, Auth, Clock, AI, Compute, ErrorReporter,
  I18n, Telemetry and Notifier. Each port has a **contract suite** that every adapter must pass.
- **`src/adapters/`** holds one folder per technology: browser, memory, local, supabase, claude and gemini. Vendor
  formats stay inside the folder (ADR 006).
- **`src/composition/`** holds the roots: browser, worker, tools and connector. They are the only code that picks
  adapters. They use a small typed DI container whose API is stable and documented in `container.ts`.
- **The dependency rule** is roots → adapters → ports → kernel. ESLint `boundaries` enforces it.
- **The old UI** reaches the core through one phase bridge, `window.NoemaCore`, which the browser root builds.

Every old global that the new code replaces is deleted in the same change, and its callers use `NoemaCore`.

## Consequences

- Every port and adapter is tested in Node in milliseconds: 161 tests in phase 1, with fakes of localStorage,
  IndexedDB, Worker, the DOM, Supabase and both AI APIs.
- A feature depends on interfaces, so a second implementation is an adapter plus a registration. Examples are an
  offline Remote, another AI vendor, or a Worker that is not available.
- `build/app.js` (about 85 KB unminified) is one more script on the page, and it must load before every other
  engine script.
- Two worlds live side by side until phase 3. The bridge is the seam, and its surface may only grow.
- The roots are the only place that knows which adapters exist. A reviewer finds the wiring of the whole app in one
  file per environment.

## Alternatives

- **Keep the globals and add types (JSDoc / `// @ts-check`).** This is cheap, but it fixes none of the problems
  above: logic stays tied to the platform, errors stay swallowed, and there are no contracts.
- **A framework's DI (InversifyJS, tsyringe).** These need decorators and reflection metadata, which `--experimental-
  strip-types` and esbuild's IIFE bundling handle poorly. About 90 lines of our own container cover the need: tokens,
  lazy singletons, cycle detection and freezing.
- **A layered architecture without ports (services calling `localStorage` directly).** Testing would again need a
  browser. Vendor formats would again leak into the services.
- **Rewrite the UI first.** That is impossible without a stable core to stand on. It is phase 3, on top of this core.
