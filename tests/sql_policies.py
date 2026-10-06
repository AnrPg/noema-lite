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
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
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
    ok(tables == ['noema_conversations', 'noema_kv', 'noema_profiles', 'noema_public_packs', 'noema_shares', 'noema_snapshots'], 'six noema_ tables, all with row-level security: ' + ', '.join(tables))
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
finally:
    subprocess.run(as_pg + [f'{BIN}/pg_ctl', '-D', data, 'stop', '-m', 'immediate'], capture_output=True)
    shutil.rmtree(data, ignore_errors=True)
print('\n' + (f'{fails} FAILED' if fails else 'ALL PASSED')); sys.exit(1 if fails else 0)
