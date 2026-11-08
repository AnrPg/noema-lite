#!/usr/bin/env bash
# Prepares a throw-away copy of the repo with test fixtures, builds it and runs the e2e suite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="${TMPDIR:-/tmp}/noema-e2e"
# the generated files are never committed: build the repo itself first (the suites that read "$ROOT" use them; npm ci once before)
[ -d "$ROOT/node_modules/esbuild" ] || (cd "$ROOT" && npm ci --no-audit --no-fund)
(cd "$ROOT" && python3 tools/build.py --no-validate >/dev/null)
export NOEMA_BUILT=1   # tests/built.js: every suite finds the files built (no suite builds again)
rm -rf "$T"; mkdir -p "$T"; (cd "$ROOT" && tar --exclude=.git --exclude=dist --exclude=data --exclude=node_modules -cf - .) | (cd "$T" && tar xf -)
ln -s "$ROOT/node_modules" "$T/node_modules"   # the copy builds with the repo's own tools (esbuild)
cp -r "$T/tests/fixtures/demo-physics" "$T/library/subjects/demo-physics"
mkdir -p "$T/accounts/anr/packs"; cp -r "$T/tests/fixtures/demo-physics" "$T/accounts/anr/packs/secret-notes"
# (sed -i.bak works with both GNU sed on Linux and BSD sed on macOS)
sed -i.bak 's/"id": "demo-physics"/"id": "secret-notes"/; s/"title": "Demo Physics"/"title": "Secret Notes"/' "$T/accounts/anr/packs/secret-notes/subject.json" && rm -f "$T/accounts/anr/packs/secret-notes/subject.json.bak"
# the older suites test the classic screens (shell: false: the subject picker at start, no first-time questions); tests/shell.js sets noema-test:newUI for the new frame
echo "if (typeof localStorage !== 'undefined' && localStorage.getItem('noema-test:newUI') !== '1') Object.assign(window.NOEMA_CONFIG, { askSubjectOnStart: true, onboarding: false, shell: false });" >> "$T/config.js"
# no app-shell service worker in the suites (page.route must see every request; tests/pwa.js turns it on for itself); py-module@1
# still registers the same worker for its Python files, as on the website
echo "Object.assign(window.NOEMA_CONFIG, { pwa: false });" >> "$T/config.js"
# interactive activities: a pack with the reference activity, built and unpacked with the skill (tests/activities_app.js imports it)
(cd "$T" && NOEMA_REBUILD_SKILL=1 NOEMA_ACT_PACK="$T/act-pack.json" python3 tests/activities_pack.py)
# h5p@1 in the one-file bundle: that subject (with its H5P item) as the library's demo-physics, its .h5p inline (<= 2 MB) and over a tiny limit (the fallback)
mv "$T/library/subjects/demo-physics" "$T/demo-physics.lib" && cp -r "$T/act-pack.json.subject" "$T/library/subjects/demo-physics"
(cd "$T" && python3 tools/build.py bundle --subjects demo-physics >/dev/null && mv dist/noema-lite.html act-bundle-inline.html \
  && NOEMA_H5P_INLINE_MAX=1000 python3 tools/build.py bundle --subjects demo-physics >/dev/null && mv dist/noema-lite.html act-bundle-big.html)
rm -rf "$T/library/subjects/demo-physics" && mv "$T/demo-physics.lib" "$T/library/subjects/demo-physics"
(cd "$T" && python3 tools/build.py site bundle >/dev/null)

# every suite runs, even after one fails; the failed ones are listed at the end (and the script fails)
set +e; FAILED=()
# ONLY="connector|lib_.*" bash tests/run_e2e.sh: only the suites whose name matches (after the same preparation; names joined by |)
RAN=0
run() { local name="$1"; shift; if [ -n "${ONLY:-}" ] && ! [[ "$name" =~ ^(${ONLY})$ ]]; then return 0; fi; RAN=$((RAN+1)); echo; echo "▶ $name"; "$@"; local rc=$?; [ $rc -eq 0 ] || { echo "✖ $name failed (exit $rc)"; FAILED+=("$name"); }; }
run simexpr node "$ROOT/tests/simexpr.js"          # the expression language of sim-spec@1: the golden outputs bit for bit (docs/INTERACTIVE_SIMEXPR.md)
run circuit node "$ROOT/tests/circuit.js"           # the circuit engine circuit-mna@1: MNA, transients, faults, instruments (docs/INTERACTIVE_CIRCUIT.md)
run circuit2 node "$ROOT/tests/circuit2.js"          # the full circuit physics (docs/INTERACTIVE_CIRCUIT.md §9): AC, lines, op-amp GBW/slew, capacitances, pickup, real meters
for e in thermal pid rf twin; do run "$e" node "$ROOT/tests/$e.js"; done   # the P6 engines thermal@1, pid@1, rf@1, twin@1: the golden checks, the worker (docs/INTERACTIVE_ENGINES.md)
run activities_h5p node "$ROOT/tests/activities_h5p.js"    # the h5p@1 runtime with a stub host: the sandbox, scores, state, languages, hostile libraries, 0 requests (docs/INTERACTIVE_H5P.md)
run activities node "$ROOT/tests/activities.js"        # the loop guard, the protocol checks, the golden rules (html-app, sim-spec, checks), never allow-same-origin
run activities_app node "$ROOT/tests/activities_app.js" "$T" "$T/act-pack.json"   # activities in the app: sandbox, handshake, state, grading, fallbacks, endless loop; sim-spec@1, the checks grader, circuit-mna@1 and the fault bench; py-module@1 over http with the fetched Pyodide; h5p@1 beside the pack and in the one-file bundle; wasm-module@1, the xAPI export, external-embed@1 (card, Settings "Ask again") (BROWSERS=chromium,firefox,webkit)
run activity_author node "$ROOT/tests/activity_author.js" --browser "$T"   # the activity author (P6): #/author in the built site, classic router and the frame (subject ⋮ › Create an activity), the form, preview, .zip, 320 px
run activities_wasm node "$ROOT/tests/activities_wasm.js" --app "$T"   # wasm-module@1 + engine wasm@1: the golden reports, the ABI, no network in the worker, runaway, in the app (docs/INTERACTIVE_WASM.md)
run activities_embed node "$ROOT/tests/activities_embed.js" --browser   # external-embed@1: the allow-list, the URL and item rules, the consent card, a hostile page (a local fake provider; docs/INTERACTIVE_EMBED.md)
run parts node "$ROOT/tests/parts.js"   # several engines in one activity: the plan, the steppers, the co-simulation (docs/INTERACTIVE_LIBRARY.md §1.6)
for f in "$ROOT"/tests/lib_*.js; do run "$(basename "$f" .js)" node "$f"; done   # each engine of the library, the kernel, and the snapshots of every engine's outputs
run enginelib node "$ROOT/tests/enginelib.js"         # the engine library of sim-spec@1: the core, the catalogue, the golden checks of every engine (docs/INTERACTIVE_LIBRARY.md)
run xapi node "$ROOT/tests/xapi.js"            # the xAPI 1.0.3 / cmi5 export (docs/INTERACTIVE_XAPI.md)
run h5p_import python3 "$ROOT/tests/h5p_import.py"   # H5P import into the exercise types (docs/INTERACTIVE_AUTHORING.md §H5P)
run shell node "$ROOT/tests/shell.js" "$T"
run subject_switch node "$ROOT/tests/subject_switch.js" "$T"   # opening another subject reopens that one, even over a slow network
run notices node "$ROOT/tests/notices.js" "$T"   # news (a step ready, a new part…): at most 2 toasts at once, the rest in the 🔔 until cleared
run search_catalog node "$ROOT/tests/search_catalog.js"   # the search catalogue (docs/SEARCH.md)
run search node "$ROOT/tests/search.js" "$T"     # search, stable addresses, collections, the practice round
run e2e node "$ROOT/tests/e2e.js" "$T"
run socratic node "$ROOT/tests/socratic.js" "$T"
run visual node "$ROOT/tests/visual.js" "$T"
run thinking_types node "$ROOT/tests/thinking_types.js" "$T"   # flaw, case, predict, tree, inquiry, debate; how sure, ⚑, source chip, facades
run reports node "$ROOT/tests/reports.js" "$T"         # ⚑ problem reports: the button, the locator, the admins' page, the connector tools (docs/REPORTS.md)
run enginereq node "$ROOT/tests/enginereq.js" "$T"       # ⚙ requests for new engines: #/engines, the form, the answers, the connector tools (docs/INTERACTIVE_LIBRARY.md §3)
run validate_visual python3 "$ROOT/tests/validate_visual.py"
run pack_rules node "$ROOT/tests/pack_rules.js"   # the pack and quality rules: the golden issues, validate.py through the bridge (CONTENT_SPEC.md, docs/PIPELINES.md §4)
run pipelines python3 "$ROOT/tests/pipelines.py"   # the content flows, step by step (tools/pipelines/, docs/PIPELINES.md)
run quality_fixtures python3 "$ROOT/tests/quality_fixtures.py"   # the Q1–Q8 good/bad exercise samples (tools/CONTENT_SPEC.md)
run validate_pack_i18n python3 "$ROOT/tests/validate_pack_i18n.py"   # packs in several languages: subject.i18n, translated chapters (docs/i18n.md §10)
run revise_patch python3 "$ROOT/tests/revise_patch.py"   # patches that rewrite an exercise, card or block in place, keeping its id (CONTENT_SPEC "Additive updates")
run package_sources bash -c 'cd "$1" && python3 tests/package_sources.py' _ "$T"
run connector node "$ROOT/tests/connector.js" "$T"
run pack_update node "$ROOT/tests/pack_update.js" "$T"   # a new version of a subject from Claude reaches the device; a failed download says so
run visual_pack node "$ROOT/tests/visual_pack.js" "$T"
run sharing node "$ROOT/tests/sharing.js" "$T"
run pack_i18n node "$ROOT/tests/pack_i18n.js" "$T"   # packs in several languages: picker, Shelf, Explore, home, translated chapters (docs/i18n.md §10)
run claude_api node "$ROOT/tests/claude_api.js" "$T"
run imglib node "$ROOT/tests/imglib.js" "$ROOT"
run curriculum node "$ROOT/tests/curriculum.js" "$T"
run curriculum_import node "$ROOT/tests/curriculum_import.js" "$T"
run from_sources node "$ROOT/tests/from_sources.js" "$T"   # 📚 From your sources: one subject or a Roadmap (docs/FROM_SOURCES.md)
run vault node "$ROOT/tests/vault.js" "$T"          # 🗄️ the vault: shared study files (docs/VAULT.md)
run social node "$ROOT/tests/social.js" "$T"         # 👥 people, study buddies, conversations, study groups (docs/SOCIAL.md)
run curriculum_i18n node "$ROOT/tests/curriculum_i18n.js"   # a Roadmap in several languages (docs/CURRICULUM.md §10)
run curriculum_app node "$ROOT/tests/curriculum_app.js" "$T"
run curriculum_share node "$ROOT/tests/curriculum_share.js" "$T"
run shelf node "$ROOT/tests/shelf.js" "$T"
run bridge node "$ROOT/tests/bridge.js" "$T"         # 文A language help: a pack's words in the learner's own language (docs/BRIDGE.md)
run sources node "$ROOT/tests/sources.js" "$T"
run sql_policies python3 "$ROOT/tests/sql_policies.py"   # skips itself when no PostgreSQL is installed
# foreign languages (docs/LANGUAGES.md §11): content validator, reference checker, runtime, the course, the UI
run lang_rules python3 "$ROOT/tests/lang_rules.py"
run lang_validate python3 "$ROOT/tests/lang_validate.py"
run lang_facade python3 "$ROOT/tests/lang_facade.py"   # D19: the explanation-field registry, round trip of the master facade, parity, lint
run lang_refcheck python3 "$ROOT/tests/lang_refcheck.py"
run lang_phenomena python3 "$ROOT/tools/lang_phenomena.py" > /dev/null   # the catalogues of phenomena agree with the implementation (D14)
run langcore node "$ROOT/tests/langcore.js"
run lang_courses node "$ROOT/tests/lang_courses.js"
run lang_ui node "$ROOT/tests/lang_ui.js" "$T"
run lang_lessons node "$ROOT/tests/lang_lessons.js" "$T"
run lang_grammar node "$ROOT/tests/lang_grammar.js" "$T"   # the grammar lane (P5): generators, validator, widgets, lane, session
run lang_vocab2 node "$ROOT/tests/lang_vocab2.js" "$T"   # vocabulary depth: the remaining §6.2 types (P5v)
run lang_wordcard node "$ROOT/tests/lang_wordcard.js" "$T"   # R3: the word card shows the word's parameters right under the word (wordParams, Arabic plurals, German nouns and verbs)
run lang_sync node "$ROOT/tests/lang_sync.js" "$T"   # progress across devices (docs/SYNC.md)
run lang_script node "$ROOT/tests/lang_script.js" "$T"   # P4: script modules, keyboards, pinyin input, the 🔤 lane (docs/LANGUAGES.md §4.9, §6.1, §8)
run lang_poly node "$ROOT/tests/lang_poly.js" "$T"   # P6 polyglot layer: parallel sentences, bridges, comparisons, the five polyglot exercises, the compare lane
run lang_prod node "$ROOT/tests/lang_prod.js" "$T"     # production and reading, the tutor (P7; Gemini mocked)
run lang_claude node "$ROOT/tests/lang_claude.js" "$T"   # courses and content through Claude: tasks, checks, connector, app (docs/LANGUAGES.md §10.1)
run lang_speech node "$ROOT/tests/lang_speech.js" "$T"   # P9 listening and speaking: speech synthesis, dictation, shadowing, recognition (speech services mocked)
run lang_walkthrough node "$ROOT/tests/lang_walkthrough.js" "$T"   # QA: the whole language part end to end — three learners, two widths, every route (docs/LANGUAGES.md §13 QA)
echo; echo "▷ lang_frame skipped: still in development (the owner's call)"; : run lang_frame node "$ROOT/tests/lang_frame.js" "$T"   # the language courses inside the new frame: the Languages tab, #/lang/<course>/…, Today, + New language (docs/LANGUAGES.md §8)
run lang_native node "$ROOT/tests/lang_native.js" "$T"   # D19: taught through the learner's native language — the question once, only the native's notes, the explanation facade (docs/language-packs.md)
run lang_home node "$ROOT/tests/lang_home.js" "$T"   # D29: a language's own home, the strip of your languages, other languages under a word
run lang_lanes node "$ROOT/tests/lang_lanes.js" "$T"   # ⫴ parallel lanes: the same subject level across the languages (D13, §9.2)
run lang_select node "$ROOT/tests/lang_select.js" "$T"   # D21: the learner chooses the languages to study — one, several or all; the course, the Languages tab and Today follow
run lang_package node "$ROOT/tests/lang_package.js" "$T"   # a whole language in one prompt: the package, the connector's guide / start / finish, the app on two devices (§10.2)
run i18n node "$ROOT/tests/i18n.js"   # the interface languages: runtime, plurals per CLDR, drafts, pseudo-locales, catalog checks (docs/i18n.md)
run i18n_errors node "$ROOT/tests/i18n_errors.js"   # error-code contract, Auth mapping, account locale, e-mail templates (docs/i18n.md §6)
run i18n_runtime node "$ROOT/tests/i18n_runtime.js" "$T"   # the runtime audit: every surface in the pseudo-locale en-XA — no untranslated interface text; ar-XB right to left (docs/i18n.md §5.3)
run mt node "$ROOT/tests/mt.js" "$T"   # machine translation of shared content: policy, cache, caps, toggle (docs/i18n.md §11; provider mocked)
run weblate_tools python3 "$ROOT/tests/weblate_tools.py"   # Weblate tools: facade round trip, prune_drafts, draft-import and setup plans (no network)
run i18n_rtl node "$ROOT/tests/i18n_rtl.js" "$T"   # RTL (ar-XB): dir switching, mirroring, bidi isolation, LTR islands, self-hosted script fonts
run a11y node "$ROOT/tests/a11y.js" "$T"   # accessibility (axe): start screen, a subject's chapter, settings, a language course's home and a word card, at desktop and 320 px; chapter and course for robot, litF, fruit in light and dark — no serious/critical violation
run pwa node "$ROOT/tests/pwa.js" "$T"   # the installable app: web manifest, one service worker, offline after the first visit, "update ready"

echo
if [ ${#FAILED[@]} -gt 0 ]; then echo "✖ ${#FAILED[@]} suite(s) failed: ${FAILED[*]}"; exit 1; fi
if [ "$RAN" -eq 0 ]; then echo "✖ no suite matched ONLY=${ONLY:-} (join names with |)"; exit 1; fi
echo "✔ every suite passed ($RAN)"
