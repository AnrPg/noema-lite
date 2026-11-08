/* noema-lite — the check of a whole pack. Its shape is its contract (noema.pack.v3; strict: every chapter's too,
   noema.chapter.v1#chapter, and every exercise's); then what a schema cannot say: unique ids, sections and pictures that
   exist, the quantity rules (balance.ts) or the quality rules (quality.ts), the languages (translation.ts), the activities. */
import { checkBalance } from './balance.ts';
import { checkExercise, shapeOf } from './exercise.ts';
import { checkQuality } from './quality.ts';
import { QUALITY } from './rules.ts';
import { checkI18n, type Counted } from './translation.ts';
import { isObj, list, obj, objs, s, type Report } from './util.ts';

export const TYPES: ReadonlySet<string> = new Set([
  'mcq',
  'tf',
  'odd',
  'order',
  'match',
  'bucket',
  'cloze',
  'spotbug',
  'calc',
  'scenario',
  'free',
  'write',
  'flaw',
  'case',
  'predict',
  'tree',
  'inquiry',
  'debate',
  'sim',
  'img_hotspot',
  'img_sequence',
  'img_reveal',
  'img_drag',
  'img_label',
  'img_select',
  'img_occlusion',
]);
export const BLOCKS: ReadonlySet<string> = new Set([
  'p',
  'list',
  'code',
  'diagram',
  'table',
  'callout',
  'compare',
  'flow',
  'reveal',
  'ask',
  'terms',
  'figure',
  'interactive',
]);
export const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;

export interface PackCheckOptions {
  /** also check every chapter's and exercise's own contract (packs generated in the browser, where nothing else validated them) */
  readonly strict?: boolean;
  /** the minimum of the quantity rules per chapter: a number → errors; default the pack's subject.authoring.minPerKind (none → warnings, 0 = off) */
  readonly balance?: number | null;
  /** the connector: a pack built since QUALITY.since (or with no builtAt) must have subject.authoring.rules >= QUALITY.version */
  readonly requireQuality?: boolean;
}

/** checkPack(p, expectId, opts, activities) → { errors, warnings, counts }; activities: the activity checks (activities/registry.ts) */
export function checkPack(p: unknown, expectId: unknown, opts: PackCheckOptions, activities: (pack: unknown) => Report): Counted {
  const W: string[] = [];
  if (!isObj(p)) return { errors: ['not a JSON object'], warnings: W, counts: {} };
  const strict = opts.strict === true;
  const E = shapeOf('noema.pack.v3', p);
  const sj = obj(p.subject);
  if (expectId && sj.id !== expectId) E.push(`subject.id is "${s(sj.id)}" but you uploaded it as "${s(expectId)}"`);
  const media = obj(p.media);
  for (const [mid, m] of Object.entries(media)) if (isObj(m) && !m.alt) W.push(`media ${mid}: no alt text`);
  const srcIds = new Set<unknown>();
  for (const x of objs(obj(p.sources).sources)) {
    if (srcIds.has(x.id)) E.push(`duplicate source ${s(x.id)}`);
    srcIds.add(x.id);
  }
  const chapters = objs(p.chapters);
  for (const c of chapters)
    for (const r of list(c.sources))
      if (isObj(r) && r.id && srcIds.size && !srcIds.has(r.id)) W.push(`${s(c.id)}: cites unknown source "${s(r.id)}"`);
  const exIds = new Set<unknown>(),
    secIds = new Set<unknown>();
  let ex = 0,
    vis = 0,
    secN = 0;
  const used: Record<string, number> = {};
  for (const c of chapters) {
    if (strict) E.push(...shapeOf('noema.chapter.v1#chapter', { ...c, exercises: [] }, c.id));
    const mySecs = new Set<unknown>();
    for (const sec of objs(c.sections)) {
      secN++;
      if (secIds.has(sec.id)) E.push(`duplicate section ${s(sec.id)}`);
      secIds.add(sec.id);
      mySecs.add(sec.id);
      for (const b of objs(sec.blocks))
        if (b.t === 'figure' && !(typeof b.media === 'string' && media[b.media]))
          E.push(`${s(sec.id)}: figure media "${s(b.media)}" not in pack.media`);
    }
    for (const e of objs(c.exercises)) {
      ex++;
      if (exIds.has(e.id)) E.push(`duplicate exercise ${s(e.id)}`);
      exIds.add(e.id);
      if (!(typeof e.type === 'string' && TYPES.has(e.type))) continue;
      if (!secIds.has(e.section) || (strict && !mySecs.has(e.section)))
        E.push(`${s(e.id)}: section ${s(e.section)} not found in its chapter`);
      if (e.type.startsWith('img_')) {
        vis++;
        const mk = s(e.media);
        used[mk] = (used[mk] ?? 0) + 1;
        const m = media[mk];
        if (!m) {
          E.push(`${s(e.id)}: media "${mk}" not in pack.media`);
          continue;
        }
        const regs = list(Array.isArray(e.regions) ? e.regions : obj(m).regions);
        const R = new Set(regs.map(r => (isObj(r) ? r.id : undefined)));
        for (const a of [
          ...(e.type === 'img_hotspot' || e.type === 'img_sequence' ? [e.answer ?? []].flat() : []),
          ...[e.targets ?? []].flat(),
        ])
          if (!R.has(a)) E.push(`${s(e.id)}: region "${s(a)}" not found`);
      }
      if (strict) E.push(...checkExercise(e, media));
    }
  }
  const auth = obj(sj.authoring),
    qual = Number(auth.rules) >= QUALITY.version;
  if (opts.requireQuality && !qual && (!p.builtAt || s(p.builtAt) >= QUALITY.since))
    E.push(
      `subject.authoring.rules must be ${QUALITY.version} (and authoring.by "claude"): new packs meet the quality rules of tools/CONTENT_SPEC.md — start the subject with start_subject.py and rebuild with make_pack.py`,
    );
  if (qual) {
    const hard = auth.by === 'claude' || auth.by === 'gemini';
    for (const c of chapters) for (const i of checkQuality(c, sj)) (i.level === 'error' && hard ? E : W).push(i.msg);
  } else {
    const per = opts.balance ?? (auth.minPerKind as number | null | undefined);
    if (per !== 0) for (const c of chapters) for (const i of checkBalance(c, sj, { min: per ?? undefined })) (per ? E : W).push(i.msg);
  }
  checkI18n(p, chapters, E, W);
  const A = activities(p);
  E.push(...A.errors);
  W.push(...A.warnings);
  for (const mid of Object.keys(media)) if ((used[mid] ?? 0) < 3) W.push(`picture ${mid} has ${used[mid] ?? 0} exercises (aim for >= 3)`);
  return {
    errors: E,
    warnings: W,
    counts: { chapters: chapters.length, sections: secN, exercises: ex, visual: vis, media: Object.keys(media).length },
  };
}
