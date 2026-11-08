/**
 * The one-time migration of the old progress into the log: a subject's state blob (KV s:<subject>:state), the XP and
 * streak across subjects (a:stats) and the account's settings (a:settings) become events. Pure: the application reads the
 * old values and appends what this returns.
 *
 * Idempotent by construction: every event's id is a hash of what it says (account, subject, type, item, data), so a second
 * run — or the same blob arriving again from another device — adds nothing; a blob that differs adds only what differs,
 * and the fold merges imports the way the old sync merged two copies (the most tries, the later review, the larger counts).
 * Nothing is dropped: every field the log has an event for is converted; anything else is listed in `unknown` (the
 * application keeps the whole old value in its archive either way).
 */
import { contentId, makeEvent, type EventDraft } from './event.ts';
import type { Attempt, EventType, LearningEvent } from './types.ts';

export interface LegacyStamp {
  /** The HLC stamp of the migration (every event of one run has it; ids keep them apart). */
  readonly at: string;
  /** The learner's day of the migration. */
  readonly day: string;
  readonly device: string;
  readonly account: string;
}

export interface LegacyResult {
  readonly events: LearningEvent[];
  /** Fields of the old value that have no event (kept only in the archive). */
  readonly unknown: string[];
  /** Entries that could not be read (their text in the archive). */
  readonly skipped: string[];
}

/** The fields of the old subject blob that are not progress: kept in no event on purpose. */
const NOT_PROGRESS = new Set(['inboxDone', 'xpDay', 'streak', 'lastDay', 'resetAt', 'settings', 'apiKey']);
/** The account settings that never enter the log (a key of this device only). */
export const DEVICE_ONLY_SETTINGS: ReadonlySet<string> = new Set(['apiKey']);

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const nat = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null);
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// eslint-disable-next-line no-control-regex -- an item id is any text of 1–300 characters without control characters
const ITEM = /^[^\u0000-\u001f]{1,300}$/;
const SETTING_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,60}$/;
const CONF = new Set(['sure', 'think', 'guess']);

class Builder {
  readonly events: LearningEvent[] = [];
  readonly unknown: string[] = [];
  readonly skipped: string[] = [];
  readonly stamp: LegacyStamp;
  constructor(stamp: LegacyStamp) {
    this.stamp = stamp;
  }
  add<T extends EventType>(d: Omit<EventDraft<T>, 'id' | 'origin'>, where: string, extra: readonly unknown[] = []): void {
    const id = contentId('mig', [this.stamp.account, d.subject ?? '', d.type, d.item ?? '', d.data, ...extra]);
    const draft: EventDraft = { ...(d as Omit<EventDraft, 'id' | 'origin'>), id, origin: 'migration' };
    const r = makeEvent(draft, { ...this.stamp, id });
    if (r.ok) this.events.push(r.value);
    else this.skipped.push(where);
  }
}

/** A subject's old state blob → its events. */
export function subjectEvents(subject: string, blob: unknown, stamp: LegacyStamp): LegacyResult {
  const b = new Builder(stamp);
  if (!isObj(blob)) {
    b.skipped.push(`s:${subject}:state`);
    return b;
  }
  const each = (field: string, f: (id: string, v: unknown) => void): void => {
    const m = blob[field];
    if (m === undefined || m === null) return;
    if (!isObj(m)) {
      b.skipped.push(field);
      return;
    }
    for (const [id, v] of Object.entries(m)) {
      if (!ITEM.test(id)) b.skipped.push(`${field}.${id}`);
      else f(id, v);
    }
  };
  for (const k of Object.keys(blob)) if (!NOT_PROGRESS.has(k) && !KNOWN.has(k)) b.unknown.push(k);

  const xp = nat(blob['xp']);
  if (xp) b.add({ type: 'xp.earned', subject, data: { amount: Math.min(xp, 100000), reason: 'import' } }, 'xp');
  each('res', (item, v) => {
    if (!isObj(v)) return void b.skipped.push('res.' + item);
    const okN = nat(v['ok']) ?? (v['last'] === true ? 1 : 0);
    const n = Math.max(nat(v['n']) ?? 0, okN, 1);
    const data: { n: number; ok: number; last: boolean; t?: number; conf?: 'sure' | 'think' | 'guess' } = {
      n,
      ok: Math.min(okN, n),
      last: typeof v['last'] === 'boolean' ? v['last'] : okN > 0,
    };
    const t = nat(v['t']);
    if (t !== null) data.t = t;
    if (typeof v['conf'] === 'string' && CONF.has(v['conf'])) data.conf = v['conf'] as 'sure' | 'think' | 'guess';
    b.add({ type: 'answers.imported', subject, item, data }, 'res.' + item);
  });
  each('read', (item, v) => {
    if (v) b.add({ type: 'section.read', subject, item, data: {} }, 'read.' + item);
  });
  for (const [field, type] of [
    ['fc', 'card.imported'],
    ['pb', 'playbook.imported'],
  ] as const)
    each(field, (item, v) => {
      if (!isObj(v)) return void b.skipped.push(`${field}.${item}`);
      const data: { box: number; due?: string } = { box: Math.min(5, nat(v['box']) ?? 0) };
      if (typeof v['due'] === 'string' && DAY.test(v['due'])) data.due = v['due'];
      b.add({ type, subject, item, data }, `${field}.${item}`);
    });
  each('boss', (item, v) => {
    if (v) b.add({ type: 'boss.won', subject, item, data: {} }, 'boss.' + item);
  });
  if (typeof blob['last'] === 'string' && ITEM.test(blob['last']))
    b.add({ type: 'section.opened', subject, item: blob['last'], data: {} }, 'last');
  each('att', (item, v) => {
    const a = attemptOf(v);
    if (a) b.add({ type: 'activity.attempted', subject, item, data: { attempt: a } }, 'att.' + item);
    else b.skipped.push('att.' + item);
  });
  each('act', (item, v) => {
    if (!isObj(v)) return void b.skipped.push('act.' + item);
    b.add({ type: 'activity.saved', subject, item, data: { v: Math.max(1, nat(v['v']) ?? 1), state: v['data'] ?? null } }, 'act.' + item);
  });
  each('flags', (item, v) => {
    if (!isObj(v) || typeof v['why'] !== 'string') return void b.skipped.push('flags.' + item);
    const data: { why: string; note?: string } = { why: v['why'] };
    if (typeof v['note'] === 'string' && v['note']) data.note = v['note'].slice(0, 2000);
    b.add({ type: 'exercise.flagged', subject, item, data }, 'flags.' + item);
  });
  const best = nat(blob['bestLightning']);
  if (best) b.add({ type: 'drill.scored', subject, data: { kind: 'lightning', score: best } }, 'bestLightning');
  if (blob['nodeDone']) b.add({ type: 'subject.finished', subject, data: {} }, 'nodeDone');
  each('seenSrc', (item, v) => {
    if (v) b.add({ type: 'source.seen', subject, item, data: { seen: true } }, 'seenSrc.' + item);
  });
  const ext = blob['ext'];
  if (isObj(ext))
    for (const [app, log] of Object.entries(ext)) {
      if (!Array.isArray(log)) continue;
      log.forEach((x: unknown, i) => {
        if (!isObj(x) || typeof x['id'] !== 'string' || !ITEM.test(x['id'])) return void b.skipped.push(`ext.${app}.${i}`);
        const kind = x['kind'] === 'chapter' ? 'chapter' : 'section',
          event = x['event'] === 'review' ? 'review' : 'studied';
        const data: { app: string; kind: 'section' | 'chapter'; event: 'review' | 'studied'; rating?: string; date?: string } = {
          app,
          kind,
          event,
        };
        if (typeof x['rating'] === 'string') data.rating = x['rating'].slice(0, 20);
        if (typeof x['date'] === 'string') data.date = x['date'].slice(0, 10);
        // the entry's own time and place are part of its id: two entries alike on different days are two events
        b.add({ type: 'external.studied', subject, item: x['id'], data }, `ext.${app}.${i}`, [x['at'], i]);
      });
    }
  if (blob['srcOn'] !== undefined && blob['srcOn'] !== null)
    b.add({ type: 'setting.changed', subject, data: { key: 'srcOn', value: blob['srcOn'] } }, 'srcOn');
  return b;
}
const KNOWN = new Set([
  'xp',
  'res',
  'read',
  'fc',
  'pb',
  'boss',
  'last',
  'att',
  'act',
  'flags',
  'bestLightning',
  'nodeDone',
  'seenSrc',
  'ext',
  'srcOn',
]);

function attemptOf(v: unknown): Attempt | null {
  if (!isObj(v)) return null;
  const t = nat(v['t']) ?? nat(v['t0']) ?? (isObj(v['result']) ? nat(v['result']['t']) : null);
  if (t === null) return null;
  const a: Attempt = { t };
  if (typeof v['id'] === 'string') a.id = v['id'].slice(0, 100);
  if (v['seed'] !== undefined) a.seed = v['seed'];
  const t0 = nat(v['t0']);
  if (t0 !== null) a.t0 = t0;
  const hints = nat(v['hints']);
  if (hints !== null) a.hints = hints;
  const res = v['result'];
  if (isObj(res)) a.result = res;
  else if (res === null) a.result = null;
  if (Array.isArray(v['events'])) a.events = v['events'].filter(isObj).slice(-500);
  return a;
}

/** The old a:stats → one stats.imported (or, without it, the subjects' XP added up), or nothing when there is none. */
export function statsEvents(stats: unknown, subjectXp: Readonly<Record<string, number>>, stamp: LegacyStamp): LegacyResult {
  const b = new Builder(stamp);
  let data: { xp: number; xpDay: Record<string, number>; streak: number; lastDay?: string; bySubject: Record<string, number> };
  if (isObj(stats)) {
    const xpDay: Record<string, number> = {},
      bySubject: Record<string, number> = {};
    if (isObj(stats['xpDay']))
      for (const [d, v] of Object.entries(stats['xpDay'])) if (DAY.test(d) && nat(v) !== null) xpDay[d] = nat(v) ?? 0;
    if (isObj(stats['bySubject'])) for (const [s, v] of Object.entries(stats['bySubject'])) if (nat(v) !== null) bySubject[s] = nat(v) ?? 0;
    data = { xp: nat(stats['xp']) ?? 0, xpDay, streak: nat(stats['streak']) ?? 0, bySubject };
    if (typeof stats['lastDay'] === 'string' && DAY.test(stats['lastDay'])) data.lastDay = stats['lastDay'];
    for (const k of Object.keys(stats)) if (!['xp', 'xpDay', 'streak', 'lastDay', 'bySubject'].includes(k)) b.unknown.push(k);
  } else {
    const total = Object.values(subjectXp).reduce((a, x) => a + x, 0);
    if (!total) return b;
    data = { xp: total, xpDay: {}, streak: 0, bySubject: { ...subjectXp } };
  }
  if (!data.xp && !data.streak && !Object.keys(data.xpDay).length) return b;
  b.add({ type: 'stats.imported', data }, 'a:stats');
  return b;
}

/**
 * The account's settings (a:settings, still the old screens' copy) → a setting.changed for every key whose value is not the
 * log's, and a removal for every key of the log it no longer has. `current` is the log's settings, `stampOf(key)` the stamp of the log's last change of it: it is part of the id, so
 * the same difference seen twice is one event, and a later change back to an earlier value is a new one.
 */
export function settingsEvents(
  settings: unknown,
  current: Readonly<Record<string, unknown>>,
  stampOf: (key: string) => string,
  stamp: LegacyStamp,
  origin: 'migration' | 'app',
): LegacyResult {
  const b = new Builder(stamp);
  if (!isObj(settings)) return b;
  for (const [key, value] of Object.entries(settings)) {
    if (DEVICE_ONLY_SETTINGS.has(key) || value === undefined) continue;
    if (!SETTING_KEY.test(key)) {
      b.skipped.push('a:settings.' + key);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(current, key) && same(current[key], value)) continue;
    const data = { key, value };
    const id = contentId('set', [stamp.account, key, value, stampOf(key)]);
    const r = makeEvent({ type: 'setting.changed', data, id, origin }, { ...stamp, id });
    if (r.ok) b.events.push(r.value);
    else b.skipped.push('a:settings.' + key);
  }
  for (const key of Object.keys(current)) {
    if (Object.prototype.hasOwnProperty.call(settings, key) && settings[key] !== undefined) continue;
    const data = { key, removed: true as const };
    const id = contentId('set', [stamp.account, key, null, stampOf(key)]);
    const r = makeEvent({ type: 'setting.changed', data, id, origin }, { ...stamp, id });
    if (r.ok) b.events.push(r.value);
  }
  return b;
}

/** Two JSON values alike (key order aside). */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const y = b as unknown[];
    return a.length === y.length && a.every((v, i) => same(v, y[i]));
  }
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  const kx = Object.keys(x).filter(k => x[k] !== undefined),
    ky = Object.keys(y).filter(k => y[k] !== undefined);
  return kx.length === ky.length && kx.every(k => same(x[k], y[k]));
}
