/* noema_report_update — change a problem report: status, note, fixed_in (admins) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { isAdmin, NOT_ADMIN_REPORTS } from '../services/admin.ts';
import type { ReportRow } from '../engine/api.ts';
import { UUID_RE } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_report_update",
    "description": "Answer a problem report (admins only): its status (seen, fixing, fixed, wontfix, duplicate), a note for the team, and where it was fixed (a commit, a pull request, a pack version). What the reporter sent never changes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "new",
            "seen",
            "fixing",
            "fixed",
            "wontfix",
            "duplicate"
          ]
        },
        "note": {
          "type": "string",
          "description": "the admin note (≤ 4000 characters)"
        },
        "fixed_in": {
          "type": "string",
          "description": "commit sha, pull request URL or pack version (≤ 300)"
        }
      },
      "required": [
        "id"
      ]
    }
  },
  async handler(args, ctx) {
    const R = ctx.engine.report;
    if (!await isAdmin(ctx)) return fail(NOT_ADMIN_REPORTS);
    const id = argStr(args, 'id'); if (!UUID_RE.test(id)) return fail('id: a report id from noema_reports');
    const patch: Record<string, unknown> = {};
    if (args.status != null) { if (!R.STATUSES.includes(String(args.status))) return fail('status: one of ' + R.STATUSES.join(', ')); patch.status = String(args.status); }
    if (args.note != null) patch.admin_note = String(args.note).slice(0, 4000) || null;
    if (args.fixed_in != null) patch.fixed_in = String(args.fixed_in).slice(0, 300) || null;
    if (!Object.keys(patch).length) return fail('Nothing to change: give status, note or fixed_in.');
    const done = await ctx.sb.request<ReportRow[] | null>(`/rest/v1/noema_error_reports?id=eq.${id}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } });
    const d = done?.[0]; if (!d) return fail('No report with that id.');
    return text(`✅ Report ${id}: ${d.status}${d.fixed_in ? ' · fixed in ' + d.fixed_in : ''}.`);
  },
};
