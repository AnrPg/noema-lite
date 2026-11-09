/** The reports port (src/ports/reports.ts) over Supabase: cloud/supabase.sql §15 (noema_error_reports), §16
    (noema_engine_requests) and the admins (noema_admins, §13b). */
import { ok, type AsyncResult } from '../../kernel/result.ts';
import {
  REPORT_LIST_COLUMNS,
  REQUEST_COLUMNS,
  type EngineRequestRow,
  type EngineRequestServer,
  type ReportRow,
  type ReportServer,
} from '../../ports/reports.ts';
import { enc, type Rest } from './rest.ts';

const statusIn = (statuses: readonly string[] | null): string => (statuses ? '&status=in.(' + statuses.map(enc).join(',') + ')' : '');

async function isAdmin(r: Rest): AsyncResult<boolean> {
  const x = await r.rows<{ user_id: string }>('/rest/v1/noema_admins?select=user_id&limit=1');
  return x.ok ? ok(x.value.length > 0) : x;
}

export function supabaseReports(r: Rest): ReportServer {
  return {
    uid: () => r.uid(),
    isAdmin: () => isAdmin(r),
    send: row => r.write('/rest/v1/noema_error_reports', 'POST', [row]),
    list: statuses =>
      r.rows<ReportRow>(`/rest/v1/noema_error_reports?select=${REPORT_LIST_COLUMNS}${statusIn(statuses)}&order=created_at.desc&limit=300`),
    async one(id) {
      const x = await r.rows<ReportRow>(`/rest/v1/noema_error_reports?select=*&id=eq.${enc(id)}`);
      return x.ok ? ok(x.value[0] ?? null) : x;
    },
    async newCount() {
      const x = await r.rows<{ id: string }>('/rest/v1/noema_error_reports?select=id&status=eq.new&limit=500');
      return x.ok ? ok(x.value.length) : x;
    },
    save: (id, patch) => r.write(`/rest/v1/noema_error_reports?id=eq.${enc(id)}`, 'PATCH', patch),
    remove: id => r.write(`/rest/v1/noema_error_reports?id=eq.${enc(id)}`, 'DELETE', undefined, {}),
  };
}

export function supabaseEngineRequests(r: Rest): EngineRequestServer {
  return {
    uid: () => r.uid(),
    isAdmin: () => isAdmin(r),
    async submit(row) {
      const x = await r.json<EngineRequestRow[]>('/rest/v1/noema_engine_requests', {
        method: 'POST',
        body: [row],
        headers: { Prefer: 'return=representation' },
      });
      const back: EngineRequestRow = { ...row };
      return x.ok ? ok((Array.isArray(x.value) ? x.value[0] : undefined) ?? back) : x;
    },
    mine: () =>
      r.rows<EngineRequestRow>(
        `/rest/v1/noema_engine_requests?select=${REQUEST_COLUMNS}&requester=eq.${enc(r.uid() ?? '')}&order=created_at.desc&limit=200`,
      ),
    all: statuses =>
      r.rows<EngineRequestRow>(
        `/rest/v1/noema_engine_requests?select=${REQUEST_COLUMNS}${statusIn(statuses)}&order=created_at.desc&limit=300`,
      ),
    update: (id, patch) => r.write(`/rest/v1/noema_engine_requests?id=eq.${enc(id)}`, 'PATCH', patch),
  };
}
