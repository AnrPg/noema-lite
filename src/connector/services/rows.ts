/* The two indexes the app shows 👁 and 文A from, one row per entry (cloud/supabase.sql §17):
     noema_source_files  (subject_id, source_id) → the file's meta { name, type, size, sha256?, added, cloud, chunks?, ref?, via? }
     noema_bridges       (pack_id, pair)         → the bridge's summary { v, status, coverage, entries, source, … }
   Each entry is its own row, so saves running at the same time (several agents, several devices) never drop each other's entry;
   the server stamps updated_at strictly later on every change. Read by engine/cloud.js (rowSync) into the app's local caches. */
import type { Supabase } from './supabase.ts';

export interface SourceFileMeta {
  name: string;
  type: string;
  size: number;
  added: string;
  cloud: boolean;
  sha256?: string;
  chunks?: number;
  ref?: { subj: string; src: string };
  via?: string;
}
export interface BridgeSummary {
  v: string;
  status: unknown;
  coverage: number | null;
  everyday: number | null;
  chapters: number | null;
  of: unknown;
  previews: number;
  entries: number;
  at: number;
  via?: string;
  source?: string;
}
interface SourceFileRow {
  subject_id: string;
  source_id: string;
  meta: SourceFileMeta;
  updated_at: string;
}
interface BridgeRow {
  pack_id: string;
  pair: string;
  meta: BridgeSummary;
  updated_at: string;
}

const enc = encodeURIComponent;
const upsert = { Prefer: 'resolution=merge-duplicates,return=minimal' };

export class SourceFiles {
  private readonly sb: Supabase;
  private readonly uid: string;
  constructor(sb: Supabase, uid: string) {
    this.sb = sb;
    this.uid = uid;
  }
  /** The files of one subject: { sourceId: meta }. */
  async of(subject: string): Promise<Record<string, SourceFileMeta>> {
    const rows = await this.sb.request<SourceFileRow[] | null>(
      `/rest/v1/noema_source_files?select=source_id,meta&subject_id=eq.${enc(subject)}`,
    );
    return Object.fromEntries((rows ?? []).map(r => [r.source_id, r.meta]));
  }
  /** Add or replace entries of one subject (one request, every row on its own: the others stay). */
  async put(subject: string, entries: Record<string, SourceFileMeta>): Promise<void> {
    const body = Object.entries(entries).map(([source_id, meta]) => ({ user_id: this.uid, subject_id: subject, source_id, meta }));
    if (body.length)
      await this.sb.request('/rest/v1/noema_source_files?on_conflict=user_id,subject_id,source_id', {
        method: 'POST',
        body,
        headers: upsert,
      });
  }
}

export class Bridges {
  private readonly sb: Supabase;
  private readonly uid: string;
  constructor(sb: Supabase, uid: string) {
    this.sb = sb;
    this.uid = uid;
  }
  /** The account's bridges: { pack: { pair: summary } } (one pack or all). */
  async all(pack?: string): Promise<Record<string, Record<string, BridgeSummary>>> {
    const rows = await this.sb.request<BridgeRow[] | null>(
      `/rest/v1/noema_bridges?select=pack_id,pair,meta&order=pack_id,pair${pack ? '&pack_id=eq.' + enc(pack) : ''}`,
    );
    const out: Record<string, Record<string, BridgeSummary>> = {};
    for (const r of rows ?? []) (out[r.pack_id] ??= {})[r.pair] = r.meta;
    return out;
  }
  async put(pack: string, pair: string, meta: BridgeSummary): Promise<void> {
    await this.sb.request('/rest/v1/noema_bridges?on_conflict=user_id,pack_id,pair', {
      method: 'POST',
      body: [{ user_id: this.uid, pack_id: pack, pair, meta }],
      headers: upsert,
    });
  }
  async remove(pack: string, pair: string): Promise<void> {
    await this.sb.request(`/rest/v1/noema_bridges?pack_id=eq.${enc(pack)}&pair=eq.${enc(pair)}`, { method: 'DELETE' });
  }
}
