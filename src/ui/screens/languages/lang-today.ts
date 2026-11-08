/**
 * Today's card of the languages (docs/LANGUAGES.md §8): continue the course you were in — today's session when reviews
 * are due, else the next lesson, else start it — with the flags of the languages studied in it and what is due.
 *
 *   <noema-lang-today .port=${languagesPort} course="polyglot-…"></noema-lang-today>
 */
import { html, nothing, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { NoemaScreen } from '../screen.ts';
import type { LanguagesPort } from './languages-port.ts';
import { flag } from './study-chooser.ts';

const pill = (x: string, n: number): TemplateResult =>
  html`<span class="ns-pill" style=${styleMap({ '--bgc': `var(--t${n})`, '--fgc': `var(--t${n}i)` })}>${x}</span>`;

export class NoemaLangToday extends NoemaScreen {
  static override properties = { port: { attribute: false }, course: { type: String } };
  declare port: LanguagesPort | null;
  declare course: string;

  constructor() {
    super();
    this.port = null;
    this.course = '';
  }

  override render(): TemplateResult {
    const P = this.port,
      m = P?.courses().find(x => x.courseId === this.course);
    if (!P || !m) return html``;
    const next = m.next;
    const title = m.due
      ? this.t('sh.langSession')
      : next
        ? `${next.step ? next.step + ' · ' : ''}${next.title}`
        : m.started
          ? this.t('sh.langSession')
          : m.title;
    return html`<button
      class="ns-go ns-langgo"
      data-course=${m.courseId}
      @click=${() => {
        P.openCourse(m.courseId);
      }}
    >
      <span class="rm"><span class="ns-tx" aria-hidden="true">文A</span> ${m.title}</span>
      <h2>${title}</h2>
      <span class="meta"
        >${pill(m.studied.map(flag).join(' '), 1)}${
          m.due
            ? pill(this.t('sh.langDue', { n: m.due }), 4)
            : m.started
              ? pill(this.t('sh.langNothingDue'), 2)
              : pill(this.t('sh.langStart'), 1)
        }${m.due && next ? pill(this.t('sh.langNext', { lesson: next.step ?? next.title }), 2) : nothing}</span
      >
      <span class="arrow" aria-hidden="true">→</span>
    </button>`;
  }
}
