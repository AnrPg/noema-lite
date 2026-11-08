/* A Roadmap's own texts for Claude: what is still to translate (docs/CURRICULUM.md §10) and the map to grow it from (§6). */
import type { Curriculum, EngineApi } from '../engine/api.ts';
import { str } from '../util.ts';
import { ladderLine, levelText, pendingProposal } from '../../features/roadmaps/domain/index.ts';
import type { Roadmap } from '../../features/roadmaps/domain/model.ts';

export interface RoadmapTodo {
  loc: string;
  todo: { title?: string; goal?: string; nodes: Record<string, Record<string, unknown>> };
}

/** 🌐 What of a Roadmap is still to be translated into the locales every pack gets — the source texts, ready for
    noema_save_roadmap_translation. only: a step id → that step alone (with the Roadmap's title). */
export function roadmapTodo(E: EngineApi, c: Curriculum, { only = null }: { only?: string | null } = {}): RoadmapTodo[] {
  const want = E.content.requiredLocales(c.language || 'en').translations,
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
  return `The Roadmap “${c.title || c.goal}” (curriculum_id ${c.id}) · ${c.language || 'en'} · ${rows.length} steps, ${c.edges.length} links${c.shared && !c.shared.ended ? (c.shared.role === 'member' ? ` · 👥 shared by ${c.shared.ownerName || 'its owner'} (read only: the owner adds parts)` : ' · 👥 shared by the learner') : ''}\n\nSteps in study order — "@id" is each step's permanent connection point:\n${rows.join('\n')}\n\nParts:\n${P}\n\nTo grow it (noema_extend_roadmap): new steps get their own refs (n1, n2…); "prerequisites": ["@id"] = what a new step builds on, "before": ["@id"] = a step above that is not prepared yet and must come after the new one. Link to a step that already teaches a topic; never add it again. A missing link between two steps that are on the map already (prepared ones too): noema_link_roadmap_steps.${L}`;
}
