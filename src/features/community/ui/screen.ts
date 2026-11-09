/**
 * The base of every community screen and panel: a NoemaElement drawn in the light DOM (the page's own markup: the ⚑
 * locator reads its data-* chain and its words, the screenshot sees it, the catalog audit reads its text), styled by one
 * stylesheet per screen kind adopted on the document (styles.ts). The kit's components inside keep their shadow roots.
 *
 * A screen tells the frame its tab, crumbs, ← and ⋮ with `noema-screen-chrome` (detail: ScreenChrome), whenever they
 * change; the host (the frame of the day) listens on the element it mounted. The words come from the catalogs of the
 * feature (vault.*, social.*, report.*, sh.sr_*, engine.engines.*: i18n/<component>/).
 */
import type { PropertyValues } from 'lit';
import { NoemaError } from '../../../kernel/errors.ts';
import type { Result } from '../../../kernel/result.ts';
import type { Notifier } from '../../../ports/notifier.ts';
import { NoemaElement } from '../../../ui/core/element.ts';
import type { CommunityHost, ScreenChrome } from './host.ts';

export const CHROME_EVENT = 'noema-screen-chrome';

/** What every community element is handed by its root. */
export interface ScreenBase {
  readonly host: CommunityHost;
  readonly notify: Notifier;
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- each screen names its own deps (search, vault …)
export class CommunityElement<D extends ScreenBase = ScreenBase> extends NoemaElement {
  static override properties = { deps: { attribute: false } };
  declare deps: D;

  /** the page's own markup (see the header) */
  override createRenderRoot(): HTMLElement {
    return this;
  }

  protected get host(): CommunityHost {
    return this.deps.host;
  }

  /** a short message (it fades) */
  protected toast(text: string, ms?: number): void {
    this.deps.notify.toast(text, ms ? { ms } : undefined);
  }

  /** a failure in the learner's words (an error's catalog text: errors.*), as a toast */
  protected fail(e: unknown, words?: (e: unknown) => string): void {
    this.deps.notify.toast(words ? words(e) : this.i18n.err(e), { ms: 6000 });
  }

  /** the value of a use case's Result, or a thrown NoemaError (a step of a flow that `busy` runs) */
  protected need<T>(r: Result<T>): T {
    if (r.ok) return r.value;
    throw r.error;
  }

  /**
   * Runs one action of a button: the button is disabled while it runs, a failure becomes a toast (with `words`, the
   * feature's own words for the server's refusals). → true when it went through.
   */
  protected async busy(button: EventTarget | null, fn: () => Promise<unknown>, words?: (e: unknown) => string): Promise<boolean> {
    const b = button instanceof HTMLElement && 'disabled' in button ? (button as HTMLElement & { disabled: boolean }) : null;
    if (b) b.disabled = true;
    try {
      await fn();
      return true;
    } catch (e) {
      this.fail(e instanceof Error || e instanceof NoemaError ? e : NoemaError.from(e), words);
      return false;
    } finally {
      if (b?.isConnected) b.disabled = false;
    }
  }
}

/** A screen: an element with its chrome (the route's page). */
export class CommunityScreen<D extends ScreenBase = ScreenBase> extends CommunityElement<D> {
  /** the address this screen shows now (set when it is mounted, kept by replaceHash): a frame that draws the same address
      again keeps the screen as it is */
  shownHash = '';

  /** the screen's own state into the address, without drawing anything again */
  protected replaceHash(hash: string): void {
    this.shownHash = hash;
    this.host.replace(hash);
  }

  /** the chrome now (a screen overrides it; `chromeChanged()` tells the frame again) */
  protected chrome(): ScreenChrome {
    return { tab: null, crumbs: [] };
  }

  /** the chrome now (the host reads it when it mounts the screen, before the first drawing) */
  screenChrome(): ScreenChrome {
    return this.chrome();
  }

  protected chromeChanged(): void {
    this.emit(CHROME_EVENT, this.chrome());
  }

  protected override firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    this.chromeChanged();
  }
}
