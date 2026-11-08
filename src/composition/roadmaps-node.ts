/* The Roadmaps domain and the 文A bridges' lookup for node (build/roadmaps-node.cjs, an entry of tools/esbuild.mjs): the node
   suites that run the older engine files in a vm (tests/curriculum_i18n.js, from_sources.js, curriculum_import.js) hand them
   NoemaCore.roadmaps / NoemaCore.bridges from here, exactly as the app and the connector do (tests/roadmaps_core.js). */
import { bridgesDomain, roadmapsDomain } from './roadmaps.ts';

export const roadmaps = roadmapsDomain;
export const bridges = bridgesDomain;
