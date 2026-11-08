/**
 * The course's drills of their own (docs/LANGUAGES.md §6.2, P3b): both record their answers as recognition reviews of the
 * words (first try right = good, otherwise again).
 *
 *   🧩 <noema-lang-sort .port=${coursePort} field="food.vegetables"></noema-lang-sort>
 *      the words of a field the learner has met, sorted into the field's groups (tap a word, then its group)
 *   🔁 <noema-lang-parts .port=${coursePort} code="de"></noema-lang-parts>
 *      what is memorized with a word (plural, article, gender, root, measure word …), one part at a time
 *
 * And the picker of a page's language outside the frame (inside it the strip of languages is the only picker, D29).
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaScreen } from '../screen.ts';
import type { CoursePort, PartsDrill, PartsItem, RailModel, SortDrill, SortWord } from './course-port.ts';

/** The rail of the page's languages (null: one language, or the frame's strip picks). */
export function rail(r: RailModel | null, pick: (code: string) => void): TemplateResult | typeof nothing {
  if (!r) return nothing;
  return html`<div class="row">
    <div class="lx-rail" role="tablist" aria-label=${r.label}>
      ${r.langs.map(
        l =>
          html`<button
            class=${'lx-railbtn' + (l.on ? ' on' : '')}
            type="button"
            data-lang=${l.code}
            role="tab"
            aria-selected=${l.on ? 'true' : 'false'}
            title=${l.title}
            @click=${() => {
              pick(l.code);
            }}
          >
            <span class="lx-flag">${l.flag}</span><span class=${'lx-dot s-' + (l.state || 'none')}></span>
          </button>`,
      )}
    </div>
  </div>`;
}

const back = (s: NoemaScreen & { port: CoursePort | null }, label: string, to: string): TemplateResult | typeof nothing =>
  s.port?.inFrame()
    ? nothing
    : html`<div class="lx-back">
        <button
          class="btn ghost small"
          type="button"
          @click=${() => {
            s.port?.go(to);
          }}
        >
          ${document.dir === 'rtl' ? '→' : '←'} ${label}
        </button>
      </div>`;

/** 🧩 sort the words of a field into its groups. */
export class NoemaLangSort extends NoemaScreen {
  static override properties = { port: { attribute: false }, field: { type: String } };
  declare port: CoursePort | null;
  declare field: string;
  #m: SortDrill | null = null;
  #picked: string | null = null;
  #placed = new Map<string, string>(); // word → group
  #tries = new Map<string, number>();
  #status = '';
  #shake: string | null = null;
  #done: { right: number; n: number } | null = null;

  constructor() {
    super();
    this.port = null;
    this.field = '';
  }

  override willUpdate(ch: Map<string, unknown>): void {
    if (ch.has('port') || ch.has('field')) this.#fresh();
  }

  #fresh(): void {
    this.#m = this.port?.sortDrill(this.field) ?? null;
    this.#picked = null;
    this.#placed.clear();
    this.#tries.clear();
    this.#done = null;
    this.#status = this.#m ? this.t('lang.sort.left', { n: this.#m.pool.length }) : '';
  }

  #drop(m: SortDrill, group: { id: string; title: string }): void {
    const w = m.pool.find(p => p.id === this.#picked);
    if (!w) return;
    if (w.group === group.id) {
      this.#placed.set(w.id, group.id);
      this.#picked = null;
      const left = m.pool.length - this.#placed.size;
      this.#status = left ? this.t('lang.sort.left', { n: left }) : '';
      if (!left) {
        const res = m.pool.map(p => ({ id: p.id, ok: !this.#tries.get(p.id) }));
        this.port?.sortRecord(m.lang.code, res);
        this.#done = { right: res.filter(x => x.ok).length, n: res.length };
      }
    } else {
      this.#tries.set(w.id, (this.#tries.get(w.id) ?? 0) + 1);
      this.#shake = group.id;
      setTimeout(() => {
        this.#shake = null;
        this.requestUpdate();
      }, 400);
      this.#status = this.t('lang.sort.wrong', { group: group.title.toLowerCase() });
    }
    this.requestUpdate();
  }

  #word(P: CoursePort, c: string, w: SortWord): TemplateResult {
    return html`<noema-lang-word .port=${P} code=${c} text=${w.lemma} .sub=${false}></noema-lang-word>`;
  }

  override render(): TemplateResult {
    const P = this.port,
      m = this.#m;
    if (!P || !m) return html``;
    const c = m.lang.code,
      fieldMap = '#/field/' + encodeURIComponent(m.field.id) + '/0';
    const head = html`${back(this, this.t('lang.card.fieldMap'), fieldMap)}
      <h1>🧩 ${this.t('lang.field.sortGroups')}<span class="tiny"> · ${m.field.title} · ${m.lang.flag} ${m.lang.label}</span></h1>
      ${rail(m.rail, x => {
        P.setLang(x);
      })}`;
    if (m.pool.length < 4)
      return html`${head}
        <p class="lx-note">${this.t('lang.sort.tooFew', { lang: m.lang.name, n: m.pool.length })}</p>`;
    const D = this.#done;
    return html`${head}
      <p class="tiny">${this.t('lang.sort.how')}</p>
      <div class="lx-sortchips">
        ${m.pool
          .filter(w => !this.#placed.has(w.id))
          .map(
            w =>
              html`<button
                class=${'btn lx-sortchip' + (this.#picked === w.id ? ' on' : '')}
                type="button"
                data-id=${w.id}
                data-cid=${w.cid}
                aria-pressed=${this.#picked === w.id ? 'true' : 'false'}
                @click=${() => {
                  this.#picked = w.id;
                  this.requestUpdate();
                }}
              >
                ${this.#word(P, c, w)}
              </button>`,
          )}
      </div>
      <div class="tiny lx-sortstatus" role="status">${this.#status}</div>
      <div class="lx-sortbins">
        ${m.groups.map(
          g =>
            html`<div
              class=${'lx-sortbin' + (this.#shake === g.id ? ' lx-shake' : '')}
              data-group=${g.id}
              role="button"
              tabindex="0"
              @click=${() => {
                this.#drop(m, g);
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  this.#drop(m, g);
                }
              }}
            >
              <div class="lx-sorthead">${g.emoji ? g.emoji + ' ' : ''}${g.title}</div>
              <div class="lx-sortlist">
                ${m.pool
                  .filter(w => this.#placed.get(w.id) === g.id)
                  .map(w => html`<span class="lx-sortin">${this.#word(P, c, w)}<span class="tiny"> ${w.gloss}</span></span>`)}
              </div>
            </div>`,
        )}
      </div>
      ${
        D
          ? html`<div class="lx-card lx-sortdone">
              <b>✅ ${this.t('lang.sort.done', { right: D.right, n: D.n })}</b>
              <button
                class="btn small primary"
                type="button"
                @click=${() => {
                  this.#fresh();
                  this.requestUpdate();
                }}
              >
                ↻ ${this.t('lang.drill.again')}
              </button>
              <button
                class="btn small"
                type="button"
                @click=${() => {
                  P.go(fieldMap);
                }}
              >
                ${this.t('lang.card.fieldMap')}
              </button>
            </div>`
          : nothing
      }`;
  }
}

/** 🔁 the principal parts of the words met, one part at a time. */
export class NoemaLangParts extends NoemaScreen {
  static override properties = { port: { attribute: false }, code: { type: String } };
  declare port: CoursePort | null;
  declare code: string;
  #m: PartsDrill | null = null;
  #i = 0;
  #right = 0;
  #answer: number | null = null;

  constructor() {
    super();
    this.port = null;
    this.code = '';
  }

  override willUpdate(ch: Map<string, unknown>): void {
    if (ch.has('port') || ch.has('code')) this.#fresh();
  }

  #fresh(): void {
    this.#m = this.port?.partsDrill(this.code) ?? null;
    this.#i = 0;
    this.#right = 0;
    this.#answer = null;
  }

  #next(): void {
    this.#i++;
    this.#answer = null;
    this.requestUpdate();
    void this.updateComplete.then(() => this.querySelector<HTMLElement>('.lx-opt')?.focus());
  }

  #val(P: CoursePort, c: string, val: string, foreign: boolean): TemplateResult | string {
    return foreign ? html`<noema-lang-word .port=${P} code=${c} text=${val} .sub=${false}></noema-lang-word>` : val;
  }

  #item(P: CoursePort, c: string, it: PartsItem): TemplateResult {
    const nextBtn = html`<div class="row">
      <button
        class="btn primary lx-next"
        type="button"
        @click=${() => {
          this.#next();
        }}
      >
        ${this.t('lang.drill.next')} ${this.uiDir === 'rtl' ? '←' : '→'}
      </button>
    </div>`;
    const word = html`<noema-lang-word .port=${P} code=${c} text=${it.lemma} lex=${it.id} .sub=${it.sub}></noema-lang-word>`;
    if (!it.options)
      return html`<div class="lx-ex lx-exparts" data-kind="parts" data-lex=${it.id} data-label=${it.pid}>
        <div class="lx-prompt">${word}</div>
        <div class="lx-q">${it.label}: ${this.#val(P, c, it.val, it.foreign)}</div>
        ${nextBtn}
      </div>`;
    const a = this.#answer,
      opts = it.options;
    return html`<div class="lx-ex lx-exparts" data-kind="parts" data-lex=${it.id} data-label=${it.pid}>
      <div class="lx-prompt">
        ${word}
        <div class="tiny">${it.gloss}</div>
      </div>
      <div class="lx-q">${it.ask}</div>
      <div class="lx-opts" data-done=${a == null ? nothing : '1'}>
        ${opts.map((o, j) => {
          const cls = a == null ? '' : o.ok ? ' right' : j === a ? ' wrong' : '';
          return html`<button
            class=${'lx-opt' + cls}
            type="button"
            data-k=${j + 1}
            @click=${() => {
              if (this.#answer != null) return;
              this.#answer = j;
              if (o.ok) this.#right++;
              P.partsRecord(c, it.id, o.ok);
              this.requestUpdate();
            }}
          >
            <span class="lx-k">${j + 1}</span>${this.#val(P, c, o.val, o.foreign)}
          </button>`;
        })}
      </div>
      ${a == null ? nothing : nextBtn}
    </div>`;
  }

  override render(): TemplateResult {
    const P = this.port,
      m = this.#m;
    if (!P || !m) return html``;
    const c = m.lang.code;
    const head = html`${back(this, this.t('lang.card.map'), '#/')}
      <h1>🔁 ${this.t('lang.view.parts')}<span class="tiny"> · ${m.lang.flag} ${m.lang.label}</span></h1>
      ${rail(m.rail, x => {
        P.go('#/parts/' + x);
      })}`;
    if (!m.items.length)
      return html`${head}
        <p class="lx-note">${this.t('lang.parts.nothing', { lang: m.lang.name })}</p>`;
    const it = m.items[this.#i];
    return html`${head}
      <div class="lx-stage">
        ${
          it
            ? this.#item(P, c, it)
            : html`<div class="lx-card lx-sortdone">
                <b>✅ ${this.t('lang.drill.score', { right: this.#right, n: m.items.length })}</b>
                <button
                  class="btn small primary"
                  type="button"
                  @click=${() => {
                    this.#fresh();
                    this.requestUpdate();
                  }}
                >
                  ↻ ${this.t('lang.drill.again')}
                </button>
              </div>`
        }
      </div>`;
  }
}
