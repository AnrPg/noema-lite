/* The runtimes' own checks, pure and synchronous: the content checks (src/features/content), the connector and the Node tools
   read them before any runtime's code is loaded. */
import { EMBED_CHECKS } from './external-embed/check.ts';
import { WASM_CHECKS } from './wasm-module/check.ts';

export const RUNTIME_CHECKS = Object.freeze({ embed: EMBED_CHECKS, wasm: WASM_CHECKS });
export type RuntimeChecks = typeof RUNTIME_CHECKS;
