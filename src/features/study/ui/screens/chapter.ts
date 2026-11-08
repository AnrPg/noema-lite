/**
 * A chapter (#/ch/<id>[/<tab>[/<focus>]]): Theory (its sections as a path), Practice (every way to practise it, the
 * round's filters with "only my level", its cards and drills) and Traps. The old Cards and Debug-drill tabs live inside
 * Practice; their addresses still work.
 */
import type { ChapterView } from '../../domain/course.ts';
import type { Chapter, Exercise } from '../../domain/pack.ts';
import type { StudyApp } from '../app.ts';
import type { MenuEntry } from '../host.ts';
import { knowledgeMap } from '../kmap.ts';
import { F, html, nothing, show, StudyElement, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { setAccent } from '../parts.ts';
import { typeLabel } from '../exercise/card.ts';
import { flashDeck, drillList } from './cards.ts';
import { newBadge, openSearch, sprintEntry } from './home.ts';
import { animateRings, choiceList, explainable, filled, lockNoteT, ring, showHit } from '../view.ts';

const chSocratic = (app: StudyApp, c: Chapter): void => {
  app.tutor.open({ kind: 'chapter', id: c.id, origin: { via: 'chapterSocratic', ch: c.id } }, 'socratic', null, {
    intent: app.tutor.intent('chSocratic'),
  });
};

function chapterMenu(app: StudyApp, c: Chapter): () => (MenuEntry | null)[] {
  const who = app.host.frame.character();
  return () => [
    {
      label: app.L('chSocratic'),
      sub: app.L('chSocraticSub'),
      icon: who.avatar,
      run: () => {
        chSocratic(app, c);
      },
    },
    {
      label: app.L('searchSubject'),
      icon: 'search',
      run: () => {
        openSearch(app);
      },
    },
    {
      label: app.L('sources'),
      sub: app.L('sourcesSub'),
      icon: 'book',
      run: () => {
        app.sourcesUi.toggleDeck();
      },
    },
    c.map?.learnables?.length
      ? {
          label: app.t('engine.kmap.title'),
          sub: app.t('engine.kmap.menuSub'),
          icon: 'map',
          run: () => {
            knowledgeMap(app, c.id);
          },
        }
      : null,
    sprintEntry(app),
    '-',
    { label: app.L('allChapters'), icon: 'list', href: '#/subject' },
  ];
}

/** → the next chapter; after the last one, the next step of the Roadmap this subject teaches (on its map) */
function nextAfterChapter(app: StudyApp, c: Chapter): unknown {
  const all = app.course.chapters;
  const nx = all[all.findIndex(x => x.id === c.id) + 1];
  const btn = (title: string, label: string, href: string): TemplateResult =>
    html`<button
      class="btn nextch"
      type="button"
      title=${title}
      @click=${() => {
        app.go(href);
      }}
    >
      ${`${label} ${app.arrowOn}`}
    </button>`;
  if (nx) return btn(nx.title, app.L('nextChapterBtn', { title: nx.title }), `#/ch/${nx.id}`);
  const step = app.host.roadmap.nextStep();
  return step ? btn(step.title, app.L('nextStepBtn', { title: step.title }), step.href) : nothing;
}

/** #/ch/<id>[/<tab>] */
export class StudyChapter extends StudyScreen {
  readonly #c: ChapterView;
  readonly #tab: string;
  readonly #on: string;
  #chips: HTMLElement | null | undefined;
  #fill: HTMLElement | null = null;

  constructor(app: StudyApp, c: ChapterView, tab: string) {
    super(app);
    this.#c = c;
    this.#tab = tab;
    this.#on = ['debug', 'cards', 'filters'].includes(tab) ? 'practice' : ['learn', 'practice', 'traps'].includes(tab) ? tab : 'learn';
  }

  protected page(): TemplateResult {
    const app = this.app,
      c = this.#c,
      on = this.#on;
    const p = app.progress(c);
    const tabs = [
      ['learn', app.t('ch.learn'), c.sections.length],
      ['practice', app.t('ch.practice'), c.exercises.length],
      ['traps', app.t('ch.traps'), c.pitfalls.length],
    ] as const;
    if (this.#chips === undefined) {
      const full = app.course.full.find(x => x.id === c.id) ?? null;
      this.#chips = full ? app.sourcesUi.chips(full) : null;
    }
    return html`<div class="chhead">
        <div class="emo">${c.emoji ?? ''}</div>
        <div class="grow">
          <div class="num">${app.L('chOf', { n: c.num, of: app.course.chapters.length })}</div>
          <h1>${c.title}</h1>
          ${c.subtitle ? html`<p class="muted" style="margin:6px 0 0">${c.subtitle}</p>` : nothing} ${this.#chips ?? nothing}
          ${
            c.map?.learnables?.length
              ? html`<button
                  class="kmapbtn"
                  type="button"
                  @click=${() => {
                    knowledgeMap(app, c.id);
                  }}
                >
                  ⓘ ${app.t('engine.kmap.chip', { n: c.map.learnables.length })}
                </button>`
              : nothing
          }
        </div>
        <div class="chring">
          ${ring((p.sr + p.ex) / 2, 76, 9)}
          <div class="chringc">${app.pct(Math.round((p.sr + p.ex) * 50))}</div>
        </div>
      </div>
      ${
        c.mantra
          ? html`<div
              class="mantrabox"
              ${explainable(app, () => ({
                label: c.mantra ?? '',
                text: `The mental model of chapter ${String(c.num)} "${c.title}": ${c.mantra ?? ''}`, // for the AI (English)
                ch: c,
                what: 'mental model',
              }))}
            >
              <span>🧭</span><span>${F(c.mantra)}</span>
            </div>`
          : nothing
      }
      <div class="tabs" role="tablist">
        ${tabs.map(
          ([k, l, n]) =>
            html`<button
              class=${on === k ? 'on' : ''}
              type="button"
              role="tab"
              aria-selected=${String(on === k)}
              @click=${() => {
                app.go(`#/ch/${c.id}/${k}`);
              }}
            >
              ${l}<span class="n">${app.nf(n)}</span>
            </button>`,
        )}
      </div>
      <div>${on === 'learn' ? this.#learn() : on === 'practice' ? this.#practice() : this.#traps()}</div>`;
  }

  #learn(): TemplateResult {
    const app = this.app,
      c = this.#c,
      S = app.state;
    const nextSec = c.sections.find(s => !S.read[s.id]);
    const who = app.host.frame.character();
    const go = (href: string) => () => {
      app.go(href);
    };
    return html`<details class="obj">
        <summary>🎯 ${app.L('objectives')} ▸</summary>
        <ul>
          ${c.objectives.map(o => html`<li>${F(o)}</li>`)}
        </ul>
      </details>
      <div class="path">
        ${c.sections.map((s, i) => {
          const nEx = c.exercises.filter(e => e.section === s.id),
            nOk = nEx.filter(e => app.solved(e.id)).length;
          return html`<button
            class="node${S.read[s.id] ? ' done' : ''}"
            type="button"
            style="animation-delay:${i * 35}ms"
            @click=${go(`#/s/${s.id}`)}
          >
            <div class="dot">${S.read[s.id] ? '✓' : app.nf(i + 1)}</div>
            <div class="grow"><b>${s.title}</b><small>${s.hook ?? ''}</small></div>
            <div class="meta">
              ${newBadge(app, s, false)}<span class="pill${nOk === nEx.length && nEx.length ? ' c' : ''}"
                >🎯 ${app.nf(nOk)}/${app.nf(nEx.length)}</span
              >
            </div>
          </button>`;
        })}
      </div>
      <div class="row" style="margin-top:22px">
        ${
          nextSec
            ? html`<button class="btn primary" type="button" @click=${go(`#/s/${nextSec.id}`)}>
                ${c.sections[0] && S.read[c.sections[0].id] ? app.L('continueSec', { title: nextSec.title }) : app.L('startReading')}
              </button>`
            : html`<button class="btn primary" type="button" @click=${go(`#/ch/${c.id}/practice`)}>🎯 ${app.L('practiceChapter')}</button>`
        }
        ${nextAfterChapter(app, c)}
        <button
          class="btn ghost"
          type="button"
          @click=${() => {
            chSocratic(app, c);
          }}
        >
          ${`${who.avatar} ${app.L('chSocratic')}`}
        </button>
      </div>`;
  }

  #practice(): unknown {
    const app = this.app,
      c = this.#c,
      tab = this.#tab;
    if (app.lock) return lockNoteT(app);
    if (tab === 'practice') return chapterPractice(app, c);
    if (tab === 'filters') {
      const f = new StudyRoundFilters(app, c);
      f.redraw();
      return html`${this.#subBack()}${f}`;
    }
    // the cards and the drills draw themselves into their box (screens/cards.ts)
    this.#fill ??= filled(box => {
      if (tab === 'debug') drillList(app, box, c.debug);
      else flashDeck(app, box, app.cards([c]));
    });
    return html`${this.#subBack()}${this.#fill}`;
  }
  #subBack(): TemplateResult {
    return html`<button
      class="linkish subback"
      type="button"
      @click=${() => {
        this.app.go(`#/ch/${this.#c.id}/practice`);
      }}
    >
      ‹ ${this.app.L('allWays')}
    </button>`;
  }

  #traps(): TemplateResult {
    const app = this.app,
      c = this.#c;
    const traps = c.exercises.filter(e => e.tags.some(t => ['pitfall', 'exam'].includes(t))),
      tf = c.exercises.filter(e => e.type === 'tf');
    return html`<p class="muted">${app.L('trapsIntro')}</p>
      <div class="row" style="margin-bottom:14px">
        ${
          traps.length
            ? html`<button
                class="btn primary"
                type="button"
                @click=${() => {
                  app.startRound(traps, {
                    title: `⚠️ ${app.L('trapDrill')} · ${app.chShort(c.num)}`,
                    count: 12,
                    back: `#/ch/${c.id}/traps`,
                  });
                }}
              >
                ⚠️ ${app.L('trapsNoTimer')}
              </button>`
            : nothing
        }
        ${
          tf.length >= 3
            ? html`<button
                class="btn"
                type="button"
                @click=${() => {
                  app.go(`#/lightning/${c.id}`);
                }}
              >
                ⚡ ${app.L('trapsTimed')}
              </button>`
            : nothing
        }
      </div>
      <div style="display:grid;gap:10px">
        ${c.pitfalls.map(
          (p, i) =>
            html`<div
              class="callout pitfall"
              data-pid=${app.host.trapId(p)}
              style="animation:slideIn .4s ${i * 30}ms both"
              ${explainable(app, () => ({
                label: p.title,
                text: `${p.title}: ${p.text}${p.fix ? ` — Fix: ${p.fix}` : ''}`,
                ch: c,
                what: 'trap',
              }))}
            >
              <span class="ci">⚠️</span><b class="t">${F(p.title)}</b>
              <div>${F(p.text)}</div>
              ${p.fix ? html`<div style="margin-top:6px">✅ ${M2(app.t('engine.ch.fixHtml', { fix: '\u0000' }), p.fix)}</div>` : nothing}
            </div>`,
        )}
      </div>`;
  }
}
tag('study-chapter', StudyChapter);

/** a message with markup around one pack text: the text goes in as safe markup (the rest is the catalog's) */
function M2(message: string, text: string): unknown {
  const [a = '', b = ''] = message.split('\u0000');
  return html`${a}${F(text)}${b}`;
}

export function chapterView(app: StudyApp, id: string, tab0?: string, focus?: string): void {
  const c = app.course.chapter(id);
  if (!c) {
    app.go('#/subject');
    return;
  }
  setAccent(document.body, c);
  if (app.state.lastChapter !== id) app.host.learn('chapter.opened', id);
  app.tutor.setContext({ kind: 'chapter', id });
  const tab = tab0 ?? app.chapterTab.get(id) ?? 'learn';
  app.chapterTab.set(id, tab);
  app.host.frame.chrome({
    sub: true,
    crumbs: [[`${c.emoji ?? ''} ${c.title}`]],
    back: '#/subject',
    corner: true,
    menu: chapterMenu(app, c),
  });
  app.host.frame.noteRecent({ chNum: c.num, chOf: app.course.chapters.length });
  const v = show(app, new StudyChapter(app, c, tab));
  animateRings(v);
  if (focus && tab === 'traps') showHit(v.querySelector(`[data-pid="${CSS.escape(focus)}"]`));
}

/** the Practice tab: every way to practise this chapter */
function chapterPractice(app: StudyApp, c: Chapter): TemplateResult {
  const id = c.id,
    ok = c.exercises.filter(e => app.solved(e.id)).length,
    wrong = c.exercises.filter(e => app.state.res[e.id]?.last === false);
  const dueC = app.dueCards([c]);
  const dueD = c.debug.filter(d => app.drillDue(d)).length;
  const who = app.host.frame.character();
  const S = app.state;
  return choiceList(app, [
    c.exercises.length
      ? {
          label: app.L('round10'),
          sub: app.L('solvedOf', { n: ok, of: c.exercises.length }),
          icon: '🎯',
          cls: 'main',
          run: () => {
            app.startRound(c.exercises, { title: `🎯 ${app.chTitle(c.num, c.title)}`, count: 10, back: `#/ch/${id}/practice` });
          },
        }
      : null,
    c.exercises.length ? { label: app.L('chooseRound'), sub: app.L('chooseRoundSub'), icon: '🎛️', href: `#/ch/${id}/filters` } : null,
    c.flashcards.length
      ? {
          label: app.t('home.cards'),
          sub: app.t('home.cardsSub'),
          icon: '🃏',
          href: `#/ch/${id}/cards`,
          badge: dueC ? app.t('home.due', { n: dueC }) : app.nf(c.flashcards.length),
        }
      : null,
    c.debug.length
      ? {
          label: app.t('home.drills'),
          sub: app.t('home.drillsSub'),
          icon: '🔧',
          href: `#/ch/${id}/debug`,
          badge: dueD ? app.t('home.due', { n: dueD }) : app.nf(c.debug.length),
        }
      : null,
    wrong.length
      ? {
          label: app.t('home.mistakes'),
          sub: app.t('home.mistakesSub'),
          icon: '🔁',
          badge: app.nf(wrong.length),
          run: () => {
            app.startRound(wrong, {
              title: `🔁 ${app.t('engine.run.chMistakes', { num: c.num })}`,
              count: wrong.length,
              back: `#/ch/${id}/practice`,
            });
          },
        }
      : null,
    c.exercises.length
      ? {
          label: S.boss[id] ? app.L('bossBeaten') : app.L('boss'),
          sub: app.L('bossSub'),
          icon: S.boss[id] ? '🏆' : '👾',
          href: `#/boss/${id}`,
        }
      : null,
    {
      label: app.L('chSocratic'),
      sub: app.L('chSocraticSub'),
      icon: who.avatar,
      run: () => {
        chSocratic(app, c);
      },
    },
  ]);
}

/** "Only my level": the learner's choice, offered when the subject has a level ladder with content at several levels */
export function levelChip(app: StudyApp, onChange: () => void): unknown {
  const me = app.myLevel();
  if (!me || !app.offersLevelFilter()) return nothing;
  return html`<div class="fchips">
    <button
      class="fchip mylevel${app.onlyMyLevel ? ' on' : ''}"
      type="button"
      aria-pressed=${String(app.onlyMyLevel)}
      title=${app.t('ui.study.myLevelTip')}
      @click=${() => {
        app.onlyMyLevel = !app.onlyMyLevel;
        onChange();
      }}
    >
      🎚️ ${app.t('ui.study.onlyMyLevel', { level: me.name })}
    </button>
  </div>`;
}

const FOCUS = [
  ['pitfall', '⚠️'],
  ['debug', '🔧'],
  ['exam', '🎓'],
  ['syntax', '⌨️'],
  ['calc', '🧮'],
  ['interview', '🎤'],
  ['compare', '⚖️'],
] as const;

/** the round's filters: section, types, focus, difficulty, size, and the learner's level */
class StudyRoundFilters extends StudyElement {
  readonly #app: StudyApp;
  readonly #c: Chapter;
  #sec = 'all';
  readonly #types = new Set<string>();
  readonly #tags = new Set<string>();
  #diff = 0;
  #count = 10;
  constructor(app: StudyApp, c: Chapter) {
    super();
    this.#app = app;
    this.#c = c;
  }
  #pool(): Exercise[] {
    const p = this.#c.exercises.filter(
      e =>
        (this.#sec === 'all' || e.section === this.#sec) &&
        (!this.#types.size || this.#types.has(e.type)) &&
        (!this.#tags.size || e.tags.some(t => this.#tags.has(t))) &&
        (!this.#diff || e.difficulty === this.#diff),
    );
    return this.#app.onlyMyLevel ? this.#app.atMyLevel(p) : p;
  }
  #chipset(items: readonly (readonly [string, string])[], set: Set<string>): TemplateResult {
    return html`<div class="fchips">
      ${items.map(
        ([k, l]) =>
          html`<button
            class="fchip${set.has(k) ? ' on' : ''}"
            type="button"
            aria-pressed=${String(set.has(k))}
            @click=${() => {
              if (set.has(k)) set.delete(k);
              else set.add(k);
              this.redraw();
            }}
          >
            ${l}
          </button>`,
      )}
    </div>`;
  }
  #one<T>(items: readonly (readonly [T, string])[], cur: T, set: (v: T) => void): TemplateResult {
    return html`<div class="fchips">
      ${items.map(
        ([v, l]) =>
          html`<button
            class="fchip${v === cur ? ' on' : ''}"
            type="button"
            @click=${() => {
              set(v);
              this.redraw();
            }}
          >
            ${l}
          </button>`,
      )}
    </div>`;
  }
  override render(): TemplateResult {
    const app = this.#app,
      c = this.#c;
    const p = this.#pool();
    const types = [...new Set(c.exercises.map(e => e.type))];
    const level = levelChip(app, () => this.redraw());
    return html`<div class="card filters">
      <div>
        <div class="lbl">${app.t('engine.prac.section')}</div>
        <select
          class="sel"
          aria-label=${app.t('engine.prac.section')}
          @change=${(e: Event) => {
            this.#sec = (e.target as HTMLSelectElement).value;
            this.redraw();
          }}
        >
          <option value="all">${app.t('engine.prac.allSections')}</option>
          ${c.sections.map(s => html`<option value=${s.id}>${s.title}</option>`)}
        </select>
      </div>
      <div>
        <div class="lbl">${app.t('engine.prac.types')}</div>
        ${this.#chipset(
          types.map(t => [t, typeLabel(app, t)] as const),
          this.#types,
        )}
      </div>
      <div>
        <div class="lbl">${app.t('engine.prac.focus')}</div>
        ${this.#chipset(
          FOCUS.map(([k, i]) => [k, `${i} ${app.t(`engine.prac.focus_${k}`)}`] as const),
          this.#tags,
        )}
      </div>
      <div>
        <div class="lbl">${app.t('engine.prac.difficulty')}</div>
        ${this.#one(
          [
            [0, app.t('engine.prac.any')],
            [1, `● ${app.t('engine.prac.easy')}`],
            [2, `●● ${app.t('engine.prac.medium')}`],
            [3, `●●● ${app.t('engine.prac.hard')}`],
          ],
          this.#diff,
          d => {
            this.#diff = d;
          },
        )}
      </div>
      <div>
        <div class="lbl">${app.t('engine.prac.roundSize')}</div>
        ${this.#one(
          [
            [5, app.nf(5)],
            [10, app.nf(10)],
            [20, app.nf(20)],
            [999, `∞ ${app.t('engine.prac.all')}`],
          ],
          this.#count,
          n => {
            this.#count = n;
          },
        )}
      </div>
      ${
        level === nothing
          ? nothing
          : html`<div>
              <div class="lbl">${app.t('ui.study.level')}</div>
              ${level}
            </div>`
      }
      <div class="row">
        <button
          class="btn primary"
          type="button"
          @click=${() => {
            const pool = this.#pool();
            if (!pool.length) {
              app.toast(app.t('engine.prac.noMatch'));
              return;
            }
            app.startRound(pool, {
              title: `🎯 ${app.t('engine.run.chPractice', { num: c.num })}`,
              count: this.#count,
              back: `#/ch/${c.id}/practice`,
            });
          }}
        >
          ▶ ${app.t('engine.prac.start')}
        </button>
        <span class="tiny">${app.t('engine.prac.match', { n: p.length, solved: p.filter(e => app.solved(e.id)).length })}</span>
      </div>
    </div>`;
  }
}
tag('study-round-filters', StudyRoundFilters);
