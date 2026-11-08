/* noema-lite — the content checks as one service: createContentChecks(env) binds every check of the domain to the engines and
   runtime checkers of env (src/features/content/domain/env.ts). One source for the app (NoemaCore.content), the connector,
   the Gemini generator and the Node tools (build/noema-tools.cjs, the bridge tools/*.py and the skill call). */
import { createActivityChecks } from '../domain/activities/registry.ts';
import { ACTIVITY_RULES } from '../domain/activities/rules.ts';
import { ownSpec, partMsg, partSpec, resolveParts } from '../domain/activities/simspec.ts';
import { checkBalance } from '../domain/balance.ts';
import { checkBridge } from '../domain/bridge.ts';
import { checkChapter, checkSubject, type ChapterOptions } from '../domain/chapter.ts';
import { envOf, type CheckEnv, type EngineSource, type H5PChecks, type RuntimeCheckers, type RuntimeHost } from '../domain/env.ts';
import { checkExercise } from '../domain/exercise.ts';
import { checkPack, BLOCKS, ID_RE, TYPES, type PackCheckOptions } from '../domain/pack.ts';
import { checkQuality } from '../domain/quality.ts';
import { LANGUAGES, PACK_RULES, QUALITY, RULES } from '../domain/rules.ts';
import { checkTranslation, requiredLocales } from '../domain/translation.ts';

export type { CheckEnv, EngineSource, RuntimeCheckers, RuntimeHost } from '../domain/env.ts';
export { NO_ENGINES } from '../domain/env.ts';

export function createContentChecks(env: CheckEnv) {
  const act = createActivityChecks(env);
  return {
    /** checkPack(p, expectId?, { strict, balance, requireQuality }) → { errors, warnings, counts } */
    checkPack: (p: unknown, expectId?: unknown, opts: PackCheckOptions = {}) => checkPack(p, expectId, opts, x => act.checkActivities(x)),
    /** the authoring check of one chapter file (the skill's validate): checkChapter(chapter, options) → { errors, warnings, summary } */
    checkChapter: (ch: unknown, o: Omit<ChapterOptions, 'checkBlock' | 'checkSim'> = {}) =>
      checkChapter(ch, { ...o, checkBlock: act.checkBlockAct, checkSim: act.checkSim }),
    checkSubject,
    checkActivities: act.checkActivities,
    checkActivityPackages: act.checkActivityPackages,
    checkSimSpec: act.checkSimSpec,
    partsPlan: act.partsPlan,
    resolveParts,
    partSpec,
    partMsg,
    freeVars: act.freeVars,
    ownSpec,
    specNames: act.specNames,
    needRequires: act.needRequires,
    enginesNamed: act.enginesNamed,
    lintHtml: act.lintHtml,
    lintPython: act.lintPython,
    checkExercise,
    checkBalance,
    checkQuality,
    checkBridge,
    checkTranslation,
    requiredLocales,
    ACTIVITY_RULES,
    RULES,
    QUALITY,
    LANGS: LANGUAGES,
    PACK_RULES,
    TYPES,
    BLOCKS,
    ID_RE,
  };
}
export type ContentChecks = ReturnType<typeof createContentChecks>;

/** the content checks of a composition root (NoemaCore.content): its engine library, and where its activity runtimes publish
    their checkers (the page for the app and the activity host; the scope that ran engine/src/38, 44, 45 for the connector and
    the Node tools) */
export const contentChecks = (engines: EngineSource, host: RuntimeHost): ContentChecks => createContentChecks(envOf(engines, host));

/** the runtimes' checkers of a root: the typed ones it hands in (src/runtimes RUNTIME_CHECKS) and those the runtimes still loaded
    as scripts publish in a scope (the page, or the scope that ran them: NoemaH5P), read when a check runs */
export const scopeCheckers =
  (scope: () => Readonly<Record<string, unknown>>, typed: Partial<RuntimeCheckers>): RuntimeHost =>
  () => {
    const s = scope();
    return {
      wasm: typed.wasm ?? null,
      h5p: typed.h5p ?? ((s.NoemaH5P ?? null) as H5PChecks | null),
      embed: typed.embed ?? null,
    };
  };
