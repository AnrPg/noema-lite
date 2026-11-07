/**
 * Hybrid logical clock (Kulkarni et al. 2014) for phase 2's sync and event log (docs/adr/005).
 *
 * A time stamp is (wall, count, node): `wall` follows the physical clock in milliseconds but never goes back, `count` orders
 * events within one millisecond (or while the physical clock lags), `node` (a DeviceId) breaks the last tie. So:
 *  • every stamp a device makes is strictly later than every stamp it made or received before (causality);
 *  • stamps stay close to real time, so they mean something to a person;
 *  • a device with a wrong clock cannot push everyone's time far into the future: a remote stamp more than `maxDriftMs`
 *    ahead of this device's physical clock is refused (hlc.drift), not merged.
 * The encoded form sorts as text in time order: "<wall: 15 digits>-<count: 5 digits>-<node>".
 */
import { NoemaError } from './errors.ts';
import { deviceId, type DeviceId } from './ids.ts';
import { err, ok, type Result } from './result.ts';

export interface HlcTimestamp {
  readonly wall: number;
  readonly count: number;
  readonly node: DeviceId;
}

export const HLC_MAX_COUNT = 99_999;
/** Default: a remote stamp may be at most 5 minutes ahead of this device's clock. */
export const HLC_MAX_DRIFT_MS = 5 * 60_000;
const WALL_DIGITS = 15; // enough for the year 33658
const ENCODED = /^(\d{15})-(\d{5})-([A-Za-z0-9_-]{1,64})$/;

const stamp = (wall: number, count: number, node: DeviceId): HlcTimestamp => Object.freeze({ wall, count, node });

/** The zero stamp of a device (earlier than any real stamp). */
export const hlcZero = (node: DeviceId): HlcTimestamp => stamp(0, 0, node);

/** Order of two stamps: wall, then count, then node. */
export function compareHlc(a: HlcTimestamp, b: HlcTimestamp): -1 | 0 | 1 {
  if (a.wall !== b.wall) return a.wall < b.wall ? -1 : 1;
  if (a.count !== b.count) return a.count < b.count ? -1 : 1;
  return a.node === b.node ? 0 : a.node < b.node ? -1 : 1;
}

function overflow(): NoemaError {
  return new NoemaError('hlc.overflow', 'hybrid clock counter overflow: the physical clock has not moved for too many events');
}

/** A local event (or a send): the next stamp after `last` at physical time `physical`. */
export function hlcTick(last: HlcTimestamp, physical: number): Result<HlcTimestamp> {
  const wall = Math.max(last.wall, Math.floor(physical));
  const count = wall === last.wall ? last.count + 1 : 0;
  return count > HLC_MAX_COUNT ? err(overflow()) : ok(stamp(wall, count, last.node));
}

/** A received stamp: the next local stamp, later than both `last` and `remote`. */
export function hlcReceive(last: HlcTimestamp, remote: HlcTimestamp, physical: number, maxDriftMs = HLC_MAX_DRIFT_MS): Result<HlcTimestamp> {
  const now = Math.floor(physical);
  if (remote.wall - now > maxDriftMs)
    return err(new NoemaError('hlc.drift', `a remote clock is ${remote.wall - now} ms ahead of this device`, { params: { aheadMs: remote.wall - now, node: remote.node } }));
  const wall = Math.max(last.wall, remote.wall, now);
  let count: number;
  if (wall === last.wall && wall === remote.wall) count = Math.max(last.count, remote.count) + 1;
  else if (wall === last.wall) count = last.count + 1;
  else if (wall === remote.wall) count = remote.count + 1;
  else count = 0;
  return count > HLC_MAX_COUNT ? err(overflow()) : ok(stamp(wall, count, last.node));
}

/** The text form, which sorts in time order. */
export function encodeHlc(t: HlcTimestamp): string {
  return `${String(t.wall).padStart(WALL_DIGITS, '0')}-${String(t.count).padStart(5, '0')}-${t.node}`;
}

export function decodeHlc(text: unknown): Result<HlcTimestamp> {
  const m = typeof text === 'string' ? ENCODED.exec(text) : null;
  if (!m) return err(new NoemaError('hlc.invalid', 'not a hybrid clock time stamp: ' + JSON.stringify(String(text).slice(0, 100))));
  const node = deviceId(m[3] ?? '');
  return node.ok ? ok(stamp(Number(m[1]), Number(m[2]), node.value)) : node;
}

/** A device's clock: keeps the last stamp, so every call is later than the one before. */
export class HybridClock {
  #last: HlcTimestamp;
  readonly #physical: () => number;
  readonly #maxDriftMs: number;

  constructor(node: DeviceId, physical: () => number, options: { maxDriftMs?: number; last?: HlcTimestamp } = {}) {
    this.#physical = physical;
    this.#maxDriftMs = options.maxDriftMs ?? HLC_MAX_DRIFT_MS;
    this.#last = options.last && options.last.node === node ? options.last : hlcZero(node);
  }

  get last(): HlcTimestamp {
    return this.#last;
  }

  /** A stamp for a local event. */
  now(): Result<HlcTimestamp> {
    const r = hlcTick(this.#last, this.#physical());
    if (r.ok) this.#last = r.value;
    return r;
  }

  /** Take in a stamp from another device; returns the local stamp of receiving it. */
  receive(remote: HlcTimestamp): Result<HlcTimestamp> {
    const r = hlcReceive(this.#last, remote, this.#physical(), this.#maxDriftMs);
    if (r.ok) this.#last = r.value;
    return r;
  }
}
