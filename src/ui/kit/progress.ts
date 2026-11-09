/**
 * Progress: a bar (a chapter's mastery, a build's progress) or a ring (the day's goal). Always named (`label`) and
 * exposed as a progressbar with its value; the visible number is the locale's (percent, or "value / max").
 *
 *   <noema-progress label="Chapter 2" value="0.4"></noema-progress>
 *   <noema-progress kind="ring" label="Today's goal" value="80" max="120" show="count"></noema-progress>
 *
 * Without `value` it is indeterminate (a quiet, slow shimmer; none with reduced motion).
 */
import { css, html, nothing, svg, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { NoemaElement } from '../core/element.ts';
import { base } from '../core/styles.ts';

export class NoemaProgress extends NoemaElement {
  static override properties = {
    label: { type: String },
    value: { type: Number },
    max: { type: Number },
    kind: { type: String, reflect: true },
    show: { type: String },
    size: { type: Number },
  };
  static override styles = [
    base,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      :host([kind='ring']) {
        display: inline-block;
      }
      .top {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
        font-size: 0.86rem;
        color: var(--u-ink2);
      }
      .top .l {
        color: var(--u-ink);
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .track {
        height: 8px;
        border-radius: 4px;
        background: var(--u-line);
        overflow: hidden;
      }
      .fill {
        height: 100%;
        border-radius: inherit;
        background: var(--u-acc);
        transition: width var(--u-base) var(--u-ease);
      }
      .fill.ind {
        width: 35%;
        animation: u-ind calc(1.6s / max(var(--u-motion, 1), 0.01)) ease-in-out infinite;
      }
      @keyframes u-ind {
        from {
          margin-inline-start: -35%;
        }
        to {
          margin-inline-start: 100%;
        }
      }
      .ring {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .ring svg {
        transform: rotate(-90deg);
      }
      .ring circle {
        fill: none;
        stroke-width: 7;
      }
      .ring .bg {
        stroke: var(--u-line);
      }
      .ring .fg {
        stroke: var(--u-acc);
        stroke-linecap: round;
        transition: stroke-dashoffset var(--u-base) var(--u-ease);
      }
      .ring .n {
        position: absolute;
        font-weight: 700;
        font-size: 0.9rem;
        color: var(--u-ink);
      }
    `,
  ];
  declare label: string;
  /** a ratio 0–1 (max 1, the default) or a count up to max; unset: indeterminate */
  declare value: number | undefined;
  declare max: number;
  declare kind: 'bar' | 'ring';
  /** the visible number: percent | count | none */
  declare show: 'percent' | 'count' | 'none';
  /** the ring's diameter in px */
  declare size: number;

  constructor() {
    super();
    this.label = '';
    this.value = undefined;
    this.max = 1;
    this.kind = 'bar';
    this.show = 'percent';
    this.size = 64;
  }

  /** the share done, 0–1, or null when indeterminate */
  get ratio(): number | null {
    if (this.value === undefined || !Number.isFinite(this.value) || !(this.max > 0)) return null;
    return Math.min(1, Math.max(0, this.value / this.max));
  }

  #text(r: number): string {
    if (this.show === 'none') return '';
    if (this.show === 'count') return this.t('ui.progress.count', { value: this.value ?? 0, max: this.max });
    return this.i18n.format.percent(r);
  }

  override render(): TemplateResult {
    const r = this.ratio,
      text = r === null ? '' : this.#text(r);
    const aria = {
      now: r === null ? undefined : String(Math.round(r * 100)),
      text: r === null ? this.t('ui.progress.working') : this.i18n.format.percent(r),
    };
    if (this.kind === 'ring') {
      const s = Math.max(32, this.size),
        rad = (s - 7) / 2,
        c = 2 * Math.PI * rad;
      return html`<div
        class="ring"
        role="progressbar"
        aria-label=${this.label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${ifDefined(aria.now)}
        aria-valuetext=${aria.text}
      >
        ${svg`<svg width=${s} height=${s} viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle class="bg" cx=${s / 2} cy=${s / 2} r=${rad}></circle><circle class="fg" cx=${s / 2} cy=${s / 2} r=${rad} stroke-dasharray=${c} stroke-dashoffset=${c * (1 - (r ?? 0))}></circle></svg>`}
        ${text ? html`<span class="n" aria-hidden="true">${text}</span>` : nothing}
      </div>`;
    }
    return html`<div class="top" aria-hidden="true"><span class="l">${this.label}</span><span>${text}</span></div>
      <div
        class="track"
        role="progressbar"
        aria-label=${this.label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${ifDefined(aria.now)}
        aria-valuetext=${aria.text}
      >
        <div class="fill ${r === null ? 'ind' : ''}" style=${r === null ? '' : `width:${(r * 100).toFixed(2)}%`}></div>
      </div>`;
  }
}
