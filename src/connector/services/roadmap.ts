/* A Roadmap's own texts for Claude: what is still to translate (docs/CURRICULUM.md §10) and the map to grow it from (§6). */
import type { Curriculum, EngineApi, Pack } from '../engine/api.ts';
import type { ToolContext } from '../tool.ts';
import { str } from '../util.ts';
import {
  addChapters,
  chaptersEntry,
  checkAddChapters,
  ladderLine,
  languagesOf,
  levelText,
  pendingProposal,
  setLanguages,
  stampAfter,
  type ChapterAdd,
  type RoadmapLanguages,
} from '../../features/roadmaps/domain/index.ts';
import type { Roadmap } from '../../features/roadmaps/domain/model.ts';
import { curState, findInboxStep, stepOfPack } from './curricula.ts';

export interface RoadmapTodo {
  loc: string;
  todo: { title?: string; goal?: string; nodes: Record<string, Record<string, unknown>> };
}

/** 🌐 What of a Roadmap is still to be translated into the locales every pack gets — the source texts, ready for
    noema_save_roadmap_translation. only: a step id → that step alone (with the Roadmap's title). */
export function roadmapTodo(E: EngineApi, c: Curriculum, { only = null }: { only?: string | null } = {}): RoadmapTodo[] {
  const want = E.content.requiredLocales(c.language || 'en', languagesOf(c as unknown as Roadmap)).translations,
    out: RoadmapTodo[] = [];
  for (const loc of want) {
    const T = E.curriculum.i18nTodo(c, loc),
      ids = only ? [only] : Object.keys(c.nodes);
    const nodes: Record<string, Record<string, unknown>> = {};
    for (const id of ids) {
      const n = c.nodes[id];
      if (!n) continue;
      const x: Record<string, unknown> = {};
      if (T.nodes.includes(id)) {
        x.title = n.title;
        if (n.summary) x.summary = n.summary;
      }
      if (T.goals.includes(id)) x.learningGoals = n.learningGoals;
      if ((T.domains ?? []).includes(id)) x.domains = n.domains;
      if (T.chapters.includes(id))
        x.chapters = Object.fromEntries(
          (n.chapters ?? []).map(ch => [
            ch.ref,
            {
              title: ch.title,
              ...(ch.goals?.length ? { goals: ch.goals } : {}),
              ...(ch.coverage?.length ? { coverage: ch.coverage } : {}),
            },
          ]),
        );
      if (Object.keys(x).length) nodes[id] = x;
    }
    if (T.title || Object.keys(nodes).length)
      out.push({
        loc,
        todo: { ...(T.title ? { title: c.title || c.goal || '', ...(c.goal !== undefined ? { goal: c.goal } : {}) } : {}), nodes },
      });
  }
  return out;
}

export function roadmapTodoText(E: EngineApi, c: Curriculum, opts: { only?: string | null } = {}): string {
  const todo = roadmapTodo(E, c, opts);
  if (!todo.length) return '';
  return (
    `\n🌐 Translate the Roadmap's own words too (they belong with the packs' translations — the map, its step titles, learning goals and chapters show in the learner's language): call noema_save_roadmap_translation with curriculum_id "${c.id}", the locale and translation_json = the same object with every text translated (keep the keys, the ids, the chapter refs and the number of learning goals). Still in ${c.language || 'en'}:\n` +
    todo
      .map(x => `- ${x.loc}: ${JSON.stringify(x.todo)}`)
      .join('\n')
      .slice(0, 60000)
  );
}

/** 🌱 The map as Claude needs it to grow it (noema_roadmap_map): every step in study order with its permanent "@id". */
export function roadmapMapText(E: EngineApi, c: Curriculum): string {
  const parts = c.parts ?? [],
    partOf = (addedIn: string | undefined): number => {
      const i = parts.findIndex(p => p.id === addedIn);
      return i > 0 ? i + 1 : 1;
    };
  const state = (n: Curriculum['nodes'][string]): string =>
    n.pack?.assigned
      ? `taught by the learner's subject “${n.pack.title || n.pack.id}”`
      : n.pack?.status === 'ready'
        ? 'prepared'
        : n.pack?.status === 'generating'
          ? 'being prepared'
          : n.pack?.status === 'app'
            ? n.pack.claimedAt
              ? 'being prepared by a run'
              : 'queued to prepare'
            : n.chapters?.length
              ? 'planned'
              : 'needs its chapter plan';
  const rows = E.curriculum.order(c).map(id => {
    const n = c.nodes[id];
    if (!n) return '';
    const pre = c.edges.filter(e => e.to === id).map(e => '@' + e.from);
    const chs = (n.chapters ?? [])
      .filter(ch => ch.title)
      .map(ch => `${ch.ref} ${String(ch.title)}${typeof ch.level === 'string' && ch.level ? ` [${ch.level}]` : ''}`);
    const lv = levelText(n);
    return `- @${id} — “${n.title}” · ${n.role || 'aspect'}${lv ? ` · level ${lv}` : ''} · ${state(n)}${parts.length > 1 ? ` · part ${partOf(n.addedIn)}` : ''}${pre.length ? ` · after ${pre.join(', ')}` : ' · a starting step'}${n.summary ? `\n    ${str(n.summary).slice(0, 300)}` : ''}${chs.length ? `\n    chapters: ${chs.join(' · ').slice(0, 600)}` : ''}`;
  });
  const P = parts.length
    ? parts.map((p, i) => `${i + 1}. “${p.title}” (${str(p.at).slice(0, 10)}) — ${(p.steps ?? []).length} step(s)`).join('\n')
    : `1. “${c.title || c.goal}” — the whole map so far`;
  const R = c as unknown as Roadmap,
    pend = pendingProposal(R),
    L = c.levels?.length
      ? `\n\nLevels (lowest first): ${ladderLine(R)}${c.levelTest ? ' · a level test before moving up' : ''}. A chapter at another level than its step shows it in [ ]. To rearrange by level (move, split or merge steps): noema_restructure_levels${pend ? ` — a proposal of ${pend.at.slice(0, 10)} waits for the learner's decision` : ''}.`
      : `\n\nNo levels. To give it levels (grades, semesters, years, difficulty): noema_restructure_levels.`;
  return `The Roadmap “${c.title || c.goal}” (curriculum_id ${c.id}) · ${c.language || 'en'} · ${rows.length} steps, ${c.edges.length} links${c.shared && !c.shared.ended ? (c.shared.role === 'member' ? ` · 👥 shared by ${c.shared.ownerName || 'its owner'} (read only: the owner adds parts)` : ' · 👥 shared by the learner') : ''}\n\nSteps in study order — "@id" is each step's permanent connection point:\n${rows.join('\n')}\n\nParts:\n${P}\n\nTo grow it (noema_extend_roadmap): new steps get their own refs (n1, n2…); "prerequisites": ["@id"] = what a new step builds on, "before": ["@id"] = a step above that is not prepared yet and must come after the new one. Link to a step that already teaches a topic; never add it again. A missing link between two steps that are on the map already (prepared ones too): noema_link_roadmap_steps.${L}\n\nLanguages: ${languagesLine(E, c)}.`;
}

/* ---------- 📑 chapters added to a step, 🌐 the Roadmap's languages (docs/CURRICULUM.md §2c, §10b) ---------- */

/** The step's chapters as Claude checks them: "ref “title”" in order, the added ones marked. */
export const chapterList = (c: Curriculum, nid: string): string =>
  (c.nodes[nid]?.chapters ?? [])
    .map((ch, i) => `${i + 1}. ${ch.ref} “${String(ch.title)}”${(ch as { addedAt?: unknown }).addedAt ? ' (added)' : ''}`)
    .join('\n');

/** Add checked chapters to a step: straight into the Roadmap (a compare-and-swap write, so it does not wait for an app tab) and
    as an inbox entry (the app applies it again harmlessly: a chapter already there is left as it is). `c` is the Roadmap as
    it will be (curState). → whether the direct write landed. */
export async function writeChapters(
  ctx: ToolContext,
  c: Curriculum,
  nid: string,
  add: readonly ChapterAdd[],
  seq: string,
  why = '',
): Promise<boolean> {
  const CJ = ctx.engine.curJobs,
    now = Date.now(),
    entry = chaptersEntry(nid, add, now, why);
  const direct = await ctx.kv
    .update<Curriculum | null>('a:curriculum:' + c.id, cur => {
      if (!cur || cur.id !== c.id || !cur.nodes[nid]) return null; // a step still in the inbox (a new part): the entry brings it
      const r = checkAddChapters(cur as unknown as Roadmap, nid, add);
      if (r.errors.length || !r.fresh.length) return null;
      addChapters(cur as unknown as Roadmap, nid, r.fresh, now);
      return cur;
    })
    .catch(() => false);
  await ctx.kv.put(CJ.inboxKey(c.id, seq), entry);
  addChapters(c as unknown as Roadmap, nid, add, now); // the caller's view, for its receipt
  return direct;
}

/** Set the Roadmap's languages: straight into it and as an inbox entry (like writeChapters). */
export async function writeLanguages(ctx: ToolContext, c: Curriculum, v: RoadmapLanguages, seq: string): Promise<boolean> {
  const CJ = ctx.engine.curJobs,
    at = stampAfter(Date.now(), languagesOf(c as unknown as Roadmap)?.at); // one version for the write and the entry
  const direct = await ctx.kv
    .update<Curriculum | null>('a:curriculum:' + c.id, cur => {
      if (!cur || cur.id !== c.id) return null;
      return setLanguages(cur as unknown as Roadmap, v, at) ? cur : null;
    })
    .catch(() => false);
  await ctx.kv.put(CJ.inboxKey(c.id, seq), { v: 1, kind: 'languages', data: v, at, via: 'claude-app' });
  setLanguages(c as unknown as Roadmap, v, at);
  return direct;
}

/** The languages a pack gets: its own subject.authoring.languages, else its Roadmap's (the step it teaches), else null (the
    pack rules' default). */
export async function scopeOfPack(ctx: ToolContext, p: Pack, c: Curriculum | null = null): Promise<unknown> {
  const own = (p.subject.authoring as { languages?: unknown } | undefined)?.languages;
  if (own) return own;
  const cur =
    c ?? ((await stepOfPack(ctx, p.subject.id).catch(() => null)) ?? (await findInboxStep(ctx, p.subject.id).catch(() => null)))?.c ?? null;
  if (!cur) return null;
  // the Roadmap as the learner's app will have it: noema_set_roadmap_languages also leaves its languages in the inbox, and the
  // stored copy may not have them yet (bug 2026-11-21: an en + el Roadmap was told to make ru, de, fr and their bridges)
  const now = await curState(ctx, cur, ctx.uid).catch(() => cur);
  return languagesOf(now as unknown as Roadmap) ?? languagesOf(cur as unknown as Roadmap);
}

/** The Roadmap's languages as a line for Claude. */
export function languagesLine(E: EngineApi, c: Curriculum): string {
  const sc = languagesOf(c as unknown as Roadmap),
    r = E.content.requiredLocales(c.language || 'en', sc);
  return `${sc ? 'set for this Roadmap' : 'the default (no languages set for this Roadmap: noema_set_roadmap_languages)'} — full translations: ${r.translations.join(', ') || 'none'}; 文A bridges: ${r.bridgePairs.map(x => `${x.source}>${x.native}`).join(', ') || 'none'}`;
}
