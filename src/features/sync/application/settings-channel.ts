/**
 * The settings channel (docs/SYNC.md §Settings): the account's synced records (a:settings) as per-field last-writer-wins
 * registers (src/features/sync/domain/registers.ts), pushed to and pulled from the cloud's registers `settings` (table
 * noema_settings). The record itself stays where the app reads it (the device key `noema1:<account>:a:settings`); this
 * channel finds what changed in it (noteLocal, called after every write and before every pull), stamps each changed field
 * with the device's hybrid clock, and writes the fields other devices changed later back into it.
 *
 *  • A device's secrets (the Gemini key: apiKey) are never registered, so never sent.
 *  • The first time a device registers a record, its fields are stamped with `changedAt` (a change the cloud does not have
 *    yet; otherwise as old as possible), not "now", so a new device's defaults or an old copy that comes back after months
 *    never win over the choices made elsewhere.
 *  • The key/value row a:settings of the cloud (from before the registers) is taken in once: importLegacy, with the row's
 *    own time as the stamp; the row is then deleted by engine/cloud.js.
 *
 * Its state is in the document collection `sync`: `reg|<account>|<record>` → field → register, `cursor|<account>|settings`.
 */
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, type AsyncResult, type Result } from '../../../kernel/result.ts';
import type { Json } from '../../../ports/common.ts';
import type { ErrorReporter } from '../../../ports/error-reporter.ts';
import type { RegisterEntry, Remote } from '../../../ports/remote.ts';
import type { Storage } from '../../../ports/storage.ts';
import {
  changedFields,
  later,
  registerKey,
  splitRegisterKey,
  withField,
  type JsonRecord,
  type Register,
  type Registers,
} from '../domain/registers.ts';
import { stampAt, type DeviceClock } from './device.ts';
import { cursorKey } from './events-channel.ts';
import { SYNC_COLLECTION } from './outbox.ts';
import type { SyncChannel } from './ports.ts';

export const SETTINGS_COLLECTION = 'settings';
/** The node of the stamps given to data from before the registers (the cloud's old key/value row). */
export const LEGACY_NODE = 'kv';
const PULL_PAGE = 1000;

export interface SyncedRecord {
  /** Its name: the device key is `noema1:<account>:a:<name>`, the cloud keys `<name>.<field>`. */
  readonly name: string;
  /** Fields that stay on this device. */
  readonly secret: readonly string[];
}
export const SYNCED_RECORDS: readonly SyncedRecord[] = [{ name: 'settings', secret: ['apiKey'] }];

export const recordKey = (account: string, name: string): string => `noema1:${account}:a:${name}`;
const regsKey = (account: string, name: string): string => `reg|${account}|${name}`;

export interface SettingsChannelDeps {
  readonly storage: Storage;
  readonly remote: Remote;
  readonly device: DeviceClock;
  readonly errors: ErrorReporter;
  readonly records?: readonly SyncedRecord[];
  /** When this device changed the record without sending it (epoch ms), for its first registration; null: as old as possible. */
  readonly changedAt: (account: string, name: string) => number | null;
}

export interface SettingsChannel extends SyncChannel {
  /** The record was written on this device: register what changed. → whether anything did. */
  noteLocal(account: string): AsyncResult<boolean>;
  /** The cloud's old key/value copy of a record (text, its version = the row's time) → the device keys it changed here. */
  importLegacy(account: string, name: string, text: string, version: string): AsyncResult<readonly string[]>;
}

export function settingsChannel(d: SettingsChannelDeps): SettingsChannel {
  const records = d.records ?? SYNCED_RECORDS;
  const names = records.map(r => r.name);
  const { kv, docs } = d.storage;
  let chain: Promise<unknown> = Promise.resolve();
  /** One operation at a time (a write noted while a pull applies the cloud's would otherwise be lost). */
  const serial = <T>(f: () => Promise<T>): Promise<T> => {
    const run = chain.then(f, f);
    chain = run.catch(() => undefined); // the failure is its caller's (a Result); the next one runs anyway
    return run;
  };

  const readRecord = (account: string, name: string): Result<JsonRecord> => {
    const t = kv.get(recordKey(account, name));
    if (!t.ok) return t;
    if (!t.value) return ok({});
    try {
      const v: unknown = JSON.parse(t.value);
      return ok(v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRecord) : {});
    } catch (e) {
      return err(new NoemaError('storage.corrupt', `${name} is not JSON`, { cause: e, params: { key: recordKey(account, name) } }));
    }
  };
  const loadRegs = async (account: string, name: string): AsyncResult<Registers | undefined> =>
    docs.get<Registers>(SYNC_COLLECTION, regsKey(account, name));
  const saveRegs = (account: string, name: string, regs: Registers): AsyncResult<void> =>
    docs.put(SYNC_COLLECTION, regsKey(account, name), regs);

  async function note(account: string, rec: SyncedRecord): AsyncResult<boolean> {
    const record = readRecord(account, rec.name);
    if (!record.ok) return record;
    const have = await loadRegs(account, rec.name);
    if (!have.ok) return have;
    const regs = have.value ?? {};
    const changes = changedFields(record.value, regs, new Set(rec.secret));
    if (!changes.length && have.value) return ok(false);
    let stamp: () => Result<string>;
    if (have.value) stamp = () => d.device.now();
    else {
      const base = stampAt(d.changedAt(account, rec.name) ?? 0, d.device.id); // first registration: never newer than what the device knows
      stamp = () => base;
    }
    const next: Record<string, Register> = { ...regs };
    for (const [f, v] of changes) {
      const s = stamp();
      if (!s.ok) return s;
      next[f] = { value: v, stamp: s.value, sent: false };
    }
    const saved = await saveRegs(account, rec.name, next);
    return saved.ok ? ok(changes.length > 0) : saved;
  }
  const noteAll = async (account: string): AsyncResult<boolean> => {
    let any = false;
    for (const rec of records) {
      const r = await note(account, rec);
      if (!r.ok) return r;
      any ||= r.value;
    }
    return ok(any);
  };

  /** Writes accepted fields into the record (read again now: no await between reading and writing it). */
  function applyToRecord(account: string, name: string, fields: ReadonlyArray<readonly [string, Json]>): Result<boolean> {
    if (!fields.length) return ok(false);
    const cur = readRecord(account, name);
    if (!cur.ok) return cur;
    let rec = cur.value;
    for (const [f, v] of fields) rec = withField(rec, f, v);
    const w = kv.set(recordKey(account, name), JSON.stringify(rec));
    return w.ok ? ok(true) : w;
  }

  const channel: SettingsChannel = {
    name: 'settings',
    noteLocal: account => serial(() => noteAll(account)),

    pending: account =>
      serial(async () => {
        let n = 0;
        for (const rec of records) {
          const r = await loadRegs(account, rec.name);
          if (!r.ok) return r;
          n += Object.values(r.value ?? {}).filter(x => !x.sent).length;
        }
        return ok(n);
      }),

    push: (account, { keepalive }) =>
      serial(async () => {
        let sent = 0;
        for (const rec of records) {
          const r = await loadRegs(account, rec.name);
          if (!r.ok) return r;
          const regs = r.value ?? {};
          const out: RegisterEntry[] = Object.entries(regs)
            .filter(([, x]) => !x.sent)
            .map(([f, x]) => ({ key: registerKey(rec.name, f), value: x.value, stamp: x.stamp, device: d.device.id }));
          if (!out.length) continue;
          const kept = await d.remote.registers.put(SETTINGS_COLLECTION, out, { keepalive });
          if (!kept.ok) return kept;
          const stored = new Map(kept.value.map(e => [e.key, e.stamp]));
          const now = await loadRegs(account, rec.name);
          if (!now.ok) return now;
          const next: Record<string, Register> = { ...(now.value ?? {}) };
          for (const e of out) {
            const f = e.key.slice(rec.name.length + 1),
              x = next[f];
            if (!x || x.stamp !== e.stamp) continue; // changed again meanwhile: sent next time
            // kept: with the stamp the cloud stored (a clock far ahead is clamped); not kept: the cloud has a later one, the pull brings it
            next[f] = { ...x, sent: true, stamp: stored.get(e.key) ?? x.stamp };
          }
          const saved = await saveRegs(account, rec.name, next);
          if (!saved.ok) return saved;
          sent += out.length;
        }
        return ok(sent);
      }),

    pull: account =>
      serial(async () => {
        const noted = await noteAll(account); // what was written here and not yet registered comes first
        if (!noted.ok) return noted;
        const ck = cursorKey(account, SETTINGS_COLLECTION);
        const c = await docs.get<string>(SYNC_COLLECTION, ck);
        if (!c.ok) return c;
        let after = c.value ?? null;
        const changed = new Set<string>();
        for (;;) {
          const page = await d.remote.registers.read(SETTINGS_COLLECTION, { after, limit: PULL_PAGE });
          if (!page.ok) return page;
          const byRecord = new Map<string, Array<RegisterEntry & { field: string }>>();
          for (const e of page.value.entries) {
            const k = splitRegisterKey(e.key, names);
            if (!k) continue; // a record this app does not sync (a newer app's): left alone
            const list = byRecord.get(k[0]) ?? [];
            list.push({ ...e, field: k[1] });
            byRecord.set(k[0], list);
            const seen = d.device.receive(e.stamp);
            if (!seen.ok && seen.error.code !== 'hlc.drift')
              d.errors.report(seen.error, { where: 'sync.settings.clock', severity: 'info' });
          }
          for (const [name, entries] of byRecord) {
            const rec = records.find(r => r.name === name);
            const r = await loadRegs(account, name);
            if (!r.ok) return r;
            const next: Record<string, Register> = { ...(r.value ?? {}) };
            const take: Array<readonly [string, Json]> = [];
            for (const e of entries) {
              if (rec?.secret.includes(e.field) || !later(e.stamp, next[e.field]?.stamp)) continue; // this device's is as late or later
              next[e.field] = { value: e.value, stamp: e.stamp, sent: true };
              take.push([e.field, e.value]);
            }
            const w = applyToRecord(account, name, take);
            if (!w.ok) return w; // a full storage: nothing is counted as taken in, the next pull tries again
            const saved = await saveRegs(account, name, next);
            if (!saved.ok) return saved;
            if (w.value) changed.add(recordKey(account, name));
          }
          if (page.value.cursor !== after) {
            const saved = await docs.put(SYNC_COLLECTION, ck, page.value.cursor);
            if (!saved.ok) return saved;
            after = page.value.cursor;
          }
          if (!page.value.more) return ok([...changed]);
        }
      }),

    importLegacy: (account, name, text, version) =>
      serial(async () => {
        const rec = records.find(r => r.name === name);
        if (!rec) return ok([]);
        let old: unknown;
        try {
          old = JSON.parse(text);
        } catch (e) {
          d.errors.report(new NoemaError('storage.corrupt', `the cloud's old ${name} is not JSON`, { cause: e }), {
            where: 'sync.settings.legacy',
            severity: 'warning',
          });
          return ok([]);
        }
        if (!old || typeof old !== 'object' || Array.isArray(old)) return ok([]);
        const noted = await note(account, rec);
        if (!noted.ok) return noted;
        const stamp = stampAt(Date.parse(version) || 0, LEGACY_NODE);
        if (!stamp.ok) return stamp;
        const r = await loadRegs(account, name);
        if (!r.ok) return r;
        const next: Record<string, Register> = { ...(r.value ?? {}) };
        const take: Array<readonly [string, Json]> = [];
        for (const [f, v] of Object.entries(old as JsonRecord)) {
          if (rec.secret.includes(f) || !later(stamp.value, next[f]?.stamp)) continue;
          next[f] = { value: v, stamp: stamp.value, sent: false };
          take.push([f, v]);
        }
        const w = applyToRecord(account, name, take);
        if (!w.ok) return w;
        const saved = await saveRegs(account, name, next);
        if (!saved.ok) return saved;
        return ok(w.value ? [recordKey(account, name)] : []);
      }),
  };
  return channel;
}
