/**
 * The form texts are compared in (docs/SEARCH.md §2): no accents, tones or vowel points, lower case, ß = ss, ς = σ,
 * Arabic tatweel and the transliteration's ʾ ʿ dropped, typographic quotes as plain ones, every space one ' '. Scholarly
 * Latin letters read as the plain letters people type: š = sh, č = ch, ž = zh, ḵ / ẖ / ḫ = kh, ṯ = th, ḏ = dh, ġ = gh,
 * ǧ = j (so «ṣaḥn», «sahn» and «صحن»'s transliteration are one search).
 *
 * fold() works character by character (foldMap relies on it): each character of the original folds on its own.
 */
import { textOf } from '../../../kernel/text.ts';

/** Combining marks of Latin, Greek and Cyrillic accents, Hebrew points, Arabic vowel marks and the extended blocks. */
const MARKS = new RegExp(
  '[\\u0300-\\u036f\\u0591-\\u05bd\\u05bf\\u05c1\\u05c2\\u05c4\\u05c5\\u05c7\\u0610-\\u061a\\u064b-\\u065f\\u0670\\u06d6-\\u06ed\\u1ab0-\\u1aff\\u1dc0-\\u1dff\\u20d0-\\u20ff\\ufe20-\\ufe2f]',
  'g',
);
/** A Latin letter and the mark that makes it a scholarly letter → the letters typed for it (written decomposed, as NFKD gives them). */
const TRANSLIT_TO: ReadonlyMap<string, string> = new Map([
  ['s\u030c', 'sh'],
  ['c\u030c', 'ch'],
  ['z\u030c', 'zh'],
  ['k\u0331', 'kh'],
  ['h\u0331', 'kh'],
  ['h\u032e', 'kh'],
  ['t\u0331', 'th'],
  ['d\u0331', 'dh'],
  ['g\u0307', 'gh'],
  ['g\u0331', 'gh'],
  ['g\u030c', 'j'],
  ['j\u030c', 'j'],
]);
const TRANSLIT = new RegExp('([sczkhtdgj])([\\u0331\\u032e\\u030c\\u0307])', 'g');

function foldChar(ch: string): string {
  return ch
    .normalize('NFKD')
    .toLowerCase()
    .replace(TRANSLIT, (m: string, b: string, d: string) => TRANSLIT_TO.get(b + d) ?? m)
    .replace(MARKS, '')
    .replace(/ß/g, 'ss')
    .replace(/ς/g, 'σ')
    .replace(/[\u0640\u02be\u02bf]/g, '')
    .replace(/ى/g, 'ي')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/\s/g, ' ');
}

/** One fold per distinct character (a bounded cache: a page folds the same few hundred characters again and again). */
const CACHE = new Map<string, string>();
const CACHE_MAX = 20000;

/** The folded form of a text (anything: null and undefined are ''). */
export function fold(s: unknown): string {
  const text = s == null ? '' : textOf(s);
  let out = '';
  for (const ch of text) {
    let f = CACHE.get(ch);
    if (f === undefined) {
      f = foldChar(ch);
      if (CACHE.size < CACHE_MAX) CACHE.set(ch, f);
    }
    out += f;
  }
  return out;
}

/** A text mapped to another, with, for every character of the result, the index in the source it came from. */
export interface Mapped {
  readonly t: string;
  /** map[i] = index in the source of t[i]; one more entry at the end: the source's length. */
  readonly map: readonly number[];
}

/** fold() with, for every folded character, the index (UTF-16) of the original character it came from (to cut snippets). */
export function foldMap(s: unknown): Mapped {
  const text = s == null ? '' : textOf(s);
  let t = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) map.push(i);
    t += f;
    i += ch.length;
  }
  map.push(text.length);
  return { t, map };
}

const TONE: ReadonlyMap<string, number> = new Map([
  ['\u0304', 1],
  ['\u0301', 2],
  ['\u030c', 3],
  ['\u0300', 4],
]);
const TONE_MARKS = new RegExp('[\\u0304\\u0301\\u030c\\u0300]', 'g');

/** Pinyin with tone marks → with tone numbers ("nǐ hǎo" → "ni3 hao3"), so both ways of typing find the word. */
export function toneNumbers(p: unknown): string {
  const text = p == null ? '' : textOf(p);
  return text
    .split(/(\s+|')/)
    .map(syl => {
      const d = syl.normalize('NFD');
      let n = 0;
      const base = d.replace(TONE_MARKS, m => {
        n = TONE.get(m) ?? 0;
        return '';
      });
      return n ? base.normalize('NFC') + String(n) : syl;
    })
    .join('');
}
