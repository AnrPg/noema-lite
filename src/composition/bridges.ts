/**
 * 文A language help (src/features/bridges, docs/BRIDGE.md), composed for the page:
 *
 *   NoemaCore.bridges (build/app.js)   the lookup (pairKey · pairOf · available · splitBridge · mergeBridges) and the service:
 *                                      settings(acc) · setSettings(acc, patch) · native(acc) · setNative(acc, code) ·
 *                                      words(acc, source) · available(acc, packId, subject?, source?, own?) ·
 *                                      load(acc, packId, native, source?, own?) → Promise<bridge | null> ·
 *                                      attach(acc, bridge) → Promise<{ pack, native, source, title }> (throws a refused one:
 *                                      .code bridge.invalid | bridge.no_pack | bridge.not_saved, .message in the interface language) ·
 *                                      detach(…) · report(acc, r) · FADE · LEVELS
 *   NoemaShell.bridge (build/ui.js)    its screens (src/composition/bridges-ui.ts)
 *
 * Over the page: the account's keys (read from this device, written through Noema.kv so they sync), the settings writer
 * (NoemaThemes.putSettings), the registry's bridgeLocales and the library's bridge scripts (window.NOEMA_BRIDGES), the
 * cloud (NoemaCloud: the account's folder and the noema_bridges rows), this device's copies (IndexedDB noema-bridges),
 * the account's subjects (Noema.subjectsFor, loadSubject) and the content checks (NoemaCore.content.checkBridge).
 */
import { browserBridgeCache } from '../adapters/browser/bridge-cache.ts';
import { createBridgeService, type BridgeService, type RegistryRow, type SubjectRow } from '../features/bridges/application/bridges.ts';
import { FADE, LEVELS, type Bridge } from '../features/bridges/domain/help.ts';
import type { OpenSubject, WordLinker } from '../features/bridges/ui/help.ts';
import { hash36 } from '../features/catalog/domain/records.ts';
import type { BridgeExtension } from './bridge.ts';
import type { Resolver } from './container.ts';
import { bridgesDomain } from './roadmaps.ts';
import { CLOCK, ERRORS, I18N, STORAGE } from './tokens.ts';

export interface BridgeGlobals {
  Noema?: {
    account?: { id?: string } | null;
    kv?: { acc?: string | null; set?(k: string, v: string): unknown };
    subjectsFor?(acc: string | null): Promise<readonly SubjectRow[]>;
    loadSubject?(acc: string | null, id: string): Promise<{ subject?: { language?: string } } | null>;
    subject?: (SubjectRow & { kind?: string }) | null;
    pack?: OpenSubject['pack'] | null;
    subjectMeta?: SubjectRow | null;
  };
  NoemaThemes?: { putSettings?(patch: Readonly<Record<string, unknown>>, acc: string | null): void };
  NoemaCloud?: {
    session?(): { user: { id: string } } | null;
    downloadObject?(path: string): Promise<{ json(): Promise<unknown> } | null>;
    uploadObject?(path: string, blob: Blob, type: string): Promise<unknown>;
    rows?: {
      put(acc: string, kind: string, pack: string, pair: string, entry: unknown): void;
      del(acc: string, kind: string, pack: string, pair: string): void;
    };
  };
  NOEMA_REGISTRY?: { subjects?: readonly (RegistryRow & { id: string })[] };
  NOEMA_LIBRARY_BASE?: string;
  NOEMA_BRIDGES?: Readonly<Record<string, Bridge>>;
  NoemaWordlink?: WordLinker;
  NoemaI18n?: { locale?: string; fmt?: { langName?(code: string): string } };
  NoemaCore?: { bridges?: BridgeService; content?: { checkBridge?(b: unknown, pack: unknown): { errors: readonly string[] } } };
}

const P = 'noema1:';

/** The bridges' service over the page. */
export function pageBridges(r: Resolver, g: BridgeGlobals = globalThis as BridgeGlobals): BridgeService {
  const kv = r.get(STORAGE).kv,
    clock = r.get(CLOCK),
    errors = r.get(ERRORS),
    cache = browserBridgeCache();
  const json = (k: string): unknown => {
    const v = kv.get(k);
    if (!v.ok || v.value == null) return null;
    try {
      return JSON.parse(v.value) as unknown;
    } catch {
      return null; // not JSON (hand-edited): missing
    }
  };
  const account = (acc?: string | null): string | null =>
    acc || g.Noema?.account?.id || g.Noema?.kv?.acc || ((json(P + 'current') as { acc?: string } | null)?.acc ?? null);
  const key = (acc: string | null, name: string): string => `${P}${String(acc)}:a:${name}`;
  const signedAs = (acc: string | null): boolean => {
    const s = g.NoemaCloud?.session?.();
    return !!s && acc === 'u_' + s.user.id;
  };
  const libraryScript = (src: string): Promise<void> =>
    new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => {
        res();
      };
      s.onerror = () => {
        rej(new Error(src));
      };
      document.head.append(s);
    });
  return createBridgeService({
    account,
    uiLocale: () => g.NoemaI18n?.locale ?? '',
    read: (acc, name) => json(key(acc, name)),
    write: (acc, name, value) => {
      const s = JSON.stringify(value);
      if (g.Noema?.kv?.set) g.Noema.kv.set(key(acc, name), s);
      else kv.set(key(acc, name), s);
    },
    putSettings: (acc, patch) => {
      if (g.NoemaThemes?.putSettings) {
        g.NoemaThemes.putSettings(patch, acc);
        return;
      }
      const cur = json(key(acc, 'settings'));
      kv.set(key(acc, 'settings'), JSON.stringify({ ...(cur && typeof cur === 'object' ? cur : {}), ...patch }));
    },
    registry: id => g.NOEMA_REGISTRY?.subjects?.find(s => s.id === id) ?? null,
    cache: {
      get: async k => ((await cache.get(k)) as Bridge | undefined) ?? null,
      put: (k, b) => cache.put(k, b),
      del: k => cache.del(k),
    },
    cloud: {
      isAccount: signedAs,
      download: async path => {
        const res = await g.NoemaCloud?.downloadObject?.(path);
        return res ? res.json() : null;
      },
      // a failed upload rejects: attach lists nothing then (the payload is not in the cloud)
      upload: async (path, b) => {
        const C = g.NoemaCloud;
        if (!C?.uploadObject) throw new Error('NoemaCloud.uploadObject is missing'); // a log: isAccount said signed in
        await C.uploadObject(path, new Blob([JSON.stringify(b)], { type: 'application/json' }), 'application/json');
      },
      putRow: (acc, pack, pair, entry) => g.NoemaCloud?.rows?.put(acc, 'bridges', pack, pair, entry),
      deleteRow: (acc, pack, pair) => g.NoemaCloud?.rows?.del(acc, 'bridges', pack, pair),
    },
    library: async (packId, nat, path) => {
      const id = `${packId}|${nat}`;
      if (!g.NOEMA_BRIDGES?.[id])
        await libraryScript((g.NOEMA_LIBRARY_BASE ?? '') + path).catch(errors.catcher('bridge.library', { severity: 'warning' }));
      return g.NOEMA_BRIDGES?.[id] ?? null;
    },
    subjects: async acc => (g.Noema?.subjectsFor ? g.Noema.subjectsFor(acc) : []),
    loadSubject: async (acc, id) => (g.Noema?.loadSubject ? g.Noema.loadSubject(acc, id) : null),
    check: (b, pack) => g.NoemaCore?.content?.checkBridge?.(b, pack) ?? null,
    hash: s => hash36(s),
    now: () => clock.now(),
  });
}

export const bridgesBridge: BridgeExtension = {
  name: 'bridges',
  build: r => {
    const s = pageBridges(r),
      i18n = r.get(I18N);
    return Object.freeze({
      ...bridgesDomain,
      ...s,
      FADE,
      LEVELS,
      // the older pages' way: a refused bridge throws, its message in the interface language
      attach: async (acc: string | null | undefined, b: Bridge) => {
        const res = await s.attach(acc, b);
        if (res.ok) return res.value;
        const e = res.error;
        throw Object.assign(
          new Error(
            e.code === 'bridge.invalid'
              ? i18n.t('bridge.attach.invalid', { detail: e.detail })
              : e.code === 'bridge.no_pack'
                ? i18n.t('bridge.attach.noPack', { id: e.id })
                : i18n.t('bridge.attach.notSaved'),
          ),
          e.code === 'bridge.not_saved' ? { code: e.code, cause: e.cause } : { code: e.code },
        );
      },
    });
  },
};
