/* The engine library of the app (window.NoemaCore.engines): the expression language and the catalogue at once, every engine as a
   plugin loaded the first time something needs it — the activity core before it mounts an activity (engine/src/32_activities.js),
   the pack checker before it checks a pack (NoemaPackCheck.enginesNamed), the activity author before its forms. A loaded engine is
   its module with its registered engine: the shape ACT.registerEngine takes, with its Worker bundle as text (workerSource). */
import { createPluginRegistry, type PluginRegistry, type Support } from '../plugins/index.ts';
import NoemaExpr from './kernel/simexpr.js';
import NoemaEngineCatalog from './catalog.js';
import { EXPR } from './plugins.ts';
import type { CatalogApi, EngineModule, EnginePlugin, ExprApi, LoadedEngine, RegisteredEngine, SchemaApi } from './types.ts';

export interface LoadFailure {
  readonly id: string;
  readonly code: string;
  readonly missing?: readonly string[];
  readonly cause?: string;
}
export interface LoadReport {
  readonly ok: boolean;
  readonly loaded: readonly string[];
  readonly failed: readonly LoadFailure[];
}

export interface EngineLibrary {
  /** the expression language of sim-spec@1 (docs/INTERACTIVE_SIMEXPR.md): every check and formula of the app uses it */
  readonly expr: ExprApi;
  /** the catalogue of every way an activity can compute (docs/INTERACTIVE_LIBRARY.md §2) */
  readonly catalog: CatalogApi;
  /** the plugins themselves (manifests, states, capabilities) */
  readonly plugins: PluginRegistry<EngineModule>;
  /** every engine id this app has (loaded or not) */
  ids(): readonly string[];
  has(id: string): boolean;
  /** loads engines (each once, with its Worker bundle); unknown ids are reported, never thrown */
  load(ids: string | readonly string[]): Promise<LoadReport>;
  /** a loaded engine, or null (not loaded yet) */
  loaded(id: string): LoadedEngine | null;
  /** the registered engine of a loaded one (ACT.engine), or null */
  engine(id: string): RegisteredEngine | null;
  /** an engine whose module and Worker bundle are already in hand (node: src/engines/node.ts) */
  adopt(id: string, module: EngineModule, workerSource: string): boolean;
  /** the model tables as JSON Schemas (the activity author), loaded on demand */
  loadSchema(): Promise<SchemaApi>;
  schema(): SchemaApi | null;
  adoptSchema(schema: SchemaApi): void;
  /** which of pack.requires this library cannot give (entries other than "engine:…" are not its business and are ignored) */
  supports(requires: readonly string[]): Support;
}

export interface LibraryOptions {
  readonly plugins: readonly EnginePlugin[];
  readonly schema: () => Promise<SchemaApi>;
  /** capabilities of the host besides the expression language (none are needed by the engines of phase 1) */
  readonly host?: readonly string[];
}

export function createEngineLibrary(opts: LibraryOptions): EngineLibrary {
  const registry = createPluginRegistry<EngineModule>({ host: [EXPR, ...(opts.host ?? [])] });
  const workers = new Map<string, () => Promise<string>>();
  for (const p of opts.plugins) {
    const r = registry.register(p);
    if (!r.ok) throw new Error(`engine plugin ${r.error.id}: ${r.error.code}`); // a programming error of plugins.ts (its test catches it)
    workers.set(p.manifest.id, p.worker);
  }
  const ready = new Map<string, LoadedEngine>(),
    pending = new Map<string, Promise<LoadFailure | null>>();
  let schema: SchemaApi | null = null,
    schemaP: Promise<SchemaApi> | null = null;

  function compose(id: string, module: EngineModule, workerSource: string): LoadedEngine {
    const engine: RegisteredEngine = Object.freeze({ ...module.engine, workerSource });
    const loaded: LoadedEngine = Object.freeze({ ...module, engine });
    ready.set(id, loaded);
    return loaded;
  }
  function loadOne(id: string): Promise<LoadFailure | null> {
    if (ready.has(id)) return Promise.resolve(null);
    const had = pending.get(id);
    if (had) return had;
    const worker = workers.get(id);
    if (!worker) return Promise.resolve({ id, code: 'unknown-plugin' });
    const p = registry
      .load(id)
      .then(async r => {
        if (!r.ok)
          return {
            id,
            code: r.error.code,
            ...(r.error.missing ? { missing: r.error.missing } : {}),
            ...(r.error.cause ? { cause: r.error.cause } : {}),
          };
        try {
          compose(id, r.value, await worker());
          return null;
        } catch (e: unknown) {
          return { id, code: 'load-failed', cause: e instanceof Error ? e.message : String(e) };
        }
      })
      .finally(() => pending.delete(id));
    pending.set(id, p);
    return p;
  }
  const ids = (): readonly string[] => registry.manifests('engine').map(m => m.id);

  return {
    expr: NoemaExpr,
    catalog: NoemaEngineCatalog,
    plugins: registry,
    ids,
    has: id => workers.has(id),
    async load(want) {
      const list = [...new Set(typeof want === 'string' ? [want] : want)];
      const res = await Promise.all(list.map(loadOne));
      const failed = res.filter((x): x is LoadFailure => x !== null);
      return { ok: failed.length === 0, loaded: list.filter(id => ready.has(id)), failed };
    },
    loaded: id => ready.get(id) ?? null,
    engine: id => ready.get(id)?.engine ?? null,
    adopt(id, module, workerSource) {
      if (!workers.has(id)) return false;
      const r = registry.adopt(id, module);
      if (!r.ok) return false;
      if (!ready.has(id)) compose(id, r.value, workerSource);
      return true;
    },
    loadSchema() {
      if (schema) return Promise.resolve(schema);
      if (!schemaP)
        schemaP = opts.schema().then(
          s => (schema = s),
          (e: unknown) => {
            schemaP = null;
            throw e;
          },
        );
      return schemaP;
    },
    schema: () => schema,
    adoptSchema(s) {
      schema = s;
    },
    supports(requires) {
      const mine = requires.filter(r => r.startsWith('engine:'));
      return registry.supports(mine);
    },
  };
}
