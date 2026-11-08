/**
 * The share dialog's data and cloud calls over the older scripts: the pack as it is shared (its translations inline:
 * Noema.app.getPack, inlineTranslations), its info (Noema.packInfo), its source files and activity files
 * (engine/srcfiles.js), the cloud's sharing (engine/cloud.js: publish, shareWith, the shares sent), the package as a file.
 */
import type { HostSubject, ShareHost, SharePrep, ShareProgress } from '../features/community/ui/host.ts';
import { call, need, obj, str, type Any } from './community-host.ts';

interface Prep extends SharePrep {
  readonly pack: unknown;
  readonly meta: Any;
}

export function oldAppShare(win: Window): ShareHost {
  const g = (name: string): Any | null => obj((win as unknown as Any)[name]);
  const N = (): Any | null => g('Noema');
  const APP = (): Any | null => obj(N()?.['app']);
  const C = (): Any | null => g('NoemaCloud');
  const F = (): Any | null => g('NoemaSrcFiles');
  const acc = (): string => str(obj(N()?.['account'])?.['id']);
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  /** the shares sent (their files, for withdrawing one) */
  const sentRows = new Map<string, Any>();
  /** the files that go with it: its sources (unless unticked) and its activities' own files (an .h5p is the activity) */
  const files = async (p: Prep, sources: boolean, progress: ShareProgress): Promise<unknown[]> => {
    const withSources = sources && p.files.n > 0;
    const acts = (call<unknown[]>(F(), 'h5pItems', p.pack) ?? []).length > 0;
    if (!withSources && !acts) return [];
    progress(0, 0, '');
    return need<Promise<unknown[]>>(F(), 'forSharing', acc(), p.subject.id, { pack: p.pack, sources: withSources });
  };
  const up =
    (progress: ShareProgress) =>
    (k: unknown, n: unknown, name: unknown): void => {
      progress(num(k), num(n), str(name));
    };
  const prepOf = (p: SharePrep): Prep => p as Prep;

  return {
    prepare: async id => {
      const a = acc();
      const subs = await need<Promise<HostSubject[]>>(N(), 'subjectsFor', a);
      const s = subs.find(x => x.id === id);
      if (!s) throw new Error(`no subject ${id}`);
      const raw = await need<Promise<unknown>>(APP(), 'getPack', a, s);
      const pack = await need<Promise<unknown>>(APP(), 'inlineTranslations', a, s, raw);
      const meta = obj(need<unknown>(N(), 'packInfo', pack, a)) ?? {};
      const c = obj(meta['counts']) ?? {};
      const fx = Object.values(obj(call<unknown>(F(), 'index', a, id)) ?? {}).map(x => obj(x) ?? {});
      const prep: Prep = {
        subject: s,
        counts: { chapters: num(c['chapters']), exercises: num(c['exercises']), pictures: num(c['pictures']) },
        restricted: num(meta['restricted']),
        files: { n: fx.length, bytes: fx.reduce((t, m) => t + num(m['size']), 0) },
        pack,
        meta,
      };
      return prep;
    },
    published: async id => {
      const mine = (await call<Promise<Any[] | null>>(C(), 'myPublished')?.catch(() => null)) ?? [];
      const r = mine.find(x => x['subject_id'] === id);
      return r ? { at: str(r['updated_at']) } : null;
    },
    publish: async (p0, o) => {
      const p = prepOf(p0);
      const fl = await files(p, o.files, o.onProgress);
      await need<Promise<unknown>>(C(), 'publish', p.pack, p.meta, { files: fl, onProgress: up(o.onProgress) });
    },
    unpublish: async id => {
      await need<Promise<unknown>>(C(), 'unpublish', id);
    },
    send: async (p0, o) => {
      const p = prepOf(p0);
      const fl = await files(p, o.files, o.onProgress);
      await need<Promise<unknown>>(C(), 'shareWith', o.email, p.pack, p.meta, o.message, { files: fl, onProgress: up(o.onProgress) });
    },
    sent: async id => {
      const all = (await call<Promise<Any[] | null>>(C(), 'outgoingShares')?.catch(() => null)) ?? [];
      const rows = all.filter(r => r['subject_id'] === id);
      for (const r of rows) sentRows.set(str(r['id']), r);
      return rows.map(r => ({ id: str(r['id']), to_email: str(r['to_email']), status: str(r['status']) }));
    },
    withdraw: async shareId => {
      const paths = obj(sentRows.get(shareId)?.['meta'])?.['filePaths'];
      await need<Promise<unknown>>(C(), 'revokeShare', shareId, Array.isArray(paths) ? paths : []);
    },
    download: p0 => {
      void need<unknown>(APP(), 'exportPackage', acc(), prepOf(p0).pack);
    },
  };
}
