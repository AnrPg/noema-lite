/* noema_lang_courses — the learner's language courses made through Claude and what waits in each */
import { text, type Tool } from '../tool.ts';
import { langLine, langRecords, langState } from '../services/lang.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_lang_courses',
    description:
      "The learner's language courses made through Claude (🌍 Languages → ✨ New language course) and the refill queues of library courses, with the tasks waiting in each: the core of a course, a node in a language (words + paradigms + sentences), a grammar realization, a comparison, more sentences with the words the learner knows.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async handler(args, ctx) {
    const all = await langRecords(ctx);
    if (!all.length)
      return text(
        'No language course made through Claude yet. In noema-lite: 🌍 Languages → ✨ New language course, and choose “Claude app”.',
      );
    const states = await Promise.all(
      all.map(async r => {
        try {
          return (await langState(ctx, r)).rec;
        } catch {
          return r;
        }
      }),
    );
    return text(
      `The learner's language courses:\n${states.map(r => langLine(ctx, r)).join('\n')}\n\nCall noema_lang_task with a course_id to get the next task.`,
    );
  },
};
