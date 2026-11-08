/**
 * "Practise these results" (docs/SEARCH.md §6): one round from the results shown — per subject its exercises found
 * (≤ 60), then its flashcards found (≤ 60); per language course the recall drill of the vocabulary fields of the words and
 * meanings found, and the lessons found (≤ 8 language steps in all). The words of each step's title are the caller's.
 */
import { textOf } from '../../../kernel/text.ts';
import type { SearchRecord } from './records.ts';

export const ROUND_MAX_ITEMS = 60;
export const ROUND_MAX_LANG = 8;

export type RoundStep =
  | { readonly kind: 'ex'; readonly sj: string; readonly subject: string; readonly ids: string[]; readonly n: number }
  | { readonly kind: 'cards'; readonly sj: string; readonly subject: string; readonly keys: string[]; readonly n: number }
  | {
      readonly kind: 'lang';
      readonly co: string;
      readonly href: string;
      readonly field?: string;
      readonly fieldTitle?: string;
      readonly lesson?: string;
    };

const str = (x: unknown): string => (x == null ? '' : textOf(x));
const enc = encodeURIComponent;

/**
 * The steps of a round from groups of results ([kind, [{ r }…]]…); `byKey` finds another record of the index (a
 * subject's title, a word's meanings and their fields).
 */
export function roundSteps(
  groups: Iterable<readonly [string, readonly { readonly r: SearchRecord }[]]>,
  byKey: (key: string) => SearchRecord | null | undefined,
): RoundStep[] {
  const bySj = new Map<string, { ex: string[]; cards: string[] }>(),
    langs = new Map<string, RoundStep>();
  for (const [, list] of groups)
    for (const { r } of list) {
      const x = r.x ?? {};
      if ((r.ty === 'exercise' || r.ty === 'card') && r.sj) {
        let g = bySj.get(r.sj);
        if (!g) bySj.set(r.sj, (g = { ex: [], cards: [] }));
        if (r.ty === 'exercise') g.ex.push(str(x['exid']));
        else g.cards.push(str(x['card']));
      } else if (r.w === 'lang' && r.co && (r.ty === 'word' || r.ty === 'meaning' || r.ty === 'field' || r.ty === 'lesson')) {
        const co = r.co;
        const fields =
          r.ty === 'meaning' || r.ty === 'field'
            ? [str(x['field'])]
            : r.ty === 'word'
              ? (Array.isArray(x['senses']) ? (x['senses'] as unknown[]) : []).map(s => str(byKey(`l:${co}:c:${str(s)}`)?.x?.['field']))
              : [];
        for (const f of fields.filter(Boolean)) {
          const k = co + '|f|' + f;
          if (!langs.has(k))
            langs.set(k, {
              kind: 'lang',
              co,
              field: f,
              fieldTitle: byKey(`l:${co}:f:${f}`)?.ti || f,
              href: `#/lang/${enc(co)}/recall/${enc(f)}`,
            });
        }
        if (r.ty === 'lesson') {
          const k = co + '|l|' + str(x['node']);
          if (!langs.has(k)) langs.set(k, { kind: 'lang', co, lesson: r.ti, href: r.h });
        }
      }
    }
  const steps: RoundStep[] = [];
  for (const [sj, g] of bySj) {
    const subject = byKey('s:' + sj)?.ti || sj;
    if (g.ex.length)
      steps.push({ kind: 'ex', sj, subject, ids: g.ex.slice(0, ROUND_MAX_ITEMS), n: Math.min(g.ex.length, ROUND_MAX_ITEMS) });
    if (g.cards.length)
      steps.push({ kind: 'cards', sj, subject, keys: g.cards.slice(0, ROUND_MAX_ITEMS), n: Math.min(g.cards.length, ROUND_MAX_ITEMS) });
  }
  steps.push(...[...langs.values()].slice(0, ROUND_MAX_LANG));
  return steps;
}
