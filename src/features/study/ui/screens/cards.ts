/**
 * Flashcards (#/cards[/<key>]) and debug drills (#/drills, #/drill/<id>): both scheduled by FSRS-6
 * (domain/fsrs.ts). state.fc and state.pb hold each card's and drill's memory; an entry still in the old Leitner shape
 * is read as the memory it stands for and replaced at its next review.
 *
 * Light-DOM elements on the study base (lit/base.ts): the deck (`study-flash-deck`), a drill's tile and the list of a
 * chapter's drills (the chapter and the section show them too), and the three pages.
 */
import { keyed } from 'lit/directives/keyed.js';
import { cardRating, playbookRating } from '../../domain/events/types.ts';
import type { Drill, Exercise } from '../../domain/pack.ts';
import type { CardItem, StudyApp } from '../app.ts';
import { exerciseCard } from '../exercise/card.ts';
import { codeT, F, html, M, nothing, ref, show, StudyElement, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { accentOf, setAccent } from '../parts.ts';

/** A card rated (0 again, 1 good, 2 easy): a card.reviewed event with its FSRS rating (the log folds state.fc). */
export function rateCard(app: StudyApp, key: string, q: 0 | 1 | 2): void {
  app.host.learn('card.reviewed', key, { rating: cardRating(q) });
}

/** the frame's quiet "Ask <character>" on a card: the face alone, its name on hover or focus */
function askT(app: StudyApp, run: () => void): TemplateResult {
  const who = app.host.frame.character(),
    label = app.L('askTutor');
  return html`<button
    class="exask"
    type="button"
    title=${label}
    aria-label=${label}
    @click=${(e: Event) => {
      e.stopPropagation();
      run();
    }}
  >
    ${
      who.face ? html`<span class="exface" aria-hidden="true">${M(who.face)}</span>` : html`<span aria-hidden="true">${who.avatar}</span>`
    }<span class="lbl">${label}</span>
  </button>`;
}

/** Ask the character about a flashcard: a hint while its answer is hidden, a deeper explanation once it is turned. */
function askAboutCard(app: StudyApp, c: CardItem, turned: boolean): void {
  // the card as context for the AI (English)
  const ctx = {
    kind: 'exercise' as const,
    id: `fc:${c.key}`,
    origin: { via: turned ? 'cardExplain' : 'cardHint', card: c.key, ...(c.section ? { sec: c.section } : {}) },
    text: `Flashcard (chapter ${String(c.chapter.num)} “${c.chapter.title}”)\nFront: ${String(c.q)}\nBack: ${String(c.a)}`,
  };
  if (turned) app.tutor.open(ctx, 'explain', app.t('engine.aimsg.cardExplain'));
  else app.tutor.open(ctx, 'hint', app.t('engine.aimsg.cardHint'), { intent: app.tutor.intent('exHint', '') });
}

/** Fits the FSRS parameters to the learner's reviews again once enough new ones came (quietly, nothing to wait for). */
function refitFsrs(app: StudyApp): void {
  void app.host.refitFsrs(app.state.settings.fsrs ?? null).then(r => {
    if (!r) return;
    const keep = app.state.settings.fsrs?.retention;
    app.state.settings.fsrs = { parameters: r.parameters, ...(keep ? { retention: keep } : {}), n: r.n };
    app.host.save();
  });
}

export interface DeckOptions {
  /** every card given (the ones the search found), due or not */
  readonly all?: boolean;
  /** what follows the last card (a round made from search results: its next part) */
  readonly onDone?: () => unknown;
}

/** A deck of flashcards: the counts, one card at a time (tap to turn), and Again · Good · Easy. */
export class StudyFlashDeck extends StudyElement {
  readonly #app: StudyApp;
  readonly #queue: CardItem[];
  readonly #due: number;
  readonly #fresh: number;
  readonly #resting: number;
  readonly #onDone: (() => unknown) | undefined;
  #i = 0;
  #flipped = false;

  constructor(app: StudyApp, cards: readonly CardItem[], o: DeckOptions = {}) {
    super();
    this.#app = app;
    const deck = app.deck(cards, o.all ? { all: true } : {});
    this.#queue = deck.queue;
    this.#due = deck.due;
    this.#fresh = deck.fresh;
    this.#resting = deck.resting;
    this.#onDone = o.onDone;
  }

  #flip(): void {
    this.#flipped = !this.#flipped;
    this.redraw();
  }

  #rate(c: CardItem, q: 0 | 1 | 2): void {
    const app = this.#app;
    rateCard(app, c.key, q);
    app.xp(q === 0 ? 1 : 2, this.querySelector('.flash'));
    if (q === 0) this.#queue.push(c);
    this.#i++;
    this.#flipped = false;
    if (this.#i >= this.#queue.length) {
      app.host.feedback.confetti(80);
      refitFsrs(app);
    }
    this.redraw();
  }

  override render(): TemplateResult {
    const app = this.#app;
    return html`<div class="row deckcounts">
        <span class="pill c">${app.t('engine.cards.due', { n: this.#due })}</span>
        <span class="pill">${app.t('engine.cards.new', { n: this.#fresh })}</span>
        <span class="pill">${app.t('engine.cards.resting', { n: this.#resting })}</span>
      </div>
      <div>${this.#card()}</div>`;
  }

  #card(): unknown {
    const app = this.#app,
      queue = this.#queue,
      i = this.#i,
      c = queue[i];
    if (!c)
      return html`<div class="empty">
          <div class="e">🌟</div>
          <p>${app.t('engine.cards.done')}</p>
        </div>
        ${this.#onDone ? this.#onDone() : nothing}`;
    const sec = c.section ? app.course.section(c.section) : undefined;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.key === ' ' || e.key === 'Enter') && e.target === e.currentTarget) {
        e.preventDefault();
        e.stopPropagation();
        this.#flip();
      }
    };
    // a new .flash for every card (keyed): the next card never turns back on screen
    return keyed(
      i,
      html`<div class="flash has-ask${this.#flipped ? ' flipped' : ''}" data-card=${c.key} data-ci=${accentOf(c.chapter)}>
          <div
            class="inner"
            role="button"
            tabindex="0"
            aria-label=${app.t('engine.cards.flip')}
            @click=${() => {
              this.#flip();
            }}
            @keydown=${onKey}
          >
            <div class="face">
              <small>${`${c.chapter.emoji ?? ''} ${app.chTitle(c.chapter.num, `${app.nf(i + 1)}/${app.nf(queue.length)}`)}`}</small>
              <div data-nf="q">${F(c.q)}</div>
              <div class="tiny flipnote">${app.t('engine.cards.flip')}</div>
            </div>
            <div class="face back">
              <small>${app.t('engine.cards.answer')}</small>
              <div data-nf="a">${F(c.a)}</div>
            </div>
          </div>
          ${askT(app, () => {
            askAboutCard(app, c, this.#flipped);
          })}
        </div>
        <div class="rate">
          <button
            class="btn"
            type="button"
            @click=${() => {
              this.#rate(c, 0);
            }}
          >
            😵 ${app.t('engine.cards.again')}
          </button>
          <button
            class="btn"
            type="button"
            @click=${() => {
              this.#rate(c, 1);
            }}
          >
            🙂 ${app.t('engine.cards.good')}
          </button>
          <button
            class="btn primary"
            type="button"
            @click=${() => {
              this.#rate(c, 2);
            }}
          >
            😎 ${app.t('engine.cards.easy')}
          </button>
        </div>
        ${
          sec
            ? html`<div class="deckopen">
                <button
                  class="tiny linkish"
                  type="button"
                  @click=${() => {
                    app.go(`#/s/${sec.id}`);
                  }}
                >
                  ${app.t('engine.cards.openSection')}
                </button>
              </div>`
            : nothing
        }`,
    );
  }
}
tag('study-flash-deck', StudyFlashDeck);

/** Puts a deck of flashcards into `body` (the chapter's Cards tab, a search round's cards); → the deck. */
export function flashDeck(app: StudyApp, body: HTMLElement, cards: readonly CardItem[], o: DeckOptions = {}): StudyFlashDeck {
  const deck = new StudyFlashDeck(app, cards, o).redraw();
  body.append(deck);
  return deck;
}

/** #/cards[/<key>]: every card of the course (the due ones first), or the one card the search found */
class StudyCardsPage extends StudyScreen {
  readonly #deck: StudyFlashDeck;
  constructor(app: StudyApp, key?: string) {
    super(app);
    const one = key ? app.cards().filter(c => c.key === key) : [];
    this.#deck = (one.length ? new StudyFlashDeck(app, one, { all: true }) : new StudyFlashDeck(app, app.cards())).redraw();
  }
  protected page(): unknown {
    const app = this.app;
    return html`<h1>${app.t('view.cards')}</h1>
      <p class="muted">${app.t('engine.cards.intro')}</p>
      ${this.#deck}`;
  }
}
tag('study-cards-page', StudyCardsPage);

export function cardsView(app: StudyApp, key?: string): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.cards')]], back: '#/subject' });
  show(app, new StudyCardsPage(app, key));
}

/* ---------- debug drills ---------- */

/** A drill's tile: its title, how many questions, its mastery (0–5: the interval reached, on the old boxes' scale). */
export class StudyDrillTile extends StudyElement {
  readonly #app: StudyApp;
  readonly #d: Drill;
  constructor(app: StudyApp, d: Drill) {
    super();
    this.#app = app;
    this.#d = d;
  }
  override render(): TemplateResult {
    const app = this.#app,
      d = this.#d;
    const box = app.drillBox(d);
    const ch = app.course.chapterOf(d);
    const isNew = !!d.src && !!ch && d.src !== (ch as { src?: string }).src && app.isNewSource(d.src);
    return html`<button
      class="pb"
      type="button"
      data-ci=${accentOf(ch)}
      @click=${() => {
        app.go(`#/drill/${d.id}`);
      }}
    >
      <span class="ic" aria-hidden="true">🔧</span>
      <div class="grow">
        <b>${F(d.title)}</b>${isNew ? html`<span class="newpill">✨ ${app.t('engine.src.new')}</span>` : nothing}
        <div class="tiny">${app.t(d.mnemonic ? 'engine.drill.questionsMnemo' : 'engine.drill.questions', { n: d.askYourself.length })}</div>
      </div>
      <div class="boxes" title=${app.t('engine.drill.mastery')}>
        ${[1, 2, 3, 4, 5].map(i => html`<i class=${i <= box ? 'on' : ''}></i>`)}
      </div>
    </button>`;
  }
}
tag('study-drill-tile', StudyDrillTile);

export function drillTile(app: StudyApp, d: Drill): StudyDrillTile {
  return new StudyDrillTile(app, d).redraw();
}

/** A chapter's drills: the next due one first, then every tile. */
export class StudyDrillList extends StudyElement {
  readonly #app: StudyApp;
  readonly #list: readonly Drill[];
  constructor(app: StudyApp, list: readonly Drill[]) {
    super();
    this.#app = app;
    this.#list = list;
  }
  override render(): TemplateResult {
    const app = this.#app;
    const due = this.#list.filter(d => app.drillDue(d));
    const first = due[0];
    return html`<p class="muted">${app.t('engine.drill.intro')}</p>
      <div class="row drillnext">
        ${
          first
            ? html`<button
                class="btn primary"
                type="button"
                @click=${() => {
                  app.go(`#/drill/${first.id}`);
                }}
              >
                ▶ ${app.t('engine.drill.nextDue', { n: due.length })}
              </button>`
            : html`<span class="pill rested">${app.t('engine.drill.allRested')}</span>`
        }
      </div>
      <div class="drilltiles">${this.#list.map(d => drillTile(app, d))}</div>`;
  }
}
tag('study-drill-list', StudyDrillList);

/** Puts a chapter's drills into `body` (the chapter's Drills tab); → the list. */
export function drillList(app: StudyApp, body: HTMLElement, list: readonly Drill[]): StudyDrillList {
  const el = new StudyDrillList(app, list).redraw();
  body.append(el);
  return el;
}

/** #/drills: every chapter's drills */
class StudyDrillsPage extends StudyScreen {
  protected page(): unknown {
    const app = this.app;
    const n = app.course.chapters.reduce((a, c) => a + c.debug.length, 0);
    return html`<h1>${app.t('view.drills')}</h1>
      <p class="muted">${app.t('engine.drill.playbooks', { n })}</p>
      <div>
        ${app.course.chapters
          .filter(c => c.debug.length)
          .map(
            c =>
              html`<h3 class="drillch">${`${c.emoji ?? ''} ${app.chTitle(c.num, c.title)}`}</h3>
                <div class="drilltiles">${c.debug.map(d => drillTile(app, d))}</div>`,
          )}
      </div>`;
  }
}
tag('study-drills-page', StudyDrillsPage);

export function drillsView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.drills')]], back: '#/subject' });
  show(app, new StudyDrillsPage(app));
}

type Graded = { readonly score: number; readonly hit: readonly number[]; readonly feedback: string };

/** #/drill/<id>: the symptom, the learner's own checklist, then the steps, the causes and the fix, and how well it went */
class StudyDrillPage extends StudyScreen {
  readonly #d: Drill;
  readonly #cid: string;
  /** what is under the buttons: nothing yet, the order exercise, or the answer revealed (with the AI's grade) */
  #stage:
    | { readonly kind: 'none' }
    | { readonly kind: 'order'; readonly card: HTMLElement }
    | {
        readonly kind: 'reveal';
        readonly g: Graded | null;
        readonly md: HTMLElement | null;
      } = { kind: 'none' };
  #grading = false;
  #answer: HTMLTextAreaElement | null = null;
  #stageEl: HTMLElement | null = null;

  constructor(app: StudyApp, d: Drill, chapterId: string) {
    super(app);
    this.#d = d;
    this.#cid = chapterId;
  }

  #reveal(g: Graded | null): void {
    this.#grading = false;
    this.#stage = { kind: 'reveal', g, md: g ? this.app.ai.md(g.feedback) : null };
    this.redraw();
    this.#stageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  #order(): void {
    const app = this.app,
      d = this.#d;
    const ex: Exercise = {
      id: `${d.id}-ord`,
      type: 'order',
      q: app.t('engine.drill.orderQ'),
      items: d.askYourself.slice(0, 9),
      explain: app.t('engine.drill.orderExplain'),
      difficulty: 2,
      tags: ['debug'],
      _ai: true,
      section: d.section ?? '',
    };
    this.#stage = { kind: 'order', card: exerciseCard(app, ex) };
    this.redraw();
  }

  async #grade(): Promise<void> {
    const ta = this.#answer;
    if (!ta) return;
    if (!ta.value.trim()) {
      ta.classList.add('shake');
      setTimeout(() => {
        ta.classList.remove('shake');
      }, 500);
      return;
    }
    this.#grading = true;
    this.redraw();
    try {
      this.#reveal(await this.app.ai.drillGrade(this.#d, ta.value));
    } catch (er) {
      this.app.toast(`⚠️ ${this.app.errText(er)}`, 4000);
      this.#reveal(null);
    }
  }

  #rated(q: 0 | 1 | 2): void {
    const app = this.app,
      d = this.#d,
      cid = this.#cid;
    const checks = [...this.querySelectorAll<HTMLInputElement>('.rubric input[type=checkbox]')];
    const ticked = checks.filter(x => x.checked).length / Math.max(1, checks.length);
    // blank → again, partly → hard, nailed → easy with most of the checklist ticked, else good
    app.host.learn('playbook.reviewed', d.id, { rating: playbookRating(q, ticked), score: ticked });
    app.xp(3 + Math.round(ticked * 7), this.#stageEl);
    if (q === 2) app.host.feedback.confetti(70);
    const others = app.course.chapters.flatMap(x => x.debug).filter(x => x.id !== d.id && app.drillDue(x));
    const nxt = others.find(x => app.course.chapterOf(x)?.id === cid) ?? others[0];
    app.toast(nxt ? app.t('engine.drill.savedNext') : app.t('engine.drill.saved'));
    setTimeout(() => {
      app.go(nxt ? `#/drill/${nxt.id}` : `#/ch/${cid}/debug`);
    }, 700);
  }

  protected page(): unknown {
    const app = this.app,
      d = this.#d,
      id = d.id;
    const who = app.host.frame.character();
    return html`<div class="reader">
      <span class="pill c">🔧 ${app.t('engine.drill.pill')}</span>
      <h1 class="drilltitle">${F(d.title)}</h1>
      <div class="tiny drilllbl">${app.t('engine.drill.symptom')}</div>
      <div class="symptom">${F(d.symptom)}</div>
      <h3 class="drillh">🧠 ${app.t('engine.drill.askYourself')}</h3>
      <textarea
        class="answer"
        placeholder=${app.t('engine.drill.placeholder')}
        aria-label=${app.t('engine.drill.askYourself')}
        ${ref(el => {
          this.#answer = (el as HTMLTextAreaElement | undefined) ?? null;
        })}
      ></textarea>
      <div class="actions drillacts">
        <button
          class="btn primary"
          type="button"
          @click=${() => {
            this.#reveal(null);
          }}
        >
          👀 ${app.t('engine.drill.reveal')}
        </button>
        <button class="btn ai" type="button" ?disabled=${this.#grading} @click=${() => this.#grade()}>
          ✨ ${this.#grading ? app.t('engine.ex.grading') : app.t('engine.drill.grade')}
        </button>
        <button
          class="btn"
          type="button"
          @click=${() => {
            this.#order();
          }}
        >
          🔢 ${app.t('engine.drill.order')}
        </button>
        <button
          class="btn"
          type="button"
          @click=${() => {
            // the learner's first message: their bubble, in the UI language
            app.tutor.open(
              { kind: 'playbook', id, origin: { via: 'drillRoleplay', drill: id } },
              'debug',
              app.t('engine.aimsg.pbRoleplay', { title: d.title }),
              {
                intent: app.tutor.intent('pbRoleplay'),
              },
            );
          }}
        >
          🎭 ${app.t('engine.drill.roleplay', { tutor: who.name })}
        </button>
      </div>
      <div
        ${ref(el => {
          this.#stageEl = (el as HTMLElement | undefined) ?? null;
        })}
      >
        ${this.#stageT()}
      </div>
    </div>`;
  }

  #stageT(): unknown {
    const st = this.#stage;
    if (st.kind === 'none') return nothing;
    if (st.kind === 'order') return html`<div class="drillorder">${st.card}</div>`;
    const app = this.app,
      d = this.#d,
      g = st.g;
    const hit = new Set(g?.hit ?? []);
    const tone = (s: number): string => (s >= 70 ? 'var(--ok)' : s >= 45 ? 'var(--warn)' : 'var(--bad)');
    const RATES = [
      [`😵 ${app.t('engine.drill.blank')}`, 0],
      [`🤔 ${app.t('engine.drill.partly')}`, 1],
      [`😎 ${app.t('engine.drill.nailed')}`, 2],
    ] as const;
    return html`${
        g
          ? html`<div class="fb ai">
              <div class="row">
                <span class="score" style=${`background:${tone(g.score)}`}>${app.nf(Math.trunc(g.score))}</span>
                <div class="grow">${st.md}</div>
              </div>
            </div>`
          : nothing
      }
      <div class="ask drillcheck">
        <div class="hd">🧠 ${app.t('engine.drill.checklist')}<span class="tiny drilltick">${app.t('engine.drill.tick')}</span></div>
        <div class="rubric">
          ${d.askYourself.map(
            (q, i) =>
              html`<label
                ><input type="checkbox" ?checked=${hit.has(i)} /><span><b>${app.nf(i + 1)}. </b><span>${F(q)}</span></span></label
              >`,
          )}
        </div>
      </div>
      ${
        d.mnemonic
          ? html`<div class="drillhook">
              <div class="tiny drilllbl">${app.t('engine.drill.hook')}</div>
              <div class="mnemo">${F(d.mnemonic)}</div>
            </div>`
          : nothing
      }
      <h3 class="drillh">🛠️ ${app.t('engine.drill.steps')}</h3>
      <div class="steps">
        ${d.steps.map(
          (s, i) =>
            html`<div class="stepc">
              <b>${app.nf(i + 1)}. ${F(s.do)}</b>
              ${s.why ? html`<div class="tiny stepwhy">↳ ${F(s.why)}</div>` : nothing}
              ${s.code ? html`<div class="stepcode">${codeT(s.code, undefined, app.t('engine.core.copy'))}</div>` : nothing}
            </div>`,
        )}
      </div>
      <h3 class="drillh">🎯 ${app.t('engine.drill.causes')}</h3>
      <ul>
        ${d.rootCauses.map(r => html`<li>${F(r)}</li>`)}
      </ul>
      <div class="callout tip drillfix">
        <span class="ci">✅</span><b class="t">${app.t('engine.ex.fix')}</b>
        <div>${F(d.fix)}</div>
      </div>
      <h3 class="drillh">${app.t('engine.drill.howWell')}</h3>
      <div class="row">
        ${RATES.map(
          ([l, q]) =>
            html`<button
              class="btn${q === 2 ? ' primary' : ''}"
              type="button"
              @click=${() => {
                this.#rated(q);
              }}
            >
              ${l}
            </button>`,
        )}
      </div>`;
  }
}
tag('study-drill-page', StudyDrillPage);

export function drillView(app: StudyApp, id: string): void {
  const d = app.course.drill(id);
  const c = d && app.course.chapterOf(d);
  if (!d || !c) {
    app.go('#/drills');
    return;
  }
  setAccent(document.body, c);
  app.tutor.setContext({ kind: 'playbook', id });
  app.host.frame.chrome({
    sub: true,
    crumbs: [
      [`${c.emoji ?? ''} ${c.title}`, `#/ch/${c.id}`],
      [app.t('home.drills'), `#/ch/${c.id}/debug`],
    ],
    back: `#/ch/${c.id}/debug`,
    reading: true,
  });
  show(app, new StudyDrillPage(app, d, c.id));
}
