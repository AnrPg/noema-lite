/* h5p@1: an ordinary .h5p package (docs/INTERACTIVE_H5P.md, docs/adr/001 D11) — a quiz, drag and drop, fill in the blanks… played
   by the app's own pinned H5P player (h5p-standalone 3.8.2's core, engine/vendor/h5p/3.8.2/player.js, loaded through host.asset,
   never from h5p.org) in exactly the frames of html-app@1 (doc.ts). The frame never fetches anything: the HOST page reads the
   package (inline base64, bytes, a loader function, or a URL it fetches itself), checks its sha256, unzips it and checks it against
   the allow-list (check.ts: the rules the content checks use too) and builds the frame's document. Right after the handshake it
   hands over the content's files (transferred ArrayBuffers), then init.
   act (a registry item, runtime 'h5p@1'):
     h5p          the .h5p file: a base64 string (or { data: base64 }), an ArrayBuffer / Uint8Array / Blob, a function returning one of
                  these (or a promise), or { url, sha256 } — fetched by this page, never by the frame
     sha256       hex sha256 of the .h5p file (required for { url }; checked whenever given)
     h5pByLocale  { <locale>: { content: <content.json>, l10n?: {…H5P core strings} } | { h5p: <source>, sha256 } } — the item in the
                  language the pack is shown in (init.locale); without one the package's own content.json plays
   Failures go to onFail with a code: integrity, h5p-check, zip, size, player, fetch, nosource, unsupported, navigated, build. */
import type {
  ActivityInit,
  ActivityItem,
  ActivityRuntime,
  MountContext,
  ProtocolMessage,
  RuntimeHost,
  RuntimeModule,
  RuntimePort,
} from '../types.ts';
import { check, H5P_CHECKS, H5PError, isObj, PLAYER_VERSION, RUNTIME, unzip, type Files, type H5PReport } from './check.ts';
import { buildDoc, FRAME_ALLOW, isPlayer, type H5PPlayer, type Media, type Prepared } from './doc.ts';

/* i18n-ignore-start */ // code and protocol names

const fail = (code: string, msg?: string): H5PError => new H5PError(code, msg);
const hexOf = (n: number): string => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

/* ---------- reading the source of a package (the host page does it; the frame never fetches) ---------- */
const hex = async (u8: Uint8Array): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8 as Uint8Array<ArrayBuffer>)), b =>
    b.toString(16).padStart(2, '0'),
  ).join('');
function b64(v: unknown): Uint8Array {
  const s = String(v)
    .replace(/^data:[^,]*;base64,/, '')
    .replace(/\s+/g, '');
  const bin = atob(s),
    u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function bytesOf(src: unknown, depth = 0): Promise<Uint8Array> {
  if (src == null) throw fail('nosource', 'act.h5p is missing');
  if (typeof src === 'function' && depth < 2) return bytesOf(await (src as () => unknown)(), depth + 1);
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (typeof Blob !== 'undefined' && src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
  if (typeof src === 'string') return b64(src);
  if (isObj(src) && typeof src.data === 'string') return b64(src.data);
  if (isObj(src) && typeof src.url === 'string') {
    if (!src.sha256) throw fail('integrity', 'a package by URL needs its sha256');
    const r = await fetch(src.url, { credentials: 'same-origin', cache: 'force-cache' });
    if (!r.ok) throw fail('fetch', 'HTTP ' + String(r.status));
    return new Uint8Array(await r.arrayBuffer());
  }
  throw fail('nosource', 'act.h5p has an unknown shape');
}

/** a package read and checked once */
export interface Loaded {
  readonly sha256: string;
  readonly files: Files;
  readonly check: H5PReport;
}
/** sha256 → the package (the last few, so Restart is quick) */
export const CACHE = new Map<string, Loaded>();
export async function load(src: unknown, want?: unknown): Promise<Loaded> {
  const u8 = await bytesOf(src),
    sum = await hex(u8);
  const w = want || (isObj(src) && src.sha256) || null;
  if (w && sum !== (typeof w === 'string' ? w.toLowerCase() : null)) throw fail('integrity', 'sha256 mismatch');
  const had = CACHE.get(sum);
  if (had) {
    CACHE.delete(sum);
    CACHE.set(sum, had);
    return had;
  }
  const files = await unzip(u8),
    v: Loaded = { sha256: sum, files, check: check(files) };
  CACHE.set(sum, v);
  while (CACHE.size > 3) {
    const k = CACHE.keys().next().value;
    if (k === undefined) break;
    CACHE.delete(k);
  }
  return v;
}
/** the package for this locale: its own, another package (h5pByLocale[loc].h5p), or its own with another content.json */
export async function prepare(
  act: ActivityItem,
  locale: unknown,
  warn: (...w: readonly unknown[]) => void = () => undefined,
): Promise<Prepared> {
  const by = act.h5pByLocale,
    alt = isObj(by) && typeof locale === 'string' && Object.prototype.hasOwnProperty.call(by, locale) ? by[locale] : null;
  const A = isObj(alt) ? alt : null;
  const pkg = A && A.h5p != null ? await load(A.h5p, A.sha256) : await load(act.h5p, act.sha256);
  let c = pkg.check,
    files = pkg.files;
  if (A && isObj(A.content) && A.h5p == null) {
    files = Object.assign({}, files, { 'content/content.json': new TextEncoder().encode(JSON.stringify(A.content)) });
    c = check(files);
  }
  if (c.errors.length) {
    warn('[noema] h5p', act.id, c.errors.slice(0, 5));
    throw fail('h5p-check', c.errors[0]);
  }
  return { files, check: c, l10n: A && isObj(A.l10n) ? A.l10n : null, sha256: pkg.sha256 };
}

/* ---------- the player (the app's own file, host.asset; a script tag, so it works from file:// as well) ---------- */
const pageScope = globalThis as { NoemaH5PPlayer?: unknown };
let playerP: Promise<H5PPlayer> | null = null;
/** the player's core: the one the page has (the one-file bundle defines it inline), else its script loaded once */
function player(host: RuntimeHost): Promise<H5PPlayer> {
  const have = pageScope.NoemaH5PPlayer;
  if (isPlayer(have)) return Promise.resolve(have);
  return (playerP ??= new Promise<H5PPlayer>((res, rej) => {
    const url = host.config('h5pPlayer');
    const s = document.createElement('script');
    s.src = typeof url === 'string' && url ? url : host.asset(`vendor/h5p/${PLAYER_VERSION}/player.js`);
    s.async = true;
    s.onload = () => {
      const p = pageScope.NoemaH5PPlayer;
      if (isPlayer(p)) res(p);
      else {
        playerP = null;
        rej(fail('player', 'player.js defined nothing'));
      }
    };
    s.onerror = () => {
      playerP = null;
      rej(fail('player', 'player.js did not load'));
    };
    document.head.append(s);
  }));
}

export function createH5PRuntime(host: RuntimeHost): ActivityRuntime {
  /** the same contract as html-app@1 → port { send(type, payload, extra), close() } */
  function mount(box: HTMLElement, ctx: MountContext): RuntimePort {
    const { act, title } = ctx,
      init: ActivityInit = ctx.init ?? {};
    const nonce = hexOf(16);
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts'); // exactly this token: never allow-same-origin
    frame.setAttribute('allow', FRAME_ALLOW);
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', title);
    frame.className = 'act-frame';
    let ch: MessageChannel | null = null,
      closed = false,
      loads = 0,
      media: readonly Media[] = [];
    const pending: ProtocolMessage[] = [];
    const isClosed = (): boolean => closed; // (set by close() while the document is built)
    function hello(e: MessageEvent<unknown>): void {
      let app: Window | null = null; // the item's window, inside the wrapper
      try {
        app = frame.contentWindow?.frames[0] ?? null;
      } catch {
        app = null;
      }
      if (closed || ch || !app || e.source !== app) return;
      const d = e.data as { t?: unknown; nonce?: unknown } | null;
      if (!d || d.t !== 'hello' || d.nonce !== nonce) return;
      removeEventListener('message', hello);
      const c = (ch = new MessageChannel());
      c.port1.onmessage = (m: MessageEvent<unknown>) => {
        if (!closed) ctx.onMessage(m.data as ProtocolMessage);
      };
      app.postMessage({ t: 'welcome', nonce }, '*', [c.port2]);
      const fl = media.map(f => ({ path: f.path, type: f.type, buf: f.bytes.slice().buffer })); // copies: the cached package keeps its bytes
      c.port1.postMessage(
        { p: 'noema.h5p', type: 'files', files: fl },
        fl.map(f => f.buf),
      );
      c.port1.postMessage(host.message('init', init));
      for (const m of pending.splice(0)) c.port1.postMessage(m);
    }
    const port: RuntimePort = {
      send(type, payload, extra) {
        const m = host.message(
          type,
          payload as Readonly<Record<string, unknown>> | undefined,
          extra as Readonly<Record<string, unknown>> | undefined,
        );
        if (ch) ch.port1.postMessage(m);
        else pending.push(m);
      },
      close() {
        closed = true;
        removeEventListener('message', hello);
        ch?.port1.close();
        frame.remove();
      },
    };
    addEventListener('message', hello);
    frame.addEventListener('load', () => {
      if (++loads > 1 && !closed) ctx.onFail('navigated'); // a frame that navigates away is stopped at once
    });
    (async () => {
      if (typeof crypto === 'undefined' || !(crypto.subtle as SubtleCrypto | undefined) || typeof DecompressionStream === 'undefined')
        throw fail('unsupported', 'this browser cannot unpack H5P');
      const [core, pkg] = await Promise.all([
        player(host),
        prepare(act, init.locale, (...w) => {
          host.warn(...w);
        }),
      ]);
      if (isClosed()) return;
      const b = await buildDoc(pkg, nonce, act, init, core);
      if (isClosed()) return;
      media = b.media;
      frame.srcdoc = b.doc;
      box.append(frame);
    })().catch((e: unknown) => {
      const code = e instanceof H5PError ? e.code : 'build';
      host.warn('[noema] h5p', act.id, code, e instanceof Error ? e.message : e);
      if (!closed) ctx.onFail(code);
    });
    return port;
  }
  return { id: RUNTIME, version: 1, mount };
}

/** the runtime's pieces for host code and the suites: the rules, the reader, the cache and the document */
export const H5P_API = Object.freeze({ ...H5P_CHECKS, load, prepare, buildDoc, CACHE });

/** the module the registry loads (src/runtimes/plugins.ts) */
const h5pModule: RuntimeModule & { readonly api: typeof H5P_API } = {
  create: host => createH5PRuntime(host),
  api: H5P_API,
};
export default h5pModule;

/* i18n-ignore-end */
