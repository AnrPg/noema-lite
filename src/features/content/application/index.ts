/* noema-lite — the content checks as one service: createContentChecks(env) binds every check of the domain to the engines and
   runtime checkers of env (src/features/content/domain/env.ts). One source for the app (NoemaCore.content), the connector,
   the Gemini generator and the Node tools (build/noema-tools.cjs, the bridge tools/*.py and the skill call). */
import { createActivityChecks } from '../domain/activities/registry.ts';
import { ACTIVITY_RULES } from '../domain/activities/rules.ts';
import { ownSpec, partMsg, partSpec, resolveParts } from '../domain/activities/simspec.ts';
import { checkBalance } from '../domain/balance.ts';
import { checkBridge } from '../domain/bridge.ts';
import type { CheckEnv } from '../domain/env.ts';
import { checkExercise } from '../domain/exercise.ts';
import { checkPack, BLOCKS, ID_RE, TYPES, type PackCheckOptions } from '../domain/pack.ts';
import { checkQuality } from '../domain/quality.ts';
import { LANGUAGES, PACK_RULES, QUALITY, RULES } from '../domain/rules.ts';
import { checkTranslation, requiredLocales } from '../domain/translation.ts';

export type { CheckEnv } from '../domain/env.ts';
export { NO_ENGINES } from '../domain/env.ts';

export function createContentChecks(env: CheckEnv) {
  const act = createActivityChecks(env);
  return {
    /** checkPack(p, expectId?, { strict, balance, requireQuality }) → { errors, warnings, counts } */
    checkPack: (p: unknown, expectId?: unknown, opts: PackCheckOptions = {}) => checkPack(p, expectId, opts, x => act.checkActivities(x)),
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
