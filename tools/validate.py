#!/usr/bin/env python3
"""Validate a chapter JSON file (tools/CONTENT_SPEC.md + docs/VISUAL.md).
Usage: validate.py chNN.json [--media media_meta.json] [--activities registry.json] [--min-visual N] [--quality error|warn]
                   [--balance N | --balance-warn N] [--features code,math] [--source chNN.json]
       validate.py subject.json --subject [--translations el,fr]
  --media         {id: {w, h, regions}} of the subject's pictures (build.py passes it) → checks references & coordinates
  --activities    the subject's activity registry (noema.activities/v1): interactive blocks and sim exercises are checked against it
  --min-visual    required visual exercises per chapter (from subject.json authoring.minVisualPerChapter)
  --balance       every exercise type, difficulty and focus tag at least N times in the chapter (the quantity rules of
                  tools/CONTENT_SPEC.md; N from subject.json authoring.minPerKind) — errors; --balance-warn N: the same as warnings
  --quality       the quality rules Q1–Q8 of tools/CONTENT_SPEC.md (packs with authoring.rules >= 2): the chapter's knowledge
                  map (chapter.map), fits, the mix of difficulty and thinking, learnables with >= 2 versions, self-contained
                  texts, explanations, the review (chapter.review). error: issues of level "error" are errors (Claude/Gemini-made
                  packs); warn: every issue is a warning (learner-made or imported packs)
  --features      the subject's features that are on (code, math): they make spotbug, write, calc, syntax required
  --source        the file is a TRANSLATION (translations/<locale>/chNN.json) of this chapter (as built: base + patches):
                  same ids, same structure, same answers — only the words differ (CONTENT_SPEC.md "Packs in several languages")
  --subject       check subject.json: the content language and the optional per-locale metadata (subject.i18n)
  --translations  (with --subject) the locales the subject has translations/<locale>/ folders for

The checks are the app's and the connector's own (src/features/content/domain/chapter.ts, with the data contracts of
src/contracts and the engine library), run in node through the bridge (noema_core.py → build/noema-tools.cjs validate):
this file only hands its arguments over. It prints a summary, ERROR:/WARN: lines and OK or "N ERRORS"; exit code 1 on errors."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import noema_core

if __name__ == '__main__':
    try: r = noema_core.run('validate', *sys.argv[1:])
    except noema_core.CoreUnavailable as e: print('ERROR:', e); sys.exit(1)
    sys.stdout.write(r.stdout); sys.stderr.write(r.stderr)
    sys.exit(r.returncode)
