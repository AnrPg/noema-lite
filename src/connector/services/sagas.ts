/* Sagas with idempotency keys for the connector's multi-step writes (docs/CLAUDE_CONNECTOR.md §Sagas).
   A saga is one row of noema_sagas (cloud/supabase.sql §18), keyed by an idempotency key the tool derives from what it saves
   (the uploaded file's content, the answer's text…), so a repeated call — Claude retrying after a timeout, the same upload
   finished twice — finds the saga and does nothing twice:
     · done    → the result of the first call is returned again (replayed), unless stillDone() says the state it made is gone
                 (the learner deleted the subject, say): then it runs again from the start
     · running → another call is doing it right now (its lease lasts LEASE): "being saved, try again in a moment"
     · failed, or running with its lease run out → it is resumed: the steps it recorded as done are skipped, their outputs reused
   Each step is recorded once it has run (a compare-and-swap on the row: a saga taken over by another call stops at its next
   step). A step may name a compensation: when a later step throws, the compensations of the steps done IN THIS CALL run in
   reverse order, the saga is marked failed with the error, and what was undone is no longer recorded — so a failure always
   leaves the state the tool documents (and the next call with the same key starts from there). */
import { isoAfter, message, type Json } from '../util.ts';
import type { Supabase } from './supabase.ts';

export const SAGA_LEASE_MS = 10 * 60e3;
const KEEP_MS = 7 * 24 * 3600e3;   // finished sagas are kept a week (a retry after that runs again: every step is safe to repeat)

export interface SagaRow { key: string; kind: string; status: 'running' | 'done' | 'failed'; steps: Record<string, Json>; result: Json; error: string | null; lease_until: string | null; updated_at: string }
export type SagaOutcome<R> = { status: 'done'; value: R; replayed: boolean } | { status: 'busy' } | { status: 'lost' };

export class SagaBusy extends Error { constructor() { super('saga taken over by another call'); this.name = 'SagaBusy'; } }

export interface SagaContext {
  /** Run `fn` once for this saga: recorded when done, skipped (its output returned) on a resumed run. */
  step<T extends Json>(name: string, fn: () => Promise<T>, compensate?: (out: T) => Promise<void>): Promise<T>;
  readonly key: string;
  readonly resumed: boolean;
}

const enc = encodeURIComponent;
const T = '/rest/v1/noema_sagas';
const REP = { Prefer: 'return=representation' };

export class Sagas {
  private readonly sb: Supabase;
  private readonly uid: string;
  private readonly now: () => number;
  constructor(sb: Supabase, uid: string, now: () => number = Date.now) { this.sb = sb; this.uid = uid; this.now = now; }

  private async read(key: string): Promise<SagaRow | null> {
    return (await this.sb.request<SagaRow[] | null>(`${T}?select=*&key=eq.${enc(key)}`))?.[0] ?? null;
  }
  /** Change the row only if it is still the version read (the server stamps the next version, strictly later). */
  private async swap(row: SagaRow, patch: Partial<SagaRow>): Promise<SagaRow | null> {
    const r = await this.sb.request<SagaRow[] | null>(`${T}?key=eq.${enc(row.key)}&updated_at=eq.${enc(row.updated_at)}`, { method: 'PATCH', body: { ...patch, updated_at: isoAfter(row.updated_at, this.now()) }, headers: REP });
    return r?.[0] ?? null;
  }
  private lease(): string { return new Date(this.now() + SAGA_LEASE_MS).toISOString(); }

  /** Start (or find) the saga `key` → the row this call now holds, or a finished / busy outcome. */
  private async begin<R>(kind: string, key: string, stillDone: ((v: R) => Promise<boolean>) | undefined): Promise<{ row: SagaRow; resumed: boolean } | SagaOutcome<R>> {
    for (let i = 0; i < 3; i++) {
      const at = new Date(this.now()).toISOString();
      const ins = await this.sb.request<SagaRow[] | null>(`${T}?on_conflict=user_id,key`, { method: 'POST', body: [{ user_id: this.uid, key, kind, status: 'running', steps: {}, result: null, error: null, lease_until: this.lease(), updated_at: at }], headers: { Prefer: 'resolution=ignore-duplicates,return=representation' } });
      if (ins?.[0]) { this.sweep(); return { row: ins[0], resumed: false }; }
      const row = await this.read(key); if (!row) continue;   // finished and swept between the two requests
      if (row.status === 'done') {
        if (!stillDone || await stillDone(row.result as R)) return { status: 'done', value: row.result as R, replayed: true };
        const got = await this.swap(row, { status: 'running', steps: {}, result: null, error: null, lease_until: this.lease() });   // its state is gone: again from the start
        if (got) return { row: got, resumed: false };
        continue;
      }
      if (row.status === 'running' && Date.parse(row.lease_until ?? '') > this.now()) return { status: 'busy' };
      const got = await this.swap(row, { status: 'running', error: null, lease_until: this.lease() });   // failed, or its call stopped: resume
      if (got) return { row: got, resumed: true };
    }
    return { status: 'busy' };
  }

  /** Run `body` as the saga `key` (see the header). Throws what `body` throws, after the compensations. */
  async run<R extends Json>(kind: string, key: string, body: (s: SagaContext) => Promise<R>, opts: { stillDone?: (v: R) => Promise<boolean> } = {}): Promise<SagaOutcome<R>> {
    const b = await this.begin<R>(kind, key, opts.stillDone);
    if (!('row' in b)) return b;
    let row = b.row;
    const undo: { name: string; run: () => Promise<void> }[] = [];
    const record = async (patch: Partial<SagaRow>): Promise<void> => {
      const got = await this.swap(row, patch); if (!got) throw new SagaBusy(); row = got;
    };
    const ctx: SagaContext = {
      key, resumed: b.resumed,
      step: async <T extends Json>(name: string, fn: () => Promise<T>, compensate?: (out: T) => Promise<void>): Promise<T> => {
        if (Object.prototype.hasOwnProperty.call(row.steps, name)) return row.steps[name] as T;
        const out = await fn();
        if (compensate) undo.push({ name, run: () => compensate(out) });
        await record({ steps: { ...row.steps, [name]: out }, lease_until: this.lease() });
        return out;
      },
    };
    try {
      const value = await body(ctx);
      await record({ status: 'done', result: value, lease_until: null });
      return { status: 'done', value, replayed: false };
    } catch (e) {
      if (e instanceof SagaBusy) return { status: 'lost' };
      const steps = { ...row.steps };
      for (const u of undo.reverse()) {
        try { await u.run(); delete steps[u.name]; }
        catch (ce) { steps[u.name + ':undo-failed'] = message(ce).slice(0, 300); }
      }
      await this.swap(row, { status: 'failed', steps, error: message(e).slice(0, 1000), lease_until: null }).catch(() => null);
      throw e;
    }
  }

  /** The result of the saga `key` when it is done (a tool checks this before checks that a repeated call would fail, e.g. an
      answer whose task the app has applied meanwhile). */
  async finished<R extends Json>(key: string): Promise<R | undefined> {
    const r = await this.read(key).catch(() => null);
    return r?.status === 'done' ? (r.result as R) : undefined;
  }

  /** Drop the account's finished sagas older than a week (at most once per instance and hour; never waited for). */
  private sweep(): void {
    const t = this.now(); if (t - lastSweep < 3600e3) return; lastSweep = t;
    const before = new Date(t - KEEP_MS).toISOString();
    this.sb.request(`${T}?updated_at=lt.${enc(before)}&status=neq.running`, { method: 'DELETE' }).catch(() => null);
  }
}
let lastSweep = 0;

/** The idempotency key of a saga: the tool, the target and a hash of what it saves. */
export const sagaKey = (...parts: (string | number)[]): string => parts.map(p => String(p).replace(/[^a-zA-Z0-9._@-]/g, '_')).join(':').slice(0, 200);
