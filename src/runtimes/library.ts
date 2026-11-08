/* The runtime library: the registry of the activity runtimes (src/plugins, kind 'runtime') with the switch rule of the deployment
   and the runtimes' pure checks (handed in). On a page the code of every runtime is the lazy piece build/runtimes.js (lazyRuntimePlugins);
   the node bundle and the harness hold it inline (RUNTIME_PLUGINS). Bridged as NoemaCore.runtimes. */
import { createPluginRegistry, type PluginManifest } from '../plugins/index.ts';
import type { RuntimeChecks } from './checks.ts';
import { availableHere, RUNTIME_DESCRIPTORS, switchedOn } from './manifests.ts';
import type { RuntimeModule, RuntimePlugin, RuntimeSwitch } from './types.ts';

export interface RuntimeLibrary {
  /** every runtime's id, in the order registered */
  ids(): string[];
  has(id: string): boolean;
  manifest(id: string): PluginManifest | null;
  switchOf(id: string): RuntimeSwitch | null;
  /** the engines of sim-spec@1 the runtimes bring, every one (before any runtime's code is loaded) */
  engines(): string[];
  /** the runtime that brings this engine of sim-spec@1, or null */
  engineOwner(engine: string): string | null;
  /** can it run here at all (its descriptor's rule, on this scope: py-module@1 only on the website)? false for an unknown id */
  available(id: string, scope?: object): boolean;
  /** the key of the words the fallback shows where it cannot run, or null */
  unavailableNote(id: string): string | null;
  /** is it switched on by these flags (NOEMA_CONFIG.activities)? */
  isOn(id: string, flags: Readonly<Record<string, unknown>>): boolean;
  /** its code, loaded once (a failed load rejects and may be tried again) */
  load(id: string): Promise<RuntimeModule>;
  /** its code when loaded, else null */
  loaded(id: string): RuntimeModule | null;
  /** the runtimes' pure checks (before any runtime's code is loaded), or null where they are not loaded yet (a page: they come
      with the content checks, build/contracts.js) */
  readonly checks: RuntimeChecks | null;
}

export function createRuntimeLibrary(plugins: readonly RuntimePlugin[], checks: () => RuntimeChecks | null): RuntimeLibrary {
  const reg = createPluginRegistry<RuntimeModule>();
  const switches = new Map<string, RuntimeSwitch>(),
    owners = new Map<string, string>(),
    rules = new Map<string, RuntimePlugin['available']>();
  for (const p of plugins) {
    const r = reg.register({ manifest: p.manifest, entry: p.entry });
    if (!r.ok) throw new Error(`runtime ${p.manifest.id}: ${r.error.code}`);
    switches.set(p.manifest.id, p.switch);
    for (const e of p.engines) owners.set(e, p.manifest.id);
    rules.set(p.manifest.id, p.available);
  }
  return Object.freeze({
    ids: () => reg.manifests('runtime').map(m => m.id),
    has: (id: string) => reg.has(id),
    manifest: (id: string) => reg.manifest(id),
    switchOf: (id: string) => switches.get(id) ?? null,
    engines: () => [...owners.keys()],
    available: (id: string, scope?: object) => switches.has(id) && availableHere(rules.get(id)?.where, scope),
    unavailableNote: (id: string) => rules.get(id)?.note ?? null,
    engineOwner: (engine: string) => owners.get(engine) ?? null,
    isOn: (id: string, flags: Readonly<Record<string, unknown>>) => {
      const sw = switches.get(id);
      return !!sw && switchedOn(sw, flags[id]);
    },
    load: async (id: string) => {
      const r = await reg.load(id);
      if (!r.ok) throw new Error(`runtime ${id}: ${r.error.code}${r.error.cause ? ' (' + r.error.cause + ')' : ''}`);
      return r.value;
    },
    loaded: (id: string) => reg.loaded(id),
    get checks() {
      return checks();
    },
  });
}

/** what the piece of the runtimes' code hands the page */
export interface RuntimesPiece {
  readonly plugins: readonly RuntimePlugin[];
}

/** every runtime as a plugin whose entry loads the piece (once) and then takes the real plugin's */
export function lazyRuntimePlugins(load: () => Promise<RuntimesPiece>): readonly RuntimePlugin[] {
  let piece: Promise<RuntimesPiece> | null = null;
  const once = (): Promise<RuntimesPiece> =>
    (piece ??= load().catch((e: unknown) => {
      piece = null; // a failed load may be tried again
      throw e;
    }));
  return Object.freeze(
    RUNTIME_DESCRIPTORS.map(d =>
      Object.freeze({
        ...d,
        entry: async () => {
          const p = (await once()).plugins.find(x => x.manifest.id === d.manifest.id);
          if (!p) throw new Error(`build/runtimes.js has no runtime ${d.manifest.id}`);
          return p.entry();
        },
      }),
    ),
  );
}
