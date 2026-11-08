/* The manifests of the engines of sim-spec@1 (data only, no code): what the app knows of every engine at start. The code of
   each engine and its Worker bundle are src/engines/plugins.ts (loaded lazily: build/engines.js on a page, src/engines/lazy.ts);
   the order is the catalogue's. A new engine gets its line here and in plugins.ts; src/engines/plugins.test.ts checks they agree. */
import type { PluginManifest } from '../plugins/index.ts';

/** the capability every engine needs: the expression language on the main thread (prepare, the checks), provided by the library */
export const EXPR = 'kernel:expr';
export const manifest = (id: `${string}@${number}`, needs: readonly string[] = []): PluginManifest => ({
  id,
  kind: 'engine',
  version: `${id.slice(id.lastIndexOf('@') + 1)}.0.0`,
  needs: [EXPR, ...needs],
  provides: ['engine:' + id],
  locales: [],
});

/** every engine: its id and the engines it needs */
export const ENGINE_MANIFESTS: readonly PluginManifest[] = Object.freeze(
  (
    [
      ['ode@1', []],
      ['prob@1', []],
      ['logic@1', []],
      ['graph@1', []],
      ['geom@1', []],
      ['genetics@1', []],
      ['seq@1', []],
      ['med@1', []],
      ['clinic@1', ['engine:med@1']],
      ['anatomy@1', []],
      ['timeline@1', []],
      ['music@1', []],
      ['map@1', []],
      ['text@1', []],
      ['craft@1', []],
      ['law@1', ['engine:logic@1']],
      ['agents@1', ['engine:logic@1']],
      ['field@1', []],
      ['des@1', []],
      ['philo@1', ['engine:logic@1']],
      ['rhetoric@1', ['engine:logic@1']],
      ['circuit-mna@1', []],
      ['thermal@1', []],
      ['pid@1', []],
      ['rf@1', []],
      ['twin@1', []],
    ] as const
  ).map(([id, needs]) => manifest(id, needs)),
);
