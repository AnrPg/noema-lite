/**
 * Social port: what People needs from the cloud (docs/SOCIAL.md; cloud/supabase.sql §12) — the people, the buddies, the
 * blocks, the rooms, their members and messages, the files of a room, the Roadmaps shared in groups. Row-level security
 * and the server's functions decide; the adapter (src/adapters/supabase/social.ts) only carries. Rows are the server's
 * own (loosely typed: the screens read them as they are). Contract: src/ports/contract/social.contract.ts.
 */
import type { AsyncResult } from '../kernel/result.ts';

export interface BuddyRow {
  readonly a: string;
  readonly b: string;
  readonly status: string /* 'pending' | 'buddies' */;
  readonly asked_by?: string | null;
}
export interface InboxRow {
  readonly room: string;
  readonly kind: string /* 'dm' | 'group' */;
  readonly status?: string /* 'joined' | 'invited' */;
  readonly muted?: boolean | null;
  readonly unread?: number | null;
  readonly name?: string | null;
  readonly other?: string | null;
  readonly other_name?: string | null;
  readonly other_emoji?: string | null;
  readonly [more: string]: unknown;
}
export type Row = Readonly<Record<string, unknown>>;
export interface PersonRow {
  readonly user_id: string;
  readonly display_name?: string | null;
  readonly emoji?: string | null;
  readonly university?: string | null;
  readonly search?: string | null;
  readonly findable?: boolean;
  readonly dm_from?: string /* 'buddies' | 'everyone' | 'nobody' */;
  readonly [more: string]: unknown;
}
export interface Attachment {
  readonly kind: string /* 'file' | 'subject' | 'roadmap' | 'vault' */;
  readonly [more: string]: unknown;
}

export interface SocialServer {
  uid(): string | null;
  /** my row of noema_people (null: none yet) */
  me(): AsyncResult<PersonRow | null>;
  putMe(row: PersonRow): AsyncResult<void>;
  patchMe(patch: Readonly<Record<string, unknown>>): AsyncResult<void>;
  people(ids: readonly string[]): AsyncResult<PersonRow[]>;
  /** people whose search terms contain one of the forms (not me), ≤ 30 */
  search(forms: readonly string[]): AsyncResult<PersonRow[]>;
  buddies(): AsyncResult<BuddyRow[]>;
  ask(x: string): AsyncResult<unknown>;
  answer(x: string, yes: boolean): AsyncResult<unknown>;
  unbuddy(a: string, b: string): AsyncResult<void>;
  blocks(): AsyncResult<{ blocked: string; created_at?: string }[]>;
  block(x: string): AsyncResult<void>;
  unblock(x: string): AsyncResult<void>;
  inbox(): AsyncResult<InboxRow[]>;
  /** the one room of a pair (made the first time when the other person's setting allows it) */
  dm(x: string): AsyncResult<string>;
  createGroup(g: Readonly<Record<string, unknown>>): AsyncResult<string>;
  room(id: string): AsyncResult<Row | null>;
  members(room: string): AsyncResult<Row[]>;
  latest(room: string, n: number): AsyncResult<Row[]>;
  before(room: string, at: string, n: number): AsyncResult<Row[]>;
  send(room: string, body: string, att: Attachment | null): AsyncResult<Row | null>;
  edit(id: string, body: string): AsyncResult<void>;
  remove(id: string): AsyncResult<void>;
  report(message: string, reason: string, note: string | null): AsyncResult<void>;
  read(room: string, at: string): AsyncResult<void>;
  member(room: string, user: string, patch: Readonly<Record<string, unknown>>): AsyncResult<void>;
  setRoom(room: string, patch: Readonly<Record<string, unknown>>): AsyncResult<void>;
  invite(room: string, x: string): AsyncResult<unknown>;
  peek(code: string): AsyncResult<Row | null>;
  join(code: string): AsyncResult<unknown>;
  roadmaps(room: string): AsyncResult<Row[]>;
  shareRoadmap(room: string, curriculum: string): AsyncResult<void>;
  unshareRoadmap(room: string, curriculum: string): AsyncResult<void>;
  curricula(ids: readonly string[]): AsyncResult<Row[]>;
  /** the bytes I keep on the server: the files of conversations and of the vault (≤ 50 MB together) */
  usedBytes(): AsyncResult<number>;
  /** a file of a room: its row (the server counts it), then the object */
  insertFile(row: { path: string; room: string; name: string; mime: string; size: number }): AsyncResult<void>;
  putObject(path: string, body: Blob, mime: string): AsyncResult<void>;
  /** the server checks the object's size and makes the file usable */
  finishFile(path: string): AsyncResult<void>;
  removeObject(path: string): AsyncResult<void>;
  removeFileRow(path: string): AsyncResult<void>;
  download(path: string, mime: string): AsyncResult<Blob>;
}
