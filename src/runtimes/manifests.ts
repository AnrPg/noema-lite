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
}

const LIST: readonly (readonly [`${string}@${number}`, RuntimeSwitch])[] = [
  ['external-embed@1', 'opt-in'],
  ['sim-spec@1', 'on'],
  ['html-app@1', 'on'],
];

/** every runtime the registry holds */
export const RUNTIME_DESCRIPTORS: readonly RuntimeDescriptor[] = Object.freeze(
  LIST.map(([id, sw]) => Object.freeze({ manifest: runtimeManifest(id), switch: sw })),
);

/** is the runtime switched on by this flag? 'on': unless set to false; 'opt-in': only when set to true */
export const switchedOn = (sw: RuntimeSwitch, flag: unknown): boolean => (sw === 'opt-in' ? flag === true : flag !== false);
