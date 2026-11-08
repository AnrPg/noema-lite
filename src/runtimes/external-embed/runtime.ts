/* external-embed@1 (docs/activities-dev/embed.md, docs/INTERACTIVE_EMBED.md, docs/adr/001 D12): a page of an allow-listed provider
   (PhET, GeoGebra, Desmos…) shown in a frame. An EXPLORER only (a theory block): no provider offers a documented cross-origin result
   channel, so it is never a graded sim (the content checks refuse one; this runtime refuses an exercise).
     • Nothing loads by itself: the learner first sees a quiet card (what opens, that it needs the network and may set cookies, the
       credit, the licence, a link to the provider's terms) and an Open button. Open is remembered per provider (the account setting
       embedOk = { <provider>: time }); the card is skipped next time, the credit line stays under the frame.
     • The URL must match the allow-list exactly (check.ts).
     • Two frames, as in html-app@1: the app's frame holds a WRAPPER without scripts (CSP script-src 'none') whose policy says
       frame-src <the provider's origins>, and the provider's page runs in the wrapper's frame: the page can navigate only within its
       provider. Both frames: sandbox with the provider's tokens only, referrerpolicy no-referrer, devices off, credentialless where
       the browser has it, loading lazy.
     • Offline or a page that never loads → onFail with a code; the core shows the activity's fallback with this runtime's words.
   Opt-in per deployment: NOEMA_CONFIG.activities['external-embed@1'] === true (the site CSP must list the providers in frame-src). */
import type { ActivityRuntime, FailText, RuntimeHost, RuntimeModule, RuntimePort } from '../types.ts';
import { check, PROVIDERS, provider, RUNTIME, SANDBOX_OK, type Provider } from './check.ts';

const LOAD_TIMEOUT = 20000;
const DEVICES = [
  'accelerometer',
  'autoplay',
  'camera',
  'display-capture',
  'encrypted-media',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'publickey-credentials-get',
  'screen-wake-lock',
  'serial',
  'usb',
  'hid',
  'bluetooth',
  'web-share',
  'xr-spatial-tracking',
]
  .map(f => f + " 'none'")
  .join('; ');
const CONSENT = 'embedOk';

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);

/** the learner's choice, per provider (the account setting embedOk) */
export function consentOf(host: RuntimeHost): {
  has(id: string): boolean;
  set(id: string): void;
  forget(id: string): void;
  list(): string[];
} {
  const all = (): Obj => {
    const v = host.setting(CONSENT);
    return isObj(v) ? v : {};
  };
  return {
    has: id => Object.prototype.hasOwnProperty.call(all(), id) && !!all()[id],
    set: id => {
      host.setSetting(CONSENT, { ...all(), [id]: host.now() });
    },
    forget: id => {
      host.setSetting(CONSENT, Object.fromEntries(Object.entries(all()).filter(([k]) => k !== id)));
    },
    list: () => Object.keys(all()),
  };
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** the wrapper document: no scripts; its policy lets its one frame show only the provider's origins */
function wrapperDoc(url: string, p: Provider, tokens: string, title: string): string {
  const csp = [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    'frame-src ' + p.origins.join(' '),
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
  const w = document.implementation.createHTMLDocument('');
  const m = w.createElement('meta');
  m.setAttribute('http-equiv', 'Content-Security-Policy');
  m.setAttribute('content', csp);
  const s = w.createElement('style');
  s.textContent =
    'html,body{margin:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;border:0;width:100%;height:100%}';
  const f = w.createElement('iframe');
  f.setAttribute('sandbox', tokens);
  f.setAttribute('allow', DEVICES);
  f.setAttribute('referrerpolicy', 'no-referrer');
  f.setAttribute('credentialless', '');
  f.setAttribute('title', title);
  f.setAttribute('src', url);
  w.head.replaceChildren(m, s);
  w.body.replaceChildren(f);
  return '<!doctype html>' + w.documentElement.outerHTML;
}

/** the runtime for one host, with the given allow-list (the app: tools/embed_allow.json; a test: its own) */
export function createEmbedRuntime(host: RuntimeHost, providers: readonly Provider[] = PROVIDERS): ActivityRuntime | null {
  if (host.flags()[RUNTIME] !== true) return null; // opt-in per deployment
  const consent = consentOf(host);
  const nameOf = (id: unknown): string => provider(id, providers)?.name ?? (typeof id === 'string' ? id : '');

  function creditLine(credit: string, license: string, p: Provider): HTMLElement {
    const line = el('p', 'act-embed-credit');
    line.append(el('span', '', credit), document.createTextNode(' · '), el('span', '', license), document.createTextNode(' · '));
    const terms = el('a', '', host.t('engine.act.embed.terms', { provider: p.name })) as HTMLAnchorElement;
    terms.href = p.terms;
    terms.target = '_blank';
    terms.rel = 'noopener noreferrer';
    terms.referrerPolicy = 'no-referrer';
    line.append(terms);
    return line;
  }

  return {
    id: RUNTIME,
    version: 1,
    /** before consent the block is only the card (no frame): the core does not count it toward the live activities until onLive */
    waits(act) {
      const p = provider(act.provider, providers);
      return !!p && !consent.has(p.id);
    },
    /** refused or mounted as an exercise → the fallback for good; offline or not loaded → Restart retries */
    failText(code, act): FailText | null {
      if (code === 'embed-refused' || code === 'embed-graded') return { text: host.t('engine.act.embed.refused'), restart: false };
      if (code === 'embed-offline') return { text: host.t('engine.act.embed.offline'), restart: true };
      if (code === 'embed-timeout') return { text: host.t('engine.act.embed.timeout', { provider: nameOf(act?.provider) }), restart: true };
      return null;
    },
    /** the page itself does not speak the activity protocol: this trusted host answers for it */
    mount(box, ctx): RuntimePort {
      const { act, init } = ctx;
      const later = (f: () => void): void => {
        void Promise.resolve().then(f); // never call back before the core holds the port
      };
      let closed = false,
        timer: ReturnType<typeof setTimeout> | undefined;
      const out = (type: string, payload?: Obj): void => {
        if (!closed) ctx.onMessage(host.message(type, payload));
      };
      const fail = (code: string): void => {
        later(() => {
          if (!closed) ctx.onFail(code);
        });
      };
      const root = el('div', 'act-embed');
      const port: RuntimePort = {
        send(type) {
          if (type === 'ping')
            later(() => {
              out('pong');
            });
        },
        close() {
          closed = true;
          clearTimeout(timer);
          root.remove();
        },
      };
      const r = check(act, { providers });
      const p = provider(act.provider, providers);
      if (r.errors.length || !p) {
        host.warn('[noema] external-embed', act.id, r.errors.join(' | '));
        fail('embed-refused');
        return port;
      }
      const url = String(act.url);
      let href = '';
      try {
        href = new URL(url).href;
      } catch {
        href = ''; // not a URL: refused below
      }
      if (href !== url) {
        host.warn('[noema] external-embed', act.id, 'url is not in its normal form');
        fail('embed-refused');
        return port;
      }
      if (init?.exerciseId) {
        fail('embed-graded'); // explore only (docs/activities-dev/embed.md §4)
        return port;
      }
      if (!navigator.onLine) {
        fail('embed-offline');
        return port;
      }
      const tokens = p.sandbox.filter(t => SANDBOX_OK.has(t)).join(' ');
      const words = isObj(init?.strings) ? init.strings : {};
      const name = typeof words.title === 'string' && words.title ? words.title : act.id;
      const credit = String(act.credit),
        license = String(act.license);
      box.append(root);
      later(() => {
        out('ready', { protocols: [1] });
      });
      function open(): void {
        if (closed || !p) return;
        if (!navigator.onLine) {
          fail('embed-offline');
          return;
        }
        root.replaceChildren();
        const f = el('iframe', 'act-frame act-embed-frame') as HTMLIFrameElement;
        f.setAttribute('sandbox', tokens);
        f.setAttribute('allow', DEVICES);
        f.setAttribute('referrerpolicy', 'no-referrer');
        f.setAttribute('credentialless', '');
        f.setAttribute('loading', 'lazy');
        f.setAttribute('title', host.t('engine.act.embed.frameTitle', { title: name, provider: p.name }));
        f.setAttribute('data-provider', p.id);
        const pname = p.name;
        f.addEventListener(
          'load',
          () => {
            clearTimeout(timer);
            out('a11y:announce', { text: host.t('engine.act.embed.opened', { provider: pname }).slice(0, 300) });
          },
          { once: true },
        );
        timer = setTimeout(() => {
          fail('embed-timeout');
        }, LOAD_TIMEOUT);
        f.srcdoc = wrapperDoc(url, p, tokens, name);
        root.append(f, creditLine(credit, license, p));
        out('event', { name: 'embed:open', data: { provider: p.id } });
      }
      if (consent.has(p.id)) {
        open();
        return port;
      }
      // the quiet card: nothing of the provider is requested before Open
      const card = el('div', 'act-embed-card');
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', name);
      card.append(el('p', 'act-embed-title', name), el('p', 'act-embed-ask', host.t('engine.act.embed.ask', { provider: p.name })));
      if (typeof words.why === 'string' && words.why.trim()) card.append(el('p', 'act-embed-why', words.why));
      card.append(creditLine(credit, license, p));
      const go = el(
        'button',
        'btn primary small act-embed-open',
        host.t('engine.act.embed.open', { provider: p.name }),
      ) as HTMLButtonElement;
      go.type = 'button';
      const pid = p.id;
      go.addEventListener('click', () => {
        if (closed) return;
        consent.set(pid);
        open();
        ctx.onLive?.();
      });
      card.append(go);
      root.append(card);
      return port;
    },
  };
}

/** the module the registry loads (src/runtimes/plugins.ts) */
const embedModule: RuntimeModule & { createWith(host: RuntimeHost, providers: readonly Provider[]): ActivityRuntime | null } = {
  create: host => createEmbedRuntime(host),
  createWith: (host, providers) => createEmbedRuntime(host, providers),
};
export default embedModule;
