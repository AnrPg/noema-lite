/* noema_engine_request_update — answer a request for a new engine (admins) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { isAdmin } from '../services/admin.ts';
import { cleanRequestPatch, type EngineRequestRow } from '../../features/reports/domain/index.ts';
import { UUID_RE } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_engine_request_update',
    description:
      'Answer a request for a new engine (admins only): its status (seen, planned, building, available, declined, duplicate), the engine that now does it (engine_id, e.g. chem@1, when available or duplicate), a note the requester reads (answer) and where it was built (fixed_in: a pull request or commit). What the requester wrote never changes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
        },
        status: {
          type: 'string',
          enum: ['new', 'seen', 'planned', 'building', 'available', 'declined', 'duplicate'],
        },
        engine_id: {
          type: 'string',
          description: 'an engine id such as chem@1',
        },
        answer: {
          type: 'string',
          description: 'the note for the requester (≤ 4000)',
        },
        fixed_in: {
          type: 'string',
          description: 'pull request URL or commit (≤ 300)',
        },
      },
      required: ['id'],
    },
  },
  async handler(args, ctx) {
    if (!(await isAdmin(ctx)))
      return fail(
        "Only the app's admins (table noema_admins, cloud/supabase.sql §13b) answer requests for new engines; this account is not one.",
      );
    const id = argStr(args, 'id');
    if (!UUID_RE.test(id)) return fail('id: a request id from noema_engine_requests');
    const patch = cleanRequestPatch(args);
    if ('error' in patch) return fail(patch.error);
    if (!Object.keys(patch).length) return fail('Nothing to change: give status, engine_id, answer or fixed_in.');
    const done = await ctx.sb.request<EngineRequestRow[] | null>(`/rest/v1/noema_engine_requests?id=eq.${id}`, {
      method: 'PATCH',
      body: patch,
      headers: { Prefer: 'return=representation' },
    });
    const d = done?.[0];
    if (!d) return fail('No request with that id.');
    return text(`✅ Request ${id}: ${d.status}${d.engine_id ? ' → ' + d.engine_id : ''}${d.fixed_in ? ' · built in ' + d.fixed_in : ''}.`);
  },
};
