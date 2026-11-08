/**
 * The events channel (docs/SYNC.md §Events): pushes the outbox to the cloud's append-only log (remote log `events`, table
 * noema_events) and pulls the events other devices appended since this device's cursor into the learning log.
 * Conflict-free: two devices' events are a union by id; nothing is ever merged, overwritten or deleted.
 */
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, type Result } from '../../../kernel/result.ts';
import type { ErrorReporter } from '../../../ports/error-reporter.ts';
import type { LogEntry, Remote } from '../../../ports/remote.ts';
import type { DocumentStore } from '../../../ports/storage.ts';
import type { DeviceClock } from './device.ts';
import { SYNC_COLLECTION, type Outbox } from './outbox.ts';
import type { SyncChannel, SyncEvent, SyncEventLog } from './ports.ts';

export const EVENTS_STREAM = 'events';
/** Events per round (the adapter splits them into requests). */
export const PUSH_BATCH = 500;
/** A keepalive request must stay under 64 KB: the events of one, as JSON text. */
export const KEEPALIVE_BYTES = 48_000;
const PULL_PAGE = 1000;

export const cursorKey = (account: string, stream: string): string => `cursor|${account}|${stream}`;

/** A log entry → the event it carries, when it is one (its body names the same id, a type, a stamp and a device). */
export function eventOf(e: LogEntry): Result<SyncEvent> {
  const b = e.body;
  if (b && typeof b === 'object' && !Array.isArray(b)) {
    const o = b as { readonly [k: string]: unknown };
    if (o['id'] === e.id && typeof o['type'] === 'string' && typeof o['hlc'] === 'string' && typeof o['device'] === 'string')
      return ok(b as SyncEvent);
  }
  return err(
    new NoemaError('sync.invalid_event', 'a cloud event that is not one: ' + e.id.slice(0, 80), { params: { id: e.id.slice(0, 80) } }),
  );
}

const entryOf = (e: SyncEvent): LogEntry => ({ id: e.id, kind: e.type, stamp: e.hlc, device: e.device, body: e });

export interface EventsChannelDeps {
  readonly remote: Remote;
  readonly docs: DocumentStore;
  readonly outbox: Outbox;
  readonly log: SyncEventLog;
  readonly device: DeviceClock;
  readonly errors: ErrorReporter;
}

export function eventsChannel(d: EventsChannelDeps): SyncChannel {
  return {
    name: 'events',
    pending: account => d.outbox.count(account),

    async push(account, { keepalive }) {
      const q = await d.outbox.peek(account, PUSH_BATCH);
      if (!q.ok) return q;
      let batch = q.value;
      if (keepalive) {
        let bytes = 0;
        const fit: Array<readonly [string, SyncEvent]> = [];
        for (const x of batch) {
          bytes += JSON.stringify(x[1]).length * 1.2 + 80;
          if (bytes > KEEPALIVE_BYTES && fit.length) break;
          fit.push(x);
        }
        batch = fit;
      }
      if (!batch.length) return ok(0);
      const sent = await d.remote.log.append(
        EVENTS_STREAM,
        batch.map(([, e]) => entryOf(e)),
        { keepalive },
      );
      if (!sent.ok) return sent;
      const gone = await d.outbox.remove(batch.map(([k]) => k));
      return gone.ok ? ok(batch.length) : gone; // not taken out: sent again next time, and ignored there
    },

    async pull(account) {
      const key = cursorKey(account, EVENTS_STREAM);
      const c = await d.docs.get<string>(SYNC_COLLECTION, key);
      if (!c.ok) return c;
      let after = c.value ?? null;
      for (;;) {
        const page = await d.remote.log.read(EVENTS_STREAM, { after, limit: PULL_PAGE });
        if (!page.ok) return page;
        const events: SyncEvent[] = [];
        for (const e of page.value.entries) {
          const ev = eventOf(e);
          if (ev.ok) events.push(ev.value);
          else d.errors.report(ev.error, { where: 'sync.events.pull', severity: 'warning' });
        }
        if (events.length) {
          const kept = await d.log.receive(account, events);
          if (!kept.ok) return kept; // the cursor stays: the same page comes again
          const latest = events.reduce((m, e) => (e.hlc > m ? e.hlc : m), '');
          const seen = d.device.receive(latest);
          if (!seen.ok) d.errors.report(seen.error, { where: 'sync.events.clock', severity: 'info' }); // a device clock far ahead: its events are kept, this clock does not follow it
        }
        if (page.value.cursor !== after) {
          const saved = await d.docs.put(SYNC_COLLECTION, key, page.value.cursor);
          if (!saved.ok) return saved;
          after = page.value.cursor;
        }
        if (!page.value.more) return ok([]); // the learning log tells its own readers (the read models)
      }
    },
  };
}
