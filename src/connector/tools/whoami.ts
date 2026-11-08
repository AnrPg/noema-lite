/* noema_whoami — who the connector is signed in as, and the private packs */
import { text, type Tool } from '../tool.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_whoami',
    description: 'Which noema-lite account is connected, and its private subject packs.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async handler(args, ctx) {
    const list = await ctx.storage.list(`${ctx.uid}/packs/`);
    return text(
      `Connected to noema-lite as ${ctx.user.email || ctx.uid}.\nPrivate packs: ${
        list
          .filter(o => o.name.endsWith('.json'))
          .map(o => o.name.replace(/\.json$/, ''))
          .join(', ') || '(none yet)'
      }`,
    );
  },
};
