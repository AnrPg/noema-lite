/**
 * "One device at a time" as a statechart (docs/SYNC.md §One device at a time). The account's lease is one cloud row
 * (kv `a:inuse`, written by compare-and-swap) naming the tab that is being used: visible and touched in the last two
 * minutes. That tab renews it every 30 s and lets it go when it is hidden or closed. Another tab or device:
 *   • takes it silently when it is free, released or stale (and then brings in what the other one did);
 *   • while it is fresh, waits in `other` ("Noema is open on iPhone · Safari", nothing is saved here) and looks again every
 *     10 s while it is shown; CHECK with take ("Use here") takes it anyway, which pauses the other one.
 *
 *   off ──START──▶ checking ──READ──▶ other   (held elsewhere, fresh, not taking)
 *                     │         └───▶ idle | mine (nobody is using this tab: nothing taken)
 *                     └──READ──▶ claiming ──WRITTEN──▶ mine        ──RACE──▶ checking (twice) ▶ idle
 *   mine ──30 s while used──▶ checking (renew) · ──RELEASE──▶ idle (the row says released)
 *   Every failure (offline) goes back to the last settled state: a device without a network keeps working.
 */
import type { NoemaError } from '../../../kernel/errors.ts';
import type { MachineDef } from '../../../kernel/statechart.ts';
import type { DeviceKind } from '../../../ports/lifecycle.ts';

/** The lease row's value (kv a:inuse, JSON). */
export interface LeaseValue {
  /** The tab holding it. */
  readonly sid: string;
  /** Its device. */
  readonly dev: string;
  readonly os: DeviceKind;
  /** The browser's own name, or ''. */
  readonly br: string;
  /** When it was written (epoch ms, the holder's clock). */
  readonly at: number;
  readonly released?: true;
}

export const LEASE_KEY = 'a:inuse';
/** A lease not renewed for this long is stale (free to take). */
export const LEASE_FRESH_MS = 2 * 60_000;
/** The holder renews it this often while it is being used; a touch renews it at most this often. */
export const LEASE_BEAT_MS = 30_000;
/** A waiting (or idle) tab looks again this often while it is shown. */
export const LEASE_POLL_MS = 10_000;
const MAX_RACES = 2;

const KINDS: ReadonlySet<string> = new Set([
  'iphone',
  'ipad',
  'android_phone',
  'android_tablet',
  'chromebook',
  'mac',
  'windows',
  'linux',
  'other',
]);

/** The row's text → its value, or null for anything else (no row, not JSON, another shape). */
export function parseLease(text: string | null): LeaseValue | null {
  if (!text) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    // a row that is not JSON holds no lease: it is free to take
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o['sid'] !== 'string' || typeof o['at'] !== 'number') return null;
  return {
    sid: o['sid'],
    dev: typeof o['dev'] === 'string' ? o['dev'] : '',
    os: typeof o['os'] === 'string' && KINDS.has(o['os']) ? (o['os'] as DeviceKind) : 'other',
    br: typeof o['br'] === 'string' ? o['br'] : '',
    at: o['at'],
    ...(o['released'] === true ? { released: true as const } : {}),
  };
}

/** Is someone using it right now (not released, renewed within LEASE_FRESH_MS)? */
export const isLive = (v: LeaseValue | null, now: number): boolean => !!v && !v.released && now - v.at < LEASE_FRESH_MS;

/** Who holds it, as the waiting screen shows it. */
export interface LeaseHolder {
  readonly os: DeviceKind;
  readonly br: string;
  /** Another tab of this same device (browser profile). */
  readonly sameDevice: boolean;
  readonly at: number;
}

/** What the rest of the app sees: this tab has it, another one has it, or nobody is known to (offline, not checked yet). */
export type LeaseStatus = 'mine' | 'other' | 'unknown';

export type LeaseState = 'off' | 'idle' | 'checking' | 'claiming' | 'mine' | 'other';

export type LeaseEvent =
  | { readonly type: 'START'; readonly visible: boolean }
  | { readonly type: 'STOP' }
  | { readonly type: 'CHECK'; readonly take: boolean }
  /** The row as read: its value (parsed), its version, and whether it names this tab. */
  | {
      readonly type: 'READ';
      readonly value: LeaseValue | null;
      readonly version: string | null;
      readonly mine: boolean;
      readonly holder: LeaseHolder | null;
    }
  | { readonly type: 'WRITTEN'; readonly version: string }
  /** Someone wrote the row between the read and the write. */
  | { readonly type: 'RACE' }
  | { readonly type: 'FAILED'; readonly error: NoemaError }
  | { readonly type: 'TOUCH' }
  | { readonly type: 'VISIBLE'; readonly visible: boolean }
  | { readonly type: 'RELEASE' };

export type LeaseEffect =
  | { readonly type: 'read' }
  /** Write this tab's lease over the version read (null: there was no row). */
  | { readonly type: 'write'; readonly expected: string | null }
  /** Mark the row released (only over the version this tab wrote). */
  | { readonly type: 'release'; readonly expected: string }
  /** A settled answer: for whoever waits on a check, and the screens. */
  | { readonly type: 'settled'; readonly status: LeaseStatus; readonly holder: LeaseHolder | null }
  /** This tab took the account from another tab or device: bring in what it did. */
  | { readonly type: 'broughtIn' };

export interface LeaseContext {
  readonly take: boolean;
  readonly races: number;
  readonly visible: boolean;
  readonly lastInput: number;
  /** When the row was last read or written (renewals and touches are counted from it). */
  readonly lastBeat: number;
  /** The last settled answer, kept while a check runs (a failed check goes back to it). */
  readonly settled: LeaseStatus;
  readonly holder: LeaseHolder | null;
  /** The version of the row this tab read, or wrote last. */
  readonly version: string | null;
  /** The row this tab is taking was another tab's or device's. */
  readonly took: boolean;
}

/** The learner is using this tab: it is shown and was touched within LEASE_FRESH_MS. */
export const isActive = (c: LeaseContext, now: number): boolean => c.visible && now - c.lastInput < LEASE_FRESH_MS;
const due = (c: LeaseContext, now: number): boolean => now - c.lastBeat > LEASE_BEAT_MS;

const settle = (status: LeaseStatus) => (c: LeaseContext) => [
  { type: 'settled' as const, status, holder: status === 'other' ? c.holder : null },
];
const toChecking = {
  target: 'checking',
  assign: (c: LeaseContext, e: { readonly take: boolean }) => ({ ...c, take: e.take, races: 0 }),
} as const;
const touched = (c: LeaseContext, _e: unknown, m: { readonly now: number }): LeaseContext => ({ ...c, lastInput: m.now });
const seen = (c: LeaseContext, e: { readonly visible: boolean }, m: { readonly now: number }): LeaseContext => ({
  ...c,
  visible: e.visible,
  ...(e.visible ? { lastInput: m.now } : {}),
});
/** A check that failed (no network): back to what was settled before it. */
const backToSettled = [
  {
    guard: (c: LeaseContext) => c.settled === 'other',
    target: 'other',
    assign: (c: LeaseContext) => ({ ...c, take: false }),
    effects: settle('other'),
  },
  {
    guard: (c: LeaseContext) => c.settled === 'mine',
    target: 'mine',
    assign: (c: LeaseContext) => ({ ...c, take: false }),
    effects: settle('mine'),
  },
  { target: 'idle', assign: (c: LeaseContext) => ({ ...c, take: false }), effects: settle('unknown') },
] as const;
/** The page is hidden or closed while a check runs: let go of what this tab holds. */
const releaseNow = {
  target: 'idle',
  assign: (c: LeaseContext) => ({ ...c, visible: false, take: false, settled: 'unknown' as const, version: null }),
  effects: (c: LeaseContext) => [
    ...(c.settled === 'mine' && c.version ? [{ type: 'release' as const, expected: c.version }] : []),
    { type: 'settled' as const, status: 'unknown' as const, holder: null },
  ],
} as const;

export const leaseMachine: MachineDef<LeaseState, LeaseContext, LeaseEvent, LeaseEffect> = {
  id: 'lease',
  initial: 'off',
  context: {
    take: false,
    races: 0,
    visible: true,
    lastInput: 0,
    lastBeat: 0,
    settled: 'unknown',
    holder: null,
    version: null,
    took: false,
  },
  states: {
    off: {
      on: {
        START: { target: 'checking', assign: (c, e, m) => ({ ...c, visible: e.visible, lastInput: m.now, take: false, races: 0 }) },
        CHECK: { effects: settle('unknown') }, // not signed in: nobody to ask
        STOP: {},
      },
    },
    idle: {
      after: [
        {
          delay: LEASE_POLL_MS,
          then: [
            {
              guard: (c, _e, m) => isActive(c, m.now) && due(c, m.now),
              target: 'checking',
              assign: c => ({ ...c, take: false, races: 0 }),
            },
            { target: 'idle' },
          ],
        },
      ],
      on: {
        CHECK: toChecking,
        TOUCH: [
          {
            guard: (c, _e, m) => due(c, m.now),
            target: 'checking',
            assign: (c, _e, m) => ({ ...c, lastInput: m.now, take: false, races: 0 }),
          },
          { assign: touched },
        ],
        VISIBLE: [
          { guard: (_, e) => e.visible, target: 'checking', assign: (c, e, m) => ({ ...seen(c, e, m), take: false, races: 0 }) },
          { assign: seen },
        ],
        // the answer of a write that was still under way when the page was hidden: let it go again
        WRITTEN: { effects: (_, e) => [{ type: 'release', expected: e.version }] },
        READ: {},
        RACE: {},
        FAILED: {},
        RELEASE: {},
      },
    },
    checking: {
      entry: [{ type: 'read' }],
      on: {
        READ: [
          {
            guard: (c, e, m) => !e.mine && !c.take && isLive(e.value, m.now),
            target: 'other',
            assign: (c, e, m) => ({ ...c, holder: e.holder, settled: 'other', lastBeat: m.now, version: e.version, take: false }),
            effects: (_, e) => [{ type: 'settled', status: 'other', holder: e.holder }],
          },
          {
            guard: (c, e, m) => !c.take && !isActive(c, m.now) && e.mine,
            target: 'mine',
            assign: (c, e, m) => ({ ...c, settled: 'mine', holder: null, lastBeat: m.now, version: e.version }),
            effects: settle('mine'),
          },
          {
            guard: (c, _e, m) => !c.take && !isActive(c, m.now),
            target: 'idle',
            assign: (c, e, m) => ({ ...c, settled: 'unknown', holder: null, lastBeat: m.now, version: e.version }),
            effects: settle('unknown'),
          },
          { target: 'claiming', assign: (c, e, m) => ({ ...c, version: e.version, took: !!e.value && !e.mine, lastBeat: m.now }) },
        ],
        FAILED: backToSettled,
        CHECK: { assign: (c, e) => ({ ...c, take: c.take || e.take }) },
        TOUCH: { assign: touched },
        VISIBLE: { assign: seen },
        RELEASE: releaseNow,
      },
    },
    claiming: {
      entry: c => [{ type: 'write', expected: c.version }],
      on: {
        WRITTEN: {
          target: 'mine',
          assign: (c, e, m) => ({
            ...c,
            version: e.version,
            settled: 'mine',
            holder: null,
            take: false,
            races: 0,
            took: false,
            lastBeat: m.now,
          }),
          effects: c => [
            { type: 'settled', status: 'mine', holder: null },
            ...(c.took || c.settled === 'other' ? [{ type: 'broughtIn' as const }] : []),
          ],
        },
        RACE: [
          { guard: c => c.races < MAX_RACES, target: 'checking', assign: c => ({ ...c, races: c.races + 1 }) },
          { target: 'idle', assign: c => ({ ...c, take: false, races: 0, settled: 'unknown' }), effects: settle('unknown') },
        ],
        FAILED: backToSettled,
        CHECK: { assign: (c, e) => ({ ...c, take: c.take || e.take }) },
        TOUCH: { assign: touched },
        VISIBLE: { assign: seen },
        RELEASE: releaseNow,
      },
    },
    mine: {
      after: [
        {
          delay: LEASE_BEAT_MS,
          then: [
            { guard: (c, _e, m) => isActive(c, m.now), target: 'checking', assign: c => ({ ...c, take: false, races: 0 }) },
            { target: 'mine' },
          ],
        },
      ],
      on: {
        CHECK: toChecking,
        TOUCH: [
          {
            guard: (c, _e, m) => due(c, m.now),
            target: 'checking',
            assign: (c, _e, m) => ({ ...c, lastInput: m.now, take: false, races: 0 }),
          },
          { assign: touched },
        ],
        VISIBLE: [
          { guard: (_, e) => e.visible, target: 'checking', assign: (c, e, m) => ({ ...seen(c, e, m), take: false, races: 0 }) },
          { assign: seen },
        ],
        RELEASE: {
          target: 'idle',
          assign: c => ({ ...c, visible: false, settled: 'unknown', version: null }),
          effects: c => [
            ...(c.version ? [{ type: 'release' as const, expected: c.version }] : []),
            { type: 'settled' as const, status: 'unknown' as const, holder: null },
          ],
        },
      },
    },
    other: {
      after: [
        {
          delay: LEASE_POLL_MS,
          then: [{ guard: c => c.visible, target: 'checking', assign: c => ({ ...c, take: false, races: 0 }) }, { target: 'other' }],
        },
      ],
      on: {
        CHECK: toChecking,
        TOUCH: { assign: touched },
        VISIBLE: [
          { guard: (_, e) => e.visible, target: 'checking', assign: (c, e, m) => ({ ...seen(c, e, m), take: false, races: 0 }) },
          { assign: seen },
        ],
        RELEASE: { assign: c => ({ ...c, visible: false }) }, // nothing held here
      },
    },
  },
  on: {
    STOP: {
      target: 'off',
      assign: c => ({ ...c, settled: 'unknown', holder: null, version: null, take: false }),
      effects: settle('unknown'),
    },
  },
};
