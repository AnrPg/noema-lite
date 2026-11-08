/**
 * The exercise types for critical thinking (CONTENT_SPEC.md, Q5 / paradigms): find the flaw, a case of several parts,
 * predict, a decision tree, inquiry (which test tells the most), and a debate. Light-DOM Lit elements on ExerciseWidget,
 * like basic.ts; the verdict is the study domain's.
 */
import type { Answer } from '../../domain/grading/grade.ts';
import { letter, shuffle } from '../dom.ts';
import { codeT, F, html, M, nothing, tag, type TemplateResult } from '../lit/base.ts';
import { guessLang, highlight } from '../text.ts';
import { calc, mcq, newer, showLast, stepOptions, tf, tipT, type StepView } from './basic.ts';
import { ExerciseWidget, indices, strings, verdictOf, type Renderer, type Widget, type WidgetApi, type WidgetCtx } from './widget.ts';

const labelT = (text: string, top = '12px'): TemplateResult => html`<div class="lbl" style=${`margin:${top} 0 6px`}>${text}</div>`;

/* ---------- 🔎 find the flaw: the lines, then why ---------- */
class FlawWidget extends ExerciseWidget {
  readonly #lines = strings(this.ex.lines);
  readonly #reasons = strings(this.ex.reasons);
  readonly #bad = new Set(indices(this.ex.flaws));
  readonly #code = !!this.ex.asCode || !!this.ex.lang;
  readonly #lang = this.ex.lang ?? guessLang(this.#lines.join('\n'));
  readonly #sel = new Set<number>();
  #why: number | null = null;
  answer(): { lines: number[]; reason: number | null } {
    return { lines: [...this.#sel], reason: this.#why };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    return (
      [...this.#sel]
        .sort((a, b) => a - b)
        .map(i => `line ${String(i + 1)}`)
        .join(', ') + (this.#why === null ? '' : ` — because: ${this.#reasons[this.#why] ?? ''}`)
    );
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  #tap(f: () => void): void {
    if (this.api.locked()) return;
    f();
    this.redraw();
  }
  override render(): TemplateResult {
    const app = this.app,
      ex = this.ex,
      rv = this.revealed;
    const fix = ex.fix;
    return html`${tipT(app.t('engine.ex.flawHint', { n: this.#bad.size }))}
      <div class="codelines${this.#code ? '' : ' prose'}">
        ${this.#lines.map((l, i) => {
          const mark = rv ? (this.#bad.has(i) ? ' right' : this.#sel.has(i) ? ' wrong' : '') : '';
          return html`<button
            class="${this.#sel.has(i) ? 'sel' : ''}${mark}"
            @click=${() => {
              this.#tap(() => (this.#sel.has(i) ? this.#sel.delete(i) : this.#sel.add(i)));
            }}
          >
            <span class="ln">${app.nf(i + 1)}</span>${
              this.#code ? html`<span>${M(highlight(l, this.#lang))}</span>` : html`<span class="prose"><span>${F(l)}</span></span>`
            }
          </button>`;
        })}
      </div>
      ${labelT(app.t('engine.ex.flawWhy'))}
      <div class="opts">
        ${this.#reasons.map((r, i) => {
          const mark = rv ? (i === ex.reason ? ' right' : i === this.#why ? ' wrong' : '') : '';
          return html`<button
            class="opt${i === this.#why ? ' sel' : ''}${mark}"
            @click=${() => {
              this.#tap(() => (this.#why = i));
            }}
          >
            <span class="k">${letter(i)}</span><span>${F(r)}</span>
          </button>`;
        })}
      </div>
      ${
        rv && fix
          ? html`<div class="fb ok">
              <b>🔧 ${app.t('engine.ex.fix')} </b>${
                this.#code && /\n|;|\(|=/.test(fix) ? codeT(fix, this.#lang, app.t('engine.core.copy')) : html`<span>${F(fix)}</span>`
              }
            </div>`
          : nothing
      }`;
  }
}
tag('study-ex-flaw', FlawWidget);
export const flaw: Renderer = c => new FlawWidget(c).redraw();

/* ---------- 📂 a case: several parts, each its own type ---------- */
/** the renderer of a case's part (its own type; anything else is "newer") */
const PART_TYPES: Readonly<Record<string, Renderer>> = { mcq, tf, calc };

class CaseWidget extends ExerciseWidget {
  readonly #all = this.ex.parts ?? [];
  readonly #parts: readonly Widget[];
  #right: readonly boolean[] = [];
  constructor(c: WidgetCtx) {
    super(c);
    const quiet: WidgetApi = { locked: () => c.api.locked(), check: () => undefined, done: () => undefined };
    this.#parts = this.#all.map((p, i) => (PART_TYPES[p.type] ?? newer)({ ...c, ex: { ...p, id: `${c.ex.id}/${String(i)}` }, api: quiet }));
  }
  answer(): { parts: unknown[] } {
    return { parts: this.#parts.map(w => w.answer?.() ?? {}) };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    return this.#parts.map((w, i) => `(${String(i + 1)}) ${w.given?.() ?? ''}`).join('  ');
  }
  reveal(): void {
    this.#right = verdictOf(this.ex, this.answer()).items ?? [];
    for (const w of this.#parts) w.reveal?.();
    this.revealed = true;
    this.redraw();
  }
  override render(): TemplateResult {
    const app = this.app,
      n = this.#all.length;
    return html`<div class="case">
      ${this.#all.map((p, i) => {
        const ok = !!this.#right[i];
        return html`<div class="casepart${this.revealed ? (ok ? ' ok' : ' bad') : ''}">
          <div class="sp"><span class="pill c">${app.t('engine.ex.casePart', { n: i + 1, of: n })}</span> <span>${F(p.q)}</span></div>
          ${this.#parts[i]?.el}${this.revealed && p.explain ? html`<div class="fb ${ok ? 'ok' : 'info'}">${F(p.explain)}</div>` : nothing}
        </div>`;
      })}
    </div>`;
  }
}
tag('study-ex-case', CaseWidget);
export const caseType: Renderer = c => new CaseWidget(c).redraw();

/* ---------- 🔮 predict: choose or compute the outcome, then see it ---------- */
class PredictWidget extends ExerciseWidget {
  readonly #w: Widget;
  constructor(c: WidgetCtx) {
    super(c);
    this.#w = Array.isArray(c.ex.options) ? mcq(c) : calc(c);
  }
  keys(k: number): void {
    this.#w.keys?.(k);
  }
  answer(): Answer {
    return this.#w.answer?.() ?? {};
  }
  check(): boolean | null {
    return this.#w.check?.() ?? null;
  }
  given(): string {
    return this.#w.given?.() ?? '';
  }
  override focus(): void {
    this.#w.focus?.();
  }
  reveal(): void {
    this.#w.reveal?.();
    this.revealed = true;
    this.redraw();
  }
  override render(): TemplateResult {
    const app = this.app,
      ex = this.ex;
    const outcome = ex.outcome ?? '';
    return html`${tipT(`🔮 ${app.t('engine.ex.predictHint')}`)}${this.#w.el}${
      this.revealed
        ? html`<div class="fb info">
            <b>▶ ${app.t('engine.ex.outcome')} </b>${
              /\n/.test(outcome) && ex.lang ? codeT(outcome, ex.lang, app.t('engine.core.copy')) : html`<span>${F(outcome)}</span>`
            }
          </div>`
        : nothing
    }`;
  }
}
tag('study-ex-predict', PredictWidget);
export const predict: Renderer = c => new PredictWidget(c).redraw();

/* ---------- 🌳 a decision tree: each right choice leads on ---------- */
class TreeWidget extends ExerciseWidget {
  readonly selfDone = true;
  readonly #nodes = this.ex.nodes ?? {};
  readonly #seen = new Set<string>();
  readonly #steps: { readonly q: string; readonly v: StepView }[] = [];
  readonly #path: string[] = [];
  #mistakes = 0;
  constructor(c: WidgetCtx) {
    super(c);
    this.#node(typeof c.ex.start === 'string' ? c.ex.start : (Object.keys(this.#nodes)[0] ?? ''));
  }
  given(): string {
    return [...this.querySelectorAll('.treepath li')].map(li => li.textContent).join(' → ');
  }
  #end(): void {
    this.redraw();
    this.api.done(verdictOf(this.ex, { mistakes: this.#mistakes }).ok === true);
  }
  #node(id: string): void {
    const n = this.#nodes[id];
    if (!n || this.#seen.has(id)) {
      this.#end(); // a malformed tree ends instead of looping
      return;
    }
    this.#seen.add(id);
    this.#steps.push({ q: n.q, v: { options: n.options, wrong: new Set(), right: null, fb: null } });
    this.redraw();
    showLast(this, '.scstep');
  }
  #tap(v: StepView, o: StepView['options'][number] & { readonly to?: string }, i: number): void {
    const fb = this.app.host.feedback;
    if (o.ok) {
      v.right = i;
      v.fb = o.fb ? { ok: true, text: o.fb } : null;
      fb.beep('ok');
      this.#path.push(o.text);
      if (o.to) this.#node(o.to);
      else this.#end();
    } else {
      this.#mistakes++;
      v.wrong.add(i);
      v.fb = { ok: false, text: o.fb ?? '' };
      fb.beep('bad');
      this.redraw();
    }
  }
  override render(): TemplateResult {
    const app = this.app;
    return html`<div class="tiny" ?hidden=${!this.#path.length}>${app.t('engine.ex.treePath')}</div>
      <ol class="treepath">
        ${this.#path.map(t => html`<li><span>${F(t)}</span></li>`)}
      </ol>
      <div class="tree">
        ${this.#steps.map(
          (s, k) =>
            html`<div class="scstep">
              <div class="sp"><span class="pill c">🌳 ${app.nf(k + 1)}</span> <span>${F(s.q)}</span></div>
              ${stepOptions(s.v, (o, i) => {
                this.#tap(s.v, o, i);
              })}
              <div>
                ${s.v.fb ? html`<div class="fb ${s.v.fb.ok ? 'ok' : 'bad'}">${s.v.fb.ok ? '✅' : '↪'} ${F(s.v.fb.text)}</div>` : nothing}
              </div>
            </div>`,
        )}
      </div>`;
  }
}
tag('study-ex-tree', TreeWidget);
export const tree: Renderer = c => new TreeWidget(c).redraw();

/* ---------- ❓ inquiry: which test tells the most ---------- */
class InquiryWidget extends ExerciseWidget {
  readonly #options = strings(this.ex.options);
  readonly #scores = indices(this.ex.scores);
  readonly #best = Math.max(...this.#scores);
  readonly #order = shuffle(this.#options.map((_, i) => i));
  readonly #why = strings(this.ex.why);
  #pick: number | null = null;
  keys(k: number): void {
    this.press('.opts .opt', k);
  }
  answer(): { picked: number | null } {
    return { picked: this.#pick };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    return this.#pick === null ? '' : (this.#options[this.#pick] ?? '');
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  override render(): TemplateResult {
    const app = this.app;
    return html`${tipT(app.t('engine.ex.inquiryHint'))}
      <div class="opts">
        ${this.#order.map((oi, k) => {
          const sc = this.#scores[oi] ?? 0;
          const mark = this.revealed ? (sc === this.#best ? ' right' : oi === this.#pick ? ' wrong' : ' dim') : '';
          const v = app.t('engine.ex.inquiryValue', { n: sc });
          return html`<button
            class="opt${mark}"
            @click=${() => {
              if (this.api.locked()) return;
              this.#pick = oi;
              this.api.check();
            }}
          >
            <span class="k">${letter(k)}</span
            ><span
              >${F(this.#options[oi] ?? '')}${
                this.revealed
                  ? html`<span class="why"
                      ><span class="value" title=${v} aria-label=${v}>${'●'.repeat(sc) + '○'.repeat(3 - sc)}</span>
                      <span>${F(this.#why[oi] ?? '')}</span></span
                    >`
                  : nothing
              }</span
            >
          </button>`;
        })}
      </div>`;
  }
}
tag('study-ex-inquiry', InquiryWidget);
export const inquiry: Renderer = c => new InquiryWidget(c).redraw();

/* ---------- 🗣 a debate: take a side, then its strongest objection ---------- */
class DebateWidget extends ExerciseWidget {
  readonly #sides = this.ex.sides ?? [];
  #side: number | null = null;
  #pick: number | null = null;
  #counters: readonly number[] = [];
  keys(k: number): void {
    this.press(this.#side === null ? '.debate-sides .opt' : '.debate-counters .opt', k);
  }
  answer(): { side: number | null; pick: number | null } {
    return { side: this.#side, pick: this.#pick };
  }
  check(): boolean | null {
    return verdictOf(this.ex, this.answer()).ok;
  }
  given(): string {
    const s = this.#side === null ? undefined : this.#sides[this.#side];
    return s ? `side: ${s.position}${this.#pick === null ? '' : ` — objection: ${s.counters[this.#pick] ?? ''}`}` : '';
  }
  reveal(): void {
    this.revealed = true;
    this.redraw();
  }
  override render(): TemplateResult {
    const app = this.app;
    const sd = this.#side === null ? undefined : this.#sides[this.#side];
    return html`<div class="debate">
      ${labelT(app.t('engine.ex.debatePick'), '0')}
      <div class="opts debate-sides">
        ${this.#sides.map(
          (s, i) =>
            html`<button
              class="opt${this.#side === i ? ' sel' : this.#side !== null ? ' dim' : ''}"
              @click=${() => {
                if (this.api.locked() || this.#side !== null) return;
                this.#side = i;
                this.#counters = shuffle(s.counters.map((_, j) => j));
                this.redraw();
              }}
            >
              <span class="k">${letter(i)}</span><span>${F(s.position)}</span>
            </button>`,
        )}
      </div>
      ${
        sd
          ? html`${labelT(app.t('engine.ex.debateCounter'))}
              <div class="opts debate-counters">
                ${this.#counters.map((ci, k) => {
                  const mark = this.revealed ? (ci === sd.best ? ' right' : ci === this.#pick ? ' wrong' : '') : '';
                  const w = this.revealed ? sd.why?.[ci] : undefined;
                  return html`<button
                    class="opt${mark}"
                    @click=${() => {
                      if (this.api.locked()) return;
                      this.#pick = ci;
                      this.api.check();
                    }}
                  >
                    <span class="k">${letter(k)}</span
                    ><span>${F(sd.counters[ci] ?? '')}${w ? html`<span class="why">${F(w)}</span>` : nothing}</span>
                  </button>`;
                })}
              </div>`
          : nothing
      }
    </div>`;
  }
}
tag('study-ex-debate', DebateWidget);
export const debate: Renderer = c => new DebateWidget(c).redraw();
