/**
 * THE ACTIVITY HOST ROOT (build/harness.js, an IIFE; tools/esbuild.mjs): the composition root of the pages that host one
 * activity without the app — the skill's activity harness (skill/noema-pack-builder/scripts/activity_harness.js, which inlines
 * the zip's activity_host/noema-core.js) and the test pages that do the same (tests/activities_wasm.js). It publishes
 * window.NoemaCore with what the activity runtimes read there: the data contracts, the engine library and the content checks
 * (src/features/content: the spec checks of sim-spec@1), the same modules as build/app.js gives the app, and the typed activity
 * runtimes (src/runtimes, their code inline: NoemaCore.runtimes; attachRuntimes(act, host) makes each one that is on for the page's
 * stub activity core and registers it with its engines, as ACT.runtime(id) does in the app). It is never loaded beside build/app.js
 * (that page has its own NoemaCore).
 */
import * as contracts from '../contracts/index.ts';
import { createAppEngines } from '../engines/register.ts';
import { contentChecks, runtimeCheckers } from '../features/content/application/index.ts';
import { RUNTIME_CHECKS } from '../runtimes/checks.ts';
import { createRuntimeLibrary } from '../runtimes/library.ts';
import { RUNTIME_PLUGINS } from '../runtimes/plugins.ts';
import type { ActivityRuntime, RuntimeHost, SimEngineDef } from '../runtimes/types.ts';

/** the stub activity core of a host page (activity_harness.js, the test pages) */
interface StubCore {
  registerRuntime(def: ActivityRuntime): void;
  registerEngine(def: SimEngineDef): void;
}

const page = globalThis as { NoemaCore?: unknown };
if (!page.NoemaCore) {
  const engines = createAppEngines();
  const runtimes = createRuntimeLibrary(RUNTIME_PLUGINS, () => RUNTIME_CHECKS);
  /** every typed runtime that is on for this host, made for it and registered with its engines → the ids registered */
  const attachRuntimes = async (act: StubCore, host: RuntimeHost): Promise<string[]> => {
    const ids = runtimes.ids().filter(id => runtimes.isOn(id, host.flags()));
    const made = await Promise.all(ids.map(async id => (await runtimes.load(id)).create(host)));
    const out: string[] = [];
    for (const def of made) {
      if (!def) continue;
      act.registerRuntime(def);
      for (const e of def.engines ?? []) act.registerEngine(e);
      out.push(def.id);
    }
    return out;
  };
  Object.defineProperty(page, 'NoemaCore', {
    value: Object.freeze({
      version: 1,
      contracts,
      engines,
      runtimes,
      attachRuntimes,
      content: contentChecks(engines, runtimeCheckers(RUNTIME_CHECKS)),
    }),
    writable: false,
    enumerable: false,
    configurable: false,
  });
}
