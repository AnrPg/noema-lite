#!/usr/bin/env python3
"""Run a subject's activities in a real browser with the app's own runtime (docs/INTERACTIVE.md §11):
  python3 activity_test.py SUBJECT_DIR [ACTIVITY_ID]
Every activity in every language of its string tables: it starts (hello → ready), shows no raw string keys and no errors,
runs in the sandbox with the CSP; then each case of activities/<id>/tests.json (steps → the expected result, text, state;
docs/INTERACTIVE_AUTHORING.md). py-module@1 activities need the pinned Python files: NOEMA_PYODIDE_SITE=<a folder with
vendor/pyodide/> (python3 tools/fetch_pyodide.py --site DIR); without them they are skipped (exit code 2 when nothing else was checked).
Exit code 1 when anything fails. Needs Node and Playwright (npm i playwright; npx playwright install chromium)."""
import os, sys, subprocess, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[1:]
if not a: print(__doc__); sys.exit(1)
if not shutil.which('node'): print('✗ Node.js is needed (the harness drives a browser with Playwright)'); sys.exit(2)
sys.exit(subprocess.call(['node', os.path.join(HERE, 'activity_harness.js'), 'test', *a]))
