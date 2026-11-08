/**
 * Small pieces the community screens share: sizes, moments, language names in the interface language, the tone of a
 * person or group (one of the four tints, the same every time for the same id), their face (an emoji or an initial).
 */
import { html, type TemplateResult } from 'lit';
import type { I18n } from '../../../ports/i18n.ts';

/** the text of an unknown value of a row ('' for none) */
export const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');

/** a size in MB as the locale writes numbers (at least 0.1) */
export const mb = (i18n: I18n, bytes: number): string =>
  i18n.format.number(Math.max(0.1, bytes / 1048576), { maximumFractionDigits: 1 }) + ' MB'; // i18n-ignore (a unit)

/** KB below 1 MB, else MB (the share dialog's file sizes) */
export const size = (i18n: I18n, bytes: number): string =>
  bytes >= 1048576
    ? i18n.format.number(bytes / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB' // i18n-ignore (a unit)
    : i18n.format.number(Math.max(1, Math.round(bytes / 1024))) + ' KB'; // i18n-ignore (a unit)

/** a moment as short as it can be: 14:05 today, 3 Oct this year, 3 Oct 2024 before */
export function when(i18n: I18n, at: string | number | Date, now: number): string {
  const d = new Date(at),
    n = new Date(now);
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() === n.toDateString()) return i18n.format.date(d, { hour: 'numeric', minute: '2-digit' });
  return i18n.format.date(
    d,
    d.getFullYear() === n.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' },
  );
}

/** a language's name in the interface language (its code when the platform does not know it) */
export function langName(i18n: I18n, code: string): string {
  try {
    return new Intl.DisplayNames([i18n.locale()], { type: 'language' }).of(code) ?? code;
  } catch {
    return code; // not a language code the platform knows: the code itself
  }
}

/** one of the four tints, always the same for the same id */
export function tone(id: unknown): number {
  let sum = 0;
  for (const c of str(id)) sum += c.codePointAt(0) ?? 0;
  return 1 + (sum % 4);
}

/** the first letter as a reader sees it (a whole grapheme: an accent, a joined emoji) */
function firstGrapheme(s: string): string {
  for (const g of new Intl.Segmenter().segment(s)) return g.segment;
  return '';
}

/** the face of a person or a group: its emoji, else its first letter (decoration: the name is next to it) */
export function face(emoji: unknown, name: unknown, id: unknown): TemplateResult {
  const n = tone(id),
    e = typeof emoji === 'string' && emoji.trim() ? emoji.trim() : '';
  const letter = firstGrapheme(str(name).trim()).toUpperCase() || '?';
  return html`<span class="nc-face" style="--bgc: var(--t${n}); --fgc: var(--t${n}i)" aria-hidden="true">${e || letter}</span>`;
}

/** a tinted pill (n: 1–6 of the tints) */
export const pill = (text: string, n = 1, cls = ''): TemplateResult =>
  html`<span class="nc-pill ${cls}" style="--bgc: var(--t${n}); --fgc: var(--t${n}i)">${text}</span>`;

/** saves a blob as a file with its name (the browser's download) */
export function download(blob: Blob, name: string): void {
  const doc = globalThis.document,
    a = doc.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  doc.body.append(a);
  a.click();
  a.remove();
  globalThis.setTimeout(() => {
    URL.revokeObjectURL(a.href);
  }, 60000);
}

/** copies a text; → false when the browser refused (the caller offers another way) */
export async function copyText(text: string): Promise<boolean> {
  try {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // no clipboard here (permissions, an older browser): the caller shows the text to copy by hand
  }
}
