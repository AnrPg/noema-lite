/**
 * People's use cases (docs/SOCIAL.md): what is known now (my row, my conversations, my buddies, my blocks, the names
 * seen) in one state with one listener list; keeping my row in step with my account; finding people; sending a file into
 * a room (the row, the object, the server's check — nothing left behind when a step fails). The polling (every 45 s while
 * the app is visible) is the screen's: it calls refresh().
 */
import { ok, OK_VOID, type AsyncResult } from '../../../kernel/result.ts';
import type { ErrorReporter } from '../../../ports/error-reporter.ts';
import {
  bondWith,
  chatFilePath,
  groupsOf,
  MAX_NAME,
  nameSearch,
  othersOf,
  pairOf,
  peopleQuery,
  requestsFor,
  waitingFor,
  type Bond,
  type BuddyRow,
  type InboxRow,
} from '../domain/social.ts';
import type { PersonRow, SocialServer } from '../../../ports/social.ts';

export interface SocialState {
  mine: PersonRow | null;
  inbox: InboxRow[];
  buddies: BuddyRow[];
  blocks: string[];
  names: Record<string, PersonRow>;
  loaded: boolean;
}
/** The account the row follows. */
export interface AccountLike {
  readonly name?: string | null;
  readonly emoji?: string | null;
  readonly email?: string | null;
}

export interface SocialService {
  readonly server: SocialServer;
  readonly state: Readonly<SocialState>;
  me(): string | null;
  /** f now and on every change → stop listening */
  onChange(f: () => void): () => void;
  /** the screen changed the state (a room read): tell the listeners */
  changed(): void;
  /** my row: made the first time (findable, buddies may message me), kept in step with the account's name and emoji */
  ensureMe(account: AccountLike, force?: boolean): AsyncResult<PersonRow>;
  savePrivacy(patch: Readonly<Record<string, unknown>>): AsyncResult<void>;
  refresh(): AsyncResult<void>;
  /** the rows of these people (read once) */
  names(ids: readonly string[]): AsyncResult<PersonRow[]>;
  search(q: string): AsyncResult<PersonRow[]>;
  bond(x: string): Bond;
  requests(): BuddyRow[];
  waiting(): number;
  groups(): { id: string; name: string }[];
  unbuddy(x: string): AsyncResult<void>;
  /** a file into a room → its path */
  putFile(room: string, file: { readonly name: string; readonly size: number; readonly blob: Blob }, mime: string): AsyncResult<string>;
  dropFile(path: string): AsyncResult<void>;
  /** forget everything (another account) */
  reset(): void;
}

export function socialService({
  server,
  errors,
  newId,
}: {
  server: SocialServer;
  errors: ErrorReporter;
  newId: () => string;
}): SocialService {
  const S: SocialState = { mine: null, inbox: [], buddies: [], blocks: [], names: {}, loaded: false };
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const f of listeners)
      try {
        f();
      } catch (e) {
        errors.report(e, { where: 'social.listener', severity: 'error' });
      }
  };
  const me = (): string | null => server.uid();

  async function names(ids: readonly string[]): AsyncResult<PersonRow[]> {
    const unknown = [...new Set(ids)].filter(x => x && !S.names[x]);
    if (unknown.length) {
      const r = await server.people(unknown);
      if (!r.ok) return r;
      for (const p of r.value) S.names[p.user_id] = p;
    }
    return ok(ids.map(x => S.names[x]).filter((p): p is PersonRow => !!p));
  }

  return {
    server,
    get state() {
      return S;
    },
    me,
    changed: emit,
    onChange(f) {
      listeners.add(f);
      f();
      return () => listeners.delete(f);
    },
    async ensureMe(account, force = false) {
      if (S.mine && !force) return ok(S.mine);
      const uid = me();
      const name = (account.name || (account.email ?? '').split('@')[0] || '').trim().slice(0, MAX_NAME) || '…';
      const got = await server.me();
      if (!got.ok) return got;
      const row = got.value,
        search = nameSearch(name),
        emoji = account.emoji || null;
      if (!row || row.display_name !== name || (row.emoji || null) !== emoji || row.search !== search) {
        const up: PersonRow = { user_id: uid ?? '', display_name: name, emoji, search };
        const put = await server.putMe(up);
        if (!put.ok) return put;
        S.mine = { findable: true, dm_from: 'buddies', ...(row ?? {}), ...up };
      } else S.mine = row;
      return ok(S.mine);
    },
    async savePrivacy(patch) {
      const r = await server.patchMe(patch);
      if (!r.ok) return r;
      S.mine = { ...(S.mine ?? { user_id: me() ?? '' }), ...patch };
      emit();
      return OK_VOID;
    },
    async refresh() {
      if (!me()) return OK_VOID;
      const [ib, bd, bl] = await Promise.all([server.inbox(), server.buddies(), server.blocks()]);
      if (!ib.ok) return ib;
      if (!bd.ok) return bd;
      if (!bl.ok) return bl;
      S.inbox = ib.value;
      S.buddies = bd.value;
      S.blocks = bl.value.map(x => x.blocked);
      S.loaded = true;
      const n = await names(othersOf(me(), S.buddies));
      if (!n.ok) errors.report(n.error, { where: 'social.names', severity: 'info' }); // the names show as "someone" until the next refresh
      emit();
      return OK_VOID;
    },
    names,
    async search(q) {
      const f = peopleQuery(q);
      if (!f.length) return ok([]);
      const r = await server.search(f);
      return r.ok ? ok(r.value.filter(p => !S.blocks.includes(p.user_id))) : r;
    },
    bond: x => bondWith(x, me(), S.buddies, S.blocks),
    requests: () => requestsFor(me(), S.buddies),
    waiting: () => waitingFor(me(), S.inbox, S.buddies),
    groups: () => groupsOf(S.inbox),
    unbuddy(x) {
      const [a, b] = pairOf(me() ?? '', x);
      return server.unbuddy(a, b);
    },
    async putFile(room, file, mime) {
      const path = chatFilePath(room, file.name, newId());
      const ins = await server.insertFile({ path, room, name: file.name.slice(0, 200), mime, size: file.size });
      if (!ins.ok) return ins;
      const put = await server.putObject(path, file.blob, mime);
      const done = put.ok ? await server.finishFile(path) : put;
      if (done.ok) return ok(path);
      await server.removeObject(path);
      await server.removeFileRow(path);
      return done;
    },
    async dropFile(path) {
      await server.removeObject(path); // an object already gone is fine; the row is what counts
      return server.removeFileRow(path);
    },
    reset() {
      Object.assign(S, { mine: null, inbox: [], buddies: [], blocks: [], names: {}, loaded: false });
    },
  };
}
