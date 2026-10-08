#!/usr/bin/env python3
"""The catalogues of phenomena (docs/LANGUAGES.md D14, §4.11): coverage report and a check against the implementation.

  python3 tools/lang_phenomena.py [--lang ar] [--gaps] [--json]

For every language in library/languages/_phenomena: phenomena by status and area; then the claims of each entry are
checked against what really exists — the word parameters it names are declared in the language's wordFeatures (in
every course with that language), the grammar functions exist, the exercise types are implemented by the runtime —
and every word-level phenomenon is recorded by a declared parameter. --gaps lists what is partial or missing.
Exit 1 when a claim is wrong (the catalogue says the app has something it does not have).
"""
import json, os, re, sys, glob
from collections import Counter, defaultdict
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = os.path.join(ROOT, 'library', 'languages')


def implemented_generators():
    """Exercise types the runtime really makes (engine/langcore.js exercises())."""
    src = open(os.path.join(ROOT, 'engine', 'langcore.js'), encoding='utf-8').read()
    out = set(re.findall(r"gen\.type === '([a-z_]+)'", src))
    for m in re.finditer(r"\[((?:'[a-z_]+',?\s*)+)\]\.includes\(gen\.type\)", src): out |= set(re.findall(r"'([a-z_]+)'", m.group(1)))
    return out | {'learn_batch', 'recognize'}   # the vocabulary lane (engine/lang/30_vocab.js)


SHARED = {'id', 'lemma', 'pos', 'class', 'senses', 'forms', 'formsAlt', 'alts', 'prefix', 'role', 'gender', 'translit', 'pinyin', 'trad', 'plene',
          'variants', 'contrasts', 'ref', 'profile', 'features'}   # the shared lexeme fields (§4.5)


def courses_with(L):
    out = []
    for d in sorted(glob.glob(os.path.join(LANGS, '*', 'course.json'))):
        c = json.load(open(d, encoding='utf-8'))
        if L in (c.get('languages') or []): out.append(os.path.dirname(d))
    return out


def check(L, path, gens):
    d = json.load(open(path, encoding='utf-8')); ph = d.get('phenomena') or []
    errs, warns = [], []
    courses = courses_with(L)
    decl_ids, recorded, functions = set(), set(), set()
    for c in courses:
        lj = json.load(open(os.path.join(c, 'lang', L, 'language.json'), encoding='utf-8'))
        for pos, ds in (lj.get('wordFeatures') or {}).items():
            for x in ds or []:
                decl_ids.add(x.get('id')); ph_ = x.get('phenomenon'); recorded.update(ph_ if isinstance(ph_, list) else [ph_])
        functions |= {os.path.basename(f)[:-5] for f in glob.glob(os.path.join(c, 'core', 'functions', '*.json'))}
    if not courses: warns.append('no course has this language yet')
    for p in ph:
        m = p.get('model') or {}; w = p.get('id')
        for f in m.get('wordFields') or []:
            if courses and f not in decl_ids and f not in SHARED and not f.startswith('profile.'): errs.append(f'{w}: word parameter “{f}” is not declared in wordFeatures')
        for f in m.get('grammar') or []:
            if courses and f not in functions: errs.append(f'{w}: grammar function “{f}” does not exist')
        for g in m.get('exercises') or []:
            if g not in gens: (errs if p.get('status') == 'covered' else warns).append(f'{w}: exercise type “{g}” is not implemented yet')
        if p.get('level') == 'word' and p.get('record') and courses and w not in recorded:
            warns.append(f'{w}: a word-level phenomenon that no word parameter records (wordFeatures … "phenomenon": "{w}")')
    return d, errs, warns


def main(a):
    only = a[a.index('--lang') + 1] if '--lang' in a else None
    gens = implemented_generators(); bad = 0; report = {}
    for path in sorted(glob.glob(os.path.join(LANGS, '_phenomena', '*.json'))):
        L = os.path.basename(path)[:-5]
        if only and L != only: continue
        d, errs, warns = check(L, path, gens); ph = d.get('phenomena') or []
        st = Counter(p.get('status') for p in ph); ar = Counter(p.get('area') for p in ph)
        report[L] = {'phenomena': len(ph), 'status': dict(st), 'errors': errs, 'warnings': warns,
                     'gaps': [{'id': p['id'], 'status': p['status'], 'gap': p.get('gap', '')} for p in ph if p.get('status') != 'covered']}
        if '--json' in a: continue
        print(f'\n== {L} — {d.get("name")}: {len(ph)} phenomena · ✅ {st["covered"]} covered · 🟡 {st["partial"]} partial · ⬜ {st["missing"]} missing')
        print('   by area: ' + ', '.join(f'{k} {v}' for k, v in ar.most_common()))
        print(f'   distinctions {len(d.get("distinctions") or [])} · polysemy {len(d.get("polysemy") or [])} · concept gaps {len(d.get("conceptGaps") or [])}')
        for e in errs: print('   ❌', e)
        for x in warns[:12]: print('   ⚠️ ', x)
        if len(warns) > 12: print(f'   ⚠️  … {len(warns) - 12} more')
        if '--gaps' in a:
            for p in ph:
                if p.get('status') != 'covered': print(f'   {"🟡" if p["status"] == "partial" else "⬜"} {p["id"]}: {p.get("gap", "")}')
        bad += len(errs)
    if '--json' in a: print(json.dumps(report, ensure_ascii=False, indent=1))
    sys.exit(1 if bad else 0)

if __name__ == '__main__': main(sys.argv[1:])
