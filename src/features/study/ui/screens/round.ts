/**
 * #/run: the round in play, one exercise at a time, and its summary. The round is the session's statechart
 * (domain/session.ts: asking → answered → summary, a boss battle's lives, a sibling after a mistake); this page only
 * draws its snapshot and sends ANSWER (the exercise card's verdict) and NEXT.
 */
import { roundResult } from '../../domain/session.ts';
import type { Exercise } from '../../domain/pack.ts';
import { HOME, type Round, type StudyApp } from '../app.ts';
import { exerciseCard } from '../exercise/card.ts';
import { F, html, nothing, show, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { setAccent } from '../parts.ts';

const hearts = (lives: number): string => '❤️'.repeat(Math.max(0, lives)) + '🤍'.repeat(Math.max(0, 3 - lives));

/** #/run: the round of the app (none: back home) */
export function runView(app: StudyApp): void {
  const R = app.round;
  if (!R) {
    app.go(HOME);
    return;
  }
  app.host.frame.chrome({ sub: true, crumbs: [[R.title]], back: R.back, reading: true });
  show(app, new StudyRound(app, R));
}

/** what the summary shows (worked out once, when the round ends) */
interface Summary {
  readonly big: string;
  readonly msg: string;
  readonly ok: number;
  readonly answered: number;
  readonly share: number;
  readonly xp: number;
  readonly wrong: readonly Exercise[];
}

export class StudyRound extends StudyScreen {
  readonly #round: Round;
  /** the index of the exercise drawn, and its card */
  #at = -1;
  #card: HTMLElement | null = null;
  #summary: Summary | null = null;
  #drawn = false;

  constructor(app: StudyApp, round: Round) {
    super(app);
    this.#round = round;
    this.#follow();
  }

  /** Follows the snapshot: a new exercise gets its card (its chapter's colour, the tutor's context); the end, its summary. */
  #follow(): void {
    const { state, context: c } = this.#round.actor.snapshot;
    const ex = c.list[c.i];
    if (state === 'summary' || !ex) {
      this.#summary ??= this.#finish();
    } else if (c.i !== this.#at) {
      this.#at = c.i;
      setAccent(document.body, this.app.course.chapterOf(ex));
      this.app.tutor.setContext({ kind: 'section', id: ex.section });
      this.#card = exerciseCard(this.app, ex, {
        showSection: true,
        onDone: ok => {
          this.#answer(ok);
        },
      });
    } else return;
    if (this.#drawn) scrollTo({ top: 0 });
  }

  #answer(ok: boolean): void {
    this.#round.actor.send({ type: 'ANSWER', ok });
    this.redraw();
    setTimeout(() => {
      this.querySelector('[data-next]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
  }

  #next(): void {
    this.#round.actor.send({ type: 'NEXT' });
    this.#follow();
    this.redraw();
  }

  /** The round's end: its result, and the character's reaction (a boss won, the gym emptied, a perfect round). */
  #finish(): Summary {
    const app = this.app,
      R = this.#round;
    const c = R.actor.snapshot.context;
    const r = roundResult(c);
    const pct = r.share;
    let big = pct >= 0.9 ? '🏆' : pct >= 0.7 ? '🎉' : pct >= 0.5 ? '💪' : '🌱';
    let msg = app.t(
      pct >= 0.9 ? 'engine.run.outstanding' : pct >= 0.7 ? 'engine.run.great' : pct >= 0.5 ? 'engine.run.solid' : 'engine.run.goodStart',
    );
    const reacts = app.host.feedback.reacts;
    const react = (k: string): void => {
      if (reacts) app.host.feedback.big(k);
    };
    if (c.boss !== null) {
      if (r.bossWon) {
        app.host.learn('boss.won', c.boss);
        big = '🏆';
        msg = app.t('engine.run.bossWon');
        react('bosswin');
      } else {
        big = '👾';
        msg = app.t('engine.run.bossLost');
      }
    } else if (R.back === '#/mistakes' && r.ok && !app.mistakes().length)
      react('gym'); // the gym is empty
    else if (r.answered >= 5 && r.ok === r.answered) react('perfect');
    if (pct >= 0.7) {
      if (!reacts) app.host.feedback.confetti();
      app.host.feedback.beep('win');
    }
    return { big, msg, ok: r.ok, answered: r.answered, share: pct, xp: app.state.xp - R.xp0, wrong: c.wrong };
  }

  protected page(): TemplateResult {
    this.#drawn = true;
    return this.#summary ? this.#summaryPage(this.#summary) : this.#asking();
  }

  #asking(): TemplateResult {
    const app = this.app,
      R = this.#round;
    const { state, context: c } = R.actor.snapshot;
    const ex = c.list[c.i];
    const answered = state === 'answered';
    const lastOne = c.i + 1 >= c.list.length;
    const label =
      answered && c.boss !== null && c.lives <= 0
        ? app.t('engine.run.seeResult')
        : lastOne
          ? app.t('engine.run.finish')
          : app.t('engine.run.next');
    return html`<div class="runner">
      <div class="runtop">
        <button
          class="iconbtn"
          type="button"
          title=${app.t('engine.run.quit')}
          aria-label=${app.t('engine.run.quit')}
          @click=${() => {
            app.go(R.back);
          }}
        >
          ✕
        </button>
        <div class="bar"><i style="width:${String((this.#at / c.list.length) * 100)}%"></i></div>
        ${c.boss !== null ? html`<span class="hearts">${hearts(c.lives)}</span>` : nothing}
        <b class="tiny">${app.nf(c.i + 1)}/${app.nf(c.list.length)}</b>
      </div>
      <div class="tiny" style="margin-bottom:8px;font-weight:700">
        ${R.title}${ex && c.siblings.includes(ex.id) ? html`<span class="pill sibpill">↻ ${app.t('engine.run.sibling')}</span>` : nothing}
      </div>
      ${this.#card}
      <div class="row" style="justify-content:flex-end">
        <button
          class="btn primary${answered ? ' pop' : ''}"
          type="button"
          data-next="1"
          style=${answered ? nothing : 'display:none'}
          @click=${() => {
            this.#next();
          }}
        >
          ${label}
        </button>
      </div>
    </div>`;
  }

  #summaryPage(s: Summary): TemplateResult {
    const app = this.app,
      R = this.#round;
    const stat = (value: string, what: string): TemplateResult =>
      html`<div class="stat"><b>${value}</b><span class="tiny">${what}</span></div>`;
    return html`<div class="runner">
      <div class="card summary">
        <div class="big">${s.big}</div>
        <h2>${s.msg}</h2>
        <div class="statgrid">
          ${stat(`${app.nf(s.ok)}/${app.nf(s.answered)}`, app.t('engine.run.correct'))}
          ${stat(app.pct(Math.round(s.share * 100)), app.t('engine.run.accuracy'))} ${stat(`+${app.nf(s.xp)}`, app.t('engine.run.xp'))}
        </div>
        ${
          s.wrong.length
            ? html`<div style="text-align:start;margin:0 0 18px">
                <b>${app.t('engine.run.reviewThese')}</b>
                <ul>
                  ${s.wrong.map(e => html`<li>${F((e.q ?? '').slice(0, 140))}</li>`)}
                </ul>
              </div>`
            : nothing
        }
        <div class="row" style="justify-content:center">
          ${
            s.wrong.length
              ? html`<button
                  class="btn primary"
                  type="button"
                  @click=${() => {
                    app.startRound(s.wrong, { title: `🔁 ${app.t('engine.run.retry')}`, count: s.wrong.length, back: R.back });
                  }}
                >
                  🔁 ${app.t('engine.run.retry')}
                </button>`
              : nothing
          }
          ${
            R.after
              ? html`<button
                  class="btn primary ns-srnext"
                  type="button"
                  @click=${() => {
                    R.after?.run();
                  }}
                >
                  ${R.after.label}
                </button>`
              : nothing
          }
          <button
            class="btn"
            type="button"
            @click=${() => {
              app.go(R.back);
            }}
          >
            ${app.t('engine.run.done')}
          </button>
        </div>
      </div>
    </div>`;
  }
}
tag('study-round', StudyRound);
