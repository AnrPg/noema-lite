/**
 * Progress (#/progress): the level, the week as stepping stones (the 7th holds a small chest), the character's
 * collection (one item per chapter completed; this week's shine), the week's XP and the treasures found.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ShellElement, tone } from './base.ts';

/** a treasure of the page: found or not, how far along, its colour family */
export interface Medal {
  readonly id: 'step' | 'cards' | 'week' | 'boss' | 'xp' | 'month';
  readonly found: boolean;
  readonly n: number;
  readonly tone: 1 | 2 | 3 | 4;
}
export interface ProgressModel {
  readonly level: { readonly lv: number; readonly into: number; readonly need: number };
  readonly xp: number;
  readonly streak: number;
  /** the last seven days, oldest first: their narrow weekday name and XP */
  readonly days: readonly { readonly label: string; readonly xp: number }[];
  readonly goal: number;
  readonly chapters: number;
  /** chapters completed this week */
  readonly fresh: number;
  readonly medals: readonly Medal[];
  /** the character's words: the place of level 7, the collection, one item of it */
  readonly place: string;
  readonly coll: string;
  readonly item: string;
}
export interface ProgressData {
  model(): Promise<ProgressModel>;
}

const STONES: readonly (readonly [number, number])[] = [
  [40, 90],
  [110, 70],
  [180, 84],
  [250, 62],
  [320, 78],
  [390, 58],
  [460, 72],
];
const attr = (s: string): string => s.replace(/[&<>"]/g, c => '&#' + String(c.charCodeAt(0)) + ';');

export class NoemaProgressPage extends ShellElement {
  static override properties = { ...ShellElement.properties, data: { attribute: false }, m: { state: true } };
  declare data: ProgressData | undefined;
  declare m: ProgressModel | null;
  constructor() {
    super();
    this.m = null;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    void this.data?.model().then(m => {
      this.m = m;
    });
  }
  /** the medal's words */
  medalText(x: Medal): string {
    const KEY = { step: 'medalStep', cards: 'medalCards', week: 'medalWeek', boss: 'medalBoss', xp: 'medalXp', month: 'medalMonth' } as const;
    return this.L(KEY[x.id], { n: x.n });
  }
  medalMark(x: Medal): TemplateResult | string {
    return x.id === 'boss' ? this.icon('crown') : { step: '1', cards: '100', week: '7', xp: '1k', month: '30' }[x.id];
  }
  #trail(m: ProgressModel): string {
    const did = m.days.map(d => d.xp > 0),
      ch = this.ctx?.character() ?? 'hedge';
    return (
      `<svg class="ns-trail" viewBox="0 0 500 130" role="img" aria-label="${attr(this.L('trailAria', { n: did.filter(Boolean).length }))}"><path d="M40 90 Q75 60 110 70 T180 84 T250 62 T320 78 T390 58 T460 72" fill="none" stroke="var(--ink3)" stroke-width="2" stroke-dasharray="3 7" opacity=".6"/>` +
      STONES.map(([x, y], i) =>
        did[i]
          ? `<ellipse cx="${String(x)}" cy="${String(y)}" rx="20" ry="9" fill="var(--t2)" stroke="var(--t2i)" stroke-width="1.5"/>`
          : `<ellipse cx="${String(x)}" cy="${String(y)}" rx="20" ry="9" fill="none" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 4"/>`,
      ).join('') +
      `<rect x="447" y="42" width="26" height="18" rx="4" fill="var(--t2)" stroke="var(--t2i)" stroke-width="1.5"/><path d="M447 50 h26" stroke="var(--t2i)" stroke-width="1.5"/>` +
      m.days
        .map((d, i) => {
          const [x, y] = STONES[i] ?? [0, 0];
          return `<text x="${String(x)}" y="${String(y + 28)}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink3)">${attr(d.label)}</text>`;
        })
        .join('') +
      `<g transform="translate(${String(Math.max(0, did.lastIndexOf(true)) * 70 + 4)} -8)"><g class="breathe">${this.ctx?.art.mascot(ch, 64, 59) ?? ''}</g></g></svg>`
    );
  }
  override render(): TemplateResult {
    const m = this.m;
    if (!m) return html`<h1>${this.L('yourProgress')}</h1>`;
    const ch = this.ctx?.character() ?? 'hedge';
    const max = Math.max(m.goal, ...m.days.map(d => d.xp)),
      wsum = m.days.reduce((a, d) => a + d.xp, 0);
    return html`<h1>${this.L('yourProgress')}</h1>
      <section class="ns-panel ns-level">
        <div class="ns-ringwrap">
          ${this.ring(m.level.into / m.level.need, 132, 11)}
          <div class="ringc"><span class="tiny">${this.L('level')}</span><b>${m.level.lv}</b></div>
        </div>
        <div class="grow">
          <span class="ns-label">${m.place}</span>
          <h2>${this.L('xpToLevel', { n: m.level.need - m.level.into, lv: m.level.lv + 1 })}</h2>
          <p class="ns-muted">${this.L('xpTotal', { xp: m.xp })}</p>
        </div>
      </section>
      <section class="ns-panel center">
        <h2>${m.streak ? this.L('streakDays', { n: m.streak }) : this.L('streakStart')}</h2>
        <p class="ns-muted">${m.streak ? this.L('streakKeep') : this.L('streakStartSub')}</p>
        <div>${unsafeHTML(this.#trail(m))}</div>
      </section>
      <section class="ns-panel">
        <div class="row spread"><span class="ns-label">${m.coll}</span>${this.pill(this.L('nChapters', { n: m.chapters }), 1)}</div>
        <div class="ns-coll">
          ${unsafeHTML(
            `<svg viewBox="0 0 300 230" role="img" aria-label="${attr(m.coll)}: ${String(m.chapters)}">${this.ctx?.art.collection(ch, m.chapters, m.fresh) ?? ''}</svg>`,
          )}
        </div>
        <p class="tiny center">${this.L('collNote', { item: m.item, n: m.fresh })}</p>
      </section>
      <section class="ns-panel">
        <div class="row spread"><span class="ns-label">${this.L('xpWeek')}</span>${this.pill(wsum, 1)}</div>
        <div class="ns-bars">
          ${m.days.map(
            (d, i) =>
              html`<div>
                <i class=${i === 6 ? 'today' : ''} style=${`height:${String((d.xp / max) * 100)}%;--i:${String(i)}`}></i><span>${d.label}</span>
              </div>`,
          )}
        </div>
      </section>
      <section class="ns-panel"><span class="ns-label">${this.L('treasures')}</span>${this.medals(m.medals)}</section>
      <p class="tiny">${this.L('gameNote')} <button class="linkish" @click=${() => this.ctx?.go('#/me/look')}>${this.L('look')}</button></p>`;
  }
  /** the treasures: found ones in their colour, the others locked */
  medals(list: readonly Medal[]): TemplateResult {
    return html`<div class="ns-medals">
      ${list.map(
        x =>
          html`<div class=${'ns-medal' + (x.found ? '' : ' lock')}>
            <div class="m" style=${x.found ? tone(x.tone) : nothing}>${this.medalMark(x)}</div>
            <small>${this.medalText(x)}</small>
          </div>`,
      )}
    </div>`;
  }
}
