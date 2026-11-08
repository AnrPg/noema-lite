/* sim-spec@1 (Tier B: a declarative simulation, docs/INTERACTIVE.md §12): the pack carries only DATA (item.spec): controls, formulas
   in the expression language, readouts and plots, computed by an engine of the library (or several: parts) and drawn by the app
   itself (view.ts). It renders in the app's own DOM and takes the height it needs (autoHeight). The checks grader reads its values
   (port.values()). Runtimes that compute the outputs themselves draw through the same view (view(), py-module@1); a wasm-module@1
   item with a spec mounts this runtime with the engine wasm@1. */
import type { EngineOpts, SimEngine } from '../compute.ts';
import type { ActivityRuntime, MountContext, RuntimeHost, RuntimeModule } from '../types.ts';
import { partsRunner, type PartsRunner } from './parts.ts';
import { engineRunner, type EngineRunner } from './runner.ts';
import { simView, type ViewHost, type ViewPort } from './view.ts';

export const RUNTIME = 'sim-spec@1';

/** the runtime, and the view for the runtimes built on it */
export interface SimRuntime extends ActivityRuntime {
  mount(box: HTMLElement, ctx: MountContext): ViewPort;
  view(box: HTMLElement, ctx: Pick<MountContext, 'act' | 'init' | 'onMessage' | 'onFail'>, viewHost?: ViewHost): ViewPort;
  /** the runners of the engines a mini-app lists (html-app@1, engine/src/34_activity_html.js) */
  engineRunner(E: SimEngine, spec: unknown, opts: EngineOpts, onFail: (why: string) => void): EngineRunner;
  partsRunner(spec: Readonly<Record<string, unknown>>, opts: Partial<EngineOpts>, onFail: (why: string) => void): PartsRunner;
}

export function createSimRuntime(host: RuntimeHost): SimRuntime {
  return {
    id: RUNTIME,
    version: 1,
    autoHeight: true,
    mount: (box, ctx) => simView(host, box, ctx),
    view: (box, ctx, viewHost) => simView(host, box, ctx, viewHost),
    engineRunner: (E, spec, opts, onFail) =>
      engineRunner(E, spec, opts, onFail, (...w) => {
        host.warn(...w);
      }),
    partsRunner: (spec, opts, onFail) => partsRunner(host, spec, opts, onFail),
  };
}

/** the module the registry loads (src/runtimes/plugins.ts) */
const simModule: RuntimeModule = { create: host => createSimRuntime(host) };
export default simModule;
