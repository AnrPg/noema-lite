/**
 * THE TRANSLITERATION RULE of the whole app (docs/SEARCH.md §2, docs/VAULT.md §1, docs/SOCIAL.md §2): a word matches in
 * its original script, in its scholarly transliteration and in plain Latin letters. `viologia` and `biologia` both find
 * «Βιολογία»; `nikos papadakis` finds «Νίκος Παπαδάκης»; «Βιολογία» finds "Biologia". Greek and Cyrillic are
 * transliterated; the other scripts' scholarly letters fold to plain ones already (fold(): ṣaḥn = sahn, ǧamal = jamal).
 *
 * Every function here works on FOLDED text (fold.ts), so case, accents and final sigma never matter.
 */
import { textOf } from '../../../kernel/text.ts';
import { fold, type Mapped } from './fold.ts';

/** The two ways Greek is written in Latin letters: as people type it (plain) and as the scholarly tables write it. */
export type LatinScheme = 'plain' | 'scholarly';

const GREEK_PLAIN: Readonly<Record<string, string>> = {
  α: 'a',
  β: 'v',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
};
/** The scholarly letters (biologia, kh…): β b, η e, υ u, χ kh. */
const GREEK_SCHOLARLY: Readonly<Record<string, string>> = { ...GREEK_PLAIN, β: 'b', η: 'e', υ: 'u', χ: 'kh' };
const CYRILLIC: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};
const TABLE: Readonly<Record<LatinScheme, Readonly<Record<string, string>>>> = { plain: GREEK_PLAIN, scholarly: GREEK_SCHOLARLY };

/** Has the folded text a letter that has a Latin form (Greek or Cyrillic)? */
export const hasNonLatin = (folded: string): boolean => /[α-ωа-яё]/.test(folded);

/** The folded text in Latin letters (Greek ου = ou; letters of other scripts stay as they are), with, for every Latin
    character, the index of the folded character it came from (to cut a snippet around a match found in Latin). */
export function latinMap(folded: string, scheme: LatinScheme): Mapped {
  const greek = TABLE[scheme];
  let t = '';
  const map: number[] = [];
  for (let i = 0; i < folded.length; i++) {
    const ch = folded.charAt(i);
    if (ch === 'ο' && folded.charAt(i + 1) === 'υ') {
      t += 'ou';
      map.push(i, i + 1);
      i++;
      continue;
    }
    const to = greek[ch] ?? CYRILLIC[ch] ?? ch;
    for (let k = 0; k < to.length; k++) map.push(i);
    t += to;
  }
  map.push(folded.length);
  return { t, map };
}

/** The folded text in Latin letters (see latinMap). */
export function latin(folded: string, scheme: LatinScheme): string {
  return hasNonLatin(folded) ? latinMap(folded, scheme).t : folded;
}

/** The forms a text is searched in: as written (folded), in plain Latin letters, in scholarly Latin letters — each once. */
export function forms(s: unknown): string[] {
  const f = fold(s);
  return [...new Set([f, latin(f, 'plain'), latin(f, 'scholarly')])];
}

/** Does every word of the query appear (in any of its forms) in any form of the text? (`q` is the learner's words.) */
export function matchesAll(hay: unknown, q: unknown): boolean {
  const words = (q == null ? '' : textOf(q)).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const H = forms(hay);
  return words.every(w => forms(w).some(x => H.some(y => y.includes(x))));
}

/** A name as it is searched on the server (docs/SOCIAL.md §2): every word of its forms, once, in one line (≤ 600). */
export function searchTerms(name: unknown): string {
  return [...new Set(forms(name).join(' ').split(/\s+/).filter(Boolean))].join(' ').slice(0, 600);
}
