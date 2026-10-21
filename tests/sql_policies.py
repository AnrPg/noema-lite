#!/usr/bin/env python3
"""Runs cloud/supabase.sql on a throw-away PostgreSQL with Supabase-like stubs (roles anon/authenticated,
auth.uid(), auth.jwt(), storage.objects) and checks every row-level-security rule as different users.
Needs a local PostgreSQL (server binaries). Usage: python3 tests/sql_policies.py"""
import os, sys, subprocess, tempfile, shutil, glob, uuid, json, time
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BIN = sorted(glob.glob('/usr/lib/postgresql/*/bin'))[-1] if glob.glob('/usr/lib/postgresql/*/bin') else os.path.dirname(shutil.which('pg_ctl') or '')
if not BIN or not os.path.exists(os.path.join(BIN, 'initdb')): print('SKIPPED: no PostgreSQL server binaries'); sys.exit(0)
as_pg = ['runuser', '-u', 'postgres', '--'] if os.geteuid() == 0 else []
data = tempfile.mkdtemp(prefix='noema-pg-'); shutil.chown(data, 'postgres') if as_pg else None
PORT = '54399'
subprocess.run(as_pg + [f'{BIN}/initdb', '-D', data, '-A', 'trust', '-U', 'postgres'], check=True, capture_output=True)
subprocess.run(as_pg + [f'{BIN}/pg_ctl', '-D', data, '-o', f'-p {PORT} -k /tmp -c listen_addresses=', '-l', os.path.join(data, 'log'), 'start', '-w'], check=True, capture_output=True)
fails = 0
def ok(c, m):
    global fails; print(('  ✅ ' if c else '  ❌ ') + m); fails += not c
def psql(sql, user=None, email=None, role='authenticated', expect_error=False):
    pre = ''
    if user or role == 'anon':
        claims = json.dumps({'sub': user, 'email': email, 'role': role}) if user else json.dumps({'role': 'anon'})
        pre = f"select set_config('request.jwt.claim.sub', '{user or ''}', false) \\g /dev/null\nselect set_config('request.jwt.claims', '{claims}', false) \\g /dev/null\nset role {role};\n"
    r = subprocess.run(['psql', '-h', '/tmp', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-q'], input=pre + sql, capture_output=True, text=True)
    if expect_error: return r.returncode != 0
    if r.returncode != 0: raise RuntimeError(r.stderr.strip())
    return [l for l in r.stdout.strip().splitlines() if l != '']
try:
    psql(r"""
create extension if not exists pgcrypto;
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid(), metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on all functions in schema auth, storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
""")
    sql = open(os.path.join(ROOT, 'cloud', 'supabase.sql'), encoding='utf-8').read()
    psql(sql); psql(sql)
    ok(True, 'cloud/supabase.sql runs, and runs again (idempotent)')
    tables = psql("select tablename from pg_tables where schemaname='public' and tablename like 'noema_%' and rowsecurity order by 1")
    ok(tables == ['noema_blocks', 'noema_buddies', 'noema_chat_files', 'noema_conversations', 'noema_curricula_shared', 'noema_curriculum_members', 'noema_curriculum_steps', 'noema_kv',
                  'noema_message_reports', 'noema_messages', 'noema_people', 'noema_profiles', 'noema_public_packs', 'noema_public_profiles', 'noema_room_members', 'noema_room_roadmaps',
                  'noema_rooms', 'noema_shares', 'noema_snapshots', 'noema_vault_files', 'noema_vault_hits', 'noema_vault_ratings', 'noema_vault_reports'], 'the 23 noema_ tables, all with row-level security: ' + ', '.join(tables))
    A, B, C = (str(uuid.uuid4()) for _ in range(3)); EA, EB, EC = 'anna@example.com', 'bob@example.com', 'carl@example.com'
    psql(f"insert into auth.users values ('{A}','{EA}'),('{B}','{EB}'),('{C}','{EC}')")
    # own data
    psql(f"insert into noema_kv (user_id, key, value) values ('{A}', 's:x:state', '{{}}')", A, EA)
    ok(psql("select count(*) from noema_kv", B, EB) == ['0'] and psql("select count(*) from noema_kv", A, EA) == ['1'], 'key/value rows: only the owner sees them')
    ok(psql(f"insert into noema_kv (user_id, key, value) values ('{A}', 'k', 'v')", B, EB, expect_error=True), 'nobody can write rows for another user')
    # conversations: synced_at set by the server
    psql(f"insert into noema_conversations (user_id, id, kind, created_at, updated_at, record) values ('{A}', 'cv_1', 'tutor', '2020-01-01', '2020-01-01', '{{}}')", A, EA)
    sa = psql("select synced_at > now() - interval '1 minute' from noema_conversations where id='cv_1'", A, EA)
    ok(sa == ['t'], 'conversations get a server-side synced_at (a late push from an offline device is never missed)')
    # public packs
    psql(f"insert into noema_public_packs (subject_id, title, owner_name, meta) values ('heart-anatomy', 'Heart anatomy', 'Anna', '{{\"counts\":{{\"chapters\":3}}}}')", A, EA)
    ok(psql("select title from noema_public_packs", role='anon') == ['Heart anatomy'], 'public packs are listed for everybody, even signed-out visitors')
    ok(psql("update noema_public_packs set title='hacked' where subject_id='heart-anatomy' returning 1", B, EB) == [] and psql("select title from noema_public_packs", A, EA) == ['Heart anatomy'], 'only the owner can change a public pack')
    ok(psql(f"insert into noema_public_packs (owner, subject_id, title) values ('{A}', 'fake', 'x')", B, EB, expect_error=True), 'nobody can publish in someone else’s name')
    # the page others see (§11): private until published, written only by its owner, a picture only as data:image/…
    psql("insert into noema_public_profiles (display_name, bio, show, card) values ('Anna', 'Hearts.', '{\"progress\":true}', '{\"progress\":{\"level\":2}}')", A, EA)
    ok(psql("select bio from noema_public_profiles", A, EA) == ['Hearts.'] and psql("select bio from noema_public_profiles", B, EB) == [] and psql("select bio from noema_public_profiles", role='anon') == [], 'a page is private until published: only its owner reads it')
    psql("update noema_public_profiles set published = true", A, EA)
    ok(psql("select display_name from noema_public_profiles", role='anon') == ['Anna'] and psql("select card->'progress'->>'level' from noema_public_profiles", B, EB) == ['2'], 'published: everybody reads it, signed-out visitors too')
    ok(psql("update noema_public_profiles set bio='hacked' returning 1", B, EB) == [] and psql(f"insert into noema_public_profiles (owner, bio) values ('{A}', 'x')", B, EB, expect_error=True), 'nobody else can change it or write one in its owner’s name')
    ok(psql("update noema_public_profiles set avatar = 'data:text/html;base64,PHNjcmlwdD4='", A, EA, expect_error=True) and not psql("update noema_public_profiles set avatar = 'data:image/jpeg;base64,/9j/4AAQ' returning 1", A, EA) == [], 'the picture is only ever an image (data:image/jpeg|png|webp)')
    ok(psql(f"insert into storage.objects (bucket_id, name) values ('noema-public', '{A}/heart-anatomy.json') returning 1", A, EA) == ['1'], 'owner uploads the public pack file into their folder')
    ok(psql(f"insert into storage.objects (bucket_id, name) values ('noema-public', '{A}/evil.json')", B, EB, expect_error=True), 'others cannot upload into that folder')
    # shares
    sid = psql(f"insert into noema_shares (to_email, subject_id, title, from_name) values ('{EB}', 'heart-anatomy', 'Heart anatomy', 'Anna') returning id", A, EA)[0]
    ok(psql("select count(*) from noema_shares", B, EB) == ['1'] and psql("select count(*) from noema_shares", C, EC) == ['0'], 'a share is visible to sender and recipient only')
    ok(psql(f"insert into noema_shares (from_user, to_email, subject_id, title) values ('{A}', '{EC}', 'x', 'x')", B, EB, expect_error=True), 'nobody can send a share in someone else’s name')
    ok(psql(f"insert into noema_shares (to_email, subject_id, title, status) values ('{EC}', 'x', 'x', 'accepted')", A, EA, expect_error=True), 'a new share always starts as pending')
    ok(psql(f"insert into noema_shares (to_email, subject_id, title) values ('Bob@Example.com', 'x', 'x')", A, EA, expect_error=True), 'recipient e-mails are stored in lower case')
    ok(psql(f"insert into storage.objects (bucket_id, name) values ('noema-shared', '{sid}.json') returning 1", A, EA) == ['1'], 'sender uploads the shared pack file')
    ok(psql(f"insert into storage.objects (bucket_id, name) values ('noema-shared', '{sid}.json')", C, EC, expect_error=True), 'a third person cannot upload to a share')
    ok(psql(f"select count(*) from storage.objects where bucket_id='noema-shared'", B, EB) == ['1'] and psql(f"select count(*) from storage.objects where bucket_id='noema-shared'", C, EC) == ['0'], 'only sender and recipient can download the shared file')
    ok(psql(f"update noema_shares set status='accepted', responded_at=now() where id='{sid}' returning status", C, EC) == [], 'a third person cannot accept')
    ok(psql(f"update noema_shares set status='pending' where id='{sid}'", B, EB, expect_error=True), 'the recipient can only answer accepted / rejected')
    ok(psql(f"update noema_shares set status='accepted', responded_at=now() where id='{sid}' returning status", B, EB) == ['accepted'], 'the recipient accepts')
    ok(psql(f"update noema_shares set status='revoked' where id='{sid}' returning status", A, EA) == ['revoked'], 'the sender can revoke')
    ok(psql(f"select count(*) from storage.objects where bucket_id='noema-private'", B, EB) == ['0'], 'private storage stays private')

    # shared curricula (docs/CURRICULUM.md §8): own progress, common steps, a prepared step is never overwritten by others
    print('— shared curricula')
    D = str(uuid.uuid4()); ED = 'dora@example.com'; psql(f"insert into auth.users values ('{D}','{ED}')")
    rec = json.dumps({'nodes': {'n1': {'title': 'One'}, 'n2': {'title': 'Two'}, 'n3': {'title': 'Three'}, 'n4': {'title': 'Four'}}})
    psql(f"insert into noema_curricula_shared (id, title, owner_name, record) values ('cabc12', 'Cells', 'Anna', '{rec}')", A, EA)
    ok(psql(f"insert into noema_curricula_shared (id, owner, title, record) values ('cfake1', '{A}', 'x', '{{}}')", B, EB, expect_error=True), 'nobody shares a curriculum in someone else’s name')
    ok(psql("select count(*) from noema_curricula_shared", role='anon') == ['0'] and psql("select count(*) from noema_curricula_shared", C, EC) == ['0'], 'a curriculum shared with people is invisible to others (and signed-out visitors)')
    psql(f"insert into noema_curriculum_members (curriculum, email, name) values ('cabc12', '{EB}', 'Bob')", A, EA)
    ok(psql(f"insert into noema_curriculum_members (curriculum, email) values ('cabc12', '{EC}')", B, EB, expect_error=True), 'only the owner invites')
    ok(psql(f"insert into noema_curriculum_members (curriculum, email, user_id, status) values ('cabc12', '{EC}', '{C}', 'joined')", C, EC, expect_error=True), 'nobody joins a curriculum that is not public without an invitation')
    ok(psql("select title from noema_curricula_shared", B, EB) == ['Cells'], 'the invited person sees the curriculum (to decide)')
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author) values ('cabc12', 'n1', 'preparing', '{B}')", B, EB, expect_error=True), 'an invitation alone does not let you prepare steps')
    ok(psql(f"update noema_curriculum_members set status='joined', user_id='{B}', responded_at=now() where curriculum='cabc12' and email='{EB}' returning status", B, EB) == ['joined'], 'the invited person joins')
    ok(psql(f"update noema_curriculum_members set status='joined', user_id='{C}' where curriculum='cabc12' and email='{EB}' returning 1", C, EC) == [], 'nobody answers someone else’s invitation')
    # steps: first come, first served
    psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author, author_name, claimed_until) values ('cabc12', 'n1', 'preparing', '{B}', 'Bob', now() + interval '4 hours')", B, EB)
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author) values ('cabc12', 'n1', 'preparing', '{A}')", A, EA, expect_error=True), 'a step being prepared by a member cannot be claimed again — not even by the owner')
    ok(psql(f"update noema_curriculum_steps set author='{A}', status='ready' where curriculum='cabc12' and node_id='n1' returning 1", A, EA) == [], '…nor taken over while the reservation runs')
    ok(psql(f"update noema_curriculum_steps set status='ready', path='cabc12/steps/{B}/n1.json', version='v1' where curriculum='cabc12' and node_id='n1' returning status", B, EB) == ['ready'], 'its author marks it prepared')
    ok(psql(f"update noema_curriculum_steps set path='cabc12/steps/{A}/n1.json', author='{A}' where node_id='n1' returning 1", A, EA) == [], 'the owner cannot overwrite a member’s prepared step')
    psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author, author_name) values ('cabc12', 'n2', 'ready', '{A}', 'Anna')", A, EA)
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author) values ('cabc12', 'n2', 'ready', '{B}')", B, EB, expect_error=True) and psql(f"update noema_curriculum_steps set version='evil', author='{B}' where node_id='n2' returning 1", B, EB) == [], 'a member cannot overwrite the owner’s prepared step (no new row, no update)')
    ok(psql("delete from noema_curriculum_steps where node_id='n2' returning 1", B, EB) == [] and psql("select author_name from noema_curriculum_steps where node_id='n2'", A, EA) == ['Anna'], '…nor delete it')
    ok(psql(f"update noema_curriculum_steps set version='v2' where node_id='n2' returning version", A, EA) == ['v2'], 'the author replaces their own step')
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author) values ('cabc12', 'zz', 'ready', '{B}')", B, EB, expect_error=True), 'only steps that exist in the map')
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author) values ('cabc12', 'n3', 'ready', '{A}')", B, EB, expect_error=True), 'nobody prepares a step in someone else’s name')
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author) values ('cabc12', 'n3', 'ready', '{C}')", C, EC, expect_error=True), 'an outsider prepares nothing')
    ok(psql("select count(*) from noema_curriculum_steps", C, EC) == ['0'] and psql("select count(*) from noema_curriculum_steps", B, EB) == ['2'], 'steps are visible to the participants only')
    # an expired reservation can be taken over (a run that died)
    psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author, claimed_until) values ('cabc12', 'n3', 'preparing', '{B}', now() - interval '1 minute')", B, EB)
    ok(psql(f"update noema_curriculum_steps set author='{A}', author_name='Anna', claimed_until=now() + interval '4 hours' where node_id='n3' and status='preparing' returning author_name", A, EA) == ['Anna'], 'an expired reservation is taken over by another participant')
    ok(psql(f"update noema_curriculum_steps set node_id='n4' where node_id='n3' returning 1", A, EA, expect_error=True), 'a row never moves to another step')
    # files
    ok(psql(f"insert into storage.objects (bucket_id, name) values ('noema-curricula', 'cabc12/steps/{B}/n1.json') returning 1", B, EB) == ['1'], 'a member uploads their step into their own folder')
    ok(psql(f"insert into storage.objects (bucket_id, name) values ('noema-curricula', 'cabc12/steps/{B}/n2.json')", A, EA, expect_error=True) and psql(f"update storage.objects set name=name where name='cabc12/steps/{B}/n1.json' returning 1", A, EA) == [], 'nobody — not the owner — writes into a member’s step files')
    ok(psql(f"insert into storage.objects (bucket_id, name) values ('noema-curricula', 'cabc12/files/book.pdf')", B, EB, expect_error=True) and psql(f"insert into storage.objects (bucket_id, name) values ('noema-curricula', 'cabc12/files/book.pdf') returning 1", A, EA) == ['1'], 'the curriculum’s material is written by the owner only')
    ok(psql("select count(*) from storage.objects where bucket_id='noema-curricula'", B, EB) == ['2'] and psql("select count(*) from storage.objects where bucket_id='noema-curricula'", C, EC) == ['0'], 'the files are readable by the participants only')
    # public
    psql("update noema_curricula_shared set public=true where id='cabc12'", A, EA)
    ok(psql("select title from noema_curricula_shared", role='anon') == ['Cells'] and psql("select count(*) from noema_curriculum_steps", D, ED) == ['3'], 'public: listed for everybody, its steps visible')
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author) values ('cabc12', 'n4', 'preparing', '{D}')", D, ED, expect_error=True), 'looking is not joining: no preparing before joining')
    ok(psql(f"insert into noema_curriculum_members (curriculum, email, user_id, status, name) values ('cabc12', '{ED}', '{D}', 'joined', 'Dora') returning status", D, ED) == ['joined'], 'anyone joins a public curriculum')
    ok(psql(f"insert into noema_curriculum_members (curriculum, email, user_id, status) values ('cabc12', '{EC}', '{D}', 'joined')", D, ED, expect_error=True), '…only as themselves')
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author, claimed_until) values ('cabc12', 'n4', 'preparing', '{D}', now() + interval '4 hours') returning 1", D, ED) == ['1'], 'a member who joined prepares an empty step')
    ok(psql("select count(*) from noema_curriculum_members", D, ED) == ['1'] and psql("select count(*) from noema_curriculum_members", A, EA) == ['2'], 'members see their own membership; the owner sees all')
    # revoke / leave
    ok(psql(f"update noema_curriculum_members set status='revoked' where email='{EB}' returning status", A, EA) == ['revoked'], 'the owner removes a member')
    ok(psql(f"update noema_curriculum_members set status='joined' where email='{EB}' returning 1", B, EB) == [], 'a removed member cannot join again by themselves')
    ok(psql(f"insert into noema_curriculum_steps (curriculum, node_id, status, author) values ('cabc12', 'n9', 'ready', '{B}')", B, EB, expect_error=True), '…and prepares nothing any more')
    ok(psql("update noema_curriculum_members set status='left' returning status", D, ED) == ['left'] and psql(f"update noema_curriculum_steps set status='ready' where node_id='n4' returning 1", D, ED) == [], 'a member who left changes nothing any more')
    ok(psql("delete from noema_curriculum_steps where node_id='n1' returning 1", A, EA) == ['1'], 'the owner may remove a step (it can then be prepared again)')
    psql("delete from noema_curricula_shared where id='cabc12'", A, EA)
    ok(psql("select count(*) from noema_curriculum_steps", A, EA) == ['0'] and psql("select count(*) from noema_curriculum_members", A, EA) == ['0'], 'stopping the sharing removes its members and steps')

    # 👥 people, study buddies, conversations, study groups (§12, docs/SOCIAL.md)
    print('— people, buddies, conversations, study groups')
    P = {k: str(uuid.uuid4()) for k in 'abcde'}; PE = {k: f'{k}@social.example' for k in 'abcde'}
    psql('insert into auth.users values ' + ','.join(f"('{P[k]}','{PE[k]}')" for k in 'abcde'))
    q = lambda k, sql, **o: psql(sql, P[k], PE[k], **o)
    q('a', "insert into noema_people (display_name, search) values ('  Anna   K ', 'anna k')"); q('b', "insert into noema_people (display_name, search, dm_from) values ('Βασίλης', 'βασιλης vasilis basiles', 'everyone')")
    q('c', "insert into noema_people (display_name, findable) values ('Hidden Chris', false)"); q('d', "insert into noema_people (display_name) values ('Dora')"); q('e', "insert into noema_people (display_name) values ('Eve')")
    ok(q('a', f"insert into noema_people (user_id, display_name) values ('{P['b']}', 'fake')", expect_error=True), 'nobody writes someone else’s row')
    ok(q('a', "select display_name from noema_people order by 1") == ['Anna K', 'Dora', 'Eve', 'Βασίλης'] and q('a', "select display_name from noema_people where search ilike '%vasil%'") == ['Βασίλης'], 'findable people only (the name tidied), found in Latin letters')
    ok(q('a', f"select noema_buddy_ask('{P['c']}')", expect_error=True) and q('a', f"select noema_buddy_ask('{P['d']}')") == ['asked'] and q('a', f"select noema_buddy_ask('{P['d']}')") == ['asked'], 'one cannot ask someone hidden and unknown; a request is made once')
    ok(q('a', f"insert into noema_buddies values ('{min(P['a'], P['e'])}', '{max(P['a'], P['e'])}', '{P['a']}', 'buddies')", expect_error=True), 'nobody makes a friendship by hand')
    ok(q('d', f"select noema_buddy_answer('{P['a']}', true)") == ['buddies'], 'the other person accepts')
    ok(q('a', f"select noema_dm_open('{P['b']}') is not null") == ['t'] and q('a', f"select noema_dm_open('{P['e']}')", expect_error=True) and q('a', f"select noema_dm_open('{P['d']}') is not null") == ['t'], 'a conversation: with someone who takes messages from everyone, or a buddy; not with a stranger whose setting is buddies')
    q('a', "insert into noema_messages (room, body) select id, 'hi Vasilis' from noema_rooms where kind = 'dm' and dm_key like '%" + P['b'] + "%'")
    ok(q('a', f"insert into noema_messages (room, body, author) select id, 'hi Dora', '{P['d']}' from noema_rooms where dm_key like '%{P['d']}%' returning author") == [P['a']] and q('a', "insert into noema_messages (room, body) select id, '' from noema_rooms limit 1", expect_error=True), 'a message is always its sender’s (the author is the server’s); no empty message')
    ok(q('d', "select kind, unread, last_body from noema_inbox()") == ['dm|1|hi Dora'] and q('d', f"select display_name from noema_people where user_id = '{P['a']}'") == ['Anna K'], 'the inbox: one unread; a buddy reads the name')
    q('b', "insert into noema_messages (room, body) select id, 'hello Anna' from noema_rooms where kind = 'dm'")
    ok(q('b', "select count(*) from noema_messages") == ['2'], 'one may answer someone who wrote first (Anna takes messages only from buddies)')
    ok(q('e', "select count(*) from noema_messages") == ['0'], 'others read nothing')
    q('d', f"insert into noema_blocks (blocked) values ('{P['a']}')")
    ok(q('d', "select count(*) from noema_buddies") == ['0'] and q('a', f"insert into noema_messages (room, body) select id, 'still?' from noema_rooms where dm_key like '%{P['d']}%'", expect_error=True)
       and q('a', f"select noema_buddy_ask('{P['d']}')", expect_error=True) and q('a', f"select count(*) from noema_people where user_id = '{P['d']}'") == ['0'], 'a block ends the friendship, the messages, the requests and the search')
    g = q('a', "select noema_group_create('Genetics 2025', 'a study group', 'Univ of Crete', 'Genetics')")[0]
    ok(q('a', f"select noema_room_invite('{g}', '{P['b']}')") == ['invited'] and q('a', f"select noema_room_invite('{g}', '{P['c']}')", expect_error=True), 'invitations follow the other person’s setting')
    ok(q('a', f"insert into noema_room_members (room, user_id, status) values ('{g}', '{P['c']}', 'joined')", expect_error=True), 'nobody is added by hand')
    q('a', f"update noema_rooms set join_code = 'abcdefghijkl12', kind = 'dm' where id = '{g}'")
    ok(q('a', f"select kind, join_code from noema_rooms where id = '{g}'") == ['group|abcdefghijkl12'], 'the owner makes an invitation link; the kind of a room stays')
    ok(q('b', "select status, name from noema_inbox() where kind = 'group'") == ['invited|Genetics 2025'] and q('b', f"select count(*) from noema_messages where room = '{g}'") == ['0'], 'the invited person sees the invitation, not the messages')
    q('b', f"update noema_room_members set status = 'joined' where user_id = '{P['b']}' and room = '{g}'")
    ok(q('b', f"update noema_room_members set role = 'owner' where user_id = '{P['b']}' and room = '{g}'", expect_error=True) and q('b', f"select status, role from noema_room_members where user_id = '{P['b']}' and room = '{g}'") == ['joined|member'], 'they join, and cannot make themselves owner')
    ok(q('c', "select name, members, mine is null from noema_room_peek('abcdefghijkl12')") == ['Genetics 2025|2|t'] and q('c', "select noema_room_join('abcdefghijkl12') is not null") == ['t'] and q('c', "select noema_room_peek('nope00000000')") == [], 'the link shows the group, then joins it; a wrong code shows nothing')
    ok(q('c', f"update noema_room_members set status = 'left' where user_id = '{P['b']}' and room = '{g}'", expect_error=True) or q('b', f"select status from noema_room_members where user_id = '{P['b']}' and room = '{g}'") == ['joined'], 'a member cannot remove another')
    q('c', f"insert into noema_chat_files (path, room, name, mime, size) values ('rooms/{g}/22222222-2222-2222-2222-222222222222.pdf', '{g}', 'notes.pdf', 'application/pdf', 100)")
    ok(q('c', f"insert into noema_chat_files (path, room, name, mime, size) values ('rooms/{g}/33333333-2222-2222-2222-222222222222.exe', '{g}', 'x.exe', 'application/pdf', 100)", expect_error=True), 'a program is refused by the path check')
    ok(q('c', f"insert into noema_messages (room, body, att) values ('{g}', 'my notes', jsonb_build_object('kind', 'file', 'path', 'rooms/{g}/22222222-2222-2222-2222-222222222222.pdf'))", expect_error=True), 'a file that is not finished cannot be sent')
    q('c', f"insert into storage.objects (bucket_id, name, metadata) values ('noema-chat', 'rooms/{g}/22222222-2222-2222-2222-222222222222.pdf', '{{\"size\":100}}')")
    ok(q('c', f"select noema_chat_finish('rooms/{g}/22222222-2222-2222-2222-222222222222.pdf')") == ['ok'], 'finished once storage has it with its size')
    q('c', f"insert into noema_messages (room, body, att) values ('{g}', 'my notes', jsonb_build_object('kind', 'file', 'path', 'rooms/{g}/22222222-2222-2222-2222-222222222222.pdf', 'name', 'notes.pdf'))")
    ok(q('b', "select att->>'name' from noema_messages where att is not null") == ['notes.pdf'] and q('b', "select count(*) from storage.objects where bucket_id = 'noema-chat'") == ['1']
       and q('d', "select count(*) from storage.objects where bucket_id = 'noema-chat'") == ['0'], 'members read the file; others do not')
    q('e', "select noema_room_join('abcdefghijkl12')")
    for k in 'eab': q(k, "insert into noema_message_reports (message, reason) select id, 'spam' from noema_messages where body = 'my notes'")
    ok(q('b', "select count(*) from noema_messages where body = 'my notes'") == ['0'] and q('c', "select hidden, reports from noema_messages where body = 'my notes'") == ['t|3'], 'three reports hide a message (its author still sees it)')
    q('c', "update noema_messages set body = 'edited', hidden = false where body = 'my notes'")
    ok(q('c', "select body, hidden, edited_at is not null from noema_messages where body = 'edited'") == ['edited|t|t'], 'editing changes the text only')
    q('c', "update noema_messages set deleted = true where body = 'edited'")
    ok(q('c', "select body, att is null from noema_messages where deleted") == ['|t'], 'deleting clears the text and the attachment')
    q('a', f"update noema_room_members set status = 'left' where user_id = '{P['a']}' and room = '{g}'")
    ok(q('b', f"select role from noema_room_members where room = '{g}' and user_id = '{P['b']}'") == ['owner'], 'when the owner leaves, the oldest member becomes owner')
    q('b', "insert into noema_curricula_shared (id, title, record) values ('cbroad1', 'B road', '{}')"); q('b', f"insert into noema_room_roadmaps (room, curriculum) values ('{g}', 'cbroad1')")
    ok(q('c', "select noema_cur_access('cbroad1')") == ['public'] and q('d', "select coalesce(noema_cur_access('cbroad1'), 'none')") == ['none'], 'a Roadmap shared in a group: its members may join it, others do not see it')
    ok(q('c', f"insert into noema_curriculum_members (curriculum, email, user_id, status) values ('cbroad1', '{PE['c']}', '{P['c']}', 'joined') returning status") == ['joined'], '…and a member joins it')
    ok(q('c', f"insert into noema_room_roadmaps (room, curriculum) values ('{g}', 'cbroad1x')", expect_error=True), 'only one’s own (or a public) Roadmap is shared')
    vid = '55555555-1111-1111-1111-111111111111'
    q('c', f"insert into noema_vault_files (id, title, university, department, course, year, semester, kind, subject, language, file_name, mime, size, path, room) values ('{vid}', 'Group notes', 'Uni', 'Dept', 'Course', 2024, 1, 'notes', 'biology', 'en', 'g.pdf', 'application/pdf', 10, 'files/{vid}.pdf', '{g}')")
    q('c', f"insert into storage.objects (bucket_id, name, metadata) values ('noema-vault', 'files/{vid}.pdf', '{{\"size\": 10}}')"); q('c', f"select noema_vault_finish('{vid}')")
    ok(q('b', "select count(*) from noema_vault where room is not null") == ['1'] and q('d', "select count(*) from noema_vault where room is not null") == ['0'], 'a group’s vault folder: its members only')
    ok(q('d', f"insert into noema_vault_files (title, university, department, course, year, semester, kind, subject, language, file_name, mime, size, path, room) values ('x', 'Uni', 'Dept', 'Course', 2024, 1, 'notes', 'biology', 'en', 'g.pdf', 'application/pdf', 10, 'files/66666666-1111-1111-1111-111111111111.pdf', '{g}')", expect_error=True), '…and only they put files in it')
    ok(q('d', "insert into noema_vault_files (title, kind, subject, language, file_name, mime, size, path) values ('Glossary', 'other', 'physics', 'el,ru', 'g.pdf', 'application/pdf', 10, 'files/66666666-1111-1111-1111-111111111111.pdf') returning coalesce(university, '-') || coalesce(semester::text, '-')") == ['--'], 'a file without university, course, year or semester, in two languages')
    ok(q('d', "insert into noema_vault_files (title, kind, subject, language, file_name, mime, size, path) values ('x', 'other', 'physics', 'el;ru', 'g.pdf', 'application/pdf', 10, 'files/77777777-1111-1111-1111-111111111111.pdf')", expect_error=True), 'languages are codes separated by commas')
    for n in '78': q('e', f"insert into noema_chat_files (path, room, name, mime, size) values ('rooms/{g}/{n * 8}-2222-2222-2222-222222222222.pdf', '{g}', 'a.pdf', 'application/pdf', 20971520)")
    ok(q('e', "insert into noema_vault_files (title, university, department, course, year, semester, kind, subject, language, file_name, mime, size, path) values ('big', 'Uni', 'Dept', 'Course', 2024, 1, 'notes', 'biology', 'en', 'g.pdf', 'application/pdf', 20971520, 'files/77777777-1111-1111-1111-111111111111.pdf')", expect_error=True), 'the 50 MB count the vault and the files sent in conversations together')
    ok(psql("select count(*) from noema_people", role='anon') == ['0'] and psql("select count(*) from noema_messages", role='anon') == ['0'], 'signed-out visitors see no one and nothing')
finally:
    subprocess.run(as_pg + [f'{BIN}/pg_ctl', '-D', data, 'stop', '-m', 'immediate'], capture_output=True)
    shutil.rmtree(data, ignore_errors=True)
print('\n' + (f'{fails} FAILED' if fails else 'ALL PASSED')); sys.exit(1 if fails else 0)
