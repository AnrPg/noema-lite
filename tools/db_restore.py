#!/usr/bin/env python3
"""Restore from the SQLite backup database (data/noema-lite.db).

  python3 tools/db_restore.py list                              # syncs, files, subjects, accounts, backups
  python3 tools/db_restore.py files --to DIR [--at ISO-TIME]    # recreate every file as it was at the latest sync (or at/before ISO-TIME)
  python3 tools/db_restore.py subject ID --to DIR               # recreate one subject folder (chapters, patches, sources, PDFs)
  python3 tools/db_restore.py pack ID [--version V] --out F     # write a built pack (importable in the app via “Import subject pack”)
  python3 tools/db_restore.py backup ACCOUNT --out F            # newest backup file of a profile (restore it in the app)
Always restores into a NEW directory/file — it never overwrites your working copy.
"""
import os, sys, sqlite3, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from noema_lib import ROOT
a = sys.argv[1:]
opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
DB = opt('--db', os.path.join(ROOT, 'data', 'noema-lite.db'))
if not a or not os.path.exists(DB): print(__doc__); sys.exit(0 if not a else 1)
_work = os.path.join(tempfile.mkdtemp(prefix='noemadb-'), 'r.db'); shutil.copyfile(DB, _work)   # read a copy (safe on synced/virtual folders)
con = sqlite3.connect(_work); cur = con.cursor()
def safe_dir(d):
    d = os.path.abspath(d)
    if os.path.exists(d) and os.listdir(d): sys.exit(f'refusing to write into non-empty {d}')
    os.makedirs(d, exist_ok=True); return d
def write_files(rows, to):
    n = 0
    for path, h in rows:
        r = cur.execute('SELECT data FROM file_versions WHERE sha256=?', (h,)).fetchone()
        if not r or r[0] is None: print('  (no blob stored for', path, ')'); continue
        p = os.path.join(to, path); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'wb').write(r[0]); n += 1
    print(f'restored {n} files → {to}')
cmd = a[0]
if cmd == 'list':
    for k, v in cur.execute('SELECT key, value FROM meta'): print(f'{k}: {v}')
    print('syncs:', [r[0] for r in cur.execute('SELECT at FROM sync_log ORDER BY at DESC LIMIT 10')])
    print('subjects:', cur.execute('SELECT id, title, version FROM subjects').fetchall())
    print('pack versions:', cur.execute('SELECT subject_id, version, built_at FROM pack_versions ORDER BY first_seen DESC LIMIT 20').fetchall())
    print('accounts:', cur.execute('SELECT id, name FROM accounts').fetchall())
    print('backups:', cur.execute('SELECT account_id, created_at, file FROM backups ORDER BY created_at DESC LIMIT 20').fetchall())
elif cmd == 'files':
    to = safe_dir(opt('--to')); at = opt('--at')
    if not at: rows = cur.execute('SELECT path, sha256 FROM files').fetchall()
    else: rows = cur.execute('SELECT path, sha256 FROM file_history h WHERE seen_at = (SELECT MAX(seen_at) FROM file_history WHERE path=h.path AND seen_at <= ?)', (at,)).fetchall()
    write_files(rows, to)
elif cmd == 'subject':
    sid = a[1]; to = safe_dir(opt('--to')); d = cur.execute('SELECT dir FROM subjects WHERE id=?', (sid,)).fetchone()
    if not d: sys.exit('unknown subject')
    write_files(cur.execute('SELECT path, sha256 FROM files WHERE path LIKE ?', (d[0].replace(os.sep, '/') + '/%',)).fetchall(), to)
elif cmd == 'pack':
    sid = a[1]; v = opt('--version'); out = opt('--out')
    r = cur.execute('SELECT json FROM pack_versions WHERE subject_id=? AND (? IS NULL OR version=?) ORDER BY first_seen DESC LIMIT 1', (sid, v, v)).fetchone()
    if not r: sys.exit('no such pack')
    open(out, 'w', encoding='utf-8').write(r[0]); print('pack →', out)
elif cmd == 'backup':
    r = cur.execute('SELECT json FROM backups WHERE account_id=? ORDER BY created_at DESC LIMIT 1', (a[1],)).fetchone()
    if not r: sys.exit('no backup for that account')
    out = opt('--out'); open(out, 'w', encoding='utf-8').write(r[0]); print('backup →', out)
else: print(__doc__)
