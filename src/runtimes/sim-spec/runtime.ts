/* sim-spec@1 (Tier B: a declarative simulation, docs/INTERACTIVE.md §12): the pack carries only DATA (item.spec): controls, formulas
   in the expression language, readouts and plots, computed by an engine of the library (or several: parts) and drawn by the app
   itself (view.ts). It renders in the app's own DOM and takes the height it needs (autoHeight). The checks grader reads its values
   (port.values()). Runtimes that compute the outputs themselves draw through the same view (view(), py-module@1); a wasm-module@1
   item with a spec mounts this runtime with the engine wasm@1. */
import type { ActivityRuntime, MountContext, RuntimeHost, RuntimeModule } from '../types.ts';
import { simView, type ViewHost, type ViewPort } from './view.ts';

export const RUNTIME = 'sim-spec@1';

/** the runtime, and the view for the runtimes built on it */
export interface SimRuntime extends ActivityRuntime {
  mount(box: HTMLElement, ctx: MountContext): ViewPort;
  view(box: HTMLElement, ctx: Pick<MountContext, 'act' | 'init' | 'onMessage' | 'onFail'>, viewHost?: ViewHost): ViewPort;
}

export function createSimRuntime(host: RuntimeHost): SimRuntime {
  return {
    id: RUNTIME,
    version: 1,
    autoHeight: true,
    mount: (box, ctx) => simView(host, box, ctx),
    view: (box, ctx, viewHost) => simView(host, box, ctx, viewHost),
  };
}

/** the module the registry loads (src/runtimes/plugins.ts) */
const simModule: RuntimeModule = { create: host => createSimRuntime(host) };
export default simModule;
