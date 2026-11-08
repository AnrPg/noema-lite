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
  NoemaSourcePlan,
} from './api.ts';
import { runLegacy, type LegacyScope, type LegacySource } from './legacy.ts';
import { contentChecks, type EngineSource } from '../../features/content/application/index.ts';

/** A module the files must have made (its type is the one api.ts declares for it). */
function need(scope: LegacyScope, name: string): unknown {
  const v = scope[name];
  if (v == null)
    throw new Error(`the connector's engine has no ${name} (a file of engine/ is missing from src/connector/engine/sources.ts)`);
  return v;
}

/** The modules of the files, by the names the app knows them by. provide.NoemaCore (the contracts and the engine library of the
    composition root) gets the content checks (NoemaCore.content, as in the app), with the runtimes' checkers of this scope. */
export function engineFrom(sources: readonly LegacySource[], provide: LegacyScope = {}): EngineApi {
  let s: LegacyScope = {};
  const core = (provide.NoemaCore ?? {}) as { engines?: EngineSource };
  if (!core.engines) throw new Error("the connector's engine needs NoemaCore.engines (the engine library) from its composition root");
  const content = contentChecks(core.engines, () => s);
  s = runLegacy([...sources], { ...provide, NoemaCore: Object.freeze({ ...core, content }) });
  return {
    content,
    curJobs: need(s, 'NoemaCurJobs') as NoemaCurJobs,
    curriculum: need(s, 'NoemaCurriculum') as NoemaCurriculum,
    curShare: (s.NoemaCurShare as NoemaCurShare | undefined) ?? null,
    curImport: need(s, 'NoemaCurImport') as NoemaCurImport,
    sourcePlan: need(s, 'NoemaSourcePlan') as NoemaSourcePlan,
    llm: need(s, 'NoemaLLM') as NoemaLLM,
    imgLib: need(s, 'NoemaImgLib') as NoemaImgLib,
    lang: need(s, 'NoemaLang') as NoemaLang,
    // the catalogue of the engine library (src/engines/catalog.ts), on the NoemaCore the composition root provides
    engineCatalog: (s.NoemaCore as { engines?: { catalog?: NoemaEngineCatalog } } | undefined)?.engines?.catalog ?? null,
  };
}
