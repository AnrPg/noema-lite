/**
 * Focus across shadow roots: the element that really has focus (document.activeElement stops at the outermost shadow
 * host), and giving focus back to it later — what every overlay does when it closes (the menu's button, the control that
 * opened a dialog). Unique ids for ARIA links inside one shadow root.
 */

/** The focused element, followed into open shadow roots. */
export function deepActiveElement(doc: Document = document): Element | null {
  let a: Element | null = doc.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

/** Remembers what has focus now; calling the result gives it focus again (if it is still on the page). */
export function rememberFocus(doc: Document = document): () => void {
  const was = deepActiveElement(doc);
  return () => {
    if (was instanceof HTMLElement && was.isConnected) was.focus({ preventScroll: true });
  };
}

let seq = 0;
/** A page-unique id for aria-controls, aria-labelledby … */
export const uid = (prefix: string): string => `${prefix}-${(++seq).toString(36)}`;
