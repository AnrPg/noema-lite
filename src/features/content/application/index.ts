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

/** the pack's rules plus the authoring check of each chapter and translated chapter, with the options make_pack.py gives it
    (Claude's quality level, the pack's features, the other chapters for Q0, the pictures and activities, minVisual) —
    each message once, prefixed with its chapter */
function withChapterChecks(
  p: Record<string, unknown>,
  rules: { errors: string[]; warnings: string[] },
  check: (c: unknown, o: Omit<ChapterOptions, 'checkBlock' | 'checkSim'>) => { errors: readonly string[]; warnings: readonly string[] },
): { errors: string[]; warnings: string[] } {
  const o = (v: unknown): Record<string, unknown> => (isObjLike(v) ? v : {});
  const sj = o(p.subject),
    auth = o(sj.authoring),
    chapters = (Array.isArray(p.chapters) ? p.chapters : []).filter(isObjLike);
  const features = Object.entries(o(sj.features))
    .filter(([, v]) => !!v)
    .map(([k]) => k);
  const media = Object.fromEntries(
    Object.entries(o(p.media)).map(([k, v]) => [k, { w: o(v).w, h: o(v).h, regions: o(v).regions }]),
  ) as Record<string, unknown>;
  const items = Array.isArray(o(p.activities).items) ? (o(p.activities).items as unknown[]).filter(isObjLike) : null;
  const activities = items
    ? (Object.fromEntries(
        items.map(a => [String(a.id), Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'html' && k !== 'python'))]),
      ) as ChapterOptions['activities'])
    : undefined;
  const slim = chapters.map(c => ({ id: c.id, map: { concepts: Array.isArray(o(c.map).concepts) ? o(c.map).concepts : [] } }));
  const base = {
    media,
    minVisual: Number(auth.minVisualPerChapter ?? 3) || 0,
    ...(activities ? { activities } : {}),
    ...(auth.known !== undefined ? { known: auth.known } : {}),
  };
  const E = new Set(rules.errors),
    W = new Set(rules.warnings);
  const add = (cid: string, r: { errors: readonly string[]; warnings: readonly string[] }, warnTagged: boolean): void => {
    for (const m of r.errors) E.add(m.startsWith(cid + ': ') ? m : `${cid}: ${m}`);
    for (const m of r.warnings) if (!warnTagged || m.startsWith('[')) W.add(m.startsWith(cid + ': ') ? m : `${cid}: ${m}`);
  };
  chapters.forEach((c, i) => {
    const cid = typeof c.id === 'string' ? c.id : `chapter ${String(i + 1)}`;
    add(
      cid,
      check(c, {
        ...base,
        quality: 'error',
        features,
        rules: Math.max(QUALITY.gradual.rules, Number(auth.rules) || 0),
        before: slim.slice(0, i),
        after: slim.slice(i + 1),
      }),
      true,
    );
  });
  const byId = new Map(chapters.map(c => [c.id, c]));
  for (const [loc, t] of Object.entries(o(p.translations)))
    for (const c of (Array.isArray(o(t).chapters) ? (o(t).chapters as unknown[]) : []).filter(isObjLike)) {
      const src = byId.get(c.id);
      if (src) add(`translations/${loc}/${String(c.id)}`, check(c, { ...base, source: src }), true);
    }
  // the quality issues checkPack found already come back from the chapter check: each message once
  return { ...rules, errors: [...E], warnings: [...W] };
}

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
      const pack = checkPack(q, undefined, { requireQuality: true, strict: true }, x => act.checkActivities(x)); // strict: every chapter and exercise contract too (an ungradable exercise is never 'high')
      // one validator: the authoring check of every chapter (make_pack.py, pipeline.py check … write, validate.py) is part of
      // the audit, so anything those refuse is a rule error here too (card ids, a spotbug's fix, tags, model-answer keywords…)
      const rules = isObjLike(q)
        ? withChapterChecks(q, pack, (c, o) => checkChapter(c, { ...o, checkBlock: act.checkBlockAct, checkSim: act.checkSim }))
        : pack;
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
