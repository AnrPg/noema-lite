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

export type AnyId = AccountId | SubjectId | RoadmapId | NodeId | LevelId | ChapterId | SectionId | ExerciseId | CardId | CourseId | PluginId | DeviceId;

const GENERIC = /^[A-Za-z0-9][A-Za-z0-9._@:-]{0,199}$/;
const NO_COLON = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,199}$/;
const DEVICE = /^[A-Za-z0-9_-]{1,64}$/;

function make<I extends AnyId>(kind: string, re: RegExp) {
  return (text: string): Result<I> =>
    typeof text === 'string' && re.test(text)
      ? ok(text as I)
      : err(new NoemaError('id.invalid', `not a valid ${kind}: ${JSON.stringify(String(text).slice(0, 80))}`, { params: { kind } }));
}

export const accountId = make<AccountId>('account id', NO_COLON);
export const subjectId = make<SubjectId>('subject id', GENERIC);
export const roadmapId = make<RoadmapId>('roadmap id', GENERIC);
export const nodeId = make<NodeId>('node id', GENERIC);
export const levelId = make<LevelId>('level id', GENERIC);
export const chapterId = make<ChapterId>('chapter id', GENERIC);
export const sectionId = make<SectionId>('section id', GENERIC);
export const exerciseId = make<ExerciseId>('exercise id', GENERIC);
export const cardId = make<CardId>('card id', GENERIC);
export const courseId = make<CourseId>('course id', NO_COLON);
export const pluginId = make<PluginId>('plugin id', GENERIC);
export const deviceId = make<DeviceId>('device id', DEVICE);

/** An id whose text a validated contract already checked (no second check). */
export const trustedId = <I extends AnyId>(text: string): I => text as I;
