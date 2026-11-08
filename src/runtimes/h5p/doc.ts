/* The document of an H5P item (h5p@1, docs/INTERACTIVE_H5P.md §3): the frames of html-app@1 — a wrapper without scripts whose
   policy says frame-src 'none' (no self-navigation), and inside it the item in a frame sandboxed with exactly allow-scripts and a
   CSP with no network at all and scripts ONLY by hash. The scripts: the bootstrap (bootstrap.ts), the loop guard's runtime, the
   setup before the core (H5PIntegration, memory-only storage), then the player's core and every library's preloadedJs, each with
   the loop guard (../loop-guard.ts) and allowed by its hash. Every preloadedCss is an inline style with its url()s turned into
   data: URIs; content.json goes inside H5PIntegration. The content's own files (pictures, audio, video) are handed over the
   MessagePort (media), never fetched by the frame. */
import { ALLOW as FRAME_ALLOW, CSP } from '../html-app/doc.ts';
import { guardName, runtime as guardRuntime, transform } from '../loop-guard.ts';
import { bootstrap } from './bootstrap.ts';
import { assetPaths, extOf, H5PError, type Files, type H5PReport, isObj, LIM, utf8 } from './check.ts';
import type { ActivityInit, ActivityItem } from '../types.ts';

/* i18n-ignore-start */ // code, and H5P's own English defaults (replaced by h5pByLocale[locale].l10n)

export { FRAME_ALLOW, CSP };

/** what the player (engine/vendor/h5p/<version>/player.js) defines: the H5P core's script and styles */
export interface H5PPlayer {
  readonly version?: string;
  readonly js: string;
  readonly css: string;
}
/** a package ready for this locale (runtime.ts prepare) */
export interface Prepared {
  readonly files: Files;
  readonly check: H5PReport;
  readonly l10n: Readonly<Record<string, unknown>> | null;
  readonly sha256: string;
}
/** a content file the host hands over the port */
export interface Media {
  readonly path: string;
  readonly type: string;
  readonly bytes: Uint8Array;
}

export const MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  vtt: 'text/vtt',
  webvtt: 'text/vtt',
  json: 'application/json',
  txt: 'text/plain',
};
const mimeOf = (ext: string): string | undefined => (Object.prototype.hasOwnProperty.call(MIME, ext) ? MIME[ext] : undefined);

/** H5P's core strings (H5PIntegration.l10n.H5P), English; a translation's l10n is merged over them */
export const L10N: Readonly<Record<string, string>> = {
  fullscreen: 'Fullscreen',
  disableFullscreen: 'Disable fullscreen',
  download: 'Download',
  copyrights: 'Rights of use',
  embed: 'Embed',
  size: 'Size',
  close: 'Close',
  title: 'Title',
  author: 'Author',
  year: 'Year',
  source: 'Source',
  license: 'License',
  thumbnail: 'Thumbnail',
  noCopyrights: 'No copyright information available for this content.',
  reuse: 'Reuse',
  by: 'by',
  showMore: 'Show more',
  showLess: 'Show less',
  subLevel: 'Sublevel',
  confirmDialogHeader: 'Confirm action',
  confirmDialogBody: 'Please confirm that you wish to proceed. This action is not reversible.',
  cancelLabel: 'Cancel',
  confirmLabel: 'Confirm',
  contentChanged: 'This content has changed since you last used it.',
  startingOver: "You'll be starting over.",
  licenseU: 'Undisclosed',
  licenseCC010: 'CC0 1.0 Universal (CC0 1.0) Public Domain Dedication',
  licenseC: 'Copyright',
};

const sha256b64 = async (text: string): Promise<string> =>
  btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
const rndName = (p: string): string =>
  p + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');

/** a library's css with its url()s as data: URIs from its own folder (fonts: only woff2 / woff; nothing is fetched) */
export function css(text: string, dir: string, files: Files): string {
  return text.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)(\s*format\(\s*['"]?([^'")]+)['"]?\s*\))?/g,
    (all: string, _q: string, ref: string, fm: string | undefined, fmt: string | undefined) => {
      const r = ref.trim();
      if (/^data:/i.test(r)) return all;
      const keep = (s: string): string => 'url(' + s + ')' + (fm ?? '');
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(r)) return keep('data:,');
      const path = (dir + '/' + (r.split(/[?#]/)[0] ?? ''))
        .split('/')
        .reduce<string[]>((a, x) => {
          if (x === '..') a.pop();
          else if (x && x !== '.') a.push(x);
          return a;
        }, [])
        .join('/');
      const ext = extOf(path),
        f = files[path];
      if (
        !f ||
        ['eot', 'ttf', 'otf'].includes(ext) ||
        (fmt && !/^woff2?$/i.test(fmt)) ||
        (ext === 'svg' && r.includes('#')) ||
        f.length > 2 * 1024 * 1024
      )
        return keep('data:,');
      let s = '';
      for (let i = 0; i < f.length; i += 0x8000) s += String.fromCharCode(...f.subarray(i, i + 0x8000));
      return keep('"data:' + (mimeOf(ext) ?? 'application/octet-stream') + ';base64,' + btoa(s) + '"');
    },
  );
}

/** before the core: H5PIntegration and memory-only storage (an opaque origin has none; H5P's clipboard asks for it).
    saveFreq must be truthy, or H5P ignores the saved state (h5p.js newRunnable); with no H5PIntegration.user its own saving stops
    before any request ("Not signed in"), so the state reaches the app only through getCurrentState() (bootstrap.ts).
    fullscreenDisabled: the frame may not go full screen (the app offers its own); it also keeps WebKit from logging a policy error. */
function pre(c: H5PReport, act: ActivityItem, l10n: Readonly<Record<string, unknown>> | null): string {
  const libs = c.libs ?? {},
    folder = (c.order ?? []).find(f => libs[f]?.machineName === c.main),
    lib = folder ? libs[folder] : undefined;
  const h5p = c.h5p ?? {},
    title = (typeof h5p.title === 'string' && h5p.title) || act.id;
  const integ = {
    baseUrl: 'about:srcdoc',
    url: 'urn:noema:activity:' + act.id,
    siteUrl: 'about:srcdoc',
    urlLibraries: 'data:,',
    postUserStatistics: false,
    saveFreq: 3600,
    reportingIsEnabled: false,
    fullscreenDisabled: true,
    ajax: {},
    loadedJs: [],
    loadedCss: [],
    core: { styles: [], scripts: [] },
    l10n: { H5P: Object.assign({}, L10N, l10n ?? {}) },
    contents: {
      'cid-noema': {
        library: `${String(lib?.machineName)} ${String(lib?.majorVersion)}.${String(lib?.minorVersion)}`,
        jsonContent: JSON.stringify(c.content),
        fullScreen: false,
        exportUrl: '',
        embedCode: '',
        resizeCode: '',
        url: 'urn:noema:activity:' + act.id,
        title,
        styles: [],
        scripts: [],
        displayOptions: { frame: false, export: false, embed: false, copyright: false, icon: false, copy: false },
        metadata: { title, license: typeof h5p.license === 'string' && h5p.license ? h5p.license : 'U' },
      },
    },
  };
  return `(function(){function mem(){var d=Object.create(null);return{getItem:function(k){k=String(k);return k in d?d[k]:null;},setItem:function(k,v){d[String(k)]=String(v);},removeItem:function(k){delete d[String(k)];},clear:function(){d=Object.create(null);},key:function(i){return Object.keys(d)[i]||null;},get length(){return Object.keys(d).length;}};}
['localStorage','sessionStorage'].forEach(function(n){try{window[n].length;}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true});}catch(x){}}});
window.H5PIntegration=${JSON.stringify(integ).replace(/</g, '\\u003c')};window.H5P=window.H5P||{};window.H5P.preventInit=true;})();`;
}

/** the wrapper's srcdoc, the content files to hand over and the number of scripts */
export interface BuiltDoc {
  readonly doc: string;
  readonly media: readonly Media[];
  readonly scripts: number;
}

/** → { doc (the wrapper's srcdoc), media [{path, type, bytes}] }; throws an H5PError ('size') when the content files are too big */
export async function buildDoc(pkg: Prepared, nonce: string, act: ActivityItem, init: ActivityInit, core: H5PPlayer): Promise<BuiltDoc> {
  const c = pkg.check,
    files = pkg.files,
    G = guardName(),
    KEY = rndName('__noemaH5P');
  const scripts: string[] = [],
    styles: string[] = [core.css];
  const libs = c.libs ?? {};
  for (const f of c.order ?? []) {
    const lj = libs[f];
    if (!lj) continue;
    for (const x of assetPaths(lj.preloadedCss)) {
      const p = f + '/' + x;
      styles.push(css(utf8(files[p] ?? new Uint8Array(0)), p.slice(0, p.lastIndexOf('/')), files));
    }
    for (const x of assetPaths(lj.preloadedJs)) scripts.push(utf8(files[f + '/' + x] ?? new Uint8Array(0)));
  }
  const guardOf = (s: string): string => transform(s, G).code;
  const boot = bootstrap(nonce, KEY),
    guard = guardRuntime(G, 1500, `function(){try{window[${JSON.stringify(KEY)}].runaway()}catch(e){}}`);
  const all = [boot, guard, pre(c, act, pkg.l10n), guardOf(core.js), ...scripts.map(guardOf)];
  const hashes = await Promise.all(all.map(sha256b64));
  const d = document.implementation.createHTMLDocument('');
  const add = (tag: string, attrs: Readonly<Record<string, string>>, text?: string): HTMLElement => {
    const e = d.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  d.documentElement.setAttribute('lang', typeof init.locale === 'string' && init.locale ? init.locale : 'en');
  d.documentElement.className = 'h5p-iframe';
  d.head.replaceChildren(
    add('meta', { charset: 'utf-8' }),
    add('meta', { 'http-equiv': 'Content-Security-Policy', content: CSP(hashes) }),
    add('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
    add(
      'style',
      {},
      'html,body{margin:0;background:#fff;color:#222;font-family:var(--noema-font,system-ui,sans-serif)}.h5p-content{font-family:inherit}',
    ),
    ...styles.map(s => add('style', {}, s)),
    ...all.map(s => add('script', {}, s)),
  );
  d.body.replaceChildren(add('div', { class: 'h5p-content', 'data-content-id': 'noema' }));
  const inner = '<!doctype html>' + d.documentElement.outerHTML;
  const w = document.implementation.createHTMLDocument('');
  const wm = w.createElement('meta');
  wm.setAttribute('http-equiv', 'Content-Security-Policy');
  wm.setAttribute('content', CSP(hashes));
  const ws = w.createElement('style');
  ws.textContent =
    'html,body{margin:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;border:0;width:100%;height:100%}';
  const wf = w.createElement('iframe');
  wf.setAttribute('sandbox', 'allow-scripts');
  wf.setAttribute('allow', FRAME_ALLOW);
  wf.setAttribute('referrerpolicy', 'no-referrer');
  wf.setAttribute('srcdoc', inner);
  w.head.replaceChildren(wm, ws);
  w.body.replaceChildren(wf);
  let mediaBytes = 0;
  const media: Media[] = [];
  for (const n of Object.keys(files)) {
    if (!n.startsWith('content/') || n === 'content/content.json') continue;
    const ext = extOf(n),
      type = mimeOf(ext),
      bytes = files[n];
    if (!type || ext === 'json' || !bytes) continue;
    mediaBytes += bytes.length;
    if (mediaBytes > LIM.media) throw new H5PError('size', 'the content files are too big');
    media.push({ path: n.slice(8), type, bytes });
  }
  return { doc: '<!doctype html>' + w.documentElement.outerHTML, media, scripts: all.length };
}

/** is this a player the page has (player.js defined it)? */
export const isPlayer = (v: unknown): v is H5PPlayer => isObj(v) && typeof v.js === 'string' && typeof v.css === 'string';

/* i18n-ignore-end */
