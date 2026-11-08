/* The engine the connector runs: the app's script files, loaded once per instance in a scope of their own. */
import type { EngineApi, NoemaCurJobs, NoemaCurriculum, NoemaCurShare, NoemaCurImport, NoemaEngineCatalog, NoemaEngineRequests, NoemaImgLib, NoemaLang, NoemaLLM, NoemaPackCheck, NoemaReport, NoemaSourcePlan } from './api.ts';
import { runLegacy, type LegacyScope, type LegacySource } from './legacy.ts';

function need<T>(scope: LegacyScope, name: string): T {
  const v = scope[name];
  if (v == null) throw new Error(`the connector's engine has no ${name} (a file of engine/ is missing from src/connector/engine/sources.ts)`);
  return v as T;
}

/** The modules of the files, by the names the app knows them by. */
export function engineFrom(sources: readonly LegacySource[], provide: LegacyScope = {}): EngineApi {
  const s = runLegacy([...sources], provide);
  return {
    packCheck: need<NoemaPackCheck>(s, 'NoemaPackCheck'),
    curJobs: need<NoemaCurJobs>(s, 'NoemaCurJobs'),
    curriculum: need<NoemaCurriculum>(s, 'NoemaCurriculum'),
    curShare: (s.NoemaCurShare as NoemaCurShare | undefined) ?? null,
    curImport: need<NoemaCurImport>(s, 'NoemaCurImport'),
    sourcePlan: need<NoemaSourcePlan>(s, 'NoemaSourcePlan'),
    llm: need<NoemaLLM>(s, 'NoemaLLM'),
    imgLib: need<NoemaImgLib>(s, 'NoemaImgLib'),
    lang: need<NoemaLang>(s, 'NoemaLang'),
    report: need<NoemaReport>(s, 'NoemaReport'),
    engineRequests: need<NoemaEngineRequests>(s, 'NoemaEngineRequests'),
    // the catalogue of the engine library (src/engines/catalog.js), on the NoemaCore the composition root provides
    engineCatalog: (s.NoemaCore as { engines?: { catalog?: NoemaEngineCatalog } } | undefined)?.engines?.catalog ?? null,
  };
}
