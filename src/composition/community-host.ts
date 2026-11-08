/**
 * The community screens' host (src/features/community/ui/host.ts) over the app of today: the older scripts' globals
 * (window.Noema of engine/loader.js, NoemaShell, NoemaCloud, NoemaCurriculum, NoemaConvos, NoemaThemes, NoemaMT …),
 * read when a screen asks, never at load. This is the one file of the community area that knows those names; the
 * phase-3 shell gives the screens a host over its own services instead.
 */
import type {
  CommunityHost,
  HostAccount,
  HostPack,
  HostRoadmap,
  HostSearchSource,
  HostSession,
  HostSubject,
  NoteItem,
  PublicItem,
  ReportContext,
  ShareHost,
} from '../features/community/ui/host.ts';
import type { MessageParams } from '../ports/i18n.ts';

/* The globals as these calls use them (loosely typed: they are plain scripts). */
type Fn = (...a: never[]) => unknown;
export type Any = Record<string, unknown> & { [k: string]: unknown };
interface Win {
  readonly location: Location;
  readonly history: History;
  readonly document: Document;
  readonly localStorage: Storage;
  readonly addEventListener: Window['addEventListener'];
  readonly [name: string]: unknown;
}
const fn = (o: unknown, name: string): Fn | null => {
  const f = o && typeof o === 'object' ? (o as Any)[name] : undefined;
  return typeof f === 'function' ? (f.bind(o) as Fn) : null;
};
export const obj = (o: unknown): Any | null => (o && typeof o === 'object' ? (o as Any) : null);
export const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
/** a method of an older script's object, called when it is there (its answer is what that script returns) */
type Method = (...a: unknown[]) => unknown;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names what the plain script answers
export const call = <T>(o: unknown, name: string, ...args: unknown[]): T | undefined => {
  const f = fn(o, name) as Method | null;
  return f ? (f(...args) as T) : undefined;
};
/** … and one that must be there */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names what the plain script answers
export const need = <T>(o: unknown, name: string, ...args: unknown[]): T => {
  const f = fn(o, name) as Method | null;
  if (!f) throw new Error(`${name} is not available here`);
  return f(...args) as T;
};

export interface OldAppHostParts {
  /** the ⚑ locator's engine side (report-context.ts) */
  readonly report: ReportContext;
  /** the share dialog's cloud calls */
  readonly share: ShareHost;
}

export function oldAppHost(win: Win, parts: OldAppHostParts): CommunityHost {
  const g = (name: string): Any | null => obj(win[name]);
  const N = (): Any | null => g('Noema');
  const S = (): Any | null => g('NoemaShell');
  const CU = (): Any | null => g('NoemaCurriculum');
  const acc = (): string | null => str(obj(N()?.['account'])?.['id']) || str(obj(N()?.['kv'])?.['acc']) || null;
  const world = (): 'know' | 'lang' | 'both' => {
    const w = call<string>(obj(g('NoemaThemes')), 'world');
    return w === 'lang' || w === 'both' ? w : 'know';
  };
  const lsGet = (k: string): string | null => {
    try {
      return win.localStorage.getItem(k);
    } catch {
      return null; // site data blocked: as if nothing was stored
    }
  };
  const accountKey = (name: string): string => {
    const kv = obj(N()?.['kv']);
    return call<string>(kv, 'accountKey', name) ?? `noema1:${acc() ?? ''}:a:${name}`;
  };
  const isLangSubj = (s: HostSubject): boolean => s.kind === 'language' || s.id.startsWith('lang:');

  /** where every record of the search comes from: the subjects' packs, the Roadmaps, the language courses, the conversations */
  async function searchSources(): Promise<HostSearchSource[]> {
    const a = acc(),
      w = world(),
      out: HostSearchSource[] = [];
    const n = N();
    if (!a || !n) return out;
    if (w !== 'lang') {
      const subs = (
        (await (call<Promise<HostSubject[]>>(n, 'subjectsFor', a) ?? Promise.resolve([])).catch(() => [])) as HostSubject[]
      ).filter(s => !isLangSubj(s) && !s.hidden);
      for (const s of subs)
        out.push({
          key: 'pack:' + s.id,
          label: s.title || s.id,
          sig: [str(s['version']), str(s['updated']), JSON.stringify(s['counts'] ?? {}), s.title || '', s.description ?? ''].join('|'),
          input: async () => {
            const packs = obj(win['NOEMA_PACKS']);
            const had = !!packs?.[s.id];
            const p = await need<Promise<unknown>>(n, 'loadSubject', a, s.id);
            const open = obj(obj(obj(n['pack'])?.['subject']))?.['id'];
            if (!had && packs && open !== s.id) Reflect.deleteProperty(packs, s.id); // read once; the page keeps only the subject studied
            return { kind: 'pack', data: p, meta: s };
          },
        });
      for (const c of call<Any[]>(CU(), 'list', a) ?? [])
        out.push({
          key: 'cur:' + str(c['id']),
          label: str(c['title']) || str(c['goal']) || str(c['id']),
          sig: str(c['updated']),
          input: () => Promise.resolve({ kind: 'curriculum', data: call<unknown>(CU(), 'get', a, c['id']) ?? c }),
        });
    }
    if (w !== 'know' && fn(n, 'langCourses')) {
      const reg = obj(win['NOEMA_REGISTRY']);
      const hash36 = (s: string): string => call<string>(obj(obj(win['NoemaCore'])?.['catalog']), 'hash36', s) ?? String(s.length);
      for (const m of call<Any[]>(n, 'langCourses') ?? []) {
        const id = str(m['courseId']);
        const own = m['account'] ? (lsGet(`noema1:${a}:a:langcourse:${id}`) ?? '') : '';
        out.push({
          key: 'lang:' + id,
          label: str(m['title']) || id,
          sig: [str(m['version']), str(m['path']), str(reg?.['builtAt']), own ? hash36(own) : ''].join('|'),
          input: async () => ({ kind: 'lang', data: await need<Promise<unknown>>(n, 'langData', m), meta: m }),
        });
      }
    }
    const cv = g('NoemaConvos');
    const all = cv ? ((await (call<Promise<Any[]>>(cv, 'list', a) ?? Promise.resolve([])).catch(() => [])) as Any[]) : [];
    const live = all.filter(
      r => !r['deleted'] && Array.isArray(r['messages']) && r['messages'].length && (!r['kind'] || r['kind'] === 'tutor'),
    );
    const t = (k: string): string => call<string>(S(), 'L', k) ?? k;
    out.push({
      key: 'convos',
      label: t('sr_t_convo'),
      sig:
        String(live.length) +
        '|' +
        live.reduce((m, r) => (str(r['updatedAt']) > m ? str(r['updatedAt']) : m), '') +
        '|' +
        String(live.map(r => str(r['title'])).join('').length),
      input: () => Promise.resolve({ kind: 'convos', data: live }),
    });
    return out;
  }

  const host: CommunityHost = {
    /* ---------- the address ---------- */
    hash: () => win.location.hash,
    go: hash => {
      if (fn(S(), 'go')) call(S(), 'go', hash);
      else win.location.hash = hash;
    },
    replace: hash => {
      const l = win.location;
      win.history.replaceState(win.history.state, '', l.pathname + l.search + hash);
    },
    link: hash => win.location.origin + win.location.pathname + hash,
    // where a page under prefix was opened from: the frame keeps every address of the page (this piece may load later)
    outside: prefix => call<string>(S(), 'outside', prefix) ?? '',

    /* ---------- the account ---------- */
    account: () => {
      const a = obj(N()?.['account']);
      const id = acc();
      if (!id) return null;
      const r: HostAccount = {
        id,
        kind: a?.['kind'] === 'cloud' ? 'cloud' : 'local',
        ...(str(a?.['name']) ? { name: str(a?.['name']) } : {}),
        ...(str(a?.['emoji']) ? { emoji: str(a?.['emoji']) } : {}),
      };
      return r;
    },
    session: () => {
      const s = obj(call<unknown>(g('NoemaCloud'), 'session'));
      const user = obj(s?.['user']);
      const id = str(user?.['id']) || str(s?.['userId']);
      if (!id) return null;
      const r: HostSession = { userId: id, ...(str(user?.['email']) ? { email: str(user?.['email']) } : {}) };
      return r;
    },
    signIn: () => {
      void call<Promise<unknown>>(N(), 'openAccountPicker');
    },
    world,
    getAccountSetting: name => lsGet(accountKey(name)),
    setAccountSetting: (name, value) => {
      const kv = obj(N()?.['kv']);
      if (fn(kv, 'set')) call(kv, 'set', accountKey(name), value);
      else win.localStorage.setItem(accountKey(name), value); // (engine/loader.js is always there in the app: its kv syncs it)
    },

    /* ---------- the frame ---------- */
    overlay: el => {
      win.document.body.append(el);
      return () => {
        el.remove();
      };
    },
    face: mood => {
      const f = call<unknown>(S(), 'faceEl', undefined, mood ?? 'breathe');
      return f instanceof HTMLElement ? f : null;
    },
    word: (key: string, params?: MessageParams) => {
      const i18n = g('NoemaI18n');
      return call<string>(i18n, 't', key, params) ?? key;
    },

    /* ---------- the learner's subjects and Roadmaps ---------- */
    subjects: async () => {
      const a = acc();
      if (!a) return [];
      return ((await call<Promise<HostSubject[]>>(N(), 'subjectsFor', a)) ?? []).filter(s => !s.hidden);
    },
    loadSubject: async id => {
      const a = acc();
      if (!a) return null;
      return (await need<Promise<HostPack | null>>(N(), 'loadSubject', a, id)) ?? null;
    },
    importPack: (pack, meta) => need<Promise<HostSubject>>(N(), 'importPack', acc(), pack, meta),
    openSubject: (id, hash) => {
      if (fn(S(), 'open')) call(S(), 'open', id, hash);
      else call(N(), 'pickSubject', acc(), id);
    },
    openSubjectId: () => {
      if (!S()?.['engine']) return null;
      return str(obj(N()?.['subject'])?.['id']) || null;
    },
    roadmaps: () => call<HostRoadmap[]>(CU(), 'list', acc()) ?? [],
    roadmap: id => call<HostRoadmap | null>(CU(), 'get', acc(), id) ?? null,
    publishRoadmap: async (id, o) => {
      await need<Promise<unknown>>(g('NoemaCurShare'), 'publish', acc(), id, { isPublic: o.isPublic });
    },
    joinRoadmap: async (id, o) => {
      await need<Promise<unknown>>(g('NoemaCurShare'), 'join', acc(), id, { viaRoom: o.viaRoom });
    },
    fromSources: files => {
      call(N(), 'fromSources', acc(), { files: [...files] });
    },
    pdfPages: async file => {
      try {
        const r = await call<Promise<{ pageCount?: number }>>(g('NoemaViewer'), 'extract', file, file.name, {
          maxPages: 1,
          outline: false,
        });
        return typeof r?.pageCount === 'number' ? r.pageCount : null;
      } catch {
        return null; // a PDF the reader cannot open: its pages stay unknown
      }
    },
    publicPage: async userId => obj(await call<Promise<unknown>>(g('NoemaCloud'), 'publicPage', userId)),

    /* ---------- the search ---------- */
    searchSources,
    // the learning log's fold (null: no progress, or another account)
    subjectStatus: id => obj(call<unknown>(obj(g('NoemaCore'))?.['learning'], 'progressOf', acc(), id)) ?? null,
    roadmapPacks: id => {
      const c = obj(call<unknown>(CU(), 'get', acc(), id));
      return Object.values(obj(c?.['nodes']) ?? {})
        .map(n => str(obj(obj(n)?.['pack'])?.['id']))
        .filter(Boolean);
    },
    openConversation: id => {
      call(S(), 'convos', id);
    },

    /* ---------- Explore and sharing ---------- */
    publicSubjects: async () => {
      const r = obj(await call<Promise<unknown>>(N(), 'publicSubjects'));
      const all = r?.['all'];
      return Array.isArray(all) ? (all as PublicItem[]) : [];
    },
    studyPublic: async item => {
      await need<Promise<unknown>>(N(), 'studyPublic', item);
    },
    // 🌍 the public Roadmaps (engine/curshare.js explore), each with its domain and whether it is on this device (mine or joined)
    publicRoadmaps: async () => {
      const a = acc() ?? '',
        me = str(obj(obj(call<unknown>(g('NoemaCloud'), 'session'))?.['user'])?.['id']);
      const rows = ((await call<Promise<Any[] | null>>(g('NoemaCurShare'), 'explore')) ?? []).map(obj).filter(x => x !== null);
      return rows.map((x): PublicItem => {
        const have = obj(call<unknown>(CU(), 'get', a, x['id'])),
          meta = obj(x['meta']),
          counts = obj(meta?.['counts']);
        const domain = call<string>(CU(), 'domainOf', { title: x['title'], description: x['description'], domain: meta?.['domain'] });
        return {
          ...(x as unknown as PublicItem),
          ...(domain ? { domain } : {}),
          steps: Number(counts?.['steps']) || 0,
          prepared: Number(x['prepared']) || 0,
          have: !!have,
          own: (!!have && obj(have['shared'])?.['role'] !== 'member') || (!!me && me === str(x['owner'])),
        };
      });
    },
    // open it: its map when it is on this device already, otherwise join it first (that needs a cloud account)
    openPublicRoadmap: async item => {
      const a = acc() ?? '',
        open = (): void => {
          host.go('#/map/' + encodeURIComponent(item.id));
        };
      if (call<unknown>(CU(), 'get', a, item.id)) {
        open();
        return;
      }
      const me = str(obj(obj(call<unknown>(g('NoemaCloud'), 'session'))?.['user'])?.['id']);
      if (!me || a !== 'u_' + me) throw new Error(host.word('sh.joinNeedsCloud'));
      const c = obj(await need<Promise<unknown>>(g('NoemaCurShare'), 'join', a, item.id));
      const title = str(c?.['title']) || str(c?.['goal']);
      call(N(), 'toast', host.word('sh.joinedRm', { title }), 4000);
      open();
    },
    domains: () => {
      const d = CU()?.['DOMAINS'];
      return Array.isArray(d) ? d.map(str) : [];
    },
    langTag: item => {
      const t = call<unknown>(N(), 'langTag', item);
      return t instanceof HTMLElement ? t : null;
    },
    translatable: (el, o) => {
      call(g('NoemaMT'), 'mark', el, o);
    },
    translateBar: scope => {
      const t = call<unknown>(g('NoemaMT'), 'bar', acc(), scope);
      return t instanceof HTMLElement ? t : null;
    },
    share: parts.share,
    notes: {
      pending: () => {
        const l = obj(N()?.['notes'])?.['pending'];
        return Array.isArray(l) ? (l as NoteItem[]) : [];
      },
      on: f => {
        const notes = obj(N()?.['notes']),
          list = notes?.['listeners'];
        if (!notes || !Array.isArray(list)) return () => undefined;
        const g2 = (l: readonly NoteItem[]): void => {
          f(l);
        };
        call(notes, 'on', g2);
        return () => {
          const i = list.indexOf(g2);
          if (i >= 0) list.splice(i, 1);
        };
      },
      open: s => {
        const framed = S()?.['mounted'] === true; // the classic screens open them their own way
        if (s.kind === 'curriculum') {
          if (framed) host.go('#/map/' + encodeURIComponent(s.curriculum ?? ''));
          else call(N(), 'curriculumMap', s.curriculum);
        } else if (s.id) {
          if (framed) host.openSubject(s.id);
          else call(N(), 'switchTo', acc(), s.id);
        }
      },
      accept: async item => {
        const r = await need<Promise<unknown>>(obj(N()?.['notes']), 'accept', item);
        call(obj(N()?.['app']), 'dropSubjects'); // the shelf counts it at once
        return r;
      },
      reject: async item => {
        await need<Promise<unknown>>(obj(N()?.['notes']), 'reject', item);
      },
      update: async (item, take) => {
        await need<Promise<unknown>>(obj(N()?.['notes']), 'update', item, take);
      },
      dismiss: id => {
        call(obj(N()?.['notices']), 'dismiss', str(obj(N()?.['notes'])?.['acc']), id);
      },
      clear: () => {
        call(obj(N()?.['notices']), 'clear', str(obj(N()?.['notes'])?.['acc']));
      },
    },
    ago: at => call<string>(obj(g('NoemaI18n')?.['fmt']), 'ago', at) ?? '',

    /* ---------- ⚑ reports ---------- */
    report: parts.report,
  };
  return host;
}
