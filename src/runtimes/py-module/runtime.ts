/* py-module@1 in the app: the spec view computed by Python (docs/INTERACTIVE_PYTHON.md).
   The runner (runner.ts, mountRunner) computes; the app renders. A py-module@1 item carries Python (act.python, a function
   step(inputs, state) → outputs) and a spec in the sim-spec@1 format (params, derived, outputs, readouts, plots — no engine, no bench):
   the sim-spec view (host.simView) draws the controls, readouts and plots and asks Python for the outputs of the latest inputs (one
   step at a time, the latest inputs win; the view's rev gate keeps the checks grader on the latest results). So the checks grader works
   on Python's scalar outputs exactly as on an engine's, and noema.result() still reports ('reported').
   The learner sees one quiet line above the controls: the first-use download (sizes from the manifest), the network an extra package
   needs (requiresNetwork), the loading progress; offline without the files → the fallback with what to do. The runtime's `py` is the
   service Settings › Data and sync uses ("Prepare Python for offline", engine/src/70_account.js). */
import type { ActivityRuntime, FailText, RuntimeHost, RuntimeModule, RuntimePort, SimView } from '../types.ts';
import { createPyService, type Progress, type PyService, type RunnerPort } from './runner.ts';

export const RUNTIME = 'py-module@1';
type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);

/** the sizes as the app writes them (engine.common.size*) */
export function fmtBytes(host: RuntimeHost, n: number): string {
  return n > 1e6
    ? host.t('engine.common.sizeMB', { size: host.num(n / 1e6, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
    : n > 1e3
      ? host.t('engine.common.sizeKB', { size: host.num(Math.round(n / 1e3)) })
      : host.t('engine.common.sizeB', { size: host.num(n) });
}

/** the runtime py-module@1 for one host, with its Python service */
export function createPyRuntime(host: RuntimeHost): ActivityRuntime & { readonly py: PyService } {
  const PY = createPyService(host);
  const roundMB = (n: number): string => host.t('engine.common.sizeMB', { size: host.num(Math.max(1, Math.round(n / 1e6))) }); // "about 17 MB"
  const metered = (): boolean => {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection;
    return !!(c && (c.saveData || c.type === 'cellular'));
  };
  const el = (tag: string, cls: string): HTMLElement => {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  };

  function mount(box: HTMLElement, ctx: Parameters<ActivityRuntime['mount']>[1]): RuntimePort {
    const { act } = ctx,
      onMessage: typeof ctx.onMessage = m => {
        ctx.onMessage(m);
      },
      onFail = (why: string): void => {
        ctx.onFail(why);
      };
    const init = (ctx.init ?? {}) as Obj & { readonly state?: Obj | null };
    let closed = false,
      R: RunnerPort | null = null,
      view: SimView | null = null,
      firstUse = false,
      latest: { inputs: unknown; done: (o: unknown) => void } | null = null,
      busy = false;
    const st = isObj(init.state) ? init.state : null;
    const sv = st && isObj(st.data) ? st.data : null;
    let pyState: unknown = sv && 'py' in sv ? sv.py : undefined; // what Python saved with noema.save_state (kept beside the controls' values)
    const pyInit = {
      ...init,
      state:
        pyState === undefined || !st
          ? null
          : { version: st.version, data: pyState, ...(st.migrateFrom ? { migrateFrom: st.migrateFrom } : {}) },
    };
    const line = el('div', 'act-pyline');
    line.setAttribute('role', 'status');
    line.setAttribute('aria-live', 'polite');
    const holder = el('div', 'act-pyrun'); // the hidden runner frame
    /** the view's engine: Python's step() for the latest inputs, one at a time */
    const runner = {
      run(inputs: unknown, done: (o: unknown) => void) {
        latest = { inputs, done };
        pump();
      },
      measure() {
        /* no bench here */
      },
      close() {
        latest = null;
      },
    };
    function pump(): void {
      if (closed || !R || busy || !latest) return;
      const job = latest;
      latest = null;
      busy = true;
      void R.step(job.inputs).then(r => {
        busy = false;
        if (closed) return;
        if (isObj(r.outputs)) {
          if (line.dataset.k === 'err') say('', '');
          job.done(r.outputs);
        } else {
          const e = isObj(r.error) ? r.error : null;
          const code = typeof e?.code === 'string' && e.code ? e.code : 'python';
          if (!['superseded', 'closed', 'stopped', 'runaway'].includes(code)) {
            host.warn('[noema] python step', act.id, code, e?.message ?? '');
            say(host.t('engine.act.py.stepError', { code }), 'err');
            job.done(null);
          }
        }
        pump();
      });
    }
    function say(text: string, k: string): void {
      line.textContent = text;
      line.dataset.k = k || '';
      line.hidden = !text;
    }
    function fromPy(raw: unknown): void {
      if (closed) return;
      const t = isObj(raw) ? raw.type : undefined;
      if (t === 'ready' || t === 'pong' || (typeof t === 'string' && t.startsWith('py:'))) return; // the view speaks for the activity; py:* are read below
      if (t === 'state') {
        const p = isObj(raw) && isObj(raw.payload) ? raw.payload : null;
        pyState = p ? p.data : null;
        view?.saveSoon?.();
        return;
      }
      onMessage(raw as Parameters<typeof onMessage>[0]); // event, result, a11y:announce, error (runaway → the core stops it, with Restart): the core checks each with ACTP
    }
    function progress(p: Obj): void {
      if (closed) return;
      if (p.phase === 'loading' && firstUse && p.totalBytes)
        say(
          host.t('engine.act.py.loading', { done: fmtBytes(host, Number(p.bytes) || 0), total: fmtBytes(host, Number(p.totalBytes)) }),
          'load',
        );
      else if (p.phase === 'starting' || (p.phase === 'loading' && !firstUse)) say(host.t('engine.act.py.starting'), 'start');
      else if (p.phase === 'ready') say('', '');
    }
    function go(): void {
      if (closed || R) return;
      R = PY.mountRunner(holder, {
        act,
        init: pyInit,
        title: ctx.title,
        onMessage: fromPy,
        onFail: why => {
          if (!closed) onFail(why);
        },
      });
      R.on('py:status', progress);
      pump();
    }
    async function boot(): Promise<void> {
      let n: Awaited<ReturnType<PyService['need']>> | null = null;
      try {
        n = await PY.need(act.packages || []);
      } catch {
        n = null; // no manifest: the runner says offline
      }
      if (closed) return;
      if (n?.missing) {
        firstUse = true;
        const size = roundMB(n.missingBytes),
          net = act.requiresNetwork === true && n.extrasMissing.length;
        say(
          host.t('engine.act.py.firstUse', { size }) +
            (net ? ' ' + host.t('engine.act.py.network', { packages: n.extrasMissing.join(', ') }) : ''),
          'first',
        );
        if (metered()) {
          // never by itself on mobile data
          const b = el('button', 'btn small');
          b.setAttribute('type', 'button');
          b.textContent = host.t('engine.act.py.download', { size });
          b.addEventListener('click', () => {
            b.remove();
            go();
          });
          line.append(' ', b);
          return;
        }
      }
      go();
    }
    const v = host.simView(
      box,
      {
        act,
        init: ctx.init,
        onMessage: m => {
          if (!closed) onMessage(m);
        },
        onFail,
      },
      {
        engine: { id: RUNTIME },
        check: { python: true },
        runner: () => runner,
        stateExtra: () => (pyState === undefined ? {} : { py: pyState }),
        decorate: (root: HTMLElement) => {
          say('', '');
          root.prepend(line);
          root.append(holder);
          void Promise.resolve().then(boot);
        }, // only once the spec has passed its check
      },
    );
    view = v;
    if (!v) {
      void Promise.resolve().then(() => {
        onFail('unsupported'); // the sim-spec view is not here
      });
    }
    function close(): void {
      if (closed) return;
      closed = true;
      latest = null;
      try {
        R?.close();
      } catch (e) {
        host.warn(e);
      }
      v?.close();
    }
    return {
      send(type, payload, extra) {
        if (type === 'locale') R?.send('locale', isObj(payload) ? payload : {});
        v?.send(type, payload, extra);
        if (type === 'destroy') close();
      },
      close,
      values: () => (closed || !v ? null : v.values()),
      reveal: () => v?.reveal?.(),
    };
  }

  return {
    id: RUNTIME,
    version: 1,
    autoHeight: true,
    startTimeoutMs: 120000,
    mount,
    py: PY,
    available: () => PY.available(),
    unavailable: () => host.t('engine.act.py.noHere'),
    failText: (code): FailText | null =>
      code === 'offline' || code === 'fetch'
        ? { text: host.t('engine.act.py.offline'), restart: true }
        : code === 'unavailable'
          ? { text: host.t('engine.act.py.noHere'), restart: false }
          : code === 'timeout'
            ? { text: host.t('engine.act.py.slow'), restart: true }
            : null,
  };
}

export type { Progress, PyService };

/** the module the registry loads (src/runtimes/plugins.ts); service(host): the Python service alone (the test pages) */
const pyModule: RuntimeModule & { readonly service: typeof createPyService } = {
  create: host => createPyRuntime(host),
  service: createPyService,
};
export default pyModule;
