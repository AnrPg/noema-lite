/**
 * Making and reading events: an event from outside (a store, another device, a backup) is parsed against the contract
 * (parse, don't validate); an event the app makes is a draft (type, subject, item, data) stamped by the application
 * (id, HLC stamp, day, device, account) and checked the same way. Ids of imported events are content hashes, so an
 * import repeated (a migration run twice, a row of another app read twice) adds nothing.
 */
import { check } from '../../../../contracts/index.ts';
import { NoemaError } from '../../../../kernel/errors.ts';
import { err, ok, type Result } from '../../../../kernel/result.ts';
import type { EventDataMap, EventOrigin, EventType, LearningEvent } from './types.ts';

export const EVENT_CONTRACT = 'noema.events.v1#event';

/** An event from outside the app's own code → the event, or events.invalid with the contract's first problems. */
export function parseEvent(x: unknown): Result<LearningEvent> {
  const r = check(EVENT_CONTRACT, x);
  if (r.ok) return ok(x as LearningEvent);
  const id = x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' ? (x as { id: string }).id : '?';
  return err(
    new NoemaError(
      'events.invalid',
      `not a learning event (${id}): ${r.issues
        .slice(0, 3)
        .map(i => i.text)
        .join('; ')}`,
      {
        params: { id },
      },
    ),
  );
}

/** What the app says happened; the application stamps it. */
export interface EventDraft<T extends EventType = EventType> {
  readonly type: T;
  readonly subject?: string;
  readonly item?: string;
  readonly data: EventDataMap[T];
  readonly origin?: EventOrigin;
  /** A given id (an import's content hash); otherwise the application's new id. */
  readonly id?: string;
  /** The learner's day it belongs to when it is not today (an inbox row of an earlier day). */
  readonly day?: string;
}

/** What the application adds to a draft. */
export interface Stamp {
  readonly id: string;
  readonly at: string;
  readonly day: string;
  readonly device: string;
  readonly account: string;
}

/** A draft and its stamp → a checked event. */
export function makeEvent<T extends EventType>(draft: EventDraft<T>, stamp: Stamp): Result<LearningEvent<T>> {
  const e: Record<string, unknown> = {
    v: 1,
    id: draft.id ?? stamp.id,
    type: draft.type,
    at: stamp.at,
    day: draft.day ?? stamp.day,
    device: stamp.device,
    account: stamp.account,
  };
  if (draft.subject !== undefined) e['subject'] = draft.subject;
  if (draft.item !== undefined) e['item'] = draft.item;
  if (draft.origin !== undefined && draft.origin !== 'app') e['origin'] = draft.origin;
  e['data'] = draft.data;
  const r = parseEvent(e);
  return r.ok ? ok(r.value as LearningEvent<T>) : r;
}

/* ---------- content ids: FNV-1a over the UTF-16 code units, two 64-bit lanes (128 bits: collisions are not a concern) ---------- */
const MASK = (1n << 64n) - 1n;
const PRIME = 0x100000001b3n;
function fnv64(text: string, basis: bigint): bigint {
  let h = basis;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * PRIME) & MASK;
  }
  return h;
}

/** A stable event id of content: `<prefix>.<32 hex digits>`; the same parts always give the same id. */
export function contentId(prefix: string, parts: readonly unknown[]): string {
  const text = JSON.stringify(parts);
  const a = fnv64(text, 0xcbf29ce484222325n),
    b = fnv64(text, 0x84222325cbf29ce4n);
  return `${prefix}.${a.toString(16).padStart(16, '0')}${b.toString(16).padStart(16, '0')}`;
}
