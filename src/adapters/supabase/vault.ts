/** The vault's port (src/ports/vault.ts) over Supabase: cloud/supabase.sql §13 (files, the view
    noema_vault without the uploader, ratings, reports, the bucket noema-vault) and §13b (the field graph). */
import { ok, type AsyncResult } from '../../kernel/result.ts';
import type { FieldRow, VaultFile, VaultServer } from '../../ports/vault.ts';
import { enc, type Rest } from './rest.ts';

export const VAULT_BUCKET = 'noema-vault';

export function supabaseVault(r: Rest): VaultServer {
  return {
    uid: () => r.uid(),
    list: () => r.rows<VaultFile>('/rest/v1/noema_vault?select=*&order=created_at.desc&limit=5000'),
    myRatings: () => r.rows<{ file_id: string; stars: number }>('/rest/v1/noema_vault_ratings?select=file_id,stars'),
    myReports: () => r.rows<{ file_id: string; reason: string }>('/rest/v1/noema_vault_reports?select=file_id,reason'),
    insert: row => r.write('/rest/v1/noema_vault_files', 'POST', [row]),
    putObject: (path, body, mime) => r.putObject(VAULT_BUCKET, path, body, mime),
    async finish(id) {
      const x = await r.rpc('noema_vault_finish', { fid: id });
      return x.ok ? ok(undefined) : x;
    },
    removeObject: path => r.removeObjects(VAULT_BUCKET, [path]),
    removeRow: id => r.write('/rest/v1/noema_vault_files?id=eq.' + enc(id), 'DELETE', undefined, {}),
    edit: (id, patch) => r.write('/rest/v1/noema_vault_files?id=eq.' + enc(id), 'PATCH', patch),
    rate: (id, stars) =>
      r.write('/rest/v1/noema_vault_ratings?on_conflict=file_id,user_id', 'POST', [{ file_id: id, user_id: r.uid(), stars }], {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
    report: (id, reason, note) => r.write('/rest/v1/noema_vault_reports', 'POST', [{ file_id: id, reporter: r.uid(), reason, note }]),
    async count(id, what) {
      const x = await r.rpc('noema_vault_count', { fid: id, what });
      return x.ok ? ok(undefined) : x;
    },
    download: (path, mime) => r.download(VAULT_BUCKET, path, mime),
    fields: (offset, limit) =>
      r.rows<FieldRow>(
        `/rest/v1/noema_vault_fields?select=id,names,aliases,parents,status&status=in.(accepted,proposed)&order=id&limit=${limit}&offset=${offset}`,
      ),
    async fieldsStamp(): AsyncResult<string> {
      const x = await r.rows<{ updated_at?: string }>('/rest/v1/noema_vault_fields?select=updated_at&order=updated_at.desc&limit=1');
      return x.ok ? ok(x.value[0]?.updated_at ?? '') : x;
    },
    async propose(name, lang, parents) {
      const x = await r.rpc<string>('noema_vault_field_propose', { name, lang, parents });
      return x.ok ? ok(x.value ?? '') : x;
    },
    async suggest(title, course) {
      const x = await r.rpc<{ field: string }[]>('noema_vault_field_suggest', { title: title || '', course: course || null });
      return x.ok ? ok(Array.isArray(x.value) ? x.value : []) : x;
    },
  };
}
