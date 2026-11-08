/* noema_engine_requests — the requests for new engines: the person's own, or all of them for admins */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { isAdmin } from '../services/admin.ts';
import type { EngineRequestRow } from '../engine/api.ts';
import { str, UUID_RE } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_engine_requests',
    description:
      "The requests for new engines of interactive activities: this account's own, with their status and answer; for the app's admins (noema_admins) every request (status filter), each with its brief — the markdown to build the engine from (docs/INTERACTIVE_LIBRARY.md §1). Answer one with noema_engine_request_update.",
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'new', 'seen', 'planned', 'building', 'available', 'declined', 'duplicate', 'all'],
          description: 'default: all of your own; for admins default open (= new, seen, planned, building)',
        },
        id: {
          type: 'string',
          description: 'one request: its full brief',
        },
        limit: {
          type: 'integer',
          description: 'default 30, max 200',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async handler(args, ctx) {
    const Q = ctx.engine.engineRequests,
      admin = await isAdmin(ctx),
      sel = `select=${Q.COLS}`;
    if (args.id != null && args.id !== '') {
      const id = argStr(args, 'id');
      if (!UUID_RE.test(id)) return fail('id: a request id from noema_engine_requests');
      const r = (await ctx.sb.request<EngineRequestRow[]>(`/rest/v1/noema_engine_requests?${sel}&id=eq.${id}`))[0];
      if (!r) return fail('No request with that id (or it is not yours).');
      if (admin && r.status === 'new')
        await ctx.sb
          .request(`/rest/v1/noema_engine_requests?id=eq.${id}`, {
            method: 'PATCH',
            body: { status: 'seen' },
            headers: { Prefer: 'return=minimal' },
          })
          .catch(() => null);
      return text(
        Q.brief(r) +
          (r.answer || r.engine_id
            ? `\n\n## The answer\n\n${r.engine_id ? 'Now done by ' + r.engine_id + '. ' : ''}${r.answer || ''}${r.fixed_in ? '\n\nBuilt in ' + r.fixed_in : ''}`
            : ''),
      );
    }
    const st = argStr(args, 'status') || (admin ? 'open' : 'all'),
      lim = Math.max(1, Math.min(200, Number(args.limit) || 30));
    const f = st === 'all' ? '' : '&status=in.(' + (st === 'open' ? Q.OPEN : [st]).join(',') + ')';
    const who = admin ? '' : `&requester=eq.${encodeURIComponent(ctx.uid)}`;
    const rows = await ctx.sb.request<EngineRequestRow[]>(
      `/rest/v1/noema_engine_requests?${sel}${f}${who}&order=created_at.desc&limit=${lim}`,
    );
    if (!rows.length) return text(`No ${st === 'all' ? '' : st + ' '}requests for new engines${admin ? '' : ' from this account'}.`);
    return text(
      `${rows.length} ${st} request(s) for new engines${admin ? ' (all people: this account is an admin)' : ''}, newest first. Read one with noema_engine_requests (id).\n\n` +
        rows
          .map(
            r =>
              `- ${r.id} · ${str(r.created_at).slice(0, 16)} · ${r.status}${r.engine_id ? ' → ' + r.engine_id : ''} · ${r.accuracy} · ${r.field || '-'} · “${r.title}”${admin ? ' · ' + (r.requester_name || '?') : ''}${r.suggested?.length ? ' · suggested ' + r.suggested.join(', ') : ''}`,
          )
          .join('\n'),
    );
  },
};
