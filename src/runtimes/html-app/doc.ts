/* The document of a mini-app (html-app@1): the author's one HTML file, made safe to run in a sandboxed frame (docs/adr/001 §2).
   A Content-Security-Policy first in <head>: no network at all, no forms, no frames, no workers, and scripts only by hash — exactly
   the inline scripts of the bundle after the loop guard was added to them (../loop-guard.ts), so no script the app did not check
   can ever run (no inline handlers, no javascript: URLs, no scripts made at run time). Two frames: the app's frame holds only a
   WRAPPER document (no scripts) whose policy says frame-src 'none', and the mini-app runs in the wrapper's own sandboxed frame. A
   frame can always navigate itself (location.replace, a link, a meta refresh) and the new page would have no policy at all; the
   wrapper's frame-src blocks every such navigation, so the mini-app stays offline (tests/activities_app.js "self-navigation"). The
   mini-app's srcdoc inherits the wrapper's policy too, so both list the same hashes. */
import { guardName, runtime as guardRuntime, transform } from '../loop-guard.ts';
import { bootstrap } from './bootstrap.ts';

/* i18n-ignore-start */ // code

export const CSP = (hashes: readonly string[]): string =>
  [
    "default-src 'none'",
    'script-src ' + hashes.map(x => `'sha256-${x}'`).join(' '),
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    'media-src data: blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "manifest-src 'none'",
  ].join('; ');

/** the devices a frame may not use (the allow attribute) */
export const ALLOW = [
  'accelerometer',
  'autoplay',
  'camera',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'publickey-credentials-get',
  'screen-wake-lock',
  'usb',
  'web-share',
  'xr-spatial-tracking',
]
  .map(f => f + " 'none'")
  .join('; ');

export const MAX_BYTES = 512 * 1024;

/** an Error with the code the core shows the fallback for */
export class BuildError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const enc = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const sha256 = async (text: string): Promise<string> =>
  btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', enc(text)))));

/** the author's file → the document for srcdoc (async: the script hashes); throws a BuildError on what cannot run */
export async function buildDoc(html: unknown, nonce: string, want: unknown): Promise<string> {
  if (typeof html !== 'string' || !html.trim()) throw new BuildError('empty');
  if (enc(html).length > MAX_BYTES) throw new BuildError('size');
  if (typeof crypto === 'undefined' || !(crypto.subtle as SubtleCrypto | undefined)) throw new BuildError('crypto');
  if (typeof want === 'string' && want) {
    // the bundle is content-addressed: it must be the one the pack names
    const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc(html))), b => b.toString(16).padStart(2, '0')).join('');
    if (hex !== want.toLowerCase()) throw new BuildError('integrity');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html'); // inert: nothing in it runs here
  const G = guardName();
  for (const n of doc.querySelectorAll(
    'base, meta[http-equiv], script[src], link[rel]:not([rel~="stylesheet"]), link[href]:not([href^="data:"])',
  ))
    n.remove();
  const hashes: string[] = [];
  for (const s of doc.querySelectorAll('script')) {
    const type = (s.getAttribute('type') ?? '').trim().toLowerCase();
    if (type && !['text/javascript', 'module', 'application/javascript'].includes(type)) continue; // data blocks (application/json…) do not run
    s.textContent = transform(s.textContent, G).code;
    hashes.push(await sha256(s.textContent));
  }
  const boot = bootstrap(nonce),
    guard = guardRuntime(G, 1500, "function(){try{window.noema&&window.noema.error('runaway','the activity ran too long')}catch(e){}}");
  hashes.unshift(await sha256(boot), await sha256(guard));
  const add = (tag: string, attrs: Readonly<Record<string, string>>, text?: string): HTMLElement => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const first = [
    add('meta', { charset: 'utf-8' }),
    add('meta', { 'http-equiv': 'Content-Security-Policy', content: CSP(hashes) }),
    add('script', {}, boot),
    add('script', {}, guard),
  ];
  if (!doc.querySelector('meta[name="viewport"]'))
    first.push(add('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }));
  first.push(
    add(
      'style',
      {},
      ':root{color-scheme:light dark}html,body{margin:0;background:var(--noema-card,var(--noema-bg,#fff));color:var(--noema-ink,#222);font-family:var(--noema-font,system-ui,sans-serif)}',
    ),
  );
  doc.head.prepend(...first);
  const inner = '<!doctype html>' + doc.documentElement.outerHTML;
  // the wrapper: no scripts of its own; its policy (inherited by the mini-app's srcdoc) blocks every navigation of the inner frame
  const w = document.implementation.createHTMLDocument('');
  const wm = w.createElement('meta');
  wm.setAttribute('http-equiv', 'Content-Security-Policy');
  wm.setAttribute('content', CSP(hashes));
  const ws = w.createElement('style');
  ws.textContent =
    'html,body{margin:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;border:0;width:100%;height:100%}';
  const wf = w.createElement('iframe');
  wf.setAttribute('sandbox', 'allow-scripts');
  wf.setAttribute('allow', ALLOW);
  wf.setAttribute('referrerpolicy', 'no-referrer');
  wf.setAttribute('srcdoc', inner);
  w.head.replaceChildren(wm, ws);
  w.body.replaceChildren(wf);
  return '<!doctype html>' + w.documentElement.outerHTML;
}

/* i18n-ignore-end */
