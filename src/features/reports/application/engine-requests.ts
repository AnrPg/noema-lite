/**
 * Where an account keeps its requests for new engines (docs/INTERACTIVE_LIBRARY.md §3): a cloud account in the table
 * noema_engine_requests (the server keeps the requester and the status), a profile without a cloud account on this
 * device (the last 100, which it can download as JSON). One store interface for both, so #/engines does not care.
 */
import { ok, OK_VOID, type AsyncResult } from '../../../kernel/result.ts';
import type { Clock } from '../../../ports/clock.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';
import {
  normalizeRequest,
  REQUEST_OPEN,
  type EngineRequestRow,
  type NewEngineRequest,
  type RequestPatch,
  type Suggest,
} from '../domain/engine-requests.ts';
import type { EngineRequestServer } from '../../../ports/reports.ts';
import { adminCache } from './reports.ts';

export const LOCAL_MAX = 100;
export const localKey = (profile: string | null | undefined): string => `noema1:${profile || 'local'}:enginereq`;

export interface EngineRequestStore {
  readonly kind: 'cloud' | 'local';
  submit(row: NewEngineRequest): AsyncResult<EngineRequestRow>;
  mine(): AsyncResult<EngineRequestRow[]>;
  /** 'open', 'all' or one status */
  all(filter?: string | null): AsyncResult<EngineRequestRow[]>;
  update(id: string, patch: RequestPatch): AsyncResult<void>;
  isAdmin(): AsyncResult<boolean>;
}
export interface AccountRef {
  readonly kind?: string;
  readonly id?: string | null;
}

export interface EngineRequestService {
  normalize(input: unknown): ReturnType<typeof normalizeRequest>;
  /** the store of this account: the cloud when it is a signed-in cloud account, else this device */
  store(account: AccountRef | null | undefined): EngineRequestStore;
}

export function engineRequestService(deps: {
  server: EngineRequestServer | null;
  kv: KeyValueStore;
  clock: Clock;
  newId: () => string;
  suggest: Suggest | null;
}): EngineRequestService {
  const { server, kv, clock, newId, suggest } = deps;
  const isAdmin = server ? adminCache(server) : null;
  function cloud(s: EngineRequestServer, admin: () => AsyncResult<boolean>): EngineRequestStore {
    return {
      kind: 'cloud',
      submit: row => s.submit(row),
      mine: () => s.mine(),
      all: filter => s.all(!filter || filter === 'all' ? null : filter === 'open' ? REQUEST_OPEN : [filter]),
      update: (id, patch) => s.update(id, patch),
      isAdmin: admin,
    };
  }
  function local(key: string): EngineRequestStore {
    const read = (): EngineRequestRow[] => {
      const r = kv.get(key);
      if (!r.ok || !r.value) return [];
      try {
        const v: unknown = JSON.parse(r.value);
        return Array.isArray(v) ? (v as EngineRequestRow[]) : [];
      } catch {
        return []; // a copy that cannot be read holds no request
      }
    };
    const newestFirst = (): AsyncResult<EngineRequestRow[]> => Promise.resolve(ok(read().slice().reverse()));
    return {
      kind: 'local',
      submit(row) {
        const r: EngineRequestRow = { ...row, id: newId(), status: 'new', created_at: new Date(clock.now()).toISOString() };
        const w = kv.set(key, JSON.stringify([...read(), r].slice(-LOCAL_MAX)));
        return Promise.resolve(w.ok ? ok(r) : w);
      },
      mine: newestFirst,
      all: newestFirst,
      update: () => Promise.resolve(OK_VOID), // nobody answers a request kept on a device
      isAdmin: () => Promise.resolve(ok(false)),
    };
  }
  return {
    normalize: input => normalizeRequest(input, suggest),
    store(account) {
      if (account?.kind === 'cloud' && server && isAdmin && server.uid()) return cloud(server, isAdmin);
      return local(localKey(account?.id));
    },
  };
}
