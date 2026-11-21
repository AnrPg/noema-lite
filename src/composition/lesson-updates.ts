/**
 * 💬→📖 The lazy piece build/lesson-updates.js (docs/LESSON_UPDATES.md; NoemaShell.lessonUpdates runs it the first time:
 * src/composition/lesson-updates-door.ts): a chat with the tutor used to improve one of the learner's own lessons. The
 * service (src/features/lesson-updates/application) and its windows over the page of today:
 *
 *   the requests and the proposals' cards   synced rows a:lessonreq:<id> (written here) and a:lessonup:<id> (the connector's),
 *                                           read from this device (NoemaCore.storage.kv), written through Noema.kv
 *   the chat, its files, the proposal       the account's cloud folder updates/<id>/ (NoemaCloud.uploadObject / downloadObject)
 *   the lesson                              the stored pack (Noema.idb 'packs', never the open page's extended copy), its
 *                                           translations (Noema.app.inlineTranslations) and its 文A bridges (NoemaCore.bridges)
 *   saving                                  Noema.importPack (translations in their own files, the cloud, the steps that
 *                                           follow the subject), then each bridge that grew (NoemaCore.bridges.attach)
 *   the checks                              NoemaCore.content (after NoemaCore.contracts.ready())
 *   this device's copies                    IndexedDB noema-lessonupdates (the lesson before an update, a local chat)
 *
 *   send(record, { subject, chapter })   "Use this chat in a lesson" (the tutor's ⋮, Me › Conversations)
 *   review(id)                           the proposal's window (the 🔔 row's Review)
 *   decline(id)                          the 🔔 row's ✕
 */
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { pairOf } from '../features/bridges/domain/lookup.ts';
import type { Base, ChatRecord, Checks } from '../features/lesson-updates/domain/index.ts';
import { createLessonUpdates, type LessonPorts, type OwnSubject } from '../features/lesson-updates/application/service.ts';
import { openReview, openSend, type LessonUiDeps } from '../features/lesson-updates/ui/screens.ts';
import { call, need, obj, str, type Any } from './community-host.ts';
import { mdElement } from './tutor-page.ts';

const P = 'noema1:';
type Win = Window & Readonly<Record<string, unknown>>;

/** one small store of this device (the lesson before an update: Undo works offline) */
function deviceStore(name: string): { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void> } {
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (db ??= new Promise((res, rej) => {
      const q = indexedDB.open(name, 1);
      q.onupgradeneeded = () => q.result.createObjectStore('kept');
      q.onsuccess = () => {
        res(q.result);
      };
      q.onerror = () => {
        rej(q.error ?? new Error(name));
      };
    }));
  const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    open().then(
      d =>
        new Promise<T>((res, rej) => {
          const r = f(d.transaction('kept', mode).objectStore('kept'));
          r.onsuccess = () => {
            res(r.result as T);
          };
          r.onerror = () => {
            rej(r.error ?? new Error(name));
          };
        }),
    );
  return {
    get: k => run<unknown>('readonly', s => s.get(k)),
    put: async (k, v) => {
      await run('readwrite', s => s.put(v, k));
    },
  };
}

/** a file the learner attached in the tutor (IndexedDB noema-attachments, written by the tutor's composer), when it is there */
async function attachmentOf(acc: string, id: string): Promise<{ name: string; mediaType: string; bytes: Uint8Array } | null> {
  const f = indexedDB as IDBFactory & { databases?: IDBFactory['databases'] | undefined };
  // never opened when it does not exist: opening would make an empty database the tutor then could not set up
  if (typeof f.databases !== 'function' || !(await f.databases()).some(d => d.name === 'noema-attachments')) return null;
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const q = indexedDB.open('noema-attachments');
    q.onsuccess = () => {
      res(q.result);
    };
    q.onerror = () => {
      rej(q.error ?? new Error('noema-attachments'));
    };
  });
  try {
    if (!db.objectStoreNames.contains('files')) return null;
    const v = await new Promise<unknown>((res, rej) => {
      const r = db.transaction('files', 'readonly').objectStore('files').get(`${acc}|${id}`);
      r.onsuccess = () => {
        res(r.result);
      };
      r.onerror = () => {
        rej(r.error ?? new Error('noema-attachments'));
      };
    });
    const o = obj(v);
    if (!o) return null;
    const raw = o['bytes'] ?? o['blob'] ?? o['data'];
    const bytes =
      raw instanceof Blob
        ? new Uint8Array(await raw.arrayBuffer())
        : raw instanceof ArrayBuffer
          ? new Uint8Array(raw)
          : raw instanceof Uint8Array
            ? raw
            : null;
    if (!bytes) return null;
    return {
      name: str(o['name']) || id,
      mediaType: str(o['mediaType']) || (raw instanceof Blob ? raw.type : '') || 'application/octet-stream',
      bytes,
    };
  } finally {
    db.close();
  }
}

/** what build/lesson-updates.js hands over (src/composition/lesson-updates-door.ts runs it the first time) */
export interface LessonUpdatesPiece {
  send(record: ChatRecord, ctx?: { readonly subject?: string | null; readonly chapter?: string | null }): void;
  review(id: string): void;
  decline(id: string): void;
}

export function lessonUpdatesPiece(win: Win = globalThis as unknown as Win): LessonUpdatesPiece {
  const g = (name: string): Any | null => obj(win[name]);
  const N = (): Any | null => g('Noema');
  const core = (): Any | null => g('NoemaCore');
  const cloud = (): Any | null => g('NoemaCloud');
  const i18n = noemaI18n();
  const acc = (): string | null => str(obj(N()?.['account'])?.['id']) || str(obj(N()?.['kv'])?.['acc']) || null;
  const signedIn = (a: string | null): boolean => {
    const s = obj(call<unknown>(cloud(), 'session'));
    return !!a && !!s && a === 'u_' + str(obj(s['user'])?.['id']);
  };
  const kv = (): Any | null => obj(obj(core()?.['storage'])?.['kv']);
  const keyOf = (a: string, name: string): string => `${P}${a}:${name}`;
  const getText = (k: string): string | null => {
    const v = call<unknown>(kv(), 'get', k);
    return typeof v === 'string' ? v : null;
  };
  const report = (e: unknown, where: string): void => {
    call(obj(core()?.['errors']), 'report', e, { where, severity: 'warning' });
  };
  const store = deviceStore('noema-lessonupdates');
  const app = (): Any | null => obj(N()?.['app']);

  /** the pack as it is stored (a copy: the gate and the apply never touch the page's objects) */
  async function storedPack(a: string, id: string): Promise<Record<string, unknown> | null> {
    const idb = obj(N()?.['idb']);
    let p: unknown = await (call<Promise<unknown>>(idb, 'get', 'packs', `${a}|${id}`) ?? Promise.resolve(null)).catch(() => null);
    p ??= await (call<Promise<unknown>>(N(), 'loadSubject', a, id) ?? Promise.resolve(null)).catch(() => null);
    return obj(p) ? (structuredClone(p) as Record<string, unknown>) : null;
  }
  async function ownMetas(a: string): Promise<Any[]> {
    const all = (await (call<Promise<unknown[]>>(N(), 'subjectsFor', a) ?? Promise.resolve([])).catch(() => [])).map(obj);
    return all.filter((m): m is Any => !!m && m['origin'] === 'imported' && m['kind'] !== 'language' && !str(m['id']).startsWith('lang:'));
  }

  const ports: LessonPorts = {
    account: () => {
      const a = acc();
      return a ? { id: a, cloud: signedIn(a) } : null;
    },
    now: () => Date.now(),
    unique: () => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10),
    read: name => {
      const a = acc();
      return a ? getText(keyOf(a, name)) : null;
    },
    write: (name, value) => {
      const a = acc();
      if (!a) return;
      const k = keyOf(a, name),
        t = JSON.stringify(value);
      const nkv = obj(N()?.['kv']);
      if (nkv && typeof nkv['set'] === 'function')
        call(nkv, 'set', k, t); // marked for the sync
      else call(kv(), 'set', k, t);
    },
    keys: prefix => {
      const a = acc();
      if (!a) return [];
      const head = keyOf(a, '');
      const ks = call<unknown>(kv(), 'keys', head + prefix);
      return Array.isArray(ks) ? ks.filter((k): k is string => typeof k === 'string').map(k => k.slice(head.length)) : [];
    },
    upload: async (path, body, type) => {
      const blob = typeof body === 'string' ? new Blob([body], { type }) : body;
      const C = cloud();
      if (!C || typeof C['uploadObject'] !== 'function') throw new Error('NoemaCloud.uploadObject is missing');
      await call<Promise<unknown>>(C, 'uploadObject', path, blob, type);
    },
    download: async path => {
      const res = obj(await (call<Promise<unknown>>(cloud(), 'downloadObject', path) ?? Promise.resolve(null)));
      return res ? await (call<Promise<unknown>>(res, 'json') ?? Promise.resolve(null)) : null;
    },
    subjects: async () => {
      const a = acc();
      if (!a) return [];
      const out: OwnSubject[] = [];
      for (const m of await ownMetas(a)) {
        const p = await storedPack(a, str(m['id']));
        const chapters = (Array.isArray(p?.['chapters']) ? (p['chapters'] as unknown[]) : []).map(obj).filter((c): c is Any => !!c);
        if (!p || !chapters.length) continue;
        out.push({
          id: str(m['id']),
          title: str(m['title']) || str(obj(p['subject'])?.['title']) || str(m['id']),
          language: str(obj(p['subject'])?.['language']) || 'en',
          chapters: chapters.map(c => ({ id: str(c['id']), title: str(c['title']) || str(c['id']) })),
        });
      }
      return out;
    },
    lesson: async sid => {
      const a = acc();
      if (!a) return null;
      const meta = (await ownMetas(a)).find(m => m['id'] === sid);
      const pack = meta ? await storedPack(a, sid) : null;
      if (!meta || !pack) return null; // only the learner's own lessons change
      const subj = obj(pack['subject']) ?? {};
      const own = str(subj['language']) || 'en';
      const inl =
        obj(await (call<Promise<unknown>>(app(), 'inlineTranslations', a, meta, pack) ?? Promise.resolve(pack)).catch(() => pack)) ?? pack;
      const translations: Record<string, Record<string, unknown>> = {};
      for (const [loc, t] of Object.entries(obj(inl['translations']) ?? {})) {
        const ch = obj(t)?.['chapters'];
        if (Array.isArray(ch))
          translations[loc] = {
            format: 'noema-translation',
            v: 1,
            pack: sid,
            locale: loc,
            source: own,
            version: pack['version'] ?? null,
            chapters: ch,
          };
      }
      const bridges: Record<string, Record<string, unknown>> = {};
      let index: Any | null = null;
      try {
        index = obj(obj(JSON.parse(getText(keyOf(a, 'a:bridges')) ?? 'null'))?.[sid]);
      } catch {
        index = null; // an unreadable index: no bridges (they are not changed then)
      }
      const B = obj(core()?.['bridges']);
      for (const pk of Object.keys(index ?? {})) {
        const { src, nat } = pairOf(pk, own);
        const b = obj(await (call<Promise<unknown>>(B, 'load', a, sid, nat, src, own) ?? Promise.resolve(null)).catch(() => null));
        if (b) bridges[pk] = structuredClone(b);
      }
      const base: Base = { pack, translations, bridges };
      return base;
    },
    save: async (sid, r, version) => {
      const a = acc();
      if (!a) throw new Error('no account');
      const pm = obj(JSON.parse(getText(keyOf(a, 'a:packmeta:' + sid)) ?? 'null')) ?? {};
      // what the subject's card says beside the pack (its Roadmap step, where it came from) stays; the rest is the pack's
      const extra: Record<string, unknown> = {};
      const subjKeys = new Set(Object.keys(obj(r.pack['subject']) ?? {}));
      for (const [k, v] of Object.entries(pm))
        if (!subjKeys.has(k) && !['counts', 'version', 'contentLocales', 'i18n'].includes(k)) extra[k] = v;
      const translations: Record<string, unknown> = {};
      for (const [loc, f] of Object.entries(r.translations)) translations[loc] = { chapters: f['chapters'] };
      const pack: Record<string, unknown> = { ...r.pack, version, ...(Object.keys(translations).length ? { translations } : {}) };
      delete pack['counts']; // counted again
      await need(N(), 'importPack', a, pack, { ...extra, lessonUpdate: version });
      const cache = obj(win['NOEMA_PACKS']);
      if (cache) Reflect.deleteProperty(cache, sid); // the next read is the new version
      const B = obj(core()?.['bridges']);
      for (const b of Object.values(r.bridges))
        await (call<Promise<unknown>>(B, 'attach', a, b) ?? Promise.resolve()).catch((e: unknown) => {
          report(e, 'lessonup.bridge');
        });
    },
    checks: async () => {
      await (call<Promise<unknown>>(obj(core()?.['contracts']), 'ready') ?? Promise.resolve());
      const C = obj(core()?.['content']);
      if (!C) throw new Error('NoemaCore.content is missing');
      const checks: Checks = {
        checkPack: (p, id, o) => need(C, 'checkPack', p, id, o ?? {}),
        checkTranslation: (t, p) => need(C, 'checkTranslation', t, p),
        checkBridge: (b, p) => need(C, 'checkBridge', b, p),
      };
      return checks;
    },
    attachment: async id => {
      const a = acc();
      return a ? attachmentOf(a, id).catch(() => null) : null;
    },
    keep: (k, v) => store.put(`${acc() ?? ''}|${k}`, v),
    kept: k => store.get(`${acc() ?? ''}|${k}`).catch(() => null),
  };
  const svc = createLessonUpdates(ports);

  const toast = (t: string): void => {
    call(N(), 'toast', t, 4000);
  };
  const deps: LessonUiDeps = {
    svc,
    i18n,
    md: text => mdElement(text, i18n, toast),
    copy: async text => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false; // no clipboard here (an insecure page, a refusal): the learner is told
      }
    },
    notify: toast,
    overlay: el => {
      document.body.append(el);
      const off = (): void => {
        el.remove();
      };
      return off;
    },
    cloud: () => signedIn(acc()),
    tutorName: () => str(obj(call<unknown>(g('NoemaThemes'), 'tutor'))?.['n']) || i18n.t('lu.tutor'),
    learnerName: () => str(obj(N()?.['account'])?.['name']) || i18n.t('lu.you'),
    refresh: sid => {
      call(obj(N()?.['notes']), 'local');
      if (str(obj(N()?.['subject'])?.['id']) === sid) location.reload(); // the open lesson shows the new version
    },
  };

  const piece: LessonUpdatesPiece = {
    send: (record, ctx) => {
      void openSend(deps, { record, subject: ctx?.subject ?? null, chapter: ctx?.chapter ?? null }).catch((e: unknown) => {
        report(e, 'lessonup.send');
        toast(i18n.t('lu.err.invalid'));
      });
    },
    review: id => {
      void openReview(deps, id).catch((e: unknown) => {
        report(e, 'lessonup.review');
        toast(i18n.t('lu.err.invalid'));
      });
    },
    decline: id => {
      const r = svc.decline(id);
      call(obj(N()?.['notes']), 'local');
      if (r.ok) toast(i18n.t('lu.declined', { chapter: r.value.chapter.title }));
    },
  };
  return Object.freeze(piece);
}
