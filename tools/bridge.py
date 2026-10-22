#!/usr/bin/env python3
"""文A language bridges (docs/BRIDGE.md): the words of one subject pack, with the meaning they have in it, translated
into a learner's native language — a sidecar the pack never needs to know about.

Source files of a bridge (next to the subject, or next to a pack.json):
  bridges/core.json      {"format": "noema-bridge-core", "v": 1, "pack", "source", "entries": [{k, pos, forms, band, key,
                          senses: [{id, gloss}]}], "keep": [names left as they are], "sections": {sid: {terms}}, "anchors": [...]}
  bridges/<native>.json  {"format": "noema-bridge-locale", "v": 1, "native", "status": draft|reviewed,
                          "t": {"<k>#<sense id>": {t, note?, st?, src?}}, "sections": {sid: "preview in the native language"}}
  bridges/from-<locale>/core.json + <native>.json   the same, for a learner who reads the pack's TRANSLATION into <locale>
                          (docs/BRIDGE.md §2.4): its words are the translation's words, "source" is <locale>. Every new pack
                          gets every pair — from its own language and from each translation (pack_rules.json "bridgesFrom"),
                          made AFTER the translation: e.g. an English pack → en→el/ru/ar, el→en/ru/ar, ru→en/el/ar.

Commands (SUBJ = a subject folder, or a pack .json with its bridges/ folder beside it). --from <locale> (every command):
the bridge of the pack's translation into <locale> — translations/<locale>/chNN.json of a subject folder, or the
noema-translation file beside a pack .json (<id>.tr.<locale>.json, or --translation FILE); its files in bridges/from-<locale>/.
  python3 tools/bridge.py todo SUBJ [--chapters ch01,ch02] [--limit 400]   content words no entry covers yet (most frequent first)
  python3 tools/bridge.py coverage SUBJ [--native el]                      share of the content words covered, per chapter
  python3 tools/bridge.py check SUBJ                                       core + every native: errors, stale or missing translations, orphan anchors
  python3 tools/bridge.py require SUBJ                                     check + EVERY pair a new pack needs (pack_rules.json "languages": from its
                                                                           own language and from each translation into en, el, ru, ar minus the
                                                                           language read), each covering >= 90 % of the content words and >= 80 %
                                                                           of the everyday ones (with --from: that translation's pairs only)
  python3 tools/bridge.py stamp SUBJ --native el                           record the current meaning (src) of every translation (after a review)
  python3 tools/bridge.py build SUBJ --native el [-o out.json]             one noema-bridge file (to import with 📥 or save through the connector)
  python3 tools/bridge.py senses SUBJ [--word order]                       every place of a word with several senses, and the sense it gets there
  python3 tools/bridge.py anchor SUBJ [--dry]                              anchors from the senses' cues (senses[].cues: words of the sentence
                                                                           that mean this sense); a person's anchors are kept and win
  python3 tools/bridge.py terms SUBJ [--dry]                               key words of each section ("Before you read") from the field words it
                                                                           uses most; a person's section terms are kept
The same functions build the library's bridges (tools/build.py) and run in the skill's sandbox.
"""
import os, sys, json, re, glob, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------- text: the same folding, words and ids as the app (engine/catalog.js, engine/wordlink.js) ----------
def fold(s):
    out = []
    for ch in str(s or ''):
        d = unicodedata.normalize('NFKD', ch)
        d = ''.join(c for c in d if not unicodedata.combining(c)).lower().replace('ß', 'ss').replace('ς', 'σ')
        d = d.replace('ى', 'ي')
        d = re.sub('[ـʾʿ]', '', d)
        d = re.sub('[‘’ʼ`´]', "'", d)
        out.append(d)
    return ''.join(out)

def _wordch(c):
    cat = unicodedata.category(c)
    return cat[0] in 'LMN'

def tokenize(s):
    """[(text, start, end)]: letters, marks and digits; ' and - between them stay inside the word."""
    s = str(s or ''); out = []; i = 0; n = len(s)
    while i < n:
        if not _wordch(s[i]): i += 1; continue
        j = i
        while j < n:
            if _wordch(s[j]): j += 1; continue
            if s[j] in "'’-‐" and j + 1 < n and _wordch(s[j + 1]) and j > i: j += 1; continue
            break
        out.append((s[i:j], i, j)); i = j
    return out

def hash36(s):
    """engine/catalog.js hash36 (over UTF-16 code units)."""
    b = str(s).encode('utf-16-le'); h1 = 0x811c9dc5; h2 = 0
    for k in range(0, len(b), 2):
        c = b[k] | (b[k + 1] << 8)
        h1 = ((h1 ^ c) * 16777619) & 0xffffffff
        h2 = (h2 * 31 + c) & 0xffffffff
    return (to36(h1) + to36(h2))[:10]

def to36(n):
    d = '0123456789abcdefghijklmnopqrstuvwxyz'; s = ''
    while True:
        s = d[n % 36] + s; n //= 36
        if not n: return s

def _js(o):
    return json.dumps({k: v for k, v in o.items() if not str(k).startswith('_')} if isinstance(o, dict) else o, ensure_ascii=False, separators=(',', ':'))

def block_ids(blocks):
    """engine/catalog.js blockIds: the id of a block comes from what it holds."""
    seen = {}; out = []
    for b in blocks or []:
        u = _js(b).encode('utf-16-le')[:12000].decode('utf-16-le', 'ignore')
        i = 'b' + hash36((b.get('t') or '') + '|' + u)
        if i in seen: seen[i] += 1; i += '-' + str(seen[i])
        else: seen[i] = 1
        out.append(i)
    return out

INLINE_CODE = re.compile(r'`[^`]*`'); LINK = re.compile(r'\[([^\]]*)\]\([^)]*\)'); MATH = re.compile(r'\$[^$]*\$'); TAG = re.compile(r'<[^>]+>')
def plain(s):
    s = INLINE_CODE.sub(' ', str(s or '')); s = MATH.sub(' ', s); s = LINK.sub(r'\1', s); s = TAG.sub(' ', s)
    return re.sub(r'[*#>]', ' ', re.sub(r'\*\*|__', '', s))

def block_texts(b):
    """The words of one theory block as the page shows them (never code, maths or a diagram's drawing)."""
    t = b.get('t')
    if t == 'p': return [plain(b.get('text'))]
    if t == 'list': return [plain(x) for x in b.get('items') or []]
    if t in ('code', 'diagram', 'figure'): return [plain(b.get('caption'))]
    if t == 'table': return [plain(b.get('caption'))] + [plain(x) for x in b.get('head') or []] + [plain(c) for r in b.get('rows') or [] for c in r or []]
    if t == 'callout': return [plain(b.get('title')), plain(b.get('text'))]
    if t == 'compare': return [plain(x) for i in b.get('items') or [] for x in [i.get('title')] + list(i.get('points') or [])]
    if t == 'flow': return [plain(x) for x in b.get('items') or []] + [plain(b.get('caption'))]
    if t == 'reveal': return [plain(b.get('label')), plain(b.get('text'))]
    if t == 'ask': return [plain(b.get('title'))] + [plain(x) for x in b.get('questions') or []]
    if t == 'terms': return [plain(x) for i in b.get('items') or [] for x in (i.get('term'), i.get('def'))]
    return []

# ---------- function words: never part of a bridge (UD: DET, ADP, CCONJ, SCONJ, PRON, AUX, PART) and very common verbs ----------
STOP = {
 'en': """a an the this that these those such some any each every either neither no all both few many much more most other another own same
   everything something nothing anything everyone someone anyone nobody everybody somebody others
   i me my mine we us our ours you your yours he him his she her hers it its they them their theirs one ones oneself itself themselves himself herself yourself ourselves myself
   who whom whose which what whatever whichever whoever where when why how there here than then
   and or but nor so yet if because although though while whereas unless until since as whether once
   of in on at by for with without within into onto from to toward towards about above below over under between among through throughout during before after against
   across along around behind beyond beside besides despite except inside outside near off out up down upon via per like unlike plus versus vs
   be am is are was were been being have has had having do does did doing done will would shall should can could may might must ought
   not n't 's 're 've 'll 'd also just only even still very too quite rather already again ever never always often sometimes
   get gets got make makes made let lets yes ok e.g i.e etc don't doesn't didn't can't cannot won't isn't aren't wasn't weren't hasn't haven't hadn't
   it's that's what's there's here's let's i'm i've you'll you're you've we're we'll they're they'll he's she's who's""",
 'el': """ο η το οι τα του της των τον την τη στο στη στην στον στα στους στις στου στης ένας μια μία ένα ενός μιας έναν
   και ή αλλά ούτε μήτε όμως ενώ αν εάν όταν όπως αφού επειδή γιατί ώστε που πού πως πώς ότι μήπως μην μη δεν όχι ναι
   σε σ' από με για προς χωρίς κατά μετά πριν παρά αντί ως έως μέχρι μέσα έξω πάνω κάτω δίπλα μεταξύ ανάμεσα
   εγώ εσύ αυτός αυτή αυτό αυτοί αυτές αυτά εμείς εσείς μου σου του της μας σας τους με σε τον την το τα τις
   αυτού αυτής αυτών αυτόν αυτήν εκείνος εκείνη εκείνο εκείνοι εκείνες εκείνα τέτοιος τέτοια τέτοιο ποιος ποια ποιο ποιοι ποιες
   κάθε όλος όλη όλο όλοι όλες όλα κάποιος κάποια κάποιο κάτι τίποτα κανείς καμία κανένα άλλος άλλη άλλο άλλοι άλλες άλλα ίδιος ίδια ίδιο
   είμαι είσαι είναι είμαστε είστε ήταν ήμουν έχω έχει έχουν είχε είχαν θα να ας πιο πολύ λίγο ήδη ακόμα ακόμη επίσης μόνο τότε εδώ εκεί""",
 'ru': """и или но а же ли не ни да нет в во на с со к ко по о об от до из у за над под при про для без через между перед после
   я ты он она оно мы вы они его её ее их им ей ему мне меня тебя тебе нас вам вас себя свой своя своё свои этот эта это эти тот та то те
   кто что какой какая какое какие который которая которое которые где когда как почему если чтобы потому так также тоже уже ещё еще очень
   быть есть был была было были будет будут""",
 'fr': """le la les l' un une des du de d' et ou mais donc or ni car que qu' qui quoi dont où ce cet cette ces se s' son sa ses leur leurs
   je tu il elle on nous vous ils elles me te lui y en à au aux dans par pour sur sous avec sans entre vers chez être est sont était avoir a ont ne pas plus très aussi""",
 'de': """der die das den dem des ein eine einer einem einen eines und oder aber denn sondern doch wenn als wie dass ob weil
   ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen sein seine ihre unser in an auf aus bei mit nach von zu zum zur über unter vor hinter zwischen durch für gegen ohne um
   ist sind war waren hat haben hatte wird werden kann können muss nicht kein keine auch nur sehr""",
 'es': """el la los las un una unos unas lo de del al y o u pero ni que quien cual cuyo donde cuando como si porque aunque
   yo tú él ella nosotros vosotros ellos ellas me te se nos os le les su sus mi mis tu tus en a por para con sin sobre entre hacia desde hasta
   es son era fue ser estar está están ha han haber no muy también ya""",
 'it': """il lo la i gli le un uno una l' di del della dei degli delle a al alla ai agli alle da dal dalla in nel nella con su sul sulla per tra fra
   e o ma né che chi cui dove quando come se perché anche io tu lui lei noi voi loro mi ti si ci vi è sono era essere ha hanno avere non più molto già""",
 'pt': """o a os as um uma uns umas de do da dos das em no na nos nas por pelo pela para com sem sobre entre e ou mas nem que quem qual onde quando como se porque
   eu tu ele ela nós vós eles elas me te se nos lhe lhes seu sua seus suas é são era ser estar está estão há ter tem não muito também já""",
 'ar': """في من إلى الى على عن مع منذ عند لدى حتى بين بعد قبل خلال حول دون غير ضد نحو عبر ل ب ك و ف أو ثم لكن بل لا لم لن ما ماذا متى أين كيف لماذا هل قد سوف إن أن إنه أنه إذا إذ لو كي لأن كما مثل
   هذا هذه هذان هاتان هؤلاء ذلك تلك أولئك الذي التي الذين اللذان اللتان اللاتي هنا هناك هو هي هم هن هما أنا نحن أنت أنتم أنتن إياه كل بعض أي أيضا فقط جدا
   كان كانت كانوا يكون تكون يكونون ليس ليست أصبح صار له لها لهم به بها بهم فيه فيها فيهم منه منها عليه عليها عنه عنها إليه إليها""",
 'tr': """ve veya ya da de ki bu şu o bir her hiç çok daha en ile için gibi kadar göre sonra önce ama fakat ancak eğer çünkü ben sen biz siz onlar değil var yok mı mi mu mü""",
}
STOPSET = {k: {fold(w) for w in v.split()} for k, v in STOP.items()}

def content_token(tok, lang):
    t = fold(tok)
    if len(t) < 2 or any(c.isdigit() for c in t): return False
    stop = STOPSET.get(lang.split('-')[0], set())
    return not any(r in stop for r in readings(t))   # Arabic: "وهذا" is و + هذا

# ---------- loading ----------
def rj(p, d=None):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except FileNotFoundError: return d

def wj(p, o):
    os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f: json.dump(o, f, ensure_ascii=False, indent=1); f.write('\n')

def translated(chapters, tchs):
    """engine/loader.js translatedChapters: each chapter in the translation's words (same ids); a chapter the translation
    lacks — or whose sections differ — stays as it is."""
    tr = {c.get('id'): c for c in tchs or []}; out = []
    for c in chapters:
        t = tr.get(c['id'])
        out.append(t if t and [s.get('id') for s in t.get('sections') or []] == [s.get('id') for s in c.get('sections') or []] else c)
    return out

def load(subj, src=None, translation=None):
    """→ (pack-like {subject, chapters}, bridge dir). subj: a subject folder or a pack .json.
    src: the bridge of the pack's translation into src (docs/BRIDGE.md §2.4) — the translation's chapters, subject.language
    = src (sourceLanguage = the pack's own), files in bridges/from-<src>/. translation: its noema-translation file."""
    if os.path.isfile(subj):
        p = rj(subj); pack, root = {'subject': p['subject'], 'chapters': p['chapters']}, os.path.dirname(os.path.abspath(subj))
        tchs = None
        if src:
            sid = p['subject']['id']
            for f in [translation] if translation else [os.path.join(root, f'{sid}.tr.{src}.json'), os.path.join(root, 'build', f'{sid}.tr.{src}.json'), os.path.join(root, 'translations', f'{src}.json')]:
                t = rj(f) if f else None
                if t: tchs = t.get('chapters'); break
            if tchs is None: tchs = ((p.get('translations') or {}).get(src) or {}).get('chapters') if isinstance(((p.get('translations') or {}).get(src) or {}).get('chapters'), list) else None
    else:
        from noema_lib import load_subject, load_translations
        meta, _src, chapters, _rep = load_subject(subj)
        pack, root = {'subject': meta, 'chapters': chapters}, subj
        tchs = (rj(translation) or {}).get('chapters') if translation else (load_translations(subj, chapters).get(src) if src else None)
    if not src or src.split('-')[0].lower() == (pack['subject'].get('language') or 'en').split('-')[0].lower(): return pack, os.path.join(root, 'bridges')
    if not tchs: raise SystemExit(f'no {src} translation of {pack["subject"]["id"]}: a bridge from a translation is made after it (translations/{src}/chNN.json, or its noema-translation file — --translation FILE)')
    own = pack['subject'].get('language') or 'en'
    return {'subject': {**pack['subject'], 'language': src, 'sourceLanguage': own}, 'chapters': translated(pack['chapters'], tchs)}, os.path.join(root, 'bridges', 'from-' + src.split('-')[0].lower())

def sections(pack, chapters=None):
    """[(chapter id, section id, [(block id, [texts])])]"""
    out = []
    for c in pack['chapters']:
        if chapters and c['id'] not in chapters: continue
        for s in c.get('sections') or []:
            ids = block_ids(s.get('blocks'))
            out.append((c['id'], s['id'], [(ids[i], block_texts(b)) for i, b in enumerate(s.get('blocks') or [])]))
    return out

AR = re.compile('^[\u0600-\u06FF]')
def readings(f):
    """engine/wordlink.js readings(): a folded word, then without the clitics Arabic writes onto it (و ف · ب ل ك · ال, لل)."""
    if f.endswith("'s") and len(f) > 3: return [f, f[:-2]]   # an English possessive: "today's" is a form of "today"
    if not AR.match(f): return [f]
    out = [f]
    def add(w):
        if len(w) >= 2 and w not in out: out.append(w)
    for a in [f] + ([f[1:]] if f[:1] in ('و', 'ف') else []):
        add(a)
        for b in [a] + ([a[1:]] if a[:1] in ('ب', 'ل', 'ك') else []):
            add(b)
            if b.startswith('ال'): add(b[2:])
            if b.startswith('لل'): add(b[2:])
    return out

class Index:
    def __init__(self, entries):
        self.first = {}
        for e in entries:
            for form in {e['k'], *(e.get('forms') or [])}:
                toks = [fold(t) for t, _, _ in tokenize(form)]
                if toks: self.first.setdefault(toks[0], []).append((toks, e))
        for v in self.first.values(): v.sort(key=lambda x: -len(x[0]))
    def find(self, text):
        toks = tokenize(text); out = []; n = 0
        while n < len(toks):
            hit = None
            for r in readings(fold(toks[n][0])):   # the word as written first, then without its clitics (Arabic)
                for cand, e in self.first.get(r, []):
                    if n + len(cand) > len(toks): continue
                    if cand[0] == r and all(fold(toks[n + q][0]) == cand[q] and re.fullmatch(r'[ \t ]+', text[toks[n + q - 1][2]:toks[n + q][1]]) for q in range(1, len(cand))):
                        hit = (cand, e); break
                if hit: break
            if hit:
                out.append((toks[n][1], toks[n + len(hit[0]) - 1][2], hit[1])); n += len(hit[0])
            else: n += 1
        return out

def core_of(bdir, pack):
    c = rj(os.path.join(bdir, 'core.json'))
    if c is None: c = {'format': 'noema-bridge-core', 'v': 1, 'pack': pack['subject']['id'], 'source': pack['subject'].get('language', 'en'), 'entries': [], 'keep': [], 'sections': {}, 'anchors': []}
    return c

def natives(bdir):
    return sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(bdir, '*.json')) if os.path.basename(f) not in ('core.json', 'anchors.json') and not os.path.basename(f).endswith('.bridge.json'))

def from_dirs(bdir):
    """The translations that have bridges of their own: bridges/from-<locale>/ → [locale]."""
    return sorted(os.path.basename(d)[5:] for d in glob.glob(os.path.join(bdir, 'from-*')) if os.path.isdir(d))

def pair_key(src, nat, own):
    """= engine/bridge.js pairKey: "<native>" from the pack's own language, "<source>.<native>" from a translation."""
    b = lambda x: (x or '').split('-')[0].lower()
    return b(nat) if not src or b(src) == b(own) else f'{b(src)}.{b(nat)}'

def src_of(e, s):
    return hash36(e['k'] + '|' + (s.get('gloss') or e.get('pos') or ''))

# ---------- coverage ----------
def coverage(pack, entries, keep=(), chapters=None):
    """→ {'all': (covered, total), 'everyday': (covered, total), chapter id: (covered, total)} over the content words of
    the theory. 'everyday': the words of band 1 (or no band) and every word no entry covers yet — a bridge for A2/B1
    learners must not skip the everyday words (tools/pack_rules.json "languages".bridgeCoverage)."""
    lang = pack['subject'].get('language', 'en'); idx = Index(list(entries) + [{'k': k, 'band': 3} for k in keep])   # keep: names left as they are count as covered
    res = {'all': [0, 0], 'everyday': [0, 0]}
    for cid, sid, blocks in sections(pack, chapters):
        r = res.setdefault(cid, [0, 0])
        for bid, texts in blocks:
            for t in texts:
                spans = idx.find(t)
                cov = [None] * len(t)
                for i, j, e in spans:
                    for x in range(i, j): cov[x] = e
                for tok, i, j in tokenize(t):
                    if not content_token(tok, lang): continue
                    e = cov[i]
                    r[1] += 1; res['all'][1] += 1
                    if e is not None: r[0] += 1; res['all'][0] += 1
                    if e is None or (e.get('band') or 1) == 1:
                        res['everyday'][1] += 1
                        if e is not None: res['everyday'][0] += 1
    return res

def required(pack):
    """The natives every new pack gets a bridge into (tools/pack_rules.json "languages", minus the pack's language) and the minimum coverage."""
    from noema_lib import languages
    L = languages(); own = (pack['subject'].get('language') or 'en').split('-')[0].lower()
    return [x for x in L.get('bridges') or [] if x.split('-')[0].lower() != own], L.get('bridgeCoverage') or {}

def require(pack, bdir):
    """check() + a bridge into every required native, each covering enough of the content words and of the everyday ones."""
    E, W = check(pack, bdir)
    if E and E[0] == 'no bridges/core.json': return E, W
    want, mins = required(pack); have = set(natives(bdir))
    rel = os.path.relpath(bdir, os.path.dirname(bdir.rstrip(os.sep))) if os.path.basename(bdir).startswith('from-') else ''
    for nat in want:
        if nat not in have: E.append(f'no bridge into {nat} yet (bridges/{rel + "/" if rel else ""}{nat}.json): every new pack gets 文A help in {", ".join(want)}'); continue
        b = build(pack, bdir, nat); ev = b.get('everyday', 0)
        if b['coverage'] < mins.get('all', 0): E.append(f'{nat}: covers {b["coverage"]:.0%} of the content words, at least {mins["all"]:.0%} (bridge.py todo lists the rest)')
        if ev < mins.get('everyday', 0): E.append(f'{nat}: covers {ev:.0%} of the everyday words, at least {mins["everyday"]:.0%} — learners at A2/B1 need them too (bridge.py todo)')
    return E, W

def require_all(subj, translation=None):
    """require() for every pair a new pack needs: from its own language, then from each translation (pack_rules.json
    "bridgesFrom") — each translation's bridges come from its own words, so it must exist first. → (errors, warnings)"""
    from noema_lib import bridge_pairs
    pack, bdir = load(subj); own = (pack['subject'].get('language') or 'en').split('-')[0].lower()
    E, W = require(pack, bdir)
    for src in sorted({s for s, _n in bridge_pairs(own)} - {own}):
        try: tp, tdir = load(subj, src, None)
        except SystemExit as e: E.append(f'from {src}: {e}'); continue
        if not os.path.exists(os.path.join(tdir, 'core.json')): E.append(f'from {src}: no bridges/from-{src}/core.json yet — a learner reading the {src} translation gets 文A help too (bridge.py todo SUBJ --from {src})'); continue
        e2, w2 = require(tp, tdir); E += [f'from {src}: {x}' for x in e2]; W += [f'from {src}: {x}' for x in w2]
    return E, W

def todo(pack, entries, keep=(), chapters=None, limit=400):
    lang = pack['subject'].get('language', 'en'); idx = Index(list(entries) + [{'k': k} for k in keep]); cnt = {}; ex = {}
    for cid, sid, blocks in sections(pack, chapters):
        for bid, texts in blocks:
            for t in texts:
                cov = [False] * len(t)
                for i, j, _e in idx.find(t):
                    for x in range(i, j): cov[x] = True
                for tok, i, j in tokenize(t):
                    if not content_token(tok, lang) or cov[i]: continue
                    f = fold(tok); cnt[f] = cnt.get(f, 0) + 1
                    ex.setdefault(f, {'form': tok, 'at': f'{sid}/{bid}', 'context': t[max(0, i - 40):j + 40].replace('\n', ' ').strip()})
    rows = sorted(cnt.items(), key=lambda x: (-x[1], x[0]))[:limit]
    return [{'word': ex[f]['form'], 'n': n, 'at': ex[f]['at'], 'context': ex[f]['context']} for f, n in rows]

# ---------- check, stamp, build ----------
FUNCTION_POS = {'DET', 'ADP', 'CCONJ', 'SCONJ', 'PRON', 'AUX', 'PART'}
def check(pack, bdir):
    E, W = [], []
    core = rj(os.path.join(bdir, 'core.json'))
    if core is None: return ['no bridges/core.json'], W
    if core.get('pack') != pack['subject']['id']: E.append(f'core.pack "{core.get("pack")}" is not this subject ("{pack["subject"]["id"]}")')
    if (core.get('source') or '').split('-')[0] != (pack['subject'].get('language') or 'en').split('-')[0]: E.append('core.source differs from the pack\'s language')
    keys = {}
    for e in core.get('entries') or []:
        if not e.get('k'): E.append(f'an entry without k: {e}'); continue
        if e['k'] in keys: E.append(f'entry "{e["k"]}" twice')
        if e.get('pos') in FUNCTION_POS: E.append(f'entry "{e["k"]}": {e["pos"]} — function words are not part of a bridge')
        if not e.get('senses'): E.append(f'entry "{e["k"]}": no senses')
        keys[e['k']] = {str(s.get('id')) for s in e.get('senses') or []}
    secs = {s['id']: s for c in pack['chapters'] for s in c.get('sections') or []}
    for sid, v in (core.get('sections') or {}).items():
        if sid not in secs: W.append(f'sections.{sid}: no such section')
        for k in v.get('terms') or []:
            if k not in keys: E.append(f'sections.{sid}.terms: "{k}" is not an entry')
    for a in core.get('anchors') or []:
        sid, _, bid = str(a.get('at', '')).partition('/')
        if a.get('k') not in keys or str(a.get('sense')) not in keys.get(a.get('k'), set()): E.append(f'anchor {a.get("at")}: entry "{a.get("k")}" has no sense "{a.get("sense")}"'); continue
        s = secs.get(sid)
        if not s: W.append(f'anchor {a["at"]}: orphan (section {sid} is gone)'); continue
        ids = block_ids(s.get('blocks'))
        texts = [' '.join(block_texts(b)) for b in s.get('blocks') or []]
        if bid in ids and a.get('quote') in texts[ids.index(bid)]: continue
        if any(a.get('quote') in t for t in texts): W.append(f'anchor {a["at"]}: its block changed — found "{a.get("quote")}" elsewhere in the section (re-anchored by quote)')
        else: W.append(f'anchor {a["at"]}: orphan — "{a.get("quote")}" is not in section {sid} any more (the default sense applies)')
    for nat in natives(bdir):
        L = rj(os.path.join(bdir, nat + '.json')) or {}
        if L.get('native', nat).split('-')[0] != nat.split('-')[0]: E.append(f'{nat}.json: native "{L.get("native")}" differs from the file name')
        if L.get('status') not in ('draft', 'reviewed'): E.append(f'{nat}.json: status must be draft or reviewed')
        tr = L.get('t') or {}; miss = stale = 0
        for e in core.get('entries') or []:
            for s in e.get('senses') or []:
                x = tr.get(f'{e["k"]}#{s.get("id")}')
                if not x or not x.get('t'): miss += 1; continue
                if x.get('src') and x['src'] != src_of(e, s): stale += 1
                if re.search(r'<\s*[a-z!/]|javascript:', (x.get('t') or '') + (x.get('note') or ''), re.I): E.append(f'{nat}: "{e["k"]}" — plain text only')
        for key in tr:
            k, _, sid = key.rpartition('#')
            if k not in keys or sid not in keys[k]: W.append(f'{nat}: translation "{key}" has no entry in core.json')
        if miss: W.append(f'{nat}: {miss} sense(s) without a translation')
        if stale: W.append(f'{nat}: {stale} translation(s) are stale (the meaning in core.json changed): review them, then run stamp')
    return E, W

def stamp(pack, bdir, nat):
    core = core_of(bdir, pack); p = os.path.join(bdir, nat + '.json'); L = rj(p) or {}
    n = 0
    for e in core.get('entries') or []:
        for s in e.get('senses') or []:
            x = (L.get('t') or {}).get(f'{e["k"]}#{s.get("id")}')
            if x and x.get('src') != src_of(e, s): x['src'] = src_of(e, s); n += 1
    wj(p, L); return n

def build(pack, bdir, nat):
    """core + <native>.json → one noema-bridge (only the senses translated into this native)."""
    core = core_of(bdir, pack); L = rj(os.path.join(bdir, nat + '.json')) or {}
    st = L.get('status', 'draft'); tr = L.get('t') or {}; entries = []
    for e in core.get('entries') or []:
        ss = []
        for s in e.get('senses') or []:
            x = tr.get(f'{e["k"]}#{s.get("id")}')
            if not x or not x.get('t'): continue
            sense = {'id': str(s.get('id')), 't': x['t']}
            if s.get('gloss'): sense['gloss'] = s['gloss']
            for f in ('pos', 'forms'):   # a sense with its own part of speech or forms ("order" the noun, "orders" …)
                if s.get(f): sense[f] = s[f]
            if x.get('note'): sense['note'] = x['note']
            sense['st'] = 'stale' if x.get('src') and x['src'] != src_of(e, s) else x.get('st') or st
            ss.append(sense)
        if not ss: continue
        out = {'k': e['k']}
        for f in ('pos', 'forms', 'band', 'key', 'case'):
            if e.get(f) not in (None, [], False): out[f] = e[f]
        out['senses'] = ss; entries.append(out)
    have = {e['k'] for e in entries}
    secs = {}
    for sid, v in (core.get('sections') or {}).items():
        terms = [k for k in v.get('terms') or [] if k in have]; pv = (L.get('sections') or {}).get(sid)
        if terms or pv: secs[sid] = {**({'terms': terms} if terms else {}), **({'preview': pv} if pv else {})}
    for sid, pv in (L.get('sections') or {}).items():
        if sid not in secs and pv: secs[sid] = {'preview': pv}
    anchors = [a for a in core.get('anchors') or [] if a.get('k') in have and any(s['id'] == str(a.get('sense')) for e in entries if e['k'] == a['k'] for s in e['senses'])]
    cov = coverage(pack, entries, core.get('keep') or [])
    full = [c['id'] for c in pack['chapters'] if cov.get(c['id'], [0, 0])[1] and cov[c['id']][0] / cov[c['id']][1] >= 0.95]
    allc, evc = cov['all'], cov['everyday']
    b = {'format': 'noema-bridge', 'v': 1, 'pack': pack['subject']['id'], 'source': core.get('source') or pack['subject'].get('language', 'en'), 'native': L.get('native', nat), 'status': st,
         'coverage': round(allc[0] / allc[1], 4) if allc[1] else 0, 'everyday': round(evc[0] / evc[1], 4) if evc[1] else 0, 'chapters': full, 'of': len(pack['chapters']), 'entries': entries, 'sections': secs, 'anchors': anchors}
    if L.get('updated'): b['updated'] = L['updated']
    return b

# ---------- the key words of each section ("Before you read"), picked from the text ----------
def terms(pack, bdir, n=8, dry=False):
    """Sections without key words a person chose get the bridge's field words that mark them most:
    uses in the section × (3 for band 3, 1.5 for band 2, +2 for a key term) × rarity across the pack (log N/df),
    so "table" or "file", used everywhere, give way to the words the section is about.
    → {sid: [k]} written as core.sections[sid] = {terms, auto: true}; a person's terms (no auto) are kept."""
    import math
    core = core_of(bdir, pack); idx = Index(core.get('entries') or []); secs = core.setdefault('sections', {}); made = {}
    per = []
    for _cid, sid, blocks in sections(pack):
        score = {}
        for _bid, texts in blocks:
            for t in texts:
                for _i, _j, e in idx.find(t):
                    b = e.get('band') or 1
                    if b < 2 and not e.get('key'): continue
                    score[e['k']] = score.get(e['k'], 0) + (3 if b >= 3 else 1.5) + (2 if e.get('key') else 0)
        per.append((sid, score))
    df = {}
    for _sid, sc in per:
        for k in sc: df[k] = df.get(k, 0) + 1
    N = len(per) or 1
    for sid, sc in per:
        if sid in secs and not secs[sid].get('auto'): continue
        best = [k for k, _v in sorted(((k, v * math.log(1 + N / df[k])) for k, v in sc.items()), key=lambda kv: (-kv[1], kv[0]))[:n]]
        if best: made[sid] = best
    if not dry:
        for sid, ks in made.items(): secs[sid] = {'terms': ks, 'auto': True}
        wj(os.path.join(bdir, 'core.json'), core)
    return made

# ---------- the sense at each place: anchors made from the text (cues), kept apart from the ones a person wrote ----------
MASK = re.compile(r'`[^`]*`|\$[^$]*\$|\]\([^)]*\)|<[^>]+>')
MARKUP_CH = set('`$*_[]()<>|#\n')
def block_raw(b):
    """The raw strings of one block, in the order block_texts() gives their words."""
    t = b.get('t'); g = lambda *k: [b.get(x) or '' for x in k]
    if t == 'p': return g('text')
    if t == 'list': return list(b.get('items') or [])
    if t in ('code', 'diagram', 'figure'): return g('caption')
    if t == 'table': return g('caption') + list(b.get('head') or []) + [c for r in b.get('rows') or [] for c in r or []]
    if t == 'callout': return g('title', 'text')
    if t == 'compare': return [x for i in b.get('items') or [] for x in [i.get('title') or ''] + list(i.get('points') or [])]
    if t == 'flow': return list(b.get('items') or []) + g('caption')
    if t == 'reveal': return g('label', 'text')
    if t == 'ask': return g('title') + list(b.get('questions') or [])
    if t == 'terms': return [x or '' for i in b.get('items') or [] for x in (i.get('term'), i.get('def'))]
    return []

def occurrences(pack, entries, keep=(), only=None):
    """Every place a word with two or more senses appears: [{at, k, form, i, raw, window}] (i = index in the raw string)."""
    multi = {e['k'] for e in entries if len(e.get('senses') or []) > 1 and (not only or e['k'] in only)}
    if not multi: return []
    idx = Index(list(entries) + [{'k': k} for k in keep]); out = []
    for c in pack['chapters']:
        for sec in c.get('sections') or []:
            ids = block_ids(sec.get('blocks'))
            for n, b in enumerate(sec.get('blocks') or []):
                for raw in block_raw(b):
                    raw = str(raw or ''); masked = MASK.sub(lambda m: ' ' * len(m.group(0)), raw)
                    for i, j, e in idx.find(masked):
                        if e.get('k') not in multi: continue
                        a = max(masked.rfind(x, 0, i) for x in '.!?;:\n'); z = min([y for y in (masked.find(x, j) for x in '.!?;:\n') if y >= 0] or [len(masked)])
                        out.append({'at': f"{sec['id']}/{ids[n]}", 'k': e['k'], 'form': raw[i:j], 'i': i, 'raw': raw, 'window': masked[a + 1:z]})
    return out

def cue_sense(e, window):
    """The sense whose cues the sentence holds most (ties and none → None: the default applies)."""
    words = ' ' + ' '.join(r for t, _, _ in tokenize(window) for r in readings(fold(t))[:1]) + ' '
    best, score, tie = None, 0, False
    for s in e.get('senses') or []:
        n = sum(1 for c in s.get('cues') or [] if ' ' + ' '.join(fold(t) for t, _, _ in tokenize(c)) + ' ' in words)
        if n > score: best, score, tie = s, n, False
        elif n and n == score: tie = True
    return None if tie else best

def _side(raw, i, j, before):
    """A prefix (before the word) or suffix that the page shows exactly: plain words only, ≤ 30 characters, whole words."""
    if before:
        seg = raw[:i]; cut = max([seg.rfind(ch) for ch in MARKUP_CH] + [-1]); seg = seg[cut + 1:]
        if len(seg) > 30: seg = seg[-30:]; seg = seg[seg.find(' ') + 1:] if ' ' in seg else ''
    else:
        seg = raw[j:]; cut = min([x for x in (seg.find(ch) for ch in MARKUP_CH) if x >= 0] or [len(seg)]); seg = seg[:cut]
        if len(seg) > 30: seg = seg[:30]; seg = seg[:seg.rfind(' ')] if ' ' in seg else ''
    return re.sub(r'\s+', ' ', seg)

def anchor(pack, bdir, dry=False):
    """Anchors from the cues of the senses (core.json senses[].cues): one per place where the cues pick another sense
    than the first. Anchors a person wrote (no "auto") are kept and win; the auto ones are made again each run."""
    core = core_of(bdir, pack); entries = core.get('entries') or []; byk = {e['k']: e for e in entries}
    manual = [a for a in core.get('anchors') or [] if not a.get('auto')]
    made = []; report = []
    for o in occurrences(pack, entries, core.get('keep') or []):
        e = byk[o['k']]; s = cue_sense(e, o['window']); first = (e.get('senses') or [{}])[0]
        pin = next((m for m in manual if m['at'] == o['at'] and m.get('quote') == o['form'] and m.get('k') == o['k']), None)
        report.append({'at': o['at'], 'k': o['k'], 'form': o['form'], 'sense': str(pin['sense']) if pin else str((s or first).get('id')), 'by': 'anchor' if pin else 'cue' if s else 'default', 'context': o['window'].strip()[:160]})
        if pin or not s or str(s.get('id')) == str(first.get('id')): continue
        a = {'at': o['at'], 'quote': o['form'], 'k': o['k'], 'sense': str(s['id']), 'auto': True}
        pre = _side(o['raw'], o['i'], o['i'] + len(o['form']), True); suf = '' if pre.strip() else _side(o['raw'], o['i'], o['i'] + len(o['form']), False)
        if pre.strip(): a['prefix'] = pre
        elif suf.strip(): a['suffix'] = suf
        made.append(a)
    if not dry: core['anchors'] = manual + made; wj(os.path.join(bdir, 'core.json'), core)
    return made, report

def build_library(sdir, pack, root=None):
    """tools/build.py: every bridges/<native>.json of a library subject → bridge.<native>.js, and every
    bridges/from-<locale>/<native>.json (a translation's) → bridge.<locale>.<native>.js + the registry's bridgeLocales
    (keyed like engine/bridge.js pairKey)."""
    bdir = os.path.join(sdir, 'bridges'); out = {}
    for f in glob.glob(os.path.join(sdir, 'bridge.*.js')): os.remove(f)
    jobs = []
    if os.path.exists(os.path.join(bdir, 'core.json')): jobs.append((pack, bdir))
    for src in from_dirs(bdir):
        if os.path.exists(os.path.join(bdir, 'from-' + src, 'core.json')): jobs.append(load(sdir, src))
    own = pack['subject'].get('language') or 'en'
    for p, d in jobs:
        E, W = check(p, d)
        if E: raise SystemExit('bridge errors in ' + d + ':\n- ' + '\n- '.join(E))
        for w in W: print('  WARN bridge: ' + w)
        for nat in natives(d):
            build_one(sdir, p, d, nat, pair_key(p['subject'].get('language'), nat, own), out, root)
    return out

def build_one(sdir, pack, bdir, nat, key, out, root=None):
    """One library bridge file bridge.<key>.js (NOEMA_BRIDGES["<pack>|<key>"]) and its registry entry out[key]."""
    b = build(pack, bdir, nat)
    if not b['entries']: return
    name = f'bridge.{key}.js'
    body = json.dumps(b, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    with open(os.path.join(sdir, name), 'w', encoding='utf-8') as fh:
        fh.write(f'/* GENERATED 文A language bridge ({b["source"]} → {nat}) of {b["pack"]} — do not edit; edit bridges/ and run tools/build.py */\n'
                 f'(window.NOEMA_BRIDGES = window.NOEMA_BRIDGES || {{}})[{json.dumps(b["pack"] + "|" + key)}] = {body};\n')
    out[key] = {'path': os.path.relpath(os.path.join(sdir, name), root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))).replace(os.sep, '/'),
                'status': b['status'], 'coverage': b['coverage'], 'chapters': len(b['chapters']), 'of': b['of'], 'previews': sum(1 for s in b['sections'].values() if s.get('preview')), 'entries': len(b['entries']),
                **({'source': b['source']} if key != nat.split('-')[0].lower() else {})}
    print(f'  bridge {b["pack"]} · {b["source"]} → {nat} ({b["status"]}): {len(b["entries"])} words, {b["coverage"]:.0%} of the content words, {len(b["chapters"])}/{b["of"]} chapters')

def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['todo', 'coverage', 'check', 'require', 'stamp', 'build', 'senses', 'anchor', 'terms'])
    ap.add_argument('--dry', action='store_true'); ap.add_argument('--word')
    ap.add_argument('subject'); ap.add_argument('--native'); ap.add_argument('--chapters'); ap.add_argument('--limit', type=int, default=400); ap.add_argument('-o', '--out')
    ap.add_argument('--from', dest='src', help="the bridge of the pack's translation into this language (made after it): its words, bridges/from-<locale>/")
    ap.add_argument('--translation', help='with --from and a pack .json: its noema-translation file (default: <id>.tr.<locale>.json beside it)')
    a = ap.parse_args(argv)
    if a.cmd == 'require' and not a.src:   # every pair: the pack's own language, then each translation
        E, W = require_all(a.subject)
        for w in W: print('WARN', w)
        for e in E: print('ERROR', e)
        print(f'{len(E)} error(s), {len(W)} warning(s)'); return 1 if E else 0
    pack, bdir = load(a.subject, a.src, a.translation); core = core_of(bdir, pack); chs = set(a.chapters.split(',')) if a.chapters else None
    if a.cmd == 'todo':
        print(json.dumps(todo(pack, core['entries'], core.get('keep') or [], chs, a.limit), ensure_ascii=False, indent=1))
    elif a.cmd == 'coverage':
        ents = build(pack, bdir, a.native)['entries'] if a.native else core['entries']
        cov = coverage(pack, ents, core.get('keep') or [], chs)
        for k, (x, n) in cov.items(): print(f'{k:>8}: {x}/{n} = {x / n:.1%}' if n else f'{k:>8}: -')
    elif a.cmd in ('check', 'require'):
        E, W = (check if a.cmd == 'check' else require)(pack, bdir)
        for w in W: print('WARN', w)
        for e in E: print('ERROR', e)
        print(f'{len(E)} error(s), {len(W)} warning(s)'); return 1 if E else 0
    elif a.cmd == 'stamp':
        if not a.native: ap.error('--native is required')
        print(f'{stamp(pack, bdir, a.native)} translation(s) stamped')
    elif a.cmd == 'senses':
        _m, rep = anchor(pack, bdir, dry=True)
        print(json.dumps([r for r in rep if not a.word or r['k'] == a.word], ensure_ascii=False, indent=1))
    elif a.cmd == 'anchor':
        made, rep = anchor(pack, bdir, dry=a.dry)
        print(f'{len(rep)} place(s) of words with several senses: {sum(1 for r in rep if r["by"] == "cue")} decided by cues, {len(made)} anchor(s) {"would be " if a.dry else ""}written')
    elif a.cmd == 'terms':
        made = terms(pack, bdir, dry=a.dry)
        print(json.dumps(made, ensure_ascii=False, indent=1) if a.dry else f'{len(made)} section(s) got key words from the text (a person\'s are kept)')
    elif a.cmd == 'build':
        if not a.native: ap.error('--native is required')
        b = build(pack, bdir, a.native); out = a.out or os.path.join(bdir, f'{pack["subject"]["id"]}.{pair_key(pack["subject"].get("language"), a.native, pack["subject"].get("sourceLanguage") or pack["subject"].get("language"))}.bridge.json')
        wj(out, b); print(f'{out}: {len(b["entries"])} words, {b["coverage"]:.0%} covered ({b["everyday"]:.0%} of the everyday words), chapters {", ".join(b["chapters"]) or "-"}')
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
