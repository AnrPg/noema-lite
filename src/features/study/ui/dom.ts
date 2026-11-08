/**
 * The few DOM helpers of the study widgets (an exercise's answer area, a picture's stage): the screens are Lit templates,
 * but a widget that measures, drags and draws on an SVG overlay is clearer as a small tree of elements it keeps hold of.
 * `h()` builds an element (attributes, listeners, children); `html:` sets markup that the caller made safe (text.ts).
 */

export type Child = Node | string | number | null | undefined | false;
/** a listener; an async one's failure is reported, never left unhandled */
type Listener = (e: Event) => void | Promise<void>;
export interface Attrs {
  readonly [name: string]: string | number | boolean | null | undefined | Listener | Partial<CSSStyleDeclaration>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: readonly (Child | readonly Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function')
      el.addEventListener(k.slice(2), e => {
        const r = v(e);
        if (r)
          r.catch((err: unknown) => {
            reportError(err);
          });
      });
    else if (typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

/** Appends children (nested lists flattened; null, undefined and false skipped; text as text). */
export function append(el: Element, kids: readonly (Child | readonly Child[])[]): void {
  for (const kid of kids.flat())
    if (kid !== null && kid !== undefined && kid !== false) el.append(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function sv<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number | null | undefined>> = {},
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  return e;
}

/** Restarts a CSS animation class (shake, pop) on an element. */
export function replay(el: Element, cls: string): void {
  el.classList.remove(cls);
  el.getBoundingClientRect(); // a reflow: the class comes back as a new animation
  el.classList.add(cls);
}

/** Fisher–Yates with Math.random: the order a learner sees options in (never a verdict). */
export function shuffle<T>(list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export const letter = (i: number): string => String.fromCharCode(65 + i);
