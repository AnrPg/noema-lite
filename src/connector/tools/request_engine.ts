/* noema_request_engine — ask for a new engine of interactive activities (the catalogue is consulted first) */
import { argFlag, fail, text, type Tool } from '../tool.ts';
import { suggestedText } from '../services/admin.ts';
import type { EngineRequestRow } from '../engine/api.ts';
import { message } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_request_engine',
    description:
      'Ask for a NEW engine of interactive activities (sim-spec@1) when no engine of the library fits (docs/INTERACTIVE_LIBRARY.md §3): what should be simulated, as precisely as possible. FIRST read noema_authoring_guide part "interactive": the library (formula, ode, prob, graph, geom, genetics, seq, med, clinic, anatomy, timeline, music, map, text, craft) and the free way (html-app@1, py-module@1) usually fit. With check_only true it only ranks what may already do it (nothing is stored). The app\'s admins answer each request (status, the engine that now does it, a note, the PR); the person sees the answer on #/engines (⋮ › Engines of activities) and with noema_engine_requests. At most 20 a day.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'a short name, 4–120 characters (e.g. "Chemical equilibrium and Le Chatelier")',
        },
        what: {
          type: 'string',
          description: 'what should be simulated: the phenomenon or model, its variables and laws, 40–4000 characters',
        },
        field: {
          type: 'string',
          description: 'the subject area (≤ 120)',
        },
        learner: {
          type: 'string',
          description: 'what the learner changes and what they should see (≤ 2000)',
        },
        measure: {
          type: 'string',
          description: 'what is measured, graded or found (≤ 2000)',
        },
        sources: {
          type: 'string',
          description: 'books, papers, standards the model must follow (≤ 2000)',
        },
        examples: {
          type: 'string',
          description: 'one or two exercises it should make possible (≤ 2000)',
        },
        accuracy: {
          type: 'string',
          enum: ['teaching', 'quantitative', 'research'],
          description: 'default teaching (the right behaviour); quantitative = numbers a course checks; research = research-grade',
        },
        subject: {
          type: 'string',
          description: 'the subject id it is for, if any',
        },
        locale: {
          type: 'string',
          description: 'the language the request is written in (e.g. el)',
        },
        check_only: {
          type: 'boolean',
          description: 'only show what the catalogue suggests; store nothing',
        },
      },
      required: ['title', 'what'],
    },
  },
  async handler(args, ctx) {
    const Q = ctx.engine.engineRequests;
    const { row, problems } = Q.normalize({ ...args, via: 'claude' });
    const words: Record<string, (f: string) => string> = {
      missing: () => 'required',
      short: f => `at least ${Q.FIELDS[f]?.min} characters`,
      long: f => `at most ${Q.FIELDS[f]?.max} characters`,
      value: () => 'not one of the allowed values',
    };
    if (problems.length)
      return fail('The request is not complete:\n' + problems.map(p => `- ${p.field}: ${words[p.code]?.(p.field) ?? p.code}`).join('\n'));
    const intro = `The catalogue suggests these may already do it (check them first: docs/INTERACTIVE_LIBRARY.md and the chapter docs/library/<name>.md; extending an engine of the library is better than a new one):\n${suggestedText(ctx, row.suggested)}`;
    if (argFlag(args, 'check_only'))
      return text(intro + '\n\nNothing was stored (check_only). Call again without check_only to send the request.');
    let r: EngineRequestRow[] | null;
    try {
      r = await ctx.sb.request<EngineRequestRow[] | null>('/rest/v1/noema_engine_requests', {
        method: 'POST',
        body: [row],
        headers: { Prefer: 'return=representation' },
      });
    } catch (e) {
      return fail(message(e).replace(/^Supabase \d+: /, ''));
    }
    const got = r?.[0] ?? row;
    return text(
      `✅ Request sent: ${got.id || ''} “${got.title}”. The app's admins answer it; the person sees the answer on #/engines (⋮ › Engines of activities) and here with noema_engine_requests.\n\n${intro}`,
    );
  },
};
