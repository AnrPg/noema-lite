/**
 * The record of the search: one searchable piece of the app (docs/SEARCH.md §3). This is the contract between whoever
 * BUILDS records (the catalogue's builders and the index: engine/catalog.js today, the Worker's read models in phase 2)
 * and the query side here (scoring.ts), which only reads them.
 */

/** Which side of the app a record lives on. */
export type World = 'know' | 'lang';

/** [field name, text] — the order matters: the first field that matches names the result. */
export type RecordField = readonly [name: string, text: string];

export interface SearchRecord {
  /** its kind (one of ORDER) */
  readonly ty: string;
  readonly w: World;
  /** unique key in the account's index ("s:<subject>:ex:<id>", "l:<course>:w:<lexeme>" …) */
  readonly k: string;
  readonly ti: string;
  readonly f: readonly RecordField[];
  /** the address that opens exactly it ("#/ex/…", "convo:<id>") */
  readonly h: string;
  /** where it sits (Subject › 3. Chapter › Section) */
  readonly pa?: readonly string[];
  readonly sj?: string | null;
  readonly cu?: string;
  readonly co?: string | null;
  readonly lg?: readonly string[];
  /** kind-specific details (ids of the chapter, section, exercise …) */
  readonly x?: Readonly<Record<string, unknown>>;
  /** exact strings: a query equal to one of them puts the record on top */
  readonly ex?: readonly string[];
}

/** The kinds, by side. */
export const TYPES = Object.freeze({
  know: Object.freeze(['roadmap', 'station', 'subject', 'chapter', 'section', 'theory', 'exercise', 'card', 'trap', 'drill', 'source']),
  lang: Object.freeze(['word', 'meaning', 'grammar', 'lesson', 'field', 'sentence', 'phenomenon']),
  both: Object.freeze(['convo']),
});
/** The order of the groups of results, always the same. */
export const ORDER: readonly string[] = Object.freeze([...TYPES.know, ...TYPES.lang, ...TYPES.both]);
/** The kinds a practice round can be made of (docs/SEARCH.md §6). */
export const PRACTISABLE: readonly string[] = Object.freeze(['exercise', 'card', 'word', 'meaning', 'field', 'lesson']);

/** The weight of a match in a field, by the field's name (a field not named here: 14 when it is the first, else 4). */
export const FIELD_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  title: 30,
  word: 30,
  meaning: 26,
  sentence: 12,
  question: 10,
  front: 10,
});
