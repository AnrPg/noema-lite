/**
 * 🔎 A member reviews the owner's changes to a shared Roadmap (docs/CURRICULUM.md §8): each change with a tick box (a
 * step the member studies from their own subject comes unticked), take the ticked ones, keep my copy, or not now (the
 * update keeps waiting in 🔔). Nothing new: the copy is brought up to date at once and no dialog shows. A dialog:
 *
 *   NoemaRoadmapReview.open({ account, roadmapId })   → its .ready: it is showing, or it is done already
 *
 * Fires roadmap-changes-done { roadmap } once the changes were taken or kept (not for Not now).
 */
import { css, html, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaDialog } from '../../../ui/index.ts';
import type { Incoming } from './data.ts';
import { RoadmapElement } from './element.ts';
import { openDialog } from './open.ts';
import { screen } from './styles.ts';

const CHANGE_ICON: Readonly<Record<string, string>> = { map: '🧭', add: '➕', del: '➖', info: '✏️', plan: '📝', mat: '📎', links: '🔗' };

export class NoemaRoadmapReview extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    inc: { state: true },
    busy: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: contents;
      }
      .cm-changes {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 10px 0 0;
      }
      .cm-change {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        min-height: 24px;
        padding: 8px 10px;
        border: 1px solid var(--u-line);
        border-radius: var(--u-br);
        background: var(--u-paper);
        line-height: 1.4;
        cursor: pointer;
        overflow-wrap: anywhere;
      }
      .cm-change.own {
        background: var(--u-warn);
        color: var(--u-warn-ink);
      }
      .cm-change input {
        flex: none;
        width: 24px;
        height: 24px;
        margin: 0;
        accent-color: var(--u-acc);
      }
      .cm-change span {
        min-width: 0;
      }
    `,
  ];
  declare account: string;
  declare roadmapId: string;
  declare inc: Incoming | null;
  declare busy: boolean;
  /** it is showing, or there was nothing to show */
  readonly ready: Promise<void>;
  #ready: () => void = () => undefined;

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.inc = null;
    this.busy = false;
    this.ready = new Promise(r => {
      this.#ready = r;
    });
  }

  /** Opens the review of the owner's changes (the map's 🔔 button, the update in 🔔). */
  static open(p: { account: string; roadmapId: string }): NoemaRoadmapReview {
    return openDialog(Object.assign(new NoemaRoadmapReview(), p));
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('cm-review');
  }

  get #dialog(): NoemaDialog | null {
    return this.renderRoot.querySelector('noema-dialog');
  }

  /** what the owner changed; nothing to show: the copy is brought up to date and the element goes */
  show(): void {
    void this.#load();
  }

  async #load(): Promise<void> {
    let inc: Incoming;
    try {
      inc = await this.data.share.incoming(this.account, this.roadmapId);
    } catch (e) {
      this.data.notify('⚠️ ' + this.i18n.err(e));
      this.#end();
      return;
    }
    if (!this.data.roadmap(this.account, this.roadmapId)) {
      this.#end();
      return;
    }
    if (!inc.list.length) {
      try {
        await this.data.share.takeChanges(this.account, this.roadmapId, [], inc);
        this.data.notify(this.t('roadmap.map.chg.none'));
        this.emit('roadmap-changes-done', { roadmap: this.roadmapId });
      } catch (e) {
        this.data.notify('⚠️ ' + this.i18n.err(e));
      }
      this.#end();
      return;
    }
    this.inc = inc;
    await this.updateComplete;
    this.#dialog?.show();
    this.#ready();
  }

  /** nothing (more) to show: the element leaves the page */
  #end(): void {
    this.remove();
    this.#ready();
  }

  async #done(keys: string[]): Promise<void> {
    const inc = this.inc;
    if (!inc) return;
    this.busy = true;
    try {
      await this.data.share.takeChanges(this.account, this.roadmapId, keys, inc);
      this.data.notify(keys.length ? '✅ ' + this.t('roadmap.map.chg.took', { n: keys.length }) : '👍 ' + this.t('roadmap.map.chg.kept'));
      this.emit('roadmap-changes-done', { roadmap: this.roadmapId });
      this.#dialog?.close('done');
    } catch (e) {
      this.data.notify('⚠️ ' + this.i18n.err(e));
    }
    this.busy = false;
  }

  #ticked(): string[] {
    return [...this.renderRoot.querySelectorAll<HTMLInputElement>('.cm-change input:checked')].map(i => i.dataset['key'] ?? '');
  }

  override render(): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId),
      list = this.inc?.list ?? [];
    const who = c?.shared?.ownerName ?? this.t('roadmap.map.chg.theOwner'),
      title = c ? (c.title ?? c.goal ?? '') : '';
    return html`<noema-dialog class="cm-reviewdlg" heading=${'🔔 ' + this.t('roadmap.map.chg.title', { who, title })}>
      <p class="tiny">${this.t('roadmap.map.chg.lead')}</p>
      <div class="cm-changes">
        ${list.map(
          ch =>
            html`<label class="cm-change${ch.own ? ' own' : ''}"
              ><input type="checkbox" data-key=${ch.key} ?checked=${!ch.own} /><span
                >${(CHANGE_ICON[ch.kind] ?? '•') + ' ' + ch.text}</span
              ></label
            >`,
        )}
      </div>
      <noema-button slot="actions" class="cm-takechanges" ?disabled=${this.busy} @click=${(): void => void this.#done(this.#ticked())}
        >✓ ${this.t('roadmap.map.chg.take')}</noema-button
      >
      <noema-button slot="actions" variant="secondary" class="cm-keepmine" ?disabled=${this.busy} @click=${(): void => void this.#done([])}
        >${this.t('roadmap.map.chg.keep')}</noema-button
      >
      <noema-button
        slot="actions"
        variant="quiet"
        class="cm-notnow"
        @click=${(): void => {
          this.#dialog?.close('dismiss');
        }}
        >${this.t('roadmap.map.notNow')}</noema-button
      >
    </noema-dialog>`;
  }
}
