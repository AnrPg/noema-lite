/**
 * The base of the shell's screens (src/ui/screens/shell): a kit element drawn in the page's own DOM (light DOM), because
 * the older screens that still live in the frame (engine/src/*, engine/app/*) and their styles (engine/src/95_shell.css)
 * address the frame's parts by their classes (#ns-top, .ns-tab, #ns-fab, .ns-pop …). The words are the shell's catalog
 * (i18n/shell, keys sh.*), with the tutor's name in every form a language needs ({tutor}, {tutorAcc}, {tutorTo},
 * {tutorNom}, {Tutor}).
 */
import { html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { MessageParams } from '../../../ports/i18n.ts';
import { NoemaElement } from '../../core/element.ts';

/** The pictures of the characters and the line icons (engine/art.js: the app's own SVG, never someone else's text). */
export interface ShellArt {
  svg(key: string, cls?: string): string;
  mascot(m: string, w?: number, h?: number): string;
  land(m: string): string;
  collection(m: string, n: number, fresh: number): string;
  has(key: string): boolean;
}

/** The tutor's name in the forms the catalogs use. */
export type TutorVars = Readonly<Record<'tutor' | 'tutorAcc' | 'tutorTo' | 'tutorNom' | 'Tutor', string>>;

/** What every shell screen gets from the root (src/composition/shell). */
export interface ShellContext {
  readonly art: ShellArt;
  /** the character worn now */
  character(): string;
  tutorVars(m?: string): TutorVars;
  /** go to an address (#/…); the same address draws the page again */
  go(hash: string): void;
}

export const NO_ART: ShellArt = { svg: () => '', mascot: () => '', land: () => '', collection: () => '', has: () => false };

export class ShellElement extends NoemaElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: ShellContext | undefined;

  /** light DOM: the frame's styles and the older screens reach these parts */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
  /** a message of the shell's catalog (sh.<key>) with the tutor's names */
  protected L(key: string, params?: MessageParams): string {
    return this.t('sh.' + key, { ...(this.ctx?.tutorVars() ?? {}), ...params });
  }
  /** a line icon */
  protected icon(key: string, cls = 'i'): TemplateResult {
    return html`<span class="ns-svg">${unsafeHTML(this.ctx?.art.svg(key, cls) ?? '')}</span>`;
  }
  /** the face of a character (the one worn now by default) */
  protected face(m: string | undefined = this.ctx?.character(), cls = ''): TemplateResult {
    return html`<span class=${'ns-face ' + cls} aria-hidden="true">${unsafeHTML(m ? (this.ctx?.art.mascot(m) ?? '') : '')}</span>`;
  }
  /** a pill in one of the four soft colours */
  protected pill(x: unknown, n = 1, cls = ''): TemplateResult {
    return html`<span class=${'ns-pill ' + cls} style=${tone(n)}>${x}</span>`;
  }
  protected ico(key: string, n = 1): TemplateResult {
    return html`<span class="ns-ico" style=${tone(n)}>${this.icon(key)}</span>`;
  }
  protected icoTxt(x: string, n = 1, cls = 'txt'): TemplateResult {
    return html`<span class=${'ns-ico ' + cls} style=${tone(n)}>${x}</span>`;
  }
  protected chev(): TemplateResult {
    return html`<span class="ns-chev" aria-hidden="true">›</span>`;
  }
  /** a progress ring (pct 0…1) */
  protected ring(pct: number, size: number, stroke: number): TemplateResult {
    return html`<span class="ns-ringsvg">${unsafeHTML(ringSvg(pct, size, stroke))}</span>`;
  }
  /** the day's goal ring (Today): the accent until the goal, gold past it (goalRingSvg) */
  protected goalRing(xp: number, goal: number): TemplateResult {
    return html`<span class="ns-ringsvg">${unsafeHTML(goalRingSvg(xp, goal))}</span>`;
  }
}

export { html, nothing };

/** the custom properties of a soft colour family (1–4; 5: the accent) */
export const tone = (n: number): string => `--bgc:var(--t${String(n)});--fgc:var(--t${String(n)}i)`;

export function ringSvg(pct: number, size: number, stroke: number): string {
  const r = (size - stroke) / 2,
    C = 2 * Math.PI * r,
    off = C * (1 - Math.max(0, Math.min(1, pct || 0)));
  const c = String(size / 2);
  return `<svg viewBox="0 0 ${String(size)} ${String(size)}" width="${String(size)}" height="${String(size)}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${String(r)}" fill="none" stroke="var(--line)" stroke-width="${String(stroke)}"/><circle class="ns-arc" cx="${c}" cy="${c}" r="${String(r)}" fill="none" stroke="var(--acc)" stroke-width="${String(stroke)}" stroke-linecap="round" style="--C:${String(C)};stroke-dasharray:${String(C)};stroke-dashoffset:${String(off)}"/></svg>`;
}

/** the day's goal ring, 64 px with a 7 px stroke, drawn in an 84 px box so its sparks have 10 px around it (never more: the
    .ns-goal box is 64 px and the svg overflows it by 10 px on each side). Below the goal: the accent arc, as ringSvg. At or
    past it: the ring in gold (--gold … from the tokens, so it reads on the character's background in light and dark), and,
    for as long as that holds, a glint that keeps travelling round it, three sparks circling just outside it, small stars
    twinkling on its rim one after another, and a thin inner lap that fills with the XP above the goal (one more lap = twice
    the goal) with a star at its tip. The motion is CSS (engine/src/95_shell.css): none under prefers-reduced-motion. */
export function goalRingSvg(xp: number, goal: number): string {
  const S = 64,
    W = 7,
    VB = S + 20,
    c = VB / 2,
    R = (S - W) / 2,
    C = 2 * Math.PI * R,
    g = goal > 0 ? goal : 1,
    over = xp >= g,
    off = C * (1 - Math.max(0, Math.min(1, xp / g || 0)));
  const n = (v: number): string => String(Math.round(v * 100) / 100);
  const circle = (r: number, attrs: string): string => `<circle cx="${n(c)}" cy="${n(c)}" r="${n(r)}" fill="none" ${attrs}/>`;
  /* a point at deg degrees from the start of the arc (the svg is turned -90°, so 0° is the top of the ring) */
  const at = (deg: number, r: number): [number, number] => [
    c + r * Math.cos((deg * Math.PI) / 180),
    c + r * Math.sin((deg * Math.PI) / 180),
  ];
  const star = (x: number, y: number, s: number, cls: string, delay: number): string =>
    `<path class="${cls}" style="animation-delay:${n(delay)}s" fill="var(--gold-hi)" d="M${n(x)} ${n(y - s)}Q${n(x)} ${n(y)} ${n(x + s)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + s)}Q${n(x)} ${n(y)} ${n(x - s)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - s)}Z"/>`;
  const box = `<svg viewBox="0 0 ${n(VB)} ${n(VB)}" width="${n(VB)}" height="${n(VB)}" aria-hidden="true">`;
  if (!over)
    return (
      box +
      circle(R, `stroke="var(--line)" stroke-width="${n(W)}"`) +
      circle(
        R,
        `class="ns-arc" stroke="var(--acc)" stroke-width="${n(W)}" stroke-linecap="round" style="--C:${n(C)};stroke-dasharray:${n(C)};stroke-dashoffset:${n(off)}"`,
      ) +
      '</svg>'
    );
  const extra = Math.min(1, (xp - g) / g),
    ri = R - W / 2 - 2.6,
    Ci = 2 * Math.PI * ri,
    ro = R + W / 2 + 4,
    rs = R + W / 2 + 3;
  const [tx, ty] = at(360 * extra, R);
  return (
    box +
    '<defs><linearGradient id="ns-gold" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="var(--gold-hi)"/><stop offset=".55" stop-color="var(--gold)"/></linearGradient></defs>' +
    circle(R, `stroke="var(--gold-track)" stroke-width="${n(W)}"`) +
    circle(
      R,
      `class="ns-arc" stroke="url(#ns-gold)" stroke-width="${n(W)}" stroke-linecap="round" style="--C:${n(C)};stroke-dasharray:${n(C)};stroke-dashoffset:0"`,
    ) +
    circle(
      R,
      `class="ns-glint" stroke="var(--gold-hi)" stroke-width="${n(W - 3)}" stroke-linecap="round" style="--C:${n(C)};stroke-dasharray:${n(C * 0.09)} ${n(C * 0.91)}"`,
    ) +
    circle(ri, `stroke="var(--gold-track)" stroke-width="2"`) +
    (extra > 0
      ? circle(
          ri,
          `class="ns-lap" stroke="var(--gold)" stroke-width="2" stroke-linecap="round" style="stroke-dasharray:${n(Ci)};stroke-dashoffset:${n(Ci * (1 - extra))}"`,
        )
      : '') +
    `<g class="ns-orbit">${[0, 130, 250]
      .map(d => {
        const [x, y] = at(d, ro);
        return `<circle cx="${n(x)}" cy="${n(y)}" r="1.4" fill="var(--gold)"/>`;
      })
      .join('')}</g>` +
    (
      [
        [38, 2.9, 0],
        [150, 2.3, 0.8],
        [232, 3.1, 1.6],
        [310, 2.2, 2.4],
      ] as const
    )
      .map(([d, s, dl]) => {
        const [x, y] = at(d - 90, rs);
        return star(x, y, s, 'ns-twinkle', dl);
      })
      .join('') +
    star(tx, ty, 3.2, 'ns-tip', 0) +
    '</svg>'
  );
}
