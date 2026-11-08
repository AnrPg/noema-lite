/**
 * The page of one study area of a language (D29: #/aspects/<code>/<aspect> of the course): its grammar points — for grammar
 * the word forms folded by the feature they inflect and the sentences by level — and what the word profiles hold for it
 * (use: idioms and registers; culture: sayings and fun facts; etymology), each a section that folds, with its own filter
 * (a word matches in its own script, its scholarly transliteration and plain Latin: the search's folding) and, where the data
 * has them, chips by register, shade or status.
 *
 *   <noema-lang-aspect .port=${coursePort} code="he" aspect="use"></noema-lang-aspect>
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaScreen } from '../screen.ts';
import type { AspectEntry, AspectPage, AspectPart, CoursePort } from './course-port.ts';

/** Entries shown before "more". */
const SHOWN = 40;

export class NoemaLangAspect extends NoemaScreen {
  static override properties = { port: { attribute: false }, code: { type: String }, aspect: { type: String } };
  declare port: CoursePort | null;
  declare code: string;
  declare aspect: string;
  /** per part: the filter, the chips picked, all shown */
  #q = new Map<string, string>();
  #pick = new Map<string, Record<string, string | null>>();
  #full = new Set<string>();
  #model: AspectPage | null = null;

  constructor() {
    super();
    this.port = null;
    this.code = '';
    this.aspect = '';
  }

  override willUpdate(ch: Map<string, unknown>): void {
    if (ch.has('port') || ch.has('code') || ch.has('aspect')) this.#model = this.port?.aspect(this.code, this.aspect) ?? null;
  }

  #fn(P: CoursePort, f: { id: string; title: string }): TemplateResult {
    return html`<button
      class="lx-lhtile"
      type="button"
      @click=${() => {
        P.go('#/fn/' + encodeURIComponent(f.id) + '/' + this.code);
      }}
    >
      ${f.title}
    </button>`;
  }

  #fold(title: string, n: number, body: TemplateResult): TemplateResult {
    return html`<details class="lx-aspfold">
      <summary><b>${title}</b><span class="tiny"> · ${n}</span></summary>
      ${body}
    </details>`;
  }

  #entry(P: CoursePort, e: AspectEntry): TemplateResult {
    const c = this.code;
    const badges = (e.badges ?? []).map(b => html`<span class=${'lx-badge' + (b.cls ? ' ' + b.cls : '')}>${b.text}</span>`);
    let body: TemplateResult;
    if (e.kind === 'use') body = html`<div>${badges} <span class="tiny">${e.gloss ?? ''}</span></div>`;
    else if (e.kind === 'phrase')
      body = html`<div>
        <noema-lang-word .port=${P} code=${c} text=${e.text ?? ''} .sub=${false}></noema-lang-word> ${badges}
        <div class="tiny">“${e.tr ?? ''}” — <b>${e.meaning ?? ''}</b>${e.source ? ' (' + e.source + ')' : ''}</div>
      </div>`;
    else if (e.kind === 'etymology') body = html`<div>${e.text ?? ''}<span class="tiny">${e.src ? ' — ' + e.src : ''}</span></div>`;
    else body = html`<div>💡 ${e.note ?? e.text ?? ''}</div>`;
    return html`<div class="lx-aspentry">
      <a class="lx-aspword" href=${e.href}><noema-lang-word .port=${P} code=${c} text=${e.lemma} lex=${e.lex}></noema-lang-word></a>
      ${body}
    </div>`;
  }

  #part(P: CoursePort, part: AspectPart, alone: boolean): TemplateResult {
    const k = part.key,
      q = P.fold((this.#q.get(k) ?? '').trim()),
      pick = this.#pick.get(k) ?? {};
    const shown = part.entries.filter(
      e => (!q || e.hay.includes(q)) && Object.entries(pick).every(([f, v]) => !v || (e.meta[f] ?? []).includes(v)),
    );
    const full = this.#full.has(k),
      list = full ? shown : shown.slice(0, SHOWN);
    const chip = (facet: string, v: string | null, label: string): TemplateResult => {
      const on = (pick[facet] ?? null) === v;
      return html`<button
        class=${'lx-chip' + (on ? ' on' : '')}
        type="button"
        aria-pressed=${on ? 'true' : 'false'}
        data-v=${v ?? ''}
        @click=${() => {
          this.#pick.set(k, { ...pick, [facet]: v });
          this.requestUpdate();
        }}
      >
        ${label}
      </button>`;
    };
    return html`<details class="lx-aspart lx-aspfold" data-part=${k} ?open=${alone}>
      <summary><b>${this.t('lang.aspect.part.' + k)}</b><span class="tiny"> · ${part.entries.length}</span></summary>
      ${
        !part.entries.length
          ? html`<p class="lx-note">${this.t('lang.aspect.none')}</p>`
          : html`<p class="tiny">${this.t('lang.aspect.count', { n: shown.length })}</p>
              ${part.facets.map(
                f =>
                  html`<div class="lx-facet" data-facet=${f.facet}>
                    <span class="tiny">${this.t('lang.aspect.facet.' + f.facet)}</span>
                    ${chip(f.facet, null, this.t('lang.aspect.facet.all'))} ${f.values.map(x => chip(f.facet, x.v, x.label))}
                  </div>`,
              )}
              <input
                class="noema-input"
                type="search"
                placeholder=${this.t('lang.aspect.filter')}
                aria-label=${this.t('lang.aspect.filter')}
                .value=${this.#q.get(k) ?? ''}
                @input=${(ev: Event) => {
                  this.#q.set(k, (ev.target as HTMLInputElement).value);
                  this.#full.delete(k);
                  this.requestUpdate();
                }}
              />
              <div class="lx-asplist">
                ${list.map(e => this.#entry(P, e))}
                ${
                  !full && shown.length > SHOWN
                    ? html`<button
                        class="btn ghost small"
                        type="button"
                        @click=${() => {
                          this.#full.add(k);
                          this.requestUpdate();
                        }}
                      >
                        ${this.t('lang.frame.more', { n: shown.length - SHOWN, what: '' }).trim()}
                      </button>`
                    : nothing
                }
              </div>`
      }
    </details>`;
  }

  override render(): TemplateResult {
    const P = this.port,
      m = this.#model;
    if (!P || !m) return html``;
    const G = m.grammar;
    return html`${
        P.inFrame()
          ? nothing
          : html`<div class="lx-back">
              <button
                class="btn ghost small"
                type="button"
                @click=${() => {
                  P.go('#/');
                }}
              >
                ${this.dir === 'rtl' ? '→' : '←'} ${this.t('lang.card.map')}
              </button>
            </div>`
      }
      <h1>${this.t('lang.aspect.' + m.aspect)}<span class="tiny"> · ${m.lang.flag} ${m.lang.label}</span></h1>
      <div class=${'lx-asp lx-asp-' + m.aspect + ' lx-aspbox'} data-aspect=${m.aspect}>
        ${
          G
            ? html`${
                  G.forms.length
                    ? html`<h3>${this.t('lang.aspect.morphology')}</h3>
                        ${G.forms.map(g =>
                          this.#fold(
                            this.t('lang.aspect.tag.' + g.tag),
                            g.fns.length,
                            html`<div class="lx-lhlib">${g.fns.map(f => this.#fn(P, f))}</div>`,
                          ),
                        )}`
                    : nothing
                }
                ${
                  G.sentences.length
                    ? html`<h3>${this.t('lang.aspect.syntax')}</h3>
                        ${G.sentences.map(g =>
                          this.#fold(
                            g.level || this.t('lang.aspect.tag.other'),
                            g.fns.length,
                            html`<div class="lx-lhlib">${g.fns.map(f => this.#fn(P, f))}</div>`,
                          ),
                        )}`
                    : nothing
                }
                <div class="row">
                  <button
                    class="btn small"
                    type="button"
                    @click=${() => {
                      P.go('#/grammar/' + this.code);
                    }}
                  >
                    📐 ${this.t('lang.view.grammar')}
                  </button>
                </div>`
            : m.points.length
              ? html`<div class="lx-lhlib">${m.points.map(f => this.#fn(P, f))}</div>`
              : nothing
        }
        ${m.parts ? m.parts.map(p => this.#part(P, p, m.parts?.length === 1)) : nothing}
        ${
          m.views.length
            ? html`<div class="lx-lhlib">
                ${m.views.map(
                  n =>
                    html`<button
                      class="lx-lhtile"
                      type="button"
                      @click=${() => {
                        P.go('#/' + n + '/' + this.code);
                      }}
                    >
                      ${this.t('lang.view.' + n)}
                    </button>`,
                )}
              </div>`
            : nothing
        }
      </div>`;
  }
}
