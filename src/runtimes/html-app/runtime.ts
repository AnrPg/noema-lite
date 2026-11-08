/* html-app@1 (Tier A: one self-contained HTML file, docs/INTERACTIVE.md §7–8, docs/adr/001 §2). The mini-app runs in
   <iframe sandbox="allow-scripts"> (opaque origin "null": no app storage, cookies, DOM or same-origin requests), loaded as srcdoc
   with its policy first (doc.ts: the wrapper frame, the CSP, the loop guard). Handshake: the mini-app's bootstrap (bootstrap.ts)
   posts hello {nonce} to the app (parent.parent); the host accepts it only from that inner frame's window and with that nonce, and
   hands over one MessagePort; every later message goes over the port. The engines it lists run in the host (bridge.ts). */
import type { ActivityRuntime, MountContext, ProtocolMessage, RuntimeHost, RuntimeModule, RuntimePort } from '../types.ts';
import { declaredOf, engineBridge } from './bridge.ts';
import { ALLOW, BuildError, buildDoc } from './doc.ts';

export const RUNTIME = 'html-app@1';
const ENGINE_REQUESTS = new Set(['engine:run', 'engine:check', 'sim:run']);

const hex = (n: number): string => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

export function createHtmlAppRuntime(host: RuntimeHost): ActivityRuntime {
  function mount(box: HTMLElement, ctx: MountContext): RuntimePort {
    const { act, init, title } = ctx;
    const onMessage = (m: ProtocolMessage): void => {
        ctx.onMessage(m);
      },
      onFail = (code: string): void => {
        ctx.onFail(code);
      };
    const nonce = hex(16);
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts'); // exactly this token: never allow-same-origin (tests/activities.js checks every code path)
    frame.setAttribute('allow', ALLOW);
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', title);
    frame.className = 'act-frame';
    let ch: MessageChannel | null = null,
      closed = false,
      loads = 0;
    const pending: ProtocolMessage[] = [];
    const send = (type: string, payload?: unknown, extra?: unknown): void => {
      const m = host.message(
        type,
        payload as Readonly<Record<string, unknown>> | undefined,
        extra as Readonly<Record<string, unknown>> | undefined,
      );
      if (ch) ch.port1.postMessage(m);
      else pending.push(m);
    };
    // the engines it lists (docs/INTERACTIVE.md §8.1): one this app cannot run → the fallback, as for a runtime that is missing
    const bridge = engineBridge(host, act, init?.seed, (type, payload, extra) => {
      if (!closed) send(type, payload, extra);
    });
    const port: RuntimePort = {
      send,
      close() {
        closed = true;
        removeEventListener('message', hello);
        bridge.close();
        ch?.port1.close();
        frame.remove();
      },
    };
    const declared = declaredOf(act);
    if (declared.length > bridge.engines.length) {
      host.warn(
        '[noema] html-app',
        act.id,
        'needs engines this app cannot run here:',
        declared.filter(x => !bridge.engines.includes(x)).join(', '),
      );
      void Promise.resolve().then(() => {
        if (!closed) onFail('unsupported');
      });
      return port;
    }
    function hello(e: MessageEvent<unknown>): void {
      let app: Window | null = null; // the mini-app's window, inside the wrapper
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
        if (closed) return;
        const d = m.data as { type?: unknown } | null; // an engine request goes to the bridge once the protocol has checked it; everything else (and every bad message: a strike) to the core
        if (d && typeof d.type === 'string' && ENGINE_REQUESTS.has(d.type)) {
          const r = host.check(d);
          if (r.ok && typeof r.msg.id === 'string') {
            bridge.handle({ type: r.msg.type, id: r.msg.id, payload: r.msg.payload });
            return;
          }
        }
        onMessage(m.data as ProtocolMessage);
      };
      app.postMessage({ t: 'welcome', nonce }, '*', [c.port2]);
      c.port1.postMessage(host.message('init', { ...init, engines: bridge.engines }));
      for (const m of pending.splice(0)) c.port1.postMessage(m);
    }
    addEventListener('message', hello);
    frame.addEventListener('load', () => {
      if (++loads > 1 && !closed) onFail('navigated'); // a frame that navigates away is stopped at once
    });
    buildDoc(act.html ?? '', nonce, act.sha256).then(
      doc => {
        if (closed) return;
        frame.srcdoc = doc;
        box.append(frame);
      },
      (e: unknown) => {
        const code = e instanceof BuildError ? e.code : 'build';
        host.warn('[noema] html-app', act.id, e instanceof BuildError ? e.code : e);
        if (!closed) onFail(code);
      },
    );
    return port;
  }
  return { id: RUNTIME, version: 1, mount };
}

/** the module the registry loads (src/runtimes/plugins.ts) */
const htmlAppModule: RuntimeModule = { create: host => createHtmlAppRuntime(host) };
export default htmlAppModule;
