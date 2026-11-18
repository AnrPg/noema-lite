/**
 * 🌐 The shared texts on a page: a node marked with what is known of its text (its stored language, its kind, private), its
 * translation shown in place (marked machine-translated, the original in its tooltip) and the original brought back.
 */
import type { Translator } from '../application/translator.ts';
import { languageName } from './light.ts';
import type { I18n } from '../../../ports/i18n.ts';

interface Mark {
  readonly orig: string;
  readonly language: string | null;
  readonly kind: string;
  readonly private: boolean;
}
const MARKS = new WeakMap<Element, Mark>();

export interface MarkOptions {
  readonly language?: string | null | undefined;
  readonly kind?: string | undefined;
  readonly private?: boolean | undefined;
}

/** Marks a node whose text is a shared text (kind: one of PUBLIC_KINDS). → the node */
export function mark<T extends Element>(node: T, o: MarkOptions = {}): T {
  MARKS.set(node, { orig: node.textContent, language: o.language ?? null, kind: o.kind ?? 'explore.pack', private: !!o.private });
  node.setAttribute('data-mt', o.kind ?? 'explore.pack');
  return node;
}

export const marked = (nodes: readonly (Element | null | undefined)[]): Element[] => nodes.filter((n): n is Element => !!n && MARKS.has(n));
/** the text a marked node had before any translation */
export const original = (n: Element): string | null => MARKS.get(n)?.orig ?? null;
/** the item a marked node stands for */
export function itemOf(n: Element): { text: string; language: string | null; kind: string; private: boolean } | null {
  const m = MARKS.get(n);
  return m ? { text: m.orig, language: m.language, kind: m.kind, private: m.private } : null;
}

/** May it be sent, and is it in another language than the interface's? */
export function needs(mt: Translator, n: Element, to = mt.uiLocale()): boolean {
  const m = MARKS.get(n);
  return !!m && !mt.check({ text: m.orig, private: m.private }, m.kind) && mt.differs(m.orig, m.language, to);
}

export const isShown = (n: Element): boolean => n.getAttribute('data-mt-state') === 'mt';

const badgeOf = (n: Element): Element | null => {
  const b = n.nextElementSibling;
  return b && b === n.nextSibling && b.classList.contains('mt-badge') ? b : null;
};

/** Shows a translation in place: marked machine-translated, the original in the tooltip. */
export function show(mt: Translator, i18n: I18n, n: Element, text: string, provider: string): void {
  const m = MARKS.get(n);
  if (!m) return;
  n.textContent = text;
  n.setAttribute('data-mt-state', 'mt');
  n.classList.add('mt-on');
  n.setAttribute('lang', mt.uiLocale());
  n.setAttribute('dir', 'auto');
  const from = mt.detect(m.orig, m.language);
  n.setAttribute(
    'title',
    i18n.t('mt.badgeTip', { from: from ? languageName(from, i18n.locale()) : '?', provider: provider || '…', original: m.orig }),
  );
  if (!badgeOf(n)) {
    const b = n.ownerDocument.createElement('span');
    b.className = 'mt-badge';
    b.setAttribute('data-mt-badge', '1');
    b.textContent = i18n.t('mt.badge');
    n.after(b);
  }
}

/** Brings the original back. */
export function restore(n: Element): void {
  const m = MARKS.get(n);
  if (!m) return;
  n.textContent = m.orig;
  n.removeAttribute('data-mt-state');
  n.classList.remove('mt-on');
  n.removeAttribute('title');
  n.removeAttribute('dir');
  if (m.language) n.setAttribute('lang', m.language);
  else n.removeAttribute('lang');
  badgeOf(n)?.remove();
}
