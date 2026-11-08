/**
 * The home of one language (#/lang/<code>, docs/LANGUAGE_RULES.md D29): the central page about it — where you are and
 * what is next (Continue: the next step of the lesson's ladder, D22; today's session), the parallel lanes right under it
 * when the course has several languages, the path (a window of lessons around where you are, the rest one tap away), the
 * study areas (aspects) as tiles, the vocabulary topics as a shelf of books, and apart the tools that are not aspects
 * (principal parts, name-them-all, peculiarities). A tap on a language opens this page, never a lesson.
 *
 *   <noema-lang-home .port=${coursePort} code="he"></noema-lang-home>
 */
import { html, nothing, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { NoemaScreen } from '../screen.ts';
import type { CoursePort, LangHomeModel } from './course-port.ts';

/** how many lessons of the path show around where the learner is */
const PATH_WINDOW = 12;
/** a phone holds three tiles in a row, a wider screen five */
const NARROW = '(max-width: 640px)';

/** Tiles in rows that hold the same number of tiles (as far as the count allows) and fill the width: never one tile alone. */
export function evenRows<T>(items: readonly T[], max: number): T[][] {
  const n = items.length;
  if (!n) return [];
  const rows = Math.ceil(n / max),
    base = Math.floor(n / rows),
    extra = n % rows,
    out: T[][] = [];
  let at = 0;
  for (let i = 0; i < rows; i++) {
    const k = base + (i < extra ? 1 : 0);
    out.push(items.slice(at, at + k));
    at += k;
  }
  return out;
}

/** a topic's book on the shelf: its colour, width, height and lean come from its name (the same book every time) */
export function bookLook(field: string, title: string, row: number, i: number): Readonly<Record<string, string>> {
  const PAL = [350, 28, 48, 95, 150, 185, 215, 255, 290, 320];
  let k = 7;
  for (const ch of field) k = (k * 31 + ch.charCodeAt(0)) % 997; // per code point, as the books were always drawn
  const len = Array.from(title).length;
  const hue = PAL[(row * 3 + i * 3 + (k % 3)) % PAL.length] ?? 215;
  return {
    '--h': String(hue),
    '--bw': `${46 + (k % 4) * 5}px`,
    '--bh': `${104 + (k % 5) * 8 + Math.min(len, 34) * 7}px`,
    '--lean': `${k % 7 === 0 ? 7 : k % 11 === 0 ? -6 : 0}deg`,
    '--d': `${(row * 7 + i) * 70}ms`,
  };
}

export class NoemaLangHome extends NoemaScreen {
  static override properties = {
    port: { attribute: false },
    code: { type: String },
    narrow: { state: true },
    wholePath: { state: true },
  };
  declare port: CoursePort | null;
  declare code: string;
  declare narrow: boolean;
  declare wholePath: boolean;
  #mq: MediaQueryList | null = null;
  #onMq = (): void => {
    this.narrow = !!this.#mq?.matches;
  };

  constructor() {
    super();
    this.port = null;
    this.code = '';
    this.narrow = false;
    this.wholePath = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#mq = this.ownerDocument.defaultView?.matchMedia(NARROW) ?? null;
    this.#mq?.addEventListener('change', this.#onMq);
    this.#onMq();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#mq?.removeEventListener('change', this.#onMq);
  }

  #go(hash: string): () => void {
    return () => {
      this.port?.go(hash);
    };
  }

  #grid(cls: string, tiles: readonly TemplateResult[]): TemplateResult {
    return html`<div class=${cls + ' lx-evengrid'}>
      ${evenRows(tiles, this.narrow ? 3 : 5).map(row => html`<div class="lx-evenrow" style=${styleMap({ '--n': String(row.length) })}>${row}</div>`)}
    </div>`;
  }

  #head(m: LangHomeModel): TemplateResult {
    const sub = [m.nativeName, this.t('lang.hub.known', { kn: m.lang.known, total: m.lang.total })].filter(Boolean).join(' · ');
    return html`<div class="lx-lhhead" data-lang=${m.lang.code}>
      <span class="lx-flag lx-lhflag" aria-hidden="true">${m.lang.flag}</span>
      <div>
        <h1>${m.lang.label}</h1>
        <div class="tiny">${sub}</div>
      </div>
    </div>`;
  }

  #go1(m: LangHomeModel): TemplateResult {
    const P = this.port,
      n = m.next,
      { reviews, newWords } = m.due;
    const counts = this.t('lang.home.sessionCounts', { rev: reviews, nNew: newWords });
    return html`<div class="lx-lhgo">
      ${
        n
          ? html`<div><span class="lx-step">${n.step}</span> <b>${n.title}</b></div>`
          : html`<div><b>${this.t('lang.hub.allDone')}</b></div>`
      }
      <div class="row">
        ${
          n
            ? html`<button
                class="btn primary lx-continue"
                data-step=${n.ladderStep ?? 'done'}
                @click=${() => P?.continueLesson(n.id, [m.lang.code])}
              >
                ${n.ladderStep ? this.t('lang.step.continue', { step: this.t('lang.step.' + n.ladderStep) }) : this.t('lang.step.review')}
              </button>`
            : nothing
        }
        ${
          reviews || newWords
            ? html`<button class=${n ? 'btn' : 'btn primary'} data-go="session" @click=${() => P?.session(m.lang.code)}>
                ${this.t('lang.home.session', { counts })}
              </button>`
            : html`<span class="tiny">${this.t('lang.home.nothingDue')}</span>`
        }
      </div>
    </div>`;
  }

  #path(m: LangHomeModel): TemplateResult | typeof nothing {
    const path = m.path;
    if (!path.length) return nothing;
    const at = Math.max(
        0,
        path.findIndex(s => !s.done),
      ),
      from = Math.max(0, at - 2),
      to = Math.min(path.length, from + PATH_WINDOW);
    const shown = this.wholePath
      ? path.map((s, i) => [s, i] as const)
      : path.map((s, i) => [s, i] as const).filter(([, i]) => i >= from && i < to);
    const hidden = path.length - (to - from);
    return html`<h2 class="lx-h2">${this.t('lang.hub.path')}</h2>
      <div class="lx-lhpath">
        ${shown.map(
          ([s, i]) =>
            html`<button
              class=${'lx-lhstep' + (s.done ? ' d' : i === at ? ' n' : '')}
              title=${s.title}
              aria-current=${i === at ? 'step' : nothing}
              @click=${this.#go('#/lesson/' + s.id)}
            >
              ${s.step}
            </button>`,
        )}
        ${
          !this.wholePath && hidden > 0
            ? html`<button
                class="lx-lhstep"
                @click=${() => {
                  this.wholePath = true;
                }}
              >
                … +${this.i18n.format.number(hidden)}
              </button>`
            : nothing
        }
      </div>`;
  }

  override render(): TemplateResult {
    const P = this.port;
    if (!P || !this.code) return html``;
    const m = P.home(this.code);
    const aspects = m.aspects.map(
      a =>
        html`<button class=${'lx-lhtile lx-asp lx-asp-' + a.aspect} data-aspect=${a.aspect} @click=${this.#go(a.href)}>
          <b>${this.t('lang.aspect.' + a.aspect)}</b
          >${a.points ? html`<span class="tiny">${this.t('lang.hub.points', { n: a.points })}</span>` : nothing}
        </button>`,
    );
    const tools = m.tools.map(
      x =>
        html`<button class=${'lx-lhtile lx-lhtool lx-asp lx-asp-' + x.name} data-view=${x.name} @click=${this.#go(x.href)}>
          <b>${this.t('lang.view.' + x.name)}</b>
        </button>`,
    );
    return html`${this.#head(m)} ${this.#go1(m)}
      ${
        m.lanes
          ? html`<button class="lx-lhlanes lx-asp lx-asp-lanes" data-view="lanes" @click=${this.#go('#/lanes')}>
              <b>${this.t('lang.view.lanes')}</b><span class="tiny">${this.t('lang.hub.lanesTip')}</span>
            </button>`
          : nothing
      }
      ${this.#path(m)}
      <h2 class="lx-h2">${this.t('lang.hub.aspects')}</h2>
      ${this.#grid('lx-lhaspects', aspects)} ${this.#shelf(m)}
      <h2 class="lx-h2">${this.t('lang.hub.tools')}</h2>
      ${this.#grid('lx-lhaspects lx-lhtools', tools)}`;
  }

  /** the topics of the vocabulary as a shelf of books: one book per topic, each its own colour, height and lean */
  #shelf(m: LangHomeModel): TemplateResult | typeof nothing {
    if (!m.topics.length) return nothing;
    const rows: (typeof m.topics)[] = [];
    for (let i = 0; i < m.topics.length; i += 7) rows.push(m.topics.slice(i, i + 7));
    return html`<h2 class="lx-h2">${this.t('lang.hub.shelf')}</h2>
      <div class="lx-shelf">
        ${rows.map(
          (row, ri) =>
            html`<div class="lx-shelfrow">
              ${row.map(
                (f, i) =>
                  html`<button
                    class="lx-book"
                    aria-label=${f.title}
                    data-tip=${f.title}
                    style=${styleMap(bookLook(f.field, f.title, ri, i))}
                    @click=${this.#go('#/sort/' + encodeURIComponent(f.field))}
                  >
                    <span class="lx-spine">${f.title}</span>
                  </button>`,
              )}
            </div>`,
        )}
      </div>`;
  }
}
