/**
 * Anti-corruption layer, errors: a failed Supabase answer (GoTrue, PostgREST, Storage) → a NoemaError with a contract
 * code (docs/i18n.md §6.2). The same classification engine/cloud.js `codeOf` makes; the `.message` stays the server's
 * own English (codes marked "server's words" in §6.2 show the catalog's words in the UI).
 */
import { NoemaError, type ErrorCode, type ErrorParams } from '../../kernel/errors.ts';

/** GoTrue error_code → our code. */
const AUTH: Readonly<Record<string, ErrorCode>> = {
  invalid_credentials: 'auth.invalid_credentials',
  email_not_confirmed: 'auth.email_not_confirmed',
  user_already_exists: 'auth.user_already_exists',
  email_exists: 'auth.email_exists',
  over_email_send_rate_limit: 'auth.email_rate_limit',
  over_request_rate_limit: 'auth.rate_limit',
  otp_expired: 'auth.otp_expired',
  email_address_invalid: 'auth.email_invalid',
  signup_disabled: 'auth.signup_disabled',
  email_provider_disabled: 'auth.signup_disabled',
  user_banned: 'auth.user_banned',
  user_not_found: 'auth.user_not_found',
  same_password: 'auth.same_password',
  email_address_not_authorized: 'auth.email_not_authorized',
  captcha_failed: 'auth.captcha_failed',
  refresh_token_not_found: 'auth.session_expired',
  refresh_token_already_used: 'auth.session_expired',
  session_not_found: 'auth.session_expired',
  session_expired: 'auth.session_expired',
  bad_jwt: 'auth.session_expired',
  no_authorization: 'auth.session_expired',
};
/** Older Auth servers (and the test emulator) send no error_code: recognised by their English message. */
const AUTH_MSG: ReadonlyArray<readonly [RegExp, string]> = [
  [/invalid login credentials/i, 'invalid_credentials'],
  [/email not confirmed/i, 'email_not_confirmed'],
  [/already (been )?registered/i, 'user_already_exists'],
  [/password should|weak password/i, 'weak_password'],
  [/email rate limit/i, 'over_email_send_rate_limit'],
  [/rate limit/i, 'over_request_rate_limit'],
  [/expired or is invalid|invalid or has expired/i, 'otp_expired'],
  [/refresh token/i, 'refresh_token_not_found'],
  [/signups? not allowed/i, 'signup_disabled'],
  [/unable to validate email|email address .* is invalid/i, 'email_address_invalid'],
  [/invalid jwt|jwt expired/i, 'bad_jwt'],
];

type Body = { readonly [key: string]: unknown } | null;

/** The server's own words for a failed answer. */
export function serverMessage(body: unknown, status: number): string {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  for (const k of ['msg', 'message', 'error_description', 'error']) if (typeof o[k] === 'string' && o[k]) return o[k];
  return typeof body === 'string' && body ? body.slice(0, 300) : `HTTP ${status}`;
}

/** [code, params] of a failed answer to `path`. */
export function classify(path: string, body: unknown, status: number, message: string): [ErrorCode, ErrorParams] {
  const o: Body = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const oc = typeof o['code'] === 'string' ? o['code'] : '';
  if (/^\/auth\/v1\//.test(path)) {
    let ec = typeof o['error_code'] === 'string' ? o['error_code'] : oc || null;
    if (!(ec && ec in AUTH) && ec !== 'weak_password') {
      const hit = AUTH_MSG.find(([re]) => re.test(message));
      ec = hit ? hit[1] : ec;
    }
    if (ec === 'weak_password') {
      const min = Number((/at least (\d+) characters/i.exec(message) ?? [])[1]);
      return min ? ['auth.weak_password', { min }] : ['auth.weak_password_other', {}];
    }
    const mapped = ec ? AUTH[ec] : undefined;
    if (mapped) return [mapped, {}];
    if (status === 429) return ['auth.rate_limit', {}];
    if (status >= 500) return ['auth.server', { status }];
    return ['auth.unknown', { status, detail: message }];
  }
  if (/PGRST205|42P01/.test(oc) || /schema cache|does not exist|Bucket not found/i.test(message)) return ['cloud.schema_old', {}];
  if (status === 401 || /\bJWT\b/i.test(message)) return ['auth.session_expired', {}];
  if (oc === '42501' || status === 403 || /row-level security/i.test(message)) return ['cloud.permission', {}];
  if (status === 413 || /maximum allowed size|payload too large/i.test(message)) return ['cloud.too_large', {}];
  if (status === 429) return ['cloud.rate_limit', {}];
  if (status >= 500) return ['cloud.server', { status }];
  return ['cloud.unknown', { status, detail: message }];
}

const RETRYABLE = new Set<ErrorCode>([
  'cloud.rate_limit',
  'cloud.server',
  'auth.rate_limit',
  'auth.server',
  'cloud.network',
  'auth.network',
]);

export function failedAnswer(path: string, body: unknown, status: number): NoemaError {
  const message = serverMessage(body, status),
    [code, params] = classify(path, body, status, message);
  return new NoemaError(code, message, { params, status, retryable: RETRYABLE.has(code) });
}

/** A fetch that did not reach the server. */
export function networkError(path: string, cause: unknown): NoemaError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new NoemaError(/^\/auth\//.test(path) ? 'auth.network' : 'cloud.network', `Network error — are you offline? (${detail})`, {
    params: { detail },
    cause,
    retryable: true,
  });
}

export const notSignedIn = (): NoemaError => new NoemaError('auth.not_signed_in', 'Not signed in');
