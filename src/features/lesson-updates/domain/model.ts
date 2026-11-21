/* noema-lite — 💬→📖 a lesson improved from a chat with the tutor (docs/LESSON_UPDATES.md): the update's format
   (noema-lesson-update v1), the request the app records, and the shape check of an update as it comes (from the connector,
   or pasted back from a Claude chat). Pure.

   An update is ADDITIVE: it adds sections, blocks, exercises, cards, pitfalls and knowledge-map entries to ONE chapter of a
   subject the learner owns. Nothing of the lesson is changed or removed, except where the learner picks an option of a choice
   that says so (a section already full: "replace the weaker text"). Every text it adds comes in the pack's language and in
   each language the pack is translated into (the same structure, only the words change), so the translations stay whole. */
import { isObj, isStr, list, obj, objs, s, type Obj } from '../../content/domain/util.ts';

export const UPDATE_FORMAT = 'noema-lesson-update';
/** the synced rows (docs/SYNC.md: one writer per key) — the app writes the request, the connector the proposal */
export const REQ_PREFIX = 'a:lessonreq:';
export const PROP_PREFIX = 'a:lessonup:';
/** the files of one request in the account's storage (noema-private/<uid>/…) */
export const updateDir = (id: string): string => `updates/${id}/`;
export const chatPath = (id: string): string => `${updateDir(id)}chat.json`;
export const proposalPath = (id: string): string => `${updateDir(id)}proposal.json`;
export const beforePath = (id: string): string => `${updateDir(id)}before.json`;
export const filePath = (id: string, fileId: string): string => `${updateDir(id)}files/${fileId}`;
/** a request id: "lu" + time in base 36 + something unique (sorts by time; a safe path segment) */
export const REQ_ID = /^lu[0-9a-z]{6,14}-[0-9a-z]{4,12}$/;
export const newRequestId = (now: number, unique: string): string =>
  'lu' +
  now.toString(36) +
  '-' +
  unique
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
    .slice(0, 8)
    .padEnd(4, '0');

/** how much of a chat goes to Claude: the newest turns win when a chat is longer */
export const CHAT_MAX_CHARS = 120_000;
/** at most this many attachments travel with a request, each at most FILE_MAX bytes */
export const FILES_MAX = 12;
export const FILE_MAX = 20 * 1024 * 1024;

export type Json = unknown;
export type Block = Obj;
export type Item = Obj;
/** one translated thing per locale of the pack's translations ("el": …) */
export type I18n<T> = Readonly<Record<string, T>>;

/** a new section, placed after an existing one (after: null → first); its id is chNN-sNN and not used yet */
export interface SectionOp {
  readonly op: 'section';
  readonly after: string | null;
  readonly section: Obj;
  readonly i18n?: I18n<Obj>;
  readonly why?: string;
}
/** blocks added to a section, before its block number `at` of the lesson as it is now (none: at its end) */
export interface BlocksOp {
  readonly op: 'blocks';
  readonly section: string;
  readonly at?: number;
  readonly blocks: readonly Block[];
  readonly i18n?: I18n<readonly Block[]>;
  readonly why?: string;
}
export type ItemKind = 'exercises' | 'flashcards' | 'pitfalls';
/** exercises, flashcards or pitfalls added to the chapter */
export interface ItemsOp {
  readonly op: ItemKind;
  readonly items: readonly Item[];
  readonly i18n?: I18n<readonly Item[]>;
  readonly why?: string;
}
/** entries added to the chapter's knowledge map (map.concepts, map.points, map.learnables, map.known: never translated) */
export interface MapOp {
  readonly op: 'map';
  readonly concepts?: readonly Obj[];
  readonly learnables?: readonly Obj[];
  readonly points?: readonly Obj[];
  readonly known?: readonly Obj[];
  readonly why?: string;
}
/** the one change that is not an addition: block `at` of a section replaced — only as an option of a choice */
export interface ReplaceOp {
  readonly op: 'replace';
  readonly section: string;
  readonly at: number;
  readonly block: Block;
  readonly i18n?: I18n<Block>;
  readonly why?: string;
}
export type AddOp = SectionOp | BlocksOp | ItemsOp | MapOp;
export type Op = AddOp | ReplaceOp;

/** what a choice is about: a section already full, content the lesson already has, anything else */
export type ChoiceKind = 'full' | 'duplicate' | 'other';
export interface Option {
  readonly id: string;
  /** the option in the learner's words (the interface language of the request) */
  readonly label: string;
  readonly ops: readonly Op[];
}
export interface Choice {
  readonly id: string;
  readonly kind: ChoiceKind;
  /** the question in the learner's words */
  readonly question: string;
  readonly why?: string;
  /** the option that applies when the learner does not choose (also when they approve without looking) */
  readonly recommended: string;
  readonly options: readonly Option[];
}
/** something the checks fixed by themselves, shown in the review: an addition placed after the section that teaches what it
    uses (op: its index among the update's ops; from → to: section ids; terms: what it uses, when known) */
export interface Note {
  readonly kind: 'placed';
  readonly op: number;
  readonly from: string;
  readonly to: string;
}
/** new entries for a 文A bridge of the pack (pair key as the bridges have it: "ru" or "el.ru"), merged into the learner's
    bridge of that pair when it has one */
export type BridgeAdds = I18n<readonly Obj[]>;

export interface LessonUpdate {
  readonly format: typeof UPDATE_FORMAT;
  readonly v: 1;
  /** the request it answers (none: pasted for a chapter by hand) */
  readonly request?: string;
  readonly pack: string;
  readonly chapter: string;
  /** what it was made for: the pack's version and a hash of the chapter (src/features/lesson-updates/domain/apply.ts) */
  readonly base?: { readonly version: string | null; readonly chapter: string };
  /** two or three lines for the learner: what it adds and why */
  readonly summary: string;
  readonly ops: readonly AddOp[];
  readonly choices?: readonly Choice[];
  readonly notes?: readonly Note[];
  readonly bridges?: BridgeAdds;
}
/** what the learner picked: choice id → option id (a choice left out takes its recommended option) */
export type Picks = Readonly<Record<string, string>>;

/** the request the app records when the learner sends a chat (the synced row a:lessonreq:<id>); the chat itself is a file */
export type RequestState = 'open' | 'proposed' | 'applied' | 'declined' | 'undone';
export interface ChatFile {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
  /** in the account's storage (cloud accounts): updates/<id>/files/<file id> */
  readonly path?: string;
}
export interface LessonRequest {
  readonly v: 1;
  readonly id: string;
  readonly at: string;
  readonly subject: { readonly id: string; readonly title: string; readonly language: string };
  readonly chapter: { readonly id: string; readonly title: string };
  readonly conversation: { readonly id: string; readonly title: string; readonly turns: number };
  /** the learner's own words for Claude (optional) */
  readonly note?: string;
  /** the interface language: the summary, questions and options of the update are written in it */
  readonly locale: string;
  readonly files: readonly ChatFile[];
  state: RequestState;
  /** the learner's picks and when they applied it (the pack version it made) */
  picks?: Picks;
  appliedAt?: string;
  version?: string | null;
  /** when the review last changed (approve, decline, undo) */
  updatedAt?: string;
}
/** the synced card of a proposal (a:lessonup:<id>), written by the connector; the update itself is proposalPath(id) */
export interface ProposalCard {
  readonly v: 1;
  readonly id: string;
  readonly at: string;
  readonly pack: string;
  readonly chapter: string;
  readonly chapterTitle?: string;
  readonly summary: string;
  readonly counts: { readonly additions: number; readonly choices: number; readonly notes: number };
  /** a new proposal for the same request (Claude prepared it again) has a higher rev */
  readonly rev: number;
}

/* ---------- the shape of an update as it comes ---------- */

const SEC_RE = /^ch[0-9]{2}-s[0-9]{2}$/;
const EX_RE = /^ch[0-9]{2}-e[0-9]{3}$/;
const OPS: ReadonlySet<string> = new Set(['section', 'blocks', 'exercises', 'flashcards', 'pitfalls', 'map', 'replace']);
const KINDS: ReadonlySet<string> = new Set(['full', 'duplicate', 'other']);
const ITEM_OPS: ReadonlySet<string> = new Set(['exercises', 'flashcards', 'pitfalls']);
export const isItemOp = (o: Op): o is ItemsOp => ITEM_OPS.has(o.op);

/** every op of an update: its own, then each option's (choice id and option id with each) */
export function allOps(u: LessonUpdate): { op: Op; choice: string | null; option: string | null; index: number }[] {
  const out: { op: Op; choice: string | null; option: string | null; index: number }[] = u.ops.map((op, index) => ({
    op,
    choice: null,
    option: null,
    index,
  }));
  for (const c of u.choices ?? [])
    for (const o of c.options) o.ops.forEach((op, index) => out.push({ op, choice: c.id, option: o.id, index }));
  return out;
}

/** The shape of an update (JSON as it came) against the chapter it is for → the problems (English, for Claude), all at once.
    locales: the languages the pack is translated into — every added text must come in each of them. */
export function shapeProblems(
  raw: unknown,
  chapterIds: { sections: readonly string[]; exercises: readonly string[] },
  locales: readonly string[],
): string[] {
  const P: string[] = [];
  if (!isObj(raw)) return ['the update is not a JSON object'];
  if (raw.format !== UPDATE_FORMAT) P.push(`format must be "${UPDATE_FORMAT}"`);
  if (raw.v !== 1) P.push('v must be 1');
  if (!isStr(raw.pack)) P.push('pack (the subject id) is required');
  if (!isStr(raw.chapter) || !/^ch[0-9]{2}$/.test(raw.chapter)) P.push('chapter must be the chapter id (chNN)');
  if (!isStr(raw.summary)) P.push('summary (two or three lines for the learner, in their language) is required');
  else if (raw.summary.length > 1200) P.push('summary: at most 1200 characters');
  const ops = list(raw.ops);
  if (!Array.isArray(raw.ops)) P.push('ops must be a list');
  const ch = s(raw.chapter);
  const secs = new Set(chapterIds.sections),
    exs = new Set(chapterIds.exercises);
  const newSecs = new Set<string>(),
    newEx = new Set<string>();
  // the sections every op may name: the chapter's and the new ones (of the update's own ops and of any option)
  const every = [...ops, ...objs(raw.choices).flatMap(c => objs(c.options).flatMap(o => list(o.ops)))];
  for (const o of objs(every)) if (o.op === 'section') newSecs.add(s(obj(o.section).id));
  const known = (id: unknown): boolean => typeof id === 'string' && (secs.has(id) || newSecs.has(id));
  const tr = (where: string, o: Obj, want: (loc: string, v: unknown) => string | null): void => {
    const i18n = obj(o.i18n);
    for (const loc of locales) {
      if (!(loc in i18n)) {
        P.push(`${where}: no "${loc}" translation (i18n.${loc}) — every added text comes in each language the pack is translated into`);
        continue;
      }
      const bad = want(loc, i18n[loc]);
      if (bad) P.push(`${where}: i18n.${loc} ${bad}`);
    }
    for (const loc of Object.keys(i18n)) if (!locales.includes(loc)) P.push(`${where}: i18n.${loc} — the pack has no "${loc}" translation`);
  };
  const sameLen = (n: number) => (_: string, v: unknown) =>
    Array.isArray(v) ? (v.length === n ? null : `must have ${String(n)} entries, like the original`) : 'must be a list';
  const one = (where: string, o: Obj, top: boolean): void => {
    const k = s(o.op);
    if (!OPS.has(k)) {
      P.push(`${where}: op must be one of ${[...OPS].join(', ')}`);
      return;
    }
    if (k === 'replace' && top)
      P.push(`${where}: "replace" changes the lesson, so it may only be an option of a choice the learner makes (kind "full")`);
    if (o.why !== undefined && !isStr(o.why)) P.push(`${where}: why must be a text`);
    if (k === 'section') {
      const sc = obj(o.section),
        id = s(sc.id);
      if (!SEC_RE.test(id) || !id.startsWith(ch + '-')) P.push(`${where}: section.id must be a new ${ch}-sNN`);
      else if (secs.has(id)) P.push(`${where}: section ${id} exists already — use a free number`);
      if (o.after !== null && !known(o.after)) P.push(`${where}: after must be a section of ${ch} (or null for the first place)`);
      if (!isStr(sc.title) || !Array.isArray(sc.blocks) || !sc.blocks.length) P.push(`${where}: the section needs a title and blocks`);
      tr(where, o, (_, v) => {
        const t = obj(v);
        return !isStr(t.title) || !Array.isArray(t.blocks)
          ? 'must be the section translated (title, blocks)'
          : t.blocks.length === list(sc.blocks).length
            ? null
            : `must have the ${String(list(sc.blocks).length)} blocks of the original`;
      });
      return;
    }
    if (k === 'blocks' || k === 'replace') {
      if (!known(o.section)) P.push(`${where}: section must be a section of ${ch}`);
      if (o.at !== undefined && !(Number.isInteger(o.at) && (o.at as number) >= 0))
        P.push(`${where}: at must be a block number (0 = first)`);
      if (k === 'replace' && !Number.isInteger(o.at)) P.push(`${where}: at (the block replaced) is required`);
      if (k === 'blocks') {
        const bs = list(o.blocks);
        if (!bs.length || !bs.every(isObj)) P.push(`${where}: blocks must be a non-empty list of blocks`);
        tr(where, o, sameLen(bs.length));
      } else {
        if (!isObj(o.block)) P.push(`${where}: block must be a block`);
        tr(where, o, (_, v) => (isObj(v) ? null : 'must be the block translated'));
      }
      return;
    }
    if (ITEM_OPS.has(k)) {
      const items = list(o.items);
      if (!items.length || !items.every(isObj)) P.push(`${where}: items must be a non-empty list`);
      if (k !== 'pitfalls')
        for (const it of objs(items)) {
          const id = s(it.id);
          if (k === 'exercises' && (!EX_RE.test(id) || !id.startsWith(ch + '-')))
            P.push(`${where}: exercise id "${id}" must be a new ${ch}-eNNN`);
          else if (k === 'flashcards' && !isStr(it.id)) P.push(`${where}: every flashcard needs an id (new in the chapter)`);
          if (exs.has(id) || newEx.has(id)) P.push(`${where}: id "${id}" is used already — use a free one`);
          newEx.add(id);
          if (!known(it.section)) P.push(`${where}: ${id}: section "${s(it.section)}" is not a section of ${ch}`);
        }
      tr(where, o, sameLen(items.length));
      return;
    }
    if (k === 'map') {
      if (![o.concepts, o.points, o.learnables, o.known].some(x => Array.isArray(x) && x.length))
        P.push(`${where}: map needs concepts, points, learnables or known`);
    }
  };
  ops.forEach((o, i) => {
    if (!isObj(o)) P.push(`ops[${String(i)}]: must be an object`);
    else one(`ops[${String(i)}]`, o, true);
  });
  const cids = new Set<string>();
  objs(raw.choices).forEach((c, i) => {
    const w = `choices[${String(i)}]`;
    if (!isStr(c.id) || cids.has(c.id)) P.push(`${w}: id must be a unique text`);
    cids.add(s(c.id));
    if (!KINDS.has(s(c.kind))) P.push(`${w}: kind must be one of ${[...KINDS].join(', ')}`);
    if (!isStr(c.question)) P.push(`${w}: question (in the learner's language) is required`);
    const opts = objs(c.options);
    if (opts.length < 2 || opts.length > 4) P.push(`${w}: two to four options`);
    const oids = new Set<string>();
    opts.forEach((o, j) => {
      if (!isStr(o.id) || oids.has(o.id)) P.push(`${w}.options[${String(j)}]: id must be a unique text`);
      oids.add(s(o.id));
      if (!isStr(o.label) || o.label.length > 120) P.push(`${w}.options[${String(j)}]: label (at most 120 characters) is required`);
      if (!Array.isArray(o.ops)) P.push(`${w}.options[${String(j)}]: ops must be a list ([] = add nothing)`);
      objs(o.ops).forEach((x, n) => {
        one(`${w}.options[${String(j)}].ops[${String(n)}]`, x, false);
      });
    });
    if (!oids.has(s(c.recommended))) P.push(`${w}: recommended must be the id of one of its options`);
  });
  if (raw.choices !== undefined && !Array.isArray(raw.choices)) P.push('choices must be a list');
  if (raw.bridges !== undefined && (!isObj(raw.bridges) || !Object.values(raw.bridges).every(v => Array.isArray(v) && v.every(isObj))))
    P.push('bridges must be { "<pair>": [entries] }');
  if (!ops.length && !objs(raw.choices).length) P.push('the update adds nothing');
  return P;
}
