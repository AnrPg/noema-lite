/**
 * The app's data on this device, as the older screens and the cloud sync read it (docs/ARCHITECTURE.md §6.3): the
 * namespaced key/value store (noema1:<account>:a:<name>, noema1:<account>:s:<subject>:<name>, noema1:<account>:meta:*),
 * which notes every write's time (meta:mtime, for the sync) and the dirty flag (meta:dirty, for the backups); the
 * profiles of this device; the Gemini key (this device only); and the 🔔 news kept here.
 * Everything goes through NoemaCore.storage.kv (src/adapters/browser/storage.ts), so a full storage warns once.
 */

/** The device's key/value storage (NoemaCore.storage.kv). */
export interface DeviceKv {
  get(key: string): string | null;
  set(key: string, value: unknown): boolean;
  delete(key: string): void;
  keys(prefix?: string): string[];
}

export const P = 'noema1:';

export function jsonOf<T>(kv: Pick<DeviceKv, 'get'>, key: string, fallback: T): T {
  const v = kv.get(key);
  if (v == null) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
export const putJson = (kv: DeviceKv, key: string, value: unknown): boolean => kv.set(key, JSON.stringify(value));

type Listener = (key: string, acc: string) => void;

/** The namespaced store of the open account (and subject): every write is timed for the sync. */
export class AccountKv {
  acc: string | null = null;
  subj: string | null = null;
  readonly listeners: Listener[] = [];
  /** an account in use on another device right now (NoemaCore.sync.lease): nothing of it is saved until "Use here" */
  frozen: string | null = null;
  /** an account just restored: the page reloads, and its last save must not write the old state back */
  sealed: string | null = null;

  private readonly kv: DeviceKv;
  private readonly now: () => number;
  private readonly onListenerError: (e: unknown) => void;
  constructor(kv: DeviceKv, now: () => number, onListenerError: (e: unknown) => void) {
    this.kv = kv;
    this.now = now;
    this.onListenerError = onListenerError;
  }

  paused(key: string): boolean {
    return [this.frozen, this.sealed].some(a => !!a && key.startsWith(`${P}${a}:`) && !key.startsWith(`${P}${a}:meta:`));
  }
  accountKey(name: string, acc: string | null = this.acc): string {
    return `${P}${acc ?? ''}:a:${name}`;
  }
  subjectKey(name: string, subj: string | null = this.subj, acc: string | null = this.acc): string {
    return `${P}${acc ?? ''}:s:${subj ?? ''}:${name}`;
  }
  get(key: string): string | null {
    return this.kv.get(key);
  }
  set(key: string, val: unknown, { silent = false }: { silent?: boolean } = {}): boolean {
    const text = typeof val === 'string' ? val : String(val);
    if (this.kv.get(key) === text) return true;
    if (this.paused(key)) return false;
    const done = this.kv.set(key, text);
    if (done && !silent) this.touch(key);
    return done;
  }
  del(key: string): void {
    if (this.kv.get(key) == null || this.paused(key)) return;
    this.kv.delete(key);
    this.touch(key);
  }
  touch(key: string): void {
    const acc = key.slice(P.length).split(':')[0] ?? '';
    const mk = `${P}${acc}:meta:mtime`;
    const m = jsonOf<Record<string, number>>(this.kv, mk, {});
    m[key.slice((P + acc + ':').length)] = this.now();
    putJson(this.kv, mk, m);
    putJson(this.kv, `${P}${acc}:meta:dirty`, this.now());
    for (const f of this.listeners) {
      try {
        f(key, acc);
      } catch (e) {
        this.onListenerError(e);
      }
    }
  }
  /** every data key of an account, keyed by its suffix (without "noema1:<acc>:"; the meta: keys left out) */
  accountData(acc: string): Record<string, string> {
    const pre = `${P}${acc}:`,
      out: Record<string, string> = {};
    for (const k of this.kv.keys(pre)) {
      const suf = k.slice(pre.length);
      const v = this.kv.get(k);
      if (!suf.startsWith('meta:') && v != null) out[suf] = v;
    }
    return out;
  }
}

/** A profile: a local one on this device (seeded by the registry or made here), or the signed-in cloud account. */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly emoji?: string;
  readonly kind: 'local' | 'cloud';
  readonly pin?: string | null;
  readonly email?: string | null;
  readonly created?: number;
  readonly learner?: string;
  readonly seed?: boolean;
}
export interface SavedAccount {
  readonly id: string;
  readonly name: string;
  readonly emoji?: string;
  readonly pin?: string | null;
  readonly created?: number;
  readonly learner?: string;
}

/** The local profiles: the registry's seeds, then what this device saved over them, without the removed ones. */
export function mergeAccounts(seeds: readonly SavedAccount[], saved: readonly SavedAccount[], removed: readonly string[]): Account[] {
  const gone = new Set(removed);
  const map = new Map<string, Account>();
  for (const a of seeds) map.set(a.id, { ...a, kind: 'local', seed: true });
  for (const a of saved) map.set(a.id, { ...(map.get(a.id) ?? {}), ...a, kind: 'local' });
  return [...map.values()].filter(a => !gone.has(a.id));
}

/** Lower-case latin letters and digits joined by "-", at most 30 (accents dropped; may be empty): ids of profiles and packs. */
export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

/** A profile id from its name: lower-case latin letters and digits, unique among `taken`. */
export function profileId(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name) || 'profile';
  let id = base,
    k = 2;
  while (taken.has(id)) id = `${base}-${String(k++)}`;
  return id;
}

export class LocalAccounts {
  private readonly kv: DeviceKv;
  private readonly seeds: () => readonly SavedAccount[];
  private readonly now: () => number;
  constructor(kv: DeviceKv, seeds: () => readonly SavedAccount[], now: () => number) {
    this.kv = kv;
    this.seeds = seeds;
    this.now = now;
  }
  list(): Account[] {
    return mergeAccounts(
      this.seeds(),
      jsonOf<SavedAccount[]>(this.kv, P + 'accounts', []),
      jsonOf<string[]>(this.kv, P + 'accounts:removed', []),
    );
  }
  save(a: SavedAccount): void {
    const list = jsonOf<SavedAccount[]>(this.kv, P + 'accounts', []).filter(x => x.id !== a.id);
    list.push({
      id: a.id,
      name: a.name,
      emoji: a.emoji ?? '',
      pin: a.pin ?? null,
      created: a.created ?? this.now(),
      learner: a.learner ?? '',
    });
    putJson(this.kv, P + 'accounts', list);
    putJson(
      this.kv,
      P + 'accounts:removed',
      jsonOf<string[]>(this.kv, P + 'accounts:removed', []).filter(x => x !== a.id),
    );
  }
  remove(id: string): void {
    putJson(this.kv, P + 'accounts:removed', [...jsonOf<string[]>(this.kv, P + 'accounts:removed', []), id]);
    putJson(
      this.kv,
      P + 'accounts',
      jsonOf<SavedAccount[]>(this.kv, P + 'accounts', []).filter(a => a.id !== id),
    );
  }
}

/** The Gemini key: on this device only (never in a:settings, so never synced nor in a backup without secrets). */
export class GeminiKey {
  private readonly kv: DeviceKv;
  private readonly store: AccountKv;
  private readonly builtIn: () => string;
  constructor(kv: DeviceKv, store: AccountKv, builtIn: () => string) {
    this.kv = kv;
    this.store = store;
    this.builtIn = builtIn;
  }
  k(acc: string): string {
    return 'noema-device:geminiKey:' + acc;
  }
  get(acc: string | null = this.store.acc): string {
    return (acc && this.kv.get(this.k(acc))) || '';
  }
  set(acc: string, key: unknown): void {
    const v = (typeof key === 'string' ? key : '').trim();
    if (v && v !== this.builtIn()) this.kv.set(this.k(acc), v);
    else this.kv.delete(this.k(acc));
  }
  /** a:settings never holds the key (it is synced and backed up): one found there moves here, and a:settings is written
      without it, which also clears the cloud's copy (the engine asks once a subject is open) */
  migrate(acc: string | null = this.store.acc): void {
    if (!acc) return;
    const sk = this.store.accountKey('settings', acc);
    const s = jsonOf<Record<string, unknown> | null>(this.store, sk, null);
    if (!s || typeof s !== 'object' || !('apiKey' in s)) return;
    const { apiKey, ...rest } = s;
    if (apiKey && !this.get(acc)) this.set(acc, apiKey);
    this.store.set(sk, JSON.stringify(rest));
  }
}

/** A piece of 🔔 news kept on this device. */
export interface Notice {
  readonly id: string;
  readonly kind: 'notice';
  readonly text: string;
  readonly at: number;
}
/** a storage bound only: the oldest beyond it go first */
export const NOTICE_KEEP = 200;

/** The 🔔 news that arrived here (not synced): what the notifier moved off the screen waits here until cleared. */
export class NoticeStore {
  readonly #listeners = new Set<() => void>();
  private readonly kv: DeviceKv;
  private readonly rand: () => string;
  constructor(kv: DeviceKv, rand: () => string) {
    this.kv = kv;
    this.rand = rand;
  }
  key(acc: string | null): string {
    return 'noema-notices:' + (acc || 'local');
  }
  list(acc: string | null): Notice[] {
    const a = jsonOf<unknown>(this.kv, this.key(acc), []);
    return Array.isArray(a) ? (a as Notice[]) : [];
  }
  onChange(f: () => void): () => void {
    this.#listeners.add(f);
    return () => this.#listeners.delete(f);
  }
  write(acc: string | null, a: readonly Notice[]): void {
    putJson(this.kv, this.key(acc), a.slice(-NOTICE_KEEP));
    for (const f of [...this.#listeners]) f();
  }
  keep(acc: string | null, items: readonly { text: string; at: number }[]): void {
    this.write(acc, [
      ...this.list(acc),
      ...items.map(x => ({ id: `note:${String(x.at)}:${this.rand()}`, kind: 'notice' as const, text: x.text, at: x.at })),
    ]);
  }
  dismiss(acc: string | null, id: string): void {
    this.write(
      acc,
      this.list(acc).filter(x => x.id !== id),
    );
  }
  clear(acc: string | null): void {
    this.write(acc, []);
  }
}
