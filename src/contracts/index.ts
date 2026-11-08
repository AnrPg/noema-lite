/* noema-lite — the data contracts: one JSON Schema per format (src/contracts/schemas), the types and compiled validators
   generated from them (npm run contracts → src/contracts/generated, src/contracts/validate.ts), and the migrations that
   belong to the formats (src/contracts/migrations). What a schema cannot say (the content rules, the level rules) is in
   src/features/content/domain. tools/CONTENT_SPEC.md "Data contracts".

   check(id, data) → { ok, issues }: id is a contract id — a schema ("noema.pack.v3") or one of its $defs
   ("noema.chapter.v1#exercise"); CONTRACT_IDS lists them all. A Result, never an exception (an unknown id is an issue). */
import { CONTRACT_IDS, VALIDATORS, REFS, SKELETONS } from './validate.ts';
import { word, type AjvError, type ContractIssue } from './messages.ts';

export type { ContractIssue } from './messages.ts';
export { CONTRACT_IDS };
export type ContractId = (typeof CONTRACT_IDS)[number];

export interface CheckResult {
  readonly ok: boolean;
  readonly issues: readonly ContractIssue[];
}

type Validator = ((data: unknown) => boolean) & { errors?: readonly AjvError[] | null };
const validators = VALIDATORS as unknown as Readonly<Record<string, Validator>>;
const refs = REFS as Readonly<Record<string, string>>;
const index = { skeletons: SKELETONS as Readonly<Record<string, { readonly [k: string]: unknown }>> };

export const isContractId = (id: string): boolean => Object.prototype.hasOwnProperty.call(validators, id);

/** Validate data against a contract. */
export function check(id: string, data: unknown): CheckResult {
  const v = validators[id],
    ref = refs[id];
  if (!v || !ref)
    return {
      ok: false,
      issues: [{ path: '', pointer: '', keyword: 'contract', message: `unknown contract "${id}"`, text: `unknown contract "${id}"` }],
    };
  if (v(data)) return { ok: true, issues: [] };
  return { ok: false, issues: word(index, ref, v.errors ?? [], data) };
}

/** The texts of check(id, data).issues, each prefixed with where (e.g. "ch03", "translation el"). */
export function problems(id: string, data: unknown, where = ''): string[] {
  return check(id, data).issues.map(i => (where ? (i.path ? `${where}.${i.text}` : `${where}: ${i.text}`) : i.text));
}

export * as migrations from './migrations/index.ts';
