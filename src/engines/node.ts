/* The engine library with every engine already in hand: static imports of the same modules and Worker bundles as plugins.ts, for
   node, where nothing is fetched and everything is needed at once: the tests (build/engines-node.cjs, an entry of tools/esbuild.mjs,
   loaded by tests/engines.cjs) and the connector (src/composition/connector.ts: its checks of a pack run synchronously).
   src/engines/plugins.test.ts checks that it lists exactly the plugins of plugins.ts. */
import { createEngineLibrary, type EngineLibrary } from './library.ts';
import { ENGINE_PLUGINS } from './plugins.ts';
import type { EngineModule, KernelApi } from './types.ts';
import NoemaExpr from './kernel/simexpr.ts';
import NoemaLibCore from './kernel/core.js';
import NoemaSimKit from './kernel/simkit.js';
import NoemaSpaceKit from './kernel/space.js';
import NoemaLibSchema from './kernel/schema.js';
import NoemaCircuit from './circuit/circuit.js';
import m0 from './ode/ode.js';
import w0 from 'noema-worker:./ode/ode.js#simEngine';
import m1 from './prob/prob.ts';
import w1 from 'noema-worker:./prob/prob.ts#simEngine';
import m2 from './logic/logic.js';
import w2 from 'noema-worker:./logic/logic.js#simEngine';
import m3 from './graph/graph.js';
import w3 from 'noema-worker:./graph/graph.js#simEngine';
import m4 from './geom/geom.js';
import w4 from 'noema-worker:./geom/geom.js#simEngine';
import m5 from './genetics/genetics.js';
import w5 from 'noema-worker:./genetics/genetics.js#simEngine';
import m6 from './seq/seq.ts';
import w6 from 'noema-worker:./seq/seq.ts#simEngine';
import m7 from './med/med.js';
import w7 from 'noema-worker:./med/med.js#simEngine';
import m8 from './clinic/clinic.js';
import w8 from 'noema-worker:./clinic/clinic.js#simEngine';
import m9 from './anatomy/anatomy.js';
import w9 from 'noema-worker:./anatomy/anatomy.js#simEngine';
import m10 from './timeline/timeline.js';
import w10 from 'noema-worker:./timeline/timeline.js#simEngine';
import m11 from './music/music.js';
import w11 from 'noema-worker:./music/music.js#simEngine';
import m12 from './map/map.js';
import w12 from 'noema-worker:./map/map.js#simEngine';
import m13 from './text/text.js';
import w13 from 'noema-worker:./text/text.js#simEngine';
import m14 from './craft/craft.js';
import w14 from 'noema-worker:./craft/craft.js#simEngine';
import m15 from './law/law.js';
import w15 from 'noema-worker:./law/law.js#simEngine';
import m16 from './agents/agents.js';
import w16 from 'noema-worker:./agents/agents.js#simEngine';
import m17 from './field/field.js';
import w17 from 'noema-worker:./field/field.js#simEngine';
import m18 from './des/des.js';
import w18 from 'noema-worker:./des/des.js#simEngine';
import m19 from './philo/philo.js';
import w19 from 'noema-worker:./philo/philo.js#simEngine';
import m20 from './rhetoric/rhetoric.ts';
import w20 from 'noema-worker:./rhetoric/rhetoric.ts#simEngine';
import m21 from './circuit/sim.js';
import w21 from 'noema-worker:./circuit/sim.js#simEngine';
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
  schema: NoemaLibSchema as unknown as KernelApi,
  circuit: NoemaCircuit,
});
/** a library with every engine loaded */
export function nodeEngines(): EngineLibrary {
  const lib = createEngineLibrary({ plugins: ENGINE_PLUGINS, schema: () => Promise.resolve(NoemaLibSchema) });
  for (const [id, [m, w]] of Object.entries(IN_HAND)) lib.adopt(id, m, w);
  lib.adoptSchema(NoemaLibSchema);
  return lib;
}
