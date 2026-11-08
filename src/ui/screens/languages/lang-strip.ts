/**
 * The strip of the learner's languages (docs/LANGUAGE_RULES.md D29): All · a chip per language studied, the only language
 * picker on every page of the languages. On a page of one language a chip opens the same page for that language (the
 * address carries it); on a page of all languages it picks the language shown. Each chip carries a ring of the words known;
 * the language the course explains in closes the strip (D19).
 *
 *   <noema-lang-strip .port=${coursePort}></noema-lang-strip>      (redraw with requestUpdate() when the page picks another)
 */
import { html, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { NoemaScreen } from '../screen.ts';
import type { CoursePort } from './course-port.ts';

export class NoemaLangStrip extends NoemaScreen {
  static override properties = { port: { attribute: false } };
  declare port: CoursePort | null;

  constructor() {
    super();
    this.port = null;
  }

  override render(): TemplateResult {
    const P = this.port;
    if (!P) return html``;
    const s = P.strip();
    return html`<button
        class=${'chip lx-flagchip lx-allchip' + (s.current === null ? ' on' : '')}
        aria-current=${s.current === null ? 'true' : 'false'}
        title=${this.t('lang.hub.allTip')}
        @click=${() => {
          P.pick(null);
        }}
      >
        ${this.t('lang.hub.all')}
      </button>
      ${s.langs.map(
        l =>
          html`<button
            class=${'chip lx-flagchip' + (l.code === s.current ? ' on' : '')}
            data-lang=${l.code}
            aria-current=${l.code === s.current ? 'true' : 'false'}
            title=${this.t('lang.shell.chipKnown', { lang: l.name, kn: l.known, total: l.total })}
            @click=${() => {
              P.pick(l.code);
            }}
          >
            <span class="lx-flag" aria-hidden="true">${l.flag}</span>${l.code.toUpperCase()}<span
              class="lx-ring"
              aria-hidden="true"
              style=${styleMap({ '--p': String(l.total ? Math.round((l.known / l.total) * 100) : 0) })}
            ></span>
          </button>`,
      )}
      <span class="spacer"></span>
      <span class="chip lx-explain" title=${this.t('lang.shell.explainTitle')}>${s.explainName}</span>`;
  }
}
