/* noema-lite — the contracts on the one global bridge of phase 1 (BRIEF: window.NoemaCore): tools/contracts.mjs bundles
   this file into engine/contracts.js (an IIFE) for the classic scripts (engine/packcheck.js), the connector, the skill's
   activity host, the Node tests and the Python tools (tools/contracts.py). */
import * as contracts from './index.ts';

const g = globalThis as unknown as { NoemaCore?: Record<string, unknown> };
g.NoemaCore = Object.assign(g.NoemaCore ?? {}, { contracts });
