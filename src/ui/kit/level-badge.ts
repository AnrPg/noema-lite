/**
 * A level of a ladder (src/contracts/rules/levels.ts: grade, semester, study year, difficulty, custom): its name in the
 * interface language (the level's own `names`, along the locale's fallback chain, then English, then its id), the kind
 * of ladder, its place on it, and where the learner is (done · current · ahead).
 *
 *   <noema-level-badge .level=${{ id: 'y2', kind: 'year', order: 2, names: { en: 'Year 2', el: 'Έτος 2' } }} of="4"
 *                      state="current"></noema-level-badge>
 *
 * The whole badge is one phrase for a screen reader ("Study year: Year 2, level 2 of 4, your level").
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Level, LevelKind } from '../../contracts/rules/levels.ts';
import { NoemaElement } from '../core/element.ts';
import { base } from '../core/styles.ts';
import { icon } from './icons.ts';

export type LevelState = 'done' | 'current' | 'ahead';

/** The tags a locale falls back through for a level's name: itself, its language, English (Traditional never to Simplified). */
export function nameChain(locale: string): string[] {
  const out = [locale],
    parts = locale.split('-');
  if (parts.length > 1 && !/^zh-/i.test(locale) && parts[0]) out.push(parts[0]);
  if (!out.includes('en')) out.push('en');
  return out;
}

/** A level's name in the locale (its id when it has none at all). */
export function levelName(level: Pick<Level, 'id' | 'names'>, locale: string): string {
  for (const tag of nameChain(locale)) {
    const n = level.names[tag];
    if (n) return n;
  }
  return Object.values(level.names).find(Boolean) ?? level.id;
}

const KINDS: readonly LevelKind[] = ['grade', 'semester', 'year', 'difficulty', 'custom'];

export class NoemaLevelBadge extends NoemaElement {
  static override properties = {
    level: { attribute: false },
    of: { type: Number },
    state: { type: String, reflect: true },
  };
  static override styles = [
    base,
    css`
      :host {
        display: inline-flex;
        max-width: 100%;
        vertical-align: middle;
      }
      .b {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        max-width: 100%;
        padding: 2px 10px 2px 8px;
        padding-inline: 8px 10px;
        border-radius: 999px;
        border: 1px solid var(--u-line);
        background: var(--u-paper);
        color: var(--u-ink);
        font-size: 0.84rem;
        line-height: 1.2;
      }
      :host([state='current']) .b {
        background: var(--u-acc-soft);
        border-color: var(--u-acc);
      }
      :host([state='done']) .b {
        background: var(--u-ok);
        color: var(--u-ok-ink);
        border-color: transparent;
      }
      svg.i {
        width: 16px;
        height: 16px;
      }
      .k {
        color: var(--u-ink2);
      }
      :host([state='done']) .k {
        color: inherit;
      }
      .n {
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .o {
        color: var(--u-ink2);
        font-variant-numeric: tabular-nums;
      }
      :host([state='done']) .o {
        color: inherit;
      }
    `,
  ];
  declare level: Level | null;
  /** how many levels the ladder has (0: not shown) */
  declare of: number;
  declare state: LevelState;

  constructor() {
    super();
    this.level = null;
    this.of = 0;
    this.state = 'ahead';
  }

  override render(): TemplateResult | typeof nothing {
    const l = this.level;
    if (!l) return nothing;
    const kind = KINDS.includes(l.kind) ? l.kind : 'custom';
    const name = levelName(l, this.i18n.locale());
    const kindWord = this.t(`ui.level.kind.${kind}`);
    const state = this.t(`ui.level.state.${this.state}`);
    const place = this.of > 0;
    const phrase = place
      ? this.t('ui.level.phraseOf', { kind: kindWord, name, n: l.order, of: this.of, state })
      : this.t('ui.level.phrase', { kind: kindWord, name, state });
    return html`<span class="b" role="img" aria-label=${phrase} title=${phrase}>
      ${this.state === 'done' ? icon('done') : this.state === 'ahead' ? icon('level') : icon('star')}
      <span class="k" aria-hidden="true">${kindWord}</span><span class="n" aria-hidden="true">${name}</span>${
        place
          ? html`<span class="o" aria-hidden="true">${this.i18n.format.number(l.order)}/${this.i18n.format.number(this.of)}</span>`
          : nothing
      }
    </span>`;
  }
}
