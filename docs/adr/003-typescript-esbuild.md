# ADR 003 · TypeScript 6 strict, run by Node's type stripping, bundled by esbuild

* **Status:** accepted (phase 1, 2026-11-07). The toolchain files (package.json, tsconfig.json, tools/esbuild.mjs) belong
  to the toolkit area. This record states what the core requires of them.

## Context

The new core must be type-checked strictly, so that a missing case, an unchecked index or an optional field set to
`undefined` is a compile error. It must also meet three conditions:

- **Fast tests.** It must run in Node tests without a build step, so that each test takes milliseconds.
- **Old pages.** It must load into the old pages as one classic script, because `index.html` and the one-file bundle
  have no module loader. The bundle also runs from `file://`.
- **Workers.** It must run in a Web Worker.

## Decision

- **TypeScript 6** with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`.
  `tsc --noEmit` is a check only. It never emits code.
- **Code that Node can strip.** Tests run with `node --test --experimental-strip-types "src/**/*.test.ts"`. The source
  therefore follows these rules:
  - imports are relative and name the `.ts` extension;
  - type-only imports use `import type`;
  - there are no `enum`s, no `namespace`s and no constructor parameter properties (use `as const` objects and
    explicit fields);
  - private state uses `#fields`.
- **esbuild** bundles each root to an IIFE for ES2022:
  - `src/composition/app.ts` → `build/app.js`;
  - `src/composition/worker.ts` → `build/worker.js`.

  Both files are committed like `engine/engine.js`, so the site, the bundle and every old test keep working without
  Node. `tools/build.py` copies them into the site, and inlines them into the bundle. In the bundle, the Worker comes
  from a `<script type="text/plain" id="noema-core-worker-src">`.
- **No import-time platform access.** Importing a module never touches `document`, `localStorage`, `setTimeout` and
  the like, so the bundle also loads in a bare `vm` and in Workers.
- **Node types for tests only.** Test files start with `/// <reference types="node" />`. `@types/node` is a dev
  dependency.

## Consequences

- The tests need no transpiler, no Jest and no ts-node. A contributor needs Node ≥ 22.
- A syntax that the type stripper cannot erase is rejected at test time, so the rules above are enforced in practice.
- Generated files are in git. CI must check that `build/app.js` and `build/worker.js` match `npm run build`,
  the same way it checks `engine/engine.js` (toolkit area).
- esbuild does not type-check. `npm run typecheck` is a separate step of `npm run check` and CI.

## Alternatives

- **Plain JavaScript with JSDoc types.** The checks are weaker: `exactOptionalPropertyTypes`, branded types and
  discriminated unions are awkward in JSDoc.
- **tsc emit or Rollup with Babel.** Both are slower and need more configuration. esbuild bundles an IIFE with one
  command.
- **ES modules in the page (`<script type="module">`).** They do not load from `file://` in Chromium, and the one-file
  offline bundle depends on that.
- **ts-node or tsx for tests.** That is one more dependency, and Node's built-in type stripping covers the need.
