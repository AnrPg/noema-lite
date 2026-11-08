/* The app's script files the connector runs, in load order (= the order index.html loads them): the activity runtimes'
   package checkers (h5p, wasm: the content checks of src/features/content read them), the curriculum code, the picture library, the language courses' core. tools/connector_bundle.mjs bundles each "legacy:<path>"
   import as its text (one copy: the app's own file). The data contracts and the engine library they read are ES modules
   (src/contracts, src/engines): src/composition/connector.ts hands them to these files as NoemaCore. */
import h5p from 'legacy:engine/src/38_activity_h5p.js';
import wasm from 'legacy:engine/src/44_activity_wasm.js';
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
  S('engine/src/38_activity_h5p.js', h5p),
  S('engine/src/44_activity_wasm.js', wasm),
  S('engine/llm.js', llm),
  S('engine/curriculum.js', curriculum),
  S('engine/curjobs.js', curjobs),
  S('engine/curshare.js', curshare),
  S('engine/imglib.js', imglib),
  S('engine/langcore.js', langcore),
  S('engine/curimport.js', curimport),
  S('engine/sourceplan.js', sourceplan),
];
