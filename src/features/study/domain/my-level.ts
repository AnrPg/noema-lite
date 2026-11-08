/**
 * "Only my level" (the plan's levels, docs/CURRICULUM.md §11): the exercises, cards and mistakes of the level the learner
 * is at. An item's level is its own, else its section's, else its chapter's, else the pack's when the pack teaches one
 * level (src/contracts/rules/levels.ts); an item with no level at all belongs to every level. The learner's level is the
 * one reached last on the ladder (the read models' `levels`, event level.reached), else the ladder's first.
 */

export interface LevelledChapter {
  readonly id: string;
  readonly level?: string | undefined;
  readonly sections: readonly { readonly id: string; readonly level?: string | undefined }[];
}
export interface LevelledItem {
  readonly level?: string | undefined;
  readonly section?: string | undefined;
}
export interface LadderLevel {
  readonly id: string;
  readonly order: number;
}

/** The level an item of a chapter sits at (null: none). */
export function levelOf(item: LevelledItem, chapter: LevelledChapter | undefined, packLevels: readonly string[] = []): string | null {
  if (item.level) return item.level;
  const sec = item.section !== undefined ? chapter?.sections.find(s => s.id === item.section)?.level : undefined;
  if (sec) return sec;
  if (chapter?.level) return chapter.level;
  return packLevels.length === 1 ? (packLevels[0] ?? null) : null;
}

/** The learner's level on a ladder: the level reached (if it is on the ladder), else the lowest. */
export function currentLevel(ladder: readonly LadderLevel[], reached: string | null | undefined): string | null {
  if (reached && ladder.some(l => l.id === reached)) return reached;
  return [...ladder].sort((a, b) => a.order - b.order)[0]?.id ?? null;
}

/** Is the filter worth offering: a ladder of two levels or more and content at more than one of them. */
export function offersLevelFilter(ladder: readonly LadderLevel[], levelsUsed: Iterable<string | null>): boolean {
  if (ladder.length < 2) return false;
  const used = new Set([...levelsUsed].filter((l): l is string => l !== null));
  return used.size > 1;
}

/** The items at a level (an item without a level stays in). */
export function atLevel<T>(items: readonly T[], level: string | null, of: (item: T) => string | null): T[] {
  if (level === null) return [...items];
  return items.filter(x => {
    const l = of(x);
    return l === null || l === level;
  });
}
