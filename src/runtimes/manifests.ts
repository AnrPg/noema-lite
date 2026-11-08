/* The manifests of the activity runtimes (data only, no code): what the app knows of every runtime at start, and how the
   deployment switches it (config.js NOEMA_CONFIG.activities). The code of each runtime is src/runtimes/plugins.ts (loaded
   lazily: build/runtimes.js on a page, src/runtimes/library.ts). A new runtime gets its line here and in plugins.ts;
   src/runtimes/library.test.ts checks they agree. */
import type { PluginManifest } from '../plugins/index.ts';
import type { RuntimeSwitch } from './types.ts';

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
}

const LIST: readonly (readonly [`${string}@${number}`, RuntimeSwitch, (readonly string[])?])[] = [
  ['external-embed@1', 'opt-in'],
  ['wasm-module@1', 'on', ['wasm@1']],
];

/** every runtime the registry holds */
export const RUNTIME_DESCRIPTORS: readonly RuntimeDescriptor[] = Object.freeze(
  LIST.map(([id, sw, engines]) =>
    Object.freeze({ manifest: runtimeManifest(id), switch: sw, engines: Object.freeze([...(engines ?? [])]) }),
  ),
);

/** is the runtime switched on by this flag? 'on': unless set to false; 'opt-in': only when set to true */
export const switchedOn = (sw: RuntimeSwitch, flag: unknown): boolean => (sw === 'opt-in' ? flag === true : flag !== false);
