/* The manifests of the activity runtimes (data only, no code): what the app knows of every runtime at start, and how the
   deployment switches it (config.js NOEMA_CONFIG.activities). The code of each runtime is src/runtimes/plugins.ts (loaded
   lazily: build/runtimes.js on a page, src/runtimes/library.ts). A new runtime gets its line here and in plugins.ts;
   src/runtimes/library.test.ts checks they agree. */
import type { PluginManifest } from '../plugins/index.ts';
import type { RuntimeAvailability, RuntimeSwitch } from './types.ts';

export const runtimeManifest = (id: `${string}@${number}`): PluginManifest => ({
  id,
  kind: 'runtime',
  version: `${id.slice(id.lastIndexOf('@') + 1)}.0.0`,
  needs: [],
  provides: ['runtime:' + id],
  locales: [],
});

export interface RuntimeDescriptor {
  readonly manifest: PluginManifest;
  readonly switch: RuntimeSwitch;
  /** the engines of sim-spec@1 the runtime brings (known before its code is loaded: pack.requires, ACT.caps()) */
  readonly engines: readonly string[];
  /** where it can run at all, when not everywhere (availableHere) */
  readonly available?: RuntimeAvailability;
}

const LIST: readonly (readonly [`${string}@${number}`, RuntimeSwitch, (readonly string[])?, RuntimeAvailability?])[] = [
  ['external-embed@1', 'opt-in'],
  ['sim-spec@1', 'on'],
  ['html-app@1', 'on'],
  ['wasm-module@1', 'on', ['wasm@1']],
  // Python needs the site's service worker and cache, Workers and WebAssembly: never file:// or the one-file bundle
  ['py-module@1', 'on', [], { where: 'website', note: 'engine.act.py.noHere' }],
  ['h5p@1', 'on'],
];

/** every runtime the registry holds */
export const RUNTIME_DESCRIPTORS: readonly RuntimeDescriptor[] = Object.freeze(
  LIST.map(([id, sw, engines, available]) =>
    Object.freeze({
      manifest: runtimeManifest(id),
      switch: sw,
      engines: Object.freeze([...(engines ?? [])]),
      ...(available ? { available } : {}),
    }),
  ),
);

/** can a runtime with this rule run in this scope (a page: globalThis)? 'website': over http(s) in a secure context, not the
    one-file bundle (NOEMA_BUNDLE), with the Cache API, SubtleCrypto, Workers and WebAssembly */
export function availableHere(where: RuntimeAvailability['where'] | undefined, scope: object = globalThis): boolean {
  if (!where) return true;
  try {
    const g = scope as {
      NOEMA_BUNDLE?: unknown;
      isSecureContext?: boolean;
      location?: { protocol?: string };
      crypto?: { subtle?: unknown };
      Worker?: unknown;
      WebAssembly?: unknown;
    };
    return !!(
      !g.NOEMA_BUNDLE &&
      g.isSecureContext &&
      /^https?:$/.test(g.location?.protocol ?? '') &&
      'caches' in scope &&
      g.crypto?.subtle &&
      typeof g.Worker === 'function' &&
      typeof g.WebAssembly === 'object'
    );
  } catch {
    return false;
  }
}

/** is the runtime switched on by this flag? 'on': unless set to false; 'opt-in': only when set to true */
export const switchedOn = (sw: RuntimeSwitch, flag: unknown): boolean => (sw === 'opt-in' ? flag === true : flag !== false);
