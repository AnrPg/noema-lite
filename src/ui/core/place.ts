/**
 * Where a floating panel (a menu, a tip, a popover) goes next to the control that opened it: below it when it fits, else
 * above when there is more room there; aligned with the control's start or end edge in the reading direction; always
 * inside the viewport with a margin, also on a 320 px phone (a panel wider than the screen gets the screen's width).
 * Pure: the components measure, this decides.
 */
import type { TextDirection } from '../../ports/i18n.ts';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
export interface Size {
  readonly width: number;
  readonly height: number;
}
export interface PlaceOptions {
  /** the preferred side: after the control in the block direction (below), or before it (above) */
  readonly side?: 'below' | 'above';
  /** which edge of the control the panel lines up with, in the reading direction */
  readonly align?: 'start' | 'end' | 'center';
  readonly dir: TextDirection;
  /** the space between the control and the panel */
  readonly gap?: number;
  /** the space kept free at the viewport's edges */
  readonly margin?: number;
}
export interface Placement {
  readonly left: number;
  readonly top: number;
  readonly side: 'below' | 'above';
  /** the panel's largest height that fits on that side (it scrolls inside beyond it) */
  readonly maxHeight: number;
  /** the panel's largest width that fits the viewport */
  readonly maxWidth: number;
}

export function place(anchor: Box, panel: Size, viewport: Size, o: PlaceOptions): Placement {
  const gap = o.gap ?? 6,
    margin = o.margin ?? 8;
  const below = viewport.height - (anchor.top + anchor.height) - gap - margin;
  const above = anchor.top - gap - margin;
  const want = o.side ?? 'below';
  const fits = (room: number): boolean => panel.height <= room;
  const side: 'below' | 'above' =
    want === 'below' ? (fits(below) || below >= above ? 'below' : 'above') : fits(above) || above >= below ? 'above' : 'below';
  const room = Math.max(0, side === 'below' ? below : above);
  const height = Math.min(panel.height, room);
  const top = side === 'below' ? anchor.top + anchor.height + gap : anchor.top - gap - height;

  const maxWidth = Math.max(0, viewport.width - 2 * margin);
  const width = Math.min(panel.width, maxWidth);
  const align = o.align ?? 'start';
  const startEdge = o.dir === 'rtl' ? anchor.left + anchor.width - width : anchor.left;
  const endEdge = o.dir === 'rtl' ? anchor.left : anchor.left + anchor.width - width;
  const raw = align === 'center' ? anchor.left + (anchor.width - width) / 2 : align === 'start' ? startEdge : endEdge;
  const left = Math.min(Math.max(raw, margin), viewport.width - margin - width);
  return { left: Math.round(left), top: Math.round(top), side, maxHeight: Math.floor(room), maxWidth };
}
