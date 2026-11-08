/**
 * The entry of build/contracts.js (tools/esbuild.mjs, kind "lazy"): the compiled data contracts (src/contracts) and the
 * content checks that are built on them (src/features/content), which the page runs once at its start
 * (src/contracts/lazy.ts, src/features/content/application/lazy.ts, wired in src/composition/browser.ts). It hands them
 * over on self.__noemaContractsPiece, which the loader reads right after the script has run.
 */
import * as contracts from '../contracts/index.ts';
import type { ContractsPiece } from '../contracts/lazy.ts';
import { contentChecks } from '../features/content/application/index.ts';

/** what build/contracts.js hands the page */
export interface ChecksPiece {
  readonly contracts: ContractsPiece;
  readonly contentChecks: typeof contentChecks;
}

(globalThis as { __noemaContractsPiece?: ChecksPiece }).__noemaContractsPiece = { contracts, contentChecks };
