/**
 * People, study buddies, conversations and study groups (docs/SOCIAL.md) — the rules the app applies on its side. The
 * server decides who may find, message or invite whom (cloud/supabase.sql §12); here: how a name is searched, what a
 * refusal of the server means for the learner, the bond with a person, and what waits for me.
 */
import { textOf } from '../../../kernel/text.ts';
import { forms, searchTerms } from '../../search/domain/translit.ts';
import type { BuddyRow, InboxRow } from '../../../ports/social.ts';

export type { BuddyRow, InboxRow } from '../../../ports/social.ts';

export const MAX_BODY = 4000;
export const MAX_NAME = 80;

/** A name as it is kept for the search (the app-wide transliteration rule). */
export const nameSearch = (name: unknown): string => searchTerms(name);
/** The words of a search for people, without what PostgREST's filters would read as syntax. */
export const cleanQuery = (q: unknown): string =>
  (q == null ? '' : textOf(q))
    .replace(/[,()"*\\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** The forms a search for people is sent in (≥ 2 letters, else nothing is searched). */
export function peopleQuery(q: unknown): string[] {
  const words = cleanQuery(q);
  return words.length < 2 ? [] : forms(words);
}

/** The server's refusals (raised in English by cloud/supabase.sql §12) → their key in i18n/social (social.<key>). */
const REFUSALS: readonly (readonly [RegExp, string])[] = [
  [/do not take messages/, 'err.noMessages'],
  [/do not take invitations/, 'err.noInvites'],
  [/blocked|not possible/, 'err.blocked'],
  [/quota/, 'err.quota'],
  [/too many messages/, 'err.slow'],
  [/too many open requests/, 'err.manyAsks'],
  [/too many new groups/, 'err.manyGroups'],
  [/group is full/, 'err.full'],
  [/invitation link/, 'err.badLink'],
  [/person not found/, 'err.noPerson'],
  [/not a member/, 'err.notMember'],
  [/attachment not found/, 'err.attachment'],
];
export function refusalKey(message: unknown): string | null {
  const m = message == null ? '' : textOf(message);
  return REFUSALS.find(([re]) => re.test(m))?.[1] ?? null;
}

/** A pair's row of noema_buddies: a < b. */
export const pairOf = (x: string, y: string): readonly [string, string] => (x < y ? [x, y] : [y, x]);

export type Bond = 'buddies' | 'asked' | 'theyAsked' | 'blocked' | 'none';

/** 🤝 with this person: buddies · asked (I asked) · theyAsked · blocked (I blocked them) · none */
export function bondWith(x: string, me: string | null, buddies: readonly BuddyRow[], blocks: readonly string[]): Bond {
  if (blocks.includes(x)) return 'blocked';
  const b = buddies.find(r => r.a === x || r.b === x);
  if (!b) return 'none';
  return b.status === 'buddies' ? 'buddies' : b.asked_by === me ? 'asked' : 'theyAsked';
}
/** The buddy requests waiting for my answer. */
export const requestsFor = (me: string | null, buddies: readonly BuddyRow[]): BuddyRow[] =>
  buddies.filter(b => b.status === 'pending' && b.asked_by !== me);
/** What waits for me: unread messages (muted rooms aside), invitations to groups, buddy requests. */
export function waitingFor(me: string | null, inbox: readonly InboxRow[], buddies: readonly BuddyRow[]): number {
  return inbox.reduce((n, r) => n + (r.status === 'invited' ? 1 : r.muted ? 0 : (r.unread ?? 0)), 0) + requestsFor(me, buddies).length;
}
/** The other person of each of my buddy rows. */
export const othersOf = (me: string | null, buddies: readonly BuddyRow[]): string[] => buddies.map(b => (b.a === me ? b.b : b.a));
/** My study groups (joined). */
export const groupsOf = (inbox: readonly InboxRow[]): { id: string; name: string }[] =>
  inbox.filter(r => r.kind === 'group' && r.status === 'joined').map(r => ({ id: r.room, name: r.name ?? '' }));
/** A room's file path: rooms/<room>/<id>.<ext> (the extension of the name, else json). */
export function chatFilePath(room: string, name: string, id: string): string {
  const ext = (/\.([a-z0-9]{1,5})$/.exec(name.toLowerCase()) ?? [])[1] ?? 'json';
  return `rooms/${room}/${id}.${ext}`;
}
