#!/usr/bin/env python3
"""Import simple H5P content into noema-lite's own exercise types (docs/activities-dev/h5p_import.md, docs/adr/001 D12).

Usage: h5p_import.py ITEM.h5p [ITEM2.h5p …] --out DIR [--chapter ch07] [--title "…"] [--src SOURCE_ID]
                     [--summary-order] [--report report.json]
  Writes DIR/chapters/<chapter>.json (one section per package; tools/validate.py accepts it), the package's pictures
  to DIR/media/ and their entries to DIR/media/media.json (merged with what is there). Prints what was imported and
  what was not (an unsupported content type is reported, never a crash). Exit 0 when something was imported, 2 if not.

What becomes what (the mapping table is in the doc):
  H5P.MultiChoice → mcq (multi when several answers are right; img_reveal when it shows a picture) · H5P.TrueFalse → tf
  H5P.Blanks → cloze (typed) · H5P.DragText → cloze with a word bank, or bucket when every line sorts one word into a few
  groups · H5P.MarkTheWords → spotbug (one word per line: tap every marked word) · H5P.DragQuestion (text to zones) →
  img_drag (on its background picture), match, bucket or one mcq per draggable · H5P.SingleChoiceSet → mcq each ·
  H5P.QuestionSet / H5P.Column → their questions · H5P.Summary → mcq per set (+ order with --summary-order) ·
  H5P.Dialogcards → flashcards.
Stdlib only (zipfile, json, html.parser). Nothing in the package is run; only content/content.json, h5p.json and the
pictures that the content names are read."""
import hashlib, html, json, os, re, struct, sys, zipfile
from html.parser import HTMLParser

MAX_JSON = 8 * 1024 * 1024        # content.json / h5p.json
MAX_IMAGE = 5 * 1024 * 1024       # one picture
IMAGE_EXT = {'.png': '.png', '.jpg': '.jpg', '.jpeg': '.jpg', '.webp': '.webp'}   # svg from a package is not taken (it may carry script)
SUPPORTED = ('H5P.MultiChoice', 'H5P.TrueFalse', 'H5P.Blanks', 'H5P.DragText', 'H5P.MarkTheWords', 'H5P.DragQuestion',
             'H5P.SingleChoiceSet', 'H5P.QuestionSet', 'H5P.Column', 'H5P.Summary', 'H5P.Dialogcards')
CONTAINERS = ('H5P.QuestionSet', 'H5P.Column')
LICENSES = {'U': 'unknown (undisclosed in the H5P package)', 'C': 'Copyright (all rights reserved)', 'PD': 'Public domain',
            'CC0 1.0': 'CC0', 'ODC PDDL': 'ODC PDDL', 'GNU GPL': 'GPL', 'CC PDM': 'Public domain (CC PDM)'}

class Unsupported(Exception): pass

# ---------------- H5P HTML → the app's inline text format (CONTENT_SPEC.md: **bold**, *italic*, `code`, \n) ----------------
class _Text(HTMLParser):
    MARK = {'strong': '**', 'b': '**', 'em': '*', 'i': '*', 'code': '`'}
    BREAK = {'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'blockquote', 'pre', 'section', 'article'}
    SKIP = {'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'video', 'audio'}
    def __init__(self):
        super().__init__(convert_charrefs=True); self.out = []; self.stack = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP: self.skip += 1; return
        if self.skip: return
        if tag == 'br': self.out.append('\n')
        elif tag in self.BREAK: self.out.append('\n')
        if tag in self.MARK: self.stack.append((tag, len(self.out))); self.out.append(self.MARK[tag])
    def handle_startendtag(self, tag, attrs):
        if tag == 'br' and not self.skip: self.out.append('\n')
    def handle_endtag(self, tag):
        if tag in self.SKIP: self.skip = max(0, self.skip - 1); return
        if self.skip: return
        if tag in self.MARK:
            for k in range(len(self.stack) - 1, -1, -1):
                if self.stack[k][0] == tag:
                    _, at = self.stack.pop(k); inner = ''.join(self.out[at + 1:]); self.out[at] = ''
                    if inner.strip() and '\n' not in inner:   # empty or over a line break: plain text
                        # the marks must touch the words: "** a **" is not bold in the inline format
                        lead, trail = inner[:len(inner) - len(inner.lstrip())], inner[len(inner.rstrip()):]
                        self.out[at + 1:] = [lead + self.MARK[tag] + inner.strip() + self.MARK[tag] + trail]
                    break
        if tag in self.BREAK: self.out.append('\n')
    def handle_data(self, d):
        if self.skip: return
        # characters the inline format reads as marks: a literal * or ` becomes a look-alike; [[ ]] would open a blank
        self.out.append(d.replace('*', '∗').replace('`', 'ʹ').replace('[[', '[ [').replace(']]', '] ]'))

def text(h, oneline=False):
    """H5P rich text (HTML) → the inline text format: tags stripped, entities decoded, bold / italic / code kept as marks."""
    if h is None: return ''
    h = str(h)
    if '<' not in h: h = html.escape(h, quote=False).replace('\n', '<br>')   # plain text fields keep their line breaks
    p = _Text(); p.feed(h); p.close()
    t = ''.join(p.out).replace('\xa0', ' ')
    lines = [re.sub(r'[ \t\r\f\v]+', ' ', ln).strip() for ln in t.split('\n')]
    t = '\n'.join(ln for ln in lines if ln)
    return re.sub(r'\s+', ' ', t).strip() if oneline else t

def plain(h):
    """Text without any marks (labels, options in places that show no format)."""
    return re.sub(r'\*\*|[*`]', '', text(h, True))

def slug(s, n=32):
    s = re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')
    return (s[:n].strip('-') or 'h5p')

def image_size(b):
    """(w, h) of png / jpeg / webp bytes, or None."""
    try:
        if b[:8] == b'\x89PNG\r\n\x1a\n': return struct.unpack('>II', b[16:24])
        if b[:2] == b'\xff\xd8':
            i = 2
            while i < len(b) - 9:
                if b[i] != 0xFF: i += 1; continue
                mk = b[i + 1]
                if mk in (0xC0, 0xC1, 0xC2): hh, ww = struct.unpack('>HH', b[i + 5:i + 9]); return ww, hh
                i += 2 + struct.unpack('>H', b[i + 2:i + 4])[0]
        if b[:4] == b'RIFF' and b[8:12] == b'WEBP':
            if b[12:16] == b'VP8X': return 1 + int.from_bytes(b[24:27], 'little'), 1 + int.from_bytes(b[27:30], 'little')
            if b[12:16] == b'VP8L': v = int.from_bytes(b[21:25], 'little'); return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
            if b[12:16] == b'VP8 ': w, hh = struct.unpack('<HH', b[26:30]); return w & 0x3FFF, hh & 0x3FFF
    except Exception: return None
    return None

# ---------------- one package ----------------
class Package:
    def __init__(self, path, media_out):
        self.path, self.name = path, os.path.basename(path)
        try: self.z = zipfile.ZipFile(path)
        except (zipfile.BadZipFile, OSError) as e: raise Unsupported(f'not an H5P package (not a zip file: {e})')
        self.meta = self.read_json('h5p.json')
        self.content = self.read_json('content/content.json')
        self.title = plain(self.meta.get('title')) or os.path.splitext(self.name)[0]
        self.library = str(self.meta.get('mainLibrary') or '')
        self.media_out = media_out   # {id: (item, bytes)} shared by every package of the chapter
        self.notes = []
        authors = [a.get('name') for a in self.meta.get('authors') or [] if isinstance(a, dict) and a.get('name')]
        lic = str(self.meta.get('license') or 'U'); ver = self.meta.get('licenseVersion')
        self.license = LICENSES.get(lic, lic + (' ' + ver if ver and ver not in lic else ''))
        self.authors = ', '.join(authors)
    def read_json(self, name):
        try: info = self.z.getinfo(name)
        except KeyError: raise Unsupported(f'{name} is missing')
        if info.file_size > MAX_JSON: raise Unsupported(f'{name} is too big ({info.file_size} bytes)')
        try: return json.loads(self.z.read(name).decode('utf-8-sig'))
        except (ValueError, UnicodeDecodeError) as e: raise Unsupported(f'{name} is not valid JSON ({e})')
    def cite(self, src):
        c = {'title': self.title, 'license': self.license, 'h5p': self.name}
        if self.authors: c['author'] = self.authors
        if src: c['src'] = src
        return c
    def image(self, img, alt=None):
        """An H5P image ({path, mime, width, height}) → the id of a pack picture (media/media.json), or None (with a note)."""
        if not isinstance(img, dict) or not isinstance(img.get('path'), str): return None
        p = img['path'].split('#')[0]
        if re.match(r'^[a-z]+:', p, re.I): self.notes.append(f'a picture from outside the package ({p[:60]}) is left out'); return None
        p = os.path.normpath(p).replace('\\', '/')
        if p.startswith('..') or p.startswith('/') or not re.fullmatch(r'[A-Za-z0-9_./ -]+', p): self.notes.append(f'a picture path is refused: {p[:60]}'); return None
        ext = IMAGE_EXT.get(os.path.splitext(p)[1].lower())
        if not ext: self.notes.append(f'picture {p}: file type not supported (png, jpg, webp only)'); return None
        try: info = self.z.getinfo('content/' + p)
        except KeyError: self.notes.append(f'picture {p} is not in the package'); return None
        if info.file_size > MAX_IMAGE: self.notes.append(f'picture {p} is too big ({info.file_size // 1024} KB)'); return None
        b = self.z.read(info)
        wh = image_size(b) or ((img.get('width'), img.get('height')) if img.get('width') and img.get('height') else None)
        if not wh: self.notes.append(f'picture {p}: its size cannot be read'); return None
        mid = slug(self.title, 24) + '-' + hashlib.sha1(b).hexdigest()[:8]
        alt = plain(alt) or f'Picture of the H5P item “{self.title}”'
        item = {'id': mid, 'file': mid + ext, 'origin': 'source', 'alt': alt, 'credit': self.authors or f'H5P item “{self.title}”',
                'license': self.license, 'w': wh[0], 'h': wh[1], 'h5p': {'package': self.name, 'path': p}}
        if max(wh) < 800: item['lowResOk'] = 'imported from an H5P package at the size its author made it'
        self.media_out.setdefault(mid, (item, b))
        return mid

# ---------------- the content types ----------------
def _ex(type_, q, explain, **kw):
    e = {'type': type_, 'difficulty': kw.pop('difficulty', 2), 'tags': kw.pop('tags', ['concept']), 'quick': kw.pop('quick', False), 'q': q}
    e.update(kw); e['explain'] = explain
    return e

def _media_image(pkg, params):
    """The picture of a question's "media" field (H5P.Image), or None; a video / audio is noted (the exercise keeps the text)."""
    m = (params or {}).get('media')
    if isinstance(m, dict) and isinstance(m.get('type'), dict): m = m['type']   # newer versions: media.type = {library, params}
    if not isinstance(m, dict) or not m.get('library'): return None
    lib = str(m['library']).split(' ')[0]; mp = m.get('params') or {}
    if lib == 'H5P.Image': return pkg.image(mp.get('file'), mp.get('alt') or mp.get('title'))
    pkg.notes.append(f'the question shows a {lib} — left out: check that its text stands alone')
    return None

def mcq_from(pkg, q, options, correct, why=None, tips=None, media=None, quick=False):
    """An mcq (or img_reveal over the question's picture) from options and the indexes that are right."""
    if len(options) < 2: raise Unsupported('a choice question needs at least 2 options')
    if len(set(options)) != len(options): raise Unsupported('two options have the same text')
    if not correct: raise Unsupported('no option is marked correct')
    right = [options[i] for i in correct]
    explain = ('The right answer: ' if len(right) == 1 else 'The right answers: ') + '; '.join(right) + '.'
    if tips: explain += '\n' + '\n'.join('Tip: ' + t for t in tips)
    kw = {'options': options, 'answer': correct[0] if len(correct) == 1 else correct}
    if len(correct) > 1: kw['multi'] = True
    if why and any(why):
        kw['why'] = [w or ('This one is right.' if i in correct else 'This one is not right.') for i, w in enumerate(why)]
    if media: return _ex('img_reveal', q, explain, media=media, grid=[2, 2], tags=['concept'], **kw)
    return _ex('mcq', q, explain, quick=quick and len(correct) == 1, think='recall', **kw)

def h5p_multichoice(pkg, p):
    q = text(p.get('question')) or pkg.title
    answers = [a for a in p.get('answers') or [] if isinstance(a, dict)]
    options = [text(a.get('text'), True) for a in answers]
    correct = [i for i, a in enumerate(answers) if a.get('correct') is True or a.get('correct') == 'true']
    why, tips = [], []
    for a in answers:
        tf = a.get('tipsAndFeedback') or {}
        ch, nch = text(tf.get('chosenFeedback'), True), text(tf.get('notChosenFeedback'), True)
        why.append(ch or nch)
        if text(tf.get('tip'), True): tips.append(text(tf.get('tip'), True))
    if (p.get('behaviour') or {}).get('type') == 'single' and len(correct) > 1: pkg.notes.append('single-answer question with several right options: imported as multiple answer')
    return [mcq_from(pkg, q, options, correct, why, tips, _media_image(pkg, p), quick=True)], [], []

def h5p_truefalse(pkg, p):
    q = text(p.get('question')) or pkg.title
    c = p.get('correct'); ans = c is True or str(c).lower() == 'true'
    b = p.get('behaviour') or {}
    fb = text(b.get('feedbackOnCorrect'), True)
    explain = fb or ('The statement is true.' if ans else 'The statement is false.')
    wrong = text(b.get('feedbackOnWrong'), True)
    if wrong and wrong != fb: explain += '\nIf you answered ' + ('false' if ans else 'true') + ': ' + wrong
    media = _media_image(pkg, p)
    if media:
        l10n = p.get('l10n') or {}
        opts = [plain(l10n.get('trueText')) or 'True', plain(l10n.get('falseText')) or 'False']
        return [_ex('img_reveal', q, explain, media=media, grid=[2, 2], options=opts, answer=0 if ans else 1)], [], []
    return [_ex('tf', q, explain, quick=True, difficulty=1, think='recall', answer=ans)], [], []

_BLANK = re.compile(r'\*([^*\n]+?)\*')
def _blank_parts(raw):
    """'answer/alt:tip\\+right\\-wrong' → (alternatives, tip, feedback)"""
    s = raw; fb = []
    for sep in ('\\+', '\\-'):
        if sep in s: s, f = s.split(sep, 1)[0], s.split(sep, 1)[1]; fb.append(plain(f.split('\\-')[0]))
    ans, tip = (s.split(':', 1) + [''])[:2]
    alts = [re.sub(r'[|\[\]]', '', plain(a)).strip() for a in ans.split('/')]
    return [a for a in alts if a], plain(tip), [f for f in fb if f]

def _with_blanks(src, fmt_blank):
    """Rich text with *blanks* → (inline text with the blanks put back by fmt_blank, [parts of each blank])."""
    parts, out = [], []
    def keep(m):
        parts.append(_blank_parts(m.group(1))); return f'\u0001{len(parts) - 1}\u0001'
    marked = _BLANK.sub(keep, str(src or ''))
    t = text(marked)
    t = re.sub('(\\*\\*|\\*|`)(\u0001\\d+\u0001)\\1', r'\2', t)   # a blank cannot be bold: the marks would show as stars around it
    t = re.sub('\u0001(\\d+)\u0001', lambda m: fmt_blank(int(m.group(1)), parts[int(m.group(1))]), t)
    return t, parts

def h5p_blanks(pkg, p):
    qs = [x for x in p.get('questions') or [] if isinstance(x, str)]
    lines, tips, answers = [], [], []
    for x in qs:
        def put(i, part):
            alts, tip, _ = part
            if not alts: raise Unsupported('an empty blank')
            answers.append(alts[0]); tips.append(tip)
            return '[[' + '|'.join(alts) + ']]'
        t, _ = _with_blanks(x, put)
        if t: lines.append(t)
    if not answers: raise Unsupported('no *blank* in the text')
    if (p.get('behaviour') or {}).get('caseSensitive'): pkg.notes.append('the H5P item is case-sensitive; noema-lite compares blanks case-insensitively')
    explain = 'The answers: ' + '; '.join(answers) + '.'
    if any(tips): explain += '\n' + '\n'.join(f'Tip {i + 1}: {t}' for i, t in enumerate(tips) if t)
    q = text(p.get('text')) or 'Fill in the blanks.'
    return [_ex('cloze', q, explain, think='recall', text='\n'.join(lines))], [], []

_SEP = re.compile(r'^[\s:–—\-→=>|,.;]+|[\s:–—\-→=>|,;]+$')
def h5p_dragtext(pkg, p):
    src = str(p.get('textField') or '')
    q = text(p.get('taskDescription')) or 'Drag the words into the right places.'
    distractors = [a[0] for a, _, _ in (_blank_parts(m) for m in _BLANK.findall(str(p.get('distractors') or ''))) if a]
    raw_lines = [ln for ln in re.split(r'\n|<br\s*/?>|</p>|</div>', src) if _BLANK.search(ln) or text(ln)]
    # bucket: every line sorts ONE word into a few groups (2–4 distinct answers, some repeated, no distractors)
    per_line = [len(_BLANK.findall(ln)) for ln in raw_lines if text(_BLANK.sub('', ln)) or _BLANK.search(ln)]
    answers_all = [_blank_parts(m)[0][0] for m in _BLANK.findall(src) if _blank_parts(m)[0]]
    groups = sorted(set(answers_all), key=answers_all.index)
    if (len(raw_lines) >= 3 and all(c == 1 for c in per_line) and 2 <= len(groups) <= 4 and len(groups) < len(answers_all) and not distractors):
        items = []
        for ln in raw_lines:
            alts = _blank_parts(_BLANK.search(ln).group(1))[0]
            it = _SEP.sub('', plain(_BLANK.sub(' ', ln)))
            if not it: items = None; break
            items.append({'text': it, 'bucket': groups.index(alts[0])})
        if items and len({i['text'] for i in items}) == len(items):
            explain = '\n'.join(f'**{g}**: ' + ', '.join(i['text'] for i in items if i['bucket'] == k) for k, g in enumerate(groups))
            return [_ex('bucket', q, explain, think='discriminate', tags=['compare'], buckets=groups, items=items)], [], []
    answers, tips = [], []
    def put(i, part):
        alts, tip, _ = part
        if not alts: raise Unsupported('an empty blank')
        answers.append(alts[0]); tips.append(tip); return '[[' + alts[0] + ']]'
    t, _ = _with_blanks(src, put)
    if not answers: raise Unsupported('no *word* to drag in the text')
    explain = 'The words: ' + '; '.join(answers) + '.'
    if any(tips): explain += '\n' + '\n'.join(f'Tip {i + 1}: {x}' for i, x in enumerate(tips) if x)
    bank = [d for d in dict.fromkeys(distractors) if d.lower() not in {a.lower() for a in answers}]
    return [_ex('cloze', q, explain, think='recall', text=t, bank=bank)], [], []

def h5p_markthewords(pkg, p):
    src = str(p.get('textField') or '')
    q = text(p.get('taskDescription')) or 'Tap every marked word.'
    marked = []
    def keep(m): marked.append(plain(m.group(1))); return f' \u0001{len(marked) - 1}\u0001 '
    t = text(_BLANK.sub(keep, src), True)
    lines, bugs = [], []
    for tok in t.split(' '):
        if not tok: continue
        m = re.fullmatch('(.*?)\u0001(\\d+)\u0001(.*)', tok)
        if m:
            bugs.append(len(lines)); lines.append(m.group(1) + marked[int(m.group(2))] + m.group(3))
        else:
            if '\u0001' in tok: tok = re.sub('\u0001(\\d+)\u0001', lambda mm: marked[int(mm.group(1))], tok)
            # punctuation alone sticks to the word before it
            if lines and re.fullmatch(r'[.,;:!?)»”"\'’]+', tok): lines[-1] += tok
            else: lines.append(tok)
    if not bugs: raise Unsupported('no *marked* word in the text')
    if len(lines) < 3: raise Unsupported('the text is too short (fewer than 3 words)')
    if len(lines) > 60: pkg.notes.append(f'MarkTheWords text of {len(lines)} words: one per line is long; consider splitting it')
    fix = ' '.join(f'**{w}**' if i in bugs else w for i, w in enumerate(lines))
    explain = 'The words to mark: ' + ', '.join(lines[i] for i in bugs) + '.'
    return [_ex('spotbug', q, explain, think='discriminate', lang='text', lines=lines, bugs=bugs, fix=fix)], [], []

def h5p_dragquestion(pkg, p):
    qp = p.get('question') or {}; task = qp.get('task') or {}; st = qp.get('settings') or {}
    els = [e for e in task.get('elements') or [] if isinstance(e, dict)]
    zones = [z for z in task.get('dropZones') or [] if isinstance(z, dict)]
    if not zones: raise Unsupported('no drop zones')
    labels = [plain(z.get('label')) for z in zones]
    words, stem = {}, []
    for i, e in enumerate(els):
        lib = str((e.get('type') or {}).get('library') or '').split(' ')[0]; ep = (e.get('type') or {}).get('params') or {}
        draggable = bool(e.get('dropZones'))
        if lib in ('H5P.AdvancedText', 'H5P.Text'):
            if draggable: words[i] = plain(ep.get('text'))
            elif plain(ep.get('text')): stem.append(text(ep.get('text')))
        elif draggable: raise Unsupported(f'a draggable {lib} (only text draggables are imported)')
    zone_of = {i: [k for k, z in enumerate(zones) if str(i) in [str(x) for x in z.get('correctElements') or []]] for i in words}
    multi = [words[i] for i, zs in zone_of.items() if len(zs) > 1]
    if multi: pkg.notes.append('draggables right in several zones are left out: ' + ', '.join(multi))
    placed = {i: zs[0] for i, zs in zone_of.items() if len(zs) == 1}
    distractors = [words[i] for i, zs in zone_of.items() if not zs]
    if not placed: raise Unsupported('no draggable has a right zone')
    q0 = ' '.join(stem) or pkg.title
    per_zone = {k: [i for i, z in placed.items() if z == k] for k in range(len(zones))}
    bg = (st.get('background') or {})
    media = pkg.image(bg, f'Background of the drag-and-drop task “{pkg.title}”') if bg.get('path') else None
    one_to_one = all(len(v) <= 1 for v in per_zone.values())
    if media and one_to_one:
        item, _ = pkg.media_out[media]; W, H = item['w'], item['h']; regions, targets = [], []
        for k, z in enumerate(zones):
            if not per_zone[k]: continue
            x, y = max(0.0, float(z.get('x', 0))), max(0.0, float(z.get('y', 0)))
            w, h = min(float(z.get('width', 10)), 100 - x), min(float(z.get('height', 10)), 100 - y)
            r = {'id': f'z{k}', 'shape': 'rect', 'x': round(x / 100 * W, 1), 'y': round(y / 100 * H, 1), 'w': round(w / 100 * W, 1), 'h': round(h / 100 * H, 1), 'label': words[per_zone[k][0]]}
            if labels[k]: r['note'] = labels[k]
            regions.append(r); targets.append(r['id'])
        if len({r['label'].lower() for r in regions}) == len(regions):
            explain = '\n'.join(f'{r["label"]} → {r.get("note") or "its place on the picture"}' for r in regions)
            ex = _ex('img_drag', q0 + '\nDrag each label to its place on the picture.', explain, media=media, regions=regions, targets=targets)
            if distractors: ex['distractors'] = distractors
            return [ex], [], [{'t': 'figure', 'media': media}, {'t': 'p', 'text': 'The picture: ' + item['alt'] + '.'}]
    if one_to_one and sum(1 for v in per_zone.values() if v) >= 3 and len(placed) <= 7:
        pairs = [[words[per_zone[k][0]], labels[k]] for k in range(len(zones)) if per_zone[k]]
        if all(a and b for a, b in pairs) and len({b for _, b in pairs}) == len(pairs) and len({a for a, _ in pairs}) == len(pairs):
            return [_ex('match', q0 + '\nMatch each item to its place.', '\n'.join(f'{a} → {b}' for a, b in pairs), think='discriminate', pairs=pairs)], [], []
    used = [k for k in range(len(zones)) if per_zone[k]]
    if 2 <= len(zones) <= 4 and len(placed) >= 3 and all(labels) and len(set(labels)) == len(labels):
        items = [{'text': words[i], 'bucket': z} for i, z in sorted(placed.items())]
        explain = '\n'.join(f'**{labels[k]}**: ' + ', '.join(words[i] for i in per_zone[k]) for k in used)
        if distractors: pkg.notes.append('distractors (right in no zone) are left out of the bucket: ' + ', '.join(distractors))
        return [_ex('bucket', q0, explain, think='discriminate', tags=['compare'], buckets=labels, items=items)], [], []
    if len(zones) >= 2 and all(labels) and len(set(labels)) == len(labels):
        out = []
        for i, z in sorted(placed.items()):
            out.append(_ex('mcq', f'{q0}\nWhere does **{words[i]}** go?', f'**{words[i]}** goes to: {labels[z]}.', think='recall', quick=True, options=labels, answer=z))
        return out, [], []
    raise Unsupported('the zones have no distinct labels to choose from')

def _first_right(pkg, q, answers, tip=None):
    opts = [text(a, True) for a in answers if isinstance(a, str)]
    return mcq_from(pkg, q, opts, [0], tips=[tip] if tip else None, quick=True)

def h5p_singlechoiceset(pkg, p):
    out = []
    for c in p.get('choices') or []:
        if isinstance(c, dict): out.append(_first_right(pkg, text(c.get('question')) or pkg.title, c.get('answers') or []))
    if not out: raise Unsupported('no question in the set')
    return out, [], []

def h5p_summary(pkg, p, summary_order=False):
    intro = text(p.get('intro')) or 'Choose the statement that is right.'
    out, rights = [], []
    for s in p.get('summaries') or []:
        if not isinstance(s, dict): continue
        stms = [x for x in s.get('summary') or [] if isinstance(x, str)]
        if len(stms) < 2: continue
        out.append(_first_right(pkg, intro, stms, text(s.get('tip'), True) or None)); rights.append(text(stms[0], True))
    if not out: raise Unsupported('no statement set with at least 2 statements')
    if summary_order and 3 <= len(rights) <= 9 and len(set(rights)) == len(rights):
        out.append(_ex('order', 'Put the statements of the summary in order.', 'The summary, in order:\n' + '\n'.join(f'{i + 1}. {r}' for i, r in enumerate(rights)), think='analyze', items=rights))
    return out, [], []

def h5p_dialogcards(pkg, p):
    cards, blocks = [], []
    for d in p.get('dialogs') or []:
        if not isinstance(d, dict): continue
        q, a = text(d.get('text')), text(d.get('answer'))
        if not q or not a: continue
        tips = d.get('tips') or {}
        if text(tips.get('front'), True): q += '\n*Hint: ' + plain(tips.get('front')) + '*'
        if text(tips.get('back'), True): a += '\n*' + plain(tips.get('back')) + '*'
        cards.append({'q': q, 'a': a})
        if d.get('image'):
            mid = pkg.image(d['image'], d.get('imageAltText') or plain(d.get('text')))
            if mid:
                blocks += [{'t': 'figure', 'media': mid}, {'t': 'p', 'text': f'The picture for the card “{plain(d.get("text"))}”: {pkg.media_out[mid][0]["alt"]}.'}]
                pkg.notes.append('a card picture is shown in the section (flashcards are text only)')
    if not cards: raise Unsupported('no card with a front and a back')
    return [], cards, blocks

def convert_params(pkg, library, params, summary_order=False, depth=0):
    """(exercises, flashcards, blocks) of one content type; containers recurse into their questions."""
    lib = str(library).split(' ')[0]
    if lib == 'H5P.MultiChoice': return h5p_multichoice(pkg, params)
    if lib == 'H5P.TrueFalse': return h5p_truefalse(pkg, params)
    if lib == 'H5P.Blanks': return h5p_blanks(pkg, params)
    if lib == 'H5P.DragText': return h5p_dragtext(pkg, params)
    if lib == 'H5P.MarkTheWords': return h5p_markthewords(pkg, params)
    if lib == 'H5P.DragQuestion': return h5p_dragquestion(pkg, params)
    if lib == 'H5P.SingleChoiceSet': return h5p_singlechoiceset(pkg, params)
    if lib == 'H5P.Summary': return h5p_summary(pkg, params, summary_order)
    if lib == 'H5P.Dialogcards': return h5p_dialogcards(pkg, params)
    if lib in CONTAINERS:
        if depth > 3: raise Unsupported('containers nested too deep')
        subs = params.get('questions') if lib == 'H5P.QuestionSet' else [c.get('content') for c in params.get('content') or [] if isinstance(c, dict)]
        exs, cards, blocks = [], [], []
        if lib == 'H5P.QuestionSet':
            intro = (params.get('introPage') or {})
            if intro.get('showIntroPage') and text(intro.get('introduction')): blocks.append({'t': 'p', 'text': text(intro.get('introduction'))})
        for k, sub in enumerate(subs or []):
            if not isinstance(sub, dict) or not sub.get('library'): continue
            sl = str(sub['library']).split(' ')[0]
            if lib == 'H5P.Column' and sl in ('H5P.AdvancedText', 'H5P.Text'):
                if text((sub.get('params') or {}).get('text')): blocks.append({'t': 'p', 'text': text(sub['params']['text'])})
                continue
            try:
                e, c, b = convert_params(pkg, sl, sub.get('params') or {}, summary_order, depth + 1)
                exs += e; cards += c; blocks += b
            except Unsupported as err: pkg.notes.append(f'part {k + 1} ({sl}) left out: {err}')
        if not exs and not cards: raise Unsupported('none of its questions could be imported')
        return exs, cards, blocks
    raise Unsupported(f'content type {lib or "?"} is not supported (supported: {", ".join(SUPPORTED)})')

# ---------------- a chapter of several packages ----------------
def convert(paths, chapter='ch01', title=None, src=None, summary_order=False):
    """→ (chapter, {media id: (media.json item, bytes)}, report). A package that cannot be imported is in report['unsupported']."""
    if not re.fullmatch(r'ch\d\d', chapter): raise ValueError('chapter must be chNN')
    media, report = {}, {'imported': [], 'unsupported': [], 'notes': []}
    sections, exercises, cards = [], [], []
    for path in paths:
        pkg = None
        try:
            pkg = Package(path, media)
            exs, fcs, blocks = convert_params(pkg, pkg.library, pkg.content, summary_order)
        except Unsupported as err:
            report['unsupported'].append({'package': os.path.basename(path), 'library': pkg.library if pkg else None, 'reason': str(err)})
            continue
        sid = f'{chapter}-s{len(sections) + 1:02d}'
        cite = pkg.cite(src)
        intro = f'Practice: **{pkg.title}**.' + (f' Made by {pkg.authors}.' if pkg.authors else '') + f' Licence: {pkg.license}.'
        sections.append({'id': sid, 'title': pkg.title, 'hook': plain(pkg.meta.get('title')) or pkg.title, 'blocks': [{'t': 'p', 'text': intro}] + blocks})
        ids = []
        for e in exs:
            e = dict(e, id=f'{chapter}-e{len(exercises) + 1:03d}', section=sid, cite=cite)
            order = ['id', 'type', 'section'] + [k for k in e if k not in ('id', 'type', 'section')]
            exercises.append({k: e[k] for k in order}); ids.append(e['id'])
        cids = []
        for c in fcs:
            c = {'id': f'{chapter}-f{len(cards) + 1:03d}', 'q': c['q'], 'a': c['a'], 'section': sid}; cards.append(c); cids.append(c['id'])
        report['imported'].append({'package': pkg.name, 'library': pkg.library, 'title': pkg.title, 'section': sid, 'exercises': ids, 'flashcards': cids,
                                   'types': sorted({e['type'] for e in exercises if e['id'] in ids})})
        report['notes'] += [f'{pkg.name}: {n}' for n in pkg.notes]
    num = int(chapter[2:])
    first = report['imported'][0]['title'] if report['imported'] else 'H5P'
    ch = {'id': chapter, 'num': num, 'title': title or first, 'subtitle': 'Imported from H5P', 'emoji': '🧩', 'sourcePages': 'H5P',
          'mantra': 'Practise, check, and read why.', 'objectives': [], 'sections': sections, 'debug': [], 'pitfalls': [],
          'flashcards': cards, 'exercises': exercises}
    if src: ch['sources'] = [{'id': src}]
    return ch, media, report

def write(out, ch, media):
    os.makedirs(os.path.join(out, 'chapters'), exist_ok=True)
    with open(os.path.join(out, 'chapters', ch['id'] + '.json'), 'w', encoding='utf-8') as f: json.dump(ch, f, ensure_ascii=False, indent=1)
    if not media: return
    md = os.path.join(out, 'media'); os.makedirs(md, exist_ok=True)
    mj = os.path.join(md, 'media.json')
    reg = json.load(open(mj, encoding='utf-8')) if os.path.isfile(mj) else {'format': 'noema.media/v1', 'items': []}
    have = {it.get('id') for it in reg.get('items', [])}
    for mid, (item, b) in media.items():
        with open(os.path.join(md, item['file']), 'wb') as f: f.write(b)
        if mid not in have: reg.setdefault('items', []).append(item)
    with open(mj, 'w', encoding='utf-8') as f: json.dump(reg, f, ensure_ascii=False, indent=1)

def main(argv):
    def opt(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
    flags = {'--out', '--chapter', '--title', '--src', '--report'}
    paths = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] not in flags)]
    if not paths or '--out' not in argv: print(__doc__); return 1
    ch, media, rep = convert(paths, opt('--chapter', 'ch01'), opt('--title'), opt('--src'), '--summary-order' in argv)
    if rep['imported']: write(opt('--out'), ch, media)
    for r in rep['imported']: print(f"✓ {r['package']} ({r['library']}) → {r['section']}: {len(r['exercises'])} exercise(s) {', '.join(r['types'])}{', %d flashcard(s)' % len(r['flashcards']) if r['flashcards'] else ''}")
    for r in rep['unsupported']: print(f"✗ {r['package']} ({r['library'] or '?'}): {r['reason']}")
    for n in rep['notes']: print('  note:', n)
    if opt('--report'):
        with open(opt('--report'), 'w', encoding='utf-8') as f: json.dump(rep, f, ensure_ascii=False, indent=1)
    if rep['imported']: print(f"→ {os.path.join(opt('--out'), 'chapters', ch['id'] + '.json')} ({len(ch['exercises'])} exercises, {len(ch['flashcards'])} flashcards, {len(media)} picture(s))")
    return 0 if rep['imported'] else 2

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
