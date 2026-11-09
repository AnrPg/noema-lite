/**
 * Keyboard movement inside a composite widget (a menu, a tab list, a radio group): which item an arrow key, Home or End
 * moves to, and type-ahead (the next item whose label starts with what was typed). Pure functions; the widgets keep
 * the state. In a right-to-left interface the horizontal arrows swap, so → always moves towards the end of the line.
 */
import type { TextDirection } from '../../ports/i18n.ts';

export type Orientation = 'vertical' | 'horizontal';

export interface MoveOptions {
  readonly orientation: Orientation;
  readonly dir: TextDirection;
  /** past the last item to the first and back (default true) */
  readonly wrap?: boolean;
  /** items that cannot take focus (disabled) */
  readonly skip?: (index: number) => boolean;
}

/** The index a key moves to from `index` among `count` items, or null when the key is not a movement key. */
export function moveIndex(key: string, index: number, count: number, o: MoveOptions): number | null {
  if (count <= 0) return null;
  const wrap = o.wrap ?? true,
    skip = o.skip ?? (() => false);
  const forward = o.orientation === 'vertical' ? 'ArrowDown' : o.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const backward = o.orientation === 'vertical' ? 'ArrowUp' : o.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  const scan = (from: number, step: 1 | -1, wrapping: boolean): number | null => {
    let i = from;
    for (let n = 0; n < count; n++) {
      i += step;
      if (i < 0 || i >= count) {
        if (!wrapping) return null;
        i = (i + count) % count;
      }
      if (!skip(i)) return i;
    }
    return null;
  };
  switch (key) {
    case forward:
      return scan(index, 1, wrap) ?? index;
    case backward:
      return scan(index, -1, wrap) ?? index;
    case 'Home':
      return scan(-1, 1, false);
    case 'End':
      return scan(count, -1, false);
    default:
      return null;
  }
}

/** The next item after `from` whose label starts with `typed` (case and accents ignored), or null. */
export function typeahead(labels: readonly string[], typed: string, from: number): number | null {
  const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
  const q = fold(typed);
  if (!q) return null;
  for (let n = 1; n <= labels.length; n++) {
    const i = (from + n) % labels.length;
    if (fold(labels[i] ?? '').startsWith(q)) return i;
  }
  return null;
}

/** A printable key that type-ahead collects (one character, no modifier). */
export const isPrintable = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean =>
  e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
