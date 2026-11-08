/**
 * This device: its id (kept in the device preferences, `noema-device:id`) and its hybrid logical clock, whose last stamp is
 * kept too (`noema-device:hlc`), so every stamp this device makes is later than every one it made or received before, also
 * across reloads (src/kernel/hlc.ts). The settings' registers and the learning events are stamped with it.
 */
import { NoemaError } from '../../../kernel/errors.ts';
import { decodeHlc, encodeHlc, HybridClock } from '../../../kernel/hlc.ts';
import { deviceId, trustedId, type DeviceId } from '../../../kernel/ids.ts';
import { err, ok, OK_VOID, type Result } from '../../../kernel/result.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';

export const DEVICE_KEY = 'noema-device:id';
export const HLC_KEY = 'noema-device:hlc';

export interface DeviceClock {
  readonly id: DeviceId;
  /** A stamp for something that happens here now (text form). */
  now(): Result<string>;
  /** Takes in a stamp from another device (one too far ahead is refused: hlc.drift; the clock stays as it was). */
  receive(stamp: string): Result<void>;
}

/** The device's id: the one kept, else a new one (kept from now on). */
export function deviceIdOf(kv: KeyValueStore, random: () => string): DeviceId {
  const kept = kv.get(DEVICE_KEY);
  const id = kept.ok && kept.value ? deviceId(kept.value) : null;
  if (id?.ok) return id.value;
  const made = deviceId(
    random()
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 64),
  );
  const fresh = made.ok ? made.value : trustedId<DeviceId>('device');
  // a full storage: this page still uses the id; the next page makes another (nothing depends on it lasting)
  kv.set(DEVICE_KEY, fresh);
  return fresh;
}

export function deviceClock(kv: KeyValueStore, physical: () => number, random: () => string): DeviceClock {
  const id = deviceIdOf(kv, random);
  const kept = kv.get(HLC_KEY);
  const last = kept.ok && kept.value ? decodeHlc(kept.value) : null;
  const hlc = new HybridClock(id, physical, last?.ok ? { last: last.value } : {});
  const keep = (): void => {
    kv.set(HLC_KEY, encodeHlc(hlc.last)); // a full storage: the clock goes on in memory (stamps stay later than the kept one)
  };
  return {
    id,
    now() {
      const s = hlc.now();
      if (!s.ok) return s;
      keep();
      return ok(encodeHlc(s.value));
    },
    receive(stamp) {
      const d = decodeHlc(stamp);
      if (!d.ok) return d;
      const r = hlc.receive(d.value);
      if (!r.ok) return r;
      keep();
      return OK_VOID;
    },
  };
}

/** A stamp at a given time: the baseline of data written before the clock (its last-change time, or the cloud row's). */
export function stampAt(wall: number, node: string): Result<string> {
  const n = deviceId(node);
  if (!n.ok) return n;
  if (!Number.isFinite(wall) || wall < 0) return err(new NoemaError('hlc.invalid', 'not a time: ' + String(wall)));
  return ok(encodeHlc({ wall: Math.floor(wall), count: 0, node: n.value }));
}
