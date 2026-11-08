/**
 * The answer areas of the classic exercise types (tools/CONTENT_SPEC.md "Types"): choices, true/false, order, match,
 * buckets, cloze, spot the bug, a number, a scenario, a free answer (graded by the AI or by the learner's own checklist)
 * and code to write. Each is a light-DOM Lit element on ExerciseWidget (widget.ts); the verdict is the study domain's.
 */
import type { Exercise } from '../../domain/pack.ts';
import { letter, replay, shuffle } from '../dom.ts';
import { codeT, F, html, M, nothing, tag, type TemplateResult } from '../lit/base.ts';
import type { StudyApp } from '../app.ts';
import { guessLang, highlight } from '../text.ts';
import { ExerciseWidget, indices, strings, verdictOf, type Renderer, type WidgetCtx } from './widget.ts';

/** a hint line above an answer area */
export const tipT = (text: string): TemplateResult => html`<div class="tiny" style="margin-bottom:8px">${text}</div>`;
const whyOf = (ex: Exercise, i: number): string | undefined => {
  const w = ex.why;
  return Array.isArray(w) ? (w as readonly string[])[i] : (w as Readonly<Record<string, string>> | undefined)?.[String(i)];
};
/** a fix as code when it reads like code, else as text */
export const fixT = (app: StudyApp, fix: string, lang: string | undefined): TemplateResult =>
  /\n|;|\(|=/.test(fix) ? html`${codeT(fix, lang ?? guessLang(fix), app.t('engine.core.copy'))}` : html`<div>${F(fix)}</div>`;

/* ---------- 🎯 choices (and 🕵️ the odd one out) ---------- */
export class McqWidget extends ExerciseWidget {
  readonly #options = strings(this.ex.options);
  readonly #right = new Set(indices(this.ex.answer));
  readonly #multi = !!this.ex.multi || this.#right.size > 1;
  readonly #order = shuffle(this.#options.map((_, i) => i));
  readonly #sel = new Set<number>();
  /** the options in a grid of four (the odd one out) */
  protected grid = false;

  keys(k: number): void {
    this.press('.opts .opt', k);
  }
  answer(): { picked: number[] } {
    return { picked: [...this.#sel] };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    return [...this.#sel].map(oi => `${letter(oi)}. ${this.#options[oi] ?? ''}`).join(' + ');
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  #pick(oi: number): void {
    if (this.api.locked()) return;
    if (!this.#multi) for (const x of [...this.#sel]) if (x !== oi) this.#sel.delete(x);
    if (this.#sel.has(oi)) this.#sel.delete(oi);
    else this.#sel.add(oi);
    this.redraw();
    if (!this.#multi) this.api.check();
  }
  override render(): TemplateResult {
    const cls = (oi: number): string =>
      (this.#sel.has(oi) ? ' sel' : '') + (this.revealed ? (this.#right.has(oi) ? ' right' : this.#sel.has(oi) ? ' wrong' : '') : '');
    return html`${this.#multi ? tipT(this.app.t('engine.ex.selectAll', { n: this.#right.size })) : nothing}
      <div class="opts${this.grid ? ' grid4' : ''}">
        ${this.#order.map((oi, k) => {
          const why = this.revealed ? whyOf(this.ex, oi) : undefined;
          return html`<button
            class="opt${cls(oi)}"
            data-nf=${`options.${String(oi)}`}
            @click=${() => {
              this.#pick(oi);
            }}
          >
            <span class="k">${letter(k)}</span
            ><span
              >${F(this.#options[oi] ?? '')}${why ? html`<span class="why" data-nf=${`why.${String(oi)}`}>${F(why)}</span>` : nothing}</span
            >
          </button>`;
        })}
      </div>`;
  }
}
tag('study-ex-mcq', McqWidget);
export const mcq: Renderer = c => new McqWidget(c).redraw();

class OddWidget extends McqWidget {
  protected override grid = true;
}
tag('study-ex-odd', OddWidget);
export const odd: Renderer = c => new OddWidget(c).redraw();

/** An exercise of a type this app does not know (a newer pack): a quiet card, never a crash (docs/adr/001 D1). */
class NewerWidget extends ExerciseWidget {
  readonly selfDone = true;
  override render(): TemplateResult {
    return html`<div class="fb">🔄 ${this.app.t('engine.act.newerType')}</div>`;
  }
}
tag('study-ex-newer', NewerWidget);
export const newer: Renderer = c => new NewerWidget(c).redraw();

/* ---------- ⚖️ true or false ---------- */
class TfWidget extends ExerciseWidget {
  #pick: boolean | null = null;
  keys(k: number): void {
    this.press('.tfbtn', k);
  }
  answer(): { value: boolean | null } {
    return { value: this.#pick };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    return this.#pick === null ? '' : String(this.#pick);
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  override render(): TemplateResult {
    const btn = (v: boolean, label: string, c: string): TemplateResult => {
      const mark = this.revealed ? (this.ex.answer === v ? ' right' : this.#pick === v ? ' wrong' : '') : '';
      return html`<button
        class="tfbtn ${c}${mark}"
        @click=${() => {
          if (this.api.locked()) return;
          this.#pick = v;
          this.api.check();
        }}
      >
        ${label}
      </button>`;
    };
    return html`<div class="tfrow">
      ${btn(true, `👍 ${this.app.t('engine.ex.true')}`, 't')}${btn(false, `👎 ${this.app.t('engine.ex.false')}`, 'f')}
    </div>`;
  }
}
tag('study-ex-tf', TfWidget);
export const tf: Renderer = c => new TfWidget(c).redraw();

/* ---------- 🔢 order ---------- */
class OrderWidget extends ExerciseWidget {
  readonly #texts = strings(this.ex.items);
  readonly #items = shuffle(this.#texts.map((_, i) => i));
  readonly #picked: number[] = [];
  answer(): { order: number[] } {
    return { order: [...this.#picked] };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    return this.#picked.map(i => this.#texts[i] ?? '').join(' → ');
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  #change(f: () => void): void {
    if (this.api.locked()) return;
    f();
    this.redraw();
  }
  override render(): TemplateResult {
    const app = this.app,
      picked = this.#picked;
    return html`<div class="seq">
        ${picked.length ? nothing : html`<div class="ph">${app.t('engine.ex.orderHint')}</div>`}${picked.map(
          (i, k) =>
            html`<button
              class="chipx${this.revealed ? (i === k ? ' right' : ' wrong') : ''}"
              @click=${() => {
                this.#change(() => picked.splice(k, 1));
              }}
            >
              <span class="no">${app.nf(k + 1)}</span><span>${F(this.#texts[i] ?? '')}</span>
            </button>`,
        )}
      </div>
      ${
        this.revealed && !picked.every((i, k) => i === k)
          ? html`<div class="fb info">
              <b>${app.t('engine.ex.correctOrder')} </b>
              <ol style="margin:6px 0 0;padding-inline-start:20px">
                ${this.#texts.map(t => html`<li>${F(t)}</li>`)}
              </ol>
            </div>`
          : nothing
      }
      <div class="pool">
        ${this.#items
          .filter(x => !picked.includes(x))
          .map(
            i =>
              html`<button
                class="chipx"
                @click=${() => {
                  this.#change(() => picked.push(i));
                }}
              >
                <span>${F(this.#texts[i] ?? '')}</span>
              </button>`,
          )}
      </div>`;
  }
}
tag('study-ex-order', OrderWidget);
export const order: Renderer = c => new OrderWidget(c).redraw();

/* ---------- 🔗 match ---------- */
/** the colours of matched pairs: chapter colours (data-ci), so each pair's number reads on its colour */
const PAIR_COLOURS = [7, 1, 4, 8, 5, 3, 2];

class MatchWidget extends ExerciseWidget {
  readonly #pairs = (this.ex.pairs ?? []).map(p => [p[0], p[1]] as const);
  readonly #right = shuffle(this.#pairs.map((_, i) => i));
  readonly #link = new Map<number, number>();
  #selL: number | null = 0;
  #links(): (number | null)[] {
    return this.#pairs.map((_, i) => this.#link.get(i) ?? null);
  }
  answer(): { links: (number | null)[] } {
    return { links: this.#links() };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    const pairs = this.#pairs;
    return pairs
      .map((p, i) => (this.#link.has(i) ? `${p[0]} = ${pairs[this.#link.get(i) ?? 0]?.[1] ?? ''}` : ''))
      .filter(Boolean)
      .join('; ');
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  #tapLeft(i: number): void {
    if (this.api.locked()) return;
    this.#link.delete(i);
    this.#selL = this.#selL === i ? null : i;
    this.redraw();
  }
  #tapRight(i: number): void {
    if (this.api.locked()) return;
    for (const [l, r] of this.#link) if (r === i) this.#link.delete(l);
    if (this.#selL !== null) {
      this.#link.set(this.#selL, i);
      const next = this.#pairs.findIndex((_, k) => !this.#link.has(k));
      this.#selL = next < 0 ? null : next;
    }
    this.redraw();
  }
  override render(): TemplateResult {
    const app = this.app,
      pairs = this.#pairs;
    // each linked pair: its number and colour, on both of its sides
    const pairOf = new Map<string, number>();
    [...this.#link].forEach(([l, r], k) => {
      pairOf.set(`L${String(l)}`, k);
      pairOf.set(`R${String(r)}`, k);
    });
    const item = (key: string, text: string, extra: string, onTap: () => void): TemplateResult => {
      const k = pairOf.get(key);
      return html`<button
        class="mitem${extra}"
        data-ci=${k === undefined ? nothing : String(PAIR_COLOURS[k % PAIR_COLOURS.length])}
        style=${k === undefined ? '' : 'border-color:var(--c)'}
        @click=${onTap}
      >
        <span>${F(text)}</span>${k === undefined ? nothing : html`<span class="tag">${app.nf(k + 1)}</span>`}
      </button>`;
    };
    return html`${tipT(app.t('engine.ex.matchHint'))}
      <div class="matchgrid">
        <div class="col">
          ${pairs.map((p, i) =>
            item(
              `L${String(i)}`,
              p[0],
              (this.#selL === i ? ' sel' : '') + (this.revealed ? (this.#link.get(i) === i ? ' right' : ' wrong') : ''),
              () => {
                this.#tapLeft(i);
              },
            ),
          )}
        </div>
        <div class="col">
          ${this.#right.map(i =>
            item(`R${String(i)}`, pairs[i]?.[1] ?? '', '', () => {
              this.#tapRight(i);
            }),
          )}
        </div>
      </div>
      ${
        this.revealed && !pairs.every((_, i) => this.#link.get(i) === i)
          ? html`<div class="fb info">
              <b>${app.t('engine.ex.correctPairs')}</b>
              <ul style="margin:6px 0 0;padding-inline-start:20px">
                ${pairs.map(p => html`<li>${F(p[0])} → ${F(p[1])}</li>`)}
              </ul>
            </div>`
          : nothing
      }`;
  }
}
tag('study-ex-match', MatchWidget);
export const match: Renderer = c => new MatchWidget(c).redraw();

/* ---------- 🗂️ buckets ---------- */
interface BucketItem {
  readonly text: string;
  readonly bucket: number;
  readonly i: number;
}
class BucketWidget extends ExerciseWidget {
  readonly #all: readonly BucketItem[] = ((this.ex.items ?? []) as readonly { readonly text: string; readonly bucket: number }[]).map(
    (it, i) => ({ ...it, i }),
  );
  readonly #buckets = strings(this.ex.buckets);
  readonly #items = shuffle(this.#all);
  readonly #place = new Map<number, number>();
  #sel: number | null = null;
  answer(): { place: (number | null)[] } {
    return { place: this.#all.map((_, i) => this.#place.get(i) ?? null) };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    return this.#items
      .filter(it => this.#place.has(it.i))
      .map(it => `${it.text} → ${this.#buckets[this.#place.get(it.i) ?? 0] ?? ''}`)
      .join('; ');
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  #drop(i: number, bi: number): void {
    this.#place.set(i, bi);
    this.#sel = null;
    this.redraw();
  }
  #chip(it: BucketItem): TemplateResult {
    const at = this.#place.get(it.i);
    const ok = at === it.bucket;
    const mark = this.revealed && at !== undefined ? (ok ? ' right' : ' wrong') : '';
    return html`<button
      class="chipx${this.#sel === it.i ? ' sel' : ''}${mark}"
      draggable="true"
      data-i=${it.i}
      @dragstart=${(e: DragEvent) => {
        e.dataTransfer?.setData('text', String(it.i));
      }}
      @click=${(e: Event) => {
        e.stopPropagation();
        if (this.api.locked()) return;
        if (this.#place.has(it.i)) {
          this.#place.delete(it.i);
          this.#sel = it.i;
        } else this.#sel = this.#sel === it.i ? null : it.i;
        this.redraw();
      }}
    >
      <span>${F(it.text)}</span>${
        mark === ' wrong' ? html`<small style="opacity:.8"> → ${this.#buckets[it.bucket] ?? ''}</small>` : nothing
      }
    </button>`;
  }
  override render(): TemplateResult {
    const app = this.app;
    const loose = this.#items.filter(it => !this.#place.has(it.i));
    return html`${tipT(app.t('engine.ex.bucketHint'))}
      <div class="pool">
        ${loose.length ? loose.map(it => this.#chip(it)) : html`<span class="tiny">${app.t('engine.ex.allSorted')}</span>`}
      </div>
      <div class="buckets">
        ${this.#buckets.map(
          (name, bi) =>
            html`<div
              class="bucket${this.#sel !== null ? ' hot' : ''}"
              @click=${() => {
                if (this.api.locked() || this.#sel === null) return;
                this.#drop(this.#sel, bi);
              }}
              @dragover=${(e: DragEvent) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.add('hot');
              }}
              @dragleave=${(e: DragEvent) => {
                (e.currentTarget as HTMLElement).classList.remove('hot');
              }}
              @drop=${(e: DragEvent) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.remove('hot');
                const i = Number(e.dataTransfer?.getData('text'));
                if (!this.api.locked() && Number.isInteger(i)) this.#drop(i, bi);
              }}
            >
              <h4>${F(name)}</h4>
              <div class="pool">${this.#items.filter(it => this.#place.get(it.i) === bi).map(it => this.#chip(it))}</div>
            </div>`,
        )}
      </div>`;
  }
}
tag('study-ex-bucket', BucketWidget);
export const bucket: Renderer = c => new BucketWidget(c).redraw();

/* ---------- ✍️ cloze: typed blanks, or blanks filled from a bank of words ---------- */
class ClozeWidget extends ExerciseWidget {
  readonly #parts = (this.ex.text ?? '').split(/\[\[(.+?)\]\]/g);
  readonly #alts = this.#parts.filter((_, i) => i % 2 === 1).map(p => p.split('|').map(s => s.trim()));
  readonly #bank = Array.isArray(this.ex.bank) ? strings(this.ex.bank) : null;
  readonly #words = this.#bank ? shuffle([...this.#alts.map(a => a[0] ?? ''), ...this.#bank]) : [];
  /** the bank's word in each blank */
  readonly #val: (number | null)[] = this.#alts.map(() => null);
  #selB = 0;
  #right: readonly boolean[] = [];

  #inputs(): HTMLInputElement[] {
    return [...this.querySelectorAll<HTMLInputElement>('input.blank')];
  }
  #value(bi: number): string | null {
    if (this.#bank) {
      const v = this.#val[bi];
      return v === null || v === undefined ? null : (this.#words[v] ?? null);
    }
    return this.#inputs()[bi]?.value ?? '';
  }
  answer(): { blanks: (string | null)[] } {
    return { blanks: this.#alts.map((_, bi) => this.#value(bi)) };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  override focus(): void {
    if (!this.#bank) this.#inputs()[0]?.focus();
  }
  given(): string {
    const v = this.answer().blanks;
    return v.some(Boolean) ? v.map(x => x ?? '—').join(' | ') : '';
  }
  reveal(): void {
    this.#right = verdictOf(this.ex, this.answer()).items ?? [];
    this.revealed = true;
    this.redraw();
  }
  #fill(wi: number): void {
    if (this.api.locked()) return;
    const vals = this.#val;
    const t = vals[this.#selB] === null ? this.#selB : vals.findIndex(v => v === null);
    if (t < 0 || t >= vals.length) return;
    vals[t] = wi;
    this.#selB = vals.findIndex(x => x === null);
    if (this.#selB < 0) this.#selB = t;
    this.redraw();
  }
  #blank(bi: number): TemplateResult {
    const alts = this.#alts[bi] ?? [];
    const mark = this.revealed ? (this.#right[bi] ? ' right' : ' wrong') : '';
    if (this.#bank) {
      const v = this.#val[bi] ?? null;
      return html`<span
        class="blank${v !== null ? ' filled' : ''}${!this.revealed && bi === this.#selB && v === null ? ' sel' : ''}${mark}"
        @click=${() => {
          if (this.api.locked()) return;
          this.#val[bi] = null;
          this.#selB = bi;
          this.redraw();
        }}
        >${v === null ? ' ' : (this.#words[v] ?? '')}${mark === ' wrong' ? html`<span class="corr">→ ${alts[0] ?? ''}</span>` : nothing}</span
      >`;
    }
    return html`<input
        class="blank${mark}"
        style=${`width:${String(Math.max(80, Math.min(300, (alts[0]?.length ?? 0) * 10 + 30)))}px`}
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        ?readonly=${this.revealed}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const nx = this.#inputs()[bi + 1];
          if (nx) nx.focus();
          else this.api.check();
        }}
      />${
        mark === ' wrong'
          ? html`<span class="pill" style="background:var(--ok-bg);color:var(--ok);margin:0 4px;font-family:var(--mono)"
              >${alts[0] ?? ''}</span
            >`
          : nothing
      }`;
  }
  override render(): TemplateResult {
    const code = !!this.ex.asCode;
    let bi = 0;
    const used = new Set(this.#val);
    return html`<div class="cloze${code ? ' code' : ''}">
        ${this.#parts.map((p, i) => (i % 2 === 0 ? (code ? p : html`<span>${F(p)}</span>`) : this.#blank(bi++)))}
      </div>
      ${
        this.#bank && !this.revealed
          ? html`<div class="pool bank">
              ${this.#words.map(
                (w, wi) =>
                  html`<button
                    class="chipx"
                    style=${used.has(wi) ? 'display:none' : ''}
                    @click=${() => {
                      this.#fill(wi);
                    }}
                  >
                    ${w}
                  </button>`,
              )}
            </div>`
          : nothing
      }`;
  }
}
tag('study-ex-cloze', ClozeWidget);
export const cloze: Renderer = c => new ClozeWidget(c).redraw();

/* ---------- 🐞 spot the bug ---------- */
class SpotbugWidget extends ExerciseWidget {
  readonly #lines = strings(this.ex.lines);
  readonly #lang = this.ex.lang ?? guessLang(this.#lines.join('\n'));
  readonly #bugs = new Set(indices(this.ex.bugs));
  readonly #sel = new Set<number>();
  answer(): { lines: number[] } {
    return { lines: [...this.#sel] };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    return [...this.#sel]
      .sort((a, b) => a - b)
      .map(i => `line ${String(i + 1)} (0-based ${String(i)})`)
      .join(', ');
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  override render(): TemplateResult {
    const app = this.app;
    return html`${tipT(app.t('engine.ex.spotbugHint', { n: this.#bugs.size }))}
      <div class="codelines">
        ${this.#lines.map((l, i) => {
          const mark = this.revealed ? (this.#bugs.has(i) ? ' right' : this.#sel.has(i) ? ' wrong' : '') : '';
          return html`<button
            class="${this.#sel.has(i) ? 'sel' : ''}${mark}"
            @click=${() => {
              if (this.api.locked()) return;
              if (this.#sel.has(i)) this.#sel.delete(i);
              else this.#sel.add(i);
              this.redraw();
            }}
          >
            <span class="ln">${i + 1}</span><span>${M(highlight(l, this.#lang))}</span>
          </button>`;
        })}
      </div>
      ${
        this.revealed
          ? html`<div class="fb ok"><b>🔧 ${app.t('engine.ex.fix')}</b>${fixT(app, this.ex.fix ?? '', this.ex.lang)}</div>`
          : nothing
      }`;
  }
}
tag('study-ex-spotbug', SpotbugWidget);
export const spotbug: Renderer = c => new SpotbugWidget(c).redraw();

/* ---------- 🧮 a number ---------- */
export class CalcWidget extends ExerciseWidget {
  #ok: boolean | null = null;
  #input(): HTMLInputElement | null {
    return this.querySelector('input');
  }
  #value(): string | null {
    const v = this.#input()?.value ?? '';
    return v === '' ? null : v;
  }
  override focus(): void {
    this.#input()?.focus();
  }
  given(): string {
    const v = this.#value();
    return v === null ? '' : `${v} ${this.ex.unit ?? ''}`;
  }
  answer(): { value: string | null } {
    return { value: this.#value() };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  reveal(): void {
    this.#ok = this.check() === true;
    this.revealed = true;
    this.redraw();
  }
  override render(): TemplateResult {
    return html`<div class="calcrow">
      <input
        type="number"
        step="any"
        placeholder="?"
        ?readonly=${this.revealed}
        style=${this.revealed ? `border-color:var(${this.#ok ? '--ok' : '--bad'})` : ''}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter') this.api.check();
        }}
      />${
        this.revealed
          ? html`<span class="pill" style="background:var(--ok-bg);color:var(--ok);font-size:15px"
              >= ${String(this.ex.answer)} ${this.ex.unit ?? ''}</span
            >`
          : nothing
      }<b class="muted">${this.ex.unit ?? ''}</b>
    </div>`;
  }
}
tag('study-ex-calc', CalcWidget);
export const calc: Renderer = c => new CalcWidget(c).redraw();

/* ---------- 🚨 a scenario: one step after another, each answered until right ---------- */
interface StepOption {
  readonly text: string;
  readonly ok?: boolean;
  readonly fb?: string;
}
/** one step of a scenario or a decision tree as the learner sees it */
export interface StepView {
  readonly options: readonly StepOption[];
  readonly wrong: Set<number>;
  right: number | null;
  fb: { readonly ok: boolean; readonly text: string } | null;
}
/** a step's options: wrong ones shake and stay, the right one ends the step */
export function stepOptions(st: StepView, onTap: (o: StepOption, i: number) => void): TemplateResult {
  return html`<div class="opts">
    ${st.options.map(
      (o, i) =>
        html`<button
          class="opt${st.right === i ? ' right' : st.wrong.has(i) ? ' wrong shake' : ''}"
          @click=${() => {
            if (st.right !== null || st.wrong.has(i)) return;
            onTap(o, i);
          }}
        >
          <span class="k">${letter(i)}</span><span>${F(o.text)}</span>
        </button>`,
    )}
  </div>`;
}
/** brings the newest step into view */
export function showLast(root: Element, sel: string): void {
  [...root.querySelectorAll(sel)].at(-1)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

class ScenarioWidget extends ExerciseWidget {
  readonly selfDone = true;
  readonly #steps = this.ex.steps ?? [];
  readonly #shown: StepView[] = [];
  #mistakes = 0;
  /** a step answered right waits for "Next step" */
  #waiting = false;
  constructor(c: WidgetCtx) {
    super(c);
    this.#next();
  }
  #next(): void {
    const st = this.#steps[this.#shown.length];
    if (!st) return;
    this.#shown.push({ options: shuffle(st.options), wrong: new Set(), right: null, fb: null });
    this.#waiting = false;
    this.redraw();
    showLast(this, '.scstep');
  }
  #tap(v: StepView, o: StepOption, i: number): void {
    const app = this.app;
    if (o.ok) {
      v.right = i;
      v.fb = { ok: true, text: o.fb ?? '' };
      app.host.feedback.beep('ok');
      const more = this.#shown.length < this.#steps.length;
      this.#waiting = more;
      this.redraw();
      if (!more) this.api.done(verdictOf(this.ex, { mistakes: this.#mistakes }).ok === true);
    } else {
      this.#mistakes++;
      v.wrong.add(i);
      v.fb = { ok: false, text: o.fb ?? '' };
      app.host.feedback.beep('bad');
      this.redraw();
    }
  }
  override render(): TemplateResult {
    const app = this.app,
      n = this.#steps.length;
    return html`${this.#shown.map((v, k) => {
      const st = this.#steps[k];
      const last = k === this.#shown.length - 1;
      return html`<div class="scstep">
        <div class="sp">
          <span class="pill c">${app.t('engine.ex.step', { n: k + 1, of: n })}</span> <span>${F(st?.prompt ?? '')}</span>
        </div>
        ${st?.code ? codeT(st.code, guessLang(st.code), app.t('engine.core.copy')) : nothing}${stepOptions(v, (o, i) => {
          this.#tap(v, o, i);
        })}
        <div>
          ${v.fb ? html`<div class="fb ${v.fb.ok ? 'ok' : 'bad'}">${v.fb.ok ? '✅' : '❌'} ${F(v.fb.text)}</div>` : nothing}${
            last && this.#waiting
              ? html`<div style="margin-top:10px">
                  <button
                    class="btn small primary"
                    @click=${() => {
                      this.#next();
                    }}
                  >
                    ${app.t('engine.ex.nextStep')}
                  </button>
                </div>`
              : nothing
          }
        </div>
      </div>`;
    })}`;
  }
}
tag('study-ex-scenario', ScenarioWidget);
export const scenario: Renderer = c => new ScenarioWidget(c).redraw();

/* ---------- 🗣️ a free answer: graded by the AI, or by the learner against the checklist ---------- */
type AiGrade = Awaited<ReturnType<StudyApp['ai']['grade']>>;
class FreeWidget extends ExerciseWidget {
  readonly selfDone = true;
  #finished = false;
  #grading = false;
  #graded: { readonly g: AiGrade; readonly score: number } | null = null;
  #error: string | null = null;
  #self = false;
  #selfDone = false;
  #ta(): HTMLTextAreaElement | null {
    return this.querySelector('textarea.answer');
  }
  override focus(): void {
    this.#ta()?.focus();
  }
  given(): string {
    return (this.#ta()?.value ?? '').trim();
  }
  #finish(ok: boolean): void {
    if (this.#finished) return;
    this.#finished = true;
    this.api.done(ok);
  }
  async #grade(): Promise<void> {
    const ta = this.#ta();
    const text = ta?.value ?? '';
    if (!text.trim()) {
      if (ta) replay(ta, 'shake');
      return;
    }
    this.#grading = true;
    this.#error = null;
    this.redraw();
    try {
      const g = await this.app.ai.grade(this.ex, text);
      const score = Math.max(0, Math.min(100, Math.trunc(g.score)));
      this.#graded = { g, score };
      this.redraw();
      this.#finish(verdictOf(this.ex, { score }).ok === true);
    } catch (e) {
      this.#grading = false;
      this.#error = this.app.errText(e);
      this.redraw();
    }
  }
  #model(): TemplateResult {
    return html`<div class="explain">
      <div class="hd">📘 ${this.app.t('engine.ex.modelAnswer')}</div>
      <span>${F(this.ex.model ?? '')}</span>
    </div>`;
  }
  #out(): unknown {
    const app = this.app;
    if (this.#graded) {
      const { g, score: sc } = this.#graded;
      return html`<div class="fb ai">
          <div class="row">
            <span class="score${sc >= 70 ? ' good' : sc >= 45 ? ' mid' : ''}">${sc}</span><b class="grow">${F(g.verdict)}</b>
          </div>
          ${g.covered?.length ? html`<div style="margin-top:8px">✅ <span>${F(g.covered.join(' · '))}</span></div>` : nothing}${
            g.missing?.length
              ? html`<div style="margin-top:4px">➕ ${app.t('engine.ex.missing')} <span>${F(g.missing.join(' · '))}</span></div>`
              : nothing
          }${g.mistakes?.length ? html`<div style="margin-top:4px">❌ <span>${F(g.mistakes.join(' · '))}</span></div>` : nothing}
          <div style="margin-top:8px">${app.ai.md(g.feedback)}</div>
        </div>
        ${this.#model()}`;
    }
    if (this.#error !== null) return html`<div class="fb bad">⚠️ ${app.t('engine.ex.aiFailedSelf', { error: this.#error })}</div>`;
    if (this.#self) {
      const rubric = strings(this.ex.rubric);
      return html`${this.#model()}
        <div class="explain rubric">
          <div class="hd">☑️ ${app.t('engine.ex.tickCovered')}</div>
          ${rubric.map(r => html`<label><input type="checkbox" /><span>${F(r)}</span></label>`)}
          <button
            class="btn small primary"
            style="margin-top:8px"
            ?disabled=${this.#selfDone}
            @click=${() => {
              this.#selfDone = true;
              const ticks = [...this.querySelectorAll<HTMLInputElement>('.rubric input[type=checkbox]')].map(c => c.checked);
              this.redraw();
              this.#finish(verdictOf(this.ex, { rubric: ticks }).ok === true);
            }}
          >
            ${app.t('engine.ex.done')}
          </button>
        </div>`;
    }
    return nothing;
  }
  override render(): TemplateResult {
    const app = this.app;
    const busy = this.#grading || !!this.#graded;
    return html`<textarea
        class="answer"
        placeholder=${app.t('engine.ex.freePlaceholder')}
        aria-label=${app.t('engine.ex.freePlaceholder')}
      ></textarea>
      <div class="actions">
        <button class="btn ai" ?disabled=${busy} @click=${() => this.#grade()}>
          ✨ ${busy ? app.t('engine.ex.grading') : app.t('engine.ex.gradeAI')}
        </button>
        <button
          class="btn"
          ?disabled=${this.#self}
          @click=${() => {
            this.#self = true;
            this.#error = null;
            this.redraw();
          }}
        >
          🙋 ${app.t('engine.ex.selfCheck')}
        </button>
      </div>
      <div>${this.#out()}</div>`;
  }
}
tag('study-ex-free', FreeWidget);
export const free: Renderer = c => new FreeWidget(c).redraw();

/* ---------- ⌨️ code to write: its essentials checked, the reference solution, an AI review on request ---------- */
class WriteWidget extends ExerciseWidget {
  #missing: readonly string[] = [];
  #review: 'idle' | 'busy' | { readonly g: AiGrade } | { readonly error: string } = 'idle';
  #ta(): HTMLTextAreaElement | null {
    return this.querySelector('textarea.answer');
  }
  #text(): string {
    return this.#ta()?.value ?? '';
  }
  override focus(): void {
    this.#ta()?.focus();
  }
  answer(): { text: string } {
    return { text: this.#text() };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    const t = this.#text().trim();
    return t ? `\n\`\`\`\n${t}\n\`\`\`\n` : '';
  }
  reveal(): void {
    this.#missing = verdictOf(this.ex, this.answer()).missing ?? [];
    this.revealed = true;
    this.redraw();
  }
  async #aiReview(): Promise<void> {
    this.#review = 'busy';
    this.redraw();
    try {
      this.#review = { g: await this.app.ai.grade(this.ex, this.#text()) };
    } catch (e) {
      this.#review = { error: this.app.errText(e) };
    }
    this.redraw();
  }
  #reviewT(): TemplateResult {
    const app = this.app,
      r = this.#review;
    if (typeof r === 'object' && 'g' in r)
      return html`<div class="fb ai">
        <b>${app.t('engine.ex.aiReview', { score: r.g.score })} </b><span>${F(r.g.verdict)}</span>
        <div style="margin-top:6px">${app.ai.md(r.g.feedback)}</div>
      </div>`;
    if (typeof r === 'object') return html`<div class="fb bad">⚠️ ${r.error}</div>`;
    return html`<button class="btn small ai" style="margin-top:10px" ?disabled=${r === 'busy'} @click=${() => this.#aiReview()}>
      ✨ ${r === 'busy' ? app.t('engine.ex.reviewing') : app.t('engine.ex.aiReviewBtn')}
    </button>`;
  }
  override render(): TemplateResult {
    const app = this.app,
      ex = this.ex;
    const ph = ex.lang ? app.t('engine.ex.writeLang', { lang: ex.lang }) : app.t('engine.ex.writeCode');
    return html`<textarea
        class="answer code"
        spellcheck="false"
        placeholder=${ph}
        aria-label=${ph}
        ?readonly=${this.revealed}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key !== 'Tab') return;
          const ta = e.currentTarget as HTMLTextAreaElement;
          e.preventDefault();
          const s = ta.selectionStart;
          ta.value = `${ta.value.slice(0, s)}  ${ta.value.slice(ta.selectionEnd)}`;
          ta.selectionStart = ta.selectionEnd = s + 2;
        }}
      ></textarea>
      ${
        this.revealed
          ? html`<div>
              ${
                this.#missing.length
                  ? html`<div class="fb bad">
                      ${app.t('engine.ex.missingEssentials')}
                      ${this.#missing.map(k => html`<code style="margin-inline-end:4px">${k}</code>`)}
                    </div>`
                  : nothing
              }
              <div class="explain">
                <div class="hd">✅ ${app.t('engine.ex.refSolution')}</div>
                ${codeT(ex.solution ?? '', ex.lang ?? guessLang(ex.solution ?? ''), app.t('engine.core.copy'))}
              </div>
              ${this.#reviewT()}
            </div>`
          : nothing
      }
      <div class="tiny" style="margin-top:6px">${app.t('engine.ex.writeNote')}</div>`;
  }
}
tag('study-ex-write', WriteWidget);
export const write: Renderer = c => new WriteWidget(c).redraw();
