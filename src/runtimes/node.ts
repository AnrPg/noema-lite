/* The runtimes for Node (build/runtimes-node.cjs, tools/esbuild.mjs kind "node"): the node suites (tests/activities.js,
   tests/activities_embed.js) read the runtimes' checks and code from here. */
import { createRuntimeLibrary } from './library.ts';
import { RUNTIME_PLUGINS } from './plugins.ts';
import { RUNTIME_CHECKS } from './checks.ts';

export { RUNTIME_PLUGINS } from './plugins.ts';
export { RUNTIME_CHECKS } from './checks.ts';
export { RUNTIME_DESCRIPTORS, switchedOn } from './manifests.ts';
export const runtimes = createRuntimeLibrary(RUNTIME_PLUGINS, () => RUNTIME_CHECKS);
