-- =====================================================================================
-- noema-lite — Supabase schema. Run ONCE in: Supabase dashboard → SQL Editor → New query → Run.
-- Multi-tenant by design: every row / file belongs to exactly one user (auth.uid()) and
-- row-level security makes other users' data invisible and unwritable.
-- Safe to re-run (idempotent).
-- =====================================================================================

-- Profiles (display name, emoji, "about me" for the tutor)
create table if not exists public.lq_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  emoji        text,
  learner      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Key/value mirror of the app's per-account storage: progress per subject, conversations, settings, stats…
create table if not exists public.lq_kv (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null check (char_length(key) <= 300),
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Restore points of a whole account (manual + daily automatic)
create table if not exists public.lq_snapshots (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label      text,
  data       jsonb not null,
  size_bytes integer,
  created_at timestamptz not null default now()
);
create index if not exists lq_snapshots_user_created on public.lq_snapshots (user_id, created_at desc);

-- Row-level security: each user sees and changes only their own rows
alter table public.lq_profiles  enable row level security;
alter table public.lq_kv        enable row level security;
alter table public.lq_snapshots enable row level security;

drop policy if exists "own profile"   on public.lq_profiles;
drop policy if exists "own kv"        on public.lq_kv;
drop policy if exists "own snapshots" on public.lq_snapshots;
create policy "own profile"   on public.lq_profiles  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own kv"        on public.lq_kv        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own snapshots" on public.lq_snapshots for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Private file storage: <user-id>/packs/<subject>.json (imported subject packs), <user-id>/db/… (database backups)
insert into storage.buckets (id, name, public, file_size_limit)
values ('lq-private', 'lq-private', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "lq own files read"   on storage.objects;
drop policy if exists "lq own files insert" on storage.objects;
drop policy if exists "lq own files update" on storage.objects;
drop policy if exists "lq own files delete" on storage.objects;
create policy "lq own files read"   on storage.objects for select to authenticated using      (bucket_id = 'lq-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "lq own files insert" on storage.objects for insert to authenticated with check (bucket_id = 'lq-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "lq own files update" on storage.objects for update to authenticated using      (bucket_id = 'lq-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "lq own files delete" on storage.objects for delete to authenticated using      (bucket_id = 'lq-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================================
-- v2: conversations with the AI tutor and every other AI interaction, one canonical record per row
-- (schema lq.conversation/v1 — see docs/CONVERSATIONS.md). Deletions are tombstones (deleted = true).
-- =====================================================================================
create table if not exists public.lq_conversations (
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
  record        jsonb not null,                -- the full canonical record (messages included)
  primary key (user_id, id)
);
create index if not exists lq_conversations_user_updated on public.lq_conversations (user_id, updated_at);
alter table public.lq_conversations enable row level security;
drop policy if exists "own conversations" on public.lq_conversations;
create policy "own conversations" on public.lq_conversations for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
