/* noema-lite — 文A language help for students who study in a language that is not their own (docs/BRIDGE.md): the use cases.
   A bridge is a sidecar of one subject pack for one language pair (from the language the learner reads into their native
   language); the pack itself never changes.
     · where bridges come from: the library (library/subjects/<id>/bridge.<native>.js, listed in the registry as bridgeLocales)
       or the learner's account (a file imported with 📥, or saved by Claude through the connector: noema-private/<uid>/
       bridges/<pack>.<pair>.json + one row per pack × pair in noema_bridges, indexed in a:bridges) — attached any time
     · direction: from the language the learner READS to the learner's native language (a:settings.native, shared with the
       language courses, D19), else the interface language
     · the learner's settings (a:settings.bridge), their words per source language (a:bridgeWords:<source>: known, glossed,
       looked up; synced) and the translations they reported (a:bridgeReports) */
import { err, ok, type Result } from '../../../kernel/result.ts';
import {
  bridgeSettings,
  patchWord,
  summary,
  type Bridge,
  type BridgeSettings,
  type BridgeSummary,
  type WordPatch,
  type WordState,
} from '../domain/help.ts';
import { available as lookupAvailable, base, pairKey, type Available, type BridgeMeta } from '../domain/lookup.ts';

/** a subject of the account, as its list has it */
export interface SubjectRow {
  readonly id: string;
  readonly title?: string;
  readonly language?: string;
  readonly sourceLanguage?: string;
  readonly bridgeLocales?: Readonly<Record<string, BridgeMeta>>;
}
/** the registry's entry of a library subject */
export interface RegistryRow {
  readonly language?: string;
  readonly bridgeLocales?: Readonly<Record<string, BridgeMeta & { path?: string }>>;
}

export interface BridgePorts {
  /** the account (acc, else the one open now), or null */
  account(acc?: string | null): string | null;
  /** the interface language */
  uiLocale(): string;
  /** the account's keys (a:<name>): read, and write (the app's timed store, so they sync) */
  read(acc: string | null, name: string): unknown;
  write(acc: string | null, name: string, value: unknown): void;
  /** writes into a:settings (the settings writer: synced) */
  putSettings(acc: string | null, patch: Readonly<Record<string, unknown>>): void;
  registry(packId: string): RegistryRow | null;
  /** this device's copies of the account's bridges, by `${acc}|${pack}|${pair}` */
  readonly cache: {
    get(key: string): Promise<Bridge | null>;
    put(key: string, b: Bridge): Promise<void>;
    del(key: string): Promise<void>;
  };
  /** the account's cloud folder and rows (when signed in as that account) */
  readonly cloud: {
    isAccount(acc: string | null): boolean;
    download(path: string): Promise<unknown>;
    upload(path: string, b: Bridge): Promise<void>;
    putRow(acc: string, pack: string, pair: string, entry: BridgeSummary & { source: string }): void;
    deleteRow(acc: string, pack: string, pair: string): void;
  };
  /** a library bridge (its script) → the bridge, or null */
  library(packId: string, native: string, path: string): Promise<Bridge | null>;
  subjects(acc: string | null): Promise<readonly SubjectRow[]>;
  loadSubject(acc: string | null, id: string): Promise<{ subject?: { language?: string } } | null>;
  /** the content check of a bridge against its pack (NoemaCore.content.checkBridge), or null when it is not loaded */
  check(b: unknown, pack: unknown): { errors: readonly string[] } | null;
  hash(s: string): string;
  now(): number;
}

export type AttachError =
  | { readonly code: 'bridge.invalid'; readonly detail: string }
  | { readonly code: 'bridge.no_pack'; readonly id: string }
  /** the bridge could not be kept where the account keeps it (the cloud for a signed-in account, else this device): nothing
      was listed, so no index entry or row points at a bridge that is not there */
  | { readonly code: 'bridge.not_saved'; readonly where: 'cloud' | 'device'; readonly cause: unknown };
export interface Attached {
  readonly pack: string;
  readonly native: string;
  readonly source: string;
  readonly title: string;
}

export interface BridgeService {
  pairKey: typeof pairKey;
  settings(acc?: string | null): BridgeSettings;
  setSettings(acc: string | null | undefined, patch: Partial<BridgeSettings>): BridgeSettings;
  /** the learner's native language as a base code ('ru'), or null when they have not said */
  native(acc?: string | null): string | null;
  /** …else the interface language's */
  nativeOrUi(acc?: string | null): string;
  setNative(acc: string | null | undefined, code: string | null | undefined): void;
  words(acc: string | null | undefined, source: string | null | undefined): Readonly<Record<string, WordState>>;
  touchWord(acc: string | null | undefined, source: string | null | undefined, k: string, patch: WordPatch): WordState;
  /** Every native language with a bridge for this pack FROM the language src (default: the pack's own) → { code: meta } (the
      account's own wins). */
  available(
    acc: string | null | undefined,
    packId: string,
    subj?: SubjectRow | null,
    src?: string | null,
    own?: string | null,
  ): Record<string, Available>;
  /** The bridge of one pack for one pair (from src — default the pack's own language — into native), or null. */
  load(acc: string | null | undefined, packId: string, native: string, src?: string | null, own?: string | null): Promise<Bridge | null>;
  /** Attaches a bridge to the account: checked, kept on this device and in the cloud, listed in the synced index. */
  attach(acc: string | null | undefined, b: Bridge): Promise<Result<Attached, AttachError>>;
  detach(acc: string | null | undefined, packId: string, native: string, src?: string | null, own?: string | null): Promise<void>;
  /** A reported translation: kept in the account for whoever reviews the bridge next (the last 200). */
  report(acc: string | null | undefined, r: Readonly<Record<string, unknown>>): void;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function createBridgeService(p: BridgePorts): BridgeService {
  // `${acc}|${pack}|${pair}` → a bridge found, with the index's version it was loaded for (null: the library's); a miss is
  // never kept, so a bridge attached or revised later (on another device, by the connector) is found
  const mem = new Map<string, { readonly b: Bridge; readonly v: unknown }>();
  const index = (acc: string | null): Record<string, Record<string, BridgeMeta>> =>
    obj(p.read(acc, 'bridges')) as Record<string, Record<string, BridgeMeta>>;
  const accSettings = (acc: string | null): Record<string, unknown> => obj(p.read(acc, 'settings'));

  const settings = (acc?: string | null): BridgeSettings => bridgeSettings(accSettings(p.account(acc))['bridge']);
  const native = (acc?: string | null): string | null => {
    const n = obj(accSettings(p.account(acc))['native']);
    return typeof n['code'] === 'string' && n['code'] ? base(n['code']) : null;
  };
  const nativeOrUi = (acc?: string | null): string => {
    const a = p.account(acc);
    return native(a) || base(p.uiLocale() || (accSettings(a)['lang'] as string | undefined) || 'en');
  };
  const words = (acc: string | null | undefined, src: string | null | undefined): Record<string, WordState> =>
    obj(p.read(p.account(acc), 'bridgeWords:' + base(src))) as Record<string, WordState>;

  const available: BridgeService['available'] = (acc, packId, subj, src, own) => {
    const reg = p.registry(packId);
    const lib = subj?.bridgeLocales ?? reg?.bridgeLocales ?? {};
    const o = own || subj?.sourceLanguage || subj?.language || reg?.language || src || null;
    // no language given: the bridges from the pack's own language (keys without a source), whatever that language is
    return lookupAvailable(lib, index(p.account(acc))[packId] ?? {}, src || null, o);
  };

  async function load(
    acc0: string | null | undefined,
    packId: string,
    nat: string,
    src?: string | null,
    own?: string | null,
  ): Promise<Bridge | null> {
    const acc = p.account(acc0),
      pk = pairKey(src, nat, own),
      key = `${acc}|${packId}|${pk}`;
    const ix = index(acc)[packId]?.[pk],
      v = ix?.['v'] ?? null,
      hit = mem.get(key);
    if (hit && hit.v === v) return hit.b;
    let b: Bridge | null = null;
    if (ix) {
      b = await p.cache.get(key).catch(() => null);
      // the cloud folder is the signed-in account's own: never asked for another profile's bridge
      if ((!b || summary(b, s => p.hash(s), 0).v !== v) && p.cloud.isAccount(acc)) {
        const fresh = obj(await p.cloud.download(`bridges/${packId}.${pk}.json`).catch(() => null));
        if (fresh['format'] === 'noema-bridge') {
          b = fresh as unknown as Bridge;
          await p.cache.put(key, b).catch(() => undefined); // this device's copy: the cloud keeps the bridge
        }
      }
    }
    if (!b) {
      const reg = p.registry(packId)?.bridgeLocales?.[pk];
      if (reg?.path) b = await p.library(packId, pk, reg.path);
    }
    if (b) mem.set(key, { b, v });
    else mem.delete(key);
    return b;
  }

  async function attach(acc0: string | null | undefined, b: Bridge): Promise<Result<Attached, AttachError>> {
    const acc = p.account(acc0);
    const meta = (await p.subjects(acc)).find(s => s.id === b.pack);
    const pack = meta ? await p.loadSubject(acc, b.pack).catch(() => null) : null;
    const r = p.check(b, pack) ?? { errors: [] };
    if (r.errors.length) return err({ code: 'bridge.invalid', detail: r.errors.slice(0, 3).join(' · ') });
    if (!meta) return err({ code: 'bridge.no_pack', id: b.pack });
    const own = pack?.subject?.language || meta.language || 'en',
      nat = base(b.native),
      pk = pairKey(b.source, nat, own),
      key = `${acc}|${b.pack}|${pk}`,
      source = base(b.source || own);
    // kept first, listed after: the cloud keeps a signed-in account's bridge (this device's copy is then only a cache), this
    // device a local profile's — when that fails, nothing is listed
    const onDevice = await p.cache.put(key, b).then(
      () => null,
      (e: unknown) => e,
    );
    if (p.cloud.isAccount(acc)) {
      try {
        await p.cloud.upload(`bridges/${b.pack}.${pk}.json`, b);
      } catch (e) {
        return err({ code: 'bridge.not_saved', where: 'cloud', cause: e });
      }
    } else if (onDevice !== null) return err({ code: 'bridge.not_saved', where: 'device', cause: onDevice });
    const entry = { ...summary(b, s => p.hash(s), p.now()), source };
    const all = index(acc);
    all[b.pack] = { ...(all[b.pack] ?? {}), [pk]: entry as BridgeMeta };
    p.write(acc, 'bridges', all);
    if (acc && p.cloud.isAccount(acc)) p.cloud.putRow(acc, b.pack, pk, entry);
    mem.delete(key);
    return ok({ pack: b.pack, native: nat, source, title: meta.title || b.pack });
  }

  async function detach(
    acc0: string | null | undefined,
    packId: string,
    nat: string,
    src?: string | null,
    own?: string | null,
  ): Promise<void> {
    const acc = p.account(acc0),
      pk = pairKey(src, nat, own);
    await p.cache.del(`${acc}|${packId}|${pk}`).catch(() => undefined); // already gone from this device
    const all = index(acc),
      mine = all[packId];
    if (mine) {
      const left = Object.fromEntries(Object.entries(mine).filter(([k]) => k !== pk));
      const rest = Object.fromEntries(Object.entries(all).filter(([k]) => k !== packId));
      p.write(acc, 'bridges', Object.keys(left).length ? { ...rest, [packId]: left } : rest);
    }
    if (acc && p.cloud.isAccount(acc)) p.cloud.deleteRow(acc, packId, pk);
    mem.delete(`${acc}|${packId}|${pk}`);
  }

  return Object.freeze({
    pairKey,
    settings,
    setSettings(acc0: string | null | undefined, patch: Partial<BridgeSettings>): BridgeSettings {
      const acc = p.account(acc0),
        bridge = { ...settings(acc), ...patch };
      p.putSettings(acc, { bridge });
      return bridge;
    },
    native,
    nativeOrUi,
    setNative(acc: string | null | undefined, code: string | null | undefined): void {
      if (code) p.putSettings(p.account(acc), { native: { code } });
    },
    words,
    touchWord(acc0: string | null | undefined, src: string | null | undefined, k: string, patch: WordPatch): WordState {
      const acc = p.account(acc0),
        all = words(acc, src),
        w = patchWord(all[k], patch, p.now());
      p.write(acc, 'bridgeWords:' + base(src), { ...all, [k]: w });
      return w;
    },
    available,
    load,
    attach,
    detach,
    report(acc0: string | null | undefined, r: Readonly<Record<string, unknown>>): void {
      const acc = p.account(acc0),
        all = p.read(acc, 'bridgeReports');
      const list = Array.isArray(all) ? (all as unknown[]) : [];
      p.write(acc, 'bridgeReports', [...list, { ...r, at: new Date(p.now()).toISOString() }].slice(-200));
    },
  });
}
