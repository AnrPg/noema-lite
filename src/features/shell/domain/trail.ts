/**
 * ← back: the screens of this tab in the order they were seen, so ← returns to the screen the learner came from,
 * whatever way led there. Every screen keeps its own stable address (shareable, reload-proof); the trail only remembers
 * the way. With no trail (a shared link, a bookmark, a new tab) ← goes to the screen's parent.
 */
export interface TrailStep {
  /** the address */
  readonly h: string;
  /** the scroll position it was left at */
  y: number;
  /** when it was entered */
  readonly at: number;
}
export const TRAIL_KEEP = 60;
/** a screen that forwarded on its own within this time (no click, no key) is skipped by ← */
export const FORWARD_MS = 1500;

/**
 * The trail after arriving at `here`: the same screen again changes nothing; the one before it means "back" (its step
 * is returned, so its scroll position can come back); a screen that forwarded on its own is replaced; otherwise the
 * screen being left keeps its scroll position and `here` is added.
 */
export function arrive(
  trail: readonly TrailStep[],
  here: string,
  { now, lastInput, scrollY }: { readonly now: number; readonly lastInput: number; readonly scrollY: number },
): { trail: TrailStep[]; backTo: TrailStep | null } {
  const t = trail.map(x => ({ ...x }));
  const top = t.at(-1);
  if (top?.h === here) return { trail: t, backTo: null };
  if (t.length > 1 && t[t.length - 2]?.h === here) {
    t.pop();
    return { trail: t, backTo: t.at(-1) ?? null };
  }
  if (top && top.at > lastInput && now - top.at < FORWARD_MS) t.pop();
  else if (top) top.y = Math.round(scrollY);
  t.push({ h: here, y: 0, at: now });
  return { trail: t.slice(-TRAIL_KEEP), backTo: null };
}

/** Where ← goes: the screen before this one on the trail, else the screen's parent (its own idea, else one level up). */
export function backFrom(trail: readonly TrailStep[], here: string, parent: string | null | undefined): string {
  if (trail.length > 1 && trail.at(-1)?.h === here) return trail[trail.length - 2]?.h ?? '#/';
  return parent || here.replace(/\/[^/]*$/, '') || '#/';
}
