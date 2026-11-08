/* The typed boundary of logic@1 (the code: ./logic.js): the engine module, and the part of its API for other engines that the typed
   engines call (philo@1's arguments), with the types of their results. logic.ts replaces this file and ./logic.js together. */
import type { EngineModule } from '../types.ts';

/** a formula of logic@1 (its parse tree: {t: 'atom' | 'not' | 'and' | …, n?, a?, b?, …}) */
export type Formula = Readonly<Record<string, unknown>>;
/** parse(text, lang) → the tree, or a parse error (code, pos, msg) */
export type ParseResult =
  { readonly ok: true; readonly ast: Formula } | { readonly ok: false; readonly code: string; readonly pos: number; readonly msg: string };
/** a valuation of atoms */
export type Valuation = Record<string, boolean>;
declare const api: EngineModule & {
  readonly parse: (text: unknown, lang?: string) => ParseResult;
  readonly atomsOf: (f: unknown, out?: string[]) => string[];
  readonly truthTable: (fs: readonly unknown[], atoms?: string[]) => { atoms: string[]; rows: Valuation[]; cols: (0 | 1)[][] };
  readonly entails: (
    prem: readonly unknown[] | null | undefined,
    concl: unknown,
    opts?: { readonly logic?: string } | null,
  ) => { valid: boolean | null; counter: Valuation | null; codes: string[] };
};
export default api;
