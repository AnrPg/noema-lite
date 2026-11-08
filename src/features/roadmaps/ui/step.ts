/**
 * A step of the map, beside it (on a phone: below it): what it is, where the learner stands, and the one thing to do now —
 * study it, prepare it (here, in the learner's Claude app, or from a package Claude made), look over its plan first, wait
 * for another member or the Claude app, take the placement test, or (locked) the steps to master first. Then its goals,
 * its chapters (tap one: its teaching goals and coverage), what it builds on and what it opens.
 *
 *   <noema-roadmap-step account=… roadmap-id=… step=…></noema-roadmap-step>
 *
 * What another screen does is asked by an event (bubbling, composed): roadmap-study { subject, step } · roadmap-edit-step
 * { step, mode } · roadmap-attach { step } · roadmap-detach { step } · roadmap-replan { step } · roadmap-sources { step } ·
 * roadmap-show-app { step } · roadmap-select { step } · roadmap-remove-shared { step } · roadmap-panel-close. The
 * preparation itself goes through the data port (prep, share, app).
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { Roadmap, Step } from '../domain/model.ts';
import type { StepStatus } from '../domain/status.ts';
import { needsPlan, planLocked } from '../domain/work.ts';
import { shownNode } from '../domain/i18n.ts';
import { RoadmapElement } from './element.ts';
import { autoApprove, isMember, remoteOf } from './marks.ts';
import { NoemaRoadmapStepTest } from './step-test.ts';
import { screen } from './styles.ts';

export const ROLE_ICON: Readonly<Record<string, string>> = {
  foundation: '🧱',
  intro: '🚪',
  aspect: '🎯',
  subtopic: '🔹',
  related: '🔗',
  synthesis: '🏁',
  application: '🚀',
  goal: '🎯',
};

/** A step's summary may start with its path ("A › B — the summary"). */
function splitSummary(text: string | undefined): { path: string; rest: string } {
  const s = text ?? '';
  const m = /^(.*?›.*?)\s+[—-]\s+(.*)$/s.exec(s);
  return m ? { path: m[1] ?? '', rest: m[2] ?? '' } : { path: '', rest: s };
}

export class NoemaRoadmapStep extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    step: { type: String },
    open: { state: true },
    busy: { state: true },
    note: { state: true },
    budget: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: block;
        position: relative;
        padding: 16px;
        overflow-wrap: anywhere;
      }
      h3 {
        margin: 0;
        font-family: var(--u-display);
        font-size: 1.15rem;
      }
      .cm-ptitle {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding-inline-end: 40px;
        margin-bottom: 10px;
      }
      .cm-ic {
        font-size: 1.4rem;
      }
      .cm-pclose {
        position: absolute;
        inset-inline-end: 10px;
        top: 10px;
      }
      .cm-actions {
        display: grid;
        gap: 8px;
        margin: 12px 0;
        justify-items: start;
      }
      .cm-live {
        padding: 10px 12px;
        border-radius: var(--u-br);
        background: var(--u-info);
        color: var(--u-info-ink);
      }
      .bad {
        color: var(--u-bad-ink);
      }
      .lbl {
        margin: 14px 0 4px;
        font-weight: 700;
      }
      ul,
      ol {
        margin: 0;
        padding-inline-start: 1.3em;
        line-height: 1.5;
      }
      .cm-chapters li {
        cursor: pointer;
        min-height: 24px;
      }
      .cm-chapters li:focus-visible {
        outline: 2px solid var(--u-focus, var(--u-acc));
        outline-offset: 2px;
      }
      .cm-chd {
        margin: 4px 0 8px;
      }
      .cm-prereqs li.done a {
        text-decoration: line-through;
      }
      .cm-prereqs a {
        color: var(--u-acc-text);
      }
      .cm-pre {
        margin-top: 8px;
      }
      details {
        border-radius: var(--u-br);
      }
      summary {
        cursor: pointer;
        min-height: 24px;
        color: var(--u-acc-text);
      }
      input.budget {
        width: 6em;
        min-height: 32px;
        font: inherit;
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
  declare open: number;
  declare busy: boolean;
  declare note: string;
  declare budget: number;

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.step = '';
    this.open = -1;
    this.busy = false;
    this.note = '';
    this.budget = 0;
  }

  override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('step')) {
      this.open = -1;
      this.note = '';
      this.budget = 0;
    }
  }

  #ask(type: string, detail: Record<string, unknown> = {}): void {
    this.emit(type, { step: this.step, ...detail });
  }

  #btn(
    label: string,
    run: () => void,
    o: { cls?: string; variant?: 'primary' | 'secondary' | 'quiet'; tip?: string } = {},
  ): TemplateResult {
    return html`<noema-button
      class=${o.cls ?? ''}
      variant=${o.variant ?? 'secondary'}
      size=${o.variant === 'primary' ? 'md' : 'sm'}
      title=${o.tip ?? nothing}
      ?disabled=${this.busy}
      @click=${run}
      >${label}</noema-button
    >`;
  }

  /** 📥 the package Claude made for this step (.noema.zip / .json) */
  #importBtn(): TemplateResult {
    const pick = async (e: Event): Promise<void> => {
      const input = e.target as HTMLInputElement,
        f = input.files?.[0];
      input.value = '';
      if (!f) return;
      this.data.notify('📦 ' + this.t('roadmap.map.man.importing'));
      try {
        const r = await this.data.app.importPackage(this.account, this.roadmapId, this.step, f);
        this.data.notify('🧭 ' + this.t('roadmap.map.man.ready', { title: r.title }));
      } catch (er) {
        this.data.notify('⚠️ ' + this.i18n.err(er));
      }
    };
    return html`<label class="pick cm-importpkg"
      ><noema-button size="sm" variant="secondary" tabindex="-1">📥 ${this.t('roadmap.map.man.importPkg')}</noema-button
      ><input type="file" accept=".zip,.json" aria-label=${this.t('roadmap.map.man.importPkg')} @change=${pick}
    /></label>`;
  }

  #study(subject: string): void {
    this.#ask('roadmap-study', { subject });
  }

  async #getShared(): Promise<void> {
    this.busy = true;
    try {
      const pid = await this.data.share.download(this.account, this.roadmapId, this.step);
      this.#study(pid);
    } catch (e) {
      this.data.notify('⚠️ ' + this.i18n.err(e));
    }
    this.busy = false;
  }

  #prepare(c: Roadmap, n: Step, o: { resume?: boolean; raiseBudget?: number } = { resume: true }): void {
    this.data.prep.request(this.account, c, this.step, o);
    this.data.notify('⏳ ' + this.t('roadmap.map.pnl.preparingToast', { title: n.title }));
    this.requestUpdate();
  }

  #test(): void {
    const d = NoemaRoadmapStepTest.open({ account: this.account, roadmapId: this.roadmapId, step: this.step });
    d.addEventListener('roadmap-step-tested', () => {
      this.requestUpdate();
      this.#ask('roadmap-step-changed');
    });
  }

  /** what to do now, for an open (or mastered) step */
  #openActions(c: Roadmap, n: Step, st: StepStatus): TemplateResult[] {
    const pk = n.pack ?? {},
      rx = remoteOf(c, this.step),
      member = isMember(c),
      key = `${c.id}/${this.step}`,
      who = rx?.by ?? this.t('roadmap.map.st.anotherMember'),
      studyLabel = '📖 ' + this.t(st.mastered ? 'roadmap.map.pnl.review' : 'roadmap.map.pnl.study'),
      out: TemplateResult[] = [];
    const copyMsg = (): void => {
      void this.data.copy(this.data.app.message(c, 1)).then(ok => {
        if (ok) this.data.notify('📋 ' + this.t('roadmap.map.copied'));
      });
    };
    const appRow = (): TemplateResult =>
      html`<div class="row">
        ${this.#btn('📋 ' + this.t('roadmap.map.app.copyMsg'), copyMsg, { variant: 'primary', cls: 'cm-copymsg' })}
        ${this.#btn(this.t('roadmap.map.map.howByHand'), () => {
          this.#ask('roadmap-show-app');
        })}
      </div>`;
    const otherWays = (): TemplateResult =>
      html`<details class="cm-otherways">
        <summary>${this.t('roadmap.map.pnl.otherWays')}</summary>
        <div class="row">
          ${
            c.provider !== 'claudeapp'
              ? this.#btn(
                  '💬 ' + this.t('roadmap.map.pnl.toApp'),
                  () => {
                    this.data.prep.toApp(c, this.step);
                    this.#ask('roadmap-show-app');
                    this.requestUpdate();
                  },
                  { cls: 'cm-toapp' },
                )
              : nothing
          }
          ${this.#importBtn()}
        </div>
        <p class="tiny">${this.t('roadmap.map.pnl.otherWaysText')}</p>
      </details>`;
    if (rx?.status === 'ready' && pk.status === 'ready' && pk['stale'] && !pk['own'])
      out.push(
        this.#btn(
          studyLabel,
          () => {
            this.#study(String(pk.id));
          },
          { variant: 'primary', cls: 'cm-study' },
        ),
        html`<p class="tiny cm-byline">
          🔔 ${this.t('roadmap.map.pnl.newVersion', { who: rx.by ?? this.t('roadmap.map.pnl.itsAuthor') })}
        </p>`,
        html`<div class="row">
          ${this.#btn('⬇️ ' + this.t('roadmap.map.pnl.getNew'), () => void this.#getShared(), { cls: 'cm-getstep' })}
          ${this.#btn(
            this.t('roadmap.map.pnl.keepMine'),
            () => {
              this.data.share.keepStep(this.account, this.roadmapId, this.step);
              this.requestUpdate();
            },
            { variant: 'quiet', cls: 'cm-keepstep' },
          )}
        </div>`,
      );
    else if (rx?.status === 'ready' && (pk.status !== 'ready' || pk['stale']) && !pk['own'])
      out.push(
        html`<p class="tiny cm-byline">
          ⚡
          ${this.t('roadmap.map.pnl.preparedShared', { mine: rx.mine ? 'yes' : 'no', who })}${
            pk['stale'] ? ' · ' + this.t('roadmap.map.pnl.authorNew') : ''
          }
        </p>`,
        this.#btn(pk['stale'] ? '⬇️ ' + this.t('roadmap.map.pnl.getNew') : studyLabel, () => void this.#getShared(), {
          variant: 'primary',
          cls: 'cm-getstep',
        }),
      );
    else if (rx?.status === 'preparing' && !rx.mine && pk.status !== 'ready')
      out.push(
        html`<div class="cm-live cm-othersprep">
          ⏳ ${this.t('roadmap.map.pnl.othersPrep', { who: rx.by ?? this.t('roadmap.map.pnl.anotherMemberCap') })}
          <span class="tiny"> — ${this.t('roadmap.map.pnl.othersPrepMore')}</span>
        </div>`,
      );
    else if (member && !n.chapters?.length && pk.status !== 'ready')
      out.push(
        html`<div class="cm-live">
          📝 ${this.t('roadmap.map.pnl.waitPlan')}
          <span class="tiny">
            — ${this.t('roadmap.map.pnl.ownerPlans', { who: c.shared?.ownerName ?? this.t('roadmap.map.map.theOwner') })}</span
          >
        </div>`,
      );
    else if (pk.status === 'ready')
      out.push(
        this.#btn(
          studyLabel,
          () => {
            this.#study(String(pk.id));
          },
          { variant: 'primary', cls: 'cm-study' },
        ),
        pk['shared'] && rx && !rx.mine ? html`<p class="tiny cm-byline">⚡ ${this.t('roadmap.map.pnl.preparedBy', { who })}</p>` : html``,
        pk['own'] && rx && !rx.mine
          ? html`<p class="tiny cm-byline">
              ${this.t('roadmap.map.pnl.ownVersion', { who, ready: rx.status === 'ready' ? 'yes' : 'no' })}
            </p>`
          : html``,
      );
    else if (pk.status === 'app')
      out.push(
        html`<div class="cm-live cm-appq">
          💬 ${this.t('roadmap.map.pnl.waitingApp')} <span class="tiny"> — ${this.t('roadmap.map.pnl.pasteAppears')}</span>
        </div>`,
        html`<div class="row">
          ${this.#btn('📋 ' + this.t('roadmap.map.app.copyMsg'), copyMsg, { variant: 'primary', cls: 'cm-copymsg' })}
          ${this.#btn(this.t('roadmap.map.map.howByHand'), () => {
            this.#ask('roadmap-show-app');
          })}
          ${this.#importBtn()}
          ${this.#btn(
            '↩ ' + this.t('roadmap.map.notNow'),
            () => {
              this.data.prep.fromApp(c, this.step);
              this.requestUpdate();
            },
            { variant: 'quiet', cls: 'cm-unqueue', tip: this.t('roadmap.map.pnl.unqueueTip') },
          )}
        </div>`,
      );
    else if (c.provider === 'claudeapp' && needsPlan(n))
      out.push(
        html`<div class="cm-live cm-appq">
          💬 ${this.t('roadmap.map.pnl.appPlans')} <span class="tiny"> — ${this.t('roadmap.map.pnl.paste')}</span>
        </div>`,
        appRow(),
      );
    else if (pk.status === 'generating' || this.data.prep.busy() === key)
      out.push(
        html`<div class="cm-live cm-preparing">
          ⏳ ${this.t('roadmap.map.pnl.preparing')} <span class="tiny">${this.data.prep.live(key)}</span>
        </div>`,
        this.#btn('⏸ ' + this.t('roadmap.map.pnl.pause'), () => {
          this.data.prep.stop();
          this.requestUpdate();
        }),
      );
    else if (pk.status === 'paused' && pk['budgetHit']) {
      const limit = this.budget || Math.ceil((Number(c['nodeBudget']) || 8) * 1.5);
      out.push(
        html`<p class="tiny">💰 ${typeof pk['error'] === 'string' && pk['error'] ? pk['error'] : this.t('roadmap.map.pnl.budgetHit')}</p>`,
        html`<label class="tiny"
          >${this.t('roadmap.map.pnl.newLimit')}
          <input
            class="budget"
            type="number"
            min="1"
            .value=${String(limit)}
            @input=${(e: Event): void => {
              this.budget = Number((e.target as HTMLInputElement).value) || 0;
            }}
        /></label>`,
        this.#btn(
          '▶ ' + this.t('roadmap.map.build.continue'),
          () => {
            this.#prepare(c, n, { resume: true, raiseBudget: limit });
          },
          { variant: 'primary', cls: 'cm-continue' },
        ),
      );
    } else if (!n.reviewed && !autoApprove(c) && pk.status !== 'failed')
      out.push(
        html`<div class="row">
          ${this.#btn(
            '📝 ' + this.t('roadmap.map.pnl.reviewPrepare'),
            () => {
              this.#ask('roadmap-edit-step', { mode: 'review' });
            },
            { variant: 'primary', cls: 'cm-reviewprep' },
          )}
          <noema-tip topic=${this.t('roadmap.map.moreInfo')}>${this.t('roadmap.map.pnl.reviewTip')}</noema-tip>
        </div>`,
      );
    else if (c.provider === 'claudeapp')
      out.push(
        html`<div class="row">
          ${this.#btn(
            '💬 ' + this.t('roadmap.map.pnl.prepareApp'),
            () => {
              this.data.prep.toApp(c, this.step);
              this.#ask('roadmap-show-app');
              this.requestUpdate();
            },
            { variant: 'primary', cls: 'cm-toapp' },
          )}
          ${this.#importBtn()}
        </div>`,
      );
    else
      out.push(
        this.#btn(
          pk.status === 'failed' ? '↻ ' + this.t('roadmap.map.pnl.tryAgain') : '⚡ ' + this.t('roadmap.map.pnl.prepareNow'),
          () => {
            this.#prepare(c, n);
          },
          { variant: 'primary', cls: 'cm-preparenow' },
        ),
        pk.status === 'failed'
          ? html`<p class="tiny bad" role="alert">⚠️ ${typeof pk['error'] === 'string' ? pk['error'] : ''}</p>`
          : html``,
        otherWays(),
      );
    if (!st.mastered)
      out.push(
        this.#btn(
          '🎓 ' + this.t('roadmap.map.pnl.knowIt'),
          () => {
            this.#test();
          },
          { cls: 'cm-knowit' },
        ),
      );
    else if (st.how === 'test' || st.how === 'manual')
      out.push(
        this.#btn(
          '↩ ' + this.t('roadmap.map.pnl.undoMastered'),
          () => {
            this.data.prep.unmaster(this.account, c, this.step);
            this.requestUpdate();
            this.#ask('roadmap-step-changed');
          },
          { variant: 'quiet', cls: 'cm-undo' },
        ),
      );
    return out;
  }

  /** a locked step: what to master first; a prepared one can be read before it opens */
  #lockedActions(c: Roadmap, n: Step, st: StepStatus, all: Record<string, StepStatus>): TemplateResult[] {
    const pk = n.pack ?? {},
      rx = remoteOf(c, this.step),
      key = `${c.id}/${this.step}`,
      who = rx?.by ?? this.t('roadmap.map.st.anotherMember');
    const out: TemplateResult[] = [
      html`<div class="cm-lock">
        <p>🔒 ${this.t('roadmap.map.pnl.lockedHead')}</p>
        <ul class="cm-prereqs">
          ${st.parents.map(p => {
            const q = all[p];
            return html`<li class=${q?.mastered ? 'done' : ''}>
              <a
                href="#"
                @click=${(e: Event): void => {
                  e.preventDefault();
                  this.emit('roadmap-select', { step: p });
                }}
                >${this.stepTitle(c, p)}</a
              >
              <span class="tiny"
                >${
                  q?.mastered
                    ? '✓ ' + this.t('roadmap.map.pnl.mastered', { test: 'no' })
                    : q?.open
                      ? this.i18n.format.percent(((q.read || 0) + (q.score || 0)) / 2)
                      : '🔒 ' + this.t('roadmap.map.pnl.preLocked')
                }</span
              >
            </li>`;
          })}
        </ul>
      </div>`,
    ];
    if (rx && !rx.mine)
      out.push(
        html`<p class="tiny cm-byline">
          ${
            rx.status === 'ready'
              ? '⚡ ' + this.t('roadmap.map.pnl.preparedLocked', { who })
              : '⏳ ' + this.t('roadmap.map.pnl.othersPrep', { who: rx.by ?? this.t('roadmap.map.pnl.anotherMemberCap') })
          }
        </p>`,
      );
    const read = (run: () => void): TemplateResult =>
      this.#btn('📖 ' + this.t('roadmap.map.pnl.readTheory'), run, { cls: 'cm-readtheory', tip: this.t('roadmap.map.pnl.readTheoryTip') });
    if (pk.id && pk.status === 'ready')
      out.push(
        read(() => {
          this.#study(String(pk.id));
        }),
      );
    else if (rx?.status === 'ready') out.push(read(() => void this.#getShared()));
    else if (pk.status === 'generating' || this.data.prep.busy() === key)
      out.push(html`<div class="cm-live">⏳ ${this.t('roadmap.map.pnl.preparing')}</div>`);
    else if (pk.status === 'app') out.push(html`<div class="cm-live cm-appq">💬 ${this.t('roadmap.map.pnl.waitingApp')}</div>`);
    else if (!rx && !(isMember(c) && !n.chapters?.length))
      out.push(
        read(() => {
          this.#prepare(c, n);
        }),
      );
    return out;
  }

  /** a subject was attached: the step stays closed until its new plan is here */
  #replanning(c: Roadmap, n: Step): TemplateResult[] {
    const pk = n.pack ?? {},
      withAll = !!c.attachFirst && !n.chapters?.length,
      title = pk.title ?? pk.id ?? '';
    return [
      html`<div class="cm-live cm-replanning">
        ${withAll ? '📦 ' + this.t('roadmap.map.pnl.taughtBy', { title }) : '🔄 ' + this.t('roadmap.map.pnl.replanning')}
        <span class="tiny"> — ${this.t(withAll ? 'roadmap.map.pnl.withAll' : 'roadmap.map.pnl.opensWhen')}</span>
      </div>`,
      withAll
        ? html``
        : c.provider === 'claudeapp'
          ? html`<div class="row">
              ${this.#btn('📋 ' + this.t('roadmap.map.app.copyMsg'), () => void this.data.copy(this.data.app.message(c, 1)), { variant: 'primary', cls: 'cm-copymsg' })}
              ${this.#btn(this.t('roadmap.map.map.howByHand'), () => {
                this.#ask('roadmap-show-app');
              })}
            </div>`
          : this.#btn(
              '↻ ' + this.t('roadmap.map.pnl.replanNow'),
              () => {
                this.#ask('roadmap-replan');
              },
              { variant: 'primary', cls: 'cm-replannow' },
            ),
    ];
  }

  #chapters(n: Step): TemplateResult {
    const chs = n.chapters ?? [];
    const toggle = (i: number): void => {
      this.open = this.open === i ? -1 : i;
    };
    return html`<ol class="cm-chapters">
      ${chs.map(
        (ch, i) =>
          html`<li
            tabindex="0"
            title=${this.t('roadmap.map.pnl.chGoalsTip')}
            aria-expanded=${String(this.open === i)}
            @click=${(): void => {
              toggle(i);
            }}
            @keydown=${(e: KeyboardEvent): void => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle(i);
              }
            }}
          >
            <strong>${ch.title}</strong>
            ${
              this.open === i
                ? html`<div class="cm-chd tiny">
                    <div>🎯 ${(ch.goals ?? []).join(' · ')}</div>
                    <div>📌 ${(ch.coverage ?? []).join(' · ')}</div>
                  </div>`
                : nothing
            }
          </li>`,
      )}
    </ol>`;
  }

  override render(): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId);
    const n = c ? shownNode(c, this.step, this.shownLocale(c)) : undefined;
    if (!c || !n) return html``;
    const all = this.data.statuses(this.account, c),
      st = all[this.step];
    if (!st) return html``;
    const pk = n.pack ?? {},
      member = isMember(c),
      role = this.t('roadmap.map.role.' + (n.role ?? 'subtopic')),
      sm = splitSummary(n.summary),
      files = n.material?.files ?? [];
    const act = st.replanning
      ? this.#replanning(c, n)
      : st.open || st.mastered
        ? this.#openActions(c, n, st)
        : this.#lockedActions(c, n, st, all);
    const prog = st.mastered
      ? '✅ ' + this.t('roadmap.map.pnl.mastered', { test: st.how === 'test' ? 'yes' : 'no' })
      : pk.status === 'ready'
        ? this.t('roadmap.map.pnl.progress', { read: this.i18n.format.percent(st.read), solved: this.i18n.format.percent(st.score) })
        : '';
    const own = c.nodes[this.step]?.pack?.assigned,
      ownParents =
        planLocked(c.nodes[this.step]) || member
          ? []
          : st.parents.filter(p => {
              const q = c.nodes[p];
              return !!q?.pack?.assigned && typeof q['assignedAt'] === 'string' && (!n.plannedAt || q['assignedAt'] > n.plannedAt);
            });
    const kids = c.edges.filter(e => e.from === this.step).map(e => this.stepTitle(c, e.to));
    const remote = remoteOf(c, this.step);
    return html`
      <noema-icon-button
        class="cm-pclose"
        icon="close"
        size="sm"
        label=${this.t('roadmap.map.pnl.closeAria')}
        @click=${(): void => {
          this.emit('roadmap-panel-close');
        }}
      ></noema-icon-button>
      <div class="cm-ptitle">
        <span class="cm-ic" aria-hidden="true">${ROLE_ICON[n.role ?? ''] ?? '•'}</span>
        <div>
          <h3>
            ${n.title}
            ${
              files.length
                ? html`<button
                    class="cm-clip"
                    title=${this.t('roadmap.map.pnl.clip')}
                    aria-label=${this.t('roadmap.map.pnl.clipAria', { files: files.map(f => f.name).join(', ') })}
                    @click=${(): void => {
                      this.#ask('roadmap-sources');
                    }}
                  >
                    📎
                  </button>`
                : nothing
            }
          </h3>
          <div class="tiny cm-psub">${[role, sm.path, n.domains?.length ? n.domains.join(', ') : ''].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      ${prog ? html`<p class="tiny cm-progress">${prog}</p>` : nothing}
      <div class="cm-actions">${act}</div>
      ${own ? html`<p class="tiny cm-byline cm-taughtby">📦 ${this.t('roadmap.map.own.taughtBy', { title: pk.title ?? pk.id ?? '' })}</p>` : nothing}
      ${
        ownParents.length
          ? html`<p class="tiny cm-flag">
              ⚑
              ${this.t('roadmap.map.pnl.parentsOwn', { n: ownParents.length, list: ownParents.map(p => '“' + this.stepTitle(c, p) + '”').join(', ') })}
            </p>`
          : nothing
      }
      <div class="row ${member ? 'cm-ownrow' : 'cm-editrow'}">
        ${
          member
            ? nothing
            : this.#btn(
                '✏️',
                () => {
                  this.#ask('roadmap-edit-step', { mode: 'edit' });
                },
                { cls: 'cm-editbtn', tip: this.t('roadmap.map.pnl.edit') },
              )
        }
        ${
          files.length || (pk.id && pk.status === 'ready')
            ? this.#btn(
                '📚',
                () => {
                  this.#ask('roadmap-sources');
                },
                { cls: 'cm-srcbtn', tip: this.t('roadmap.map.pnl.sources') },
              )
            : nothing
        }
        ${
          pk.status !== 'generating'
            ? this.#btn(
                '📦 ' + this.t(own ? 'roadmap.map.own.another' : 'roadmap.map.own.use'),
                () => {
                  this.#ask('roadmap-attach');
                },
                { cls: 'cm-usesubject', tip: this.t('roadmap.map.pnl.useTip') },
              )
            : nothing
        }
        ${
          own
            ? this.#btn(
                '↩ ' + this.t('roadmap.map.own.detach'),
                () => {
                  this.#ask('roadmap-detach');
                },
                { variant: 'quiet', cls: 'cm-detach' },
              )
            : nothing
        }
        ${
          !member && c.shared?.role === 'owner' && remote && !remote.mine
            ? this.#btn(
                '🗑 ' +
                  this.t('roadmap.map.pnl.othersVersion', {
                    who: remote.by ?? this.t('roadmap.map.pnl.member'),
                    ready: remote.status === 'ready' ? 'yes' : 'no',
                  }),
                () => {
                  this.#ask('roadmap-remove-shared');
                },
                { variant: 'quiet', cls: 'cm-removestep', tip: this.t('roadmap.map.pnl.removeOtherTip') },
              )
            : nothing
        }
      </div>
      ${
        n.learningGoals?.length
          ? html`<div class="lbl">🎯 ${this.t('roadmap.map.pnl.afterThis')}</div>
              <ul class="cm-goals">
                ${n.learningGoals.map(g => html`<li>${g}</li>`)}
              </ul>`
          : nothing
      }
      ${
        n.chapters?.length
          ? html`<div class="lbl">📖 ${this.t('roadmap.map.pnl.nChapters', { n: n.chapters.length })}</div>
              <p class="tiny">${this.t('roadmap.map.pnl.chaptersTip')}</p>
              ${this.#chapters(n)}`
          : nothing
      }
      ${
        st.parents.length
          ? html`<div class="tiny cm-pre">
              <strong>${this.t('roadmap.map.pnl.buildsOn')}</strong>
              <span class="cm-names">${st.parents.map(p => this.stepTitle(c, p)).join(' · ')}</span>
            </div>`
          : nothing
      }
      ${
        kids.length
          ? html`<div class="tiny cm-pre">
              <strong>${this.t('roadmap.map.pnl.opens')}</strong> <span class="cm-names">${kids.join(' · ')}</span>
            </div>`
          : nothing
      }
    `;
  }
}
