/**
 * The exercise card (a light-DOM Lit element, `study-ex-card`): its head (type, difficulty, tags, new, made by the AI,
 * the quiet "Ask <character>" and ⚑), the question, "How sure?", the type's answer area (a widget), Check, and the
 * explanation once answered, with the source it comes from and the tutor's two ways to help after a wrong answer.
 * Keys 1–6 pick an option, Enter checks (root.ts). The verdict is always the study domain's (the widget's check).
 *
 * The screens mount it through `exerciseCard(app, ex, o)`: the card element itself (class "ex", data-ex, data-ch,
 * data-ci), drawn at once, with `_check()`, `_locked()` and `_w` (its widget) for the round, the page's keys and the suites.
 */
import { exerciseAsText } from '../../domain/as-text.ts';
import type { AnswerRecord, Exercise } from '../../domain/pack.ts';
import type { StudyApp } from '../app.ts';
import { replay } from '../dom.ts';
import { accentOf } from '../parts.ts';
import { codeT, F, html, M, nothing, render, StudyElement, tag, type TemplateResult } from '../lit/base.ts';
import { guessLang } from '../text.ts';
import * as basic from './basic.ts';
import * as thinking from './thinking.ts';
import { VISUAL_TYPES } from './visual.ts';
import type { Renderer, Widget, WidgetApi } from './widget.ts';

const TYPE_ICON: Readonly<Record<string, string>> = {
  mcq: '🎯',
  tf: '⚖️',
  odd: '🕵️',
  order: '🔢',
  match: '🔗',
  bucket: '🗂️',
  cloze: '✍️',
  spotbug: '🐞',
  calc: '🧮',
  scenario: '🚨',
  free: '🗣️',
  write: '⌨️',
  flaw: '🔎',
  case: '📂',
  predict: '🔮',
  tree: '🌳',
  inquiry: '❓',
  debate: '🗣',
  img_hotspot: '📍',
  img_sequence: '🧭',
  img_reveal: '🧩',
  img_drag: '🏷️',
  img_label: '✏️',
  img_select: '🔽',
  img_occlusion: '🙈',
};
const TAG_ICON: Readonly<Record<string, string>> = { pitfall: '⚠️', debug: '🔧', exam: '🎓', interview: '🎤', calc: '🧮', compare: '⚖️' };
const KNOWN_TAGS = new Set(['concept', 'syntax', 'pitfall', 'debug', 'exam', 'interview', 'calc', 'compare']);

/** an exercise type's label: its emoji and its words (engine.exType.<type>) */
export function typeLabel(app: StudyApp, type: string): string {
  const key = `engine.exType.${type}`;
  if (!app.i18n.has(key)) return type;
  const icon = TYPE_ICON[type];
  return icon ? `${icon} ${app.t(key)}` : app.t(key);
}
export function tagLabel(app: StudyApp, tag: string): string {
  if (!KNOWN_TAGS.has(tag)) return tag;
  const icon = TAG_ICON[tag];
  return (icon ? `${icon} ` : '') + app.t(`engine.exTag.${tag}`);
}

const RENDERERS: Readonly<Record<string, Renderer>> = {
  mcq: basic.mcq,
  tf: basic.tf,
  odd: basic.odd,
  order: basic.order,
  match: basic.match,
  bucket: basic.bucket,
  cloze: basic.cloze,
  spotbug: basic.spotbug,
  calc: basic.calc,
  scenario: basic.scenario,
  free: basic.free,
  write: basic.write,
  flaw: thinking.flaw,
  case: thinking.caseType,
  predict: thinking.predict,
  tree: thinking.tree,
  inquiry: thinking.inquiry,
  debate: thinking.debate,
  ...VISUAL_TYPES,
};

/** the type's answer area (an activity's type is the activities' own) */
export function widgetOf(app: StudyApp, ex: Exercise, api: WidgetApi): Widget {
  const r = RENDERERS[ex.type];
  if (r) return r({ app, ex, api, media: app.host.media });
  return app.host.activities.exercise(ex, api) ?? basic.newer({ app, ex, api, media: app.host.media });
}

export interface CardOptions {
  readonly onDone?: (ok: boolean, card: HTMLElement) => void;
  readonly noXP?: boolean;
  readonly showSection?: boolean;
}

const pickOne = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)] as T;
const OK_WORDS = [
  ['✅', 'nailed'],
  ['✅', 'correct'],
  ['🎉', 'yes'],
  ['✅', 'spotOn'],
  ['🔥', 'exactly'],
] as const;
const BAD_WORDS = [
  ['💡', 'notQuite'],
  ['🧠', 'learning'],
  ['💡', 'close'],
] as const;
type Conf = NonNullable<AnswerRecord['conf']>;
const CONF_LEVELS: readonly (readonly [Conf, string])[] = [
  ['sure', '●●●'],
  ['think', '●●○'],
  ['guess', '●○○'],
];
const REPORT_REASONS = ['wrong', 'unclear', 'source', 'trivial', 'typo', 'other'] as const;
const PAGE_RE = /^\s*(?:p\.?|pp\.?|page|σ\.|стр\.?)\s*(\d+)/i;
/** the one-tap types: answering is the check */
const ONE_TAP = new Set(['tf', 'odd', 'inquiry', 'debate']);

interface Outcome {
  readonly ok: boolean;
  readonly sure: Conf | null;
  readonly icon: string;
  readonly word: string;
}

/** The card; its widget and check stay reachable for the round (data-ex, data-ch, data-nf: where a ⚑ points). */
export class ExerciseCard extends StudyElement {
  readonly #app: StudyApp;
  readonly #ex: Exercise;
  readonly #o: CardOptions;
  readonly _w: Widget;
  #locked = false;
  #nudge = '';
  #conf: Conf | null = null;
  #outcome: Outcome | null = null;

  constructor(app: StudyApp, ex: Exercise, o: CardOptions = {}) {
    super();
    this.#app = app;
    this.#ex = ex;
    this.#o = o;
    const ch = app.course.chapterOf(ex);
    this.className = 'ex has-ask';
    this.dataset['ex'] = ex.id;
    if (ch) this.dataset['ch'] = ch.id;
    this.dataset['ci'] = accentOf(ch);
    this._w = widgetOf(app, ex, {
      locked: () => this.#locked,
      check: () => {
        this._check();
      },
      done: ok => {
        this.#finish(ok, true);
      },
    });
    // the answer gets the focus only when the card is in sight: a lesson with exercises at its end opens at its top
    setTimeout(() => {
      if (!this.isConnected) return;
      const r = this.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= innerHeight) this._w.focus?.();
    }, 50);
  }

  _locked(): boolean {
    return this.#locked;
  }

  /** the card's Check (Enter): a verdict, or "finish first" */
  _check(): void {
    const w = this._w;
    if (this.#locked || w.selfDone || !w.check) return;
    const r = w.check();
    if (r === null) {
      this.#nudge = this.#app.t('engine.ex.finishFirst');
      this.redraw();
      replay(this, 'shake');
      return;
    }
    this.#finish(r, false);
  }

  #finish(ok: boolean, selfReported: boolean): void {
    if (this.#locked) return;
    const app = this.#app,
      ex = this.#ex,
      w = this._w;
    this.#locked = true;
    if (!selfReported) w.reveal?.();
    app.host.feedback.beep(ok ? 'ok' : 'bad');
    const sure = this.#conf;
    const [icon, word] = ok ? pickOne(OK_WORDS) : pickOne(BAD_WORDS);
    this.#outcome = { ok, sure, icon, word };
    this.redraw();
    if (ok) this.classList.add('pop');
    else replay(this, 'shake');
    if (!ex._ai) app.record(ex, ok, sure);
    if (!this.#o.noXP) app.xp(ok ? 4 + ex.difficulty * 4 + (w.bonus?.() ?? 0) : 1, this);
    app.host.feedback.answered(ok, { hard: ex.difficulty >= 3 }); // the character reacts (rarely big)
    this.#o.onDone?.(ok, this);
  }

  /** what the learner entered, as text for the tutor ('' when unknown) */
  #given(): string {
    try {
      return (this._w.given?.() ?? '').slice(0, 3000);
    } catch {
      return '';
    }
  }

  #ask(mode: 'hint' | 'socratic' | 'explain' | null): void {
    this.#app.tutor.askAbout(this.#ex, mode, this.#given());
  }

  override render(): TemplateResult {
    const app = this.#app,
      ex = this.#ex,
      w = this._w;
    const oneTap =
      ONE_TAP.has(ex.type) || (['mcq', 'predict'].includes(ex.type) && Array.isArray(ex.options) && !ex.multi && !Array.isArray(ex.answer));
    const withCheck = !w.selfDone && !w.auto && !oneTap && !this.#locked;
    return html`${this.#head()}
      <div class="q" data-nf="q">${F(ex.q ?? '')}</div>
      ${
        ex.code
          ? html`<div data-nf="code" style="margin:0 0 12px">
              ${codeT(ex.code, ex.lang ?? guessLang(ex.code), app.t('engine.core.copy'))}
            </div>`
          : nothing
      }${ex._ai ? nothing : this.#confidence()}${w.el}
      <div class="actions">
        ${
          withCheck
            ? html`<button
                  class="btn primary"
                  type="button"
                  @click=${() => {
                    this._check();
                  }}
                >
                  ${app.t('engine.ex.check')}</button
                ><span class="tiny">${this.#nudge}</span>`
            : nothing
        }
      </div>
      ${this.#explain()}`;
  }

  #head(): TemplateResult {
    const app = this.#app,
      ex = this.#ex;
    const ch = app.course.chapterOf(ex);
    const sec = app.course.section(ex.section);
    const isNew = !!ex.src && !!ch && ex.src !== (ch as { src?: string }).src && app.isNewSource(ex.src);
    const showSec = !!this.#o.showSection && !!sec && !!ch;
    const who = app.host.frame.character();
    const askLabel = app.L('askTutor');
    return html`<div class="exhead">
      <span class="pill c">${typeLabel(app, ex.type)}</span
      ><span class="diff" title=${app.t('engine.ex.difficulty', { n: ex.difficulty })}
        >${[1, 2, 3].map(i => html`<i class=${i <= ex.difficulty ? 'on' : ''}></i>`)}</span
      >${ex.tags.filter(t => t !== 'concept').map(t => html`<span class="pill">${tagLabel(app, t)}</span>`)}${
        isNew ? html`<span class="newpill">✨ ${app.t('engine.src.new')}</span>` : nothing
      }${
        ex._ai
          ? html`<span class="pill" style="background:var(--violet-bg);color:var(--violet-ink)">✨ ${app.t('engine.ex.aiMade')}</span>`
          : nothing
      }${showSec ? html`<span class="tiny" style="margin-inline-start:auto">${app.chTitle(ch.num, sec.title)}</span>` : nothing}<button
        class="exask"
        type="button"
        title=${askLabel}
        aria-label=${askLabel}
        style=${`margin-inline-start:${showSec ? '8px' : 'auto'}`}
        @click=${(e: Event) => {
          e.stopPropagation();
          this.#ask(null);
        }}
      >
        ${who.face ? html`<span class="exface" aria-hidden="true">${M(who.face)}</span>` : html`<span aria-hidden="true">${who.avatar}</span>`}<span
          class="lbl"
          >${askLabel}</span
        ></button
      >${ex._ai ? nothing : this.#flag()}
    </div>`;
  }

  /** "How sure?": three quiet chips above the answer; optional, kept with the answer (state.res[id].conf) */
  #confidence(): TemplateResult {
    const app = this.#app;
    return html`<div class="confrow${this.#locked ? ' locked' : ''}" role="group" aria-label=${app.t('engine.ex.conf')}>
      <span class="tiny">${app.t('engine.ex.conf')}</span>${CONF_LEVELS.map(
        ([k, dots]) =>
          html`<button
            class="confchip"
            type="button"
            aria-pressed=${String(this.#conf === k)}
            data-k=${k}
            title=${app.t(`engine.ex.conf_${k}`)}
            @click=${() => {
              if (this.#locked) return;
              this.#conf = this.#conf === k ? null : k;
              this.redraw();
            }}
          >
            <span aria-hidden="true">${dots}</span><span class="lbl">${app.t(`engine.ex.conf_${k}`)}</span>
          </button>`,
      )}
    </div>`;
  }

  /** ⚑ a problem with this exercise: kept in the subject's state (state.flags[id]) for the next revision of the pack */
  #flag(): TemplateResult {
    const app = this.#app,
      ex = this.#ex;
    const done = !!app.state.flags?.[ex.id];
    return html`<button
      class="exflag${done ? ' on' : ''}"
      type="button"
      title=${done ? app.t('engine.ex.reported') : app.t('engine.ex.report')}
      aria-label=${app.t('engine.ex.report')}
      @click=${(e: Event) => {
        e.stopPropagation();
        this.#report();
      }}
    >
      ⚑
    </button>`;
  }

  #report(): void {
    const app = this.#app,
      ex = this.#ex;
    app.host.frame.modal((box, close) => {
      let why: string | null = app.state.flags?.[ex.id]?.why ?? null;
      const note = app.state.flags?.[ex.id]?.note ?? '';
      const draw = (): void => {
        render(
          html`<h3>⚑ ${app.t('engine.ex.reportTitle')}</h3>
            <div class="opts">
              ${REPORT_REASONS.map(
                r =>
                  html`<button
                    class="opt${r === why ? ' sel' : ''}"
                    type="button"
                    @click=${() => {
                      why = r;
                      draw();
                    }}
                  >
                    <span>${app.t(`engine.ex.report_${r}`)}</span>
                  </button>`,
              )}
            </div>
            <textarea
              class="answer"
              rows="3"
              placeholder=${app.t('engine.ex.reportNote')}
              aria-label=${app.t('engine.ex.reportNote')}
              .value=${note}
            ></textarea>
            <div class="row" style="margin-top:14px;justify-content:flex-end">
              <button class="btn" type="button" @click=${close}>${app.t('engine.core.cancel')}</button>
              <button
                class="btn primary"
                type="button"
                @click=${() => {
                  const opts = box.querySelector('.opts');
                  if (!why) {
                    if (opts) replay(opts, 'shake');
                    return;
                  }
                  const nt = (box.querySelector('textarea')?.value ?? '').trim().slice(0, 2000);
                  app.host.learn('exercise.flagged', ex.id, { why, ...(nt ? { note: nt } : {}) });
                  close();
                  this.redraw();
                  app.toast(`⚑ ${app.t('engine.ex.reportSaved')}`);
                }}
              >
                ${app.t('engine.ex.reportSend')}
              </button>
            </div>`,
          box,
        );
      };
      draw();
    });
  }

  /** after the answer: the verdict, the explanation, the source, and the tutor's help after a mistake */
  #explain(): TemplateResult | typeof nothing {
    const r = this.#outcome;
    if (!r) return nothing;
    const app = this.#app,
      ex = this.#ex;
    const who = app.host.frame.character();
    return html`<div class="explain ${r.ok ? 'ok' : 'bad'}">
      <div class="hd">${r.icon} ${app.t(`engine.ex.${r.ok ? 'ok' : 'bad'}.${r.word}`)}</div>
      <div data-nf="explain">${F(ex.explain ?? '')}</div>
      ${
        r.sure === 'sure' && !r.ok
          ? html`<div class="tiny confnote">⚠️ ${app.t('engine.ex.confWrong')}</div>`
          : r.sure === 'guess' && r.ok
            ? html`<div class="tiny confnote">🎲 ${app.t('engine.ex.confLucky')}</div>`
            : nothing
      }${this.#cite()}${
        r.ok
          ? nothing
          : html`<div class="row" style="margin-top:10px">
              <button
                class="btn small ai"
                type="button"
                @click=${() => {
                  this.#ask('socratic');
                }}
              >
                ${who.avatar} ${app.t('engine.ex.helpSocratic')}
              </button>
              <button
                class="btn small"
                type="button"
                @click=${() => {
                  this.#ask('explain');
                }}
              >
                💡 ${app.t('engine.ex.explainDiff')}
              </button>
            </div>`
      }
    </div>`;
  }

  /** where the exercise comes from (cite: lineage, never in the text): a small chip after the answer that opens the source at that page */
  #cite(): TemplateResult | typeof nothing {
    const app = this.#app,
      c = this.#ex.cite;
    const s = c?.src ? app.course.source(c.src) : undefined;
    if (!c?.src || !s) return nothing;
    const src = c.src;
    const page = Number(PAGE_RE.exec(c.loc ?? '')?.[1] ?? 0) || null;
    const label = (s.short ?? s.title) + (c.loc ? ` · ${c.loc}` : '');
    return html`<div class="srcrefs excite">
      <button
        class="srcref"
        type="button"
        title=${app.t('engine.ex.citeOpen')}
        @click=${() => {
          app.viewer.open(src, { page });
        }}
      >
        <span class="e">${s.emoji ?? '📘'}</span><span>${label}</span>
      </button>
    </div>`;
  }
}
tag('study-ex-card', ExerciseCard);

/** the card element the screens mount */
export type CardElement = ExerciseCard;

/** The screens' one entry point: the card, drawn at once. */
export function exerciseCard(app: StudyApp, ex: Exercise, o: CardOptions = {}): CardElement {
  return new ExerciseCard(app, ex, o).redraw();
}

/** the exercise as context for the AI (with its section's notes) */
export function exerciseText(app: StudyApp, ex: Exercise): string {
  return exerciseAsText(ex, app.host.media, app.course.section(ex.section), b => app.host.activities.asText(b));
}
