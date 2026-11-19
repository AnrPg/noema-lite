/* noema-lite — the content checks as one service: createContentChecks(env) binds every check of the domain to the engines and
   runtime checkers of env (src/features/content/domain/env.ts). One source for the app (NoemaCore.content), the connector,
   the Gemini generator and the Node tools (build/noema-tools.cjs, the bridge tools/*.py and the skill call). */
import { auditPack, auditReport, AUDIT_BARS, JUDGEMENT } from '../domain/audit.ts';
import { createActivityChecks } from '../domain/activities/registry.ts';
import { ACTIVITY_RULES } from '../domain/activities/rules.ts';
import { ownSpec, partMsg, partSpec, resolveParts } from '../domain/activities/simspec.ts';
import { checkBalance } from '../domain/balance.ts';
import { checkBridge } from '../domain/bridge.ts';
import { checkChapter, checkSubject, type ChapterOptions } from '../domain/chapter.ts';
import { envOf, type CheckEnv, type EngineSource, type RuntimeCheckers, type RuntimeHost } from '../domain/env.ts';
import { checkExercise } from '../domain/exercise.ts';
import { checkPack, BLOCKS, ID_RE, TYPES, type PackCheckOptions } from '../domain/pack.ts';
import { checkQuality } from '../domain/quality.ts';
import { LANGUAGES, PACK_RULES, QUALITY, RULES } from '../domain/rules.ts';
import { checkTranslation, parsePair, requiredLocales, scopeOf } from '../domain/translation.ts';

export type { CheckEnv, EngineSource, RuntimeCheckers, RuntimeHost } from '../domain/env.ts';
export { NO_ENGINES } from '../domain/env.ts';

const isObjLike = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createContentChecks(env: CheckEnv) {
  const act = createActivityChecks(env);
  return {
    /** checkPack(p, expectId?, { strict, balance, requireQuality }) → { errors, warnings, counts } */
    checkPack: (p: unknown, expectId?: unknown, opts: PackCheckOptions = {}) => checkPack(p, expectId, opts, x => act.checkActivities(x)),
    /** the deep audit (domain/audit.ts): every rule at today's strictness — whatever the pack's authoring.rules, authoring.by
        or builtAt say — plus the learning report per chapter (depth, gradual, retention, interactivity, variety) and the
        judgement questions; auditPack(p) → PackAudit, auditReport(audit) → text */
    auditPack: (p: unknown) => {
      const q = isObjLike(p) ? (JSON.parse(JSON.stringify(p)) as Record<string, unknown>) : p;
      if (isObjLike(q)) {
        const sj = isObjLike(q.subject) ? q.subject : {};
        const auth = isObjLike(sj.authoring) ? sj.authoring : {};
        q.subject = { ...sj, authoring: { ...auth, rules: Math.max(QUALITY.gradual.rules, Number(auth.rules) || 0), by: 'claude' } };
        delete q.builtAt;
      }
      const rules = checkPack(q, undefined, { requireQuality: true }, x => act.checkActivities(x));
      return auditPack(q, rules, env.suggest ?? null);
    },
    auditReport,
    AUDIT_BARS,
    JUDGEMENT,
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
    scopeOf,
    parsePair,
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

/** the content checks of a composition root (NoemaCore.content): its engine library and its runtimes' checkers */
export const contentChecks = (engines: EngineSource, host: RuntimeHost): ContentChecks => createContentChecks(envOf(engines, host));

/** the runtimes' checkers of a root: the typed ones it hands in (src/runtimes RUNTIME_CHECKS) */
export const runtimeCheckers =
  (typed: Partial<RuntimeCheckers>): RuntimeHost =>
  () => ({ wasm: typed.wasm ?? null, h5p: typed.h5p ?? null, embed: typed.embed ?? null });
