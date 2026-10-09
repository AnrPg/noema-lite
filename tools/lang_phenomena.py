#!/usr/bin/env python3
"""The catalogues of phenomena (docs/LANGUAGES.md D14, §4.11): coverage report and a check against the implementation.

  python3 tools/lang_phenomena.py [--lang ar] [--gaps] [--json] [--for el,tr,ja]

--for: what is new / familiar in each catalogued language for a learner who knows those languages (D16: computed from the
shared typological profiles in library/languages/_typology, never written from one point of view); without it, a table for
learners of sample backgrounds of every family and type.

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
    out |= set(re.findall(r"\bGEN\.([a-z_]+)\s*=", src))   # generators registered by the later phases (GEN.<type> = ctx => items)
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


def typology():
    d = os.path.join(LANGS, '_typology')
    fs = json.load(open(os.path.join(d, 'features.json'), encoding='utf-8'))['features']
    ls = json.load(open(os.path.join(d, 'languages.json'), encoding='utf-8'))['languages']
    errs = []
    vals = {f['id']: {v['id'] for v in f['values']} for f in fs}
    for l in ls:
        for f in vals:
            v = l['values'].get(f)
            if v is None: errs.append(f'_typology: {l["code"]} has no value for {f}')
            elif v != 'unknown' and v not in vals[f]: errs.append(f'_typology: {l["code"]}.{f} = “{v}” is not a value of the feature')
    return {f['id']: f for f in fs}, {l['code']: l for l in ls}, errs


def for_learner(ph, prof, knows):
    """→ (new, familiar): phenomena whose every tagged value occurs in some known language are familiar."""
    new, fam = [], []
    for p in ph:
        tags = p.get('typology') or []
        if not tags: continue
        if p.get('specific'): (fam if any(k in (p.get('alsoIn') or []) for k in knows) else new).append(p); continue   # tags only approximate it
        ok = all(any(prof[k]['values'].get(t['feature']) == t['value'] for k in knows if k in prof) for t in tags)
        (fam if ok else new).append(p)
    return new, fam


SAMPLE = ['el', 'en', 'ru', 'tr', 'fi', 'ja', 'ko', 'zh', 'vi', 'th', 'ar', 'he', 'hi', 'ta', 'sw', 'yo', 'id', 'ka', 'eu', 'iu', 'qu', 'nv']


def main(a):
    only = a[a.index('--lang') + 1] if '--lang' in a else None
    gens = implemented_generators(); bad = 0; report = {}
    feats, prof, terr = typology()
    for e in terr: print('❌', e)
    bad += len(terr)
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
    cats = {os.path.basename(p)[:-5]: json.load(open(p, encoding='utf-8')).get('phenomena') or [] for p in sorted(glob.glob(os.path.join(LANGS, '_phenomena', '*.json')))}
    if '--for' in a:
        knows = a[a.index('--for') + 1].split(',')
        for L, ph in cats.items():
            if only and L != only: continue
            new, fam = for_learner(ph, prof, [k for k in knows if k != L])
            print(f'\n== {L} for a learner who knows {", ".join(prof[k]["name"] if k in prof else k + " (no profile)" for k in knows)}: {len(new)} new · {len(fam)} familiar')
            for p in new: print(f'   ✨ {p["id"]}: {p.get("title")}')
    elif '--json' not in a:
        print('\n== new phenomena for a learner who knows only … (D16: the same language looks different from every background)')
        print('   ' + 'learner'.ljust(22) + ''.join(L.rjust(6) for L in cats))
        for k in SAMPLE:
            if k not in prof: continue
            row = [f'{len(for_learner(ph, prof, [k])[0]) if k != L else "—"}' for L, ph in cats.items()]
            print('   ' + (prof[k]['name'][:20] + f' ({prof[k]["typology"][:3]})').ljust(22)[:22] + ''.join(x.rjust(6) for x in row))
    if '--json' in a: print(json.dumps(report, ensure_ascii=False, indent=1))
    sys.exit(1 if bad else 0)

if __name__ == '__main__': main(sys.argv[1:])
