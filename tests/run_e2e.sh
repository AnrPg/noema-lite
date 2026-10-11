#!/usr/bin/env bash
# Prepares a throw-away copy of the repo with test fixtures, builds it and runs the e2e suite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="${TMPDIR:-/tmp}/noema-e2e"
rm -rf "$T"; mkdir -p "$T"; (cd "$ROOT" && tar --exclude=.git --exclude=dist --exclude=data -cf - .) | (cd "$T" && tar xf -)
cp -r "$T/tests/fixtures/demo-physics" "$T/library/subjects/demo-physics"
mkdir -p "$T/accounts/anr/packs"; cp -r "$T/tests/fixtures/demo-physics" "$T/accounts/anr/packs/secret-notes"
# (sed -i.bak works with both GNU sed on Linux and BSD sed on macOS)
sed -i.bak 's/"id": "demo-physics"/"id": "secret-notes"/; s/"title": "Demo Physics"/"title": "Secret Notes"/' "$T/accounts/anr/packs/secret-notes/subject.json" && rm -f "$T/accounts/anr/packs/secret-notes/subject.json.bak"
# the older suites test the classic screens (shell: false: the subject picker at start, no first-time questions); tests/shell.js sets noema-test:newUI for the new frame
echo "if (typeof localStorage !== 'undefined' && localStorage.getItem('noema-test:newUI') !== '1') Object.assign(window.NOEMA_CONFIG, { askSubjectOnStart: true, onboarding: false, shell: false });" >> "$T/config.js"
(cd "$T" && python3 tools/build.py site bundle >/dev/null)
node "$ROOT/tests/shell.js" "$T"
node "$ROOT/tests/e2e.js" "$T"
node "$ROOT/tests/socratic.js" "$T"
node "$ROOT/tests/visual.js" "$T"
python3 "$ROOT/tests/validate_visual.py"
python3 "$ROOT/tests/validate_pack_i18n.py"   # packs in several languages: subject.i18n, translated chapters (docs/i18n.md §10)
(cd "$T" && python3 tests/package_sources.py)
node "$ROOT/tests/connector.js" "$T"
node "$ROOT/tests/visual_pack.js" "$T"
node "$ROOT/tests/sharing.js" "$T"
node "$ROOT/tests/pack_i18n.js" "$T"   # packs in several languages: picker, Shelf, Explore, home, translated chapters (docs/i18n.md §10)
node "$ROOT/tests/claude_api.js" "$T"
node "$ROOT/tests/imglib.js" "$ROOT"
node "$ROOT/tests/curriculum.js" "$T"
node "$ROOT/tests/curriculum_import.js" "$T"
node "$ROOT/tests/curriculum_app.js" "$T"
node "$ROOT/tests/curriculum_share.js" "$T"
node "$ROOT/tests/shelf.js" "$T"
node "$ROOT/tests/sources.js" "$T"
python3 "$ROOT/tests/sql_policies.py"   # skips itself when no PostgreSQL is installed
# foreign languages (docs/LANGUAGES.md §11): content validator, reference checker, runtime, the course, the UI
python3 "$ROOT/tests/lang_rules.py"
python3 "$ROOT/tests/lang_validate.py"
python3 "$ROOT/tests/lang_facade.py"   # D19: the explanation-field registry, round trip of the master facade, parity, lint
python3 "$ROOT/tests/lang_refcheck.py"
python3 "$ROOT/tools/lang_phenomena.py" > /dev/null   # the catalogues of phenomena agree with the implementation (D14)
node "$ROOT/tests/langcore.js"
node "$ROOT/tests/lang_courses.js"
node "$ROOT/tests/lang_ui.js" "$T"
node "$ROOT/tests/lang_lessons.js" "$T"
node "$ROOT/tests/lang_grammar.js" "$T"   # the grammar lane (P5): generators, validator, widgets, lane, session
node "$ROOT/tests/lang_vocab2.js" "$T"   # vocabulary depth: the remaining §6.2 types (P5v)
node "$ROOT/tests/lang_wordcard.js" "$T"   # R3: the word card shows the word's parameters right under the word (wordParams, Arabic plurals, German nouns and verbs)
node "$ROOT/tests/lang_sync.js" "$T"   # progress across devices (docs/SYNC.md)
node "$ROOT/tests/lang_script.js" "$T"   # P4: script modules, keyboards, pinyin input, the 🔤 lane (docs/LANGUAGES.md §4.9, §6.1, §8)
node "$ROOT/tests/lang_poly.js" "$T"   # P6 polyglot layer: parallel sentences, bridges, comparisons, the five polyglot exercises, the compare lane
node "$ROOT/tests/lang_prod.js" "$T"     # production and reading, the tutor (P7; Gemini mocked)
node "$ROOT/tests/lang_claude.js" "$T"   # courses and content through Claude: tasks, checks, connector, app (docs/LANGUAGES.md §10.1)
node "$ROOT/tests/lang_speech.js" "$T"   # P9 listening and speaking: speech synthesis, dictation, shadowing, recognition (speech services mocked)
node "$ROOT/tests/lang_walkthrough.js" "$T"   # QA: the whole language part end to end — three learners, two widths, every route (docs/LANGUAGES.md §13 QA)
node "$ROOT/tests/lang_frame.js" "$T"   # the language courses inside the new frame: the Languages tab, #/lang/<course>/…, Today, + New language (docs/LANGUAGES.md §8)
node "$ROOT/tests/lang_native.js" "$T"   # D19: taught through the learner's native language — the question once, only the native's notes, the explanation facade (docs/language-packs.md)
node "$ROOT/tests/lang_lanes.js" "$T"   # ⫴ parallel lanes: the same subject level across the languages (D13, §9.2)
node "$ROOT/tests/lang_select.js" "$T"   # D21: the learner chooses the languages to study — one, several or all; the course, the Languages tab and Today follow
node "$ROOT/tests/lang_package.js" "$T"   # a whole language in one prompt: the package, the connector's guide / start / finish, the app on two devices (§10.2)
node "$ROOT/tests/i18n.js"   # the interface languages: runtime, plurals per CLDR, drafts, pseudo-locales, catalog checks (docs/i18n.md)
node "$ROOT/tests/i18n_errors.js"   # error-code contract, Auth mapping, account locale, e-mail templates (docs/i18n.md §6)
node "$ROOT/tests/i18n_runtime.js" "$T"   # the runtime audit: every surface in the pseudo-locale en-XA — no untranslated interface text; ar-XB right to left (docs/i18n.md §5.3)
node "$ROOT/tests/mt.js" "$T"   # machine translation of shared content: policy, cache, caps, toggle (docs/i18n.md §11; provider mocked)
python3 "$ROOT/tests/weblate_tools.py"   # Weblate tools: facade round trip, prune_drafts, draft-import and setup plans (no network)
node "$ROOT/tests/i18n_rtl.js" "$T"   # RTL (ar-XB): dir switching, mirroring, bidi isolation, LTR islands, self-hosted script fonts
