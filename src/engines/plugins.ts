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
    () => import('./ode/ode.ts'),
    () => import('noema-worker:./ode/ode.ts#simEngine'),
  ),
  def(
    manifest('prob@1'),
    () => import('./prob/prob.ts'),
    () => import('noema-worker:./prob/prob.ts#simEngine'),
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
    () => import('./geom/geom.ts'),
    () => import('noema-worker:./geom/geom.ts#simEngine'),
  ),
  def(
    manifest('genetics@1'),
    () => import('./genetics/genetics.ts'),
    () => import('noema-worker:./genetics/genetics.ts#simEngine'),
  ),
  def(
    manifest('seq@1'),
    () => import('./seq/seq.ts'),
    () => import('noema-worker:./seq/seq.ts#simEngine'),
  ),
  def(
    manifest('med@1'),
    () => import('./med/med.ts'),
    () => import('noema-worker:./med/med.ts#simEngine'),
  ),
  def(
    manifest('clinic@1', ['engine:med@1']),
    () => import('./clinic/clinic.ts'),
    () => import('noema-worker:./clinic/clinic.ts#simEngine'),
  ),
  def(
    manifest('anatomy@1'),
    () => import('./anatomy/anatomy.ts'),
    () => import('noema-worker:./anatomy/anatomy.ts#simEngine'),
  ),
  def(
    manifest('timeline@1'),
    () => import('./timeline/timeline.js'),
    () => import('noema-worker:./timeline/timeline.js#simEngine'),
  ),
  def(
    manifest('music@1'),
    () => import('./music/music.ts'),
    () => import('noema-worker:./music/music.ts#simEngine'),
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
    () => import('./craft/craft.ts'),
    () => import('noema-worker:./craft/craft.ts#simEngine'),
  ),
  def(
    manifest('law@1', ['engine:logic@1']),
    () => import('./law/law.ts'),
    () => import('noema-worker:./law/law.ts#simEngine'),
  ),
  def(
    manifest('agents@1', ['engine:logic@1']),
    () => import('./agents/agents.ts'),
    () => import('noema-worker:./agents/agents.ts#simEngine'),
  ),
  def(
    manifest('field@1'),
    () => import('./field/field.ts'),
    () => import('noema-worker:./field/field.ts#simEngine'),
  ),
  def(
    manifest('des@1'),
    () => import('./des/des.ts'),
    () => import('noema-worker:./des/des.ts#simEngine'),
  ),
  def(
    manifest('philo@1', ['engine:logic@1']),
    () => import('./philo/philo.ts'),
    () => import('noema-worker:./philo/philo.ts#simEngine'),
  ),
  def(
    manifest('rhetoric@1', ['engine:logic@1']),
    () => import('./rhetoric/rhetoric.ts'),
    () => import('noema-worker:./rhetoric/rhetoric.ts#simEngine'),
  ),
  def(
    manifest('circuit-mna@1'),
    () => import('./circuit/sim.ts'),
    () => import('noema-worker:./circuit/sim.ts#simEngine'),
  ),
  def(
    manifest('thermal@1'),
    () => import('./thermal/thermal.js'),
    () => import('noema-worker:./thermal/thermal.js#adapter'),
  ),
  def(
    manifest('pid@1'),
    () => import('./pid/pid.ts'),
    () => import('noema-worker:./pid/pid.ts#adapter'),
  ),
  def(
    manifest('rf@1'),
    () => import('./rf/rf.ts'),
    () => import('noema-worker:./rf/rf.ts#simEngine'),
  ),
  def(
    manifest('twin@1'),
    () => import('./twin/twin.js'),
    () => import('noema-worker:./twin/twin.js#simEngine'),
  ),
]);
