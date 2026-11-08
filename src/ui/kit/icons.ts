/**
 * The line icons of the new frame (docs/UI_MAP.md "Wording and icons": line icons, not emoji). 24 × 24, drawn with the
 * character's stroke width and line caps (--sw, --cap), in the text colour. An icon is decoration: the control that shows
 * it carries the words (aria-label or its text). Icons that point along the line (back, forward) mirror in a
 * right-to-left interface (--u-flip, set by the appearance).
 *
 *   icon('close')                  → an <svg> template for a component's render()
 *   <noema-icon name="close">      → the same as an element, for pages
 */
import { css, svg, type SVGTemplateResult } from 'lit';
import { NoemaElement } from '../core/element.ts';
import { base } from '../core/styles.ts';

export const ICONS = {
  back: 'M19 12H5M11 18l-6-6 6-6',
  forward: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  more: 'M12 5.5v.01M12 12v.01M12 18.5v.01',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14zM20 20l-4-4',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  info: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM12 11v6M12 7.5v.01',
  alert: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.01',
  done: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM8 12.5l3 3 5-6',
  today: 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  discover: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  progress: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
  user: 'M12 4a4 4 0 1 1 0 8a4 4 0 0 1 0-8zM4 20a8 8 0 0 1 16 0',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  sun: 'M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  globe: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  level: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  download: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  cards: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M9 6h11M9 12h11M9 18h11M4 6v.01M4 12v.01M4 18v.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
} as const;
export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** the icons that point along the line of text (mirrored right to left) */
const DIRECTIONAL: ReadonlySet<IconName> = new Set<IconName>(['back', 'forward']);

export const isIconName = (x: unknown): x is IconName => typeof x === 'string' && Object.hasOwn(ICONS, x);

/** An icon for a template (decoration: aria-hidden). */
export function icon(name: IconName): SVGTemplateResult {
  return svg`<svg class=${DIRECTIONAL.has(name) ? 'i flip' : 'i'} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d=${ICONS[name]}></path></svg>`;
}

export class NoemaIcon extends NoemaElement {
  static override properties = { name: { type: String, reflect: true } };
  static override styles = [
    base,
    css`
      :host {
        display: inline-flex;
        line-height: 0;
      }
      svg.i {
        width: var(--noema-icon-size, 20px);
        height: var(--noema-icon-size, 20px);
      }
    `,
  ];
  declare name: string;

  constructor() {
    super();
    this.name = 'info';
  }

  override render(): SVGTemplateResult | null {
    return isIconName(this.name) ? icon(this.name) : null;
  }
}
