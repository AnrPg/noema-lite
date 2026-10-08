#!/usr/bin/env bash
# Prepares a throw-away copy of the repo with test fixtures, builds it and runs the e2e suite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="${TMPDIR:-/tmp}/noema-e2e"
rm -rf "$T"; mkdir -p "$T"; (cd "$ROOT" && tar --exclude=.git --exclude=dist --exclude=data -cf - .) | (cd "$T" && tar xf -)
cp -r "$T/tests/fixtures/demo-physics" "$T/library/subjects/demo-physics"
mkdir -p "$T/accounts/anr/packs"; cp -r "$T/tests/fixtures/demo-physics" "$T/accounts/anr/packs/secret-notes"
# (sed -i.bak works with both GNU sed on Linux and BSD sed on macOS)
sed -i.bak 's/"id": "demo-physics"/"id": "secret-notes"/; s/"title": "Demo Physics"/"title": "Secret Notes"/' "$T/accounts/anr/packs/secret-notes/subject.json" && rm -f "$T/accounts/anr/packs/secret-notes/subject.json.bak"
(cd "$T" && python3 tools/build.py site bundle >/dev/null)
node "$ROOT/tests/e2e.js" "$T"
node "$ROOT/tests/socratic.js" "$T"
node "$ROOT/tests/visual.js" "$T"
python3 "$ROOT/tests/validate_visual.py"
(cd "$T" && python3 tests/package_sources.py)
node "$ROOT/tests/connector.js" "$T"
node "$ROOT/tests/visual_pack.js" "$T"
node "$ROOT/tests/sharing.js" "$T"
node "$ROOT/tests/claude_api.js" "$T"
node "$ROOT/tests/imglib.js" "$ROOT"
node "$ROOT/tests/curriculum.js" "$T"
node "$ROOT/tests/curriculum_import.js" "$T"
node "$ROOT/tests/curriculum_app.js" "$T"
node "$ROOT/tests/curriculum_share.js" "$T"
node "$ROOT/tests/sources.js" "$T"
python3 "$ROOT/tests/sql_policies.py"   # skips itself when no PostgreSQL is installed
