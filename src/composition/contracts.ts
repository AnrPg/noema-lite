/**
 * The entry of build/contracts.js (tools/esbuild.mjs, kind "lazy"): the compiled data contracts (src/contracts), which the
 * page runs once after its first screen (src/contracts/lazy.ts, wired in src/composition/browser.ts). It hands them over on
 * self.__noemaContractsPiece, which the loader reads right after the script has run.
 */
import * as contracts from '../contracts/index.ts';
import type { ContractsPiece } from '../contracts/lazy.ts';

(globalThis as { __noemaContractsPiece?: ContractsPiece }).__noemaContractsPiece = contracts;
