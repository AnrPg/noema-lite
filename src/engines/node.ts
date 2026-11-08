/* The engine library with every engine already in hand: static imports of the same modules and Worker bundles as plugins.ts, for
   node, where nothing is fetched and everything is needed at once: the tests (build/engines-node.cjs, an entry of tools/esbuild.mjs,
   loaded by tests/engines.cjs) and the connector (src/composition/connector.ts: its checks of a pack run synchronously).
   src/engines/plugins.test.ts checks that it lists exactly the plugins of plugins.ts. */
import { createEngineLibrary, type EngineLibrary } from './library.ts';
import { ENGINE_PLUGINS } from './plugins.ts';
import type { EngineModule } from './types.ts';
import NoemaExpr from './kernel/simexpr.ts';
import NoemaLibCore from './kernel/core.ts';
import NoemaSimKit from './kernel/simkit.ts';
import NoemaSpaceKit from './kernel/space.ts';
import NoemaLibSchema from './kernel/schema.ts';
import NoemaCircuit from './circuit/circuit.ts';
import m0 from './ode/ode.js';
import w0 from 'noema-worker:./ode/ode.js#simEngine';
import m1 from './prob/prob.ts';
import w1 from 'noema-worker:./prob/prob.ts#simEngine';
import m2 from './logic/logic.ts';
import w2 from 'noema-worker:./logic/logic.ts#simEngine';
import m3 from './graph/graph.ts';
import w3 from 'noema-worker:./graph/graph.ts#simEngine';
import m4 from './geom/geom.ts';
import w4 from 'noema-worker:./geom/geom.ts#simEngine';
import m5 from './genetics/genetics.ts';
import w5 from 'noema-worker:./genetics/genetics.ts#simEngine';
import m6 from './seq/seq.ts';
import w6 from 'noema-worker:./seq/seq.ts#simEngine';
import m7 from './med/med.ts';
import w7 from 'noema-worker:./med/med.ts#simEngine';
import m8 from './clinic/clinic.ts';
import w8 from 'noema-worker:./clinic/clinic.ts#simEngine';
import m9 from './anatomy/anatomy.ts';
import w9 from 'noema-worker:./anatomy/anatomy.ts#simEngine';
import m10 from './timeline/timeline.js';
import w10 from 'noema-worker:./timeline/timeline.js#simEngine';
import m11 from './music/music.js';
import w11 from 'noema-worker:./music/music.js#simEngine';
import m12 from './map/map.ts';
import w12 from 'noema-worker:./map/map.ts#simEngine';
import m13 from './text/text.js';
import w13 from 'noema-worker:./text/text.js#simEngine';
import m14 from './craft/craft.ts';
import w14 from 'noema-worker:./craft/craft.ts#simEngine';
import m15 from './law/law.ts';
import w15 from 'noema-worker:./law/law.ts#simEngine';
import m16 from './agents/agents.ts';
import w16 from 'noema-worker:./agents/agents.ts#simEngine';
import m17 from './field/field.ts';
import w17 from 'noema-worker:./field/field.ts#simEngine';
import m18 from './des/des.ts';
import w18 from 'noema-worker:./des/des.ts#simEngine';
import m19 from './philo/philo.js';
import w19 from 'noema-worker:./philo/philo.js#simEngine';
import m20 from './rhetoric/rhetoric.ts';
import w20 from 'noema-worker:./rhetoric/rhetoric.ts#simEngine';
import m21 from './circuit/sim.ts';
import w21 from 'noema-worker:./circuit/sim.ts#simEngine';
import m22 from './thermal/thermal.js';
import w22 from 'noema-worker:./thermal/thermal.js#adapter';
import m23 from './pid/pid.js';
import w23 from 'noema-worker:./pid/pid.js#adapter';
import m24 from './rf/rf.ts';
import w24 from 'noema-worker:./rf/rf.ts#simEngine';
import m25 from './twin/twin.js';
import w25 from 'noema-worker:./twin/twin.js#simEngine';

/** id → [module, Worker bundle] */
export const IN_HAND: Readonly<Record<string, readonly [EngineModule, string]>> = Object.freeze({
  'ode@1': [m0, w0],
  'prob@1': [m1, w1],
  'logic@1': [m2, w2],
  'graph@1': [m3, w3],
  'geom@1': [m4, w4],
  'genetics@1': [m5, w5],
  'seq@1': [m6, w6],
  'med@1': [m7, w7],
  'clinic@1': [m8, w8],
  'anatomy@1': [m9, w9],
  'timeline@1': [m10, w10],
  'music@1': [m11, w11],
  'map@1': [m12, w12],
  'text@1': [m13, w13],
  'craft@1': [m14, w14],
  'law@1': [m15, w15],
  'agents@1': [m16, w16],
  'field@1': [m17, w17],
  'des@1': [m18, w18],
  'philo@1': [m19, w19],
  'rhetoric@1': [m20, w20],
  'circuit-mna@1': [m21, w21],
  'thermal@1': [m22, w22],
  'pid@1': [m23, w23],
  'rf@1': [m24, w24],
  'twin@1': [m25, w25],
});
/** the kernels, for their own tests */
export const KERNELS = Object.freeze({
  expr: NoemaExpr,
  core: NoemaLibCore,
  simkit: NoemaSimKit,
  space: NoemaSpaceKit,
  schema: NoemaLibSchema,
  circuit: NoemaCircuit,
});
/** a library with every engine loaded */
export function nodeEngines(): EngineLibrary {
  const lib = createEngineLibrary({ plugins: ENGINE_PLUGINS, schema: () => Promise.resolve(NoemaLibSchema) });
  for (const [id, [m, w]] of Object.entries(IN_HAND)) lib.adopt(id, m, w);
  lib.adoptSchema(NoemaLibSchema);
  return lib;
}
