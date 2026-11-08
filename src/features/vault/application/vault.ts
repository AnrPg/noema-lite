/**
 * The vault's use cases (docs/VAULT.md): read the files once, upload one (the row, then the file, then the server's
 * check — and nothing left behind when a step fails), remove, edit, rate, report, count, download; the field graph, read
 * once and kept on this device until a field changes or a day has passed.
 */
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult } from '../../../kernel/result.ts';
import type { Clock } from '../../../ports/clock.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';
import { fieldGraph, type FieldGraph, type FieldRow } from '../domain/fields.ts';
import type { VaultFile } from '../domain/files.ts';
import { extOf, formatOf } from '../domain/formats.ts';
import type { CountWhat, ReportReason, VaultFileMeta, VaultServer } from '../../../ports/vault.ts';

export const FIELDS_PAGE = 1000;
/** The device's copy of the field graph: read again when a field changed, or a day later. */
export const FIELDS_TTL_MS = 864e5;
export const fieldsCacheKey = (uid: string | null): string => 'noema-vault-fields-v1:' + (uid ?? '');

/** A file to upload: what the browser's File has (a Blob with its name). */
export interface UploadFile {
  readonly name: string;
  readonly size: number;
  readonly blob: Blob;
}

export interface VaultDeps {
  readonly server: VaultServer;
  readonly kv: KeyValueStore;
  readonly clock: Clock;
  /** a new random id (crypto.randomUUID in the app) */
  readonly newId: () => string;
}

export interface VaultService {
  readonly server: VaultServer;
  list(): AsyncResult<VaultFile[]>;
  myRatings(): AsyncResult<Record<string, number>>;
  myReports(): AsyncResult<Record<string, string>>;
  /** the new file's id */
  upload(meta: VaultFileMeta, file: UploadFile): AsyncResult<string>;
  remove(f: Pick<VaultFile, 'id' | 'path'>): AsyncResult<void>;
  edit(id: string, patch: Readonly<Record<string, unknown>>): AsyncResult<void>;
  rate(id: string, stars: number): AsyncResult<void>;
  report(id: string, reason: ReportReason, note?: string | null): AsyncResult<void>;
  /** counted once per person by the server; a failure is nobody's business */
  count(id: string, what: CountWhat): AsyncResult<void>;
  download(f: Pick<VaultFile, 'path' | 'mime'>): AsyncResult<Blob>;
  /** the field graph now (empty until loaded) */
  fields(): FieldGraph;
  loadFields(): AsyncResult<FieldGraph>;
  /** propose a field; it is mine at once (in the graph here) */
  propose(name: string, locale: string, parents: readonly string[]): AsyncResult<string>;
  suggest(title: string, course: string | null): AsyncResult<string[]>;
}

interface FieldsCopy {
  readonly stamp?: unknown;
  readonly at?: unknown;
  readonly rows?: unknown;
}
function readCopy(text: string | null): FieldsCopy | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null; // a copy that cannot be read: the graph is read again
  }
}
const isRows = (x: unknown): x is FieldRow[] =>
  Array.isArray(x) && x.every(r => !!r && typeof r === 'object' && typeof (r as FieldRow).id === 'string');

export function vaultService({ server, kv, clock, newId }: VaultDeps): VaultService {
  let graph = fieldGraph([]),
    loading: AsyncResult<FieldGraph> | null = null;

  async function readFields(): AsyncResult<FieldGraph> {
    const key = fieldsCacheKey(server.uid());
    const kept = kv.get(key);
    const cached = readCopy(kept.ok ? kept.value : null);
    const st = await server.fieldsStamp();
    const stamp = st.ok ? st.value : '';
    if (cached && cached.stamp === stamp && typeof cached.at === 'number' && clock.now() - cached.at < FIELDS_TTL_MS && isRows(cached.rows))
      return ok((graph = fieldGraph(cached.rows)));
    const rows: FieldRow[] = [];
    for (let o = 0; ; o += FIELDS_PAGE) {
      const page = await server.fields(o, FIELDS_PAGE);
      if (!page.ok) return page;
      rows.push(...page.value);
      if (page.value.length < FIELDS_PAGE) break;
    }
    graph = fieldGraph(rows);
    kv.set(key, JSON.stringify({ stamp, at: clock.now(), rows })); // a full storage only costs the next start a reading
    return ok(graph);
  }

  return {
    server,
    list: () => server.list(),
    async myRatings() {
      const r = await server.myRatings();
      return r.ok ? ok(Object.fromEntries(r.value.map(x => [x.file_id, x.stars]))) : r;
    },
    async myReports() {
      const r = await server.myReports();
      return r.ok ? ok(Object.fromEntries(r.value.map(x => [x.file_id, x.reason]))) : r;
    },
    async upload(meta, file) {
      const f = formatOf(file.name);
      if (!f) return err(new NoemaError('internal.unexpected', 'a format the vault does not take: ' + extOf(file.name)));
      const id = newId(),
        path = `files/${id}.${extOf(file.name)}`;
      const ins = await server.insert({ ...meta, id, file_name: file.name.slice(0, 200), mime: f.mime, size: file.size, path });
      if (!ins.ok) return ins;
      const put = await server.putObject(path, file.blob, f.mime);
      const done = put.ok ? await server.finish(id) : put;
      if (done.ok) return ok(id);
      // nothing half-made stays behind: the object (if any) and the pending row go
      await server.removeObject(path);
      await server.removeRow(id);
      return done;
    },
    async remove(f) {
      if (f.path) await server.removeObject(f.path); // an object already gone is fine; the row is what counts
      return server.removeRow(f.id);
    },
    edit: (id, patch) => server.edit(id, patch),
    rate: (id, stars) => server.rate(id, Math.max(1, Math.min(5, Math.round(stars)))),
    report: (id, reason, note = null) => server.report(id, reason, note?.trim() || null),
    async count(id, what) {
      await server.count(id, what);
      return OK_VOID;
    },
    download: f => server.download(f.path ?? '', f.mime ?? ''),
    fields: () => graph,
    loadFields() {
      if (!loading)
        loading = readFields().then(r => {
          if (!r.ok) loading = null;
          return r;
        });
      return loading;
    },
    async propose(name, locale, parents) {
      const r = await server.propose(name, locale, parents);
      if (r.ok && !graph.get(r.value))
        graph = graph.with({ id: r.value, names: { [locale]: name }, aliases: [], parents: [...parents], status: 'proposed' });
      return r;
    },
    async suggest(title, course) {
      const r = await server.suggest(title, course);
      return r.ok ? ok(r.value.map(x => x.field)) : r;
    },
  };
}
