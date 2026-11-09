/**
 * The section reader (#/s/<section>[/<block>]): the theory in bite-size chunks (each block with its stable id, its 💡,
 * its "new" mark and its 文A words), then its quick check, its drills, a new question made by the AI, and the way on.
 */
import { blockText } from '../../domain/as-text.ts';
import type { Block, Chapter, Drill, Exercise, Section } from '../../domain/pack.ts';
import type { StudyApp } from '../app.ts';
import { exerciseCard } from '../exercise/card.ts';
import { figureBlock } from '../exercise/visual.ts';
import type { MenuEntry } from '../host.ts';
import { codeT, F, html, nothing, ref, render, show, StudyElement, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { setAccent } from '../parts.ts';
import { explainable, lockNoteT, showHit } from '../view.ts';
import { drillTile } from './cards.ts';
import { openSearch, sprintEntry } from './home.ts';

const CALLOUT_IC: Readonly<Record<string, string>> = {
  key: '🔑',
  pitfall: '⚠️',
  tip: '💡',
  exam: '🎓',
  warn: '🚧',
  analogy: '🧩',
  debug: '🔧',
  interview: '🎤',
};
const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
const rec = (x: unknown): Readonly<Record<string, unknown>> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.map(str) : []);

/** one theory block (its parts carry data-nf: where a ⚑ report and the search point) */
function blockTemplate(app: StudyApp, b: Block, sid: string, made: (b: Block, make: () => HTMLElement) => HTMLElement): unknown {
  const caption = b.caption ? html`<div class="caption" data-nf="caption">${F(b.caption)}</div>` : nothing;
  const items = b.items ?? [];
  switch (b.t) {
    case 'p':
      return html`<p data-nf="text">${F(b.text)}</p>`;
    case 'list': {
      const lis = items.map((x, k) => html`<li data-nf="items.${k}">${F(str(x))}</li>`);
      return b.ordered
        ? html`<ol>
            ${lis}
          </ol>`
        : html`<ul>
            ${lis}
          </ul>`;
    }
    case 'code':
      return html`${codeT(b.code ?? '', b.lang, app.t('engine.core.copy'))}${caption}`;
    case 'figure':
      return made(b, () => figureBlock(app, app.host.media, b));
    case 'interactive':
      return made(b, () => app.host.activities.block(b, sid));
    case 'diagram':
      return html`<div class="diagram" data-nf="text">${b.text ?? ''}</div>
        ${caption}`;
    case 'table':
      return html`<div class="tablewrap">
          <table>
            <thead>
              <tr>
                ${(b.head ?? []).map((x, k) => html`<th data-nf="head.${k}">${F(x)}</th>`)}
              </tr>
            </thead>
            <tbody>
              ${(b.rows ?? []).map(
                (r, j) =>
                  html`<tr>
                    ${r.map((x, k) => html`<td data-nf="rows.${j}.${k}">${F(x)}</td>`)}
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>
        ${caption}`;
    case 'callout':
      return html`<div class="callout ${b.kind ?? ''}">
        <span class="ci">${CALLOUT_IC[b.kind ?? ''] ?? '💡'}</span>${
          b.title ? html`<b class="t" data-nf="title">${F(b.title)}</b>` : nothing
        }
        <div data-nf="text">${F(b.text)}</div>
      </div>`;
    case 'compare':
      return html`<div class="compare">
        ${items.map(
          (it, k) =>
            html`<div data-nf="items.${k}">
              <h4 data-nf="items.${k}.title">${F(str(rec(it)['title']))}</h4>
              <ul>
                ${strs(rec(it)['points']).map((p, j) => html`<li data-nf="items.${k}.points.${j}">${F(p)}</li>`)}
              </ul>
            </div>`,
        )}
      </div>`;
    case 'flow':
      return html`<div class="flow">
          ${items.map(
            (x, k) =>
              html`${k ? html`<span class="ar">→</span>` : nothing}<span class="st" data-nf="items.${k}" style="animation-delay:${k * 70}ms"
                  >${F(str(x))}</span
                >`,
          )}
        </div>
        ${caption}`;
    case 'reveal':
      return made(b, () => new StudyReveal(app, b).redraw());
    case 'ask':
      return made(b, () => new StudyAsk(app, b).redraw());
    case 'terms':
      return html`<div class="terms">
        ${items.map(
          (t, k) =>
            html`<div class="term">
              <b data-nf="items.${k}.term">${F(str(rec(t)['term']))}</b>
              <div class="tiny" data-nf="items.${k}.def" style="color:var(--ink2);font-size:14px">${F(str(rec(t)['def']))}</div>
            </div>`,
        )}
      </div>`;
    default:
      return nothing;
  }
}

/** 🤔 a question whose answer opens (one XP the first time) */
class StudyReveal extends StudyElement {
  readonly #app: StudyApp;
  readonly #b: Block;
  #open = false;
  #paid = false;
  constructor(app: StudyApp, b: Block) {
    super();
    this.#app = app;
    this.#b = b;
    this.className = 'reveal';
  }
  override render(): TemplateResult {
    const b = this.#b;
    return html`<button
        type="button"
        aria-expanded=${String(this.#open)}
        @click=${() => {
          this.#open = !this.#open;
          this.classList.toggle('open', this.#open);
          this.redraw();
          if (this.#open && !this.#paid) {
            this.#paid = true;
            this.#app.xp(1, this);
          }
        }}
      >
        <span>🤔</span><span class="q" data-nf="label">${F(b.label)}</span><span class="chev">▸</span>
      </button>
      <div class="ans" data-nf="text">${F(b.text)}</div>`;
  }
}
tag('study-reveal', StudyReveal);

/** 🧠 ask yourself: questions to answer in the head first (recall mode hides the answers until tapped) */
class StudyAsk extends StudyElement {
  readonly #app: StudyApp;
  readonly #b: Block;
  #recall = false;
  readonly #shown = new Set<number>();
  constructor(app: StudyApp, b: Block) {
    super();
    this.#app = app;
    this.#b = b;
    this.className = 'ask';
  }
  override render(): TemplateResult {
    const app = this.#app,
      b = this.#b;
    return html`<div class="hd">
        🧠<span>${F(b.title ?? app.t('engine.blk.askYourself'))}</span
        ><button
          class="btn small"
          type="button"
          style="margin-left:auto"
          @click=${() => {
            this.#recall = !this.#recall;
            this.classList.toggle('recall', this.#recall);
            this.#shown.clear();
            this.redraw();
          }}
        >
          ${this.#recall ? `👁️ ${app.t('engine.blk.showAll')}` : `🙈 ${app.t('engine.blk.recallMode')}`}
        </button>
      </div>
      <ol>
        ${(b.questions ?? []).map(
          (q, k) =>
            html`<li
              class=${this.#shown.has(k) ? 'shown' : ''}
              data-nf="questions.${k}"
              @click=${() => {
                this.#shown.add(k);
                this.redraw();
              }}
            >
              <span>${F(q)}</span>
            </li>`,
        )}
      </ol>`;
  }
}
tag('study-ask', StudyAsk);

/* the kind of a part, and its text: words of the AI's prompt (English) */
const BLOCK_WHAT: Readonly<Record<string, string>> = {
  p: 'paragraph',
  list: 'list',
  code: 'code example',
  figure: 'figure',
  interactive: 'interactive activity',
  diagram: 'diagram',
  table: 'table',
  callout: 'note',
  compare: 'comparison',
  flow: 'process',
  reveal: 'question',
  ask: 'set of questions',
  terms: 'set of terms',
};
/** 💡 on a block and on its cards and items (compare columns, terms, list items, table rows) */
function explainParts(app: StudyApp, el: HTMLElement, b: Block, s: Section): void {
  const text = (x: Block): string => blockText(x, app.host.media, y => app.host.activities.asText(y));
  const bid = el.dataset['bid'] ?? '';
  const ex = app.tutor.explainable.bind(app.tutor);
  const m = b.media ? app.host.media[b.media] : undefined;
  ex(el, () => ({
    label: b.title ?? b.label ?? b.caption ?? (b.t === 'figure' ? (m?.alt ?? app.t('engine.aimsg.thisFigure')) : text(b)),
    text: text(b),
    sec: s,
    what: BLOCK_WHAT[b.t] ?? 'part of the lesson',
    bid,
  }));
  const items = b.items ?? [];
  if (b.t === 'compare')
    el.querySelectorAll<HTMLElement>('.compare > div').forEach((d, k) => {
      const it = rec(items[k]);
      if (!items[k]) return;
      const title = str(it['title']);
      ex(d, () => ({
        label: title,
        text: `${title}:\n${strs(it['points'])
          .map(p => `- ${p}`)
          .join('\n')}\n\n(Compared with: ${items
          .filter(x => x !== items[k])
          .map(x => str(rec(x)['title']))
          .join(', ')})`,
        sec: s,
        what: 'card',
        bid,
      }));
    });
  if (b.t === 'terms')
    el.querySelectorAll<HTMLElement>('.term').forEach((d, k) => {
      const t = rec(items[k]);
      if (!items[k]) return;
      ex(d, () => ({ label: str(t['term']), text: `${str(t['term'])}: ${str(t['def'])}`, sec: s, what: 'term', bid }));
    });
  if (b.t === 'list')
    el.querySelectorAll<HTMLElement>('li').forEach((d, k) => {
      const x = str(items[k]);
      if (x.length > 30) ex(d, () => ({ label: x, text: `${x}\n\n(One item of the list:\n${text(b)})`, sec: s, what: 'point', bid }));
    });
  if (b.t === 'table')
    el.querySelectorAll<HTMLElement>('tbody tr').forEach((d, k) => {
      const r = b.rows?.[k];
      if (!r) return;
      ex((d.lastElementChild as HTMLElement | null) ?? d, () => ({
        label: r[0] ?? '',
        text: (b.head ?? []).map((hd, j) => `${hd}: ${r[j] ?? ''}`).join('\n'),
        sec: s,
        what: 'row of the table',
        bid,
      }));
    });
}

/** bite-size chunks of about 3–4 blocks (a lone last block joins the chunk before it) */
export function chunkBlocks(blocks: readonly Block[]): Block[][] {
  const out: Block[][] = [];
  let cur: Block[] = [],
    weight = 0;
  for (const b of blocks) {
    const w = b.t === 'list' ? 1.3 : ['code', 'diagram', 'table', 'compare'].includes(b.t) ? 1.6 : 1;
    cur.push(b);
    weight += w;
    if (weight >= 3.6) {
      out.push(cur);
      cur = [];
      weight = 0;
    }
  }
  const lastChunk = out.at(-1);
  if (cur.length) {
    if (lastChunk && cur.length === 1) lastChunk.push(...cur);
    else out.push(cur);
  }
  return out;
}

/** the section's ways to ask the tutor: [the learner's first message (their bubble, in the UI language), the task] */
const SEC_ASK = {
  socratic: ['engine.aimsg.secSocratic', 'secSocratic'],
  debug: ['engine.aimsg.secDebug', 'secDebug'],
  interview: ['engine.aimsg.secInterview', 'secInterview'],
} as const;
function askSection(app: StudyApp, s: Section, mode: keyof typeof SEC_ASK): void {
  const [msg, intent] = SEC_ASK[mode];
  app.tutor.open({ kind: 'section', id: s.id, origin: { via: `section_${mode}`, sec: s.id } }, mode, app.t(msg, { title: s.title }), {
    intent: app.tutor.intent(intent),
  });
}

function sectionMenu(app: StudyApp, s: Section, c: Chapter, tail: () => StudySectionTail | null): () => (MenuEntry | null)[] {
  const who = app.host.frame.character();
  return () => {
    const t = tail();
    return [
      {
        label: app.L('askSocratic'),
        icon: who.avatar,
        run: () => {
          askSection(app, s, 'socratic');
        },
      },
      {
        label: app.L('askDebug'),
        icon: '🔧',
        run: () => {
          askSection(app, s, 'debug');
        },
      },
      {
        label: app.L('askInterview'),
        icon: '🎤',
        run: () => {
          askSection(app, s, 'interview');
        },
      },
      t?.canAsk
        ? {
            label: app.L('askFresh'),
            sub: app.L('askFreshSub'),
            icon: '✨',
            run: () => {
              t.fresh();
            },
          }
        : null,
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
      sprintEntry(app),
      app.host.bridge.menuItem(),
      '-',
      { label: app.L('allSections'), icon: 'list', href: `#/ch/${c.id}` },
    ];
  };
}

/** #/s/<section>[/<block>]: the reader */
export class StudySection extends StudyScreen {
  readonly #s: Section;
  readonly #c: Chapter;
  readonly #bids: readonly string[];
  readonly #chunks: Block[][];
  #shown: number;
  /** the blocks' box: its blocks are drawn into it (render), and 文A decorates their words in place */
  readonly #body = document.createElement('div');
  readonly #made = new Map<Block, HTMLElement>();
  #tail: StudySectionTail | null = null;
  #head: HTMLElement | null = null;

  constructor(app: StudyApp, s: Section, c: Chapter, bid?: string) {
    super(app);
    this.#s = s;
    this.#c = c;
    this.#bids = app.host.blockIds(s.blocks); // stable ids: #/s/<section>/<block> opens exactly that block
    this.#chunks = app.state.settings.chunk ? chunkBlocks(s.blocks) : [[...s.blocks]];
    this.#shown = app.shownChunks.get(s.id) ?? (app.state.read[s.id] ? this.#chunks.length : 1);
    const target = bid ? s.blocks[this.#bids.indexOf(bid)] : undefined; // a found block: every chunk up to it is shown
    if (target) {
      const ci = this.#chunks.findIndex(ch => ch.includes(target));
      if (ci >= 0 && ci + 1 > this.#shown) {
        this.#shown = ci + 1;
        app.shownChunks.set(s.id, this.#shown);
      }
    }
  }
  get tail(): StudySectionTail | null {
    return this.#tail;
  }
  /** the block of a stable id on the page */
  blockEl(bid: string): Element | null {
    return this.#body.querySelector(`[data-bid="${CSS.escape(bid)}"]`);
  }

  protected page(): TemplateResult {
    const app = this.app,
      s = this.#s,
      c = this.#c,
      S = app.state;
    const j = app.course.sectionIndex(s);
    const all = this.#shown >= this.#chunks.length;
    return html`<div class="reader">
      <div class="progressline"><i style="width:${(this.#shown / this.#chunks.length) * 100}%"></i></div>
      <div
        class="sechead"
        ${explainable(app, () => ({
          label: s.title,
          text: `The whole section "${s.title}" — ${s.hook ?? ''} (give me the big picture of this section)`, // for the AI (English)
          sec: s,
          what: 'section',
        }))}
      >
        <div
          class="row"
          ${ref(el => {
            if (el instanceof HTMLElement) this.#head = el;
          })}
        >
          <span class="pill c"
            >${`${app.L('chOf', { n: c.num, of: app.course.chapters.length })} · ${app.L('secOf', { n: j + 1, of: c.sections.length })}`}</span
          >${S.read[s.id] ? html`<span class="pill" style="background:var(--ok-bg);color:var(--ok)">✓ ${app.L('read')}</span>` : nothing}
        </div>
        <h1 style="margin-top:10px">${s.title}</h1>
        ${s.hook ? html`<p class="hook">${F(s.hook)}</p>` : nothing}
      </div>
      ${this.#body}
      <div>${all ? (this.#tail ?? nothing) : this.#more()}</div>
    </div>`;
  }

  #more(): TemplateResult {
    const app = this.app;
    return html`<div class="continue">
      <div class="row">
        <button
          class="btn primary"
          type="button"
          @click=${() => {
            this.#shown++;
            app.shownChunks.set(this.#s.id, this.#shown);
            this.draw(true);
          }}
        >
          ${`${app.L('continueRead')} ▾  (${app.nf(this.#shown)}/${app.nf(this.#chunks.length)})`}
        </button>
        <button
          class="btn ghost small"
          type="button"
          @click=${() => {
            this.#shown = this.#chunks.length;
            app.shownChunks.set(this.#s.id, this.#shown);
            this.draw();
          }}
        >
          ${app.L('showAll')}
        </button>
      </div>
    </div>`;
  }

  /** draws the chunks shown so far (and, after the last, the section's end) */
  draw(scroll = false): void {
    const app = this.app,
      s = this.#s,
      c = this.#c,
      S = app.state;
    const shown = this.#chunks.slice(0, this.#shown);
    const made = (b: Block, make: () => HTMLElement): HTMLElement => {
      let el = this.#made.get(b);
      if (!el) {
        el = make();
        this.#made.set(b, el);
      }
      return el;
    };
    render(
      html`${shown.map((ch, ci) =>
        ch.map((b, i) => {
          const isNew = !!b.src && b.src !== c.src && app.isNewSource(b.src);
          return html`<div
            class="blk b-${b.t}${isNew ? ' is-new' : ''}"
            data-bid=${this.#bids[s.blocks.indexOf(b)] ?? ''}
            style="animation-delay:${((ci === this.#shown - 1 ? i : 0) % 6) * 60}ms"
          >
            ${isNew ? html`<span class="newtag">✨ ${app.t('engine.src.NEW')}</span>` : nothing}${blockTemplate(app, b, s.id, made)}
          </div>`;
        }),
      )}`,
      this.#body,
    );
    const blocks = shown.flat();
    this.#body.querySelectorAll<HTMLElement>(':scope > .blk').forEach((el, k) => {
      const b = blocks[k];
      if (b) explainParts(app, el, b, s);
    });
    if (this.#shown >= this.#chunks.length && !this.#tail) {
      if (!S.read[s.id]) {
        app.host.learn('section.read', s.id);
        app.xp(5, this.querySelector('.progressline'));
        // the last section of the chapter
        if (c.sections.every(x => S.read[x.id])) {
          if (!S.chapters?.[c.id]) app.host.learn('chapter.finished', c.id);
          setTimeout(() => {
            app.host.feedback.big('chapter');
          }, 500);
        }
      }
      this.#tail = new StudySectionTail(app, s, c).redraw();
    }
    this.redraw();
    if (scroll) {
      const els = this.#body.querySelectorAll('.blk');
      els[els.length - (this.#chunks[this.#shown - 1]?.length ?? 1)]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // 文A language help: the words of the theory in the learner's language (docs/BRIDGE.md)
    app.host.bridge.section({ sid: s.id, body: this.#body, head: this.#head ?? this.#body });
  }
}
tag('study-section', StudySection);

export function sectionView(app: StudyApp, sid: string, bid?: string): void {
  const s = app.course.section(sid);
  const c = s && app.course.chapterOf(s);
  if (!s || !c) {
    app.go('#/subject');
    return;
  }
  setAccent(document.body, c);
  const S = app.state;
  if (S.last !== sid) app.host.learn('section.opened', sid);
  app.tutor.setContext({ kind: 'section', id: sid });
  const j = app.course.sectionIndex(s);
  const page = new StudySection(app, s, c, bid);
  app.host.frame.chrome({
    sub: true,
    crumbs: [[`${c.emoji ?? ''} ${c.title}`, `#/ch/${c.id}`]],
    back: `#/ch/${c.id}`,
    reading: true,
    menu: sectionMenu(app, s, c, () => page.tail),
  });
  app.host.frame.noteRecent({
    sid,
    secTitle: s.title,
    chNum: c.num,
    chOf: app.course.chapters.length,
    secNum: j + 1,
    secOf: c.sections.length,
  });
  show(app, page);
  page.draw();
  if (bid) showHit(page.blockEl(bid));
}

/** the section's end: its quick check, its drills, a new question made by the AI, and the way on */
class StudySectionTail extends StudyElement {
  readonly #app: StudyApp;
  readonly #s: Section;
  readonly #c: Chapter;
  readonly #cards = new Map<Exercise, HTMLElement>();
  readonly #drills = new Map<string, HTMLElement>();
  readonly #fresh: HTMLElement[] = [];
  #asking = 0;
  constructor(app: StudyApp, s: Section, c: Chapter) {
    super();
    this.#app = app;
    this.#s = s;
    this.#c = c;
    this.className = 'quickzone';
  }
  /** a new question can be asked here (the section's ⋮) */
  get canAsk(): boolean {
    return !this.#app.lock;
  }
  /** ✨ a new question made by the AI, at the top of the slot */
  fresh(): void {
    void this.#freshQ();
    this.querySelector('.freshslot')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async #freshQ(): Promise<void> {
    const app = this.#app;
    this.#asking++;
    this.redraw();
    try {
      const ex = await app.ai.question(this.#s);
      this.#fresh.unshift(exerciseCard(app, ex));
    } catch (er) {
      app.toast(`⚠️ ${app.errText(er)}`, 4000);
    }
    this.#asking--;
    this.redraw();
  }
  #card(e: Exercise): HTMLElement {
    let el = this.#cards.get(e);
    if (!el) {
      el = exerciseCard(this.#app, e);
      this.#cards.set(e, el);
    }
    return el;
  }
  #drill(d: Drill): HTMLElement {
    let el = this.#drills.get(d.id);
    if (!el) {
      el = drillTile(this.#app, d);
      this.#drills.set(d.id, el);
    }
    return el;
  }
  override render(): TemplateResult {
    const app = this.#app,
      s = this.#s,
      c = this.#c;
    const exs = c.exercises.filter(e => e.section === s.id);
    const quick = exs.filter(e => e.quick);
    const pbs = c.debug.filter(d => d.section === s.id);
    const locked = !!app.lock;
    const go = (href: string) => () => {
      app.go(href);
    };
    // one big "Next section" (the next chapter's first one after the last section), the chapter's practice beside it
    const j = c.sections.indexOf(s);
    const prev = c.sections[j - 1],
      next = c.sections[j + 1];
    const all = app.course.chapters;
    const nextCh = next ? undefined : all[all.findIndex(x => x.id === c.id) + 1];
    const to = next ?? nextCh?.sections[0];
    // in the frame the tutor's ways (Socratic, debugging, interview) are in its own window and a new question in the section's ⋮
    return html`${
        locked
          ? exs.length || pbs.length
            ? lockNoteT(app)
            : nothing
          : quick.length
            ? html`<h3>⚡ ${app.L('quickCheck')}<span class="tiny">${app.L('quickCheckSub', { n: quick.length })}</span></h3>
                ${quick.map(e => this.#card(e))}`
            : nothing
      }
      ${
        pbs.length && !locked
          ? html`<h3 style="margin:22px 0 10px">🔧 ${app.L('sectionDrill')}</h3>
              ${pbs.map(d => this.#drill(d))}`
          : nothing
      }
      <div class=${locked ? '' : 'freshslot'}>
        ${this.#asking ? html`<p class="tiny">✨ ${app.L('generating')}</p>` : nothing}${this.#fresh}
      </div>
      <div class="row sectools">
        ${
          exs.length && !locked
            ? html`<button
                class="btn ghost"
                type="button"
                @click=${() => {
                  app.startRound(exs, { title: `🎯 ${s.title}`, count: exs.length, back: `#/s/${s.id}` });
                }}
              >
                🎯 ${app.L('allExercises', { n: exs.length })}
              </button>`
            : nothing
        }
      </div>
      <nav class="secnav ns-secnav" aria-label=${app.L('nextSection')}>
        ${
          to
            ? html`<button class="btn primary secnext" type="button" @click=${go(`#/s/${to.id}`)}>
                <span class="nx">${`${app.L('nextSection')} ${app.arrowOn}`}</span
                ><small>${next ? next.title : nextCh ? app.L('nextChapterFirst', { n: nextCh.num, title: nextCh.title }) : ''}</small>
              </button>`
            : html`<button class="btn primary secnext" type="button" @click=${go(`#/ch/${c.id}/practice`)}>
                <span class="nx">${`🎯 ${app.L('practiceChapter')} ${app.arrowOn}`}</span>
              </button>`
        }
        ${
          to && !next
            ? html`<button class="btn" type="button" @click=${go(`#/ch/${c.id}/practice`)}>🎯 ${app.L('practiceChapter')}</button>`
            : nothing
        }
        ${
          prev
            ? html`<button class="btn ghost small secprev" type="button" title=${prev.title} @click=${go(`#/s/${prev.id}`)}>
                ${`${app.arrowBack} ${app.L('prevSection')}`}
              </button>`
            : nothing
        }
      </nav>`;
  }
}
tag('study-section-tail', StudySectionTail);
