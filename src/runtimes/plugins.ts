/* Every activity runtime as a plugin of the microkernel (kind 'runtime'): its manifest and switch (manifests.ts) and its lazy
   entry, the runtime's code (an import() that esbuild bundles into build/runtimes.js, the node bundle and the harness). */
import { RUNTIME_DESCRIPTORS } from './manifests.ts';
import type { RuntimeModule, RuntimePlugin } from './types.ts';

const ENTRIES: Readonly<Record<string, () => Promise<{ default: RuntimeModule }>>> = {
  'external-embed@1': () => import('./external-embed/runtime.ts'),
};

export const RUNTIME_PLUGINS: readonly RuntimePlugin[] = Object.freeze(
  RUNTIME_DESCRIPTORS.map(d => {
    const load = ENTRIES[d.manifest.id];
    if (!load) throw new Error(`src/runtimes/plugins.ts has no entry for ${d.manifest.id}`);
    return Object.freeze({ ...d, entry: () => load().then(m => m.default) });
  }),
);
