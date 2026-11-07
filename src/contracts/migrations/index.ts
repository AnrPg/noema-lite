/* noema-lite — format migrations: each one upgrades one format from one version to the next, never drops a thing, and is
   idempotent (a file already at the new version is left exactly as it is). tools/migrate/run.mjs runs them over every
   file of the repository (and phase 2 runs them over stored data when it is read); src/contracts/migrations.test.ts
   proves the counts of chapters, sections, exercises, cards, sources, translations and words are the same before and
   after for every file.

   The migrations:
     pack.v3   a built pack (noema-pack) v 1 or 2 → v 3: the current format (levels; docs/i18n.md §10 kept as it was).
               Only the version changes — a pack has no levels until its author gives it some (they are never invented). */

export type Doc = Readonly<Record<string, unknown>>;

export interface Migration {
  readonly id: string;
  /** the contract the migrated document satisfies */
  readonly to: string;
  applies(doc: Doc): boolean;
  up(doc: Doc): Doc;
  /** The same change made in the file's text, every other byte kept (tools/migrate/run.mjs checks the text it gives
      parses to exactly up(doc)); null when the text cannot be patched (the file is then written out again whole). */
  patchText?(text: string): string | null;
}

const isObj = (v: unknown): v is Doc => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A copy of doc with key set to value, keeping the order of the keys (a new key goes right after `after`). */
function withKey(doc: Doc, key: string, value: unknown, after: string): Doc {
  if (key in doc) return { ...doc, [key]: value };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) { out[k] = v; if (k === after) out[key] = value; }
  if (!(key in out)) out[key] = value;
  return out;
}

export const packV3: Migration = {
  id: 'pack.v3',
  to: 'noema.pack.v3',
  applies: d => d.format === 'noema-pack' && (typeof d.v !== 'number' || d.v < 3),
  up: d => withKey(d, 'v', 3, 'format'),
  patchText: t => {
    const re = /("format"\s*:\s*"noema-pack"\s*,\s*"v"\s*:\s*)[12](?=\s*[,}])/;
    return re.test(t) ? t.replace(re, '$13') : null;
  },
};

export const MIGRATIONS: readonly Migration[] = [packV3];

/** Every migration that applies, in order, until none does. → the document and the ids of what ran. */
export function migrate(doc: unknown): { doc: unknown; applied: string[] } {
  if (!isObj(doc)) return { doc, applied: [] };
  let cur: Doc = doc;
  const applied: string[] = [];
  for (let pass = 0; pass < MIGRATIONS.length + 1; pass++) {
    const m = MIGRATIONS.find(x => x.applies(cur));
    if (!m) break;
    cur = m.up(cur); applied.push(m.id);
  }
  return { doc: cur, applied };
}

/** migrate() over a file's text: each step patches the text where the migration can (every other byte kept), else
    the document is written out again in the file's own indentation. → the new text (the same string when nothing
    applies) and the ids of what ran. */
export function migrateText(text: string): { text: string; applied: string[] } {
  let cur: unknown = JSON.parse(text), out = text;
  const applied: string[] = [];
  for (let pass = 0; pass < MIGRATIONS.length + 1; pass++) {
    const m = isObj(cur) ? MIGRATIONS.find(x => x.applies(cur as Doc)) : undefined;
    if (!m || !isObj(cur)) break;
    const next = m.up(cur), want = JSON.stringify(next);
    const patched = m.patchText?.(out) ?? null;
    out = patched !== null && JSON.stringify(JSON.parse(patched)) === want ? patched : stringifyLike(out, next);
    cur = next; applied.push(m.id);
  }
  return { text: out, applied };
}
/** JSON in the layout of the text it replaces: its indentation (none, or the first key's) and its final newline. */
export function stringifyLike(old: string, doc: unknown): string {
  const ind = /^\{\r?\n([ \t]+)"/.exec(old)?.[1] ?? '';
  return JSON.stringify(doc, null, ind || undefined) + (old.endsWith('\n') ? '\n' : '');
}

/* ---------- what a file holds: the counts that must be the same before and after a migration ---------- */
const arr = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Doc => (isObj(v) ? v : {});
const len = (v: unknown): number => arr(v).length;

/** The counts of one chapter (or one chapter-like object of a translation). */
export function chapterCounts(c: unknown): Record<string, number> {
  const ch = obj(c), secs = arr(ch.sections).map(obj);
  return {
    chapters: 1,
    sections: secs.length,
    blocks: secs.reduce((n, s) => n + len(s.blocks), 0),
    exercises: len(ch.exercises),
    flashcards: len(ch.flashcards),
    playbooks: len(ch.debug),
    pitfalls: len(ch.pitfalls),
  };
}
const add = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
};
const sum = (xs: readonly unknown[], f: (x: unknown) => Record<string, number>): Record<string, number> => xs.reduce<Record<string, number>>((n, x) => add(n, f(x)), {});

/** The counts of a document, whatever its format (a format without counts gives {}). */
export function counts(doc: unknown): Record<string, number> {
  const d = obj(doc);
  if (d.format === 'noema-pack') {
    const tr = obj(d.translations);
    return {
      chapters: 0, sections: 0, blocks: 0, exercises: 0, flashcards: 0, playbooks: 0, pitfalls: 0,
      ...sum(arr(d.chapters), chapterCounts),
      sources: len(obj(d.sources).sources),
      media: Object.keys(obj(d.media)).length,
      activities: len(obj(d.activities).items),
      translations: Object.keys(tr).length,
      translatedChapters: Object.values(tr).reduce<number>((n, t) => { const x = obj(t); return n + (typeof x.chapters === 'number' ? x.chapters : len(x.chapters)); }, 0),
      levels: len(obj(d.subject).levels),
    };
  }
  if (d.format === 'noema-translation') return { ...sum(arr(d.chapters), chapterCounts), translations: 1 };
  if (d.format === 'noema-bridge-core' || d.format === 'noema-bridge') {
    const es = arr(d.entries).map(obj);
    return { entries: es.length, senses: es.reduce((n, e) => n + len(e.senses), 0), sections: Object.keys(obj(d.sections)).length, anchors: len(d.anchors), keep: len(d.keep) };
  }
  if (d.format === 'noema-bridge-locale') return { translations: Object.keys(obj(d.t)).length, sections: Object.keys(obj(d.sections)).length };
  if (d.format === 'noema.curriculum/v1') {
    const ns = Object.values(obj(d.nodes)).map(obj);
    return { steps: ns.length, links: len(d.edges), chapters: ns.reduce((n, x) => n + len(x.chapters), 0), levels: len(d.levels) };
  }
  if (typeof d.id === 'string' && /^ch[0-9]{2}$/.test(d.id) && Array.isArray(d.sections)) return chapterCounts(d);
  if (Array.isArray(d.patches)) {
    return arr(d.patches).map(obj).reduce<Record<string, number>>((n, p) => add(n, {
      patches: 1, blocks: len(p.appendBlocks) + len(p.reviseBlocks), sections: len(p.appendSections), exercises: len(p.appendExercises) + len(p.reviseExercises),
      flashcards: len(p.appendFlashcards) + len(p.reviseFlashcards), playbooks: len(p.appendDebug), pitfalls: len(p.appendPitfalls),
    }), {});
  }
  if (Array.isArray(d.sources)) return { sources: len(d.sources) };
  if (Array.isArray(d.lexemes)) return { words: len(d.lexemes), senses: arr(d.lexemes).reduce<number>((n, x) => n + Math.max(1, len(obj(x).senses)), 0) };
  if (Array.isArray(d.sentences)) return { sentences: len(d.sentences) };
  if (Array.isArray(d.nodes)) return { nodes: len(d.nodes) };
  if (typeof d.function === 'string') return { grammar: 1, blocks: len(d.blocks), quiz: len(d.quiz), traps: len(d.traps) };
  if (Array.isArray(d.items)) return { items: len(d.items) };
  return {};
}
