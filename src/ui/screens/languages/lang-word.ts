/**
 * A foreign word or a run of foreign text (docs/LANGUAGES.md §8, D20, D23, D24, §9.5): in its language's font and direction,
 * its vowel marks as far as the learner reads them, its reading in Latin letters under it (transliteration, pinyin) — or in
 * [square brackets] after it inside running text — and every word the course knows underlined in the language's colour,
 * opening its card on tap (its meaning on hover, Enter / Space from the keyboard); a word not taught to this learner yet
 * has the dotted underline of a new word. Inside an exercise's prompt or options, a button or a link the words stay plain
 * (no answer may leak, a control holds no control).
 *
 *   <noema-lang-word .port=${coursePort} code="he" text="שָׁלוֹם" lex="he.shalom"></noema-lang-word>
 *
 * The element adds no box of its own (display: contents); its markup keeps the course sheet's classes (.lx-w, .lx-wbox,
 * .lx-help, .lx-run, .lx-rw, .lx-tok, .lx-newword). Until it is on the page it holds the plain text, so a reader of the
 * element's text gets the word at once.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaScreen } from '../screen.ts';
import type { WordPort, WordToken, WordView } from './course-port.ts';

/** Where the words stay plain: controls, an exercise's options, tiles and inputs, the tutor. */
const PLAIN =
  'button, a, .lx-opts, .lx-opt, select, option, label, .lx-tile, .lx-tile1, .lx-slot, .lx-tiles, .lx-cands, .lx-hidecol, .lx-input, .lx-diff, .lx-tutor';
/** Inside a running exercise (.lx-stage) only these parts link their words: feedback, the reference answer, explanations. */
const IN_STAGE = '.lx-fb, .lx-ref, .lx-intro, .lx-readtext, .lx-gram, .lx-typology, .lx-overview';

export class NoemaLangWord extends NoemaScreen {
  static override properties = {
    port: { attribute: false },
    code: { type: String },
    text: { type: String },
    lex: { type: String },
    cls: { type: String },
    marks: { type: String },
    sub: { type: Boolean },
    plain: { type: Boolean },
  };
  declare port: WordPort | null;
  declare code: string;
  declare text: string;
  /** the word of the course this text is (its reading under it), or '' */
  declare lex: string;
  /** more classes of the word (.lx-w lx-…) */
  declare cls: string;
  /** vowel marks forced: full (else the learner's setting) */
  declare marks: string;
  /** the reading under the word (with lex) */
  declare sub: boolean;
  /** never link the words (a word shown as a whole: a title, a tile) */
  declare plain: boolean;

  constructor() {
    super();
    this.port = null;
    this.code = '';
    this.text = '';
    this.lex = '';
    this.cls = '';
    this.marks = '';
    this.sub = true;
    this.plain = false;
  }

  /** light DOM, emptied of the plain text it held before it was drawn */
  protected override createRenderRoot(): HTMLElement {
    this.replaceChildren();
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.style.display = 'contents';
  }

  /** May its words open their cards here? */
  #linkable(): boolean {
    if (this.plain || this.closest(PLAIN)) return false;
    return !(this.closest('.lx-stage') && !this.closest(IN_STAGE));
  }

  /** Is it inside a sentence of another language (prose with its own words around it)? Then readings go in [brackets]. */
  #inProse(): boolean {
    const p = this.parentElement;
    if (!p) return false;
    let t = '';
    for (const n of p.childNodes) if (n !== this && n.nodeType === 3) t += n.textContent ?? '';
    return /\p{L}/u.test(t);
  }

  #open(e: Event, lex: string): void {
    e.stopPropagation();
    e.preventDefault();
    this.port?.openWord(this.code, lex);
  }

  #token(k: WordToken, prose: boolean): TemplateResult | string {
    if (!k.lex && !k.ruled) return k.text;
    const cls = (k.lex ? 'lx-rw lx-tok' : 'lx-ru') + (k.fresh ? ' lx-newword' : '');
    const title = k.lex ? (k.fresh ? this.t('lang.words.newTip') + ' · ' : '') + (k.gloss ?? '') : nothing;
    const on = k.lex
      ? {
          click: (e: Event) => {
            this.#open(e, k.lex ?? '');
          },
          key: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') this.#open(e, k.lex ?? '');
          },
        }
      : null;
    if (!k.reading)
      return html`<span
        class=${cls}
        data-l=${k.lex ?? nothing}
        role=${on ? 'button' : nothing}
        tabindex=${on ? '0' : nothing}
        title=${title}
        @click=${on?.click}
        @keydown=${on?.key}
        >${k.text}</span
      >`;
    if (prose)
      return html`<span
        class=${cls}
        data-l=${k.lex ?? nothing}
        role=${on ? 'button' : nothing}
        tabindex=${on ? '0' : nothing}
        title=${title}
        @click=${on?.click}
        @keydown=${on?.key}
        >${k.text}<span class="lx-help lx-br" lang="und-Latn" dir="ltr"> [${k.reading}]</span></span
      >`;
    return html`<ruby
      class=${cls}
      data-l=${k.lex ?? nothing}
      role=${on ? 'button' : nothing}
      tabindex=${on ? '0' : nothing}
      title=${title}
      @click=${on?.click}
      @keydown=${on?.key}
      >${k.text}<rt class="lx-help" lang="und-Latn" dir="ltr">${k.reading}</rt></ruby
    >`;
  }

  #word(v: WordView, prose: boolean): TemplateResult {
    const cls = 'lx-w' + (this.cls ? ' ' + this.cls : '');
    if (!v.run) return html`<span class=${cls} lang=${v.lang} dir=${v.dir}>${v.shown}</span>`;
    return html`<span class=${cls + ' lx-run'} lang=${v.lang} dir=${v.dir} title=${v.run.title} data-lk="1"
      >${v.run.tokens.map(k => this.#token(k, prose))}</span
    >`;
  }

  override render(): TemplateResult {
    const P = this.port;
    const v = P?.word(this.code, this.text, {
      lex: this.lex || null,
      sub: this.sub,
      marks: this.marks || null,
      link: this.#linkable(),
    });
    if (!v) return html`<span class="lx-w" lang=${this.code}>${this.text}</span>`;
    const w = this.#word(v, !v.help && this.#inProse());
    return v.help ? html`<span class="lx-wbox">${w}<span class="lx-help" lang=${v.help.lang}>${v.help.text}</span></span>` : w;
  }
}

/**
 * The Aa· switch: show or hide the reading under foreign words (D23, D24) — in a running lesson; a lesson's page has it in
 * its head (lang-lesson-head.ts). Nothing when no studied language has a reading.
 *
 *   <noema-lang-translit .port=${coursePort}></noema-lang-translit>
 */
export class NoemaLangTranslit extends NoemaScreen {
  static override properties = { port: { attribute: false } };
  declare port: WordPort | null;

  constructor() {
    super();
    this.port = null;
  }

  override render(): TemplateResult {
    const P = this.port,
      s = P?.translit();
    if (!P || !s?.has) return html``;
    return html`<button
      class="btn ghost small lx-translit"
      type="button"
      aria-pressed=${s.on ? 'true' : 'false'}
      title=${this.t(s.on ? 'lang.translit.hide' : 'lang.translit.show')}
      @click=${() => {
        P.setTranslit(!s.on);
        this.requestUpdate();
      }}
    >
      Aa·
    </button>`;
  }
}
