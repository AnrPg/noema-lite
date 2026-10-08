import json, os, sys, unicodedata
OUT = sys.argv[1]
def w(rel, obj):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, indent=1); open(p, 'w', encoding='utf-8').write(unicodedata.normalize('NFC', s) + '\n')
w('course.json', {"format": "noema.langcourse/v1", "id": "polyglot-semitic-zh-de", "title": "Arabic · Hebrew · Chinese · German",
  "explainLang": "en", "languages": ["ar", "he", "zh", "de"], "profiles": "required",
  "defaults": {"depth": {"ar": 3, "he": 3, "zh": 3, "de": 3}, "batch": 12, "dailyMinutes": 30},
  "knownLanguages": ["el", "en", "de", "ru", "tr"]})
core = [  # (id, gloss, subgroup, rank)
 ('pron.i', 'I', 'pron'), ('pron.you.sg', 'you (one person)', 'pron'), ('pron.he', 'he', 'pron'), ('pron.she', 'she', 'pron'), ('pron.we', 'we', 'pron'), ('pron.they', 'they', 'pron'),
 ('verb.be', 'to be', 'verb'), ('poss.have', 'to have (possession)', 'verb'), ('verb.eat', 'to eat', 'verb'), ('verb.drink', 'to drink', 'verb'), ('verb.buy', 'to buy', 'verb'),
 ('verb.like', 'to like', 'verb'), ('verb.want', 'to want', 'verb'),
 ('part.yes', 'yes', 'func'), ('part.no', 'no', 'func'), ('part.not', 'not (negation)', 'func'), ('conj.and', 'and', 'func'), ('det.def', 'the (definite article)', 'func'),
 ('det.indef', 'a, an (indefinite article)', 'func'), ('dem.this', 'this', 'func'), ('q.what', 'what?', 'func'), ('q.where', 'where?', 'func'), ('adv.here', 'here', 'func')]
w('core/fields/core.json', {"field": "core", "title": "Core words", "subgroups": [{"id": "pron", "title": "Personal pronouns"}, {"id": "verb", "title": "Basic verbs"}, {"id": "func", "title": "Little words"}],
  "sources": ["The core spine of the course (docs/LANGUAGES.md §4.4): the words every sentence needs; extended node by node"],
  "concepts": [{"id": c[0], "gloss": c[1], "subgroup": c[2], "tier": 1, "rank": i + 1} for i, c in enumerate(core)]})
V = json.load(open('veg_final.json'))
drop = {'veg.minerslettuce', 'veg.nopal', 'veg.kabocha', 'veg.bananaflower'}
V = [v for v in V if v['id'] not in drop]
SUB = [("root", "Roots and tubers"), ("bulb", "Onions and their kin (bulbs)"), ("stem", "Stems, stalks and shoots"), ("leafy", "Leafy greens and salads"),
       ("brassica", "The cabbage family"), ("fruitveg", "Fruit vegetables"), ("cucurbit", "Squashes, gourds and cucumbers"), ("legume", "Pods, beans and peas"),
       ("flower", "Flowers and buds"), ("sea", "Sea vegetables")]
concepts = []
for t in (1, 2, 3):
    tv = sorted([v for v in V if v['tier'] == t], key=lambda v: -(v.get('links') or 0))
    for i, v in enumerate(tv):
        c = {"id": v['id'], "gloss": v['gloss'], "subgroup": v['subgroup'], "tier": t, "rank": i + 1}
        if v.get('qid'): c['wikidata'] = v['qid']
        concepts.append(c)
w('core/fields/food.vegetables.json', {"field": "food.vegetables", "title": "Vegetables", "subgroups": [{"id": a, "title": b} for a, b in SUB],
  "sources": ["Wikipedia, “List of vegetables” (retrieved 2026-10-08)", "Wikidata: item ids; the number of Wikipedia editions per item as the measure of how widely known a vegetable is (tiers and ranks)",
              "Added for the course languages and cuisines: wild garlic (Bärlauch), stinging nettle, root parsley, molokhia, garlic chives, Savoy and pointed cabbage, rhubarb",
              "Left out: herbs, mushrooms, pulses and fruits (their own fields), plants with a common name in fewer than two of the course languages"],
  "concepts": concepts})
A = lambda sub: [c['id'] for c in concepts if c['tier'] == t and c['subgroup'] in sub]
nodes = [{"id": "core.1", "kind": "core", "title": "Me, you and the first verbs", "concepts": [c[0] for c in core], "prereqs": []}]
t = 1; nodes.append({"id": "veg.1", "kind": "field", "field": "food.vegetables", "tier": 1, "title": "Vegetables I — the everyday ones", "concepts": [c['id'] for c in concepts if c['tier'] == 1], "prereqs": ["core.1"]})
G1 = {"root", "bulb", "stem", "leafy"}; G2 = {"brassica", "fruitveg", "cucurbit", "legume", "flower", "sea"}
t = 2; nodes.append({"id": "veg.2a", "kind": "field", "field": "food.vegetables", "tier": 2, "title": "Vegetables II — roots, bulbs, stems and greens", "concepts": A(G1), "prereqs": ["veg.1"]})
nodes.append({"id": "veg.2b", "kind": "field", "field": "food.vegetables", "tier": 2, "title": "Vegetables II — cabbages, fruit vegetables, gourds and pods", "concepts": A(G2), "prereqs": ["veg.1"]})
t = 3; nodes.append({"id": "veg.3a", "kind": "field", "field": "food.vegetables", "tier": 3, "title": "Vegetables III — rare roots, bulbs, stems and greens", "concepts": A(G1), "prereqs": ["veg.2a"]})
nodes.append({"id": "veg.3b", "kind": "field", "field": "food.vegetables", "tier": 3, "title": "Vegetables III — rare cabbages, gourds, pods, flowers and seaweeds", "concepts": A(G2), "prereqs": ["veg.2b"]})
w('core/nodes.json', {"nodes": nodes})
fns = [("fn.definite", "The and a: definiteness", "morphosyntax", [], ["Definiteness"]),
       ("fn.plural.noun", "More than one: plural of nouns", "morphology", ["fn.definite"], ["Number"]),
       ("fn.negation", "Saying no: negation", "syntax", [], ["Polarity"]),
       ("fn.question.yesno", "Yes/no questions", "syntax", [], ["Mood"])]
for f in fns: w(f'core/functions/{f[0]}.json', {"id": f[0], "title": f[1], "category": f[2], "level": "A1", "after": f[3], "tags": f[4]})
w('core/frames.json', {"frames": [
  {"id": "fr.eat.def", "meaning": "PERSON eats the VEGETABLE (a specific one)"},
  {"id": "fr.buy.indef", "meaning": "PERSON buys a VEGETABLE (one, not specific)"},
  {"id": "fr.like.generic", "meaning": "PERSON likes VEGETABLES (in general)"},
  {"id": "fr.notlike.generic", "meaning": "PERSON does not like VEGETABLES (in general)"},
  {"id": "fr.want.q", "meaning": "Do you (one person) want VEGETABLE? (yes/no question)"},
  {"id": "fr.this.is", "meaning": "This is a VEGETABLE."},
  {"id": "fr.where.def", "meaning": "Where is the VEGETABLE?"},
  {"id": "fr.have.indef", "meaning": "PERSON has a VEGETABLE."},
  {"id": "fr.here.def", "meaning": "The VEGETABLE is here."},
  {"id": "fr.drink.what", "meaning": "What does PERSON drink?"}]})
print(len(concepts), [ (n['id'], len(n['concepts'])) for n in nodes])
