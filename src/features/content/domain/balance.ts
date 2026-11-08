/* noema-lite — the quantity rules every new chapter meets (rules.ts RULES: every exercise type, difficulty and focus tag at
   least `min` times; tools/CONTENT_SPEC.md "Balance"). subject.features.code / .math make the rules' feature values required;
   'pictures' when the chapter has a picture (docs/VISUAL.md §5: only pictures that teach). The caller decides whether the
   issues are errors or warnings (pack.ts, chapter.ts). */
import { RULES } from './rules.ts';
import { list, obj, objs, s } from './util.ts';

export interface BalanceIssue {
  readonly rule: string;
  readonly chapter: unknown;
  readonly value: string | number;
  readonly have: number;
  readonly need: number;
  readonly msg: string;
}

/** a chapter has a picture: a picture exercise or a figure block */
export const hasPicture = (chapter: unknown): boolean => {
  const c = obj(chapter);
  return (
    objs(c.exercises).some(e => s(e.type).startsWith('img_')) || objs(c.sections).some(x => objs(x.blocks).some(b => b.t === 'figure'))
  );
};

/** checkBalance(chapter, subject, { min }) → every required value of every rule (and every optional one the chapter uses) at
    least `min` times (default: each rule's own min) */
export function checkBalance(chapter: unknown, subject: unknown, opts: { readonly min?: number | undefined } = {}): BalanceIssue[] {
  const c = obj(chapter),
    ex = objs(c.exercises),
    out: BalanceIssue[] = [];
  const on = [
    ...Object.entries(obj(obj(subject).features))
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k),
    ...(hasPicture(c) ? ['pictures'] : []),
  ];
  for (const r of RULES) {
    const n = opts.min ?? r.min,
      have = new Map<unknown, number>();
    for (const e of ex) for (const v of r.field === 'tags' ? list(e.tags) : [e[r.field]]) have.set(v, (have.get(v) ?? 0) + 1);
    const features: Readonly<Record<string, readonly (string | number)[]>> = r.features;
    const optional = new Set<unknown>(Object.values(features).flat());
    const need = new Set<unknown>([...r.always, ...on.flatMap(f => features[f] ?? []), ...[...have.keys()].filter(v => optional.has(v))]);
    for (const v of need) {
      const h = have.get(v) ?? 0;
      if (h < n)
        out.push({
          rule: r.id,
          chapter: c.id,
          value: v as string | number,
          have: h,
          need: n,
          msg: `${s(c.id)}: [${r.id}] ${s(v)}: ${h} exercise(s), need >= ${n} per chapter (${r.what}, tools/CONTENT_SPEC.md)`,
        });
    }
  }
  return out;
}
