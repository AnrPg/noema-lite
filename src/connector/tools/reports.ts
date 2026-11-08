/* noema_reports — the problem reports learners sent (admins) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { isAdmin, NOT_ADMIN_REPORTS } from '../services/admin.ts';
import { REPORT_OPEN, type ReportRow } from '../../features/reports/domain/index.ts';
import { ID_RE, str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_reports',
    description:
      "The problem reports people sent from the noema-lite app (the ⚑ button: a screenshot + the exact place). For the app's admins (noema_admins) only. Lists them newest first: id, kind (content, translation, display, broken, idea, other), status, the item id that locates the problem uniquely (ex:<exercise id> · card:<key> · blk:<section>/<block> · trap:<chapter>/<id> · drill:<id> · sec:<id> · ui:<i18n key> · lang:<course>/…), subject, address, the learner's words. Then read one with noema_report.",
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'new', 'seen', 'fixing', 'fixed', 'wontfix', 'duplicate', 'all'],
          description: 'default open (= new, seen, fixing)',
        },
        subject: {
          type: 'string',
          description: 'only reports about this subject id',
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
    if (!(await isAdmin(ctx))) return fail(NOT_ADMIN_REPORTS);
    const st = argStr(args, 'status') || 'open',
      lim = Math.max(1, Math.min(200, Number(args.limit) || 30)),
      subj = argStr(args, 'subject');
    const f = st === 'all' ? '' : '&status=in.(' + (st === 'open' ? REPORT_OPEN : [st]).join(',') + ')';
    const rows = await ctx.sb.request<ReportRow[]>(
      `/rest/v1/noema_error_reports?select=id,kind,status,item,subject,route,note,reporter_name,app_version,created_at${f}${subj && ID_RE.test(subj) ? '&subject=eq.' + encodeURIComponent(subj) : ''}&order=created_at.desc&limit=${lim}`,
    );
    if (!rows.length) return text(`No ${st} problem reports.`);
    return text(
      `${rows.length} ${st} problem report(s), newest first. Read one with noema_report (id).\n\n` +
        rows
          .map(
            r =>
              `- ${r.id} · ${r.created_at?.slice(0, 16)} · ${r.status} · ${r.kind} · ${r.item || '?'} · ${r.subject || '-'} · ${r.route || ''}${r.note ? '\n  “' + str(r.note).replace(/\s+/g, ' ').slice(0, 240) + '”' : ''}`,
          )
          .join('\n'),
    );
  },
};
