/**
 * Opening a Roadmap dialog from anywhere (the map, a notice, the older screens): the element goes to the end of the
 * page's body — inside the data provider — shows itself, and is removed when its own dialog closes (the kit's noema-close
 * from its shadow root). → the element.
 */
export interface Openable extends HTMLElement {
  readonly updateComplete: Promise<boolean>;
  show(): void;
}

export function openDialog<E extends Openable>(el: E, doc: Document = document): E {
  doc.body.append(el);
  el.addEventListener('noema-close', e => {
    const from = e.composedPath()[0];
    if (from === el || (from instanceof Node && from.getRootNode() === el.shadowRoot)) el.remove();
  });
  void el.updateComplete.then(() => {
    el.show();
  });
  return el;
}
