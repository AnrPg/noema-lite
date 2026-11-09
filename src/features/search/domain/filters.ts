/**
 * The filters of a search that need more than the record (docs/SEARCH.md §1): the scope "only here" (a subject, a course,
 * a Roadmap and the subjects of its stations) and the learner's status (unread sections, unsolved or wrongly answered
 * exercises). The learner's data comes in through `StatusSource`, so this stays pure.
 */
import { hereOf, type SearchParams } from './params.ts';
import type { SearchRecord } from './records.ts';

/** What the status filter reads of a subject: which sections were read, how each exercise went. */
export interface SubjectStatus {
  readonly read?: Readonly<Record<string, unknown>>;
  readonly res?: Readonly<Record<string, { readonly ok?: number; readonly last?: boolean } | undefined>>;
}
export interface StatusSource {
  /** the learner's status in a subject (null: nothing yet) */
  subject(id: string): SubjectStatus | null;
  /** the subjects (pack ids) of a Roadmap's stations */
  roadmapPacks(id: string): readonly string[];
}

export type Keep = (r: SearchRecord) => boolean;

const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/** The filters of a search as one test per record (null: no such filter). */
export function keeper(P: SearchParams, src: StatusSource): Keep | null {
  const tests: Keep[] = [];
  const hh = hereOf(P);
  if (hh && P.in) {
    if (hh.kind === 'subj') tests.push(r => r.sj === hh.id);
    else if (hh.kind === 'course') tests.push(r => r.co === hh.id);
    else {
      const packs = new Set(src.roadmapPacks(hh.id));
      tests.push(r => r.cu === hh.id || (!!r.sj && packs.has(r.sj)));
    }
  }
  const want = P.st;
  if (want) {
    const cache = new Map<string, SubjectStatus>();
    const status = (id: string): SubjectStatus => {
      let s = cache.get(id);
      if (!s) cache.set(id, (s = src.subject(id) ?? {}));
      return s;
    };
    tests.push(r => {
      if (!r.sj) return false;
      const s = status(r.sj);
      if (want === 'unread') return (r.ty === 'section' || r.ty === 'theory') && !(s.read ?? {})[str(r.x?.['sec'])];
      if (want === 'unsolved') return r.ty === 'exercise' && !(((s.res ?? {})[str(r.x?.['exid'])]?.ok ?? 0) > 0);
      if (want === 'wrong') return r.ty === 'exercise' && (s.res ?? {})[str(r.x?.['exid'])]?.last === false;
      return true;
    });
  }
  return tests.length ? r => tests.every(t => t(r)) : null;
}
