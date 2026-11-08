/** The social port (src/ports/social.ts) over Supabase: cloud/supabase.sql §12 (noema_people, noema_buddies, noema_blocks,
    the rooms, their members and messages, noema_chat_files and the bucket noema-chat, noema_room_roadmaps). */
import { ok, OK_VOID, type AsyncResult } from '../../kernel/result.ts';
import type { BuddyRow, InboxRow, PersonRow, Row, SocialServer } from '../../ports/social.ts';
import { enc, MINIMAL, type Rest } from './rest.ts';

export const CHAT_BUCKET = 'noema-chat';
const PEOPLE = 'user_id,display_name,emoji,university';

export function supabaseSocial(r: Rest): SocialServer {
  const me = (): string => r.uid() ?? '';
  const first = async <T>(x: AsyncResult<T[]>): AsyncResult<T | null> => {
    const y = await x;
    return y.ok ? ok(y.value[0] ?? null) : y;
  };
  const rpc = async <T>(fn: string, body: Readonly<Record<string, unknown>> = {}): AsyncResult<T> => {
    const y = await r.rpc<T>(fn, body);
    return y.ok ? ok(y.value as T) : y;
  };
  const done = async (x: AsyncResult<unknown>): AsyncResult<void> => {
    const y = await x;
    return y.ok ? OK_VOID : y;
  };
  return {
    uid: () => r.uid(),
    me: () => first(r.rows<PersonRow>(`/rest/v1/noema_people?select=*&user_id=eq.${enc(me())}`)),
    putMe: row =>
      r.write('/rest/v1/noema_people?on_conflict=user_id', 'POST', [row], { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    patchMe: patch => r.write(`/rest/v1/noema_people?user_id=eq.${enc(me())}`, 'PATCH', patch),
    people: ids => {
      const list = [...new Set(ids)].filter(Boolean);
      return list.length
        ? r.rows<PersonRow>(`/rest/v1/noema_people?select=${PEOPLE}&user_id=in.(${list.map(enc).join(',')})`)
        : Promise.resolve(ok([]));
    },
    search: forms =>
      r.rows<PersonRow>(
        `/rest/v1/noema_people?select=${PEOPLE}&or=(${forms.map(f => `search.ilike."*${enc(f)}*"`).join(',')})&user_id=neq.${enc(me())}&limit=30`, // i18n-ignore (a REST query)
      ),
    buddies: () => r.rows<BuddyRow>('/rest/v1/noema_buddies?select=*'),
    ask: x => rpc('noema_buddy_ask', { x }),
    answer: (x, yes) => rpc('noema_buddy_answer', { x, yes }),
    unbuddy: (a, b) => r.write(`/rest/v1/noema_buddies?a=eq.${enc(a)}&b=eq.${enc(b)}`, 'DELETE', undefined, {}),
    blocks: () => r.rows<{ blocked: string; created_at?: string }>('/rest/v1/noema_blocks?select=blocked,created_at'),
    block: x => r.write('/rest/v1/noema_blocks', 'POST', [{ blocker: me(), blocked: x }]),
    unblock: x => r.write(`/rest/v1/noema_blocks?blocked=eq.${enc(x)}`, 'DELETE', undefined, {}),
    async inbox() {
      const y = await r.rpc<InboxRow[]>('noema_inbox');
      return y.ok ? ok(Array.isArray(y.value) ? y.value : []) : y;
    },
    dm: x => rpc<string>('noema_dm_open', { x }),
    createGroup: g => rpc<string>('noema_group_create', g),
    room: id => first(r.rows<Row>(`/rest/v1/noema_rooms?select=*&id=eq.${enc(id)}`)),
    members: room =>
      r.rows<Row>(`/rest/v1/noema_room_members?select=user_id,role,status,last_read,muted,joined_at&room=eq.${enc(room)}&status=neq.left`),
    latest: (room, n) => r.rows<Row>(`/rest/v1/noema_messages?select=*&room=eq.${enc(room)}&order=created_at.desc&limit=${n}`),
    before: (room, at, n) =>
      r.rows<Row>(`/rest/v1/noema_messages?select=*&room=eq.${enc(room)}&created_at=lt.${enc(at)}&order=created_at.desc&limit=${n}`),
    async send(room, body, att) {
      const y = await r.json<Row[]>('/rest/v1/noema_messages', {
        method: 'POST',
        body: [{ room, author: me(), body: body || '', att }],
        headers: { Prefer: 'return=representation' },
      });
      return y.ok ? ok((Array.isArray(y.value) ? y.value[0] : null) ?? null) : y;
    },
    edit: (id, body) => r.write(`/rest/v1/noema_messages?id=eq.${enc(id)}`, 'PATCH', { body }),
    remove: id => r.write(`/rest/v1/noema_messages?id=eq.${enc(id)}`, 'PATCH', { deleted: true }),
    report: (message, reason, note) => r.write('/rest/v1/noema_message_reports', 'POST', [{ message, reporter: me(), reason, note }]),
    read: (room, at) => r.write(`/rest/v1/noema_room_members?room=eq.${enc(room)}&user_id=eq.${enc(me())}`, 'PATCH', { last_read: at }),
    member: (room, user, patch) => r.write(`/rest/v1/noema_room_members?room=eq.${enc(room)}&user_id=eq.${enc(user)}`, 'PATCH', patch),
    setRoom: (room, patch) => r.write(`/rest/v1/noema_rooms?id=eq.${enc(room)}`, 'PATCH', patch),
    invite: (room, x) => rpc('noema_room_invite', { r: room, x }),
    async peek(code) {
      const y = await r.rpc<Row[]>('noema_room_peek', { code });
      return y.ok ? ok((Array.isArray(y.value) ? y.value[0] : null) ?? null) : y;
    },
    join: code => rpc('noema_room_join', { code }),
    roadmaps: room => r.rows<Row>(`/rest/v1/noema_room_roadmaps?select=*&room=eq.${enc(room)}`),
    shareRoadmap: (room, curriculum) =>
      r.write('/rest/v1/noema_room_roadmaps?on_conflict=room,curriculum', 'POST', [{ room, curriculum, added_by: me() }], {
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      }),
    unshareRoadmap: (room, curriculum) =>
      r.write(`/rest/v1/noema_room_roadmaps?room=eq.${enc(room)}&curriculum=eq.${enc(curriculum)}`, 'DELETE', undefined, {}),
    curricula: ids =>
      ids.length
        ? r.rows<Row>(
            `/rest/v1/noema_curricula_shared?select=id,title,description,owner,owner_name,public,meta&id=in.(${ids.map(enc).join(',')})`,
          )
        : Promise.resolve(ok([])),
    async usedBytes() {
      // either list may be unreadable (an older database): what can be read is counted, as the server counts the rest
      const [a, b] = await Promise.all([
        r.rows<{ size?: number }>(`/rest/v1/noema_chat_files?select=size&owner=eq.${enc(me())}`),
        r.rows<{ size?: number }>('/rest/v1/noema_vault_files?select=size'),
      ]);
      return ok([...(a.ok ? a.value : []), ...(b.ok ? b.value : [])].reduce((s, x) => s + (x.size ?? 0), 0));
    },
    insertFile: row => r.write('/rest/v1/noema_chat_files', 'POST', [{ ...row, owner: me() }], MINIMAL),
    putObject: (path, body, mime) => r.putObject(CHAT_BUCKET, path, body, mime),
    finishFile: path => done(r.rpc('noema_chat_finish', { p: path })),
    removeObject: path => r.removeObjects(CHAT_BUCKET, [path]),
    removeFileRow: path => r.write(`/rest/v1/noema_chat_files?path=eq.${enc(path)}`, 'DELETE', undefined, {}),
    download: (path, mime) => r.download(CHAT_BUCKET, path, mime),
  };
}
