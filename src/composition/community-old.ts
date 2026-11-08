/**
 * The engine's half of the ⚑ locator over the older scripts (engine/src: the open subject, its pack and locateItem; the
 * build; the character; the catalogs of engine/i18n.js), and the last errors of the page, kept from the start (a report
 * about something broken says what failed). The share dialog's cloud calls are sharing-host.ts.
 */
import type { ReportContext } from '../features/community/ui/host.ts';

type Any = Record<string, unknown>;
const obj = (o: unknown): Any | null => (o && typeof o === 'object' ? (o as Any) : null);
const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
const clip = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};
type Method = (...a: unknown[]) => unknown;
const call = (o: unknown, name: string, ...args: unknown[]): unknown => {
  const f = obj(o)?.[name];
  return typeof f === 'function' ? (f as Method).apply(o, args) : undefined;
};

interface PageError {
  readonly level: string;
  readonly at: string;
  readonly msg: string;
}

/** Keeps the last 15 errors and warnings of the page (console.error / console.warn, uncaught errors, rejections). */
export function captureErrors(win: Window): () => readonly PageError[] {
  const ERRS: PageError[] = [];
  const text = (a: unknown): string =>
    a instanceof Error
      ? a.message + (a.stack ? ' @ ' + (a.stack.split('\n')[1]?.trim() ?? '') : '')
      : typeof a === 'string'
        ? a
        : safeJson(a);
  const note = (level: string, args: readonly unknown[]): void => {
    ERRS.push({ level, at: new Date().toISOString().slice(11, 19), msg: clip(args.map(text).join(' '), 400) });
    if (ERRS.length > 15) ERRS.shift();
  };
  const c = (win as unknown as { console: unknown }).console as Record<'error' | 'warn', (...a: unknown[]) => void>;
  for (const level of ['error', 'warn'] as const) {
    const orig = c[level];
    c[level] = function (this: unknown, ...a: unknown[]) {
      note(level, a);
      orig.apply(this, a);
    };
  }
  win.addEventListener('error', e => {
    note('error', [e.message + (e.filename ? ` (${e.filename.split('/').pop() ?? ''}:${String(e.lineno)}:${String(e.colno)})` : '')]);
  });
  win.addEventListener('unhandledrejection', e => {
    note('error', ['unhandled rejection: ', e.reason instanceof Error ? e.reason : str(e.reason) || safeJson(e.reason)]);
  });
  return () => ERRS;
}
function safeJson(a: unknown): string {
  try {
    return JSON.stringify(a) ?? '';
  } catch {
    return str(a) || typeof a; // a cycle: its kind
  }
}

export function oldAppReportContext(win: Window, errors: () => readonly PageError[]): ReportContext {
  const g = (name: string): Any | null => obj((win as unknown as Any)[name]);
  let lib: Promise<{ domToJpeg(node: Node, options: Readonly<Record<string, unknown>>): Promise<string> }> | null = null;
  return {
    subject: page => {
      const N = g('Noema'),
        S = obj(N?.['subject']),
        P = obj(N?.['pack']),
        M = obj(N?.['subjectMeta']) ?? {};
      const routes = obj(g('NoemaShell')?.['ENGINE_ROUTES']) as { has?: (k: string) => boolean } | null;
      if (!S || !routes?.has?.(page) || S['kind'] === 'language') return null;
      const b = obj(call(g('NoemaBridge'), 'settings'));
      const bridge = b?.['on'] === false ? null : (b?.['native'] ?? b?.['lang'] ?? null);
      const node = obj(N?.['node']);
      return {
        id: S['id'],
        title: clip(str(S['title']), 120),
        origin: M['origin'] ?? null,
        owner: M['owner'] ?? obj(P?.['subject'])?.['owner'] ?? null,
        version: P?.['version'] ?? M['version'] ?? null,
        builtAt: P?.['builtAt'] ?? null,
        packLanguage: str(S['sourceLanguage']) || str(S['language']) || 'en',
        shown: str(S['language']) || 'en',
        translation: S['sourceLanguage'] ? S['language'] : null,
        bridge: typeof bridge === 'string' ? bridge : null,
        curriculum: node ? { id: node['id'], node: node['node'] } : null,
      };
    },
    locate: place => call(obj(g('NoemaShell')?.['engine']), 'locate', place) ?? null,
    given: el => {
      const card = el.closest('.ex') as (Element & { _w?: { given?: () => unknown } }) | null;
      const v = card?._w?.given?.();
      return typeof v === 'string' && v ? v : null;
    },
    app: () => {
      const B = g('NOEMA_BUILD') ?? {},
        loc = win.location;
      return {
        version: g('Noema')?.['version'] ?? null,
        commit: B['commit'] ?? null,
        builtAt: B['builtAt'] ?? null,
        frame: !!g('NoemaShell')?.['mounted'],
        bundle: !!(win as unknown as Any)['NOEMA_BUNDLE'],
        url: loc.protocol === 'file:' ? 'file://' : loc.origin + loc.pathname,
      };
    },
    look: () => {
      const th = g('NoemaThemes');
      return { character: str(call(th, 'current')) || null, world: str(call(th, 'world')) || null };
    },
    catalogs: () => {
      const cats = obj(g('NoemaI18n')?.['catalogs']) ?? {},
        out: Record<string, Readonly<Record<string, unknown>>> = {};
      for (const [loc, c] of Object.entries(cats)) out[loc] = obj(obj(c)?.['m']) ?? obj(c) ?? {};
      return out;
    },
    errors,
    screenshots: () => {
      const have = g('modernScreenshot');
      if (have) return Promise.resolve(have as never);
      return (lib ??= new Promise((resolve, reject) => {
        const doc = win.document,
          s = doc.createElement('script');
        s.src = (str((win as unknown as Any)['NOEMA_ENGINE_BASE']) || 'engine/') + 'vendor/modern-screenshot.umd.js';
        s.onload = () => {
          const m = g('modernScreenshot');
          if (m) resolve(m as never);
          else reject(new Error('no screenshot library'));
        };
        s.onerror = () => {
          lib = null;
          reject(new Error('screenshot library not loaded'));
        };
        doc.head.append(s);
      }));
    },
  };
}
