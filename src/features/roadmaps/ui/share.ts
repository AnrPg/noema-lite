/**
 * 👥 Sharing one of the learner's Roadmaps (docs/CURRICULUM.md §8): public or with people (by e-mail), the steps already
 * prepared included or not; once shared: public ⇄ only invited, invite someone, the people (withdraw, remove), stop
 * sharing. Everybody keeps their own progress; the prepared steps are shared. A dialog:
 *
 *   openDialog(Object.assign(new NoemaRoadmapShare(), { account, roadmapId }))
 *
 * Fires roadmap-shared { roadmap } after every change.
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaDialog, NoemaSwitch, NoemaTextField } from '../../../ui/index.ts';
import type { Member } from './data.ts';
import { RoadmapElement } from './element.ts';
import { screen } from './styles.ts';

const STATUS: Readonly<Record<string, string>> = {
  pending: '⏳ ',
  joined: '✅ ',
  rejected: '✖ ',
  left: '↩ ',
  revoked: '⛔ ',
};

export class NoemaRoadmapShare extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    log: { state: true },
    busy: { state: true },
    members: { state: true },
    confirmStop: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: contents;
      }
      h4 {
        margin: 16px 0 6px;
      }
      .sec {
        display: grid;
        gap: 8px;
      }
      .person {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid var(--u-line);
        overflow-wrap: anywhere;
      }
      summary {
        cursor: pointer;
        min-height: 24px;
        margin-top: 14px;
      }
    `,
  ];
  declare account: string;
  declare roadmapId: string;
  declare log: string;
  declare busy: boolean;
  declare members: Member[] | null | Error;
  declare confirmStop: boolean;

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.log = '';
    this.busy = false;
    this.members = null;
    this.confirmStop = false;
  }

  get #dialog(): NoemaDialog | null {
    return this.renderRoot.querySelector('noema-dialog');
  }

  show(): void {
    this.#dialog?.show();
    void this.#loadMembers();
  }

  async #loadMembers(): Promise<void> {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c?.shared || c.shared.ended) return;
    try {
      this.members = await this.data.share.members(this.roadmapId);
    } catch (e) {
      this.members = e instanceof Error ? e : new Error(String(e));
    }
  }

  async #run(fn: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      await fn();
    } catch (e) {
      this.log = '⚠️ ' + this.i18n.err(e);
    }
    this.busy = false;
    this.emit('roadmap-shared', { roadmap: this.roadmapId });
    await this.#loadMembers();
  }

  #notShared(mine: number, files: number): TemplateResult {
    const publish = (isPublic: boolean): void => {
      const steps = this.renderRoot.querySelector<NoemaSwitch>('.cm-includemine')?.checked ?? true;
      void this.#run(() =>
        this.data.share.publish(this.account, this.roadmapId, {
          isPublic,
          steps,
          onLog: m => {
            this.log = m;
          },
        }),
      );
    };
    return html`<div class="sec">
      ${mine ? html`<noema-switch class="cm-includemine" checked label=${this.t('roadmap.map.share.includeMine', { n: mine })}></noema-switch>` : nothing}
      ${files ? html`<p class="tiny">📎 ${this.t('roadmap.map.share.files', { n: files })}</p>` : nothing}
      <div class="row">
        <noema-button
          class="cm-sharepublic"
          ?disabled=${this.busy}
          @click=${(): void => {
            publish(true);
          }}
          >🌍 ${this.t('roadmap.map.share.makePublic')}</noema-button
        >
        <noema-button
          class="cm-sharepeople"
          variant="secondary"
          ?disabled=${this.busy}
          @click=${(): void => {
            publish(false);
          }}
          >👥 ${this.t('roadmap.map.share.withPeople')}</noema-button
        >
      </div>
      <p class="tiny">${this.t('roadmap.map.share.howTo')}</p>
    </div>`;
  }

  #people(): TemplateResult {
    const m = this.members;
    if (m === null) return html`<p class="tiny">…</p>`;
    if (m instanceof Error) return html`<p class="tiny status bad">⚠️ ${this.i18n.err(m)}</p>`;
    if (!m.length) return html`<p class="tiny">${this.t('roadmap.map.share.nobody')}</p>`;
    return html`${m.map(
      p =>
        html`<div class="person cm-member">
          <span class="grow"
            ><strong>${p.name ?? p.email}</strong>${p.name ? html` <span class="tiny">${p.email}</span>` : nothing}
            <span class="tiny">
              · ${(STATUS[p.status] ?? '') + (STATUS[p.status] ? this.t('roadmap.map.share.st.' + p.status) : p.status)}</span
            ></span
          >
          ${
            p.status === 'pending' || p.status === 'joined'
              ? html`<noema-button
                  size="sm"
                  variant="quiet"
                  class="cm-removemember"
                  ?disabled=${this.busy}
                  @click=${(): void =>
                    void this.#run(() => this.data.share.removeMember(this.roadmapId, p.email, { pending: p.status === 'pending' }))}
                  >${this.t(p.status === 'pending' ? 'roadmap.map.share.withdraw' : 'roadmap.map.share.remove')}</noema-button
                >`
              : nothing
          }
        </div>`,
    )}`;
  }

  #shared(isPublic: boolean, ready: number, total: number, people: number): TemplateResult {
    const invite = (): void => {
      const email = (this.renderRoot.querySelector<NoemaTextField>('.cm-email')?.value ?? '').trim(),
        msg = (this.renderRoot.querySelector<NoemaTextField>('.cm-message')?.value ?? '').trim();
      void this.#run(async () => {
        await this.data.share.invite(this.account, this.roadmapId, email, msg);
        this.log = '📨 ' + this.t('roadmap.map.share.invited', { email });
      });
    };
    return html`<p>
        ${isPublic ? '🌍 ' + this.t('roadmap.map.share.isPublic') : '👥 ' + this.t('roadmap.map.share.isPeople')}
        <span class="tiny"> · ${this.t('roadmap.map.share.state', { ready, total, people })}</span>
      </p>
      <noema-button
        size="sm"
        variant="secondary"
        class="cm-publictoggle"
        ?disabled=${this.busy}
        @click=${(): void => void this.#run(() => this.data.share.setPublic(this.account, this.roadmapId, !isPublic))}
        >${isPublic ? '🔒 ' + this.t('roadmap.map.share.onlyInvited') : '🌍 ' + this.t('roadmap.map.share.makePublic')}</noema-button
      >
      <h4>📨 ${this.t('roadmap.map.share.inviteHead')}</h4>
      <div class="sec">
        <noema-text-field
          class="cm-email"
          type="email"
          label=${this.t('roadmap.map.share.emailAria')}
          placeholder=${this.t('roadmap.map.share.emailPh')}
        ></noema-text-field>
        <noema-text-field class="cm-message" label=${this.t('roadmap.map.share.messagePh')} maxlength="300"></noema-text-field>
        <div class="row">
          <noema-button class="cm-invitebtn" ?disabled=${this.busy} @click=${invite}>📨 ${this.t('roadmap.map.share.invite')}</noema-button>
        </div>
      </div>
      <h4>👥 ${this.t('roadmap.map.share.people')}</h4>
      <div class="cm-members">${this.#people()}</div>
      <details>
        <summary>⏹ ${this.t('roadmap.map.share.stop')}</summary>
        <p class="tiny">${this.t('roadmap.map.share.stopWhat')}</p>
        ${
          this.confirmStop
            ? html`<p>${this.t('roadmap.map.share.stopConfirm')}</p>
                <div class="row">
                  <noema-button
                    size="sm"
                    variant="danger"
                    class="cm-stopyes"
                    ?disabled=${this.busy}
                    @click=${(): void =>
                      void this.#run(async () => {
                        await this.data.share.unpublish(this.account, this.roadmapId);
                        this.confirmStop = false;
                        this.log = '⏹ ' + this.t('roadmap.map.share.stopped');
                      })}
                    >⏹ ${this.t('roadmap.map.share.stop')}</noema-button
                  >
                  <noema-button
                    size="sm"
                    variant="secondary"
                    @click=${(): void => {
                      this.confirmStop = false;
                    }}
                    >${this.t('roadmap.map.notNow')}</noema-button
                  >
                </div>`
            : html`<noema-button
                size="sm"
                variant="danger"
                class="cm-stopshare"
                @click=${(): void => {
                  this.confirmStop = true;
                }}
                >⏹ ${this.t('roadmap.map.share.stop')}</noema-button
              >`
        }
      </details>`;
  }

  override render(): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId);
    const title = c ? (c.title ?? c.goal ?? '') : '';
    let body: TemplateResult;
    if (!c) body = html``;
    else if (!this.data.cloudOn(this.account)) body = html`<p class="status bad">☁️ ${this.t('roadmap.map.share.needCloud')}</p>`;
    else if (!c.shared || c.shared.ended) {
      const mine = Object.values(c.nodes).filter(n => n.pack?.status === 'ready' && !n.pack['shared']).length;
      body = this.#notShared(mine, Object.keys((c['files'] as object | undefined) ?? {}).length);
    } else {
      const R = Object.values(c.remote ?? {}),
        ready = R.filter(x => x.status === 'ready');
      body = this.#shared(!!c.shared['public'], ready.length, Object.keys(c.nodes).length, new Set(ready.map(x => x.by)).size);
    }
    return html`<noema-dialog class="cm-sharedlg" heading=${'👥 ' + this.t('roadmap.map.share.title', { title })}>
      <p class="tiny">${this.t('roadmap.map.share.rules')}</p>
      ${body}
      <p class="tiny cm-sharelog" aria-live="polite">${this.log}</p>
    </noema-dialog>`;
  }
}
