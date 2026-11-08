/**
 * 🔗 The share dialog of a subject: public (everyone finds it in Explore) or with one person (by e-mail; they accept it
 * from 🔔), its source files with it unless the learner unticks them, the licence warning acknowledged first when some
 * pictures are not openly licensed, the shares sent and their status (a waiting one can be withdrawn). A local profile
 * (no cloud) gets the package as a file to send instead. The cloud's calls are the host's (ShareHost).
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { I18n } from '../../../ports/i18n.ts';
import { openDialog } from '../../community/ui/dialogs.ts';
import { mb } from '../../community/ui/format.ts';
import type { HostSubject, SharePrep } from '../../community/ui/host.ts';
import { CommunityElement, type ScreenBase } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { SHARE_CSS } from './styles.ts';

export interface ShareDeps extends ScreenBase {
  readonly i18n: I18n;
}

type Sent = readonly { readonly id: string; readonly to_email: string; readonly status: string }[];
const STATUS_MARK: Readonly<Record<string, string>> = { pending: '⏳', accepted: '✅', rejected: '✖', revoked: '↩' };

/** The dialog's body (its own element: a re-render keeps what the learner typed). */
export class NoemaSharePanel extends CommunityElement<ShareDeps> {
  static override properties = {
    ...CommunityElement.properties,
    prep: { attribute: false },
    cloud: { type: Boolean },
  };
  declare prep: SharePrep;
  declare cloud: boolean;
  #pub: { readonly at?: string } | null = null;
  #sent: Sent = [];
  #acked = false;
  #withFiles = true;
  #shake = false;
  #progress = '';
  #status = '';
  #working = false;

  #T(k: string, p?: Record<string, string | number>): string {
    return this.i18n.t('loader.share.' + k, p);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.cloud) void this.#load();
  }
  async #load(): Promise<void> {
    const sh = this.host.share,
      id = this.prep.subject.id;
    const [pub, sent] = await Promise.all([sh.published(id).catch(() => null), sh.sent(id).catch(() => [])]);
    this.#pub = pub;
    this.#sent = sent;
    this.requestUpdate();
  }
  /** the warning acknowledged (or none): else it shakes, and nothing is sent */
  #ok(): boolean {
    if (!this.prep.restricted || this.#acked) return true;
    this.#shake = false;
    this.requestUpdate();
    void this.updateComplete.then(() => {
      this.#shake = true;
      this.requestUpdate();
    });
    return false;
  }
  #onProgress = (done: number, total: number, name: string): void => {
    this.#progress = total ? this.#T('uploading', { k: Math.min(total, Math.floor(done) + 1), n: total, name }) : this.#T('preparingFiles');
    this.requestUpdate();
  };
  async #publish(e: Event): Promise<void> {
    if (!this.#ok()) return;
    const again = !!this.#pub;
    const done = await this.busy(e.currentTarget, () =>
      this.host.share.publish(this.prep, { files: this.#files(), onProgress: this.#onProgress }),
    );
    this.#progress = '';
    if (done) this.toast(this.#T(again ? 'updated' : 'publicNow'));
    await this.#load();
  }
  async #unpublish(e: Event): Promise<void> {
    if (await this.busy(e.currentTarget, () => this.host.share.unpublish(this.prep.subject.id))) this.toast(this.#T('withdrawn'));
    await this.#load();
  }
  #files(): boolean {
    return this.prep.files.n > 0 && this.#withFiles;
  }
  async #send(): Promise<void> {
    if (!this.#ok()) return;
    const email = this.querySelector<HTMLInputElement>('.nx-email'),
      msg = this.querySelector<HTMLInputElement>('.nx-msg');
    if (!email || !msg) return;
    const to = email.value.trim().toLowerCase();
    this.#status = this.#T('sending');
    this.#working = true;
    this.requestUpdate();
    try {
      await this.host.share.send(this.prep, { email: to, message: msg.value.trim(), files: this.#files(), onProgress: this.#onProgress });
      this.#status = this.#T('sent', { email: to });
      email.value = '';
      msg.value = '';
    } catch (er) {
      this.#status = this.i18n.err(er);
    }
    this.#working = false;
    this.#progress = '';
    await this.#load();
  }
  async #withdraw(e: Event, id: string): Promise<void> {
    await this.busy(e.currentTarget, () => this.host.share.withdraw(id));
    await this.#load();
  }

  override render(): TemplateResult {
    const p = this.prep,
      c = p.counts;
    const head = html`<p class="nc-muted nx-counts">
      ${this.#T('counts', { chapters: c.chapters, exercises: c.exercises, pictures: c.pictures })}
    </p>`;
    if (!this.cloud)
      return html`${head}
        <p>${this.#T('needsCloud')}</p>
        <div class="nc-row">
          <noema-button
            class="nx-download"
            @click=${() => {
              this.host.share.download(p);
            }}
            >${this.#T('download')}</noema-button
          >
        </div>`;
    const pub = this.#pub;
    return html`${head}
      ${
        p.restricted
          ? html`<label class="nc-check nx-warn ${this.#shake ? 'shake' : ''}"
              ><input
                type="checkbox"
                .checked=${this.#acked}
                @change=${(e: Event) => {
                  this.#acked = (e.target as HTMLInputElement).checked;
                }}
              /><span>${this.#T('restricted', { n: p.restricted })}</span></label
            >`
          : nothing
      }
      ${
        p.files.n
          ? html`<label class="nc-check nx-files"
              ><input
                type="checkbox"
                .checked=${this.#withFiles}
                @change=${(e: Event) => {
                  this.#withFiles = (e.target as HTMLInputElement).checked;
                }}
              /><span>${this.#T('includeFiles', { n: p.files.n, size: mb(this.i18n, p.files.bytes) })}</span></label
            >`
          : nothing
      }
      <p class="nc-tiny nx-prog" aria-live="polite">${this.#progress}</p>
      <section class="nx-sec nx-public">
        <h3>${this.#T('public')}</h3>
        <p class="nc-tiny nc-muted">${this.#T('publicTip')}</p>
        <p class="nc-tiny">
          ${pub ? this.#T('publicSince', { date: pub.at ? this.i18n.format.date(pub.at, { dateStyle: 'medium' }) : '' }) : this.#T('onlyYou')}
        </p>
        <div class="nc-row">
          ${
            pub
              ? html`<noema-button class="nx-republish" @click=${(e: Event) => void this.#publish(e)}
                    >${this.#T('publishNewest')}</noema-button
                  >
                  <noema-button class="nx-unpublish" variant="quiet" @click=${(e: Event) => void this.#unpublish(e)}
                    >${this.#T('withdraw')}</noema-button
                  >`
              : html`<noema-button class="nx-publish" variant="primary" @click=${(e: Event) => void this.#publish(e)}
                  >${this.#T('makePublic')}</noema-button
                >`
          }
        </div>
      </section>
      <section class="nx-sec nx-person">
        <h3>${this.#T('person')}</h3>
        <p class="nc-tiny nc-muted">${this.#T('personTip')}</p>
        <input
          class="nc-input nx-email"
          type="email"
          aria-label=${this.#T('emailPlaceholder')}
          placeholder=${this.#T('emailPlaceholder')}
        />
        <input class="nc-input nx-msg" maxlength="200" aria-label=${this.#T('msgPlaceholder')} placeholder=${this.#T('msgPlaceholder')} />
        <div class="nc-row">
          <noema-button class="nx-send" variant="primary" ?disabled=${this.#working} @click=${() => void this.#send()}
            >${this.#T('send')}</noema-button
          >
        </div>
        <p class="nc-tiny nx-status" aria-live="polite">${this.#status}</p>
        ${
          this.#sent.length
            ? html`<div class="nx-sent">
                <span class="nc-label">${this.#T('sentList')}</span>
                ${this.#sent.map(
                  r =>
                    html`<div class="nx-sentrow" data-share=${r.id}>
                      <span class="nc-grow">${r.to_email}</span>
                      <span class="nc-pill nx-st-${r.status}"
                        >${STATUS_MARK[r.status] ?? ''} ${this.#T('status', { status: r.status })}</span
                      >
                      ${
                        r.status === 'pending'
                          ? html`<noema-button
                              class="nx-withdraw"
                              size="sm"
                              variant="quiet"
                              @click=${(e: Event) => void this.#withdraw(e, r.id)}
                              >${this.#T('withdraw')}</noema-button
                            >`
                          : nothing
                      }
                    </div>`,
                )}
              </div>`
            : nothing
        }
      </section>`;
  }
}

/** Opens the share dialog of one of the learner's subjects. */
export async function openShare(deps: ShareDeps, s: HostSubject): Promise<void> {
  adopt(globalThis.document, 'sharing', COMMON, SHARE_CSS);
  let prep: SharePrep;
  try {
    prep = await deps.host.share.prepare(s.id);
  } catch (e) {
    deps.notify.toast(deps.i18n.err(e), { ms: 5000 });
    return;
  }
  const panel = globalThis.document.createElement('noema-share-panel');
  panel.deps = deps;
  panel.prep = prep;
  panel.cloud = deps.host.account()?.kind === 'cloud' && !!deps.host.session();
  openDialog(deps, { heading: deps.i18n.t('loader.share.title', { title: s.title }), cls: 'nx-share', content: panel });
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-share-panel': NoemaSharePanel;
  }
}
