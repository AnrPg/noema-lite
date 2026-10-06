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

-- 10) Check: should list the 6 noema_ tables with rls_enabled = true
select tablename, rowsecurity as rls_enabled from pg_tables where schemaname = 'public' and tablename like 'noema_%' order by 1;
