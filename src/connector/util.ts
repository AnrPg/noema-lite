/* Small pure helpers shared by the connector's services and tools (no I/O). */
import { textOf } from '../kernel/text.ts';

/** A subject / pack id (= tools/schemas pack.subject.id). */
export const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
/** A locale such as el, ru, pt-PT, zh-Hans. */
export const LOCALE_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** noema_save_pack, noema_save_translation, noema_save_bridge: bigger documents go through a signed upload URL. */
export const MAX_INLINE = 1_500_000;

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export const isObject = (x: unknown): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x);
/** Any value as text ('' for null and undefined). */
export const str = (x: unknown): string => (x == null ? '' : textOf(x));
export const arr = <T = unknown>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
export const rec = (x: unknown): Record<string, unknown> => (isObject(x) ? x : {});
/** The base language of a locale: 'pt-PT' → 'pt'. */
export const lang0 = (x: unknown): string => str(x).split('-')[0]?.toLowerCase() ?? '';
/** The extension of a file name ('bin' when it has none). */
export const extOf = (name: unknown): string => /\.([a-z0-9]{1,8})$/.exec(str(name).toLowerCase())?.[1] ?? 'bin';
/** A storage-safe path segment (= engine/srcfiles.js cloudPath). */
export const safeSeg = (x: unknown): string => str(x).replace(/[^a-zA-Z0-9_-]/g, '_');
export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
/** A short random pause between retries of a write that raced another one. */
export const jitter = (base: number, spread: number): Promise<void> => sleep(base + Math.random() * spread);
export const message = (e: unknown): string => (e instanceof Error ? e.message : str(e));

/** = src/features/catalog/domain/records.ts hash36: the version stamp of a bridge's content. */
export function hash36(input: string): string {
  let h1 = 0x811c9dc5,
    h2 = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (h2 * 31 + c) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 10);
}

/** SHA-256 of a text, hex (Web Crypto: the Netlify runtime and Node both have it). */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** A version stamp strictly later than `prev` (and never earlier than now): every compare-and-swap write uses it, so a
    row's version always moves forward, whatever the clocks of the writers say (= engine/cloud.js isoAfter). */
export const isoAfter = (prev: string | null | undefined, now: number = Date.now()): string =>
  new Date(Math.max(now, (Date.parse(prev ?? '') || 0) + 1)).toISOString();

/** Parse JSON → the value, or undefined when it is not JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Bytes → base64 (the runtime's btoa, in slices: no call-stack limit on big pictures). */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
