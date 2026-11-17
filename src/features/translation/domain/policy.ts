/* 🌐 What may leave the device to be translated (docs/i18n.md §11): only texts of a PUBLIC kind; never an item marked private
   or sensitive; never a text that looks like personal data (an e-mail address, a phone number, a key or token). */

/** The kinds of text that may be sent: public listings and what was shared (never a private note, never a person's message). */
export const PUBLIC_KINDS: readonly string[] = Object.freeze(['explore.pack', 'explore.roadmap', 'shared.roadmap', 'shared.pack']);
/** The longest text that is sent. */
export const MAX_TEXT = 4000;

/** A text to translate, with what is known of it. */
export interface MtItem {
  readonly text: string;
  readonly language?: string | null | undefined;
  readonly kind?: string | null | undefined;
  readonly private?: boolean | undefined;
  readonly sensitive?: boolean | undefined;
  readonly visibility?: string | undefined;
  readonly public?: boolean | undefined;
}

/** Why a text is not sent: 'policy' (not a public kind) · 'private' · 'sensitive' (looks like personal data) · 'empty' · 'long'. */
export type PolicyReason = 'policy' | 'private' | 'sensitive' | 'empty' | 'long';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /\+?\d[\d ()./-]{7,}\d/g; // then: 9–15 digits and not a date (phoneLike)
const KEY =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/;
const DATE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/;

const phoneLike = (s: string): boolean =>
  (s.match(PHONE) ?? []).some(m => {
    const d = m.replace(/\D/g, '').length;
    return d >= 9 && d <= 15 && !DATE.test(m.trim());
  });

/** → null when the item may be sent, else the reason. `kind`: the kind of the whole call (an item may carry its own). */
export function check(item: MtItem | string | null | undefined, kind?: string | null): PolicyReason | null {
  const it: MtItem = typeof item === 'string' ? { text: item } : (item ?? { text: '' });
  const k = it.kind ?? kind ?? '';
  if (!PUBLIC_KINDS.includes(k)) return 'policy';
  if (it.private || it.sensitive || it.visibility === 'private' || it.public === false) return 'private';
  const s = it.text;
  if (!/\p{L}/u.test(s)) return 'empty';
  if (s.length > MAX_TEXT) return 'long';
  if (EMAIL.test(s) || KEY.test(s) || phoneLike(s)) return 'sensitive';
  return null;
}
