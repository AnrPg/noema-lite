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
