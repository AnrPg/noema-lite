-- =====================================================================================
-- noema-lite — Supabase schema. Run in: Supabase dashboard → SQL Editor → New query → Run.
-- Idempotent: safe to run again at any time. Multi-tenant by design: every row / file belongs to
-- exactly one user (auth.uid()) and row-level security makes other users' data invisible.
-- =====================================================================================

-- 0) Clean-up of objects created by the earlier version of this script (before the rename to noema-lite)
drop table if exists public.lq_conversations cascade;
drop table if exists public.lq_snapshots     cascade;
drop table if exists public.lq_kv            cascade;
drop table if exists public.lq_profiles      cascade;
drop policy if exists "lq own files read"   on storage.objects;
drop policy if exists "lq own files insert" on storage.objects;
drop policy if exists "lq own files update" on storage.objects;
drop policy if exists "lq own files delete" on storage.objects;
do $$ begin
  delete from storage.buckets where id = 'lq-private';          -- only succeeds if the old bucket is empty
exception when others then raise notice 'old bucket lq-private kept (delete it in Storage if you like): %', sqlerrm;
end $$;

-- 1) Profiles (display name, emoji, "about me" for the tutor)
create table if not exists public.noema_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  emoji        text,
  learner      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2) Key/value mirror of the app's per-account storage: progress per subject, settings, stats…
create table if not exists public.noema_kv (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null check (char_length(key) <= 300),
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 3) Restore points of a whole account (manual + daily automatic)
create table if not exists public.noema_snapshots (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label      text,
  data       jsonb not null,
  size_bytes integer,
  created_at timestamptz not null default now()
);
create index if not exists noema_snapshots_user_created on public.noema_snapshots (user_id, created_at desc);

-- 4) Every conversation with the AI, one canonical record per row (schema noema.conversation/v1 — docs/CONVERSATIONS.md).
--    Deletions are tombstones (deleted = true).
create table if not exists public.noema_conversations (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id            text not null,                 -- cv_<time36><rand>, time-sortable
  subject_id    text,
  kind          text not null,                 -- tutor | grading | code-review | question | drill-grading
  mode          text,                          -- socratic | explain | quiz | interview | debug (tutor only)
  title         text,
  context_label text,
  message_count integer not null default 0,
  deleted       boolean not null default false,
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  record        jsonb not null,                -- the full canonical record (messages, tutorState…)
  primary key (user_id, id)
);
create index if not exists noema_conversations_user_updated on public.noema_conversations (user_id, updated_at);

-- 5) Row-level security: each user sees and changes only their own rows
alter table public.noema_profiles      enable row level security;
alter table public.noema_kv            enable row level security;
alter table public.noema_snapshots     enable row level security;
alter table public.noema_conversations enable row level security;
drop policy if exists "own profile"       on public.noema_profiles;
drop policy if exists "own kv"            on public.noema_kv;
drop policy if exists "own snapshots"     on public.noema_snapshots;
drop policy if exists "own conversations" on public.noema_conversations;
create policy "own profile"       on public.noema_profiles      for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own kv"            on public.noema_kv            for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own snapshots"     on public.noema_snapshots     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own conversations" on public.noema_conversations for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 6) Private file storage: <user-id>/packs/<subject>.json (imported subject packs), <user-id>/db/… (database backups)
insert into storage.buckets (id, name, public, file_size_limit)
values ('noema-private', 'noema-private', false, 52428800)
on conflict (id) do nothing;
drop policy if exists "noema own files read"   on storage.objects;
drop policy if exists "noema own files insert" on storage.objects;
drop policy if exists "noema own files update" on storage.objects;
drop policy if exists "noema own files delete" on storage.objects;
create policy "noema own files read"   on storage.objects for select to authenticated using      (bucket_id = 'noema-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "noema own files insert" on storage.objects for insert to authenticated with check (bucket_id = 'noema-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "noema own files update" on storage.objects for update to authenticated using      (bucket_id = 'noema-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "noema own files delete" on storage.objects for delete to authenticated using      (bucket_id = 'noema-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 7) Conversations: a server-side sync timestamp, so a device never misses a conversation that another device
--    pushed late (offline edits keep their own updated_at, which can be older than the last pull).
alter table public.noema_conversations add column if not exists synced_at timestamptz not null default now();
create index if not exists noema_conversations_user_synced on public.noema_conversations (user_id, synced_at);
create or replace function public.noema_touch_synced() returns trigger language plpgsql as $$
begin new.synced_at := now(); return new; end $$;
drop trigger if exists noema_conversations_synced on public.noema_conversations;
create trigger noema_conversations_synced before insert or update on public.noema_conversations
  for each row execute function public.noema_touch_synced();

-- 8) PUBLIC subject packs: listed for everybody (also signed-out visitors), file in the public bucket
--    noema-public/<owner>/<subject>.json. Only the owner can publish, update or withdraw.
create table if not exists public.noema_public_packs (
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id   text not null check (subject_id ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  owner_name   text,
  title        text not null,
  emoji        text,
  description  text,
  language     text,
  meta         jsonb not null default '{}'::jsonb,   -- counts, chapters, sources, pictures, version …
  published_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (owner, subject_id)
);
alter table public.noema_public_packs enable row level security;
drop policy if exists "public packs readable" on public.noema_public_packs;
drop policy if exists "own public packs"      on public.noema_public_packs;
create policy "public packs readable" on public.noema_public_packs for select to anon, authenticated using (true);
create policy "own public packs"      on public.noema_public_packs for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit) values ('noema-public', 'noema-public', true, 52428800)
on conflict (id) do update set public = true;
drop policy if exists "noema public own insert" on storage.objects;
drop policy if exists "noema public own update" on storage.objects;
drop policy if exists "noema public own delete" on storage.objects;
create policy "noema public own insert" on storage.objects for insert to authenticated with check (bucket_id = 'noema-public' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "noema public own update" on storage.objects for update to authenticated using      (bucket_id = 'noema-public' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "noema public own delete" on storage.objects for delete to authenticated using      (bucket_id = 'noema-public' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 9) Sharing a pack with ONE person (by e-mail). The recipient sees the request (bell + banner) and accepts or
--    rejects it; the pack file lives in noema-shared/<share-id>.json, readable only by the two of them.
create table if not exists public.noema_shares (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_name    text,
  from_email   text,
  to_email     text not null check (to_email = lower(to_email) and position('@' in to_email) > 1),
  subject_id   text not null,
  title        text not null,
  meta         jsonb not null default '{}'::jsonb,
  message      text,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'revoked')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists noema_shares_to on public.noema_shares (to_email, status);
alter table public.noema_shares enable row level security;
drop policy if exists "shares: sender and recipient read" on public.noema_shares;
drop policy if exists "shares: sender creates"            on public.noema_shares;
drop policy if exists "shares: sender revokes"            on public.noema_shares;
drop policy if exists "shares: recipient answers"         on public.noema_shares;
drop policy if exists "shares: sender deletes"            on public.noema_shares;
create policy "shares: sender and recipient read" on public.noema_shares for select to authenticated
  using (from_user = (select auth.uid()) or to_email = lower((select auth.jwt()) ->> 'email'));
create policy "shares: sender creates" on public.noema_shares for insert to authenticated
  with check (from_user = (select auth.uid()) and status = 'pending');
create policy "shares: sender revokes" on public.noema_shares for update to authenticated
  using (from_user = (select auth.uid())) with check (from_user = (select auth.uid()));
create policy "shares: recipient answers" on public.noema_shares for update to authenticated
  using (to_email = lower((select auth.jwt()) ->> 'email')) with check (to_email = lower((select auth.jwt()) ->> 'email') and status in ('accepted', 'rejected'));
create policy "shares: sender deletes" on public.noema_shares for delete to authenticated using (from_user = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit) values ('noema-shared', 'noema-shared', false, 52428800)
on conflict (id) do nothing;
drop policy if exists "noema shared sender insert"  on storage.objects;
drop policy if exists "noema shared sender update"  on storage.objects;
drop policy if exists "noema shared sender delete"  on storage.objects;
drop policy if exists "noema shared read"           on storage.objects;
create policy "noema shared sender insert" on storage.objects for insert to authenticated with check (bucket_id = 'noema-shared'
  and exists (select 1 from public.noema_shares s where s.id::text = split_part(storage.objects.name, '.', 1) and s.from_user = (select auth.uid())));
create policy "noema shared sender update" on storage.objects for update to authenticated using (bucket_id = 'noema-shared'
  and exists (select 1 from public.noema_shares s where s.id::text = split_part(storage.objects.name, '.', 1) and s.from_user = (select auth.uid())));
create policy "noema shared sender delete" on storage.objects for delete to authenticated using (bucket_id = 'noema-shared'
  and exists (select 1 from public.noema_shares s where s.id::text = split_part(storage.objects.name, '.', 1) and s.from_user = (select auth.uid())));
create policy "noema shared read" on storage.objects for select to authenticated using (bucket_id = 'noema-shared'
  and exists (select 1 from public.noema_shares s where s.id::text = split_part(storage.objects.name, '.', 1)
              and (s.from_user = (select auth.uid()) or s.to_email = lower((select auth.jwt()) ->> 'email'))));

-- 10) SHARED CURRICULA (docs/CURRICULUM.md §8). The owner shares a curriculum (public = in 🌍 Explore curricula, or
--     with people by e-mail). Everybody keeps their own progress (their own noema_kv), but the prepared steps are
--     common: any participant (the owner or a member who joined) may prepare a step that nobody has prepared yet, and
--     everybody sees it. A prepared step is never overwritten by someone else — only its author may replace it (the
--     owner may remove it). A step being prepared is reserved for its author until claimed_until (a lease).
create table if not exists public.noema_curricula_shared (
  id           text primary key check (id ~ '^c[a-z0-9]{2,30}$'),   -- = the owner's curriculum id (step subjects are named after it)
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name   text,
  title        text not null,
  description  text,
  language     text,
  public       boolean not null default false,
  record       jsonb not null,                         -- the map: steps, links, chapter plans, the files' index — nobody's progress
  meta         jsonb not null default '{}'::jsonb,     -- counts, the curriculum's files in the bucket …
  version      integer not null default 1,
  published_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create table if not exists public.noema_curriculum_members (
  curriculum   text not null references public.noema_curricula_shared(id) on delete cascade,
  email        text not null check (email = lower(email) and position('@' in email) > 1),
  user_id      uuid references auth.users(id) on delete cascade,   -- set when the person joins
  name         text,
  status       text not null default 'pending' check (status in ('pending', 'joined', 'rejected', 'left', 'revoked')),
  invited_by   uuid default auth.uid(),
  message      text,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (curriculum, email)
);
create index if not exists noema_curriculum_members_email on public.noema_curriculum_members (email, status);
create index if not exists noema_curriculum_members_user  on public.noema_curriculum_members (user_id);
create table if not exists public.noema_curriculum_steps (
  curriculum    text not null references public.noema_curricula_shared(id) on delete cascade,
  node_id       text not null check (node_id ~ '^[A-Za-z0-9_.-]{1,80}$'),
  status        text not null check (status in ('preparing', 'ready')),
  author        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name   text,
  pack_id       text,
  version       text,
  path          text,                                  -- the pack in noema-curricula/<curriculum>/steps/<author>/<node>.json
  meta          jsonb not null default '{}'::jsonb,    -- counts, chunks, its source files (sharedFiles)
  claimed_until timestamptz,                           -- 'preparing': reserved for the author until then
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (curriculum, node_id)
);

-- What the signed-in person may do with a shared curriculum: 'owner' · 'member' (joined) · 'invited' (an invitation
-- waits) · 'public' (anyone may look and join) · null. SECURITY DEFINER: the rules below ask it without recursion.
-- plpgsql: it also asks about the Roadmaps shared in study groups and conversations (§12, made further down)
create or replace function public.noema_cur_access(cid text) returns text language plpgsql stable security definer set search_path = public as $$
begin
  return (select case
    when s.owner = auth.uid() then 'owner'
    when exists (select 1 from public.noema_curriculum_members m where m.curriculum = s.id and m.user_id = auth.uid() and m.status = 'joined') then 'member'
    when exists (select 1 from public.noema_curriculum_members m where m.curriculum = s.id and m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and m.status = 'pending') then 'invited'
    when s.public then 'public'
    when exists (select 1 from public.noema_room_roadmaps x join public.noema_room_members m on m.room = x.room where x.curriculum = s.id and m.user_id = auth.uid() and m.status = 'joined') then 'public'   -- shared in one of my rooms
  end
  from public.noema_curricula_shared s where s.id = cid);
end $$;
create or replace function public.noema_cur_has_node(cid text, nid text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_curricula_shared s where s.id = cid and s.record -> 'nodes' ? nid)
$$;
grant execute on function public.noema_cur_access(text) to anon, authenticated;
grant execute on function public.noema_cur_has_node(text, text) to anon, authenticated;
-- the keys of a row never move (a member cannot carry a row into a curriculum or onto a step it was not made for)
create or replace function public.noema_cur_shared_keys() returns trigger language plpgsql as $$
begin if new.id <> old.id or new.owner <> old.owner then raise exception 'id and owner of a shared curriculum cannot change'; end if; new.updated_at := now(); return new; end $$;
create or replace function public.noema_cur_members_keys() returns trigger language plpgsql as $$
begin if new.curriculum <> old.curriculum or new.email <> old.email then raise exception 'curriculum and e-mail of a membership cannot change'; end if; return new; end $$;
create or replace function public.noema_cur_steps_keys() returns trigger language plpgsql as $$
begin if new.curriculum <> old.curriculum or new.node_id <> old.node_id then raise exception 'curriculum and step of a prepared step cannot change'; end if; new.updated_at := now(); return new; end $$;
drop trigger if exists noema_cur_shared_keys  on public.noema_curricula_shared;
drop trigger if exists noema_cur_members_keys on public.noema_curriculum_members;
drop trigger if exists noema_cur_steps_keys   on public.noema_curriculum_steps;
create trigger noema_cur_shared_keys  before update on public.noema_curricula_shared   for each row execute function public.noema_cur_shared_keys();
create trigger noema_cur_members_keys before update on public.noema_curriculum_members for each row execute function public.noema_cur_members_keys();
create trigger noema_cur_steps_keys   before update on public.noema_curriculum_steps   for each row execute function public.noema_cur_steps_keys();

alter table public.noema_curricula_shared   enable row level security;
alter table public.noema_curriculum_members enable row level security;
alter table public.noema_curriculum_steps   enable row level security;
drop policy if exists "shared curricula: readable"      on public.noema_curricula_shared;
drop policy if exists "shared curricula: owner"         on public.noema_curricula_shared;
drop policy if exists "cur members: read"               on public.noema_curriculum_members;
drop policy if exists "cur members: owner invites"      on public.noema_curriculum_members;
drop policy if exists "cur members: join public"        on public.noema_curriculum_members;
drop policy if exists "cur members: owner changes"      on public.noema_curriculum_members;
drop policy if exists "cur members: answer"             on public.noema_curriculum_members;
drop policy if exists "cur members: delete"             on public.noema_curriculum_members;
drop policy if exists "cur steps: read"                 on public.noema_curriculum_steps;
drop policy if exists "cur steps: prepare an empty one" on public.noema_curriculum_steps;
drop policy if exists "cur steps: author or expired"    on public.noema_curriculum_steps;
drop policy if exists "cur steps: author or owner"      on public.noema_curriculum_steps;
-- the curriculum: public ones for everybody (also signed out), the others for their owner, members and invited people
create policy "shared curricula: readable" on public.noema_curricula_shared for select to anon, authenticated using (public.noema_cur_access(id) is not null);
create policy "shared curricula: owner"    on public.noema_curricula_shared for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
-- members: the owner sees and manages them; each person sees and answers their own invitation; anyone may join a public one
create policy "cur members: read" on public.noema_curriculum_members for select to authenticated
  using (user_id = (select auth.uid()) or email = lower((select auth.jwt()) ->> 'email') or public.noema_cur_access(curriculum) = 'owner');
create policy "cur members: owner invites" on public.noema_curriculum_members for insert to authenticated
  with check (public.noema_cur_access(curriculum) = 'owner' and status = 'pending' and user_id is null);
create policy "cur members: join public" on public.noema_curriculum_members for insert to authenticated
  with check (status = 'joined' and user_id = (select auth.uid()) and email = lower((select auth.jwt()) ->> 'email')
              and public.noema_cur_access(curriculum) = 'public');   -- public, or shared in one of my rooms (§12)
create policy "cur members: owner changes" on public.noema_curriculum_members for update to authenticated
  using (public.noema_cur_access(curriculum) = 'owner') with check (public.noema_cur_access(curriculum) = 'owner');
create policy "cur members: answer" on public.noema_curriculum_members for update to authenticated
  using ((user_id = (select auth.uid()) or email = lower((select auth.jwt()) ->> 'email')) and status <> 'revoked')
  with check (email = lower((select auth.jwt()) ->> 'email') and user_id = (select auth.uid()) and status in ('joined', 'rejected', 'left'));
create policy "cur members: delete" on public.noema_curriculum_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.noema_cur_access(curriculum) = 'owner');
-- prepared steps: everybody who may see the curriculum sees them; a participant prepares a step NOBODY has (the primary
-- key makes it first come, first served); only the author changes it — or takes over a reservation that ran out
create policy "cur steps: read" on public.noema_curriculum_steps for select to anon, authenticated using (public.noema_cur_access(curriculum) is not null);
create policy "cur steps: prepare an empty one" on public.noema_curriculum_steps for insert to authenticated
  with check (author = (select auth.uid()) and public.noema_cur_access(curriculum) in ('owner', 'member') and public.noema_cur_has_node(curriculum, node_id));
create policy "cur steps: author or expired" on public.noema_curriculum_steps for update to authenticated
  using (public.noema_cur_access(curriculum) in ('owner', 'member') and (author = (select auth.uid()) or (status = 'preparing' and claimed_until < now())))
  with check (author = (select auth.uid()) and public.noema_cur_access(curriculum) in ('owner', 'member'));
create policy "cur steps: author or owner" on public.noema_curriculum_steps for delete to authenticated
  using (author = (select auth.uid()) or public.noema_cur_access(curriculum) = 'owner');

-- files: noema-curricula/<curriculum>/steps/<author>/<step>.json (+ <step>/src-…) written by their author only;
--        noema-curricula/<curriculum>/files/… (the learner's material of the map) written by the owner only
insert into storage.buckets (id, name, public, file_size_limit) values ('noema-curricula', 'noema-curricula', false, 52428800)
on conflict (id) do nothing;
drop policy if exists "noema curricula read"   on storage.objects;
drop policy if exists "noema curricula insert" on storage.objects;
drop policy if exists "noema curricula update" on storage.objects;
drop policy if exists "noema curricula delete" on storage.objects;
create policy "noema curricula read" on storage.objects for select to authenticated using (bucket_id = 'noema-curricula'
  and public.noema_cur_access((storage.foldername(name))[1]) is not null);
create policy "noema curricula insert" on storage.objects for insert to authenticated with check (bucket_id = 'noema-curricula' and (
  ((storage.foldername(name))[2] = 'steps' and (storage.foldername(name))[3] = (select auth.uid())::text and public.noema_cur_access((storage.foldername(name))[1]) in ('owner', 'member'))
  or ((storage.foldername(name))[2] = 'files' and public.noema_cur_access((storage.foldername(name))[1]) = 'owner')));
create policy "noema curricula update" on storage.objects for update to authenticated using (bucket_id = 'noema-curricula' and (
  ((storage.foldername(name))[2] = 'steps' and (storage.foldername(name))[3] = (select auth.uid())::text and public.noema_cur_access((storage.foldername(name))[1]) in ('owner', 'member'))
  or ((storage.foldername(name))[2] = 'files' and public.noema_cur_access((storage.foldername(name))[1]) = 'owner')));
create policy "noema curricula delete" on storage.objects for delete to authenticated using (bucket_id = 'noema-curricula' and (
  ((storage.foldername(name))[2] = 'steps' and (storage.foldername(name))[3] = (select auth.uid())::text)
  or public.noema_cur_access((storage.foldername(name))[1]) = 'owner'));

-- 11) THE PAGE OTHERS SEE (Me › Me, docs/PROFILE.md): one row per person. Private until its owner publishes it; then
--     everybody (also signed-out visitors) may read it. `card` holds only the parts the owner switched on (progress,
--     achievements, languages, topics); the picture is a small image kept in the row (data:image/…), never a file.
create table if not exists public.noema_public_profiles (
  owner        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  published    boolean not null default false,
  display_name text check (char_length(display_name) <= 80),
  emoji        text check (char_length(emoji) <= 16),
  bio          text check (char_length(bio) <= 600),
  avatar       text check (avatar is null or (char_length(avatar) <= 200000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')),
  show         jsonb not null default '{}'::jsonb,   -- which parts the owner shows: progress, achievements, languages, topics, shares
  card         jsonb not null default '{}'::jsonb,   -- the shown parts, as of updated_at
  updated_at   timestamptz not null default now()
);
alter table public.noema_public_profiles enable row level security;
drop policy if exists "public pages readable" on public.noema_public_profiles;
drop policy if exists "own public page"       on public.noema_public_profiles;
create policy "public pages readable" on public.noema_public_profiles for select to anon, authenticated using (published or owner = (select auth.uid()));
create policy "own public page"       on public.noema_public_profiles for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- 12) 👥 PEOPLE, BUDDIES, MESSAGES AND STUDY GROUPS (docs/SOCIAL.md). Messages are readable by the server (row-level
--     security keeps them to the people of the conversation; reports and moderation are possible), not end-to-end.
--     noema_people       how a person appears to others: name, emoji, findable by name, who may message them
--     noema_buddies      one row per pair (a < b): a request ('pending', asked_by) or 'buddies'
--     noema_blocks       a blocked person cannot find you, ask you, message you or invite you
--     noema_rooms        a conversation: 'dm' (two people, one room per pair) or 'group' (a study group: chat, its own
--                        folder of the vault, shared Roadmaps); a group may have an invitation link (join_code)
--     noema_room_members who is in a room: 'invited' · 'joined' · 'left'; roles owner · admin · member; last_read
--     noema_messages     text and at most one attachment: a file, a subject, a Roadmap or a file of the vault
--     noema_chat_files   the files sent in a room (bucket noema-chat: rooms/<room>/<id>.<ext>), the vault's formats
--                        only (plus a subject's pack, .json); they count towards the person's 50 MB with the vault
--     noema_room_roadmaps the Roadmaps shared in a room: its members may join them (noema_cur_access → 'public')
--     Everything is written through these rules or the functions below (security definer), never trusted to the app.
create table if not exists public.noema_people (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  emoji        text check (char_length(emoji) <= 16),
  search       text check (char_length(search) <= 600),   -- the name as searched: folded, also in Latin letters (written by the app)
  university   text check (char_length(university) <= 120),
  findable     boolean not null default true,              -- others may find me by my name
  dm_from      text not null default 'buddies' check (dm_from in ('buddies', 'everyone', 'nobody')),   -- who may start a conversation or invite me
  updated_at   timestamptz not null default now()
);
create table if not exists public.noema_buddies (
  a           uuid not null references auth.users(id) on delete cascade,
  b           uuid not null references auth.users(id) on delete cascade,
  asked_by    uuid not null,
  status      text not null default 'pending' check (status in ('pending', 'buddies')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  primary key (a, b), check (a < b), check (asked_by in (a, b))
);
create table if not exists public.noema_blocks (
  blocker    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked), check (blocker <> blocked)
);
create table if not exists public.noema_rooms (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('dm', 'group')),
  dm_key     text unique,                                   -- a dm: '<smaller id>:<larger id>'
  name       text check (char_length(name) <= 80),
  about      text check (char_length(about) <= 600),
  university text check (char_length(university) <= 120),
  course     text check (char_length(course) <= 160),
  emoji      text check (char_length(emoji) <= 16),
  join_code  text unique check (join_code ~ '^[A-Za-z0-9]{12,40}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  check ((kind = 'dm') = (dm_key is not null)), check (kind = 'dm' or char_length(name) >= 2)
);
create table if not exists public.noema_room_members (
  room       uuid not null references public.noema_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status     text not null default 'joined' check (status in ('invited', 'joined', 'left')),
  invited_by uuid,
  last_read  timestamptz not null default now(),
  muted      boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (room, user_id)
);
create index if not exists noema_room_members_user on public.noema_room_members (user_id, status);
create table if not exists public.noema_messages (
  id         uuid primary key default gen_random_uuid(),
  room       uuid not null references public.noema_rooms(id) on delete cascade,
  author     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 4000),
  att        jsonb check (att is null or (att ->> 'kind') in ('file', 'subject', 'roadmap', 'vault')),
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted    boolean not null default false,
  hidden     boolean not null default false,               -- three reports
  reports    int not null default 0
);
create index if not exists noema_messages_room on public.noema_messages (room, created_at);
create table if not exists public.noema_chat_files (
  path       text primary key check (path ~ '^rooms/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx?|odt|rtf|txt|md|tex|pptx?|odp|xlsx?|ods|csv|epub|png|jpe?g|gif|webp|heic|mp3|m4a|wav|ogg|flac|mp4|webm|mov|json)$'),
  room       uuid not null references public.noema_rooms(id) on delete cascade,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  mime       text not null check (mime ~ '^(application/(pdf|json|msword|rtf|epub\+zip|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)|vnd\.oasis\.opendocument\.(text|presentation|spreadsheet)|x-tex)|text/(plain|markdown|csv|x-tex)|image/(png|jpeg|gif|webp|heic)|audio/(mpeg|mp4|x-m4a|wav|x-wav|ogg|flac)|video/(mp4|webm|quicktime))$'),
  size       bigint not null check (size > 0 and size <= 20971520),
  status     text not null default 'pending' check (status in ('pending', 'ok')),
  created_at timestamptz not null default now()
);
create index if not exists noema_chat_files_owner on public.noema_chat_files (owner);
create table if not exists public.noema_message_reports (
  message  uuid not null references public.noema_messages(id) on delete cascade,
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason   text not null check (reason in ('harassment', 'spam', 'live_exam', 'copyright', 'other')),
  note     text check (char_length(note) <= 600),
  at       timestamptz not null default now(),
  primary key (message, reporter)
);
create table if not exists public.noema_room_roadmaps (
  room       uuid not null references public.noema_rooms(id) on delete cascade,
  curriculum text not null references public.noema_curricula_shared(id) on delete cascade,
  added_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at         timestamptz not null default now(),
  primary key (room, curriculum)
);

-- the questions the rules ask (security definer: no recursion through the rules themselves)
create or replace function public.noema_room_role(r uuid) returns text language sql stable security definer set search_path = public as $$
  select case when status = 'joined' then role when status = 'invited' then 'invited' end from public.noema_room_members where room = r and user_id = auth.uid() $$;
create or replace function public.noema_room_joined(r uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_room_members where room = r and user_id = auth.uid() and status = 'joined') $$;
create or replace function public.noema_blocked(x uuid, y uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_blocks where (blocker = x and blocked = y) or (blocker = y and blocked = x)) $$;
create or replace function public.noema_buddies_with(x uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_buddies where a = least(x, auth.uid()) and b = greatest(x, auth.uid()) and status = 'buddies') $$;
-- may I start a conversation with them, or invite them to a group? their setting decides; a block (either way) never
create or replace function public.noema_may_contact(x uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and x <> auth.uid() and not public.noema_blocked(auth.uid(), x)
     and case coalesce((select dm_from from public.noema_people where user_id = x), 'buddies')
           when 'everyone' then true when 'buddies' then public.noema_buddies_with(x) else false end $$;
-- people I know: buddies (or a request between us) and the people of my rooms — I see their name even when they are not findable
create or replace function public.noema_knows(x uuid) returns boolean language sql stable security definer set search_path = public as $$
  select x = auth.uid()
      or exists (select 1 from public.noema_buddies where a = least(x, auth.uid()) and b = greatest(x, auth.uid()))
      or exists (select 1 from public.noema_room_members m join public.noema_room_members o on o.room = m.room
                 where m.user_id = auth.uid() and m.status in ('joined', 'invited') and o.user_id = x and o.status <> 'left') $$;
-- the bytes a person keeps on the server: the vault and the files sent in conversations (Free plan: 50 MB each)
create or replace function public.noema_used_bytes(u uuid) returns bigint language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select sum(size) from public.noema_vault_files where uploader = u), 0) + coalesce((select sum(size) from public.noema_chat_files where owner = u), 0);
end $$;

alter table public.noema_people          enable row level security;
alter table public.noema_buddies         enable row level security;
alter table public.noema_blocks          enable row level security;
alter table public.noema_rooms           enable row level security;
alter table public.noema_room_members    enable row level security;
alter table public.noema_messages        enable row level security;
alter table public.noema_chat_files      enable row level security;
alter table public.noema_message_reports enable row level security;
alter table public.noema_room_roadmaps   enable row level security;
drop policy if exists "people: findable or known" on public.noema_people;
drop policy if exists "people: own"               on public.noema_people;
drop policy if exists "buddies: the two"          on public.noema_buddies;
drop policy if exists "buddies: either ends it"   on public.noema_buddies;
drop policy if exists "blocks: own"               on public.noema_blocks;
drop policy if exists "rooms: members"            on public.noema_rooms;
drop policy if exists "rooms: owner and admins"   on public.noema_rooms;
drop policy if exists "members: of my rooms"      on public.noema_room_members;
drop policy if exists "members: self or admins"   on public.noema_room_members;
drop policy if exists "messages: read"            on public.noema_messages;
drop policy if exists "messages: write"           on public.noema_messages;
drop policy if exists "messages: own"             on public.noema_messages;
drop policy if exists "chat files: read"          on public.noema_chat_files;
drop policy if exists "chat files: add"           on public.noema_chat_files;
drop policy if exists "chat files: remove own"    on public.noema_chat_files;
drop policy if exists "message reports: own"      on public.noema_message_reports;
drop policy if exists "message reports: add"      on public.noema_message_reports;
drop policy if exists "room roadmaps: read"       on public.noema_room_roadmaps;
drop policy if exists "room roadmaps: add"        on public.noema_room_roadmaps;
drop policy if exists "room roadmaps: remove"     on public.noema_room_roadmaps;
create policy "people: findable or known" on public.noema_people for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (select blocked from public.noema_blocks where blocker = (select auth.uid()))   -- my list of blocked people has their names
         or (not public.noema_blocked(user_id, (select auth.uid())) and (findable or public.noema_knows(user_id))));
create policy "people: own" on public.noema_people for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "buddies: the two" on public.noema_buddies for select to authenticated using ((select auth.uid()) in (a, b));
create policy "buddies: either ends it" on public.noema_buddies for delete to authenticated using ((select auth.uid()) in (a, b));   -- asking and answering: noema_buddy_ask / noema_buddy_answer
create policy "blocks: own" on public.noema_blocks for all to authenticated using (blocker = (select auth.uid())) with check (blocker = (select auth.uid()));
create policy "rooms: members" on public.noema_rooms for select to authenticated using (public.noema_room_role(id) is not null);   -- creating: noema_dm_open / noema_group_create
create policy "rooms: owner and admins" on public.noema_rooms for update to authenticated using (kind = 'group' and public.noema_room_role(id) in ('owner', 'admin')) with check (kind = 'group');
create policy "members: of my rooms" on public.noema_room_members for select to authenticated using (user_id = (select auth.uid()) or public.noema_room_joined(room));
create policy "members: self or admins" on public.noema_room_members for update to authenticated
  using (user_id = (select auth.uid()) or public.noema_room_role(room) in ('owner', 'admin'));   -- what each may change: noema_member_guard; inviting: noema_room_invite
create policy "messages: read" on public.noema_messages for select to authenticated using (public.noema_room_joined(room) and (not hidden or author = (select auth.uid())));
create policy "messages: write" on public.noema_messages for insert to authenticated with check (author = (select auth.uid()) and public.noema_room_joined(room));
create policy "messages: own" on public.noema_messages for update to authenticated using (author = (select auth.uid())) with check (author = (select auth.uid()));
create policy "chat files: read" on public.noema_chat_files for select to authenticated using (owner = (select auth.uid()) or public.noema_room_joined(room));
create policy "chat files: add" on public.noema_chat_files for insert to authenticated with check (owner = (select auth.uid()) and public.noema_room_joined(room));
create policy "chat files: remove own" on public.noema_chat_files for delete to authenticated using (owner = (select auth.uid()));
create policy "message reports: own" on public.noema_message_reports for select to authenticated using (reporter = (select auth.uid()));
create policy "message reports: add" on public.noema_message_reports for insert to authenticated with check (reporter = (select auth.uid()) and exists (select 1 from public.noema_messages m where m.id = message and public.noema_room_joined(m.room) and m.author <> (select auth.uid())));
create policy "room roadmaps: read" on public.noema_room_roadmaps for select to authenticated using (public.noema_room_joined(room));
create policy "room roadmaps: add" on public.noema_room_roadmaps for insert to authenticated with check (added_by = (select auth.uid()) and public.noema_room_joined(room)
  and exists (select 1 from public.noema_curricula_shared s where s.id = curriculum and (s.owner = (select auth.uid()) or s.public)));   -- only its owner shares a private Roadmap
create policy "room roadmaps: remove" on public.noema_room_roadmaps for delete to authenticated using (added_by = (select auth.uid()) or public.noema_room_role(room) in ('owner', 'admin'));

-- a person's row: the name is tidied, the time is the server's
create or replace function public.noema_people_guard() returns trigger language plpgsql as $$
begin
  new.display_name := regexp_replace(btrim(new.display_name), '\s+', ' ', 'g'); new.university := nullif(regexp_replace(btrim(coalesce(new.university, '')), '\s+', ' ', 'g'), '');
  new.updated_at := now(); return new;
end $$;
drop trigger if exists noema_people_guard on public.noema_people;
create trigger noema_people_guard before insert or update on public.noema_people for each row execute function public.noema_people_guard();
-- a block ends the friendship (and any request) at once
create or replace function public.noema_block_ends() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from public.noema_buddies where a = least(new.blocker, new.blocked) and b = greatest(new.blocker, new.blocked); return null; end $$;
drop trigger if exists noema_block_ends on public.noema_blocks;
create trigger noema_block_ends after insert on public.noema_blocks for each row execute function public.noema_block_ends();

-- 🤝 ask someone to be study buddies (→ 'asked'), or accept their request by asking back (→ 'buddies')
create or replace function public.noema_buddy_ask(x uuid) returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.noema_buddies; open_n int;
begin
  if me is null or x is null or x = me then raise exception 'not possible'; end if;
  if public.noema_blocked(me, x) then raise exception 'not possible' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.noema_people p where p.user_id = x and (p.findable or public.noema_knows(x))) then raise exception 'person not found' using errcode = 'P0002'; end if;
  select * into r from public.noema_buddies where a = least(me, x) and b = greatest(me, x);
  if found then
    if r.status = 'buddies' then return 'buddies'; end if;
    if r.asked_by = me then return 'asked'; end if;
    update public.noema_buddies set status = 'buddies', answered_at = now() where a = r.a and b = r.b; return 'buddies';
  end if;
  select count(*) into open_n from public.noema_buddies where asked_by = me and status = 'pending';
  if open_n >= 50 then raise exception 'too many open requests' using errcode = 'P0001'; end if;
  insert into public.noema_buddies (a, b, asked_by) values (least(me, x), greatest(me, x), me); return 'asked';
end $$;
create or replace function public.noema_buddy_answer(x uuid, yes boolean) returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if yes then update public.noema_buddies set status = 'buddies', answered_at = now() where a = least(me, x) and b = greatest(me, x) and asked_by = x and status = 'pending';
         if found then return 'buddies'; end if; return 'none'; end if;
  delete from public.noema_buddies where a = least(me, x) and b = greatest(me, x) and asked_by = x and status = 'pending'; return 'declined';
end $$;

-- 💬 the conversation with one person (made the first time; theirs to answer). Their setting decides who may start one.
create or replace function public.noema_dm_open(x uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; rid uuid;
begin
  if me is null or x is null or x = me then raise exception 'not possible'; end if;
  k := least(me, x)::text || ':' || greatest(me, x)::text;
  select id into rid from public.noema_rooms where dm_key = k;
  if rid is not null and public.noema_blocked(me, x) then raise exception 'blocked' using errcode = 'P0001'; end if;
  -- an existing conversation reopens; a new one needs their permission
  if rid is null then
    if not public.noema_may_contact(x) then raise exception 'they do not take messages from you' using errcode = 'P0001'; end if;
    insert into public.noema_rooms (kind, dm_key, created_by) values ('dm', k, me) returning id into rid;
    insert into public.noema_room_members (room, user_id, role, status) values (rid, me, 'member', 'joined'), (rid, x, 'member', 'joined');
  else
    perform set_config('noema.social', 'server', true);
    update public.noema_room_members set status = 'joined' where room = rid and user_id = me and status <> 'joined';
  end if;
  return rid;
end $$;
-- 👥 a study group: its creator is its owner
create or replace function public.noema_group_create(name text, about text default null, university text default null, course text default null, emoji text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid; n int;
begin
  if me is null then raise exception 'not signed in'; end if;
  select count(*) into n from public.noema_rooms where created_by = me and kind = 'group' and created_at > now() - interval '1 day';
  if n >= 10 then raise exception 'too many new groups today' using errcode = 'P0001'; end if;
  insert into public.noema_rooms (kind, name, about, university, course, emoji, created_by)
    values ('group', regexp_replace(btrim(name), '\s+', ' ', 'g'), nullif(btrim(coalesce(about, '')), ''), nullif(btrim(coalesce(university, '')), ''), nullif(btrim(coalesce(course, '')), ''), nullif(btrim(coalesce(emoji, '')), ''), me) returning id into rid;
  insert into public.noema_room_members (room, user_id, role, status) values (rid, me, 'owner', 'joined');
  return rid;
end $$;
-- invite someone to a group: any member may, if the person takes invitations from them (their setting, no block)
create or replace function public.noema_room_invite(r uuid, x uuid) returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); st text; n int;
begin
  if not exists (select 1 from public.noema_rooms where id = r and kind = 'group') or not public.noema_room_joined(r) then raise exception 'not a member of this group' using errcode = 'P0001'; end if;
  select status into st from public.noema_room_members where room = r and user_id = x;
  if st in ('joined', 'invited') then return st; end if;
  if not public.noema_may_contact(x) then raise exception 'they do not take invitations from you' using errcode = 'P0001'; end if;
  select count(*) into n from public.noema_room_members where room = r and status in ('joined', 'invited');
  if n >= 200 then raise exception 'the group is full' using errcode = 'P0001'; end if;
  perform set_config('noema.social', 'server', true);
  insert into public.noema_room_members (room, user_id, role, status, invited_by) values (r, x, 'member', 'invited', me)
    on conflict (room, user_id) do update set status = 'invited', role = 'member', invited_by = me;
  return 'invited';
end $$;
-- the invitation link of a group: what it is (before joining) and joining it
create or replace function public.noema_room_peek(code text) returns table (id uuid, name text, about text, university text, course text, emoji text, members int, mine text)
  language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.about, r.university, r.course, r.emoji, (select count(*)::int from public.noema_room_members m where m.room = r.id and m.status = 'joined'), public.noema_room_role(r.id)
  from public.noema_rooms r where r.kind = 'group' and r.join_code = code and auth.uid() is not null $$;
create or replace function public.noema_room_join(code text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid; n int;
begin
  select id into rid from public.noema_rooms where kind = 'group' and join_code = code;
  if me is null or rid is null then raise exception 'this invitation link does not work any more' using errcode = 'P0002'; end if;
  if public.noema_room_joined(rid) then return rid; end if;
  select count(*) into n from public.noema_room_members where room = rid and status = 'joined';
  if n >= 200 then raise exception 'the group is full' using errcode = 'P0001'; end if;
  perform set_config('noema.social', 'server', true);
  insert into public.noema_room_members (room, user_id, role, status) values (rid, me, 'member', 'joined')
    on conflict (room, user_id) do update set status = 'joined', role = 'member', joined_at = now();
  return rid;
end $$;

-- what a member may change in a membership: their own answer (join / leave), when they read, muting; owners and admins
-- remove members (admins only plain members) and owners name admins. When the owner leaves, the group gets a new owner.
create or replace function public.noema_member_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my text; heir uuid;
begin
  if current_setting('noema.social', true) = 'server' then return new; end if;
  if new.room <> old.room or new.user_id <> old.user_id or new.invited_by is distinct from old.invited_by or new.joined_at <> old.joined_at then raise exception 'not allowed'; end if;
  if old.user_id = me then
    if new.role <> old.role then raise exception 'not allowed'; end if;
    if new.status <> old.status and not ((old.status = 'invited' and new.status in ('joined', 'left')) or (old.status = 'joined' and new.status = 'left')) then raise exception 'not allowed'; end if;
    if old.status = 'invited' and new.status = 'joined' then new.joined_at := now(); new.last_read := now(); end if;
    if new.status = 'left' and old.role = 'owner' then
      new.role := 'member';
      select user_id into heir from public.noema_room_members where room = old.room and user_id <> me and status = 'joined' order by (role = 'admin') desc, joined_at limit 1;
      perform set_config('noema.social', 'server', true);
      if heir is not null then update public.noema_room_members set role = 'owner' where room = old.room and user_id = heir; end if;
      perform set_config('noema.social', '', true);
    end if;
    return new;
  end if;
  select case when status = 'joined' then role end into my from public.noema_room_members where room = old.room and user_id = me;
  if new.last_read <> old.last_read or new.muted <> old.muted then raise exception 'not allowed'; end if;
  if new.status <> old.status and not (new.status = 'left' and (my = 'owner' or (my = 'admin' and old.role = 'member'))) then raise exception 'not allowed'; end if;
  if new.role <> old.role and not (my = 'owner' and new.role in ('admin', 'member') and old.role <> 'owner') then raise exception 'not allowed'; end if;
  return new;
end $$;
drop trigger if exists noema_member_guard on public.noema_room_members;
create trigger noema_member_guard before update on public.noema_room_members for each row execute function public.noema_member_guard();
-- a group's description is its owners' and admins'; the kind of a room, its pair and its clock are the server's
create or replace function public.noema_room_guard() returns trigger language plpgsql as $$
begin
  if current_setting('noema.social', true) = 'server' then return new; end if;
  new.id := old.id; new.kind := old.kind; new.dm_key := old.dm_key; new.created_by := old.created_by; new.created_at := old.created_at; new.last_at := old.last_at;
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  return new;
end $$;
drop trigger if exists noema_room_guard on public.noema_rooms;
create trigger noema_room_guard before update on public.noema_rooms for each row execute function public.noema_room_guard();

-- a message: written as its author, in a room they are in; a conversation with one person needs their permission (or
-- that they wrote first); an attachment must be the author's file in this room, a Roadmap shared here or a vault file
-- one may see. ≤ 30 messages a minute. Editing: the text, or deleting (the text and attachment go).
create or replace function public.noema_message_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rk text; other uuid; n int; k text;
begin
  if current_setting('noema.social', true) = 'server' then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.room := old.room; new.author := old.author; new.created_at := old.created_at; new.hidden := old.hidden; new.reports := old.reports;
    if old.deleted then raise exception 'deleted'; end if;
    if new.deleted then new.body := ''; new.att := null; new.edited_at := now(); return new; end if;
    new.att := old.att; if new.body <> old.body then new.edited_at := now(); end if;
    if btrim(new.body) = '' and new.att is null then raise exception 'empty message'; end if;
    return new;
  end if;
  new.author := me; new.created_at := now(); new.edited_at := null; new.deleted := false; new.hidden := false; new.reports := 0;
  if btrim(new.body) = '' and new.att is null then raise exception 'empty message'; end if;
  select count(*) into n from public.noema_messages where author = me and created_at > now() - interval '1 minute';
  if n >= 30 then raise exception 'too many messages, wait a moment' using errcode = 'P0001'; end if;
  select kind into rk from public.noema_rooms where id = new.room;
  if rk = 'dm' then
    select user_id into other from public.noema_room_members where room = new.room and user_id <> me;
    if public.noema_blocked(me, other) then raise exception 'blocked' using errcode = 'P0001'; end if;
    if not public.noema_may_contact(other) and not exists (select 1 from public.noema_messages where room = new.room and author = other) then
      raise exception 'they do not take messages from you' using errcode = 'P0001'; end if;
  end if;
  if new.att is not null then
    k := new.att ->> 'kind';
    if k in ('file', 'subject') and not exists (select 1 from public.noema_chat_files f where f.path = new.att ->> 'path' and f.room = new.room and f.owner = me and f.status = 'ok'
        and (k = 'subject') = (f.mime = 'application/json')) then raise exception 'attachment not found' using errcode = 'P0001'; end if;
    if k = 'roadmap' and not exists (select 1 from public.noema_room_roadmaps x where x.room = new.room and x.curriculum = new.att ->> 'id') then raise exception 'attachment not found' using errcode = 'P0001'; end if;
    if k = 'vault' and not exists (select 1 from public.noema_vault_files v where v.id::text = new.att ->> 'id' and v.status = 'ok' and (v.room is null or v.room = new.room)) then raise exception 'attachment not found' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
create or replace function public.noema_message_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('noema.social', 'server', true);
  update public.noema_rooms set last_at = new.created_at where id = new.room;
  update public.noema_room_members set last_read = new.created_at where room = new.room and user_id = new.author;
  update public.noema_room_members set status = 'joined' where room = new.room and status = 'left' and exists (select 1 from public.noema_rooms where id = new.room and kind = 'dm');   -- a closed conversation comes back
  perform set_config('noema.social', '', true);
  return null;
end $$;
drop trigger if exists noema_message_guard on public.noema_messages;
drop trigger if exists noema_message_after on public.noema_messages;
create trigger noema_message_guard before insert or update on public.noema_messages for each row execute function public.noema_message_guard();
create trigger noema_message_after after insert on public.noema_messages for each row execute function public.noema_message_after();
-- three reports hide a message
create or replace function public.noema_message_tally() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('noema.social', 'server', true);
  update public.noema_messages m set reports = r.n, hidden = m.hidden or r.n >= 3 from (select count(*) n from public.noema_message_reports where message = new.message) r where m.id = new.message;
  perform set_config('noema.social', '', true);
  return null;
end $$;
drop trigger if exists noema_message_reported on public.noema_message_reports;
create trigger noema_message_reported after insert on public.noema_message_reports for each row execute function public.noema_message_tally();
-- a file sent in a room: 'pending' until noema_chat_finish has seen it in storage with its size; the 50 MB count
create or replace function public.noema_chat_file_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare used_bytes bigint;
begin
  new.owner := auth.uid(); new.status := 'pending'; new.created_at := now();
  if split_part(new.path, '/', 2) <> new.room::text then raise exception 'wrong folder'; end if;
  used_bytes := public.noema_used_bytes(new.owner);
  if used_bytes + new.size > 52428800 then raise exception 'storage quota: % of 52428800 bytes used', used_bytes using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists noema_chat_file_guard on public.noema_chat_files;
create trigger noema_chat_file_guard before insert on public.noema_chat_files for each row execute function public.noema_chat_file_guard();
create or replace function public.noema_chat_finish(p text) returns text language plpgsql security definer set search_path = public, storage as $$
declare f public.noema_chat_files; got bigint;
begin
  select * into f from public.noema_chat_files where path = p and owner = auth.uid();
  if not found then raise exception 'not your file'; end if;
  select (metadata->>'size')::bigint into got from storage.objects where bucket_id = 'noema-chat' and name = f.path;
  if got is null then raise exception 'the file is not uploaded yet'; end if;
  if got <> f.size then raise exception 'size mismatch: % uploaded, % announced', got, f.size; end if;
  update public.noema_chat_files set status = 'ok' where path = p;
  return 'ok';
end $$;

-- 📬 my conversations at a glance: the other person (a dm) or the group, the last message, how many I have not read
create or replace function public.noema_inbox() returns table (room uuid, kind text, name text, emoji text, other uuid, other_name text, other_emoji text, status text, role text,
    last_at timestamptz, last_body text, last_author uuid, last_kind text, unread int, muted boolean, members int)
  language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.name, r.emoji, o.user_id, coalesce(p.display_name, pr.display_name), coalesce(p.emoji, pr.emoji), m.status, m.role, r.last_at,
         lm.body, lm.author, lm.att ->> 'kind',
         (select count(*)::int from public.noema_messages x where x.room = r.id and x.created_at > m.last_read and x.author <> m.user_id and not x.hidden and not x.deleted),
         m.muted, (select count(*)::int from public.noema_room_members y where y.room = r.id and y.status = 'joined')
  from public.noema_room_members m join public.noema_rooms r on r.id = m.room
  left join public.noema_room_members o on r.kind = 'dm' and o.room = r.id and o.user_id <> m.user_id
  left join public.noema_people p on p.user_id = o.user_id left join public.noema_profiles pr on pr.user_id = o.user_id
  left join lateral (select body, author, att from public.noema_messages z where z.room = r.id and not z.hidden order by z.created_at desc limit 1) lm on true
  where m.user_id = auth.uid() and m.status in ('joined', 'invited') and (r.kind = 'group' or lm.author is not null or r.created_by = auth.uid())
  order by r.last_at desc $$;
revoke execute on function public.noema_inbox() from anon;

-- the files of conversations: noema-chat/rooms/<room>/<id>.<ext>, readable by the room's members, written by their sender
create or replace function public.noema_chat_readable(obj text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_chat_files where path = obj and (owner = auth.uid() or (status = 'ok' and public.noema_room_joined(room)))) $$;
create or replace function public.noema_chat_writable(obj text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_chat_files where path = obj and owner = auth.uid()) $$;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('noema-chat', 'noema-chat', false, 20971520, array[
  'application/pdf', 'application/json', 'application/msword', 'application/rtf', 'application/epub+zip', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet', 'application/x-tex', 'text/plain', 'text/markdown', 'text/csv', 'text/x-tex',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac',
  'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "noema chat read"   on storage.objects;
drop policy if exists "noema chat insert" on storage.objects;
drop policy if exists "noema chat update" on storage.objects;
drop policy if exists "noema chat delete" on storage.objects;
create policy "noema chat read"   on storage.objects for select to authenticated using       (bucket_id = 'noema-chat' and public.noema_chat_readable(name));
create policy "noema chat insert" on storage.objects for insert to authenticated with check (bucket_id = 'noema-chat' and public.noema_chat_writable(name));
create policy "noema chat update" on storage.objects for update to authenticated using       (bucket_id = 'noema-chat' and public.noema_chat_writable(name));
create policy "noema chat delete" on storage.objects for delete to authenticated using       (bucket_id = 'noema-chat' and public.noema_chat_writable(name));

-- 13) 🗄️ THE VAULT (docs/VAULT.md): files students share — notes, slides, past exams (with or without solutions),
--     exercise sets, lab work, summaries, books, recordings. Strictly organised: every file carries its university,
--     department, course, year and semester when known (they differ from place to place: all optional), and always its type,
--     fields (§13b: 1–12 of the shared graph of fields) and languages (one or more: el,ru), so the folders (university › department ›
--     course › year › type; what is not given: a folder of its own) and every filter work across all of them.
--     ANONYMOUS: the uploader is kept here for deleting and take-downs, but nobody else can read it: the table shows
--     each person only their own rows; everybody reads the view noema_vault, which has no uploader column (only the
--     name of those who chose to show it, taken from their profile). Free plan: files ≤ 20 MB, ≤ 50 MB per person.
--     A file is 'pending' until noema_vault_finish() has seen it in storage with its size; three reports hide it. A file
--     of a study group's folder (room) is seen only by its members; the 50 MB count includes the files sent in chats.
create table if not exists public.noema_vault_files (
  id            uuid primary key default gen_random_uuid(),
  uploader      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  show_name     boolean not null default false,
  uploader_name text,
  status        text not null default 'pending' check (status in ('pending', 'ok', 'hidden')),
  title         text not null check (char_length(title) between 1 and 160),
  description   text check (char_length(description) <= 1000),
  university    text check (char_length(university) between 2 and 120),
  department    text check (char_length(department) between 2 and 120),
  course        text check (char_length(course) between 2 and 160),
  professor     text check (char_length(professor) <= 120),
  year          int  check (year between 1950 and 2100),
  semester      int  check (semester between 1 and 12),   -- none: any semester
  kind          text not null check (kind in ('notes', 'slides', 'exam', 'exam_solved', 'exercises', 'lab', 'summary', 'book', 'recording', 'other')),
  subject       text check (subject ~ '^[a-z][a-z_]{1,40}$'),   -- before the fields (§13b): a key of the app's old fixed list
  fields        text[] not null default '{}',                     -- §13b: 1–12 fields of the shared graph
  language      text not null check (language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?(,[a-z]{2,3}(-[A-Za-z]{2,4})?){0,7}$'),   -- one or more: el,ru
  has_exercises boolean not null default false,
  has_solutions boolean not null default false,
  handwritten   boolean not null default false,
  file_name     text not null check (char_length(file_name) <= 200),
  mime          text not null check (mime ~ '^(application/(pdf|msword|rtf|epub\+zip|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)|vnd\.oasis\.opendocument\.(text|presentation|spreadsheet)|x-tex)|text/(plain|markdown|csv|x-tex)|image/(png|jpeg|gif|webp|heic)|audio/(mpeg|mp4|x-m4a|wav|x-wav|ogg|flac)|video/(mp4|webm|quicktime))$'),
  size          bigint not null check (size > 0 and size <= 20971520),
  pages         int check (pages is null or pages between 0 and 100000),
  path          text not null unique check (path ~ '^files/[0-9a-f-]{36}\.(pdf|docx?|odt|rtf|txt|md|tex|pptx?|odp|xlsx?|ods|csv|epub|png|jpe?g|gif|webp|heic|mp3|m4a|wav|ogg|flac|mp4|webm|mov)$'),   -- only these formats: no programs, scripts, archives or SVG
  rating_sum    int not null default 0,
  rating_n      int not null default 0,
  downloads     int not null default 0,
  used          int not null default 0,
  reports       int not null default 0,
  room          uuid references public.noema_rooms(id) on delete cascade,   -- a study group's own folder: only its members see the file (§12)
  created_at    timestamptz not null default now()
);
alter table public.noema_vault_files add column if not exists room uuid references public.noema_rooms(id) on delete cascade;   -- (made before 2026-10-21 without it)
alter table public.noema_vault_files add column if not exists fields text[] not null default '{}';   -- §13b
-- (made before the evening of 2026-10-21: university, department, course, year and semester required, one language)
alter table public.noema_vault_files alter column university drop not null, alter column department drop not null, alter column course drop not null,
  alter column year drop not null, alter column semester drop not null;
alter table public.noema_vault_files drop constraint if exists noema_vault_files_language_check;
alter table public.noema_vault_files add constraint noema_vault_files_language_check check (language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?(,[a-z]{2,3}(-[A-Za-z]{2,4})?){0,7}$');
create index if not exists noema_vault_files_where on public.noema_vault_files (university, department, course, year, kind);
create index if not exists noema_vault_files_up    on public.noema_vault_files (uploader);
create table if not exists public.noema_vault_ratings (
  file_id uuid not null references public.noema_vault_files(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  stars   int  not null check (stars between 1 and 5),
  at      timestamptz not null default now(),
  primary key (file_id, user_id)
);
create table if not exists public.noema_vault_reports (
  file_id  uuid not null references public.noema_vault_files(id) on delete cascade,
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason   text not null check (reason in ('copyright', 'live_exam', 'wrong', 'abuse', 'spam', 'other')),
  note     text check (char_length(note) <= 600),
  at       timestamptz not null default now(),
  primary key (file_id, reporter)
);
create table if not exists public.noema_vault_hits (   -- one download / one "made a course from it" per person and file
  file_id uuid not null references public.noema_vault_files(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  what    text not null check (what in ('download', 'used')),
  primary key (file_id, user_id, what)
);
alter table public.noema_vault_files   enable row level security;
alter table public.noema_vault_ratings enable row level security;
alter table public.noema_vault_reports enable row level security;
alter table public.noema_vault_hits    enable row level security;
drop policy if exists "own vault files"   on public.noema_vault_files;
drop policy if exists "own vault ratings" on public.noema_vault_ratings;
drop policy if exists "own vault reports" on public.noema_vault_reports;
create policy "own vault files"   on public.noema_vault_files   for all to authenticated using (uploader = (select auth.uid())) with check (uploader = (select auth.uid()));
create policy "own vault ratings" on public.noema_vault_ratings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own vault reports" on public.noema_vault_reports for select to authenticated using (reporter = (select auth.uid()));
drop policy if exists "add vault reports" on public.noema_vault_reports;
create policy "add vault reports" on public.noema_vault_reports for insert to authenticated with check (reporter = (select auth.uid()));
-- (noema_vault_hits: no policy — written only by noema_vault_count)

-- the name a person shows on their files (when they choose to): their profile's, their People page's, or their account's
create or replace function public.noema_vault_name(u uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(display_name), '') from public.noema_profiles where user_id = u),
                  (select nullif(btrim(display_name), '') from public.noema_people where user_id = u),
                  (select nullif(btrim(coalesce(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name', raw_user_meta_data->>'display_name')), '') from auth.users where id = u)) $$;
-- (files shared before 2026-10-22 with "show my name" but no name found: filled in)
do $$ begin
  perform set_config('noema.vault', 'server', true);
  update public.noema_vault_files set uploader_name = public.noema_vault_name(uploader) where show_name and uploader_name is null;
  perform set_config('noema.vault', '', true);
end $$;
-- what an uploader may set: the description of the file. Counters, status, size and path are the server's.
create or replace function public.noema_vault_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare used_bytes bigint; nm text;
begin
  if current_setting('noema.vault', true) = 'server' then return new; end if;
  if tg_op = 'INSERT' then new.uploader := auth.uid(); end if;
  new.university := nullif(regexp_replace(btrim(new.university), '\s+', ' ', 'g'), ''); new.department := nullif(regexp_replace(btrim(new.department), '\s+', ' ', 'g'), '');
  new.course := nullif(regexp_replace(btrim(new.course), '\s+', ' ', 'g'), ''); new.professor := nullif(regexp_replace(btrim(coalesce(new.professor, '')), '\s+', ' ', 'g'), '');
  nm := public.noema_vault_name(new.uploader);   -- the name others see: the profile's, else the People page's, else the account's
  new.uploader_name := case when new.show_name then coalesce(nm, nullif(btrim(new.uploader_name), '')) else null end;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.rating_sum := 0; new.rating_n := 0; new.downloads := 0; new.used := 0; new.reports := 0; new.created_at := now();
    if new.room is not null and not (public.noema_room_joined(new.room) and exists (select 1 from public.noema_rooms where id = new.room and kind = 'group')) then raise exception 'not a member of this group' using errcode = 'P0001'; end if;
    used_bytes := public.noema_used_bytes(new.uploader);   -- the vault and the files sent in conversations together
    if used_bytes + new.size > 52428800 then raise exception 'vault quota: % of 52428800 bytes used', used_bytes using errcode = 'P0001'; end if;
  else
    new.room := old.room; new.id := old.id; new.uploader := old.uploader; new.status := old.status; new.path := old.path; new.size := old.size; new.mime := old.mime; new.file_name := old.file_name;
    new.rating_sum := old.rating_sum; new.rating_n := old.rating_n; new.downloads := old.downloads; new.used := old.used; new.reports := old.reports; new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists noema_vault_guard on public.noema_vault_files;
create trigger noema_vault_guard before insert or update on public.noema_vault_files for each row execute function public.noema_vault_guard();

-- everybody's view of the vault: no uploader, only the files that are there (and one's own, whatever their status)
create or replace view public.noema_vault as
  select id, case when show_name then uploader_name end as uploader_name, (uploader = auth.uid()) as mine, status, title, description,
         university, department, course, professor, year, semester, kind, subject, language, has_exercises, has_solutions, handwritten,
         file_name, mime, size, pages, path, rating_sum, rating_n, downloads, used, created_at, room, fields
  from public.noema_vault_files where (status = 'ok' and (room is null or public.noema_room_joined(room))) or uploader = auth.uid();   -- a group's files: its members
revoke all on public.noema_vault from anon;
grant select on public.noema_vault to authenticated;

create or replace function public.noema_vault_finish(fid uuid) returns text language plpgsql security definer set search_path = public, storage as $$
declare f public.noema_vault_files; got bigint;
begin
  select * into f from public.noema_vault_files where id = fid and uploader = auth.uid();
  if not found then raise exception 'not your file'; end if;
  select (metadata->>'size')::bigint into got from storage.objects where bucket_id = 'noema-vault' and name = f.path;
  if got is null then raise exception 'the file is not uploaded yet'; end if;
  if got <> f.size then raise exception 'size mismatch: % uploaded, % announced', got, f.size; end if;
  perform set_config('noema.vault', 'server', true);
  update public.noema_vault_files set status = 'ok' where id = fid and status = 'pending';
  return 'ok';
end $$;
create or replace function public.noema_vault_count(fid uuid, what text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or what not in ('download', 'used') then return; end if;
  insert into public.noema_vault_hits (file_id, user_id, what) select fid, auth.uid(), what where exists (select 1 from public.noema_vault_files where id = fid and status = 'ok' and (room is null or public.noema_room_joined(room))) on conflict do nothing;
  if found then
    perform set_config('noema.vault', 'server', true);
    if what = 'download' then update public.noema_vault_files set downloads = downloads + 1 where id = fid; else update public.noema_vault_files set used = used + 1 where id = fid; end if;
  end if;
end $$;
create or replace function public.noema_vault_tally() returns trigger language plpgsql security definer set search_path = public as $$
declare fid uuid := coalesce(new.file_id, old.file_id);
begin
  perform set_config('noema.vault', 'server', true);
  if tg_table_name = 'noema_vault_ratings' then
    update public.noema_vault_files f set rating_sum = coalesce(r.s, 0), rating_n = coalesce(r.n, 0) from (select sum(stars) s, count(*) n from public.noema_vault_ratings where file_id = fid) r where f.id = fid;
  else
    update public.noema_vault_files f set reports = r.n, status = case when r.n >= 3 and f.status = 'ok' then 'hidden' else f.status end
      from (select count(*) n from public.noema_vault_reports where file_id = fid) r where f.id = fid;
  end if;
  return null;
end $$;
drop trigger if exists noema_vault_rated on public.noema_vault_ratings;
drop trigger if exists noema_vault_reported on public.noema_vault_reports;
create trigger noema_vault_rated    after insert or update or delete on public.noema_vault_ratings for each row execute function public.noema_vault_tally();
create trigger noema_vault_reported after insert or delete on public.noema_vault_reports for each row execute function public.noema_vault_tally();
create or replace function public.noema_vault_readable(obj text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_vault_files where path = obj and ((status = 'ok' and (room is null or public.noema_room_joined(room))) or uploader = auth.uid())) $$;
create or replace function public.noema_vault_writable(obj text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_vault_files where path = obj and uploader = auth.uid()) $$;

-- the files: noema-vault/files/<id>.<ext> — no person in the path
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('noema-vault', 'noema-vault', false, 20971520, array[
  'application/pdf', 'application/msword', 'application/rtf', 'application/epub+zip', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet', 'application/x-tex', 'text/plain', 'text/markdown', 'text/csv', 'text/x-tex',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac',
  'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "noema vault read"   on storage.objects;
drop policy if exists "noema vault insert" on storage.objects;
drop policy if exists "noema vault delete" on storage.objects;
drop policy if exists "noema vault update" on storage.objects;
create policy "noema vault read"   on storage.objects for select to authenticated using       (bucket_id = 'noema-vault' and public.noema_vault_readable(name));
create policy "noema vault insert" on storage.objects for insert to authenticated with check (bucket_id = 'noema-vault' and public.noema_vault_writable(name));
create policy "noema vault update" on storage.objects for update to authenticated using       (bucket_id = 'noema-vault' and public.noema_vault_writable(name));
create policy "noema vault delete" on storage.objects for delete to authenticated using       (bucket_id = 'noema-vault' and public.noema_vault_writable(name));

-- 13b) 🧭 THE FIELDS OF THE VAULT (docs/VAULT.md §Fields): a shared graph of fields of study. A field may sit under many
--     parents (Medical physics under Physics and under Medicine: a DAG, not a tree); a file carries 1–12 fields. The top
--     are the ten broad fields of ISCED-F 2013 (b_ed … b_sv), below them disciplines from Wikidata (ids Q…), then fields
--     people propose (u_…). Every accepted field has its name in every UI locale (names: {"en": …, "el": …}) and is seen
--     by everybody at once. People PROPOSE a field (noema_vault_field_propose: 'proposed', seen by its proposer, usable on
--     their own files at once); Claude, through the noema connector, accepts, translates, places, merges or rejects them
--     (noema_vault_fields_save, only for the people in noema_admins). The seed: cloud/vault_fields_seed.sql (run it after
--     this script; tools/vault_fields/build_seed.py makes it).
create extension if not exists pg_trgm;
create table if not exists public.noema_vault_fields (
  id          text primary key check (id ~ '^(Q[0-9]{1,12}|b_[a-z]{2}|u_[0-9a-f]{12})$'),
  names       jsonb not null check (jsonb_typeof(names) = 'object' and names <> '{}'::jsonb),   -- locale → name
  aliases     text[] not null default '{}' check (cardinality(aliases) <= 40),                  -- other names, any language (search)
  parents     text[] not null default '{}' check (cardinality(parents) <= 12),
  status      text not null default 'proposed' check (status in ('accepted', 'proposed', 'rejected', 'merged')),
  merged_into text,
  source      text not null default 'user' check (source in ('isced', 'wikidata', 'user', 'claude')),
  proposed_by uuid references auth.users(id) on delete set null,
  note        text check (char_length(note) <= 600),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists noema_vault_fields_parents on public.noema_vault_fields using gin (parents);
-- who may accept and translate fields (Claude works as one of them through the connector): add yourself with
--   insert into public.noema_admins (user_id) select id from auth.users where email = 'you@example.com';
create table if not exists public.noema_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
alter table public.noema_vault_fields enable row level security;
alter table public.noema_admins       enable row level security;
create or replace function public.noema_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.noema_admins where user_id = auth.uid()) $$;
drop policy if exists "vault fields: accepted, mine, admins" on public.noema_vault_fields;
create policy "vault fields: accepted, mine, admins" on public.noema_vault_fields for select to authenticated
  using (status = 'accepted' or proposed_by = (select auth.uid()) or public.noema_is_admin());   -- writing: only the functions below
drop policy if exists "admins: self" on public.noema_admins;
create policy "admins: self" on public.noema_admins for select to authenticated using (user_id = (select auth.uid()));

-- the fields of the files (made before the fields: one key of the app's fixed list in "subject"; the column: §13)
alter table public.noema_vault_files alter column subject drop not null;
create or replace function public.noema_vault_subject_field(s text) returns text language sql immutable as $$
  select case s when 'math' then 'Q395' when 'statistics' then 'Q12483' when 'physics' then 'Q413' when 'chemistry' then 'Q2329' when 'biology' then 'Q420' when 'medicine' then 'Q11190' when 'nursing' then 'Q121176' when 'pharmacy' then 'Q614304' when 'dentistry' then 'Q12128' when 'veterinary' then 'Q170201' when 'cs' then 'Q21198' when 'electrical' then 'Q43035' when 'mechanical' then 'Q101333' when 'civil' then 'Q77590' when 'chemical_eng' then 'Q83588' when 'architecture' then 'Q12271' when 'economics' then 'Q8134' when 'business' then 'Q2043282' when 'accounting' then 'Q4116214' when 'law' then 'Q7748' when 'political' then 'Q36442' when 'sociology' then 'Q21201' when 'psychology' then 'Q9418' when 'education' then 'Q8434' when 'philosophy' then 'Q5891' when 'history' then 'Q309' when 'archaeology' then 'Q23498' when 'literature' then 'Q8242' when 'linguistics' then 'Q8162' when 'languages' then 'b_ah' when 'arts' then 'Q735' when 'music' then 'Q638' when 'geography' then 'Q1071' when 'geology' then 'Q1069' when 'environment' then 'Q188847' when 'agriculture' then 'Q11451' when 'communication' then 'Q11024' when 'theology' then 'Q34178' when 'sports' then 'Q1298380' else 'b_ah' end $$;
do $$ begin
  perform set_config('noema.vault', 'server', true);
  update public.noema_vault_files set fields = array[public.noema_vault_subject_field(subject)] where cardinality(fields) = 0 and subject is not null and subject <> 'other';
  update public.noema_vault_files set fields = array['b_sv'] where cardinality(fields) = 0;
  perform set_config('noema.vault', '', true);
end $$;
alter table public.noema_vault_files drop constraint if exists noema_vault_files_fields_check;
alter table public.noema_vault_files add constraint noema_vault_files_fields_check check (cardinality(fields) between 1 and 12);
create index if not exists noema_vault_files_fields on public.noema_vault_files using gin (fields);
-- the files' fields: known ones (accepted, or proposed by the uploader); an app from before the fields sends a subject
create or replace function public.noema_vault_fields_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('noema.vault', true) = 'server' then return new; end if;
  if cardinality(new.fields) = 0 and new.subject is not null then new.fields := array[public.noema_vault_subject_field(new.subject)]; end if;
  new.fields := array(select distinct x from unnest(new.fields) x);
  if exists (select 1 from unnest(new.fields) x where not exists (select 1 from public.noema_vault_fields f where f.id = x and (f.status = 'accepted' or (f.status = 'proposed' and f.proposed_by = auth.uid())))) then
    raise exception 'unknown field' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists noema_vault_fields_guard on public.noema_vault_files;
create trigger noema_vault_fields_guard before insert or update on public.noema_vault_files for each row execute function public.noema_vault_fields_guard();

-- 🧭 propose a field: the same name (any language) of a known field gives that field back; ≤ 10 proposals a day
create or replace function public.noema_vault_field_propose(name text, lang text, parents text[] default '{}') returns text language plpgsql security definer set search_path = public as $$
declare nm text := regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g'); found_id text; nid text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if char_length(nm) not between 2 and 80 then raise exception 'name: 2 to 80 characters' using errcode = 'P0001'; end if;
  if lang !~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$' then raise exception 'bad language' using errcode = 'P0001'; end if;
  select f.id into found_id from public.noema_vault_fields f
    where f.status in ('accepted', 'proposed') and (f.status = 'accepted' or f.proposed_by = auth.uid())
      and (exists (select 1 from jsonb_each_text(f.names) e where lower(e.value) = lower(nm)) or exists (select 1 from unnest(f.aliases) a where lower(a) = lower(nm)))
    order by (f.status = 'accepted') desc limit 1;
  if found_id is not null then return found_id; end if;
  if (select count(*) from public.noema_vault_fields where proposed_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many proposals today' using errcode = 'P0001';
  end if;
  nid := 'u_' || substr(md5(gen_random_uuid()::text), 1, 12);
  insert into public.noema_vault_fields (id, names, parents, status, source, proposed_by)
    values (nid, jsonb_build_object(lang, nm), array(select distinct p from unnest(coalesce(parents, '{}')) p where exists (select 1 from public.noema_vault_fields f where f.id = p and f.status = 'accepted') limit 12), 'proposed', 'user', auth.uid());
  return nid;
end $$;

-- 🧭 what others chose for files like this one: fields of files with a similar title or course (counts only, nobody's name)
create or replace function public.noema_vault_field_suggest(title text, course text default null) returns table (field text, n int) language sql stable security definer set search_path = public as $$
  select x, count(*)::int from public.noema_vault_files v, unnest(v.fields) x
  where v.status = 'ok' and v.room is null and v.uploader <> auth.uid()
    and (similarity(lower(v.title), lower(coalesce(title, ''))) > 0.35 or (coalesce(course, '') <> '' and v.course is not null and similarity(lower(v.course), lower(course)) > 0.45))
    and exists (select 1 from public.noema_vault_fields f where f.id = x and f.status = 'accepted')
  group by x order by 2 desc limit 8 $$;

-- 🧭 for Claude (admins): what waits — the proposals (with how many files use them) and accepted fields missing a name
create or replace function public.noema_vault_fields_queue(locales text[], lim int default 50) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.noema_is_admin() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'proposed', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'names', f.names, 'parents', f.parents, 'created_at', f.created_at,
        'files', (select count(*) from public.noema_vault_files v where f.id = any(v.fields)),
        'titles', (select jsonb_agg(t) from (select v.title t from public.noema_vault_files v where f.id = any(v.fields) limit 5) q)))
      from (select * from public.noema_vault_fields where status = 'proposed' order by created_at limit lim) f), '[]'::jsonb),
    'untranslated', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'names', f.names, 'missing', (select jsonb_agg(l) from unnest(locales) l where not f.names ? l)))
      from (select * from public.noema_vault_fields f2 where status = 'accepted' and exists (select 1 from unnest(locales) l where not f2.names ? l) order by id limit lim) f), '[]'::jsonb),
    'counts', jsonb_build_object('accepted', (select count(*) from public.noema_vault_fields where status = 'accepted'),
      'proposed', (select count(*) from public.noema_vault_fields where status = 'proposed'),
      'untranslated', (select count(*) from public.noema_vault_fields f2 where status = 'accepted' and exists (select 1 from unnest(locales) l where not f2.names ? l))));
end $$;

-- 🧭 for Claude (admins): change fields. Each item: {"id"?, "names"? (added to the names), "aliases"? (added), "parents"?
--     (replace) | "add_parents"?, "status"? accepted|rejected, "merge_into"? (its files and children move there), "note"?}.
--     No id: a new accepted field. A parent must exist and must not be the field or below it (the graph stays a DAG).
create or replace function public.noema_vault_fields_save(items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; fid text; ps text[]; tgt text; done jsonb := '[]'::jsonb; cur public.noema_vault_fields;
begin
  if not public.noema_is_admin() then raise exception 'admins only'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 200 then raise exception 'items: an array of at most 200'; end if;
  for it in select * from jsonb_array_elements(items) loop
    fid := it->>'id';
    if fid is null then
      fid := 'u_' || substr(md5(gen_random_uuid()::text), 1, 12);
      insert into public.noema_vault_fields (id, names, status, source) values (fid, coalesce(it->'names', '{}'::jsonb), 'accepted', 'claude');
    end if;
    select * into cur from public.noema_vault_fields where id = fid for update;
    if not found then raise exception 'no field %', fid; end if;
    if it ? 'names' then
      if exists (select 1 from jsonb_each(it->'names') e where jsonb_typeof(e.value) <> 'string' or e.key !~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$' or char_length(e.value #>> '{}') not between 1 and 120) then raise exception 'bad names for %', fid; end if;
      update public.noema_vault_fields set names = names || (it->'names') where id = fid;
    end if;
    if it ? 'aliases' then
      update public.noema_vault_fields set aliases = (select array(select distinct a from unnest(aliases || array(select jsonb_array_elements_text(it->'aliases'))) a limit 40)) where id = fid;
    end if;
    if it ? 'parents' or it ? 'add_parents' then
      ps := case when it ? 'parents' then array(select jsonb_array_elements_text(it->'parents')) else cur.parents || array(select jsonb_array_elements_text(it->'add_parents')) end;
      ps := array(select distinct p from unnest(ps) p);
      if exists (select 1 from unnest(ps) p where not exists (select 1 from public.noema_vault_fields f where f.id = p and f.status = 'accepted')) then raise exception 'unknown parent for %', fid; end if;
      if fid = any(ps) or exists (with recursive down(id) as (select f.id from public.noema_vault_fields f where fid = any(f.parents)
            union select f.id from public.noema_vault_fields f join down on down.id = any(f.parents)) select 1 from down where down.id = any(ps)) then
        raise exception 'a parent of % is below it', fid;
      end if;
      update public.noema_vault_fields set parents = ps where id = fid;
    end if;
    if it ? 'note' then update public.noema_vault_fields set note = it->>'note' where id = fid; end if;
    tgt := it->>'merge_into';
    if tgt is not null then
      if tgt = fid or not exists (select 1 from public.noema_vault_fields where id = tgt and status = 'accepted') then raise exception 'bad merge target for %', fid; end if;
      perform set_config('noema.vault', 'server', true);
      update public.noema_vault_files set fields = array(select distinct case when x = fid then tgt else x end from unnest(fields) x) where fid = any(fields);
      update public.noema_vault_fields set parents = array(select distinct case when x = fid then tgt else x end from unnest(parents) x) where fid = any(parents) and id <> tgt;
      update public.noema_vault_fields set parents = array_remove(parents, fid) where id = tgt;
      update public.noema_vault_fields set status = 'merged', merged_into = tgt,
        aliases = (select array(select distinct a from unnest(public.noema_vault_fields.aliases || array(select value from jsonb_each_text(names))) a limit 40)) where id = fid;
      update public.noema_vault_fields t set aliases = (select array(select distinct a from unnest(t.aliases || array(select value from jsonb_each_text(m.names))) a limit 40))
        from public.noema_vault_fields m where t.id = tgt and m.id = fid;
    elsif it->>'status' in ('accepted', 'rejected') then
      if it->>'status' = 'accepted' and not ((select names from public.noema_vault_fields where id = fid) ? 'en') then raise exception '% needs an English name to be accepted', fid; end if;
      if it->>'status' = 'rejected' and exists (select 1 from public.noema_vault_files v where fid = any(v.fields)) then raise exception '% is used by files: merge it instead', fid; end if;
      update public.noema_vault_fields set status = it->>'status' where id = fid;
    end if;
    update public.noema_vault_fields set updated_at = now() where id = fid;
    done := done || to_jsonb(fid);
  end loop;
  return jsonb_build_object('saved', done);
end $$;
revoke execute on function public.noema_vault_fields_queue(text[], int) from anon;
revoke execute on function public.noema_vault_fields_save(jsonb) from anon;
revoke execute on function public.noema_vault_field_propose(text, text, text[]) from anon;
revoke execute on function public.noema_vault_field_suggest(text, text) from anon;

-- 15) ⚑ PROBLEM REPORTS (docs/REPORTS.md): the ⚑ button at the foot of the side bar (Me ▾ › Report a problem on phones)
--     sends a screenshot and the exact place — route, subject, pack version, chapter, section, block, exercise, field,
--     the UI and content languages, the element pointed at, the app's build — so a fix can be made, by a person or by
--     Claude (connector: noema_reports, noema_report, noema_report_update). The reporter sees their own reports; the
--     app's admins (noema_admins, §13b) see and answer all of them on #/admin/reports. The screenshot is a data:image URL
--     in the row (≤ 3 MB of text; a JPEG of the screen is ~150–400 KB); at most 40 reports a person a day.
create table if not exists public.noema_error_reports (
  id             uuid primary key default gen_random_uuid(),
  reporter       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reporter_name  text,
  reporter_email text,
  kind           text not null default 'other' check (kind in ('content', 'translation', 'display', 'broken', 'idea', 'other')),
  note           text check (char_length(note) <= 4000),
  route          text check (char_length(route) <= 600),
  subject        text check (char_length(subject) <= 120),
  item           text check (char_length(item) <= 300),         -- the most specific id: ex:<id> · card:<key> · blk:<section>/<block> · sec:<id> · drill:<id> · ui:<i18n key> …
  locator        jsonb not null default '{}'::jsonb,
  shot           text check (shot is null or (shot ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and char_length(shot) <= 3000000)),
  app_version    text check (char_length(app_version) <= 80),
  status         text not null default 'new' check (status in ('new', 'seen', 'fixing', 'fixed', 'wontfix', 'duplicate')),
  admin_note     text check (char_length(admin_note) <= 4000),
  fixed_in       text check (char_length(fixed_in) <= 300),       -- a commit, a pull request, a pack version
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.noema_error_reports drop constraint if exists noema_error_reports_locator_size;
alter table public.noema_error_reports add constraint noema_error_reports_locator_size check (jsonb_typeof(locator) = 'object' and pg_column_size(locator) <= 200000);
create index if not exists noema_error_reports_new on public.noema_error_reports (status, created_at desc);
create index if not exists noema_error_reports_by on public.noema_error_reports (reporter, created_at desc);
alter table public.noema_error_reports enable row level security;
-- what the reporter writes is theirs; who they are, the status and the answer are the server's and the admins'
create or replace function public.noema_error_report_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.reporter := auth.uid(); new.status := 'new'; new.admin_note := null; new.fixed_in := null; new.created_at := now(); new.updated_at := now();
    new.reporter_name := public.noema_vault_name(new.reporter);
    new.reporter_email := (select email from auth.users where id = new.reporter);
    if (select count(*) from public.noema_error_reports where reporter = new.reporter and created_at > now() - interval '1 day') >= 40 then
      raise exception 'report limit: 40 a day' using errcode = 'P0001'; end if;
  else
    if not public.noema_is_admin() then raise exception 'admins only' using errcode = 'P0001'; end if;
    new.id := old.id; new.reporter := old.reporter; new.reporter_name := old.reporter_name; new.reporter_email := old.reporter_email; new.kind := old.kind;
    new.note := old.note; new.route := old.route; new.subject := old.subject; new.item := old.item; new.locator := old.locator; new.shot := old.shot;
    new.app_version := old.app_version; new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists noema_error_report_guard on public.noema_error_reports;
create trigger noema_error_report_guard before insert or update on public.noema_error_reports for each row execute function public.noema_error_report_guard();
drop policy if exists "error reports: send"           on public.noema_error_reports;
drop policy if exists "error reports: mine or admins" on public.noema_error_reports;
drop policy if exists "error reports: admins answer"  on public.noema_error_reports;
drop policy if exists "error reports: admins delete"  on public.noema_error_reports;
create policy "error reports: send"           on public.noema_error_reports for insert to authenticated with check (reporter = (select auth.uid()));
create policy "error reports: mine or admins" on public.noema_error_reports for select to authenticated using (reporter = (select auth.uid()) or public.noema_is_admin());
create policy "error reports: admins answer"  on public.noema_error_reports for update to authenticated using (public.noema_is_admin()) with check (public.noema_is_admin());
create policy "error reports: admins delete"  on public.noema_error_reports for delete to authenticated using (public.noema_is_admin());

-- 14) Check: should list the 26 noema_ tables with rls_enabled = true
select tablename, rowsecurity as rls_enabled from pg_tables where schemaname = 'public' and tablename like 'noema_%' order by 1;
