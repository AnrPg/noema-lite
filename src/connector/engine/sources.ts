/* The app's script files the connector runs, in load order (= the order index.html loads them): the pack checks with the
   engines they check sim-spec@1 activities with, the curriculum code, the picture library, the language courses' core.
   tools/connector_bundle.mjs bundles each "legacy:<path>" import as its text (one copy: the app's own file). */
import report from 'legacy:engine/report.js';
import enginereq from 'legacy:engine/enginereq.js';
import h5p from 'legacy:engine/src/38_activity_h5p.js';
import simexpr from 'legacy:engine/src/35_simexpr.js';
import circuit from 'legacy:engine/src/36_engine_circuit.js';
import thermal from 'legacy:engine/src/39_engine_thermal.js';
import pid from 'legacy:engine/src/40_engine_pid.js';
import rf from 'legacy:engine/src/41_engine_rf.js';
import twin from 'legacy:engine/src/42_engine_twin.js';
import libCore from 'legacy:engine/src/46_lib_core.js';
import libSchema from 'legacy:engine/src/46_lib_schema.js';
import libSimkit from 'legacy:engine/src/46_lib_simkit.js';
import libSpace from 'legacy:engine/src/46_lib_space.js';
import libAgents from 'legacy:engine/src/47_lib_agents.js';
import libDes from 'legacy:engine/src/47_lib_des.js';
import libField from 'legacy:engine/src/47_lib_field.js';
import libGeom from 'legacy:engine/src/47_lib_geom.js';
import libGraph from 'legacy:engine/src/47_lib_graph.js';
import libLogic from 'legacy:engine/src/47_lib_logic.js';
import libOde from 'legacy:engine/src/47_lib_ode.js';
import libProb from 'legacy:engine/src/47_lib_prob.js';
import libAnatomy from 'legacy:engine/src/48_lib_anatomy.js';
import libClinic from 'legacy:engine/src/48_lib_clinic.js';
import libCraft from 'legacy:engine/src/48_lib_craft.js';
import libGenetics from 'legacy:engine/src/48_lib_genetics.js';
import libLaw from 'legacy:engine/src/48_lib_law.js';
import libMap from 'legacy:engine/src/48_lib_map.js';
import libMed from 'legacy:engine/src/48_lib_med.js';
import libMusic from 'legacy:engine/src/48_lib_music.js';
import libPhilo from 'legacy:engine/src/48_lib_philo.js';
import libRhetoric from 'legacy:engine/src/48_lib_rhetoric.js';
import libSeq from 'legacy:engine/src/48_lib_seq.js';
import libText from 'legacy:engine/src/48_lib_text.js';
import libTimeline from 'legacy:engine/src/48_lib_timeline.js';
import libCatalog from 'legacy:engine/src/49_lib_catalog.js';
import packcheck from 'legacy:engine/packcheck.js';
import wasm from 'legacy:engine/src/44_activity_wasm.js';
import embed from 'legacy:engine/src/45_activity_embed.js';
import llm from 'legacy:engine/llm.js';
import curriculum from 'legacy:engine/curriculum.js';
import curjobs from 'legacy:engine/curjobs.js';
import curshare from 'legacy:engine/curshare.js';
import imglib from 'legacy:engine/imglib.js';
import langcore from 'legacy:engine/langcore.js';
import curimport from 'legacy:engine/curimport.js';
import sourceplan from 'legacy:engine/sourceplan.js';
import type { LegacySource } from './legacy.ts';

const S = (path: string, text: string): LegacySource => ({ path, text });

export const LEGACY_SOURCES: readonly LegacySource[] = [
  S('engine/report.js', report), S('engine/enginereq.js', enginereq), S('engine/src/38_activity_h5p.js', h5p),
  S('engine/src/35_simexpr.js', simexpr), S('engine/src/36_engine_circuit.js', circuit),
  S('engine/src/39_engine_thermal.js', thermal), S('engine/src/40_engine_pid.js', pid), S('engine/src/41_engine_rf.js', rf), S('engine/src/42_engine_twin.js', twin),
  S('engine/src/46_lib_core.js', libCore), S('engine/src/46_lib_schema.js', libSchema), S('engine/src/46_lib_simkit.js', libSimkit), S('engine/src/46_lib_space.js', libSpace),
  S('engine/src/47_lib_agents.js', libAgents), S('engine/src/47_lib_des.js', libDes), S('engine/src/47_lib_field.js', libField), S('engine/src/47_lib_geom.js', libGeom),
  S('engine/src/47_lib_graph.js', libGraph), S('engine/src/47_lib_logic.js', libLogic), S('engine/src/47_lib_ode.js', libOde), S('engine/src/47_lib_prob.js', libProb),
  S('engine/src/48_lib_anatomy.js', libAnatomy), S('engine/src/48_lib_clinic.js', libClinic), S('engine/src/48_lib_craft.js', libCraft), S('engine/src/48_lib_genetics.js', libGenetics),
  S('engine/src/48_lib_law.js', libLaw), S('engine/src/48_lib_map.js', libMap), S('engine/src/48_lib_med.js', libMed), S('engine/src/48_lib_music.js', libMusic),
  S('engine/src/48_lib_philo.js', libPhilo), S('engine/src/48_lib_rhetoric.js', libRhetoric), S('engine/src/48_lib_seq.js', libSeq), S('engine/src/48_lib_text.js', libText),
  S('engine/src/48_lib_timeline.js', libTimeline), S('engine/src/49_lib_catalog.js', libCatalog),
  S('engine/packcheck.js', packcheck), S('engine/src/44_activity_wasm.js', wasm), S('engine/src/45_activity_embed.js', embed),
  S('engine/llm.js', llm), S('engine/curriculum.js', curriculum), S('engine/curjobs.js', curjobs), S('engine/curshare.js', curshare),
  S('engine/imglib.js', imglib), S('engine/langcore.js', langcore), S('engine/curimport.js', curimport), S('engine/sourceplan.js', sourceplan),
];
