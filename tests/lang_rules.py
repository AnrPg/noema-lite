#!/usr/bin/env python3
"""docs/LANGUAGE_RULES.md stays the binding short form of the language decisions, and every place agents read points to it.
Usage: python3 tests/lang_rules.py"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT, p)) else ''
fails = 0
def ok(c, m):
    global fails
    print(('  ✅ ' if c else '  ❌ ') + m)
    if not c: fails += 1
spec, rules = rd('docs/LANGUAGES.md'), rd('docs/LANGUAGE_RULES.md')
decisions = sorted(set(re.findall(r'^\| (D\d+) \|', spec, re.M)), key=lambda d: int(d[1:]))
ok(len(decisions) >= 17, f'the decisions of docs/LANGUAGES.md: {", ".join(decisions)}')
missing = [d for d in decisions if not re.search(r'\*\*' + d + r'\*\*', rules)]
ok(rules and not missing, 'docs/LANGUAGE_RULES.md states every decision' + (f' — missing: {", ".join(missing)} (add them, D1–D{len(decisions)})' if missing else ''))
last = decisions[-1] if decisions else 'D?'
ok(f'D1–{last}' in rules, f'docs/LANGUAGE_RULES.md says it covers D1–{last}')
for p in ('CLAUDE.md', 'AGENTS.md', 'README.md', 'skill/noema-pack-builder/SKILL.md', 'tools/lang_sources/AGENT_BRIEF.md', 'docs/LANGUAGES.md'):
    ok('LANGUAGE_RULES.md' in rd(p), f'{p} points to docs/LANGUAGE_RULES.md')
b = rd('tools/build.py')
ok("'noema-pack-builder/references/LANGUAGE_RULES.md'" in b and "docs['languages']" in b, 'the skill zip and the connector carry the rules')
ok("'languages'" in rd('cloud/mcp/server.mjs'), 'the connector serves them (noema_authoring_guide part "languages")')
print(f'\n{fails} FAILED' if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
