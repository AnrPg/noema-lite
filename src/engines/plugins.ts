/* Every engine of sim-spec@1 as a plugin of the microkernel (src/plugins): its manifest (data, read at start) and two lazy entries,
   its code and its Worker bundle (the text a Worker runs; built by the esbuild plugin noemaWorkers of tools/esbuild.mjs from
   "noema-worker:<module>#<export>": the module, bundled with what it imports, sets self.noemaEngine to that export).
   The order is the catalogue's (catalog.js): the library first, then the domain plugins. A new engine gets its line here, in
   node.ts and in the catalogue; src/engines/plugins.test.ts checks that the three agree. */
import type { PluginManifest } from '../plugins/index.ts';
import type { EngineModule, EnginePlugin } from './types.ts';

/** the capability every engine needs: the expression language on the main thread (prepare, the checks), provided by the library */
export const EXPR = 'kernel:expr';
const manifest = (id: `${string}@${number}`, needs: readonly string[] = []): PluginManifest => ({
  id,
  kind: 'engine',
  version: `${id.slice(id.lastIndexOf('@') + 1)}.0.0`,
  needs: [EXPR, ...needs],
  provides: ['engine:' + id],
  locales: [],
});
const def = (
  m: PluginManifest,
  entry: () => Promise<{ default: EngineModule }>,
  worker: () => Promise<{ default: string }>,
): EnginePlugin => Object.freeze({ manifest: m, entry: () => entry().then(x => x.default), worker: () => worker().then(x => x.default) });

export const ENGINE_PLUGINS: readonly EnginePlugin[] = Object.freeze([
  def(
    manifest('ode@1'),
    () => import('./ode/ode.js'),
    () => import('noema-worker:./ode/ode.js#simEngine'),
  ),
  def(
    manifest('prob@1'),
    () => import('./prob/prob.js'),
    () => import('noema-worker:./prob/prob.js#simEngine'),
  ),
  def(
    manifest('logic@1'),
    () => import('./logic/logic.ts'),
    () => import('noema-worker:./logic/logic.ts#simEngine'),
  ),
  def(
    manifest('graph@1'),
    () => import('./graph/graph.ts'),
    () => import('noema-worker:./graph/graph.ts#simEngine'),
  ),
  def(
    manifest('geom@1'),
    () => import('./geom/geom.js'),
    () => import('noema-worker:./geom/geom.js#simEngine'),
  ),
  def(
    manifest('genetics@1'),
    () => import('./genetics/genetics.js'),
    () => import('noema-worker:./genetics/genetics.js#simEngine'),
  ),
  def(
    manifest('seq@1'),
    () => import('./seq/seq.js'),
    () => import('noema-worker:./seq/seq.js#simEngine'),
  ),
  def(
    manifest('med@1'),
    () => import('./med/med.ts'),
    () => import('noema-worker:./med/med.ts#simEngine'),
  ),
  def(
    manifest('clinic@1', ['engine:med@1']),
    () => import('./clinic/clinic.js'),
    () => import('noema-worker:./clinic/clinic.js#simEngine'),
  ),
  def(
    manifest('anatomy@1'),
    () => import('./anatomy/anatomy.js'),
    () => import('noema-worker:./anatomy/anatomy.js#simEngine'),
  ),
  def(
    manifest('timeline@1'),
    () => import('./timeline/timeline.js'),
    () => import('noema-worker:./timeline/timeline.js#simEngine'),
  ),
  def(
    manifest('music@1'),
    () => import('./music/music.js'),
    () => import('noema-worker:./music/music.js#simEngine'),
  ),
  def(
    manifest('map@1'),
    () => import('./map/map.ts'),
    () => import('noema-worker:./map/map.ts#simEngine'),
  ),
  def(
    manifest('text@1'),
    () => import('./text/text.js'),
    () => import('noema-worker:./text/text.js#simEngine'),
  ),
  def(
    manifest('craft@1'),
    () => import('./craft/craft.js'),
    () => import('noema-worker:./craft/craft.js#simEngine'),
  ),
  def(
    manifest('law@1', ['engine:logic@1']),
    () => import('./law/law.ts'),
    () => import('noema-worker:./law/law.ts#simEngine'),
  ),
  def(
    manifest('agents@1', ['engine:logic@1']),
    () => import('./agents/agents.js'),
    () => import('noema-worker:./agents/agents.js#simEngine'),
  ),
  def(
    manifest('field@1'),
    () => import('./field/field.js'),
    () => import('noema-worker:./field/field.js#simEngine'),
  ),
  def(
    manifest('des@1'),
    () => import('./des/des.js'),
    () => import('noema-worker:./des/des.js#simEngine'),
  ),
  def(
    manifest('philo@1', ['engine:logic@1']),
    () => import('./philo/philo.js'),
    () => import('noema-worker:./philo/philo.js#simEngine'),
  ),
  def(
    manifest('rhetoric@1', ['engine:logic@1']),
    () => import('./rhetoric/rhetoric.js'),
    () => import('noema-worker:./rhetoric/rhetoric.js#simEngine'),
  ),
  def(
    manifest('circuit-mna@1'),
    () => import('./circuit/sim.js'),
    () => import('noema-worker:./circuit/sim.js#simEngine'),
  ),
  def(
    manifest('thermal@1'),
    () => import('./thermal/thermal.js'),
    () => import('noema-worker:./thermal/thermal.js#adapter'),
  ),
  def(
    manifest('pid@1'),
    () => import('./pid/pid.js'),
    () => import('noema-worker:./pid/pid.js#adapter'),
  ),
  def(
    manifest('rf@1'),
    () => import('./rf/rf.js'),
    () => import('noema-worker:./rf/rf.js#simEngine'),
  ),
  def(
    manifest('twin@1'),
    () => import('./twin/twin.js'),
    () => import('noema-worker:./twin/twin.js#simEngine'),
  ),
]);
