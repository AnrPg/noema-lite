/* noema-lite — the data contracts: one JSON Schema per format (src/contracts/schemas), the types and compiled validators
   generated from them (npm run contracts → src/contracts/generated, src/contracts/validate.ts), and the migrations that
   belong to the formats (src/contracts/migrations). What a schema cannot say (the content rules, the level rules) is in
   src/features/content/domain. tools/CONTENT_SPEC.md "Data contracts".

   check(id, data) → { ok, issues }: id is a contract id — a schema ("noema.pack.v3") or one of its $defs
   ("noema.chapter.v1#exercise"); CONTRACT_IDS lists them all. A Result, never an exception (an unknown id is an issue). */
import { checkerOf } from './checker.ts';
import * as compiled from './validate.ts';

export type { ContractIssue } from './messages.ts';
export type { CheckResult } from './checker.ts';
export const CONTRACT_IDS = compiled.CONTRACT_IDS;
export type ContractId = (typeof compiled.CONTRACT_IDS)[number];

const all = checkerOf(compiled);
export const isContractId = all.isContractId;
/** Validate data against a contract. */
export const check = all.check;
/** The texts of check(id, data).issues, each prefixed with where (e.g. "ch03", "translation el"). */
export const problems = all.problems;

export * as migrations from './migrations/index.ts';
