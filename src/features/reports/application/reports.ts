/**
 * Sending a ⚑ report, and keeping it when the network is down (docs/REPORTS.md §1): a report that cannot be sent waits on
 * this device (the last three; without their screenshots when the storage is full) and goes when the app is back. And the
 * admins' side: whether this person reviews reports, the list, one report, its answer.
 */
import type { NoemaError } from '../../../kernel/errors.ts';
import { ok, OK_VOID, type AsyncResult, type Result } from '../../../kernel/result.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';
import { REPORT_OPEN, type ReportRow } from '../domain/report.ts';
import type { AdminCheck, ReportServer } from '../../../ports/reports.ts';

export const OUTBOX_KEY = 'noema1:report:outbox';
export const OUTBOX_MAX = 3;

/** A failure that only the network caused: the report waits and is sent later. */
const offline = (e: NoemaError): boolean => e.code === 'cloud.network' || e.code === 'auth.network';

/** The admin check of one person, asked once (asked again after a failure or for another person). */
export function adminCache(server: AdminCheck): () => AsyncResult<boolean> {
  let asked: AsyncResult<boolean> | null = null,
    askedFor: string | null = null;
  return () => {
    const me = server.uid();
    if (!me) return Promise.resolve(ok(false));
    if (askedFor !== me) {
      askedFor = me;
      asked = null;
    }
    if (!asked)
      asked = server.isAdmin().then(r => {
        if (!r.ok) asked = null;
        return r.ok ? r : ok(false);
      });
    return asked;
  };
}

export type Sent = 'sent' | 'queued';
/** The reports' list filters: open (new, seen, fixing), all, or one status. */
export type ReportFilter = string;
export const statusesOf = (filter: ReportFilter | null | undefined): readonly string[] | null =>
  !filter || filter === 'all' ? null : filter === 'open' ? REPORT_OPEN : [filter];

export interface ReportService {
  readonly server: ReportServer;
  /** sent now, or kept on this device to be sent later (offline); any other failure is the caller's to show */
  send(row: ReportRow): AsyncResult<Sent>;
  /** send what waits (when signed in); what fails for another reason than the network is dropped (the server refused it) */
  flush(): AsyncResult<number>;
  outbox(): ReportRow[];
  isAdmin(): AsyncResult<boolean>;
  newCount(): AsyncResult<number>;
  list(filter: ReportFilter): AsyncResult<ReportRow[]>;
  one(id: string): AsyncResult<ReportRow | null>;
  save(id: string, patch: { status?: string; admin_note?: string | null; fixed_in?: string | null }): AsyncResult<void>;
  remove(id: string): AsyncResult<void>;
}

export function reportService({ server, kv }: { server: ReportServer; kv: KeyValueStore }): ReportService {
  const read = (): ReportRow[] => {
    const r = kv.get(OUTBOX_KEY);
    if (!r.ok || !r.value) return [];
    try {
      const v: unknown = JSON.parse(r.value);
      return Array.isArray(v) ? v.filter((x): x is ReportRow => !!x && typeof x === 'object') : [];
    } catch {
      return []; // an outbox that cannot be read holds nothing that could be sent
    }
  };
  const write = (list: readonly ReportRow[]): Result<void> => {
    const last = list.slice(-OUTBOX_MAX);
    const r = kv.set(OUTBOX_KEY, JSON.stringify(last));
    return r.ok ? r : kv.set(OUTBOX_KEY, JSON.stringify(last.map(x => ({ ...x, shot: null })))); // full: keep the words, drop the pictures
  };
  const isAdmin = adminCache(server);
  return {
    server,
    async send(row) {
      const r = await server.send(row);
      if (r.ok) return ok('sent');
      if (!offline(r.error)) return r;
      const kept = write([...read(), row]);
      return kept.ok ? ok('queued') : kept;
    },
    async flush() {
      if (!server.uid()) return ok(0);
      const list = read();
      if (!list.length) return ok(0);
      const left: ReportRow[] = [];
      let sent = 0;
      for (const row of list) {
        const r = await server.send(row);
        if (r.ok) sent++;
        else if (offline(r.error)) left.push(row);
      }
      const w = write(left);
      return w.ok ? ok(sent) : w;
    },
    outbox: read,
    isAdmin,
    async newCount() {
      const r = await server.newCount();
      return r.ok ? r : ok(0); // a count that cannot be read shows as no news, as before: the list itself says what failed
    },
    list: filter => server.list(statusesOf(filter)),
    one: id => server.one(id),
    save: (id, patch) => server.save(id, patch),
    async remove(id) {
      const r = await server.remove(id);
      return r.ok ? OK_VOID : r;
    },
  };
}
