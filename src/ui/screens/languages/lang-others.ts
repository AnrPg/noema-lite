/**
 * A meaning in the other languages (D29): under a word's card, folded — *In other languages*, the same meaning in every
 * language studied side by side, the bridges among its words and a link to the full table (no Compare toggle).
 *
 *   <noema-lang-others .port=${coursePort} concept="person.teacher"></noema-lang-others>   the fold under the word
 *   <noema-lang-compare .port=${coursePort} concept="person.teacher"></noema-lang-compare> the table itself (#/cmp/c/<id> too)
 *
 * On a narrow screen the table reads as a card per language (the course sheet, 80_poly.css).
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaScreen } from '../screen.ts';
import type { CoursePort } from './course-port.ts';

export class NoemaLangCompare extends NoemaScreen {
  static override properties = { port: { attribute: false }, concept: { type: String } };
  declare port: CoursePort | null;
  declare concept: string;

  constructor() {
    super();
    this.port = null;
    this.concept = '';
  }

  override render(): TemplateResult {
    const P = this.port,
      rows = P?.compare(this.concept) ?? [];
    if (!P) return html``;
    return html`<div class="lx-compare lx-wordtable">
      <table>
        <tbody>
          ${rows.map(
            r =>
              html`<tr data-lang=${r.code}>
                <th>${r.flag} ${r.label}</th>
                <td>
                  ${
                    r.absent != null
                      ? html`<i>— ${r.absent}</i>`
                      : r.words.map(
                          (w, i) =>
                            html`${i ? html`<br />` : nothing}<noema-lang-word
                                .port=${P}
                                code=${r.code}
                                text=${w.lemma}
                                lex=${w.lex}
                              ></noema-lang-word>`,
                        )
                  }
                </td>
                <td class="tiny">${r.params}</td>
                <td>
                  ${
                    r.example
                      ? html`<span
                          ><noema-lang-word .port=${P} code=${r.code} text=${r.example.text} .sub=${false}></noema-lang-word>
                          <div class="tiny">${r.example.tr}</div></span
                        >`
                      : ''
                  }
                </td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>`;
  }
}

export class NoemaLangOthers extends NoemaScreen {
  static override properties = { port: { attribute: false }, concept: { type: String } };
  declare port: CoursePort | null;
  declare concept: string;

  constructor() {
    super();
    this.port = null;
    this.concept = '';
  }

  override render(): TemplateResult {
    const P = this.port,
      m = P?.others(this.concept);
    if (!P || !m) return html``;
    return html`<details
      class="lx-others"
      ?open=${m.open}
      @toggle=${(e: Event) => {
        P.setOthersOpen((e.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary>${this.t('lang.hub.otherLangs')}</summary>
      <noema-lang-compare .port=${P} concept=${this.concept}></noema-lang-compare>
      ${m.bridges ?? nothing}
      <a class="lx-fulltable" href=${m.fullHref}>${this.t('lang.hub.fullTable')} →</a>
    </details>`;
  }
}
