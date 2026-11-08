/**
 * Today (#/): where you left off, what is due, the day's goal. One big "continue" (× hides it for today), the language
 * courses' own continue, the first steps when there is nothing to continue, "continue elsewhere", review and the
 * Mistakes gym over every subject, and the streak, gently. The data is the root's (TodayData): this draws it.
 */
import { html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { ShellElement } from './base.ts';

export interface TodayContinue {
  /** what × hides for today */
  readonly hideId: string;
  /** above the title: the subject's emoji or an icon, and the subject or Roadmap */
  readonly emoji?: string | null;
  readonly icon: 'map' | 'book';
  readonly where: string;
  readonly title: string;
  readonly chapter?: { readonly n: number; readonly of: number } | null;
  readonly section?: { readonly n: number; readonly of: number } | null;
  /** no section yet: "Start" */
  readonly start: boolean;
  readonly step?: string | null;
  open(): void;
}
export interface TodayElsewhere {
  readonly title: string;
  readonly emoji?: string | null;
  readonly tone: number;
  readonly sub: string;
  open(): void;
}
export interface TodayModel {
  readonly name: string;
  readonly date: string;
  readonly hour: number;
  readonly xp: number;
  readonly goal: number;
  readonly cont: TodayContinue | null;
  /** a Roadmap's next step when there is nothing to continue */
  readonly firstMap: (Omit<TodayContinue, 'chapter' | 'section' | 'start' | 'step'> & { readonly next: boolean }) | null;
  /** the welcome panel (no Roadmap, nothing studied yet) */
  readonly welcome: boolean;
  readonly elsewhere: readonly TodayElsewhere[];
  readonly due: { readonly fc: number; readonly pb: number; readonly wrong: number };
  readonly streak: number;
}
export interface TodayData {
  model(): Promise<TodayModel>;
  hide(id: string): void;
  /** the language courses' today (they draw their own); lead: nothing else to continue, so the course leads → it drew */
  readonly lang: ((box: HTMLElement, lead: boolean) => boolean) | null;
  /** only languages: no first steps of knowledge */
  readonly langOnly: boolean;
  review(kind: 'review' | 'gym'): void;
  newRoadmap(): void;
  /** a quiet explanation (the frame's tip) */
  tip(text: string): void;
}

export class NoemaToday extends ShellElement {
  static override properties = { ...ShellElement.properties, data: { attribute: false }, m: { state: true } };
  declare data: TodayData | undefined;
  declare m: TodayModel | null;
  constructor() {
    super();
    this.m = null;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    void this.reload();
  }
  async reload(): Promise<void> {
    this.m = (await this.data?.model()) ?? null;
  }
  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    const m = this.m,
      d = this.data;
    if (!m || !d) return;
    // the language courses draw their own part (engine/langui.js: the languages branch registers its world)
    const lead = this.querySelector<HTMLElement>('.ns-langlead'),
      after = this.querySelector<HTMLElement>('.ns-langafter');
    if (lead && after && d.lang) {
      lead.replaceChildren();
      after.replaceChildren();
      const led = !m.cont && d.lang(lead, true);
      this.querySelector('.ns-first')?.toggleAttribute('hidden', led || d.langOnly);
      if (!led) d.lang(after, false);
    }
  }
  #hide(id: string): void {
    this.data?.hide(id);
    void this.reload();
  }
  #go(c: TodayContinue | NonNullable<TodayModel['firstMap']>, meta: TemplateResult): TemplateResult {
    return html`<div class="ns-gowrap">
      <button
        class="ns-go"
        @click=${() => {
          c.open();
        }}
      >
        <span class="rm">${c.emoji ? c.emoji + ' ' : this.icon(c.icon)} ${c.where}</span>
        <h2>${c.title}</h2>
        <span class="meta">${meta}</span>
        ${'step' in c && c.step ? html`<span class="step wide">${this.L('stepIs', { step: c.step })}</span>` : nothing}
        <span class="arrow" aria-hidden="true">→</span>
      </button>
      <button
        class="ns-goclose"
        title=${this.L('hideToday')}
        aria-label=${this.L('hideToday')}
        @click=${() => {
          this.#hide(c.hideId);
        }}
      >
        ${this.icon('close')}
      </button>
    </div>`;
  }
  override render(): TemplateResult {
    const m = this.m,
      d = this.data;
    if (!m || !d) return html`<div class="ns-wait">${this.face(undefined, 'breathe')}</div>`;
    const hello = m.hour < 5 ? 'helloNight' : m.hour < 12 ? 'helloMorning' : m.hour < 18 ? 'helloDay' : 'helloEvening';
    const c = m.cont;
    const due = m.due.fc + m.due.pb;
    return html`<div class="ns-hello">
        ${this.face(undefined, 'breathe')}
        <div class="grow">
          <p class="tiny">${m.date}</p>
          <h1>${this.L(hello)}, ${m.name}</h1>
        </div>
        <div class="ns-goal" title=${this.L('goalTitle', { xp: m.xp, goal: m.goal })}>
          ${this.ring(m.xp / m.goal, 64, 7)}
          <div class="c"><b>${m.xp}</b><span class="tiny">/${m.goal}</span></div>
        </div>
      </div>
      <div class="ns-stack">
        ${
          c
            ? this.#go(
                c,
                html`${c.chapter ? this.pill(this.L('chOf', { n: c.chapter.n, of: c.chapter.of }), 2) : nothing}${
                  c.section
                    ? this.pill(this.L('secOf', { n: c.section.n, of: c.section.of }), 4)
                    : c.start
                      ? this.pill(this.L('start'), 1)
                      : nothing
                }`,
              )
            : nothing
        }
        <div class="ns-langlead" style="display:contents"></div>
        ${c ? nothing : html`<div class="ns-first" style="display:contents">${this.#first(m, d)}</div>`}
        <div class="ns-langafter" style="display:contents"></div>
        ${
          m.elsewhere.length
            ? html`<div>
                <span class="ns-label">${this.L('continueElsewhere')}</span>
                <div class="ns-list">
                  ${m.elsewhere.map(
                    r =>
                      html`<button
                        class="ns-item"
                        @click=${() => {
                          r.open();
                        }}
                      >
                        ${this.icoTxt(r.emoji || (r.title || '?').slice(0, 1), r.tone, r.emoji ? 'emo' : 'txt')}
                        <span class="t"><b>${r.title}</b><small>${r.sub}</small></span
                        >${this.chev()}
                      </button>`,
                  )}
                </div>
              </div>`
            : nothing
        }
        <div>
          <span class="ns-label">${this.L('forToday')}</span>
          <div class="ns-duo">
            ${this.#vcard(
              'review',
              this.ico('cards', 4),
              due ? this.pill(due, 4) : nothing,
              this.L('review'),
              this.L('reviewTip'),
              due ? this.L('reviewSub', { fc: m.due.fc, pb: m.due.pb }) : this.L('reviewNone'),
            )}
            ${this.#vcard(
              'gym',
              this.ico('gym', 3),
              m.due.wrong ? this.pill(m.due.wrong, 3) : nothing,
              this.L('gym'),
              this.L('gymTip'),
              m.due.wrong ? this.L('gymSub', { n: m.due.wrong }) : this.L('gymNone'),
            )}
          </div>
        </div>
        <button class="ns-cheer" @click=${() => this.ctx?.go('#/progress')}>
          <span class="lines"
            ><b>${m.streak ? this.L('streakDays', { n: m.streak }) : this.L('streakStart')}</b
            ><span>${m.streak && m.streak % 7 === 6 ? this.L('streakTomorrowWeek') : this.L('streakKeep')}</span></span
          ><span class="more">${this.L('progress') + ' ›'}</span>
        </button>
      </div>`;
  }
  #first(m: TodayModel, d: TodayData): TemplateResult | typeof nothing {
    if (m.firstMap) return this.#go(m.firstMap, this.pill(this.L('nextStep'), 2));
    if (!m.welcome) return nothing;
    return html`<div class="ns-panel ns-empty">
      ${this.face(undefined, 'breathe')}
      <h2>${this.L('welcomeTitle')}</h2>
      <p class="ns-muted">${this.L('welcomeText')}</p>
      <div class="row">
        <button
          class="btn primary"
          @click=${() => {
            d.newRoadmap();
          }}
        >
          ${this.L('newRoadmap')}
        </button>
        <button class="btn" @click=${() => this.ctx?.go('#/discover')}>${this.L('discover')}</button>
        <button class="btn ghost" @click=${() => this.ctx?.go('#/shelf')}>${this.L('shelf')}</button>
      </div>
    </div>`;
  }
  /** a card that opens something, with an (i) beside its title: the card is clicked anywhere, its title is the button
      (keyboard and screen readers), and the (i) is a button of its own next to it, never inside it */
  #vcard(
    kind: 'review' | 'gym',
    icon: TemplateResult,
    badge: TemplateResult | typeof nothing,
    title: string,
    tip: string,
    sub: string,
  ): TemplateResult {
    const d = this.data,
      id = 'ns-vcard-' + kind;
    return html`<div class="ns-vcard" @click=${() => d?.review(kind)}>
      <span class="top">${icon}${badge}</span>
      <b
        ><button
          class="ns-vgo"
          type="button"
          aria-describedby=${id}
          @click=${(e: Event) => {
            e.stopPropagation();
            d?.review(kind);
          }}
        >
          ${title}
        </button>
        <button
          class="ns-hint"
          aria-label=${this.L('whatIsThis')}
          title=${this.L('whatIsThis')}
          @click=${(e: Event) => {
            e.stopPropagation();
            d?.tip(tip);
          }}
        >
          i
        </button></b
      >
      <small id=${id}>${sub}</small>
    </div>`;
  }
}
