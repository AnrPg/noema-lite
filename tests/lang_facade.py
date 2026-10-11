#!/usr/bin/env python3
"""tools/lang_facade.py (D19, docs/language-packs.md): the registry covers every text field, the master round-trips
byte for byte (extract → strip → re-apply), parity finds missing / stale / broken / forbidden entries, the lint finds
outside languages, English-anchored explanations, missing required notes and unregistered fields; tasks and merge.
Usage: python3 tests/lang_facade.py"""
import json, os, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import lang_facade as F
MINI = os.path.join(HERE, 'fixtures', 'lang-mini')
LIB_COURSE = os.path.join(ROOT, 'library', 'languages', 'polyglot-semitic-zh-de')
fails = 0
def ok(c, m):
    global fails
    print(('  ✅ ' if c else '  ❌ ') + m)
    if not c: fails += 1

# ---------- the registry ----------
reg = F.Registry()
bad = [(r['id'], f['path']) for r in reg.records for f in r['fields']
       if f['kind'] not in ('gloss', 'prose', 'mixed', 'content', 'author-only') or (f['kind'] in F.TEXT_KINDS and f.get('tier') not in (1, 2, 3))]
ok(not bad and len(reg.records) >= 20, f'registry: {len(reg.records)} records, every field with a kind (and a tier when translated)' + (f' — wrong: {bad}' if bad else ''))
ok(len({(r['prefix'], r['key'], r['at']) for r in reg.records}) == len(reg.records), 'registry: no two records with the same prefix, key and place')

# ---------- spans ----------
raw = '{"a": "x\\"y", "b": ["p", {"c": "q\\u00e9"}, 3, "r"], "d": {"e": ["", "s"]}}'
sp = F.string_spans(raw)
ok([(p, json.loads(raw[a:b])) for p, a, b in sp] == [(('a',), 'x"y'), (('b', 0), 'p'), (('b', 1, 'c'), 'qé'), (('b', 3), 'r'), (('d', 'e', 0), ''), (('d', 'e', 1), 's')],
   'string_spans: every string value with its path (escapes, nested arrays, keys excluded)')

# ---------- the mini course ----------
texts, unreg, dup = F.collect(MINI, reg)
addrs = {t.addr for t in texts}
ok(not unreg and not dup, 'mini course: every string is registered, every address unique' + (f' — {unreg[:3]} {dup[:3]}' if unreg or dup else ''))
want = ['g:de:fn.definite/summary', 'c:veg.carrot/gloss', 'f:fn.definite/title']
ok(all(a in addrs for a in want), 'addresses: ' + ', '.join(want))
ok(any(t.note and t.for_ for t in texts), 'notes carry their `for`')
r_ok, rep = F.roundtrip(MINI)
ok(r_ok, f'mini course round trip: {rep}')

# ---------- the library course (the parity of the English master, §5) ----------
if os.path.exists(os.path.join(LIB_COURSE, 'course.json')):
    r_ok, rep = F.roundtrip(LIB_COURSE)
    ok(r_ok, f'library course round trip (extract en → strip → re-apply = identical files): {rep}')
    lt, lu, ld = F.collect(LIB_COURSE, reg)
    ok(not lu and not ld, f'library course: {len(lt)} texts, every string registered, every address unique' + (f' — {lu[:3]}' if lu else ''))
else:
    print('  ⏭  library course not present')

# ---------- extract / parity / merge / tasks on a copy of the mini course ----------
def copy_course():
    d = tempfile.mkdtemp(prefix='facade-t-'); dst = os.path.join(d, 'mini'); shutil.copytree(MINI, dst); return d, dst

d, c = copy_course()
try:
    ts, files = F.extract(c, 'en')
    man = json.load(open(os.path.join(c, 'facades', 'en', 'facade.json'), encoding='utf-8'))
    ok(man['format'] == 'noema.langfacade/v1' and man['notes'] == ['*'] and sum(v['done'] for v in man['coverage'].values()) == len(ts),
       f'extract en: {len(ts)} texts in {len(files)} files, manifest with coverage')
    try:
        import jsonschema
        sch = json.load(open(os.path.join(ROOT, 'tools', 'schemas', 'noema.langfacade.v1.schema.json'), encoding='utf-8'))
        errs = list(jsonschema.Draft202012Validator({**sch, '$ref': '#/$defs/manifest'}).iter_errors(man))
        for p in files: errs += list(jsonschema.Draft202012Validator({**sch, '$ref': '#/$defs/entries'}).iter_errors(json.load(open(p, encoding='utf-8'))))
        ok(not errs, 'the facade files follow noema.langfacade.v1' + (f': {errs[0].message}' if errs else ''))
    except ImportError:
        print('  ⏭  schema check skipped (no jsonschema)')
    r = F.parity(c, 'en')
    ok(r['ok'] and os.path.exists(os.path.join(c, 'facades', 'en', 'PARITY.md')), 'parity en: complete, PARITY.md written')
    shown = F.for_locale(ts, 'el')
    g = next(t for t in ts if t.addr == 'g:de:fn.definite/summary')
    note_el = next((t for t in ts if t.note and t.for_ == 'el'), None)
    note_ru = next((t for t in ts if t.note and t.for_ == 'ru'), None)
    cell = next((t for t in ts if t.kind == 'mixed' and F.runs(t)), None)
    ans = {g.addr: 'Ελληνική περίληψη ' + ' '.join(F.runs(g)), 'f:fn.definite/title': 'Το οριστικό άρθρο'}
    if note_el: ans[note_el.addr] = 'Σημείωση για Έλληνες: ' + note_el.text
    if note_ru: ans[note_ru.addr] = 'Σημείωση για ρωσόφωνους: ' + note_ru.text
    if cell: ans[cell.addr] = 'χωρίς τις μορφές'
    af = os.path.join(d, 'el.json'); json.dump(ans, open(af, 'w', encoding='utf-8'), ensure_ascii=False)
    n, refused = F.merge(c, 'el', [af])
    ok(n == len(ans) and not refused, f'merge el: {n} texts in, a note for ru too (R1: a facade translates every note) {refused[:1]}')
    r = F.parity(c, 'el')
    probs = {a: st for a, st, _ in r['problems']}
    ok(probs.get(g.addr) is None and probs.get('f:fn.definite/title') is None, 'parity el: translated entries are done')
    ok(not cell or probs.get(cell.addr) == 'broken', 'parity el: a cell that lost its target-language forms is “broken”')
    ok(sum(1 for st in probs.values() if st == 'missing') == len(shown) - len(ans),
       'parity el: every other address is missing (notes for other languages included, R1)')
    ok(not note_ru or F.tier_of(note_ru, 'el') == 3 and (not note_el or F.tier_of(note_el, 'el') == note_el.tier), 'R1: a note for another language is Tier 3 in the el facade, the el note keeps its tier')
    # a changed master text makes its entry stale
    p = os.path.join(c, 'core', 'functions', 'fn.definite.json'); o = json.load(open(p, encoding='utf-8')); o['title'] += ' (new)'
    json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    r = F.parity(c, 'el')
    ok({a: st for a, st, _ in r['problems']}.get('f:fn.definite/title') == 'stale', 'parity el: a changed master text makes the entry stale')
    # tasks
    out = os.path.join(d, 'tasks')
    written, todo = F.make_tasks(c, 'el', {1, 2, 3}, max_chars=2000, out=out)
    items = [it for fn, _, _ in written for it in json.load(open(fn, encoding='utf-8'))['items']]
    task0 = json.load(open(written[0][0], encoding='utf-8')) if written else {}
    sizes = [[len(it['text']) for it in json.load(open(fn, encoding='utf-8'))['items']] for fn, _, _ in written]
    ok(written and all(sum(z) <= 2000 or len(z) == 1 for z in sizes) and sum(map(len, sizes)) == todo, f'task el: {todo} texts in {len(written)} chunks of ≤ 2000 characters')
    ok(any(it.get('for') and not F.shows('el', it['for']) for it in items) or not note_ru, 'task el: the notes for other languages too (R1)')
    ok('**bold**' in task0.get('instructions', '') and '→ ' in task0.get('instructions', ''), 'task el: keep the R2 markup')
    ok('Greek' in task0.get('instructions', '') and 'byte-identical' in task0.get('instructions', '') and task0.get('glossary'), 'task el: instructions in the learner’s terms and the el glossary')
finally:
    shutil.rmtree(d, ignore_errors=True)

# ---------- the lint ----------
def lint_with(change):
    d, c = copy_course()
    try:
        change(c); return F.lint(c)
    finally: shutil.rmtree(d, ignore_errors=True)
def edit(c, rel, fn):
    p = os.path.join(c, rel); o = json.load(open(p, encoding='utf-8')); fn(o)
    json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
def has(fs, cat, needle=''):
    return any(f.cat == cat and needle in f.line() for f in fs)

base = F.lint(MINI)
ok(not [f for f in base if f.sev == 'error'], 'lint mini: no error' + (f' — {[f.line() for f in base if f.sev == "error"][:2]}' if [f for f in base if f.sev == 'error'] else ''))
fs = lint_with(lambda c: edit(c, 'lang/de/grammar/fn.definite.json', lambda o: o.update(summary=o['summary'] + ' As in English.')))
ok(has(fs, 'names', 'g:de:fn.definite/summary'), 'a general text naming English → names')
fs = lint_with(lambda c: edit(c, 'lang/de/grammar/fn.definite.json', lambda o: o.update(newText='hello')))
ok(has(fs, 'registry', 'newText') and any(f.sev == 'error' for f in fs), 'an unregistered text field → registry error')
fs = lint_with(lambda c: edit(c, 'lang/de/grammar/fn.definite.json', lambda o: o.setdefault('traps', []).append('There is no ‘do’ in questions.')))
ok(has(fs, 'anchored', 'g:de:fn.definite/traps'), 'an English-anchored explanation (“no ‘do’”) → anchored')
fs = lint_with(lambda c: edit(c, 'lang/de/grammar/fn.definite.json', lambda o: o['notes'].append({'for': 'type:isolating', 'rel': 'new', 'text': 'Unlike Vietnamese, …'})))
ok(has(fs, 'note-names', 'type / branch / family note names no language'), 'a type note naming a language → note-names')
ok(has(base, 'required', 'type:fusional') and has(base, 'required', 'branch:Semitic'), 'missing required notes (types, branch:Semitic) are reported')
full = [{'for': c_, 'rel': 'same', 'text': 'x'} for c_ in F.required_notes('de')]
fs = lint_with(lambda c: edit(c, 'lang/de/grammar/fn.definite.json', lambda o: o.update(notes=full)))
ok(not has(fs, 'required', 'g:de:fn.definite:') and not has(fs, 'required', 'g:de:fn.definite '), 'a page with every required note passes')

# provenance in etymologies
t = F.Text(addr='x', rec='lexeme', field={}, pat='', tier=2, kind='prose', note=False, for_=None, prov=True, file='', rel='', span=(0, 0), text='', facade=('course', 'de'), L='de', ptr=())
en = F.NameMatcher('en', ['de', 'ar', 'he', 'zh'])
for s, want in [('Borrowed from English tomato.', True), ('From Persian, via Turkish.', True), ('Cognate with English book.', False),
                ('From Old High German buoh. Compare Dutch boek.', False), ('A word of Latin origin.', True)]:
    hits = [n for n in en.find(s) if not F.provenance_ok(s, n[2], n[3])]
    ok((not hits) == want, f'etymology “{s}” → {"provenance (allowed)" if want else "comparison (flagged)"}')
ok(not en.find('Written in Latin letters; Arabic and Hebrew too.'), '“Latin letters” and the course languages are not outside names')
# false positives cut (2026-10-11): provenance in every field, older stages, varieties, cuisine / plant / people, quoted glosses
CL = ['ar', 'he', 'zh', 'de']
def flagged(s, prov=False, own=None):
    return sorted({n[1] for n in en.find(s) if n[0] != own and not F.exempt(s, n[2], n[3], n[1], CL, prov_field=prov, own=own)})
for s, want in [('A word with a Greek past, from Aramaic.', []), ('Borrowed via Persian into Turkish.', []),
                ('In Egyptian Arabic and Levantine the q is a glottal stop.', []), ('Cantonese keeps final -p -t -k.', []),
                ('Swiss German has no Präteritum.', []), ('From Proto-Sino-Tibetan *sjərl.', []), ('Sino-Tibetan languages share it.', []),
                ('Welsh onion and Japanese restaurants.', []), ('A leafy green in Indian, Greek and Arab kitchens.', []),
                ('German Bier → Italian birra → Arabic بِيرَة.', []), ('יְוָנִי “Greek” in short spelling.', []),
                ('Its name is the same Persian word.', []), ('The Latin genus name Chenopodium.', []),
                ('Unlike English, the verb comes first.', ['English']), ('Pronounced as in French.', ['French']),
                ('Persian and Urdu write the same mark.', ['Persian', 'Urdu'])]:
    got = flagged(s)
    ok(got == want, f'lint names “{s}” → {want or "exempt"}' + ('' if got == want else f' (got {got})'))
ok(flagged('From Proto-Sino-Tibetan *b-tsoŋ; cognate with Tibetan btsong.', prov=True) == [], 'etymology: a cognate in an unsupported language (Tibetan) is provenance')
ok(flagged('Cognate with Greek κύκλος and English wheel.', prov=True) == ['English', 'Greek'], 'etymology: a cognate in a supported native is a comparison (→ a note for it)')
ok(flagged('Ottoman Turkish was written in this script.', own='tr') == [], 'a note for tr may name an older stage of Turkish')
fs = lint_with(lambda c: edit(c, 'lang/de/grammar/fn.definite.json', lambda o: o['notes'].append({'for': 'fa', 'rel': 'new', 'text': 'Unlike Vietnamese and Urdu, …'})))
ok(not has(fs, 'note-names', 'Vietnamese'), 'a note for an unsupported language is not linted for names (folded section, R1)')
# R2: the structured Markdown subset
long1 = 'This is a long comparison that squashes several points into one paragraph, ' * 4
ok([c_ for c_, _ in F.structure(long1)] == ['structure'], 'R2: a note > 220 characters in one paragraph → structure warning')
ok(F.structure('The rule.\n\n- point one\n- point two\n→ ich habe gegessen — έχω φάει') == [], 'R2: paragraphs, a list and an example line pass')
ok(F.structure('Short and **clear**, with *ein* cited.') == [], 'R2: one short sentence with bold / italic passes')
ok({c_ for c_, _ in F.structure('## Title\n<b>x</b> [a](http://x) `code`')} == {'markup'}, 'R2: headings, HTML, links, code → markup warning')
ok(F.starred('**bold** and *italic* but *gegesst') == ['*gegesst'], 'R2: Markdown emphasis is not a starred wrong form')
el = F.NameMatcher('el', ['de', 'ar', 'he', 'zh'], allow={'el'})
ok(el.find('Όπως στα αγγλικά') and not el.find('Στα αραβικά και στα ελληνικά'), 'el names: “αγγλικά” found (inflected), Arabic (a course language) and Greek (the locale’s own) not')
print(f'\n{fails} FAILED' if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
