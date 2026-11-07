/* noema_curricula — the learner's curricula and what waits in each */
import { text, type Tool } from '../tool.ts';
import { curricula, curState, workLine } from '../services/curricula.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_curricula",
    "description": "The learner's noema-lite curricula (maps of steps, each step becomes a subject) and what is waiting for you in each: building the map, planning the chapters of steps, preparing queued steps as subjects.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "annotations": {
      "readOnlyHint": true
    }
  },
  async handler(args, ctx) {
    const all = await curricula(ctx);
    if (!all.length) return text('No curriculum yet. In noema-lite: 🧭 Curricula → ➕ New curriculum or 📥 Import a map, and choose “Claude app (your Claude plan)”.');
    const states = await Promise.all(all.map(c => curState(ctx, c, ctx.uid)));
    return text(`The learner's curricula:\n${states.map(c => workLine(ctx, c)).join('\n')}\n\nCall noema_curriculum_task with a curriculum_id to get the next piece of work.`);
  },
};
