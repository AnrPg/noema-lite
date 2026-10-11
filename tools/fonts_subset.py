#!/usr/bin/env python3
"""Self-hosted Noto fonts for the non-Latin scripts (docs/i18n.md §2 Fonts) → fonts/<slug>/*.woff2 + fonts/scripts.css.

  python3 tools/fonts_subset.py [--src DIR] [--common]

* Downloads the variable source fonts and their OFL licences from the google/fonts repository (cached in --src,
  default $TMPDIR/noema-fonts-src; never committed), keeps weights 400–700 (width 100), drops hinting.
* Arabic (Noto Sans Arabic for the UI, Noto Naskh Arabic for course text), Hebrew and Devanagari: the whole script.
* CJK (Noto Sans SC / TC / JP): only the characters the app shows — the UI catalogs of the locale
  (i18n/**/<zh-Hans|zh-Hant|ja>.arb, drafts included), for SC also the language courses (library/languages/**: their
  Chinese is simplified), plus CJK punctuation (and kana for JP). --common adds the level-1 characters of GB 2312 / Big5 / JIS X 0208 (≈ +3–5 MB).
  Re-run after a CJK catalog or a course changed.
* Each family is cut into slices with disjoint `unicode-range`s (CJK: ≤ 1200 characters a slice), so the browser
  downloads a file only when the page shows one of its characters; `font-display: swap` everywhere.
Needs fonttools and brotli (pip install --break-system-packages fonttools brotli).
"""
import os, sys, glob, json, re, tempfile, urllib.request, shutil
from fontTools.ttLib import TTFont
from fontTools import subset as ftsubset
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'fonts')
RAW = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
args = sys.argv[1:]
SRC = args[args.index('--src') + 1] if '--src' in args else os.path.join(tempfile.gettempdir(), 'noema-fonts-src')
COMMON = '--common' in args
SLICE = 1200

R = lambda *rs: set(c for a, b in rs for c in range(a, b + 1))
CJK_PUNCT = R((0x3000, 0x303F), (0xFF00, 0xFFEF), (0x30FB, 0x30FC))
KANA = R((0x3040, 0x30FF), (0x31F0, 0x31FF))
FAMILIES = [   # family (as the CSS names it), slug, google/fonts dir, file, what to keep, catalog locales
    ('Noto Sans Arabic', 'noto-sans-arabic', 'notosansarabic', 'NotoSansArabic[wdth,wght].ttf',
     R((0x0600, 0x06FF), (0x0750, 0x077F), (0x0870, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFE)), None),
    ('Noto Naskh Arabic', 'noto-naskh-arabic', 'notonaskharabic', 'NotoNaskhArabic[wght].ttf',
     R((0x0600, 0x06FF), (0x0750, 0x077F), (0x0870, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFE)), None),
    ('Noto Sans Hebrew', 'noto-sans-hebrew', 'notosanshebrew', 'NotoSansHebrew[wdth,wght].ttf',
     R((0x0590, 0x05FF), (0xFB1D, 0xFB4F)), None),
    ('Noto Sans Devanagari', 'noto-sans-devanagari', 'notosansdevanagari', 'NotoSansDevanagari[wdth,wght].ttf',
     R((0x0900, 0x097F), (0xA8E0, 0xA8FF), (0x1CD0, 0x1CFF), (0x20B9, 0x20B9)), None),
    ('Noto Sans SC', 'noto-sans-sc', 'notosanssc', 'NotoSansSC[wght].ttf', 'cjk', ('zh-Hans', 'zh')),
    ('Noto Sans TC', 'noto-sans-tc', 'notosanstc', 'NotoSansTC[wght].ttf', 'cjk', ('zh-Hant',)),
    ('Noto Sans JP', 'noto-sans-jp', 'notosansjp', 'NotoSansJP[wght].ttf', 'cjk', ('ja',)),
]
is_han = lambda o: 0x3400 <= o <= 0x4DBF or 0x4E00 <= o <= 0x9FFF or 0xF900 <= o <= 0xFAFF or 0x20000 <= o <= 0x3134F

def fetch(url, dst):
    if os.path.exists(dst): return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True); print('↓', url)
    with urllib.request.urlopen(url) as r, open(dst + '.part', 'wb') as f: shutil.copyfileobj(r, f)
    os.replace(dst + '.part', dst); return dst

def chars_in(paths):
    out = set()
    for p in paths:
        try: s = open(p, encoding='utf-8').read()
        except (OSError, UnicodeDecodeError): continue
        out |= {ord(c) for c in s if is_han(ord(c)) or 0x3040 <= ord(c) <= 0x30FF}
    return out

def common(enc, rows, cols):
    out = set()
    for a in rows:
        for b in cols:
            try: out.add(ord(bytes([a, b]).decode(enc)))
            except (UnicodeDecodeError, TypeError): pass
    return {c for c in out if is_han(c)}
COMMON_SETS = {   # level-1 (most used) characters of the national standards
    'noto-sans-sc': lambda: common('gb2312', range(0xB0, 0xD8), range(0xA1, 0xFF)),
    'noto-sans-tc': lambda: common('big5', range(0xA4, 0xC7), list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF))),
    'noto-sans-jp': lambda: common('euc_jp', range(0xB0, 0xD0), range(0xA1, 0xFF)),
}

def ranges(cps):
    cps, out, i = sorted(cps), [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1: j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}'); i = j + 1
    return ', '.join(out)

def make(src, cps, dst):
    f = TTFont(src)
    o = ftsubset.Options(); o.layout_features = ['*']; o.hinting = False; o.notdef_outline = True; o.name_IDs = ['*']
    o.flavor = 'woff2'; o.drop_tables += ['DSIG']
    s = ftsubset.Subsetter(o); s.populate(unicodes=cps); s.subset(f)
    axes = {a.axisTag: a for a in f['fvar'].axes} if 'fvar' in f else {}
    lim = {}
    if 'wght' in axes: lim['wght'] = (max(400, axes['wght'].minValue), min(700, axes['wght'].maxValue))
    if 'wdth' in axes: lim['wdth'] = 100
    if lim: f = instancer.instantiateVariableFont(f, lim)
    f.flavor = 'woff2'; f.recalcTimestamp = False; os.makedirs(os.path.dirname(dst), exist_ok=True); f.save(dst)   # reproducible files
    return os.path.getsize(dst)

def main():
    courses = [p for p in glob.glob(os.path.join(ROOT, 'library', 'languages', '**', '*'), recursive=True) if os.path.isfile(p)]
    css = ['/* Self-hosted Noto fonts for the non-Latin scripts — GENERATED by tools/fonts_subset.py. Do not edit.',
           ' * Loaded only when a page shows a character of a slice (unicode-range). Licences: <slug>/LICENSE.txt (OFL-1.1). */', '']
    meta, total = {}, 0
    for fam, slug, gdir, fname, keep, locs in FAMILIES:
        src = fetch(RAW + gdir + '/' + urllib.request.quote(fname), os.path.join(SRC, fname))
        lic = fetch(RAW + gdir + '/OFL.txt', os.path.join(SRC, gdir + '-OFL.txt'))
        cmap = set(TTFont(src, lazy=True).getBestCmap())
        if keep == 'cjk':
            cat = [p for l in locs for p in glob.glob(os.path.join(ROOT, 'i18n', '**', l + '.arb'), recursive=True)]
            want = chars_in(cat) | (chars_in(courses) if slug == 'noto-sans-sc' else set()) | CJK_PUNCT | (KANA if slug == 'noto-sans-jp' else set())
            if COMMON: want |= COMMON_SETS[slug]()
        else: want = keep
        cps = sorted(want & cmap)
        if keep == 'cjk':   # the punctuation (and kana) first, then the characters in code-point order
            head = [c for c in cps if not is_han(c)]; han = [c for c in cps if is_han(c)]
            slices = [head + han[:SLICE - len(head)]] + [han[i:i + SLICE] for i in range(SLICE - len(head), len(han), SLICE)]
        else: slices = [cps]
        d = os.path.join(FONTS, slug)
        if os.path.isdir(d): shutil.rmtree(d)
        os.makedirs(d); shutil.copy(lic, os.path.join(d, 'LICENSE.txt'))
        files = []
        for i, sl in enumerate(slices):
            name = 'var.woff2' if len(slices) == 1 else f'{i}-var.woff2'
            n = make(src, sl, os.path.join(d, name)); total += n; files.append({'file': name, 'chars': len(sl), 'bytes': n})
            css += ['@font-face {', f"  font-family: '{fam}';", '  font-style: normal;', '  font-weight: 400 700;', '  font-display: swap;',
                    f'  src: url(./{slug}/{name}) format(\'woff2\');', f'  unicode-range: {ranges(sl)};', '}']
        meta[fam] = {'slug': slug, 'license': 'OFL-1.1', 'source': f'https://github.com/google/fonts/tree/main/ofl/{gdir}', 'weights': '400–700 (variable)', 'files': files}
        print(f'{fam:22} {sum(f["chars"] for f in files):6} chars {len(files):2} file(s) {sum(f["bytes"] for f in files) / 1024:8.1f} KB')
    open(os.path.join(FONTS, 'scripts.css'), 'w', encoding='utf-8').write('\n'.join(css) + '\n')
    json.dump(meta, open(os.path.join(FONTS, 'scripts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'total {total / 1024:.1f} KB → fonts/scripts.css')

if __name__ == '__main__': main()
