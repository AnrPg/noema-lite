/* noema_roadmap_map — the map of a Roadmap as Claude needs it to grow it */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { roadmapMapText } from '../services/roadmap.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_roadmap_map',
    description:
      'An existing Roadmap as it stands (with what is still waiting in its inbox): every step in study order with its id — the "@id" that is its permanent connection point — title, summary, role, prerequisites, state (prepared, queued, planned, needs a plan), part, and the chapters it teaches; then its parts. Read it before noema_extend_roadmap (to join the new part to the right steps, and not to add again what the map already teaches) and before writing a new step\'s knowledge map (points already taught earlier on the map go to taughtIn).',
    inputSchema: {
      type: 'object',
      properties: {
        curriculum_id: {
          type: 'string',
          description: 'from noema_curricula (may be omitted when the learner has one Roadmap)',
        },
      },
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'), { any: true });
    if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    return text(roadmapMapText(ctx.engine, await curState(ctx, pk.c, ctx.uid)));
  },
};
