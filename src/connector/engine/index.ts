/* The engine the connector runs: the app's script files, loaded once per instance in a scope of their own. */
import type {
  EngineApi,
  NoemaCurJobs,
  NoemaCurriculum,
  NoemaCurShare,
  NoemaCurImport,
  NoemaEngineCatalog,
  NoemaImgLib,
  NoemaLang,
  NoemaLLM,
  NoemaPackCheck,
  NoemaSourcePlan,
} from './api.ts';
import { runLegacy, type LegacyScope, type LegacySource } from './legacy.ts';

/** A module the files must have made (its type is the one api.ts declares for it). */
function need(scope: LegacyScope, name: string): unknown {
  const v = scope[name];
  if (v == null)
    throw new Error(`the connector's engine has no ${name} (a file of engine/ is missing from src/connector/engine/sources.ts)`);
  return v;
}

/** The modules of the files, by the names the app knows them by. */
export function engineFrom(sources: readonly LegacySource[], provide: LegacyScope = {}): EngineApi {
  const s = runLegacy([...sources], provide);
  return {
    packCheck: need(s, 'NoemaPackCheck') as NoemaPackCheck,
    curJobs: need(s, 'NoemaCurJobs') as NoemaCurJobs,
    curriculum: need(s, 'NoemaCurriculum') as NoemaCurriculum,
    curShare: (s.NoemaCurShare as NoemaCurShare | undefined) ?? null,
    curImport: need(s, 'NoemaCurImport') as NoemaCurImport,
    sourcePlan: need(s, 'NoemaSourcePlan') as NoemaSourcePlan,
    llm: need(s, 'NoemaLLM') as NoemaLLM,
    imgLib: need(s, 'NoemaImgLib') as NoemaImgLib,
    lang: need(s, 'NoemaLang') as NoemaLang,
    // the catalogue of the engine library (src/engines/catalog.js), on the NoemaCore the composition root provides
    engineCatalog: (s.NoemaCore as { engines?: { catalog?: NoemaEngineCatalog } } | undefined)?.engines?.catalog ?? null,
  };
}
