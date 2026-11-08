/**
 * #/lightning[/<chapter>]: true or false against the clock (60 seconds; ← true, → false), then what fooled the learner.
 * The page before it picks the chapters.
 */
import type { Exercise } from '../../domain/pack.ts';
import { HOME, type StudyApp } from '../app.ts';
import { replay, shuffle } from '../dom.ts';
import { F, html, M, show, StudyPage, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { accentOf, askButton, setAccent } from '../parts.ts';
import { fmt } from '../text.ts';

const SECONDS = 60;

/** #/lightning: the chapters to play, the best score, ▶ */
export function lightningView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.lightning')]], back: HOME });
  const all = app.t('engine.light.allChapters');
  const page = new StudyPage(
    app,
    () =>
      html`<div class="card lightning">
        <div style="font-size:56px">⚡</div>
        <h1>${app.t('view.lightning')}</h1>
        <p class="muted">${app.t('engine.light.intro')}</p>
        <div class="row" style="justify-content:center;margin:14px 0">
          <select class="sel" aria-label=${all}>
            <option value="all">${all}</option>
            ${app.course.chapters.map(c => html`<option value=${c.id}>${c.emoji ?? ''} ${app.chShort(c.num)} ${c.title}</option>`)}
          </select>
        </div>
        <p class="tiny">${app.t('engine.light.best', { n: app.state.bestLightning ?? 0 })}</p>
        <button
          class="btn primary"
          type="button"
          @click=${() => {
            playLightning(app, page.querySelector('select')?.value ?? 'all');
          }}
        >
          ▶ ${app.t('engine.light.go')}
        </button>
      </div>`,
  );
  show(app, page);
}

/** the game over a chapter's true-or-false exercises (all: every chapter's) */
export function playLightning(app: StudyApp, chid: string): void {
  const pool = shuffle(app.course.exercises.filter(e => e.type === 'tf' && (chid === 'all' || app.course.chapterOf(e)?.id === chid)));
  if (!pool.length) {
    app.toast(app.t('engine.light.noTf'));
    app.go(HOME);
    return;
  }
  const c0 = app.course.chapter(chid);
  app.host.frame.chrome({
    sub: true,
    crumbs: c0 ? [[`${c0.emoji ?? ''} ${c0.title}`, `#/ch/${chid}`], [app.t('home.lightning')]] : [[app.t('home.lightning')]],
    back: c0 ? `#/ch/${chid}/traps` : '#/lightning',
    reading: true,
  });
  show(app, new StudyLightning(app, chid, pool));
}

/** One game: the clock, the statement, 👍 / 👎 (and ← / →); at 0 the result. */
export class StudyLightning extends StudyScreen {
  readonly #chid: string;
  readonly #pool: readonly Exercise[];
  readonly #here = location.hash;
  readonly #end: number;
  readonly #wrong: Exercise[] = [];
  #i = 0;
  #score = 0;
  #left = SECONDS;
  #warned = false;
  /** the result once the time is up (pb: a new best) */
  #result: { readonly pb: boolean } | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  /** "Ask <character>" about the statement on screen */
  readonly #ask: HTMLElement;
  readonly #keys = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft') this.#answer(true);
    if (e.key === 'ArrowRight') this.#answer(false);
  };

  constructor(app: StudyApp, chid: string, pool: readonly Exercise[]) {
    super(app);
    this.#chid = chid;
    this.#pool = pool;
    this.#end = app.clock.now() + SECONDS * 1e3;
    const who = app.host.frame.character();
    this.#ask = askButton(who.face, who.avatar, app.L('askTutor'), () => {
      app.tutor.askAbout(this.#at, null);
    });
    document.addEventListener('keydown', this.#keys);
    this.#timer = setInterval(() => {
      this.#tick();
    }, 200);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stop();
  }

  get #at(): Exercise {
    return this.#pool[this.#i % this.#pool.length] as Exercise;
  }

  #stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    document.removeEventListener('keydown', this.#keys);
  }

  #answer(v: boolean): void {
    if (this.#result || this.#timer === null) return;
    const ex = this.#at,
      fb = this.app.host.feedback;
    const ok = v === ex.answer;
    if (ok) {
      this.#score++;
      fb.beep('ok');
    } else {
      this.#wrong.push(ex);
      fb.beep('bad');
    }
    this.app.record(ex, ok);
    this.#i++;
    this.redraw();
    const stmt = this.querySelector('.stmt');
    if (stmt) replay(stmt, ok ? 'pop' : 'shake');
  }

  #tick(): void {
    if (location.hash !== this.#here) {
      this.#stop();
      return;
    }
    const app = this.app,
      fb = app.host.feedback;
    const left = Math.max(0, Math.ceil((this.#end - app.clock.now()) / 1000));
    if (left !== this.#left) {
      this.#left = left;
      this.redraw();
    }
    if (left <= 5 && left > 0) {
      if (!this.#warned) {
        this.#warned = true;
        fb.big('timer');
      } else fb.tick(left);
    }
    if (left) return;
    this.#stop();
    const score = this.#score;
    app.xp(score * 3, this.querySelector('.clock'));
    const pb = score > (app.state.bestLightning ?? 0);
    app.host.learn('drill.scored', null, { kind: 'lightning', score });
    if (!this.#wrong.length && score >= 5 && fb.reacts) fb.big('timerwin');
    else if (score >= 8 || pb) fb.confetti();
    fb.beep('win');
    this.#result = { pb };
    this.redraw();
    scrollTo({ top: 0 });
  }

  protected page(): TemplateResult {
    return this.#result ? this.#over(this.#result.pb) : this.#playing();
  }

  #playing(): TemplateResult {
    const app = this.app,
      ex = this.#at;
    return html`<div class="runner lightning has-ask">
      ${this.#ask}
      <div class="clock" role="timer">${app.nf(this.#left)}</div>
      <div class="stmt" aria-live="polite" data-ci=${accentOf(app.course.chapterOf(ex))}><div>${F(ex.q)}</div></div>
      <div class="tfrow">
        <button
          class="tfbtn t"
          type="button"
          @click=${() => {
            this.#answer(true);
          }}
        >
          👍 ${app.t('engine.ex.true')} ←
        </button>
        <button
          class="tfbtn f"
          type="button"
          @click=${() => {
            this.#answer(false);
          }}
        >
          → 👎 ${app.t('engine.ex.false')}
        </button>
      </div>
      <div style="margin-top:12px"><div class="tiny">${app.t('engine.light.score', { n: this.#score })}</div></div>
    </div>`;
  }

  #over(pb: boolean): TemplateResult {
    const app = this.app,
      c0 = app.course.chapter(this.#chid);
    const wrong = this.#wrong;
    return html`<div class="runner">
      <div class="card summary">
        <div class="big">${pb ? '🏅' : '⚡'}</div>
        <h2>${app.t(pb ? 'engine.light.resultBest' : 'engine.light.result', { n: this.#score })}</h2>
        ${
          wrong.length
            ? html`<div style="text-align:start;margin-top:16px;display:grid;gap:10px">
                <b>${app.t('engine.light.fooled')}</b>
                ${wrong.map(
                  ex =>
                    html`<div class="explain bad">
                      <div class="hd">${ex.answer ? app.t('engine.light.TRUE') : app.t('engine.light.FALSE')}</div>
                      <div>${M(`<b>${fmt(ex.q)}</b>`)}</div>
                      <div style="margin-top:4px">${F(ex.explain)}</div>
                    </div>`,
                )}
              </div>`
            : html`<p>${app.t('engine.light.flawless')}</p>`
        }
        <div class="row" style="justify-content:center;margin-top:18px">
          <button
            class="btn primary"
            type="button"
            @click=${() => {
              playLightning(app, this.#chid);
            }}
          >
            ⚡ ${app.t('engine.light.again')}
          </button>
          <button
            class="btn"
            type="button"
            @click=${() => {
              app.go(c0 ? `#/ch/${this.#chid}/traps` : HOME);
            }}
          >
            ${c0 ? app.L('back') : app.t('engine.light.home')}
          </button>
        </div>
      </div>
    </div>`;
  }
}
tag('study-lightning', StudyLightning);
