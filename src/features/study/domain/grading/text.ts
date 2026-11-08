/**
 * How typed answers are compared: the same normal form, small-typo tolerance and keyword check for every exercise type.
 */
import { textOf } from '../../../../kernel/text.ts';

/** Any answer value as text, the way the old UI's String(x) wrote it (nothing: ""). */
export const str = (x: unknown): string => (x == null ? '' : textOf(x));

/** The form answers are compared in: lower case, curly quotes straight, every run of spaces one space, no final ";". */

export const norm = (s: unknown): string =>
  str(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/;$/, '').trim();

/** Levenshtein distance (insert, delete, substitute: 1 each). */
export function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (!m || !n) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n] ?? 0;
}

export interface LabelMatch {
  readonly ok: boolean;
  /** Right, but with a small typo (shown to the learner). */
  readonly typo?: true;
}

/** A typed name against a part's label and its accepted aliases; fuzzy: one small typo per ~7 letters (words of 4+). */
export function labelMatch(label: string, accept: readonly string[], given: unknown, fuzzy = true): LabelMatch {
  const v = norm(given);
  if (!v) return { ok: false };
  const alts = [label, ...accept].map(norm);
  if (alts.includes(v)) return { ok: true };
  if (fuzzy)
    for (const a of alts) if (a.length >= 4 && levenshtein(a, v) <= Math.max(1, Math.floor(a.length / 7))) return { ok: true, typo: true };
  return { ok: false };
}

/** The keywords a written answer leaves out (case and spacing do not matter). */
export const missingKeywords = (keywords: readonly string[], text: string): string[] => {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  return keywords.filter(k => !t.includes(k.toLowerCase().replace(/\s+/g, ' ')));
};

/** The blanks of a cloze text "… [[a|b]] …": each blank's accepted answers. */
export const clozeBlanks = (text: string): string[][] =>
  text
    .split(/\[\[(.+?)\]\]/g)
    .filter((_, i) => i % 2 === 1)
    .map(p => p.split('|').map(s => s.trim()));
