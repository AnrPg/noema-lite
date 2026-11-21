/* noema-lite — what the review shows (docs/LESSON_UPDATES.md §5): the chapter before and after, section by section, in the
   language the learner reads. Each section is new, changed or unchanged; inside a changed one each block is kept, added or
   removed (a replaced block: the old one removed, the new one added at its place); the exercises, cards and pitfalls added
   are listed under their section. Pure. */
import { objs, s, type Obj } from '../../content/domain/util.ts';
import { canonical } from './apply.ts';

export type BlockMark = 'same' | 'added' | 'removed';
export interface DiffBlock {
  readonly mark: BlockMark;
  readonly block: Obj;
}
export interface DiffSection {
  readonly id: string;
  readonly title: string;
  readonly state: 'new' | 'changed' | 'same';
  /** the blocks in order, with what happened to each (an unchanged section: none) */
  readonly blocks: readonly DiffBlock[];
  /** exercises, flashcards and pitfalls added for this section */
  readonly items: readonly { readonly kind: 'exercises' | 'flashcards' | 'pitfalls'; readonly item: Obj }[];
}
export interface ChapterDiff {
  readonly sections: readonly DiffSection[];
  readonly added: {
    readonly blocks: number;
    readonly sections: number;
    readonly exercises: number;
    readonly flashcards: number;
    readonly pitfalls: number;
  };
  readonly removed: number;
}

/** the longest common subsequence of two lists of keys → the marks of a merge of both */
function merge(a: readonly string[], b: readonly string[]): { mark: BlockMark; i: number }[] {
  const n = a.length,
    m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      const row = L[i] as number[],
        next = L[i + 1] as number[];
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  const out: { mark: BlockMark; i: number }[] = [];
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ mark: 'same', i: j });
      i++;
      j++;
    } else if (j < m && (i >= n || (L[i]?.[j + 1] ?? 0) >= (L[i + 1]?.[j] ?? 0))) {
      out.push({ mark: 'added', i: j });
      j++;
    } else {
      out.push({ mark: 'removed', i });
      i++;
    }
  }
  return out;
}

/** The chapter before → after (both in the language shown). */
export function chapterDiff(before: Obj, after: Obj): ChapterDiff {
  const old = new Map(objs(before.sections).map(x => [s(x.id), x]));
  const had = (k: string): Set<string> => new Set(objs(before[k]).map(x => (x.id !== undefined ? s(x.id) : canonical(x))));
  const kinds = ['exercises', 'flashcards', 'pitfalls'] as const;
  const newItems = kinds.flatMap(k => {
    const h = had(k);
    return objs(after[k])
      .filter(x => !h.has(x.id !== undefined ? s(x.id) : canonical(x)))
      .map(item => ({ kind: k, item }));
  });
  const secIds = objs(after.sections).map(x => s(x.id));
  const homeOf = (it: Obj): string => (secIds.includes(s(it.section)) ? s(it.section) : (secIds[secIds.length - 1] ?? ''));
  const added = { blocks: 0, sections: 0, exercises: 0, flashcards: 0, pitfalls: 0 };
  let removed = 0;
  const sections = objs(after.sections).map((sc): DiffSection => {
    const id = s(sc.id),
      was = old.get(id),
      items = newItems.filter(x => homeOf(x.item) === id);
    for (const x of items) added[x.kind]++;
    if (!was) {
      added.sections++;
      const blocks = objs(sc.blocks).map(block => ({ mark: 'added' as const, block }));
      added.blocks += blocks.length;
      return { id, title: s(sc.title ?? ''), state: 'new', blocks, items };
    }
    const a = objs(was.blocks),
      b = objs(sc.blocks);
    const marks = merge(a.map(canonical), b.map(canonical));
    const blocks = marks.map(({ mark, i }) => ({ mark, block: (mark === 'removed' ? a[i] : b[i]) ?? {} }));
    const changed = blocks.some(x => x.mark !== 'same') || canonical(was.title) !== canonical(sc.title);
    for (const x of blocks) if (x.mark === 'added') added.blocks++;
    for (const x of blocks) if (x.mark === 'removed') removed++;
    return {
      id,
      title: s(sc.title ?? ''),
      state: changed || items.length ? 'changed' : 'same',
      blocks: changed || items.length ? blocks : [],
      items,
    };
  });
  return { sections, added, removed };
}
