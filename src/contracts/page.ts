/* The data contracts inside the app's page scripts (build/app.js, build/ui.js): tools/esbuild.mjs bundles this file in
   place of src/contracts/index.ts for every entry of kind "page", so the domain modules keep importing ./index.ts while
   the compiled validators of every contract (about 1.4 MB) stay in their own piece, build/contracts.js.
   - The few contracts the page checks at its start (tools/contracts.mjs START_CONTRACTS: the learning log's events, read
     and made from the moment the log opens) are compiled into the page itself (src/contracts/validate-start.ts).
   - Every other one answers once NoemaCore.contracts.ready() has handed the piece over (src/contracts/lazy.ts,
     src/composition/browser.ts); the UI root starts that load at once and waits for it before it opens a subject
     (src/composition/ui-root.ts). A check of one before that is a bug of the caller (invariant.failed), never a pass. */
import { NoemaError } from '../kernel/errors.ts';
import { checkerOf } from './checker.ts';
import type * as Contracts from './index.ts';
import * as compiled from './validate-start.ts';

export type { CheckResult, ContractId, ContractIssue } from './index.ts';

const start = checkerOf(compiled);
let piece: typeof Contracts | null = null;

/** The validators of every contract are in (once per page). */
export function provideContracts(p: typeof Contracts): void {
  piece = p;
}
const need = (id: string): Pick<typeof Contracts, 'check' | 'problems' | 'isContractId'> => {
  if (piece) return piece;
  if (start.isContractId(id)) return start;
  throw new NoemaError('invariant.failed', `the data contracts are not loaded yet (${id}): await NoemaCore.contracts.ready() first`);
};

export const check: typeof Contracts.check = (id, data) => need(id).check(id, data);
export const problems: typeof Contracts.problems = (id, data, where) => need(id).problems(id, data, where);
export const isContractId: typeof Contracts.isContractId = id => need(id).isContractId(id);
