/**
 * The peculiarities of a language as a free library (D18; #/peculiar/<code> of the course): no order, every one readable,
 * what is new for this learner marked ✨ and what is familiar from their languages ✓ (with those languages named); a
 * filter (all · new · familiar); each one folds, with its examples, its contrast notes (R1) and where the course teaches it.
 * In the app's frame the counts become a hint beside the title and only the first group is open.
 *
 *   <noema-lang-peculiar .port=${coursePort} code="de"></noema-lang-peculiar>
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaScreen } from '../screen.ts';
import { rail } from './lang-drills.ts';
import type { CoursePort, PeculiarPage } from './course-port.ts';

const FILTERS = ['all', 'new', 'familiar'] as const;

export class NoemaLangPeculiar extends NoemaScreen {
  static override properties = { port: { attribute: false }, code: { type: String } };
  declare port: CoursePort | null;
  declare code: string;

  constructor() {
    super();
    this.port = null;
    this.code = '';
  }

  override render(): TemplateResult {
    const P = this.port,
      m = P?.peculiar(this.code);
    if (!P || !m) return html``;
    const frame = P.inFrame();
    const counts = this.t('lang.pec.counts', { nNew: m.nNew, nFam: m.nFam, from: m.from || '—' });
    const head = html`${
        frame
          ? nothing
          : html`<div class="lx-back">
              <button
                class="btn ghost small"
                type="button"
                @click=${() => {
                  P.back();
                }}
              >
                ${this.uiDir === 'rtl' ? '→' : '←'} ${this.t('lang.card.back')}
              </button>
            </div>`
      }
      <h1>
        ${frame ? '' : '📚 '}${this.t('lang.pec.title', { lang: m.lang.name })}${frame && m.catalogue ? html` ${P.hint(counts)}` : nothing}
      </h1>
      ${rail(m.rail, x => {
        P.go('#/peculiar/' + x);
      })}`;
    if (!m.catalogue)
      return html`${head}
        <p class="lx-note">${this.t('lang.pec.noCatalogue')}</p>`;
    return html`${head}
      <p class=${'tiny' + (frame ? ' lx-fseg' : '')}>
        ${frame ? nothing : counts + ' '}
        ${FILTERS.map(
          f =>
            html`<button
              class=${'btn small' + (m.filter === f ? ' primary' : '')}
              type="button"
              data-filter=${f}
              aria-pressed=${m.filter === f ? 'true' : 'false'}
              @click=${() => {
                P.setPeculiarFilter(f);
                this.requestUpdate();
              }}
            >
              ${this.t('lang.pec.filter.' + f)}
            </button>`,
        )}
      </p>
      ${m.areas.map(
        (a, i) =>
          html`<details class="lx-sec" ?open=${!frame || i === 0} data-area=${a.area}>
            <summary>${a.label}${frame ? nothing : html`<span class="tiny"> ${a.n}</span>`}</summary>
            ${a.items.map(
              p =>
                html`<details class="lx-pec" data-id=${p.id}>
                  <summary>
                    ${p.isNew ? '✨ ' : p.familiarFrom ? '✓ ' : ''}${p.lacks ? '∅ ' : ''}<b>${p.title}</b>${
                      p.familiarFrom
                        ? html`<span class="tiny"> — ${this.t('lang.pec.familiarFrom', { from: p.familiarFrom })}</span>`
                        : nothing
                    }
                  </summary>
                  <p>${p.what}</p>
                  ${p.examples.map(
                    e =>
                      html`<div class="lx-ex">
                        <div class="lx-extext">${e.text}</div>
                        ${e.translit ? html`<div class="tiny">${e.translit}</div>` : nothing}
                        ${e.note ? html`<div class="lx-tr">${e.note}</div>` : nothing}
                      </div>`,
                  )}
                  ${p.notes} ${p.when ? html`<p class="tiny">🛤️ ${this.t('lang.pec.inCourse')} ${p.when}</p>` : nothing}
                </details>`,
            )}
          </details>`,
      )}`;
  }
}
