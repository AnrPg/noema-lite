/* The data contracts of the app's page without their validators (src/composition/browser.ts): the compiled validators are
   most of the contracts' code (src/contracts/validate.ts, about 1.4 MB), so the page loads them in one piece
   (build/contracts.js, src/composition/contracts.ts) after the first screen is drawn. The facade answers like the module
   once the piece is in; the shell starts the load at start and waits for ready() before it opens a subject
   (src/composition/ui-root.ts), and everything that checks a shape (engine/packcheck.js) runs after that. */
import { NoemaError } from '../kernel/errors.ts';
import type * as Contracts from './index.ts';

export type ContractsPiece = typeof Contracts;

/** NoemaCore.contracts: the module's names, plus ready() and loaded */
export interface LazyContracts {
  /** resolves once the validators are in (loads them the first time) */
  ready(): Promise<void>;
  readonly loaded: boolean;
  check: ContractsPiece['check'];
  problems: ContractsPiece['problems'];
  isContractId: ContractsPiece['isContractId'];
  readonly CONTRACT_IDS: ContractsPiece['CONTRACT_IDS'];
  readonly rules: ContractsPiece['rules'];
  readonly migrations: ContractsPiece['migrations'];
}

/** The facade over the piece `load` brings (once; a failed load may be tried again). */
export function lazyContracts(load: () => Promise<ContractsPiece>): LazyContracts {
  let piece: ContractsPiece | null = null;
  let loading: Promise<void> | null = null;
  const need = (): ContractsPiece => {
    if (!piece) throw new NoemaError('invariant.failed', 'the data contracts are not loaded yet: await NoemaCore.contracts.ready() first');
    return piece;
  };
  return Object.freeze({
    ready: () =>
      (loading ??= load().then(
        p => {
          piece = p;
        },
        (e: unknown) => {
          loading = null;
          throw e;
        },
      )),
    get loaded() {
      return piece !== null;
    },
    check: (id: string, data: unknown) => need().check(id, data),
    problems: (id: string, data: unknown, where?: string) => need().problems(id, data, where),
    isContractId: (id: string) => need().isContractId(id),
    get CONTRACT_IDS() {
      return need().CONTRACT_IDS;
    },
    get rules() {
      return need().rules;
    },
    get migrations() {
      return need().migrations;
    },
  });
}
