/**
 * 💬 What waits for the learner's Claude app on a Roadmap (engine/curjobs.js, docs/CURRICULUM.md §7): the Roadmap itself
 * (agent 1–3), chapter plans, steps to prepare — and the way to get it done: open a Claude chat, paste the message (one
 * step or a few per chat), come back (answers arrive by themselves: the inbox is read on return and every 20 s; ⟳ now).
 * Without the connector, by hand: copy the task, paste Claude's answer (its problems are said, to copy back to Claude),
 * a step's bundle to download, the package Claude made to import.
 *
 *   <noema-roadmap-inbox account=… roadmap-id=… step=…></noema-roadmap-inbox>   (step: the one to bundle first)
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaSelect, NoemaTextField } from '../../../ui/index.ts';
import { work } from '../domain/work.ts';
import type { AppTask } from './data.ts';
import { RoadmapElement } from './element.ts';
import { screen } from './styles.ts';

export class NoemaRoadmapInbox extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    step: { type: String },
    count: { state: true },
    result: { state: true },
    busy: { state: true },
    manual: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: block;
      }
      ol.cm-appsteps {
        margin: 12px 0;
        padding-inline-start: 1.4em;
        display: grid;
        gap: 14px;
      }
      ol.cm-appsteps li strong {
        display: block;
        margin-bottom: 6px;
      }
      details {
        margin-top: 12px;
      }
      summary {
        cursor: pointer;
        min-height: 24px;
        color: var(--u-acc-text);
      }
      .cm-manualbody {
        display: grid;
        gap: 8px;
        margin-top: 8px;
      }
      a.btn {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--u-line);
        color: var(--u-acc-text);
        text-decoration: none;
      }
      .pick {
        position: relative;
        overflow: hidden;
      }
      .pick input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
    `,
  ];
  declare account: string;
  declare roadmapId: string;
  declare step: string;
  declare count: number;
  declare result: { ok: boolean; text: string; problems?: string } | null;
  declare busy: boolean;
  declare manual: boolean;
  #off: (() => void) | null = null;

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.step = '';
    this.count = 1;
    this.result = null;
    this.busy = false;
    this.manual = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.data.app.start(this.account);
    this.#off = this.data.onChange(() => {
      this.requestUpdate();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
  }

  async #copy(text: string): Promise<void> {
    if (await this.data.copy(text)) this.data.notify('📋 ' + this.t('roadmap.map.copied'));
  }

  async #poll(): Promise<void> {
    this.busy = true;
    const n = await this.data.app.poll(this.account).catch(() => 0);
    this.data.notify('💬 ' + (n ? this.t('roadmap.map.app.results', { n }) : this.t('roadmap.map.app.nothingNew')));
    this.busy = false;
  }

  #paste(t: AppTask): void {
    const f = this.renderRoot.querySelector<NoemaTextField>('.cm-paste'),
      r = this.data.app.paste(this.account, this.roadmapId, t.id, f?.value ?? '');
    if (r.errors) {
      const list = r.errors.slice(0, 3).join(' · ') + (r.errors.length > 3 ? ' …' : '');
      // the problems go back to Claude in its words (English)
      const problems = `Your answer has these problems:\n- ${r.errors.slice(0, 30).join('\n- ')}\nFix ALL of them and send the complete corrected JSON object again.`; // i18n-ignore (for Claude)
      this.result = { ok: false, text: this.t('roadmap.map.man.problems', { n: r.errors.length, list }), problems };
      return;
    }
    this.result = { ok: true, text: this.t('roadmap.map.man.accepted') + (r.line ?? '').replace(/^\s*✓?/, ' —') };
    if (f) f.value = '';
  }

  async #bundle(stepId: string): Promise<void> {
    this.busy = true;
    try {
      const r = await this.data.app.bundle(this.account, this.roadmapId, stepId);
      this.data.notify(
        `⬇️ ${r.name}` + (r.missing.length ? ' — ⚠️ ' + this.t('roadmap.map.man.notHere', { files: r.missing.join(', ') }) : ''),
      );
    } catch (e) {
      this.data.notify('⚠️ ' + this.i18n.err(e));
    }
    this.busy = false;
  }

  async #import(stepId: string, e: Event): Promise<void> {
    const input = e.target as HTMLInputElement,
      f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.data.notify('📦 ' + this.t('roadmap.map.man.importing'));
    try {
      const r = await this.data.app.importPackage(this.account, this.roadmapId, stepId, f);
      this.data.notify('🧭 ' + this.t('roadmap.map.man.ready', { title: r.title }));
    } catch (er) {
      this.data.notify('⚠️ ' + this.i18n.err(er));
    }
  }

  #byHand(steps: readonly string[]): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c) return html``;
    const t = this.data.app.copyTask(this.account, this.roadmapId);
    const sid = this.step && steps.includes(this.step) ? this.step : steps[0];
    return html`<details
      class="cm-manual"
      ?open=${this.manual}
      @toggle=${(e: Event): void => {
        this.manual = (e.target as HTMLDetailsElement).open;
      }}
    >
      <summary>${this.t('roadmap.map.man.title')}</summary>
      <div class="cm-manualbody">
        ${
          t
            ? html`<p class="tiny">${this.t('roadmap.map.man.next', { task: t.title, files: t.files?.length ? 'yes' : 'no' })}</p>
                ${
                  t.files?.length
                    ? html`<div class="row">
                        <span class="tiny">📎 ${t.files.join(', ')}</span>
                        <noema-button
                          size="sm"
                          variant="secondary"
                          class="cm-planfiles"
                          ?disabled=${this.busy}
                          @click=${(): void => void this.data.app.downloadFiles(this.account, this.roadmapId, t)}
                          >⬇️ ${this.t('roadmap.map.man.download')}</noema-button
                        >
                      </div>`
                    : nothing
                }
                <div class="row">
                  <noema-button size="sm" variant="secondary" class="cm-copytask" @click=${(): void => void this.#copy(t.text)}
                    >📋 ${this.t('roadmap.map.man.copyTask')}</noema-button
                  >
                </div>
                <noema-text-field class="cm-paste" multiline label=${this.t('roadmap.map.man.pastePh')}></noema-text-field>
                <div class="row">
                  <noema-button
                    size="sm"
                    class="cm-usepaste"
                    @click=${(): void => {
                      this.#paste(t);
                    }}
                    >✔ ${this.t('roadmap.map.man.useAnswer')}</noema-button
                  >
                </div>
                ${
                  this.result
                    ? html`<div class="status ${this.result.ok ? 'ok' : 'bad'} cm-pasteout" role="status">
                        ${this.result.ok ? '✓ ' : '⚠️ '}${this.result.text}
                        ${
                          this.result.problems
                            ? html`<noema-button
                                size="sm"
                                variant="secondary"
                                class="cm-copyproblems"
                                @click=${(): void => void this.#copy(this.result?.problems ?? '')}
                                >📋 ${this.t('roadmap.map.man.copyProblems')}</noema-button
                              >`
                            : nothing
                        }
                      </div>`
                    : nothing
                }`
            : nothing
        }
        ${
          sid
            ? html`<p class="tiny">${this.t('roadmap.map.man.steps', { title: this.stepTitle(c, sid) })}</p>
                <div class="row">
                  <noema-button
                    size="sm"
                    variant="secondary"
                    class="cm-bundle"
                    ?disabled=${this.busy}
                    @click=${(): void => void this.#bundle(sid)}
                    >⬇️ ${this.t('roadmap.map.man.bundle', { title: this.stepTitle(c, sid) })}</noema-button
                  >
                  <label class="pick cm-importpkg"
                    ><noema-button size="sm" variant="secondary" tabindex="-1">📥 ${this.t('roadmap.map.man.importPkg')}</noema-button
                    ><input
                      type="file"
                      accept=".zip,.json"
                      aria-label=${this.t('roadmap.map.man.importPkg')}
                      @change=${(e: Event): void => void this.#import(sid, e)}
                  /></label>
                </div>`
            : nothing
        }
      </div>
    </details>`;
  }

  override render(): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c) return html``;
    const w = work(c);
    if (w.done) return html`<p class="status ok cm-appwait">✅ ${this.t('roadmap.map.app.nothing')}</p>`;
    const todo = [
      w.graph ? this.t('roadmap.map.app.todoGraph', { i: { dag: 1, audit: 2, expand: 3 }[w.graph] }) : '',
      w.toPlan.length ? this.t('roadmap.map.app.todoPlan', { n: w.toPlan.length }) : '',
      w.steps.length ? this.t('roadmap.map.app.todoSteps', { n: w.steps.length }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const last = this.data.app.lastCheck(),
      ago = last === null ? null : Math.max(0, Math.round((this.services.clock.now() - last) / 1000)),
      err = this.data.app.error();
    const [before = '', after = ''] = this.t('roadmap.map.app.waiting', { todo: '\u0001' }).split('\u0001');
    return html`<p class="cm-appwait">💬 ${before}<strong>${todo}</strong>${after}</p>
      <ol class="cm-appsteps">
        <li>
          <strong>${this.t('roadmap.map.app.s1')}</strong>
          <span class="tiny">${this.t('roadmap.map.app.s1tip')}</span>
          <div class="row">
            <a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">${this.t('roadmap.map.app.openClaude')}</a>
            <noema-button
              size="sm"
              variant="quiet"
              class="cm-setup"
              @click=${(): void => {
                this.emit('roadmap-setup-claude');
              }}
              >${this.t('roadmap.map.app.firstTime')}</noema-button
            >
          </div>
        </li>
        <li>
          <strong>${this.t('roadmap.map.app.s2')}</strong>
          <span class="tiny">${this.t('roadmap.map.app.s2tip')}</span>
          ${
            w.steps.length > 1
              ? html`<noema-select
                  class="cm-count"
                  label=${this.t('roadmap.map.app.stepsInChat')}
                  .value=${String(this.count)}
                  .options=${[1, 2, 3, 5].map(n => ({ value: String(n), label: this.t('roadmap.map.app.countOpt', { n }) }))}
                  @noema-change=${(e: Event): void => {
                    this.count = Number((e.currentTarget as NoemaSelect).value) || 1;
                  }}
                ></noema-select>`
              : nothing
          }
          <div class="row">
            <noema-button class="cm-copymsg" @click=${(): void => void this.#copy(this.data.app.message(c, this.count))}
              >📋 ${this.t('roadmap.map.app.copyMsg')}</noema-button
            >
          </div>
        </li>
        <li>
          <strong>${this.t('roadmap.map.app.s3')}</strong>
          <p class="tiny">
            ${this.t('roadmap.map.app.s3text')} ${err ? html`<span class="bad">⚠️ ${err}</span>` : nothing}
            ${ago === null ? '' : ago < 5 ? this.t('roadmap.map.app.lastCheckNow') : this.t('roadmap.map.app.lastCheckAgo', { n: ago })}
          </p>
          <noema-button size="sm" variant="secondary" class="cm-checknow" ?disabled=${this.busy} @click=${(): void => void this.#poll()}
            >⟳ ${this.t('roadmap.map.app.checkNow')}</noema-button
          >
        </li>
      </ol>
      ${this.#byHand(w.steps)}`;
  }
}
