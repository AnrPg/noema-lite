/**
 * Branded ids: a SubjectId and a NodeId are both strings, but the compiler never lets one stand for the other.
 * Make one only through its constructor (which checks the text) — `subjectId('databricks')` → Result<SubjectId> — or,
 * where the text was already checked (a validated contract), with `trustedId<SubjectId>(s)`.
 *
 * The text rule of every id: 1–200 characters, starting with a letter or digit, then letters, digits and . _ - @ :
 * (no spaces, no slashes). Ids that are part of a storage key (`noema1:<account>:s:<subject>:…`) are checked further:
 * an AccountId never contains ':' (it is the key's first segment); a language course's subject id is "lang:<course>".
 */
import { NoemaError } from './errors.ts';
import { err, ok, type Result } from './result.ts';
import { textOf } from './text.ts';

declare const BRAND: unique symbol;
/** T with a compile-time-only tag B. */
export type Brand<T, B extends string> = T & { readonly [BRAND]: B };

export type AccountId = Brand<string, 'AccountId'>;
export type SubjectId = Brand<string, 'SubjectId'>;
export type RoadmapId = Brand<string, 'RoadmapId'>;
export type NodeId = Brand<string, 'NodeId'>;
export type LevelId = Brand<string, 'LevelId'>;
export type ChapterId = Brand<string, 'ChapterId'>;
export type SectionId = Brand<string, 'SectionId'>;
export type ExerciseId = Brand<string, 'ExerciseId'>;
export type CardId = Brand<string, 'CardId'>;
export type CourseId = Brand<string, 'CourseId'>;
export type PluginId = Brand<string, 'PluginId'>;
/** One device (or tab) in the hybrid logical clock: the tie-breaker of two equal times. */
export type DeviceId = Brand<string, 'DeviceId'>;

export type AnyId =
  AccountId | SubjectId | RoadmapId | NodeId | LevelId | ChapterId | SectionId | ExerciseId | CardId | CourseId | PluginId | DeviceId;

const GENERIC = /^[A-Za-z0-9][A-Za-z0-9._@:-]{0,199}$/;
const NO_COLON = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,199}$/;
const DEVICE = /^[A-Za-z0-9_-]{1,64}$/;

/** The constructor of one kind of id: the text checked, then branded. */
type IdParser<I extends AnyId> = (text: unknown) => Result<I>;
/** Checks the text of an id (it may come from untyped JavaScript, hence `unknown`); the exports below name the brand. */
function make(kind: string, re: RegExp): (text: unknown) => Result<string> {
  return text =>
    typeof text === 'string' && re.test(text)
      ? ok(text)
      : err(new NoemaError('id.invalid', `not a valid ${kind}: ${JSON.stringify(textOf(text).slice(0, 80))}`, { params: { kind } }));
}

export const accountId = make('account id', NO_COLON) as IdParser<AccountId>;
export const subjectId = make('subject id', GENERIC) as IdParser<SubjectId>;
export const roadmapId = make('roadmap id', GENERIC) as IdParser<RoadmapId>;
export const nodeId = make('node id', GENERIC) as IdParser<NodeId>;
export const levelId = make('level id', GENERIC) as IdParser<LevelId>;
export const chapterId = make('chapter id', GENERIC) as IdParser<ChapterId>;
export const sectionId = make('section id', GENERIC) as IdParser<SectionId>;
export const exerciseId = make('exercise id', GENERIC) as IdParser<ExerciseId>;
export const cardId = make('card id', GENERIC) as IdParser<CardId>;
export const courseId = make('course id', NO_COLON) as IdParser<CourseId>;
export const pluginId = make('plugin id', GENERIC) as IdParser<PluginId>;
export const deviceId = make('device id', DEVICE) as IdParser<DeviceId>;

/** An id whose text a validated contract already checked (no second check). */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the type argument is the brand itself: trustedId<SubjectId>(s) is the one named, unchecked branding of a validated contract's text
export const trustedId = <I extends AnyId>(text: string): I => text as I;
