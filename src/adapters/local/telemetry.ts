/**
 * Local Telemetry: counters and the last events, in memory and (optionally) in the device's key-value store.
 * Nothing is ever sent anywhere (docs/ARCHITECTURE.md §4, Telemetry).
 */
import type { KeyValueStore } from '../../ports/storage.ts';
import type { Telemetry, TelemetryData, TelemetryEvent, TelemetrySnapshot } from '../../ports/telemetry.ts';

export const TELEMETRY_KEY = 'noema-device:telemetry';

export interface LocalTelemetryOptions {
  readonly now?: () => number;
  readonly store?: KeyValueStore;
  readonly key?: string;
  readonly maxEvents?: number;
  /** Writes to the store at most this often (ms); the default 2 s keeps a burst of counts to one write. */
  readonly saveEveryMs?: number;
  readonly setTimeout?: (f: () => void, ms: number) => unknown;
}

export function localTelemetry(o: LocalTelemetryOptions = {}): Telemetry {
  const now = o.now ?? Date.now, max = o.maxEvents ?? 100, key = o.key ?? TELEMETRY_KEY;
  // no timers (a bare vm): the write happens at once instead of being gathered
  const st = o.setTimeout ?? ((f: () => void, ms: number): unknown => (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout(f, ms) : f()));
  let counters: Record<string, number> = {};
  let events: TelemetryEvent[] = [];
  let pending = false;
  if (o.store) {
    const raw = o.store.get(key);
    if (raw.ok && raw.value) {
      try {
        const p = JSON.parse(raw.value) as Partial<TelemetrySnapshot>;
        counters = { ...(p.counters ?? {}) };
        events = Array.isArray(p.events) ? p.events.slice(-max) : [];
      } catch {
        // counters that cannot be read start again from zero: they are statistics about this device, nothing a learner made
        counters = {};
      }
    }
  }
  const save = (): void => {
    if (!o.store || pending) return;
    pending = true;
    st(() => {
      pending = false;
      // Best effort: a full storage raises its own signal (reported once); losing a counter is acceptable
      o.store?.set(key, JSON.stringify({ counters, events }));
    }, o.saveEveryMs ?? 2000);
  };
  return {
    count(name, by = 1) { counters[name] = (counters[name] ?? 0) + by; save(); },
    event(name, data: TelemetryData = {}) {
      events.push(Object.freeze({ at: now(), name, data: { ...data } }));
      if (events.length > max) events = events.slice(-max);
      save();
    },
    snapshot: () => ({ counters: { ...counters }, events: [...events] }),
    reset() { counters = {}; events = []; save(); },
  };
}
