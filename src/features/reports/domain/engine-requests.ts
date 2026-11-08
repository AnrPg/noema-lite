/**
 * ⚙ Requests for NEW engines of interactive activities (docs/INTERACTIVE_LIBRARY.md §3): the fields of a request and their
 * limits, normalize(input) → { row, problems }, the statuses and their order, the fields an admin may change, and the
 * brief a developer (or Claude) builds the engine from. Run by the app (#/engines) and by the connector (noema_request_engine,
 * noema_engine_requests, noema_engine_request_update).
 */

import { textOf } from '../../../kernel/text.ts';
import type { EngineRequestRow, NewEngineRequest, RequestPatch } from '../../../ports/reports.ts';

export { REQUEST_COLUMNS, type EngineRequestRow, type NewEngineRequest, type RequestPatch } from '../../../ports/reports.ts';

/* i18n-ignore-start */ // field names, codes and the English brief for developers; every word a learner reads is in i18n/engine (engine.engines.*)
export interface RequestField {
  readonly max: number;
  readonly min?: number;
  readonly need?: boolean;
}
export const REQUEST_FIELDS: Readonly<Record<'title' | 'field' | 'what' | 'learner' | 'measure' | 'sources' | 'examples', RequestField>> =
  Object.freeze({
    title: { max: 120, min: 4, need: true }, // a name for it: "Chemical equilibrium and Le Chatelier"
    field: { max: 120 }, // the subject area: "physical chemistry"
    what: { max: 4000, min: 40, need: true }, // what should be simulated, the phenomenon or the model, as precisely as possible
    learner: { max: 2000 }, // what the learner changes, and what they should see happen
    measure: { max: 2000 }, // what is measured, graded or found (a value to reach, a fault to find)
    sources: { max: 2000 }, // books, papers, standards the model should follow
    examples: { max: 2000 }, // one or two concrete exercises it should make possible
  });
export type RequestFieldName = keyof typeof REQUEST_FIELDS;
/** qualitative behaviour · numbers a course checks · research-grade */
export const ACCURACY = Object.freeze(['teaching', 'quantitative', 'research'] as const);
export const REQUEST_STATUSES = Object.freeze(['new', 'seen', 'planned', 'building', 'available', 'declined', 'duplicate'] as const);
export const REQUEST_OPEN = Object.freeze(['new', 'seen', 'planned', 'building'] as const);
export const VIA = Object.freeze(['app', 'claude'] as const);
export const ENGINE_ID_RE = /^[a-z][a-z0-9-]*@\d+$/;
const SUBJECT_RE = /^[a-z0-9][a-z0-9_-]{0,80}$/i;
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

export interface RequestProblem {
  readonly field: string;
  readonly code: 'missing' | 'short' | 'long' | 'value';
}

const textIn = (v: unknown): string => (v == null ? '' : textOf(v));
const clip = (v: unknown, n: number): string =>
  textIn(v)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, n);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** What may already do it: the catalogue of the engine library suggests ids from a description. */
export type Suggest = (text: string) => readonly { readonly id: string }[];

/** normalize(input, suggest?) → { row, problems }; problem codes: missing, short, long, value. The row is what is stored. */
export function normalizeRequest(input: unknown, suggest?: Suggest | null): { row: NewEngineRequest; problems: RequestProblem[] } {
  const o = input && typeof input === 'object' ? (input as Readonly<Record<string, unknown>>) : {},
    P: RequestProblem[] = [],
    texts: Partial<Record<RequestFieldName, string | null>> = {};
  for (const [k, f] of Object.entries(REQUEST_FIELDS) as [RequestFieldName, RequestField][]) {
    const raw = textIn(o[k]).trim();
    if (!raw) {
      if (f.need) P.push({ field: k, code: 'missing' });
      texts[k] = null;
      continue;
    }
    if (raw.length > f.max) P.push({ field: k, code: 'long' });
    else if (f.min && raw.length < f.min) P.push({ field: k, code: 'short' });
    texts[k] = clip(raw, f.max);
  }
  const accuracy = oneOf(ACCURACY, o['accuracy']) ? o['accuracy'] : 'teaching';
  if (o['accuracy'] != null && !oneOf(ACCURACY, o['accuracy'])) P.push({ field: 'accuracy', code: 'value' });
  const subject = typeof o['subject'] === 'string' && SUBJECT_RE.test(o['subject']) ? o['subject'] : null;
  const via = oneOf(VIA, o['via']) ? o['via'] : 'app';
  const locale = typeof o['locale'] === 'string' && LOCALE_RE.test(o['locale']) ? o['locale'] : null;
  const t = (k: RequestFieldName): string | null => texts[k] ?? null;
  const about = [t('title'), t('field'), t('what'), t('learner'), t('measure')].filter(Boolean).join(' ');
  const row: NewEngineRequest = {
    title: t('title'),
    field: t('field'),
    what: t('what'),
    learner: t('learner'),
    measure: t('measure'),
    sources: t('sources'),
    examples: t('examples'),
    accuracy,
    subject,
    via,
    locale,
    suggested: suggest ? suggest(about).map(s => s.id) : [],
  };
  return { row, problems: P };
}

/** What an admin may change, cleaned: { status?, engine_id?, answer?, fixed_in? } or { error }. */
export function cleanRequestPatch(p: Readonly<Record<string, unknown>>): RequestPatch | { error: string } {
  const out: RequestPatch = {};
  if (p['status'] != null) {
    if (!oneOf(REQUEST_STATUSES, p['status'])) return { error: 'status: one of ' + REQUEST_STATUSES.join(', ') };
    out.status = p['status'];
  }
  if (p['engine_id'] != null) {
    const e = textIn(p['engine_id']).trim();
    if (e && !ENGINE_ID_RE.test(e)) return { error: 'engine_id: an engine id such as chem@1' };
    out.engine_id = e || null;
  }
  if (p['answer'] != null) out.answer = clip(p['answer'], 4000) || null;
  if (p['fixed_in'] != null) out.fixed_in = clip(p['fixed_in'], 300) || null;
  return out;
}

const SECTIONS: readonly (readonly [RequestFieldName, string])[] = [
  ['what', 'What should be simulated'],
  ['learner', 'What the learner changes and sees'],
  ['measure', 'What is measured, graded or found'],
  ['sources', 'Sources it should follow'],
  ['examples', 'Exercises it should make possible'],
];

/** The English markdown a developer or Claude builds the engine from (the contract: docs/INTERACTIVE_LIBRARY.md §1). */
export function requestBrief(r: EngineRequestRow): string {
  const suggested = r.suggested ?? [];
  const L = [
    `# Engine request: ${r.title || '(no title)'}`,
    '',
    `- id: ${r.id || '—'} · status: ${r.status || 'new'} · asked ${r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : '—'} by ${r.requester_name || '—'} (${r.via || 'app'}${r.locale ? ', writes in ' + r.locale : ''})`,
    `- field: ${r.field || '—'} · accuracy wanted: ${r.accuracy || 'teaching'}${r.subject ? ' · for the subject ' + r.subject : ''}`,
    `- the library may already cover it: ${suggested.length ? suggested.join(', ') + ' (check these first: extend an engine of the library before adding one)' : 'nothing matched'}`,
    '',
  ];
  for (const [k, h] of SECTIONS) {
    const v = r[k];
    if (v) L.push(`## ${h}`, '', v, '');
  }
  L.push(
    '## How to build it',
    '',
    'Follow docs/INTERACTIVE_LIBRARY.md §1 (AnrPg/noema-lite): first decide whether an engine of the library can be EXTENDED (additive, the same id) — a new engine only when the model is a new family. A new engine is the module `src/engines/<name>/<name>.js` on the core (src/engines/kernel/core.js), a plugin of src/engines/plugins.ts, with its Python twin `tools/lib_<name>.py`, its chapter `docs/library/<name>.md` (every model with its source), tests with published reference values and edge cases, fixtures for the JS ↔ Python parity, a reference activity, its words in every UI locale, and its entry in the catalogue. Then answer the request with noema_engine_request_update (status available, engine_id, fixed_in).',
  );
  return L.join('\n');
}
/* i18n-ignore-end */
