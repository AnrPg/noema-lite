#!/usr/bin/env python3
"""Build/refresh the SQLite backup database  data/noema-lite.db  from the repository.

What it stores
  • file_versions / files : every source file (chapters, patches, sources.json, PDFs, account backups, engine sources, tools…)
                            content-addressed (sha256) → the DB alone can restore the whole repo at any past sync
  • subjects, sources, chapters, sections, blocks, exercises, playbooks, flashcards, pitfalls : queryable content
  • pack_versions          : every built pack version ever seen (JSON)
  • accounts, backups, user_kv, progress, conversations, messages : per-profile state from accounts/<id>/backups/*.json
Usage:  python3 tools/db_sync.py [--db PATH] [--no-blobs]
"""
import os, sys, glob, json, sqlite3, hashlib, subprocess, time, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from noema_lib import ROOT, LIB, ACC, rj, subject_dirs, load_subject, now_iso

args = sys.argv[1:]
DB = args[args.index('--db') + 1] if '--db' in args else os.path.join(ROOT, 'data', 'noema-lite.db')
BLOBS = '--no-blobs' not in args
SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS file_versions(sha256 TEXT PRIMARY KEY, bytes INTEGER, data BLOB, first_seen TEXT);
CREATE TABLE IF NOT EXISTS file_history(path TEXT, sha256 TEXT, seen_at TEXT, PRIMARY KEY(path, sha256));
CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, sha256 TEXT, bytes INTEGER, updated_at TEXT);
CREATE TABLE IF NOT EXISTS pack_versions(subject_id TEXT, version TEXT, built_at TEXT, bytes INTEGER, json TEXT, first_seen TEXT, PRIMARY KEY(subject_id, version));
CREATE TABLE IF NOT EXISTS subjects(id TEXT PRIMARY KEY, owner TEXT, title TEXT, emoji TEXT, grp TEXT, language TEXT, dir TEXT, version TEXT, meta_json TEXT);
CREATE TABLE IF NOT EXISTS sources(subject_id TEXT, id TEXT, ord INTEGER, title TEXT, pages TEXT, file TEXT, added TEXT, meta_json TEXT, PRIMARY KEY(subject_id, id));
CREATE TABLE IF NOT EXISTS chapters(subject_id TEXT, id TEXT, num INTEGER, title TEXT, subtitle TEXT, emoji TEXT, src TEXT, mantra TEXT, PRIMARY KEY(subject_id, id));
CREATE TABLE IF NOT EXISTS sections(subject_id TEXT, id TEXT, chapter_id TEXT, ord INTEGER, title TEXT, hook TEXT, PRIMARY KEY(subject_id, id));
CREATE TABLE IF NOT EXISTS blocks(subject_id TEXT, section_id TEXT, ord INTEGER, type TEXT, src TEXT, text TEXT, json TEXT, PRIMARY KEY(subject_id, section_id, ord));
CREATE TABLE IF NOT EXISTS exercises(subject_id TEXT, id TEXT, chapter_id TEXT, section_id TEXT, type TEXT, difficulty INTEGER, tags TEXT, quick INTEGER, src TEXT, q TEXT, json TEXT, PRIMARY KEY(subject_id, id));
CREATE TABLE IF NOT EXISTS playbooks(subject_id TEXT, id TEXT, chapter_id TEXT, section_id TEXT, title TEXT, src TEXT, json TEXT, PRIMARY KEY(subject_id, id));
CREATE TABLE IF NOT EXISTS flashcards(subject_id TEXT, chapter_id TEXT, ord INTEGER, section_id TEXT, q TEXT, a TEXT, src TEXT, PRIMARY KEY(subject_id, chapter_id, ord));
CREATE TABLE IF NOT EXISTS pitfalls(subject_id TEXT, chapter_id TEXT, ord INTEGER, title TEXT, text TEXT, fix TEXT, src TEXT, PRIMARY KEY(subject_id, chapter_id, ord));
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, name TEXT, emoji TEXT, kind TEXT, email TEXT, json TEXT);
CREATE TABLE IF NOT EXISTS backups(sha256 TEXT PRIMARY KEY, file TEXT, account_id TEXT, created_at TEXT, bytes INTEGER, json TEXT);
CREATE TABLE IF NOT EXISTS user_kv(account_id TEXT, key TEXT, value TEXT, from_backup TEXT, PRIMARY KEY(account_id, key));
CREATE TABLE IF NOT EXISTS progress(account_id TEXT, subject_id TEXT, subject_xp INTEGER, sections_read INTEGER, exercises_attempted INTEGER, exercises_solved INTEGER, last_section TEXT, PRIMARY KEY(account_id, subject_id));
-- conversations/messages: canonical noema.conversation/v1 (see docs/CONVERSATIONS.md); rebuilt on every sync
DROP TABLE IF EXISTS conversations; DROP TABLE IF EXISTS messages;
CREATE TABLE conversations(account_id TEXT, id TEXT, subject_id TEXT, kind TEXT, mode TEXT, title TEXT, title_source TEXT,
  context_type TEXT, context_id TEXT, context_label TEXT, model TEXT, created_at TEXT, updated_at TEXT, n_messages INTEGER,
  deleted INTEGER, origin TEXT, record_json TEXT, PRIMARY KEY(account_id, id));
CREATE TABLE messages(account_id TEXT, conversation_id TEXT, seq INTEGER, id TEXT, role TEXT, content TEXT, created_at TEXT,
  PRIMARY KEY(account_id, conversation_id, seq));
CREATE INDEX IF NOT EXISTS ix_conv_subject ON conversations(account_id, subject_id, updated_at);
CREATE TABLE IF NOT EXISTS sync_log(at TEXT, action TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS ix_ex_section ON exercises(subject_id, section_id);
CREATE INDEX IF NOT EXISTS ix_blocks_text ON blocks(subject_id, type);
"""
LEGACY_BACKUP_FORMATS = ('learning-quest-backup',)   # files written before the app was renamed noema-lite
EXCLUDE_DIRS = {'.git', 'dist', 'data', 'node_modules', '__pycache__', '_to_delete'}
GENERATED = ('pack.js', 'pack.json', 'engine.js', 'engine.css', 'registry.js')

def sha(b): return hashlib.sha256(b).hexdigest()

def tracked_files():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if f in GENERATED or f.endswith('.tmp') or f == 'config.local.js' or f.startswith('.DS_Store'): continue
            p = os.path.join(base, f); yield os.path.relpath(p, ROOT).replace(os.sep, '/'), p

def block_text(b):
    t = b.get('t')
    if t in ('p', 'diagram'): return b.get('text', '')
    if t == 'code': return b.get('code', '')
    if t == 'callout': return (b.get('title', '') + ': ' + b.get('text', '')).strip(': ')
    if t in ('list', 'flow'): return '\n'.join(b.get('items', []))
    if t == 'ask': return (b.get('title') or '') + '\n' + '\n'.join(b.get('questions', []))
    if t == 'reveal': return b.get('label', '') + '\n' + b.get('text', '')
    if t == 'terms': return '\n'.join(f"{i['term']}: {i['def']}" for i in b.get('items', []))
    if t == 'table': return '\n'.join(' | '.join(r) for r in [b.get('head', [])] + b.get('rows', []))
    if t == 'compare': return '\n'.join(i['title'] + ': ' + '; '.join(i['points']) for i in b.get('items', []))
    return ''

def main():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    # Work on a local temp copy: SQLite locking is unreliable on synced/network/virtual folders (iCloud, Dropbox, VMs).
    work = os.path.join(tempfile.mkdtemp(prefix='noemadb-'), 'work.db')
    if os.path.exists(DB): shutil.copyfile(DB, work)
    con = sqlite3.connect(work); con.executescript(SCHEMA); cur = con.cursor(); ts = now_iso()
    # 1) content-addressed copy of every source file (versioned)
    n_new = 0; cur.execute('DELETE FROM files')
    for rel, p in tracked_files():
        data = open(p, 'rb').read(); h = sha(data)
        if cur.execute('SELECT 1 FROM file_versions WHERE sha256=?', (h,)).fetchone() is None:
            big_binary = rel.endswith('.pdf') and not BLOBS
            cur.execute('INSERT INTO file_versions VALUES (?,?,?,?)', (h, len(data), None if big_binary else data, ts)); n_new += 1
        cur.execute('INSERT OR IGNORE INTO file_history VALUES (?,?,?)', (rel, h, ts))
        cur.execute('INSERT INTO files VALUES (?,?,?,?)', (rel, h, len(data), ts))
    # 2) structured content (rebuilt every time)
    for t in ('subjects', 'sources', 'chapters', 'sections', 'blocks', 'exercises', 'playbooks', 'flashcards', 'pitfalls'): cur.execute(f'DELETE FROM {t}')
    for sdir, owner in subject_dirs():
        meta, SRC, chapters, _ = load_subject(sdir); sid = meta['id']
        pj = os.path.join(sdir, 'pack.json'); version = None
        if os.path.exists(pj):
            raw = open(pj, encoding='utf-8').read(); pk = json.loads(raw); version = pk.get('version')
            cur.execute('INSERT OR IGNORE INTO pack_versions VALUES (?,?,?,?,?,?)', (sid, version, pk.get('builtAt'), len(raw), raw, ts))
        cur.execute('INSERT INTO subjects VALUES (?,?,?,?,?,?,?,?,?)', (sid, owner, meta.get('title'), meta.get('emoji'), meta.get('group'), meta.get('language'), os.path.relpath(sdir, ROOT), version, json.dumps(meta, ensure_ascii=False)))
        for i, s in enumerate(SRC.get('sources', [])): cur.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)', (sid, s['id'], i, s.get('title'), s.get('pages'), s.get('file'), s.get('added'), json.dumps(s, ensure_ascii=False)))
        for c in chapters:
            cur.execute('INSERT INTO chapters VALUES (?,?,?,?,?,?,?,?)', (sid, c['id'], c.get('num'), c.get('title'), c.get('subtitle'), c.get('emoji'), c.get('src'), c.get('mantra')))
            for j, s in enumerate(c['sections']):
                cur.execute('INSERT INTO sections VALUES (?,?,?,?,?,?)', (sid, s['id'], c['id'], j, s['title'], s.get('hook')))
                for k, b in enumerate(s['blocks']): cur.execute('INSERT INTO blocks VALUES (?,?,?,?,?,?,?)', (sid, s['id'], k, b.get('t'), b.get('src') or c.get('src'), block_text(b), json.dumps(b, ensure_ascii=False)))
            for e in c['exercises']: cur.execute('INSERT OR REPLACE INTO exercises VALUES (?,?,?,?,?,?,?,?,?,?,?)', (sid, e['id'], c['id'], e.get('section'), e.get('type'), e.get('difficulty'), ','.join(e.get('tags', [])), 1 if e.get('quick') else 0, e.get('src') or c.get('src'), e.get('q'), json.dumps(e, ensure_ascii=False)))
            for d in c['debug']: cur.execute('INSERT OR REPLACE INTO playbooks VALUES (?,?,?,?,?,?,?)', (sid, d.get('id'), c['id'], d.get('section'), d.get('title'), d.get('src') or c.get('src'), json.dumps(d, ensure_ascii=False)))
            for k, f in enumerate(c['flashcards']): cur.execute('INSERT INTO flashcards VALUES (?,?,?,?,?,?,?)', (sid, c['id'], k, f.get('section'), f.get('q'), f.get('a'), f.get('src') or c.get('src')))
            for k, p in enumerate(c['pitfalls']): cur.execute('INSERT INTO pitfalls VALUES (?,?,?,?,?,?,?)', (sid, c['id'], k, p.get('title'), p.get('text'), p.get('fix'), p.get('src') or c.get('src')))
    # 3) accounts + backups (all backup files are kept; the newest per account feeds the state tables)
    for t in ('accounts', 'user_kv', 'progress'): cur.execute(f'DELETE FROM {t}')
    convs = {}   # (account, id) -> (record, origin); newest updatedAt wins
    def add_conv(acc, rec, origin):
        if not isinstance(rec, dict) or not rec.get('id'): return
        k = (acc, rec['id']); old = convs.get(k)
        if old is None or (rec.get('updatedAt') or '') > (old[0].get('updatedAt') or ''): convs[k] = (rec, origin)
    latest = {}
    for f in sorted(glob.glob(os.path.join(ACC, '*', 'account.json'))):
        a = rj(f); cur.execute('INSERT OR REPLACE INTO accounts VALUES (?,?,?,?,?,?)', (a['id'], a.get('name'), a.get('emoji'), 'local', a.get('email'), json.dumps(a, ensure_ascii=False)))
    for f in sorted(glob.glob(os.path.join(ACC, '*', 'backups', '*.json'))):
        raw = open(f, 'rb').read()
        try: b = json.loads(raw)
        except Exception: continue
        if b.get('format') not in ('noema-lite-backup',) + LEGACY_BACKUP_FORMATS: continue
        acc = b['account']['id']; h = sha(raw)
        cur.execute('INSERT OR IGNORE INTO backups VALUES (?,?,?,?,?,?)', (h, os.path.relpath(f, ROOT), acc, b.get('createdAt'), len(raw), raw.decode('utf-8')))
        if acc not in latest or (b.get('createdAt') or '') > (latest[acc][1].get('createdAt') or ''): latest[acc] = (os.path.relpath(f, ROOT), b)
        for rec in b.get('conversations') or []: add_conv(acc, rec, 'backup:' + os.path.basename(f))
    # canonical conversation files written by the app's folder auto-backup: accounts/<id>/conversations/<subject>/<YYYY-MM>/<cv_id>.json
    for f in sorted(glob.glob(os.path.join(ACC, '*', 'conversations', '*', '*', 'cv_*.json'))):
        try: rec = json.load(open(f, encoding='utf-8'))
        except Exception: continue
        add_conv(f.split(os.sep)[-5], rec, 'file')
        cur.execute('INSERT OR IGNORE INTO accounts VALUES (?,?,?,?,?,?)', (acc, b['account'].get('name'), b['account'].get('emoji'), b['account'].get('kind'), b['account'].get('email'), json.dumps(b['account'], ensure_ascii=False)))
    for acc, (fname, b) in latest.items():
        for key, val in b['data'].items():
            cur.execute('INSERT INTO user_kv VALUES (?,?,?,?)', (acc, key, val, fname))
            parts = key.split(':')
            if len(parts) == 3 and parts[0] == 's' and parts[2] == 'state':
                try: st = json.loads(val)
                except Exception: continue
                res = st.get('res', {})
                cur.execute('INSERT OR REPLACE INTO progress VALUES (?,?,?,?,?,?,?)', (acc, parts[1], st.get('xp', 0), len(st.get('read', {})), len(res), sum(1 for r in res.values() if r.get('ok', 0) > 0), st.get('last')))
            if len(parts) == 3 and parts[0] == 's' and parts[2] == 'convos':   # legacy (pre-v2) storage → canonical shape
                try: convos = json.loads(val)
                except Exception: continue
                for cv in convos:
                    iso = lambda ms: time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime((ms or 0) / 1000)) + 'Z'
                    if (acc, cv.get('id')) in convs: continue
                    add_conv(acc, {'schema': 'noema.conversation/v1', 'id': cv.get('id'), 'subject': {'id': parts[1]}, 'kind': 'tutor', 'mode': cv.get('mode'), 'title': cv.get('title'),
                                   'context': {'type': (cv.get('ctx') or {}).get('kind', 'course'), 'id': (cv.get('ctx') or {}).get('id'), 'label': (cv.get('ctx') or {}).get('label')},
                                   'model': {'provider': 'google', 'name': cv.get('model')}, 'createdAt': iso(cv.get('created')), 'updatedAt': iso(cv.get('updated')), 'deleted': False,
                                   'messages': [{'seq': i, 'role': 'assistant' if m.get('role') == 'model' else m.get('role'), 'content': m.get('text', ''), 'createdAt': iso(m.get('t'))} for i, m in enumerate(cv.get('msgs', []))]}, 'legacy-kv')
    for (acc, cid), (r, origin) in convs.items():
        ctx = r.get('context') or {}; msgs = r.get('messages') or []
        cur.execute('INSERT OR REPLACE INTO conversations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (acc, cid, (r.get('subject') or {}).get('id'), r.get('kind'), r.get('mode'), r.get('title'), r.get('titleSource'),
                    ctx.get('type'), ctx.get('id'), ctx.get('label'), (r.get('model') or {}).get('name'), r.get('createdAt'), r.get('updatedAt'), len(msgs), 1 if r.get('deleted') else 0, origin, json.dumps(r, ensure_ascii=False)))
        for i, m in enumerate(msgs): cur.execute('INSERT OR REPLACE INTO messages VALUES (?,?,?,?,?,?,?)', (acc, cid, m.get('seq', i), m.get('id'), m.get('role'), m.get('content'), m.get('createdAt')))
    try: commit = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    except Exception: commit = ''
    for k, v in (('last_sync', ts), ('git_commit', commit), ('schema_version', '2')): cur.execute('INSERT OR REPLACE INTO meta VALUES (?,?)', (k, v))
    cur.execute('INSERT INTO sync_log VALUES (?,?,?)', (ts, 'sync', json.dumps({'new_file_versions': n_new, 'commit': commit})))
    con.commit()
    q = lambda s: cur.execute(s).fetchone()[0]
    summary = (f"{q('SELECT COUNT(*) FROM subjects')} subjects · {q('SELECT COUNT(*) FROM exercises')} exercises · {q('SELECT COUNT(*) FROM files')} files ({n_new} new versions) · "
               f"{q('SELECT COUNT(*) FROM backups')} backups · {q('SELECT COUNT(*) FROM conversations')} conversations")
    con.execute('VACUUM'); con.close()
    tmp = DB + '.tmp'; shutil.copyfile(work, tmp); os.replace(tmp, DB); shutil.rmtree(os.path.dirname(work), ignore_errors=True)
    print(f"db: {os.path.relpath(DB, ROOT)} · {summary} · {os.path.getsize(DB)/1e6:.1f} MB")

if __name__ == '__main__': main()
