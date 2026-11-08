/** Reading a screen in the unit tests: through the shadow roots, as a learner sees it. */
import { settle } from '../../../../ui/test/services.ts';

/** everything under an element (its own shadow root first), through the shadow roots */
export const deep = (r: Element | ShadowRoot): Element[] => {
  const kids = [...(r instanceof Element && r.shadowRoot ? [r.shadowRoot] : []), r];
  return kids.flatMap(k => [...k.children].flatMap(e => [e, ...deep(e)]));
};
export const find = (sel: string, root: Element = document.body): HTMLElement | undefined =>
  deep(root).find((e): e is HTMLElement => e.matches(sel));
export const findAll = (sel: string, root: Element = document.body): HTMLElement[] =>
  deep(root).filter((e): e is HTMLElement => e.matches(sel));
/** the text a learner sees: every text node, through the shadow roots (slotted text once) */
export const text = (root: Node): string => {
  const walk = (n: Node): string =>
    n.nodeType === 3
      ? (n.textContent ?? '')
      : n.nodeType === 8
        ? ''
        : [...(n instanceof Element && n.shadowRoot ? [n.shadowRoot] : []), ...n.childNodes].map(walk).join(' ');
  return walk(root).replace(/\s+/g, ' ');
};
export const click = (sel: string, root?: Element): void => {
  const e = find(sel, root);
  if (!e) throw new Error(`no ${sel}`);
  (e.shadowRoot?.querySelector('button') ?? e).click();
};
/** a field of the kit: its value set as the learner types it */
export const type = (sel: string, value: string, root?: Element): void => {
  const f = find(sel, root);
  const input = f?.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ?? null;
  if (!input) throw new Error(`no field ${sel}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
};
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 0));
    await settle(document.body);
  }
};
const listening: (() => void)[] = [];
/** the events of these types that reach the document, in order (until stopEvents) */
export function events(...types: string[]): { type: string; detail: unknown }[] {
  const got: { type: string; detail: unknown }[] = [];
  for (const t of types) {
    const f = (e: Event): void => {
      got.push({ type: t, detail: (e as CustomEvent).detail });
    };
    document.addEventListener(t, f);
    listening.push(() => {
      document.removeEventListener(t, f);
    });
  }
  return got;
}
export function stopEvents(): void {
  for (const f of listening.splice(0)) f();
}
