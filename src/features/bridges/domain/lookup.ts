/* noema-lite — 文A language bridges (docs/BRIDGE.md): where a pack's bridge for a language pair is, and how a bridge follows
   its chapters when a pack is cut or joined (a Roadmap's restructuring, src/features/roadmaps/domain/restructure.ts).

   One bridge = one pair: from the language the learner READS (the pack's own, or one of its translations) into their native
   language. Its key: "<native>" from the pack's own language, "<source>.<native>" from a translation (pairKey). The bridges
   of a pack come from the library (its registry entry's bridgeLocales) and from the learner's account (the synced index
   a:bridges, rows of noema_bridges); the account's own one wins. */

const base = (c: string | null | undefined): string => (c ?? '').split('-')[0]?.toLowerCase() ?? '';

/** The key of one pair. */
export const pairKey = (src: string | null | undefined, nat: string, own?: string | null): string =>
  !src || base(src) === base(own ?? src) ? base(nat) : `${base(src)}.${base(nat)}`;

/** The pair of a key. own: the pack's own language (a key without a source is from it). */
export function pairOf(key: string, own?: string | null): { src: string; nat: string } {
  const [a, b] = key.split('.');
  return b ? { src: base(a), nat: base(b) } : { src: base(own ?? 'en'), nat: base(a) };
}

export interface BridgeMeta {
  status?: string;
  coverage?: number | null;
  everyday?: number | null;
  chapters?: number | null;
  of?: number | null;
  path?: string;
  [k: string]: unknown;
}
export interface Available extends BridgeMeta {
  own: boolean;
  key: string;
}

/** Every native language with a bridge for a pack FROM the language `src` (default: the pack's own, only keys without a
    source) → { native: { …meta, own, key } }. library: the registry's bridgeLocales; account: the account's index of the pack. */
export function available(
  library: Readonly<Record<string, BridgeMeta>>,
  account: Readonly<Record<string, BridgeMeta>>,
  src: string | null,
  own: string | null,
): Record<string, Available> {
  const out: Record<string, Available> = {};
  const add = (key: string, m: BridgeMeta, mine: boolean): void => {
    if (!src) {
      if (!key.includes('.')) out[base(key)] = { ...m, own: mine, key: base(key) };
      return;
    }
    const p = pairOf(key, own);
    if (p.src === base(src) && p.nat !== base(src)) out[p.nat] = { ...m, own: mine, key: pairKey(p.src, p.nat, own) };
  };
  for (const [k, m] of Object.entries(library)) add(k, m, false);
  for (const [k, m] of Object.entries(account)) add(k, m, true);
  return out;
}

/* ---------- a bridge cut or joined with its pack ---------- */

export interface BridgeLike {
  format?: string;
  pack: string;
  source?: string;
  native: string;
  status?: string;
  chapters?: string[];
  of?: number;
  entries?: { k: string; senses?: { id: string | number; [k: string]: unknown }[]; [k: string]: unknown }[];
  sections?: Record<string, { terms?: string[]; preview?: string; [k: string]: unknown }>;
  anchors?: { at: string; k?: string; [k: string]: unknown }[];
  [k: string]: unknown;
}

/** The part of a bridge that belongs to some chapters of its pack (their sections' previews and terms, the anchors in them)
    for the pack `pack` → null when none of it belongs there. The word entries all go with it (a word glossed in one chapter
    is the same word in the others). */
export function splitBridge(b: BridgeLike, pack: string, chapters: readonly string[], sections: ReadonlySet<string>): BridgeLike | null {
  const secs = Object.fromEntries(Object.entries(b.sections ?? {}).filter(([id]) => sections.has(id)));
  const anchors = (b.anchors ?? []).filter(a => sections.has(a.at.split('/')[0] ?? ''));
  const chs = (b.chapters ?? []).filter(id => chapters.includes(id));
  if (!Object.keys(secs).length && !anchors.length && !chs.length) return null;
  const out: BridgeLike = { ...structuredClone(b), pack, sections: secs, anchors, chapters: chs, of: chapters.length };
  return out;
}

/** Bridges of several packs joined into the pack `pack`: one per language pair (source → native), entries by word (senses by
    id), sections and anchors together, the chapters they cover together. */
export function mergeBridges(pack: string, list: readonly BridgeLike[]): BridgeLike[] {
  const byPair = new Map<string, BridgeLike>();
  for (const b of list) {
    const k = `${base(b.source)}>${base(b.native)}`,
      cur = byPair.get(k);
    if (!cur) {
      byPair.set(k, { ...structuredClone(b), pack });
      continue;
    }
    const entries = cur.entries ?? (cur.entries = []);
    for (const e of b.entries ?? []) {
      const have = entries.find(x => x.k === e.k);
      if (!have) {
        entries.push(structuredClone(e));
        continue;
      }
      const senses = have.senses ?? (have.senses = []);
      for (const s of e.senses ?? []) if (!senses.some(x => x.id === s.id)) senses.push(structuredClone(s));
    }
    cur.sections = { ...(b.sections ?? {}), ...(cur.sections ?? {}) };
    cur.anchors = [...(cur.anchors ?? []), ...structuredClone(b.anchors ?? [])];
    cur.chapters = [...new Set([...(cur.chapters ?? []), ...(b.chapters ?? [])])];
    cur.of = (cur.of ?? 0) + (b.of ?? 0);
    if (b.status !== 'reviewed') cur.status = 'draft'; // a joined bridge is reviewed only when every part was
  }
  return [...byPair.values()];
}
