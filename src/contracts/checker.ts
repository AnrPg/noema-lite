/* noema-lite — check(id, data) over a set of compiled validators (tools/contracts.mjs writes them: src/contracts/validate.ts
   every contract, src/contracts/validate-start.ts the few the app's page checks at its start). A Result, never an
   exception: an unknown id is an issue. */
import { word, type AjvError, type ContractIssue } from './messages.ts';

export interface CheckResult {
  readonly ok: boolean;
  readonly issues: readonly ContractIssue[];
}

/** what a generated validators module exports */
export interface CompiledContracts {
  readonly VALIDATORS: unknown;
  readonly REFS: unknown;
  readonly SKELETONS: unknown;
}

type Validator = ((data: unknown) => boolean) & { errors?: readonly AjvError[] | null };

export function checkerOf(m: CompiledContracts) {
  const validators = m.VALIDATORS as Readonly<Record<string, Validator>>;
  const refs = m.REFS as Readonly<Record<string, string>>;
  const index = { skeletons: m.SKELETONS as Readonly<Record<string, { readonly [k: string]: unknown }>> };
  const isContractId = (id: string): boolean => Object.prototype.hasOwnProperty.call(validators, id);
  /** Validate data against a contract. */
  function check(id: string, data: unknown): CheckResult {
    const v = isContractId(id) ? validators[id] : undefined,
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
  const problems = (id: string, data: unknown, where = ''): string[] =>
    check(id, data).issues.map(i => (where ? (i.path ? `${where}.${i.text}` : `${where}: ${i.text}`) : i.text));
  return { isContractId, check, problems };
}
