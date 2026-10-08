#!/usr/bin/env python3
"""Writes the language-neutral core of the foundations (docs/LANGUAGES.md D9–D11, §4.4.1) into a language course:
the concepts of the 19 steps (S00–S18) as thematic fields, the lesson nodes fd.00–fd.18, their grammar functions,
the frames of their sentences and core/typology.json. The vegetables (and later fields) come after fd.18.

  python3 tools/lang_sources/foundations/mkfoundations.py library/languages/polyglot-semitic-zh-de

Rerunning it rewrites those files (and moves nothing else); the words already written for a concept stay valid,
because lexicon files refer to concepts — only the node a concept belongs to may change (then move the lexeme).
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------- the concepts: field → subgroups, concepts (id, gloss) in teaching order ----------
# glosses say which sense is meant whenever English is ambiguous (old of things / of people, to leave a place …)
FIELDS = {
 'core': ('Function words', 'The small words every sentence needs (docs/LANGUAGES.md §4.4.1)', [
  ('pron', 'Personal pronouns', [('pron.i', 'I'), ('pron.you.sg', 'you (one person)'), ('pron.he', 'he'), ('pron.she', 'she'), ('pron.it', 'it (a thing)'),
                                 ('pron.we', 'we'), ('pron.you.pl', 'you (several people)'), ('pron.they', 'they')]),
  ('verb', 'To be, to have', [('verb.be', 'to be'), ('poss.have', 'to have (possession)')]),
  ('poss', 'My, your …', [('poss.my', 'my'), ('poss.your.sg', 'your (of one person)'), ('poss.his', 'his'), ('poss.her', 'her (possessive)'),
                          ('poss.our', 'our'), ('poss.your.pl', 'your (of several people)'), ('poss.their', 'their')]),
  ('dem', 'This and that', [('dem.this', 'this'), ('dem.that', 'that'), ('dem.these', 'these'), ('dem.those', 'those'), ('adv.here', 'here'), ('adv.there', 'there')]),
  ('det', 'Articles', [('det.def', 'the (definite article)'), ('det.indef', 'a, an (indefinite article)')]),
  ('quant', 'How much', [('quant.many', 'many, a lot of'), ('quant.few', 'few, not many'), ('quant.alittle', 'a little (of something)'), ('quant.all', 'all, every'), ('quant.some', 'some')]),
  ('neg', 'Saying no', [('part.yes', 'yes'), ('part.no', 'no (the answer)'), ('part.not', 'not (negation)'), ('det.none', 'no, not any (I have no car)'),
                        ('pron.nothing', 'nothing'), ('pron.nobody', 'nobody, no one'), ('adv.never', 'never'), ('conj.neithernor', 'neither … nor')]),
  ('ask', 'Asking', [('conj.or', 'or'), ('adv.maybe', 'maybe, perhaps'), ('adv.really', 'really? (surprise, interest)'), ('adv.ofcourse', 'of course'),
                     ('adv.also', 'also, too, as well'), ('adv.only', 'only, just')]),
  ('q', 'Question words', [('q.what', 'what?'), ('q.who', 'who?'), ('q.where', 'where?'), ('q.when', 'when?'), ('q.how', 'how?'), ('q.why', 'why?'),
                           ('q.howmany', 'how many? how much?'), ('q.which', 'which?'), ('q.whose', 'whose?')]),
  ('prep', 'Prepositions', [('prep.in', 'in (inside a place)'), ('prep.at', 'at (a place: at home, at school)'), ('prep.to', 'to (towards a place)'),
                            ('prep.from', 'from (a place, a person)'), ('prep.with', 'with (together with; with milk)'), ('prep.without', 'without'),
                            ('prep.for', 'for (a person, a purpose)'), ('prep.about', 'about (a topic)'),
                            ('prep.on', 'on (on top of)'), ('prep.under', 'under'), ('prep.nextto', 'next to, beside'), ('prep.infront', 'in front of'),
                            ('prep.behind', 'behind'), ('prep.between', 'between'),
                            ('prep.before', 'before (in time)'), ('prep.after', 'after (in time)'), ('prep.until', 'until'), ('prep.since', 'since (a point in time)'),
                            ('prep.during', 'during'), ('prep.attime', 'at (a time: at five o’clock)'), ('prep.onday', 'on (a day: on Monday)'), ('prep.inmonth', 'in (a month, a season, a year)')]),
  ('where', 'Where', [('adv.near', 'near, close (to)'), ('adv.far', 'far (from)'), ('adv.inside', 'inside, in'), ('adv.outside', 'outside, out'),
                      ('adv.left', '(on the) left'), ('adv.right', '(on the) right')]),
  ('link', 'Linking words', [('conj.and', 'and'), ('conj.but', 'but'), ('conj.because', 'because'), ('conj.so', 'so, therefore'), ('adv.then', 'then, after that'),
                             ('conj.when', 'when (conjunction: when I come …)'), ('conj.if', 'if'), ('conj.that', 'that (conjunction: I know that …)'), ('conj.although', 'although'),
                             ('adv.more', 'more'), ('adv.most', 'most, the most'), ('conj.than', 'than (bigger than)')]),
 ]),
 'people': ('People and jobs', 'Basic words for people; the common jobs', [
  ('person', 'People', [('person.man', 'man'), ('person.woman', 'woman'), ('person.boy', 'boy'), ('person.girl', 'girl'), ('person.child', 'child'),
                        ('person.person', 'person'), ('person.people', 'people'), ('person.friend', 'friend'), ('person.student', 'student (at school or university)'),
                        ('person.teacher', 'teacher')]),
  ('job', 'Jobs', [('job.doctor', 'doctor'), ('job.nurse', 'nurse'), ('job.engineer', 'engineer'), ('job.driver', 'driver'), ('job.cook', 'cook (the job)'),
                   ('job.seller', 'shop assistant, salesperson'), ('job.worker', 'worker'), ('job.farmer', 'farmer'), ('job.police', 'police officer'),
                   ('job.lawyer', 'lawyer'), ('job.artist', 'artist')]),
 ]),
 'greetings': ('Greetings and polite words', 'The formulas of everyday contact', [
  ('greet', 'Greetings', [('greet.hello', 'hello'), ('greet.goodmorning', 'good morning'), ('greet.goodevening', 'good evening'), ('greet.goodnight', 'good night'),
                          ('greet.goodbye', 'goodbye'), ('greet.seeyou', 'see you (later)'), ('greet.howareyou', 'how are you?'), ('greet.fine', 'fine, well (I am fine)'),
                          ('greet.myname', 'my name is …'), ('greet.nicetomeet', 'nice to meet you')]),
  ('polite', 'Polite words', [('greet.thanks', 'thank you'), ('greet.welcome', 'you’re welcome'), ('greet.please', 'please'), ('greet.sorry', 'sorry (apology)'),
                              ('greet.excuseme', 'excuse me (to get attention or pass)')]),
 ]),
 'home': ('At home', 'The home, its rooms, furniture and everyday things', [
  ('house', 'The house', [('home.house', 'house'), ('home.flat', 'flat, apartment'), ('home.room', 'room'), ('home.door', 'door'), ('home.window', 'window'), ('home.wall', 'wall')]),
  ('furniture', 'Furniture', [('home.table', 'table'), ('home.chair', 'chair'), ('home.bed', 'bed'), ('home.cupboard', 'cupboard, wardrobe'), ('home.lamp', 'lamp')]),
  ('things', 'Everyday things', [('obj.book', 'book'), ('obj.pen', 'pen'), ('obj.paper', 'paper'), ('obj.phone', 'phone'), ('obj.key', 'key'), ('obj.bag', 'bag'),
                                 ('obj.cup', 'cup'), ('obj.glass', 'glass (for drinking)'), ('obj.plate', 'plate')]),
  ('rooms', 'Rooms and parts of the home', [('home.kitchen', 'kitchen'), ('home.bathroom', 'bathroom'), ('home.bedroom', 'bedroom'), ('home.livingroom', 'living room'),
                                            ('home.garden', 'garden'), ('home.floor', 'floor (of a room)'), ('home.stairs', 'stairs'), ('home.shelf', 'shelf'),
                                            ('home.sofa', 'sofa'), ('home.fridge', 'fridge')]),
 ]),
 'numbers': ('Numbers', 'Cardinal numbers', [
  ('num', 'Numbers', [('num.%d' % n, w) for n, w in [(0, 'zero'), (1, 'one'), (2, 'two'), (3, 'three'), (4, 'four'), (5, 'five'), (6, 'six'), (7, 'seven'), (8, 'eight'),
        (9, 'nine'), (10, 'ten'), (11, 'eleven'), (12, 'twelve'), (13, 'thirteen'), (14, 'fourteen'), (15, 'fifteen'), (16, 'sixteen'), (17, 'seventeen'), (18, 'eighteen'),
        (19, 'nineteen'), (20, 'twenty'), (30, 'thirty'), (40, 'forty'), (50, 'fifty'), (60, 'sixty'), (70, 'seventy'), (80, 'eighty'), (90, 'ninety'),
        (100, 'a hundred'), (1000, 'a thousand')]]),
 ]),
 'family': ('Family', 'The family, the extended family included', [
  ('core', 'The close family', [('family.family', 'family'), ('family.parents', 'parents'), ('family.mother', 'mother'), ('family.father', 'father'), ('family.son', 'son'),
                                ('family.daughter', 'daughter'), ('family.brother', 'brother'), ('family.sister', 'sister'), ('family.husband', 'husband'), ('family.wife', 'wife'),
                                ('family.baby', 'baby')]),
  ('extended', 'The extended family', [('family.grandparents', 'grandparents'), ('family.grandfather', 'grandfather'), ('family.grandmother', 'grandmother'),
                                       ('family.grandson', 'grandson'), ('family.granddaughter', 'granddaughter'), ('family.uncle', 'uncle'), ('family.aunt', 'aunt'),
                                       ('family.cousin', 'cousin'), ('family.nephew', 'nephew'), ('family.niece', 'niece'), ('family.relative', 'relative')]),
 ]),
 'food.basics': ('Food and drink', 'Everyday food, drinks and meals (vegetables, fruit and the rest have their own fields)', [
  ('food', 'Food', [('food.bread', 'bread'), ('food.cheese', 'cheese'), ('food.egg', 'egg'), ('food.meat', 'meat'), ('food.fish', 'fish (as food)'),
                    ('food.chicken', 'chicken (as food)'), ('food.rice', 'rice (cooked, as food)'), ('food.soup', 'soup'), ('food.salad', 'salad (the dish)'),
                    ('food.fruit', 'fruit'), ('food.apple', 'apple'), ('food.sugar', 'sugar'), ('food.salt', 'salt')]),
  ('drink', 'Drinks', [('drink.water', 'water'), ('drink.tea', 'tea'), ('drink.coffee', 'coffee'), ('drink.milk', 'milk'), ('drink.juice', 'juice'), ('drink.wine', 'wine'), ('drink.beer', 'beer')]),
  ('meal', 'Meals', [('meal.breakfast', 'breakfast'), ('meal.lunch', 'lunch'), ('meal.dinner', 'dinner, supper')]),
 ]),
 'town': ('In town', 'Places in a town', [
  ('place', 'Places', [('place.home', 'home (at home, go home)'), ('place.school', 'school'), ('place.university', 'university'), ('place.work', 'work (the workplace: at work)'),
                       ('place.office', 'office'), ('place.shop', 'shop'), ('place.supermarket', 'supermarket'), ('place.market', 'market'), ('place.restaurant', 'restaurant'),
                       ('place.cafe', 'café'), ('place.hospital', 'hospital'), ('place.pharmacy', 'pharmacy'), ('place.bank', 'bank (money)'), ('place.postoffice', 'post office'),
                       ('place.station', 'station (train or bus)'), ('place.airport', 'airport'), ('place.street', 'street'), ('place.square', 'square (in a town)'),
                       ('place.park', 'park'), ('place.city', 'city, town'), ('place.village', 'village'), ('place.country', 'country (a state)')]),
 ]),
 'transport': ('Transport', 'How we travel', [
  ('tr', 'Transport', [('tr.bus', 'bus'), ('tr.train', 'train'), ('tr.plane', 'plane'), ('tr.taxi', 'taxi'), ('tr.car', 'car'), ('tr.bicycle', 'bicycle'),
                       ('tr.boat', 'boat, ship'), ('tr.onfoot', 'on foot'), ('tr.ticket', 'ticket')]),
 ]),
 'verbs': ('Everyday verbs', 'The first verbs: eating and drinking, going and coming', [
  ('eat', 'Eating and drinking', [('verb.eat', 'to eat'), ('verb.drink', 'to drink'), ('verb.want', 'to want'), ('verb.like', 'to like'), ('verb.cook', 'to cook'), ('verb.buy', 'to buy')]),
  ('move', 'Going and coming', [('verb.go', 'to go'), ('verb.come', 'to come'), ('verb.walk', 'to walk, go on foot'), ('verb.run', 'to run'), ('verb.drive', 'to drive (a car)'),
                                ('verb.travel', 'to travel'), ('verb.return', 'to return, come back'), ('verb.enter', 'to enter, go in'), ('verb.leave', 'to leave, go out (of a place)'),
                                ('verb.arrive', 'to arrive'), ('verb.stay', 'to stay'), ('verb.wait', 'to wait')]),
 ]),
 'time': ('Time', 'Days, months, seasons and the words of time', [
  ('days', 'The days of the week', [('time.monday', 'Monday'), ('time.tuesday', 'Tuesday'), ('time.wednesday', 'Wednesday'), ('time.thursday', 'Thursday'),
                                    ('time.friday', 'Friday'), ('time.saturday', 'Saturday'), ('time.sunday', 'Sunday'), ('time.weekend', 'weekend')]),
  ('day', 'The day', [('time.day', 'day'), ('time.night', 'night'), ('time.morning', 'morning'), ('time.noon', 'noon, midday'), ('time.afternoon', 'afternoon'),
                      ('time.evening', 'evening'), ('time.today', 'today'), ('time.tomorrow', 'tomorrow'), ('time.yesterday', 'yesterday')]),
  ('when', 'When and how often', [('adv.now', 'now'), ('adv.later', 'later'), ('adv.soon', 'soon'), ('adv.early', 'early'), ('adv.late', 'late'),
                                  ('adv.always', 'always'), ('adv.often', 'often'), ('adv.sometimes', 'sometimes')]),
  ('months', 'The months', [('time.' + m.lower(), m) for m in ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']]),
  ('seasons', 'The seasons', [('time.spring', 'spring (the season)'), ('time.summer', 'summer'), ('time.autumn', 'autumn, fall'), ('time.winter', 'winter')]),
  ('units', 'Units of time', [('time.week', 'week'), ('time.month', 'month'), ('time.year', 'year'), ('time.hour', 'hour'), ('time.minute', 'minute'),
                              ('time.oclock', 'o’clock (telling the time)'), ('time.date', 'date (day of the month)'), ('time.birthday', 'birthday'), ('time.holiday', 'holiday, vacation')]),
 ]),
 'qualities': ('Describing', 'The first adjectives, in pairs of opposites', [
  ('adj', 'Adjectives', [('adj.big', 'big'), ('adj.small', 'small'), ('adj.long', 'long'), ('adj.short', 'short (length)'), ('adj.tall', 'tall (person, building)'),
                         ('adj.good', 'good'), ('adj.bad', 'bad'), ('adj.new', 'new'), ('adj.old.thing', 'old (of things)'), ('adj.young', 'young'), ('adj.old.person', 'old (of people)'),
                         ('adj.hot', 'hot'), ('adj.cold', 'cold'), ('adj.warm', 'warm'), ('adj.beautiful', 'beautiful'), ('adj.ugly', 'ugly'), ('adj.easy', 'easy'),
                         ('adj.difficult', 'difficult'), ('adj.cheap', 'cheap'), ('adj.expensive', 'expensive'), ('adj.happy', 'happy, glad'), ('adj.sad', 'sad'),
                         ('adj.tired', 'tired'), ('adj.hungry', 'hungry'), ('adj.thirsty', 'thirsty'), ('adj.fast', 'fast'), ('adj.slow', 'slow')]),
 ]),
 'colours': ('Colours', 'The basic colour words', [
  ('colour', 'Colours', [('colour.white', 'white'), ('colour.black', 'black'), ('colour.red', 'red'), ('colour.blue', 'blue'), ('colour.green', 'green'),
                         ('colour.yellow', 'yellow'), ('colour.brown', 'brown'), ('colour.grey', 'grey'), ('colour.orange', 'orange (colour)'), ('colour.pink', 'pink'),
                         ('colour.purple', 'purple'), ('adj.light', 'light (of a colour)'), ('adj.dark', 'dark (of a colour)')]),
 ]),
}

# ---------- the steps (D10: one spine for every language; the grammar per type and per language) ----------
G = lambda f: [c for c, _ in next(s for s in FIELDS[f.split('/')[0]][2] if s[0] == f.split('/')[1])[2]]
STEPS = [
 ('fd.00', 'The language and the four types of languages', [], {'*': ['fn.overview'], 'isolating': ['fn.tones']}),
 ('fd.01', 'I, you, he … — to be — people', G('core/pron') + ['verb.be', 'conj.and', 'det.def', 'det.indef'] + G('people/person'),
  {'*': ['fn.pronoun.subject', 'fn.copula'], 'agglutinating': ['fn.personal.suffix'], 'polysynthetic': ['fn.verb.person']}),
 ('fd.02', 'Hello, thank you: greetings and polite words', G('greetings/greet') + G('greetings/polite') + ['part.yes', 'part.no'], {'*': ['fn.greetings']}),
 ('fd.03', 'This and that, here and there', G('core/dem'), {'*': ['fn.demonstrative'], 'isolating': ['fn.measure.word']}),
 ('fd.04', 'Things at home: the noun, its gender and the article', G('home/house') + G('home/furniture') + G('home/things'),
  {'*': ['fn.noun.gender', 'fn.definite'], 'fusional': ['fn.agreement', 'fn.case.basic'], 'agglutinating': ['fn.case.basic']}),
 ('fd.05', 'Numbers and the plural', G('numbers/num') + G('core/quant'), {'*': ['fn.numerals', 'fn.plural.noun'], 'agglutinating': ['fn.vowel.harmony']}),
 ('fd.06', 'To have — the family — my, your', ['poss.have'] + G('family/core') + G('family/extended') + G('core/poss'), {'*': ['fn.have', 'fn.possessive']}),
 ('fd.07', 'Eating and drinking: verbs in the present', G('verbs/eat') + G('food.basics/food') + G('food.basics/drink') + G('food.basics/meal'),
  {'*': ['fn.present', 'fn.object'], 'isolating': ['fn.word.order'], 'polysynthetic': ['fn.incorporation'], 'ar': ['fn.root.pattern'], 'he': ['fn.root.pattern']}),
 ('fd.08', 'No, not, nothing: negation', ['part.not', 'det.none', 'pron.nothing', 'pron.nobody', 'adv.never', 'conj.neithernor'], {'*': ['fn.negation']}),
 ('fd.09', 'Yes or no? Questions', G('core/ask'), {'*': ['fn.question.yesno']}),
 ('fd.10', 'Who, what, where …? — jobs', G('core/q') + G('people/job'), {'*': ['fn.question.wh']}),
 ('fd.11', 'In, at, to, from, with — places in town', ['prep.in', 'prep.at', 'prep.to', 'prep.from', 'prep.with', 'prep.without', 'prep.for', 'prep.about'] + G('town/place'),
  {'*': ['fn.prep.core'], 'fusional': ['fn.case'], 'agglutinating': ['fn.case'], 'polysynthetic': ['fn.case']}),
 ('fd.12', 'On, under, next to … — rooms and furniture', ['prep.on', 'prep.under', 'prep.nextto', 'prep.infront', 'prep.behind', 'prep.between'] + G('core/where') + G('home/rooms'),
  {'*': ['fn.prep.place']}),
 ('fd.13', 'Going and coming — transport', G('verbs/move') + G('transport/tr'), {'*': ['fn.direction', 'fn.imperative']}),
 ('fd.14', 'The days and the day', G('time/days') + G('time/day') + G('time/when'), {'*': ['fn.time.day'], 'isolating': ['fn.aspect']}),
 ('fd.15', 'The months, the seasons, the year', G('time/months') + G('time/seasons') + G('time/units') + ['prep.before', 'prep.after', 'prep.until', 'prep.since', 'prep.during', 'prep.attime', 'prep.onday', 'prep.inmonth'],
  {'*': ['fn.prep.time']}),
 ('fd.16', 'Describing: adjectives', G('qualities/adj'), {'*': ['fn.adjective']}),
 ('fd.17', 'Colours — bigger, the biggest', G('colours/colour') + ['adv.more', 'adv.most', 'conj.than'], {'*': ['fn.comparison']}),
 ('fd.18', 'But, because, so: linking words', ['conj.but', 'conj.because', 'conj.so', 'adv.then', 'conj.when', 'conj.if', 'conj.that', 'conj.although'], {'*': ['fn.connectors']}),
]

FUNCTIONS = [  # id, title, category, tags
 ('fn.overview', 'The language at a glance — and the four types of languages', 'overview', []),
 ('fn.tones', 'Tones and syllables', 'phonology', ['Tone']),
 ('fn.pronoun.subject', 'I, you, he …: the subject pronouns', 'morphosyntax', ['Person']),
 ('fn.copula', 'To be: linking a subject to what it is', 'syntax', []),
 ('fn.personal.suffix', 'Personal endings on nouns and adjectives (I am a teacher = teacher-I)', 'morphology', ['Person']),
 ('fn.verb.person', 'Who does it: person markers on the verb', 'morphology', ['Person']),
 ('fn.greetings', 'Greetings and forms of address (formal and informal)', 'pragmatics', ['Politeness']),
 ('fn.noun.gender', 'The gender of nouns', 'morphology', ['Gender']),
 ('fn.definite', 'The and a: definiteness', 'morphosyntax', ['Definiteness']),
 ('fn.agreement', 'Agreement: words that change with the noun', 'morphosyntax', ['Gender', 'Number']),
 ('fn.demonstrative', 'This, that, these, those', 'morphosyntax', ['Deixis']),
 ('fn.measure.word', 'Measure words (classifiers)', 'morphosyntax', []),
 ('fn.numerals', 'Numbers and counting', 'morphosyntax', ['Number']),
 ('fn.plural.noun', 'More than one: plural of nouns', 'morphology', ['Number']),
 ('fn.vowel.harmony', 'Vowel harmony', 'phonology', []),
 ('fn.have', 'To have', 'syntax', ['Possession']),
 ('fn.possessive', 'My, your, his …: possession', 'morphosyntax', ['Possession']),
 ('fn.present', 'The present tense (or what the language uses instead)', 'morphology', ['Tense']),
 ('fn.object', 'The direct object (accusative): who or what is affected', 'morphosyntax', ['Case']),
 ('fn.word.order', 'Word order: subject – verb – object', 'syntax', []),
 ('fn.incorporation', 'Noun incorporation: the object inside the verb', 'morphology', []),
 ('fn.root.pattern', 'Roots and patterns', 'morphology', []),
 ('fn.negation', 'Saying no: negation', 'syntax', ['Polarity']),
 ('fn.question.yesno', 'Yes/no questions', 'syntax', ['Mood']),
 ('fn.question.wh', 'Questions with question words', 'syntax', []),
 ('fn.prep.core', 'In / at / to, from, with: the core prepositions (Greek σε, από, με)', 'morphosyntax', []),
 ('fn.case.basic', 'What a case is — the subject form (nominative)', 'morphology', ['Case']),
 ('fn.case', 'Cases after prepositions: where, where to, where from (dative, genitive, locative …)', 'morphology', ['Case']),
 ('fn.imperative', 'Commands and requests: the imperative', 'morphology', ['Mood']),
 ('fn.prep.place', 'Where things are: prepositions of place', 'morphosyntax', []),
 ('fn.direction', 'Movement: where to, where from, by what', 'morphosyntax', []),
 ('fn.time.day', 'Saying when: days, parts of the day, how often', 'syntax', []),
 ('fn.aspect', 'Aspect: done (了), ever done (过), in progress (在)', 'morphosyntax', ['Aspect']),
 ('fn.prep.time', 'Time: before, after, until, since; the clock and the date', 'morphosyntax', []),
 ('fn.adjective', 'Adjectives: describing things and people', 'morphosyntax', []),
 ('fn.comparison', 'Comparison: bigger, the biggest', 'morphology', ['Degree']),
 ('fn.connectors', 'Linking words: and, but, because, so …', 'syntax', []),
]

FRAMES = [  # the meanings the lesson sentences realize (§4.8); vegetables frames stay as they are
 ('fr.be.person', 'PERSON is a PERSON-WORD / JOB (I am a student)'), ('fr.be.where', 'PERSON or THING is here / there / at PLACE'),
 ('fr.greet', 'a greeting or polite formula, or a short exchange (Hello! — How are you? — Fine, thank you.)'),
 ('fr.this.is', 'This / that is a THING (a book, a vegetable, a person …).'), ('fr.thing.here', 'The THING is here / there.'), ('fr.count', 'NUMBER THINGS (I have two keys; three books are here)'),
 ('fr.have', 'PERSON has a THING / a RELATIVE'), ('fr.poss', 'This is my / your … THING or RELATIVE'),
 ('fr.eat', 'PERSON eats / drinks / cooks / buys FOOD or DRINK'), ('fr.want', 'PERSON wants / likes FOOD, DRINK or THING'),
 ('fr.alt.q', 'Do you want X or Y? (choice question)'), ('fr.who', 'Who is PERSON? — PERSON is a JOB'), ('fr.wh', 'a question with a question word (what, where, when, how, why, how many, which, whose)'),
 ('fr.at.place', 'PERSON is at / in PLACE; PERSON is with PERSON; THING is for PERSON; THING with / without THING'),
 ('fr.place.on', 'THING is on / under / next to / in front of / behind / between THING(S); PLACE is near / far'),
 ('fr.go.to', 'PERSON goes / comes / returns to PLACE (by TRANSPORT)'), ('fr.command', 'a command or request: Come! Go to PLACE! Wait! Please sit down.'), ('fr.from', 'PERSON comes / leaves from PLACE'),
 ('fr.day', 'On DAY / in the MORNING … PERSON does something; today is DAY'), ('fr.time', 'PERSON does something at TIME / in MONTH / before / after / until …'),
 ('fr.adj.pred', 'THING or PERSON is ADJECTIVE'), ('fr.adj.attr', 'an ADJECTIVE THING (This is a big house.)'), ('fr.compare', 'THING is more ADJECTIVE than THING; the most ADJECTIVE'),
 ('fr.colour', 'The THING is COLOUR; a COLOUR THING'), ('fr.link', 'CLAUSE but / because / so / when / if / although CLAUSE'),
]


def main(root):
    J = lambda rel: json.load(open(os.path.join(root, rel), encoding='utf-8'))
    def W(rel, obj):
        p = os.path.join(root, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, indent=1); f.write('\n')
    seen = set()
    for fid, (title, src, subs) in FIELDS.items():
        concepts, rank = [], 0
        for sg, _, cs in subs:
            for cid, gloss in cs:
                assert cid not in seen, cid; seen.add(cid); rank += 1
                concepts.append({'id': cid, 'gloss': gloss, 'subgroup': sg, 'tier': 1, 'rank': rank})
        W(f'core/fields/{fid}.json', {'field': fid, 'title': title, 'subgroups': [{'id': sg, 'title': t} for sg, t, _ in subs],
                                      'sources': [src + ' — the foundations of the course (docs/LANGUAGES.md D9, §4.4.1)'], 'concepts': concepts})
    used = [c for _, _, cs, _ in STEPS for c in cs]
    assert len(used) == len(set(used)), [c for c in used if used.count(c) > 1]
    assert set(used) == seen, (seen - set(used), set(used) - seen)
    nodes = [n for n in J('core/nodes.json')['nodes'] if not n['id'].startswith('fd.') and n['id'] != 'core.1']
    for n in nodes:
        if n.get('prereqs') == ['core.1']: n['prereqs'] = ['fd.18']
    lessons = [{'id': nid, 'kind': 'lesson', 'stage': 'foundations', 'step': i, 'title': t, 'concepts': cs, 'functions': fn, 'prereqs': [STEPS[i - 1][0]] if i else []}
               for i, (nid, t, cs, fn) in enumerate(STEPS)]
    W('core/nodes.json', {'nodes': lessons + nodes})
    for fid, title, cat, tags in FUNCTIONS:
        p = f'core/functions/{fid}.json'
        old = J(p) if os.path.exists(os.path.join(root, p)) else {}
        W(p, {'id': fid, 'title': title, 'category': cat, 'level': 'A1', 'after': old.get('after', []), 'tags': tags})
    fr = J('core/frames.json'); mine = dict(FRAMES)
    for f in fr['frames']:
        if f['id'] in mine: f['meaning'] = mine.pop(f['id'])
    fr['frames'] += [{'id': i, 'meaning': m} for i, m in FRAMES if i in mine]
    W('core/frames.json', fr)
    W('core/typology.json', json.load(open(os.path.join(HERE, 'typology.json'), encoding='utf-8')))
    print(f'{len(seen)} concepts in {len(FIELDS)} fields · {len(STEPS)} lessons · {len(FUNCTIONS)} functions · {len(FRAMES)} frames')

if __name__ == '__main__': main(sys.argv[1])
