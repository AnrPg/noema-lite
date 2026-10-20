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
create or replace function public.noema_cur_access(cid text) returns text language sql stable security definer set search_path = public as $$
  select case
    when s.owner = auth.uid() then 'owner'
    when exists (select 1 from public.noema_curriculum_members m where m.curriculum = s.id and m.user_id = auth.uid() and m.status = 'joined') then 'member'
    when exists (select 1 from public.noema_curriculum_members m where m.curriculum = s.id and m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and m.status = 'pending') then 'invited'
    when s.public then 'public'
  end
  from public.noema_curricula_shared s where s.id = cid
$$;
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
              and exists (select 1 from public.noema_curricula_shared s where s.id = curriculum and s.public));
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

-- 12) 🗄️ THE VAULT (docs/VAULT.md): files students share — notes, slides, past exams (with or without solutions),
--     exercise sets, lab work, summaries, books, recordings. Strictly organised: every file carries its university,
--     department, course, year, semester, type, subject (a key of the app's shared list) and language — required — so
--     the folders (university › department › course › year › type) and every filter work across all of them.
--     ANONYMOUS: the uploader is kept here for deleting and take-downs, but nobody else can read it: the table shows
--     each person only their own rows; everybody reads the view noema_vault, which has no uploader column (only the
--     name of those who chose to show it, taken from their profile). Free plan: files ≤ 20 MB, ≤ 50 MB per person.
--     A file is 'pending' until noema_vault_finish() has seen it in storage with its size; three reports hide it.
create table if not exists public.noema_vault_files (
  id            uuid primary key default gen_random_uuid(),
  uploader      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  show_name     boolean not null default false,
  uploader_name text,
  status        text not null default 'pending' check (status in ('pending', 'ok', 'hidden')),
  title         text not null check (char_length(title) between 1 and 160),
  description   text check (char_length(description) <= 1000),
  university    text not null check (char_length(university) between 2 and 120),
  department    text not null check (char_length(department) between 2 and 120),
  course        text not null check (char_length(course) between 2 and 160),
  professor     text check (char_length(professor) <= 120),
  year          int  not null check (year between 1950 and 2100),
  semester      int  not null check (semester between 1 and 12),
  kind          text not null check (kind in ('notes', 'slides', 'exam', 'exam_solved', 'exercises', 'lab', 'summary', 'book', 'recording', 'other')),
  subject       text not null check (subject ~ '^[a-z][a-z_]{1,40}$'),
  language      text not null check (language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
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
  created_at    timestamptz not null default now()
);
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

-- what an uploader may set: the description of the file. Counters, status, size and path are the server's.
create or replace function public.noema_vault_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare used_bytes bigint; nm text;
begin
  if current_setting('noema.vault', true) = 'server' then return new; end if;
  if tg_op = 'INSERT' then new.uploader := auth.uid(); end if;
  new.university := regexp_replace(btrim(new.university), '\s+', ' ', 'g'); new.department := regexp_replace(btrim(new.department), '\s+', ' ', 'g');
  new.course := regexp_replace(btrim(new.course), '\s+', ' ', 'g'); new.professor := nullif(regexp_replace(btrim(coalesce(new.professor, '')), '\s+', ' ', 'g'), '');
  select display_name into nm from public.noema_profiles where user_id = new.uploader;
  new.uploader_name := case when new.show_name then coalesce(nullif(btrim(nm), ''), new.uploader_name) else null end;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.rating_sum := 0; new.rating_n := 0; new.downloads := 0; new.used := 0; new.reports := 0; new.created_at := now();
    select coalesce(sum(size), 0) into used_bytes from public.noema_vault_files where uploader = new.uploader;
    if used_bytes + new.size > 52428800 then raise exception 'vault quota: % of 52428800 bytes used', used_bytes using errcode = 'P0001'; end if;
  else
    new.id := old.id; new.uploader := old.uploader; new.status := old.status; new.path := old.path; new.size := old.size; new.mime := old.mime; new.file_name := old.file_name;
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
         file_name, mime, size, pages, path, rating_sum, rating_n, downloads, used, created_at
  from public.noema_vault_files where status = 'ok' or uploader = auth.uid();
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
  insert into public.noema_vault_hits (file_id, user_id, what) select fid, auth.uid(), what where exists (select 1 from public.noema_vault_files where id = fid and status = 'ok') on conflict do nothing;
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
  select exists (select 1 from public.noema_vault_files where path = obj and (status = 'ok' or uploader = auth.uid())) $$;
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

-- 13) Check: should list the 14 noema_ tables with rls_enabled = true
select tablename, rowsecurity as rls_enabled from pg_tables where schemaname = 'public' and tablename like 'noema_%' order by 1;
