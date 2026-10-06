#!/usr/bin/env bash
# Prepares a throw-away copy of the repo with test fixtures, builds it and runs the e2e suite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="${TMPDIR:-/tmp}/noema-e2e"
rm -rf "$T"; mkdir -p "$T"; (cd "$ROOT" && tar --exclude=.git --exclude=dist --exclude=data -cf - .) | (cd "$T" && tar xf -)
cp -r "$T/tests/fixtures/demo-physics" "$T/library/subjects/demo-physics"
mkdir -p "$T/accounts/anr/packs"; cp -r "$T/tests/fixtures/demo-physics" "$T/accounts/anr/packs/secret-notes"
sed -i 's/"id": "demo-physics"/"id": "secret-notes"/; s/"title": "Demo Physics"/"title": "Secret Notes"/' "$T/accounts/anr/packs/secret-notes/subject.json"
(cd "$T" && python3 tools/build.py site bundle >/dev/null)
node "$ROOT/tests/e2e.js" "$T"
node "$ROOT/tests/socratic.js" "$T"
