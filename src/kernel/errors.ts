/**
 * NoemaError: every failure carries a stable machine code (docs/adr/004, docs/i18n.md §6).
 *
 * Two kinds of code:
 *  • USER codes are the error contract of docs/i18n.md §6.2 (the catalog i18n/errors/, key "err." + code). The English
 *    `message` of such an error is exactly the English catalog text (or the server's own words where §6.2 says so), and the
 *    UI shows `i18n.err(e)` — the words in the learner's language. The list below is that table; a unit test keeps them equal.
 *  • INTERNAL codes name failures the code handles itself (a full storage, a refused compare-and-swap, a timed-out job).
 *    They have no catalog entry and are never shown as they are: where the learner must hear about one, the ErrorReporter
 *    maps it to a catalog key (NOTICE_KEYS in src/adapters/local/error-reporter.ts).
 * Rules (as for §6): a code is never renamed, removed or reused for another meaning; params may be added, never removed.
 */
import { textOf } from './text.ts';

export const USER_ERROR_CODES = [
  // Supabase Auth
  'auth.invalid_credentials',
  'auth.email_not_confirmed',
  'auth.user_already_exists',
  'auth.email_exists',
  'auth.weak_password',
  'auth.weak_password_other',
  'auth.email_rate_limit',
  'auth.rate_limit',
  'auth.otp_expired',
  'auth.email_invalid',
  'auth.signup_disabled',
  'auth.user_banned',
  'auth.user_not_found',
  'auth.same_password',
  'auth.email_not_authorized',
  'auth.captcha_failed',
  'auth.session_expired',
  'auth.not_signed_in',
  'auth.network',
  'auth.server',
  'auth.unknown',
  // the cloud (PostgREST, Storage)
  'cloud.network',
  'cloud.storage_full',
  'cloud.keeps_changing',
  'cloud.schema_old',
  'cloud.permission',
  'cloud.too_large',
  'cloud.rate_limit',
  'cloud.server',
  'cloud.unknown',
  'cloud.selftest.value_missing',
  'cloud.selftest.row_missing',
  'cloud.selftest.column_missing',
  'cloud.selftest.not_listed',
  'cloud.selftest.content_differs',
  'cloud.selftest.public_unreadable',
  // sharing, files
  'share.invalid_email',
  'share.own_email',
  'files.too_big',
  'files.no_reader',
  'files.not_zip',
  'files.no_pack_json',
  'files.bad_pack_json',
  'files.no_writer',
  // Roadmaps
  'roadmap.restructure',
  // AI (Claude, Gemini)
  'ai.unauthorized',
  'ai.unauthorized_short',
  'ai.forbidden',
  'ai.no_credit',
  'ai.no_credit_short',
  'ai.too_large',
  'ai.rate_limited',
  'ai.overloaded',
  'ai.http',
  'ai.api',
  'ai.aborted',
  'ai.network',
  'ai.no_connection',
  'ai.skill_unavailable',
  'ai.no_key.device',
  'ai.no_key.claude',
  'ai.no_key.gemini',
  'ai.no_key.any',
  'ai.api_claude',
  'ai.quota',
  'ai.api_gemini',
  'ai.network_gemini',
  'ai.not_json',
  'ai.invalid',
  'ai.job.too_long',
  'ai.job.budget',
  'ai.job.refused',
  'ai.job.stopped',
  // the picture service (/api/img, /api/file) and engine/claude.js pictures
  'img.method',
  'img.origin',
  'img.bad_origin',
  'img.no_query',
  'img.bad_url',
  'img.scheme',
  'img.blocked',
  'img.unreachable',
  'img.timeout',
  'img.upstream',
  'img.no_main_picture',
  'img.file_type',
  'img.not_picture',
  'img.not_picture_bytes',
  'img.too_large',
  'img.redirects',
  'img.http',
  'img.not_picture_page',
  'img.download_failed',
  'img.unreadable',
  'img.picture_too_large',
  'img.url_scheme',
] as const;

export const INTERNAL_ERROR_CODES = [
  'storage.quota', // the browser's storage for this site is full (the storage-full signal)
  'storage.unavailable', // no localStorage / IndexedDB (private mode, blocked site data, a test context)
  'storage.corrupt', // a stored value is not what it should be (not JSON, wrong shape)
  'storage.failed', // a storage operation failed for another reason (a transaction error)
  'remote.conflict', // compare-and-swap refused: the row changed since the version the writer read
  'remote.unknown_collection', // a Remote collection the adapter has no table for
  'compute.timeout', // a job ran longer than its time limit (its Worker is stopped)
  'compute.cancelled', // a job was cancelled by its caller
  'compute.unknown_job', // no handler is registered for the job name
  'compute.failed', // the job's handler threw
  'compute.unavailable', // no Worker could be started (the inline fallback runs instead)
  'ai.unsupported', // the provider cannot do what the request asks (e.g. tools on a model without tools)
  'hlc.drift', // a remote hybrid-clock time is too far ahead of this device's clock
  'hlc.invalid', // a hybrid-clock time stamp that cannot be read
  'hlc.overflow', // more events in one millisecond than the counter holds (the physical clock stands still)
  'day.invalid', // not a calendar day "YYYY-MM-DD"
  'id.invalid', // not a valid id of its kind
  'container.unknown', // the composition root has no registration for a token
  'container.cycle', // registrations that depend on each other in a circle
  'container.frozen', // a registration after the container was frozen
  'invariant.failed', // a broken invariant: a bug
  'internal.unexpected', // something was thrown that is not a NoemaError (wrapped by NoemaError.from)
] as const;

export type UserErrorCode = (typeof USER_ERROR_CODES)[number];
export type InternalErrorCode = (typeof INTERNAL_ERROR_CODES)[number];
export type ErrorCode = UserErrorCode | InternalErrorCode;
export type ErrorParam = string | number | boolean;
export type ErrorParams = Readonly<Record<string, ErrorParam>>;
/** How bad a reported failure is (ErrorReporter): debug and info only reach the journal. */
export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
export const SEVERITIES: readonly Severity[] = ['debug', 'info', 'warning', 'error', 'fatal'];

const USER = new Set<string>(USER_ERROR_CODES);
const ALL = new Set<string>([...USER_ERROR_CODES, ...INTERNAL_ERROR_CODES]);
export const isErrorCode = (s: unknown): s is ErrorCode => typeof s === 'string' && ALL.has(s);
export const isUserErrorCode = (s: unknown): s is UserErrorCode => typeof s === 'string' && USER.has(s);

/** The serialisable form of a NoemaError (the backend's `{ error: { code, params, message } }`, a Worker message, the journal). */
export interface ErrorInfo {
  readonly code: ErrorCode;
  readonly params: ErrorParams;
  readonly message: string;
}

export interface NoemaErrorOptions {
  readonly params?: ErrorParams;
  readonly cause?: unknown;
  /** Trying the same thing again later may succeed (network, rate limits, a refused compare-and-swap). */
  readonly retryable?: boolean;
  /** The HTTP status of the answer behind it, when there was one. */
  readonly status?: number;
}

export class NoemaError extends Error {
  readonly code: ErrorCode;
  readonly params: ErrorParams;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(code: ErrorCode, message: string, options: NoemaErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'NoemaError';
    this.code = code;
    this.params = Object.freeze({ ...(options.params ?? {}) });
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }

  toJSON(): ErrorInfo {
    return { code: this.code, params: this.params, message: this.message };
  }

  /** A NoemaError from anything thrown: a NoemaError as it is; an Error with a known `.code` (the old engine's coded
      errors, docs/i18n.md §6.1) keeps its code and params; anything else becomes `fallback` with the thrown thing as cause. */
  static from(thrown: unknown, fallback: ErrorCode = 'internal.unexpected'): NoemaError {
    if (thrown instanceof NoemaError) return thrown;
    if (thrown && typeof thrown === 'object') {
      const o = thrown as { code?: unknown; params?: unknown; message?: unknown; status?: unknown };
      const message = typeof o.message === 'string' ? o.message : textOf(thrown);
      const code = isErrorCode(o.code) ? o.code : fallback;
      const params = o.params && typeof o.params === 'object' ? cleanParams(o.params as Record<string, unknown>) : {};
      return new NoemaError(code, message, { params, cause: thrown, ...(typeof o.status === 'number' ? { status: o.status } : {}) });
    }
    return new NoemaError(fallback, String(thrown), { cause: thrown });
  }

  /** A NoemaError back from its serialised form (a Worker's answer). */
  static fromInfo(info: { code?: unknown; params?: unknown; message?: unknown }, fallback: ErrorCode = 'internal.unexpected'): NoemaError {
    const code = isErrorCode(info.code) ? info.code : fallback;
    const params = info.params && typeof info.params === 'object' ? cleanParams(info.params as Record<string, unknown>) : {};
    return new NoemaError(code, typeof info.message === 'string' ? info.message : code, { params });
  }
}

export const isNoemaError = (x: unknown): x is NoemaError => x instanceof NoemaError;

/** Only the params an error may carry (strings, numbers, booleans): anything else is dropped. */
function cleanParams(p: Record<string, unknown>): ErrorParams {
  const out: Record<string, ErrorParam> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  return out;
}
