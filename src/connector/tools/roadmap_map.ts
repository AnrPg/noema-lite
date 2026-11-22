/* noema_roadmap_map — the map of a Roadmap as Claude needs it to grow it */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { roadmapMapText } from '../services/roadmap.ts';
import { findStep } from '../../features/roadmaps/domain/index.ts';
import type { Roadmap } from '../../features/roadmaps/domain/model.ts';
import type { ToolContext } from '../tool.ts';

const isO = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
/** Q0 across the Roadmap: the concepts the prepared steps before `nid` taught (their packs' concept maps), as subject.json
    "authoring": { "known": [...] } — each with from "@<step id>", so a pack never declares again in map.known an acronym or a
    term an earlier step taught (gradual.ts reads them as known in every chapter) */
async function knownFor(ctx: ToolContext, c: Roadmap, nid: string): Promise<string> {
  const before = new Set<string>(),
    todo = [nid];
  while (todo.length) {
    const x = todo.pop() as string;
    for (const e of c.edges)
      if (e.to === x && !before.has(e.from) && c.nodes[e.from]) {
        before.add(e.from);
        todo.push(e.from);
      }
  }
  const out: Record<string, unknown>[] = [],
    seen = new Set<string>(),
    skipped: string[] = [];
  for (const id of [...before].slice(0, 40)) {
    const n = c.nodes[id],
      pid = n?.pack?.id;
    if (!n || n.pack?.status !== 'ready' || typeof pid !== 'string') {
      skipped.push(`@${id}`);
      continue;
    }
    let p: unknown = null;
    try {
      p = JSON.parse((await ctx.storage.text(`${ctx.uid}/packs/${pid}.json`)) ?? 'null');
    } catch {
      p = null;
    }
    if (!isO(p)) {
      skipped.push(`@${id}`);
      continue;
    }
    for (const ch of Array.isArray(p.chapters) ? p.chapters : [])
      for (const k of isO(ch) && isO(ch.map) && Array.isArray(ch.map.concepts) ? ch.map.concepts : []) {
        if (!isO(k)) continue;
        const terms = strs(k.terms),
          units = strs(k.units),
          symbols = strs(k.symbols),
          key = JSON.stringify([terms, units, symbols]);
        if ((!terms.length && !units.length && !symbols.length) || seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: `${id}.${typeof k.id === 'string' ? k.id : String(out.length)}`.slice(0, 80),
          ...(terms.length ? { terms } : {}),
          ...(units.length ? { units } : {}),
          ...(symbols.length ? { symbols } : {}),
          from: '@' + id,
        });
      }
  }
  return (
    `\n\n# Known from the steps before @${nid} (Q0)\n` +
    (out.length
      ? `${out.length} concept(s) the prepared steps before it taught. Put them into the pack's subject.json as "authoring": { "known": <the list below> } (keep the other authoring keys): every chapter then reads them as known, so its acronyms and terms need no map.known entry again — what the step teaches anew still goes in map.concepts.\n${JSON.stringify(out)}`
      : 'No concept maps found in the steps before it.') +
    (skipped.length ? `\n(Not prepared yet or no pack to read: ${skipped.join(', ')}.)` : '')
  );
}

export const tool: Tool = {
  definition: {
    name: 'noema_roadmap_map',
    description:
      'An existing Roadmap as it stands (with what is still waiting in its inbox): every step in study order with its id — the "@id" that is its permanent connection point — title, summary, role, prerequisites, state (prepared, queued, planned, needs a plan), part, and the chapters it teaches; then its parts. Read it before noema_extend_roadmap (to join the new part to the right steps, and not to add again what the map already teaches) and before writing a new step\'s knowledge map (points already taught earlier on the map go to taughtIn). With known_for: also the concepts the prepared steps before that step taught, ready for subject.json "authoring": { "known": [...] } (Q0 reads them as known).',
    inputSchema: {
      type: 'object',
      properties: {
        curriculum_id: {
          type: 'string',
          description: 'from noema_curricula (may be omitted when the learner has one Roadmap)',
        },
        known_for: {
          type: 'string',
          description:
            'optional: a step ("@id", id or title) — also list the concepts (terms, units, symbols, acronyms) the prepared steps before it taught, as the "authoring": { "known": [...] } of its subject.json (Q0 then reads them as known in every chapter)',
        },
      },
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'), { any: true });
    if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    const c = await curState(ctx, pk.c, ctx.uid),
      want = argStr(args, 'known_for').replace(/^@/, '');
    if (!want) return text(roadmapMapText(ctx.engine, c));
    const nid = findStep(c as unknown as Roadmap, want);
    if (!nid)
      return fail(`No step “${want}” on “${c.title || c.goal}” — the map below lists the "@id"s.\n\n${roadmapMapText(ctx.engine, c)}`);
    return text(roadmapMapText(ctx.engine, c) + (await knownFor(ctx, c as unknown as Roadmap, nid)));
  },
};
