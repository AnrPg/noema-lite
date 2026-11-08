/**
 * The stack of open overlays of a page (menus, tips, popovers, dialogs, sheets): one Escape closes the top one only (a
 * menu inside a dialog closes before the dialog), and a press outside the top light-dismiss overlay closes it (a modal
 * one is never closed from outside: the learner answers it). The listeners are installed once per document, in the
 * capture phase, so a component's own handlers never see an Escape the stack has used.
 *
 *   const close = openOverlay({ host, close: reason => …, lightDismiss: true });   // when it opens
 *   close();                                                                       // when it closed by itself
 */
export type CloseReason = 'escape' | 'outside';

export interface Overlay {
  /** the element whose composed subtree belongs to the overlay (a press inside it is not "outside") */
  readonly host: Element;
  /** other elements a press on is not "outside" either (the button that opened it) */
  readonly keep?: readonly Element[];
  /** closes on a press outside (menus, tips); false for a dialog */
  readonly lightDismiss: boolean;
  /** false: Escape does not close it (a dialog that must be answered) */
  readonly escape?: boolean;
  close(reason: CloseReason): void;
}

interface Stack {
  readonly items: Overlay[];
}
const STACKS = new WeakMap<Document, Stack>();

function stackOf(doc: Document): Stack {
  let s = STACKS.get(doc);
  if (s) return s;
  const made: Stack = { items: [] };
  s = made;
  STACKS.set(doc, made);
  doc.addEventListener(
    'keydown',
    e => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const top = made.items.at(-1);
      if (!top) return;
      e.preventDefault(); // also stops a native <dialog> from closing on its own: the stack decides
      e.stopPropagation();
      if (top.escape !== false) top.close('escape');
    },
    true,
  );
  doc.addEventListener(
    'pointerdown',
    e => {
      const path = e.composedPath();
      // from the top down: close every light-dismiss overlay the press is outside of, stop at the first it is inside of
      for (const o of [...made.items].reverse()) {
        const inside = path.includes(o.host) || (o.keep ?? []).some(k => path.includes(k));
        if (inside || !o.lightDismiss) return;
        o.close('outside');
      }
    },
    true,
  );
  return made;
}

/** Puts an overlay on top of the page's stack; → removes it (call it when it closed, whatever closed it). */
export function openOverlay(o: Overlay, doc: Document = o.host.ownerDocument): () => void {
  const s = stackOf(doc);
  s.items.push(o);
  return () => {
    const i = s.items.indexOf(o);
    if (i >= 0) s.items.splice(i, 1);
  };
}

/** How many overlays are open on the page (tests, and the frame: no auto-hiding of the top bar under an open one). */
export const openOverlays = (doc: Document = document): number => stackOf(doc).items.length;
