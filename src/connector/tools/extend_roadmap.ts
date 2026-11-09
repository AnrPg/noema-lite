/* noema_extend_roadmap — a new part of a Roadmap from new material (saga "extend": the part is added once, however often it is sent) */
import { argFlag, argOff, argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { roadmapTodoText } from '../services/roadmap.ts';
import { sagaKey } from '../services/sagas.ts';
import { sha256Hex, str } from '../util.ts';
import { LEVELS_DOC } from './create_roadmap.ts';
import { ladderLine } from '../../features/roadmaps/domain/index.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_extend_roadmap',
    description:
      'Grow an EXISTING Roadmap with a new part, from new material the learner gave you (e.g. this week\'s lectures) — the way to build a Roadmap little by little as a course goes on (skill §0c, pipeline flow 9). Never make a second Roadmap for new material of a course that has one. First call noema_roadmap_map and read every new file. Send only the NEW steps, each joined to the map by the one canonical connection: "@<step id>" (ids from noema_roadmap_map) — in "prerequisites" for what a new step builds on, in "before" for a step on the map (not prepared yet) that a new step must come before. A topic the map already has is linked, never added again. It is checked like noema_create_roadmap plus the joins (every "@id" exists, no cycle, the part is connected); the learner\'s app adds it at its next sync and nothing already prepared changes. Then plan and prepare the new steps with noema_curriculum_task.',
    inputSchema: {
      type: 'object',
      required: ['plan_json'],
      properties: {
        curriculum_id: {
          type: 'string',
          description: 'the Roadmap to grow (noema_curricula / noema_roadmap_map)',
        },
        plan_json: {
          type: 'string',
          description:
            'ONE JSON object: { "part": "name of this part, e.g. Week 5 — Thermodynamics", "summary": "…", "levels": [{ "id": "s3", "kind": "semester", "names": { "en": "Semester 3" } }], "steps": [{ "ref": "n1", "title": "…", "summary": "what it covers", "role": "foundation|intro|aspect|subtopic|related|synthesis|application", "prerequisites": ["n0", "@existing_step_id"], "before": ["@existing_step_id"], "level": "s3", "files": ["path/of/file.pdf pp. 3–20", …] }], "files": [{ "path": "path/of/file.pdf", "pages": 40 }] } — refs (n1, n2…) name the new steps inside this part; "@id" names a step already on the map. "files" lists EVERY new file the learner gave you (pages for PDFs); every file must be used by a step. A step\'s "level" is one of the Roadmap\'s levels (noema_roadmap_map lists them); "levels" (leave it out when the ladder has what you need) adds new levels at the top of the ladder (the next semester) or gives a Roadmap without levels its first ladder.' +
            LEVELS_DOC,
        },
        independent: {
          type: 'boolean',
          description:
            'true only when the new part really builds on nothing on the map and nothing there needs it (then no "@id" link is required)',
        },
        prepare: {
          type: 'boolean',
          description:
            'default true: the new steps are queued for you in study order (chapter plans first, then each step as a subject). false: only the map — the learner chooses in the app which steps to prepare.',
        },
      },
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'), { any: true });
    if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    const E = ctx.engine,
      CJ = E.curJobs,
      rawPlan = str(args.plan_json);
    const prepare = !argOff(args, 'prepare'),
      independent = argFlag(args, 'independent');
    const key = sagaKey('extend', pk.c.id, (await sha256Hex([rawPlan, prepare, independent].join('\n'))).slice(0, 40));
    const before = await ctx.sagas.finished<string>(key);
    if (before !== undefined) return text(before + REPLAYED); // sent again after the app merged it: never a second part
    const c = await curState(ctx, pk.c, ctx.uid);
    if (c.shared?.role === 'member' && !c.shared.ended)
      return fail(
        `“${c.title || c.goal}” is shared with the learner by ${c.shared.ownerName || 'its owner'}: its map is the owner's. Only the owner can add a part to it.`,
      );
    if (CJ.work(c).graph)
      return fail(
        `The map of “${c.title || c.goal}” is still being built (noema_curriculum_task): finish it first, then add the new part.`,
      );
    let d: unknown;
    try {
      d = E.llm.parseJSON(rawPlan);
    } catch {
      return fail('plan_json is not valid JSON — send ONE JSON object (no prose around it).');
    }
    const r = E.sourcePlan.extendFromClaude(c, d, { independent, prepare });
    if (r.errors)
      return fail(
        `Your new part has ${r.errors.length} problem(s) — fix ALL of them and call noema_extend_roadmap again with the complete corrected object (noema_roadmap_map lists the steps on the map and their ids):\n- ${r.errors.slice(0, 40).join('\n- ')}`,
      );
    const seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);
    const out = await ctx.sagas.run<string>('extend', key, async s => {
      await s.step('inbox', async () => {
        const k = CJ.inboxKey(c.id, seq);
        await ctx.kv.put(k, r.entry);
        return k;
      });
      const after = await curState(ctx, pk.c, ctx.uid),
        ids = Object.keys(r.entry.nodes);
      const lv = r.entry.levels?.length ? `\nLevels: ${ladderLine(after)} (${r.entry.levels.length} new).` : '';
      const joins = r.entry.edges.filter(x => !r.entry.nodes[x.from] || !r.entry.nodes[x.to]).map(x => `@${x.from} → @${x.to}`);
      return (
        `✅ The part “${r.entry.part.title}” is added to the Roadmap “${c.title || c.goal}” (${c.id}): ${ids.length} new step(s) — ${ids.map(id => `@${id} (“${r.entry.nodes[id]?.title}”)`).join(', ')}; joined to the map by ${joins.length ? joins.join(', ') : 'nothing (an independent part)'}. The learner's app adds it the next time it is open or syncs; nothing already prepared changed.\nNext: call noema_curriculum_task with curriculum_id "${c.id}" — first the chapter plans of the new steps, then ${prepare ? 'each new step in study order (all are queued for you)' : 'the steps the learner queues in the app'}, one subject each, from the files of this chat.${lv}` +
        roadmapTodoText(E, after)
      );
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The new part of “${c.title || c.goal}”`));
  },
};
