#!/usr/bin/env python3
"""Screenshots of an activity, to look at before delivering (docs/INTERACTIVE.md §11):
  python3 activity_preview.py SUBJECT_DIR ACTIVITY_ID [OUT_DIR]   (default OUT_DIR: SUBJECT_DIR/build/preview/<id>/)
→ light.png, dark.png (800 px), phone-360.png (it must fit without sideways scrolling) and fallback.png (the still picture and the
text the learner sees when the activity cannot run). Look at every one. Needs Node and Playwright."""
import os, sys, subprocess, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[1:]
if len(a) < 2: print(__doc__); sys.exit(1)
if not shutil.which('node'): print('✗ Node.js is needed (the harness drives a browser with Playwright)'); sys.exit(2)
sys.exit(subprocess.call(['node', os.path.join(HERE, 'activity_harness.js'), 'preview', *a]))
