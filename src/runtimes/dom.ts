/* The DOM helpers of the runtimes that draw in the app's own page (sim-spec@1): an element with its attributes, handlers and
   children (the same rules as the app's h() of engine/src/10_core.js: null / false attributes are left out, true is an empty
   attribute, `class`, an object `style`, on<event> handlers), and SVG elements. Text is always text, never HTML. */

export type Child = Node | string | number | null | undefined | false | readonly Child[];
export type Attrs = Readonly<Record<string, unknown>>;
/** an attribute's value as the DOM writes it (numbers and words; the views pass nothing else) */
export const str = (v: unknown): string => (typeof v === 'string' ? v : `${v as number}`);

function kids(el: Element, cs: readonly Child[]): void {
  for (const c of cs) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) kids(el, c as readonly Child[]);
    else if (typeof c === 'string' || typeof c === 'number') el.append(document.createTextNode(String(c)));
    else el.append(c as Node);
  }
}

/** an HTML element */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = str(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else el.setAttribute(k, v === true ? '' : str(v));
  }
  kids(el, children);
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
/** an SVG element (null / undefined attributes are left out) */
export function svg(tag: string, attrs?: Attrs | null): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v != null) e.setAttribute(k, str(v));
  return e;
}
