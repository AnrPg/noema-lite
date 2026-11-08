/**
 * The subject's page (#/subject): where the learner is (a Roadmap's step, the bar), Continue, Practice ▾, what is new,
 * and the chapters as cards or as a list; its ⋮ holds the search, the sources, the knowledge map, the reported
 * exercises, the focus sprint, what the other areas add, and the reset.
 */
import { sectionText } from '../../domain/as-text.ts';
import type { StudyApp } from '../app.ts';
import type { Chapter } from '../../domain/pack.ts';
import type { MenuEntry, MenuItem } from '../host.ts';
import { knowledgeMap, reportedView } from '../kmap.ts';
import { F, html, nothing, show, StudyElement, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { accentOf, setAccent } from '../parts.ts';
import { animateRings, growBars, practiceButton } from '../view.ts';

/** 🎯 Practice ▾: every way to practise the whole subject */
export function practiceItems(app: StudyApp): (MenuEntry | null)[] {
  if (app.lock) {
    const list = app.lock.missing.join(', ') || '…';
    return [
      {
        label: app.L('exercisesWord'),
        sub: app.L('exLocked', { list }),
        icon: '🔒',
        run: () => {
          app.toast(`🔒 ${app.L('lockedPreview')}`, 4000);
        },
      },
    ];
  }
  const dueFc = app.dueCards(),
    duePb = app.dueDrills(),
    wrong = app.mistakes().length;
  const who = app.host.frame.character();
  return [
    { label: app.t('home.mixed'), sub: app.t('home.mixedSub'), icon: '🎲', href: '#/practice/all' },
    {
      label: app.t('home.cards'),
      sub: app.t('home.cardsSub'),
      icon: '🃏',
      href: '#/cards',
      badge: dueFc ? app.t('home.due', { n: dueFc }) : null,
      tone: 4,
    },
    app.course.chapters.some(c => c.debug.length)
      ? {
          label: app.t('home.drills'),
          sub: app.t('home.drillsSub'),
          icon: '🔧',
          href: '#/drills',
          badge: duePb ? app.t('home.due', { n: duePb }) : null,
          tone: 4,
        }
      : null,
    {
      label: app.t('home.mistakes'),
      sub: app.t('home.mistakesSub'),
      icon: '🔁',
      href: '#/mistakes',
      badge: wrong ? app.nf(wrong) : null,
      tone: 3,
    },
    { label: app.t('home.lightning'), sub: app.t('home.lightningSub'), icon: '⚡', href: '#/lightning' },
    '-',
    {
      label: app.L('askTutor'),
      sub: app.L(who.plural ? 'askTutorSubPl' : 'askTutorSub'),
      icon: who.avatar,
      run: () => {
        app.tutor.open(null, 'socratic', null, { intent: app.tutor.intent('course') });
      },
    },
  ];
}

/** ⋮ of the subject: everything that is not studying itself */
export function subjectMenu(app: StudyApp): () => (MenuEntry | null)[] {
  return () => [
    {
      label: app.L('searchSubject'),
      icon: 'search',
      run: () => {
        openSearch(app);
      },
    },
    app.newSources().length ? { label: app.t('view.whatsNew'), icon: 'spark', href: '#/new' } : null,
    {
      label: app.L('sources'),
      sub: app.L('sourcesSub'),
      icon: 'book',
      run: () => {
        app.sourcesUi.toggleDeck();
      },
    },
    app.course.chapters.some(c => c.map?.learnables?.length)
      ? {
          label: app.t('engine.kmap.title'),
          sub: app.t('engine.kmap.menuSub'),
          icon: 'map',
          run: () => {
            knowledgeMap(app);
          },
        }
      : null,
    Object.keys(app.state.flags ?? {}).length
      ? {
          label: app.t('engine.flags.menu', { n: Object.keys(app.state.flags ?? {}).length }),
          icon: 'help',
          run: () => {
            reportedView(app);
          },
        }
      : null,
    sprintEntry(app),
    '-',
    ...app.host.subjectActions.menu(),
    '-',
    {
      label: app.L('resetProgress', { title: app.host.subject.title }),
      icon: 'close',
      danger: true,
      run: () => {
        resetProgress(app);
      },
    },
  ];
}

/** ⏱️ the focus sprint's ⋮ entry */
export const sprintEntry = (app: StudyApp): MenuItem => ({
  label: app.sprintLeft !== null ? app.L('focusStop') : app.L('focusSprint'),
  sub: app.L('focusSprintSub'),
  icon: 'clock',
  run: () => {
    app.toggleSprint();
  },
});

/** Starts the subject again: a restore point first, then every answer, card and read mark is gone (its settings stay). */
export function resetProgress(app: StudyApp): void {
  const title = app.host.subject.title;
  void app.host.frame.confirm(app.t('engine.home.resetConfirm', { title })).then(async yes => {
    if (!yes) return;
    await app.host.restorePoint(app.t('engine.home.resetPoint', { title }));
    app.host.learn('subject.reset', null);
    app.host.flush();
    app.rerender();
  });
}

/** 🔎 jump to any concept of the subject */
export function openSearch(app: StudyApp): void {
  app.host.frame.sheet(app.L('searchSubject'), (body, close) => {
    const s = new StudySearch(app, close);
    s.redraw();
    body.append(s);
    setTimeout(() => {
      s.querySelector('input')?.focus();
    }, 50);
  });
}

interface Found {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly text: string;
}
let searchIndex: { readonly course: unknown; readonly items: Found[] } | null = null;
function searchSections(app: StudyApp, q0: string): (Found & { sc: number })[] | null {
  const q = q0.trim().toLowerCase();
  if (q.length < 2) return null;
  if (searchIndex?.course !== app.course)
    searchIndex = {
      course: app.course,
      items: app.course.chapters.flatMap(c =>
        c.sections.map(s => {
          const text = sectionText(s, app.host.media, b => app.host.activities.asText(b));
          return { id: s.id, title: s.title.toLowerCase(), body: text.toLowerCase(), text };
        }),
      ),
    };
  const words = q.split(/\s+/);
  return searchIndex.items
    .map(x => {
      let sc = 0;
      for (const w of words) {
        if (x.title.includes(w)) sc += 10;
        const n = x.body.split(w).length - 1;
        if (!n) return null;
        sc += Math.min(n, 8);
      }
      return { ...x, sc };
    })
    .filter(x => x !== null)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 7);
}

/** the search in the subject (its sheet's body) */
class StudySearch extends StudyElement {
  readonly #app: StudyApp;
  readonly #close: () => void;
  #q = '';
  constructor(app: StudyApp, close: () => void) {
    super();
    this.#app = app;
    this.#close = close;
  }
  override render(): TemplateResult {
    const app = this.#app;
    const ex = app.host.subject.searchExamples;
    return html`<div class="search">
        <span class="si">🔎</span
        ><input
          class="noema-input"
          placeholder=${`${app.L('searchConcept')}${ex ? ` (${ex})` : ''}`}
          aria-label=${app.L('searchSubject')}
          @input=${(e: Event) => {
            this.#q = (e.target as HTMLInputElement).value;
            this.redraw();
          }}
        />
      </div>
      <div class="results">${this.#results()}</div>`;
  }
  #results(): unknown {
    const app = this.#app;
    const res = searchSections(app, this.#q);
    if (!res) return nothing;
    if (!res.length) {
      const who = app.host.frame.character();
      return html`<div class="tiny">${app.t('engine.search.none', { tutor: who.name, avatar: who.avatar })}</div>`;
    }
    const first = this.#q.trim().toLowerCase().split(/\s+/)[0] ?? '';
    return res.map((r, i) => {
      const s = app.course.section(r.id);
      const c = s && app.course.chapterOf(s);
      if (!s || !c) return nothing;
      const pos = r.body.indexOf(first);
      const snip = r.text.slice(Math.max(0, pos - 50), pos + 90).replace(/\s+/g, ' ');
      return html`<button
        class="result"
        type="button"
        style="animation-delay:${i * 30}ms"
        @click=${() => {
          this.#close();
          app.go(`#/s/${s.id}`);
        }}
      >
        <b>${`${c.emoji ?? ''} ${s.title}`}</b><small>${app.chTitle(c.num, `…${snip}…`)}</small>
      </button>`;
    });
  }
}
tag('study-search', StudySearch);

const CHVIEW_KEY = 'noema-chview';
/** the learner's choice of list or cards (a device preference; a private window keeps it for this page only) */
function rememberView(k: 'list' | 'cards'): boolean {
  try {
    localStorage.setItem(CHVIEW_KEY, k);
    return true;
  } catch {
    return false;
  }
}
function chapterViewStyle(): 'list' | 'cards' {
  try {
    return localStorage.getItem(CHVIEW_KEY) === 'list' ? 'list' : 'cards'; // cards unless the learner chose the list
  } catch {
    return 'cards';
  }
}

/** a chapter's "new" corner (a new source's chapter, or new content in it) */
export function newBadge(app: StudyApp, x: { readonly isNew?: boolean; readonly newWhole?: boolean }, chapter: boolean): unknown {
  if (!x.isNew) return nothing;
  if (chapter)
    return html`<span class="newpill corner">✨ ${x.newWhole ? app.t('engine.src.newChapter') : app.t('engine.src.newContent')}</span>`;
  return html`<span class="newpill">✨ ${app.t('engine.src.new')}</span>`;
}

/** #/subject */
export class StudyHome extends StudyScreen {
  #style = chapterViewStyle();
  #practice: HTMLElement | null = null;
  #tags: readonly Node[] | null = null;

  protected page(): TemplateResult {
    const app = this.app;
    const S = app.state,
      subj = app.host.subject;
    const p = app.courseProgress();
    const last = S.last ? app.course.section(S.last) : undefined;
    const first = app.course.chapters[0]?.sections[0];
    const nSec = app.course.chapters.reduce((a, c) => a + c.sections.length, 0);
    const st = app.station();
    const pr = { r: Math.round(p.sr * 100), e: Math.round(p.ex * 100) };
    const mantra = subj.hero?.mantra ?? subj.description;
    const barW = st ? Math.round(Math.min(st.read, st.solved / st.pass) * 100) : Math.round((p.sr + p.ex) * 50);
    const barTip = st
      ? st.done
        ? app.L('stationDone')
        : app.L('stationMastery', { ...pr, p: Math.round(st.pass * 100) })
      : app.L('subjProgress', pr);
    const go = (href: string) => () => {
      app.go(href);
    };
    this.#practice ??= practiceButton(app, practiceItems(app));
    this.#tags ??= app.host.frame.subjectTags();
    // one plain header (a step of which Roadmap · the title · one line · one bar)
    return html`<section class="subjhead${st ? ' station' : ''}">
        ${
          st
            ? html`<button
                class="ns-kicker subjkicker"
                type="button"
                title=${app.L('openMap')}
                @click=${() => {
                  app.host.roadmap.openMap();
                }}
              >
                ${app.L('stationOf', { title: st.title })} ›
              </button>`
            : nothing
        }
        <h1 class="herohead">${subj.title}${this.#tags}</h1>
        ${mantra ? html`<p class="mantra">${F(mantra)}</p>` : nothing}
        <div class="subjbar" title=${barTip}>
          <div class="bar"><i style="width:${barW}%"></i></div>
          <span class="tiny">${st?.done ? `✓ ${app.L('stationMastered')}` : app.L('subjProgress', pr)}</span>
        </div>
        <div class="row subjgo">
          ${
            last
              ? html`<button class="btn primary" type="button" @click=${go(`#/s/${last.id}`)}>
                  ${app.L('continueSec', { title: last.title })}
                </button>`
              : first
                ? html`<button class="btn primary" type="button" @click=${go(`#/s/${first.id}`)}>${app.L('startCh1')}</button>`
                : nothing
          }
          ${this.#practice} ${app.sourcesUi.whatsNewButton()}
        </div>
      </section>
      <div class="row chlisthead">
        <h2 class="grow">${app.t('home.chapters')}</h2>
        <span class="tiny hide-s">${app.L('subjCounts', { c: app.course.chapters.length, s: nSec, e: app.course.exercises.length })}</span>
        <div class="ns-seg small chviewseg" role="radiogroup" aria-label=${app.L('chView')}>
          ${(['list', 'cards'] as const).map(
            k =>
              html`<button
                type="button"
                data-v=${k}
                class=${this.#style === k ? 'on' : ''}
                role="radio"
                aria-checked=${String(this.#style === k)}
                @click=${() => {
                  this.#style = k;
                  rememberView(k);
                  this.redraw();
                  growBars(this);
                }}
              >
                ${k === 'list' ? app.L('viewList') : app.L('viewCards')}
              </button>`,
          )}
        </div>
      </div>
      <div class="chbox">${this.#style === 'cards' ? this.#cards() : this.#list()}</div>`;
  }

  #cards(): TemplateResult {
    const app = this.app,
      S = app.state;
    return html`<div class="chapters">
      ${app.course.chapters.map(
        (c, i) =>
          html`<button
            class="chcard"
            type="button"
            data-ci=${accentOf(c)}
            style="animation-delay:${i * 40}ms"
            @click=${() => {
              app.go(`#/ch/${c.id}`);
            }}
          >
            ${newBadge(app, c, true)}
            <div class="emo">${c.emoji ?? ''}</div>
            <div class="num">${`${app.L('chapterN', { n: c.num })}${S.boss[c.id] ? ' · 🏆' : ''}`}</div>
            <h3>${c.title}</h3>
            <p>${c.subtitle ?? ''}</p>
            ${this.#bars(c)}
          </button>`,
      )}
    </div>`;
  }
  #bars(c: Chapter): TemplateResult {
    const app = this.app,
      cp = app.progress(c);
    return html`<div class="bars">
      <div class="barlbl"><span>📖 ${app.L('theory')}</span><span>${app.pct(Math.round(cp.sr * 100))}</span></div>
      <div class="bar"><i style="width:0%" data-w="${cp.sr * 100}%"></i></div>
      <div class="barlbl"><span>🎯 ${app.L('practice')}</span><span>${app.pct(Math.round(cp.ex * 100))}</span></div>
      <div class="bar alt"><i style="width:0%" data-w="${cp.ex * 100}%"></i></div>
    </div>`;
  }

  #list(): TemplateResult {
    const app = this.app,
      S = app.state;
    return html`<div class="chlist">
      ${app.course.chapters.map((c, i) => {
        const cp = app.progress(c),
          pct = Math.round((cp.sr + cp.ex) * 50);
        return html`<button
          class="chrow${pct >= 100 ? ' done' : ''}"
          type="button"
          data-ci=${accentOf(c)}
          style="animation-delay:${i * 25}ms"
          @click=${() => {
            app.go(`#/ch/${c.id}`);
          }}
        >
          <span class="emo">${c.emoji ?? ''}</span>
          <span class="grow"
            ><small>${app.L('chapterN', { n: c.num })}${S.boss[c.id] ? ' · 🏆' : ''}</small><b>${c.title}</b>${
              c.subtitle ? html`<small class="sub">${c.subtitle}</small>` : nothing
            }</span
          >
          ${newBadge(app, c, true)}
          <span class="chpct"
            ><span class="minibar"><i style="width:${pct}%"></i></span><small>${app.pct(pct)}</small></span
          >
        </button>`;
      })}
    </div>`;
  }
}
tag('study-home', StudyHome);

export function homeView(app: StudyApp): void {
  app.tutor.setContext(null);
  setAccent(document.body, null);
  app.host.frame.chrome({ crumbs: [], corner: true, menu: subjectMenu(app) });
  app.host.frame.noteRecent({});
  const v = show(app, new StudyHome(app));
  growBars(v);
  animateRings(v);
}
