/* noema_report — one problem report: the brief, the locator, the screenshot (admins) */
import { argStr, fail, type Tool } from '../tool.ts';
import { isAdmin, NOT_ADMIN_REPORTS } from '../services/admin.ts';
import { reportBrief, type ReportRow } from '../../features/reports/domain/index.ts';
import type { Content } from '../tool.ts';
import { UUID_RE } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_report',
    description:
      "One problem report (admins only), ready to fix: the brief — what the learner wrote, the unique place (subject + pack version, chapter, section, block, exercise or card and the field inside it, its text as shown and in the pack's own language when a translation was shown, the interface text's i18n key, the language course node, the element pointed at with its data-* chain, the learner's answer, recent console errors, the app build), the repository files where it is written (AnrPg/noema-lite) and how to fix it — plus the full locator JSON and the screenshot as an image. Fix it in the repository, then mark it with noema_report_update.",
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'the report id (from noema_reports)',
        },
        screenshot: {
          type: 'boolean',
          description: 'include the screenshot (default true)',
        },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async handler(args, ctx) {
    if (!(await isAdmin(ctx))) return fail(NOT_ADMIN_REPORTS);
    const id = argStr(args, 'id');
    if (!UUID_RE.test(id)) return fail('id: a report id from noema_reports');
    const r = (await ctx.sb.request<ReportRow[]>(`/rest/v1/noema_error_reports?select=*&id=eq.${id}`))[0];
    if (!r) return fail('No report with that id.');
    if (r.status === 'new')
      await ctx.sb
        .request(`/rest/v1/noema_error_reports?id=eq.${id}`, {
          method: 'PATCH',
          body: { status: 'seen' },
          headers: { Prefer: 'return=minimal' },
        })
        .catch(() => null);
    const out: Content[] = [
      {
        type: 'text',
        text:
          reportBrief(r) +
          '\n\n## The locator (everything the app sent)\n\n```json\n' +
          JSON.stringify(r.locator ?? {}, null, 1).slice(0, 60000) +
          '\n```',
      },
    ];
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(r.shot ?? '');
    if (m?.[1] && m[2] && args.screenshot !== false)
      out.push(
        { type: 'text', text: 'The screenshot the learner sent (the window as it was; a red frame marks what they pointed at):' },
        { type: 'image', data: m[2], mimeType: m[1] },
      );
    return { content: out };
  },
};
