/* The thin ESM wrapper around the app's script files the connector runs (engine/packcheck.js, curriculum.js, curjobs.js…):
   one copy of that code, shared with the app, without its globals leaking into the connector's runtime.
   Each file is a classic script that publishes its module on `window` (or `root`, `globalThis`) and reads the modules of
   the files before it by name (NoemaCurriculum, NoemaExpr…). Here every file runs inside ONE scope object of its own:
     · `window`, `self` and `globalThis` inside the files are a view of that scope: what a file publishes lands in the scope,
       what it reads comes from the scope, else from the real global (fetch, Intl, setTimeout, a test's NOEMA_IMG_FETCH…)
     · a bare name a file reads (NoemaLLM) resolves to the scope first (a `with` scope that holds only published modules)
   Nothing is written to the real global object. The files are the text bundled by tools/connector_bundle.mjs (legacy:…). */

export interface LegacySource { path: string; text: string }
export type LegacyScope = Record<string, unknown>;

const realGlobal: Record<string, unknown> = globalThis as unknown as Record<string, unknown>;

/** Run the files in order in a fresh scope → the scope with everything they published. `provide`: modules the files may
    read by name that come from the new code (src/engines, …), put into the scope before the first file runs. */
export function runLegacy(sources: LegacySource[], provide: LegacyScope = {}): LegacyScope {
  const scope: LegacyScope = Object.create(null) as LegacyScope;
  Object.assign(scope, provide);
  const view = new Proxy(scope, {
    get(t, k) {
      if (typeof k !== 'string') return undefined;
      if (k in t) return t[k];
      const v = realGlobal[k];
      // a plain function of the runtime (fetch, setTimeout, atob) called as window.fetch(…) must keep its own `this`
      return typeof v === 'function' && /^[a-z]/.test(k) ? (v as (...a: unknown[]) => unknown).bind(globalThis) : v;
    },
    set(t, k, v) { if (typeof k === 'string') t[k] = v; return true; },
    has(t, k) { return typeof k === 'string' && (k in t || k in realGlobal); },
    deleteProperty(t, k) { if (typeof k === 'string') delete t[k]; return true; },
    defineProperty(t, k, d) { if (typeof k === 'string') Object.defineProperty(t, k, d); return true; },
    getOwnPropertyDescriptor(t, k) { return typeof k === 'string' ? Object.getOwnPropertyDescriptor(t, k) : undefined; },
  });
  scope.window = view; scope.self = view; scope.globalThis = view;
  for (const s of sources) {
    let run: (scope: LegacyScope, self: unknown) => void;
    try {
      // a script, not a module: compiled as one (sloppy at its top, as a <script> is; the files' own 'use strict' applies inside them)
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- the one place the app's scripts are evaluated, in their own scope
      run = new Function('__noemaScope', '__noemaThis', `with (__noemaScope) { return (function () {\n${s.text}\n}).call(__noemaThis); }`) as typeof run;
    } catch (e) { throw new Error(`${s.path}: ${e instanceof Error ? e.message : String(e)}`); }
    run(scope, view);
  }
  return scope;
}
