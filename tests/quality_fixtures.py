#!/usr/bin/env python3
"""The quality fixtures (CONTENT_SPEC.md, Q1–Q8) stay what they claim to be: every bad exercise points to its
source or is trivial, every good one is self-contained and carries lr/think and a real explanation.
The shared checker (tools/pack_rules.json) runs on the same files."""
import json, re, sys
from pathlib import Path

D = Path(__file__).parent / 'fixtures' / 'quality'
POINTER = re.compile(r'\b(Q\d+|Round \d+|page \d+|p\. ?\d+|§ ?\d+|the source|the (?:text|passage|paragraph) above)\b', re.I)
THINK = {'recall', 'explain', 'apply', 'discriminate', 'analyze', 'evaluate', 'create'}
MODES = {'contradiction', 'reverse', 'whatif', 'perturb', 'causal', 'distinguish', 'translate', 'ambiguity', 'feynman', 'combine', 'dialectic'}

def text(e):
    return ' '.join(str(e.get(k, '')) for k in ('q', 'prompt', 'front', 'back', 'explain')) + ' ' + ' '.join(map(str, e.get('options', [])))

errors = []
bad = json.loads((D / 'bad_exercises.json').read_text())['exercises']
good = json.loads((D / 'good_exercises.json').read_text())['exercises']
for e in bad:
    if not e.get('_why'): errors.append(f'bad {e["id"]}: no _why')
for e in good:
    i = e['id']
    if POINTER.search(text(e)): errors.append(f'good {i}: points to the source: {POINTER.search(text(e)).group(0)!r}')
    if not re.fullmatch(r'ch\d\d-l\d\d', e.get('lr', '')): errors.append(f'good {i}: lr missing or malformed')
    if e.get('think') not in THINK: errors.append(f'good {i}: think {e.get("think")!r}')
    if 'mode' in e and e['mode'] not in MODES: errors.append(f'good {i}: mode {e["mode"]!r}')
    if 'cite' in e and not {'src', 'loc'} <= set(e['cite']): errors.append(f'good {i}: cite needs src and loc')
    if len(re.findall(r'[.!?](?:\s|$)', e.get('explain', ''))) < 2: errors.append(f'good {i}: explanation under two sentences')
if sum(bool(POINTER.search(text(e))) for e in bad) < len(bad) // 2:
    errors.append('bad fixtures: fewer than half point to the source — the sample no longer shows the problem')
print('\n'.join(errors) or f'quality fixtures ok ({len(bad)} bad, {len(good)} good)')
sys.exit(1 if errors else 0)
