/**
 * The base of the screens of area 5 (languages and activities): a NoemaElement drawn into the light DOM. A screen is a
 * whole page (the frame's <main> holds it), styled by the page's own sheets on the design tokens (engine/tokens.css, the
 * course sheet engine/langui.css generated from engine/lang/*.css, engine/engine.css): its markup keeps the class names
 * those sheets and the browser suites name. The kit's components inside it keep their own shadow roots.
 *
 * Each screen reads its data through one port of its own (a small interface beside it), handed to it as `port`, so the
 * root that mounts it decides where the data comes from (today the older runtime behind window.NoemaLang / NoemaCore,
 * later the features' application services) without a change in the screen.
 */
import { NoemaElement } from '../core/element.ts';
import { provideServices } from '../core/services.ts';
import type { NoemaDialog } from '../kit/dialog.ts';

export class NoemaScreen extends NoemaElement {
  /** light DOM: the page's sheets style the screen */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /**
   * Opens a dialog of this screen: it goes to the frame (or the body), outside the screen, so it gets the screen's
   * services itself; it is removed when it closes.
   */
  protected openDialog(dlg: NoemaDialog, then?: () => void): void {
    const stop = provideServices(dlg, this.services);
    dlg.addEventListener('noema-close', () => {
      stop();
      dlg.remove();
    });
    (this.closest('noema-app-frame') ?? this.ownerDocument.body).append(dlg);
    void dlg.updateComplete.then(() => {
      dlg.show();
      then?.();
    });
  }
}
