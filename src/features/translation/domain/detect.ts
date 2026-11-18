/* 🌐 The language of a short shared text, told cheaply (docs/i18n.md §11): from its script, the language stored with it, and
   for Latin script a few function words. Data, not interface words. */

/** the language of a tag: 'zh-Hant' → 'zh', 'pt_PT' → 'pt' */
export const baseLang = (t: string | null | undefined): string => (t ?? '').toLowerCase().split(/[-_]/)[0] ?? '';

const SCRIPTS: readonly (readonly [string, RegExp])[] = [
  ['el', /[Ͱ-Ͽἀ-῿]/g],
  ['cyrl', /[Ѐ-ӿ]/g],
  ['ar', /[؀-ۿݐ-ݿ]/g],
  ['he', /[֐-׿]/g],
  ['hi', /[ऀ-ॿ]/g],
  ['kana', /[぀-ヿ]/g],
  ['han', /[㐀-鿿]/g],
  ['ko', /[가-힯ᄀ-ᇿ]/g],
  ['th', /[฀-๿]/g],
  ['latn', /[A-Za-zÀ-ɏ]/g],
];
const CYRL = new Set(['ru', 'uk', 'bg', 'sr', 'mk', 'be', 'kk', 'mn']);
const NON_LATIN = new Set(['el', 'ru', 'uk', 'bg', 'sr', 'mk', 'be', 'kk', 'mn', 'ar', 'he', 'hi', 'ja', 'zh', 'ko', 'th', 'fa', 'ur']);
const WORDS: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries({
    en: 'the and of to in for with is how your an from this that are',
    fr: 'le la les des et du pour une avec dans est au aux sur qui',
    de: 'der die das und für mit ein eine ist von zu den im auf nicht',
    es: 'el los las del y para una con por que es al como sobre',
    it: 'il gli della delle e per una con che di del nel alla sono',
    pt: 'o os as do da dos das para uma com em que no na ao',
    tr: 've bir için ile bu da de olarak nasıl',
    sq: 'dhe të në për një me nga që është',
  }).map(([k, v]) => [k, new Set(v.split(' '))]),
);

/** The language of a text: an ISO code ('el', 'ru', 'zh' …) or null when it cannot be told cheaply. */
export function detect(text: string | null | undefined, stored?: string | null): string | null {
  const s = text ?? '',
    st = baseLang(stored),
    counts: Record<string, number> = {};
  let letters = 0;
  for (const [id, re] of SCRIPTS) {
    const n = (s.match(re) ?? []).length;
    if (n) {
      counts[id] = n;
      letters += n;
    }
  }
  if (!letters) return st || null;
  if (counts['kana']) return 'ja';
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  if (n / letters < 0.5) return st || null;
  if (top === 'cyrl') return CYRL.has(st) ? st : 'ru';
  if (top === 'han') return st === 'ja' ? 'ja' : 'zh';
  if (top !== 'latn') return top;
  if (st && !NON_LATIN.has(st)) return st;
  const score: Record<string, number> = {};
  for (const w of s
    .toLowerCase()
    .split(/[^a-zÀ-ɏ]+/)
    .filter(Boolean))
    for (const [k, set] of Object.entries(WORDS)) if (set.has(w)) score[k] = (score[k] ?? 0) + 1;
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const first = ranked[0],
    second = ranked[1];
  return first && first[1] >= 2 && (!second || first[1] > second[1]) ? first[0] : null;
}

/** Does a text (in a stored language) differ from the language `to`? (zh-Hans / zh-Hant count as one: the script is a
    reading matter, not a language.) */
export function differs(text: string | null | undefined, stored: string | null | undefined, to: string): boolean {
  const l = detect(text, stored);
  return !!l && baseLang(l) !== baseLang(to);
}
