/**
 * 🔔 The banner under the top bar: the newest share, invitation or update that waits for me, with what the bell's row
 * offers (Accept / Join, Reject; Update / Get it / Review, Keep mine), "+n more in the bell" and Later (it stays in the
 * bell). News never shows here, only in the bell. Drawn into the frame's .sharebar (classic and new), which it shows
 * only while something waits. A share accepted asks whether to open it now.
 */
import { html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { ask } from '../../community/ui/dialogs.ts';
import type { AcceptedShare, NoteItem } from '../../community/ui/host.ts';
import { CommunityElement } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { NOTES_CSS } from './styles.ts';

/** what the banner shows of the list: what waits for an answer, not what I put off, not news */
export const waiting = (list: readonly NoteItem[], later: ReadonlySet<string>): NoteItem[] =>
  list.filter(x => x.kind !== 'notice' && !later.has(x.id));

export class NoemaShareBar extends CommunityElement {
  /** the frame's bar it is drawn into: shown only while something waits */
  onShown: ((shown: boolean) => void) | null = null;
  #list: readonly NoteItem[] = [];
  #later = new Set<string>();
  #off: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'notes', COMMON, NOTES_CSS);
    this.#off = this.host.notes.on(l => {
      this.#list = l;
      this.requestUpdate();
    });
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
  }
  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.onShown?.(waiting(this.#list, this.#later).length > 0);
  }
  async #accepted(s: AcceptedShare): Promise<void> {
    const title = s.title ?? '';
    const yes = await ask(this.deps, {
      text: this.t('sh.openNow', { title }),
      ok: this.t('loader.viewer.open'),
      cancel: this.t('sh.later'),
    });
    if (yes) this.host.notes.open(s);
  }
  override render(): TemplateResult {
    const items = waiting(this.#list, this.#later),
      first = items[0];
    if (!first) return html``;
    return html`<div class="nc nx-bar">
      <noema-share-row
        class="nx-barrow"
        .deps=${this.deps}
        .item=${first}
        .onAccepted=${(s: AcceptedShare) => void this.#accepted(s)}
      ></noema-share-row>
      ${items.length > 1 ? html`<span class="nc-tiny nx-more">${this.t('sh.moreInBell', { n: items.length - 1 })}</span>` : nothing}
      <noema-button
        class="nx-later"
        size="sm"
        variant="quiet"
        title=${this.t('sh.decideLater')}
        @click=${() => {
          this.#later.add(first.id);
          this.requestUpdate();
        }}
        >${this.t('sh.later')}</noema-button
      >
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-share-bar': NoemaShareBar;
  }
}
