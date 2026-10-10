#!/usr/bin/env python3
"""Writes the language-neutral core C01–C48 (docs/LANGUAGES.md D17, §4.4.2, approved by the user 2026-10-09) into a
language course: the lesson nodes cr.01–cr.48 (stage core, after fd.18, after the fields already there), their concepts
(complete thematic groups; meanings that were pending — D15 — are placed here and lose "pending"), their grammar
functions per language type, and their frames. New nodes go into course.json "draft" until their words are written.

  python3 tools/lang_sources/core/mkcore.py library/languages/polyglot-semitic-zh-de

Rerunning it rewrites the cr.* nodes, the core functions and the core frames, and adds missing concepts; it never removes
a concept that words already use.

HARD CONSTRAINTS (docs/LANGUAGE_RULES.md): the common order of all language paths (D13) — a lesson or concept moved here
moves for every language of every course; every word written for these lessons states its whole facade (D14), every
meaning is a concept (D15), texts are neutral and comparisons go into notes for the reference set (D16, D18), sentences
may carry ≤ ⌈30 %⌉ unknown words (D19).
"""
import json, os, sys, glob, unicodedata

T = lambda *xs: list(xs)   # readable lists

# (id, step, level, title, [(concept id, gloss)], functions {"*": [...], type: [...], code: [...]}, [(frame id, meaning)])
LESSONS = [
 ('cr.01', 'A2', 'Yesterday: the past', [
   ('verb.wakeup', 'to wake up'), ('verb.getup', 'to get up'), ('verb.wash', 'to wash (oneself or something)'), ('verb.shower', 'to take a shower'),
   ('verb.getdressed', 'to get dressed'), ('verb.havebreakfast', 'to have breakfast'), ('verb.leavehome', 'to leave home, to go out'),
   ('verb.start', 'to start, to begin'), ('verb.finish', 'to finish, to end'), ('verb.comehome', 'to come home'), ('verb.gotobed', 'to go to bed'),
   ('verb.fallasleep', 'to fall asleep'), ('verb.sleep', 'to sleep')],
  {'*': ['fn.past']}, [('fr.past.action', 'PERSON did ACTION (yesterday / at TIME)'), ('fr.past.neg', 'PERSON did not do ACTION'), ('fr.past.q', 'Did PERSON do ACTION? / When did PERSON do ACTION?')]),
 ('cr.02', 'A2', 'How it used to be: the ongoing and the habitual past', [
   ('time.childhood', 'childhood'), ('obj.toy', 'toy'), ('abstract.game', 'game'), ('verb.play', 'to play'), ('verb.growup', 'to grow up'),
   ('verb.remember', 'to remember'), ('verb.forget', 'to forget'), ('place.kindergarten', 'kindergarten'), ('person.neighbour', 'neighbour'),
   ('time.holidays', 'the (school) holidays'), ('adv.usedto', 'used to (habitually, in the past)')],
  {'*': ['fn.past.ongoing']}, [('fr.used.to', 'When PERSON was a child, PERSON used to do ACTION'), ('fr.was.doing', 'PERSON was doing ACTION when …')]),
 ('cr.03', 'A2', 'Tomorrow: plans and the future', [
   ('abstract.plan', 'plan'), ('abstract.trip', 'trip, journey'), ('place.hotel', 'hotel'), ('verb.book', 'to book, to reserve'), ('obj.passport', 'passport'),
   ('obj.suitcase', 'suitcase'), ('place.abroad', 'abroad'), ('verb.visit', 'to visit'), ('person.tourist', 'tourist'), ('person.guide', 'guide (a person)'),
   ('time.nextweek', 'next week'), ('time.nextyear', 'next year')],
  {'*': ['fn.future']}, [('fr.future.plan', 'PERSON will / is going to do ACTION (next week)'), ('fr.future.q', 'What will PERSON do? Where will PERSON go?')]),
 ('cr.04', 'A2', 'First, second …: ordinal numbers, dates and the clock', [
   ('num.ord.1', 'first'), ('num.ord.2', 'second'), ('num.ord.3', 'third'), ('num.ord.4', 'fourth'), ('num.ord.5', 'fifth'), ('num.ord.6', 'sixth'),
   ('num.ord.7', 'seventh'), ('num.ord.8', 'eighth'), ('num.ord.9', 'ninth'), ('num.ord.10', 'tenth'), ('num.ord.last', 'last'),
   ('num.half', 'half'), ('num.quarter', 'quarter'), ('time.century', 'century'), ('time.decade', 'decade'), ('time.anniversary', 'anniversary')],
  {'*': ['fn.ordinals']}, [('fr.ordinal', 'the ORDINAL THING / PERSON (the third house)'), ('fr.date', 'Today is the ORDINAL of MONTH; PERSON was born in YEAR'), ('fr.clock', 'It is (half / a quarter past) HOUR')]),
 ('cr.05', 'A2', 'Can, must, may, need: modality', [
   ('verb.can', 'can, to be able to'), ('verb.must', 'must, to have to'), ('verb.may', 'may, to be allowed to'), ('verb.need', 'to need'),
   ('verb.should', 'should, ought to'), ('adj.allowed', 'allowed'), ('adj.forbidden', 'forbidden'), ('abstract.rule', 'rule'), ('obj.sign', 'sign (a notice)'),
   ('abstract.permission', 'permission'), ('adj.possible', 'possible'), ('adj.impossible', 'impossible'), ('adj.necessary', 'necessary')],
  {'*': ['fn.modal']}, [('fr.can', 'PERSON can / cannot do ACTION'), ('fr.must', 'PERSON must / need not do ACTION'), ('fr.allowed', 'ACTION is allowed / forbidden here')]),
 ('cr.06', 'A2', 'The body — "it hurts": who feels', [
   ('body.head', 'head'), ('body.hair', 'hair (on the head)'), ('body.face', 'face'), ('body.eye', 'eye'), ('body.ear', 'ear'), ('body.nose', 'nose'),
   ('body.mouth', 'mouth'), ('body.tooth', 'tooth'), ('body.tongue', 'tongue'), ('body.neck', 'neck'), ('body.shoulder', 'shoulder'), ('body.arm', 'arm'),
   ('body.hand', 'hand'), ('body.finger', 'finger'), ('body.chest', 'chest'), ('body.back', 'back (of the body)'), ('body.stomach', 'stomach, belly'),
   ('body.leg', 'leg'), ('body.knee', 'knee'), ('body.foot', 'foot'), ('body.toe', 'toe'), ('body.skin', 'skin'), ('body.heart', 'heart'),
   ('body.blood', 'blood'), ('body.bone', 'bone'), ('verb.hurt', 'to hurt (my head hurts)')],
  {'*': ['fn.experiencer']}, [('fr.hurts', 'PERSON\'s BODY-PART hurts'), ('fr.body', 'PERSON has (big / blue …) BODY-PARTs')]),
 ('cr.07', 'A2', 'At the doctor: advice and obligation', [
   ('adj.ill', 'ill, sick'), ('adj.healthy', 'healthy'), ('health.fever', 'fever'), ('health.cold', 'a cold (illness)'), ('health.cough', 'cough'),
   ('health.pain', 'pain'), ('health.medicine', 'medicine (a remedy)'), ('health.pill', 'pill, tablet'), ('health.appointment', 'appointment (at the doctor)'),
   ('verb.rest', 'to rest'), ('verb.getwell', 'to get well, to recover'), ('verb.take.medicine', 'to take (medicine)')],
  {'*': ['fn.advice']}, [('fr.advice', 'You should / had better do ACTION'), ('fr.ill', 'PERSON is ill / has a fever / a cold')]),
 ('cr.08', 'A2', 'Clothes and wearing', [
   ('clothes.shirt', 'shirt'), ('clothes.tshirt', 'T-shirt'), ('clothes.trousers', 'trousers'), ('clothes.skirt', 'skirt'), ('clothes.dress', 'dress'),
   ('clothes.jacket', 'jacket'), ('clothes.coat', 'coat'), ('clothes.sweater', 'sweater, jumper'), ('clothes.shoe', 'shoe'), ('clothes.boot', 'boot'),
   ('clothes.sock', 'sock'), ('clothes.hat', 'hat'), ('clothes.glove', 'glove'), ('clothes.scarf', 'scarf'), ('clothes.belt', 'belt'), ('clothes.pocket', 'pocket'),
   ('measure.size', 'size (of clothes, shoes)'), ('verb.wear', 'to wear, to have on'), ('verb.puton', 'to put on (clothes)'), ('verb.takeoff', 'to take off (clothes)')],
  {'*': ['fn.wear'], 'fusional': ['fn.agreement.plural']}, [('fr.wear', 'PERSON wears / puts on (COLOUR) CLOTHES'), ('fr.clothes.adj', 'The CLOTHES are (too) ADJECTIVE')]),
 ('cr.09', 'A2', 'Washing myself, meeting each other: reflexive and reciprocal verbs', [
   ('verb.washoneself', 'to wash (oneself)'), ('verb.shave', 'to shave'), ('verb.comb', 'to comb (one\'s hair)'), ('verb.brushteeth', 'to brush (one\'s teeth)'),
   ('verb.dryoneself', 'to dry oneself'), ('obj.towel', 'towel'), ('obj.soap', 'soap'), ('obj.toothbrush', 'toothbrush'), ('obj.mirror', 'mirror'),
   ('obj.shampoo', 'shampoo'), ('verb.meet', 'to meet'), ('pron.eachother', 'each other')],
  {'*': ['fn.reflexive']}, [('fr.reflexive', 'PERSON washes / dresses HIMSELF'), ('fr.reciprocal', 'PERSONS meet / see each other')]),
 ('cr.10', 'A2', 'Giving, sending, telling: two objects', [
   ('verb.give', 'to give'), ('verb.send', 'to send'), ('verb.show', 'to show'), ('verb.tell', 'to tell (someone something)'), ('verb.bring', 'to bring'),
   ('verb.lend', 'to lend'), ('verb.borrow', 'to borrow'), ('verb.explain', 'to explain'), ('obj.present', 'present, gift'), ('comm.letter', 'letter (a written message)'),
   ('obj.parcel', 'parcel, package'), ('comm.message', 'message'), ('obj.card', 'card (a greeting card)'), ('comm.address', 'address')],
  {'*': ['fn.indirect.object']}, [('fr.give', 'PERSON gives / sends / shows THING to PERSON'), ('fr.tell', 'PERSON tells PERSON something')]),
 ('cr.11', 'A2', 'Shopping: big numbers, prices and quantities', [
   ('num.200', 'two hundred'), ('num.500', 'five hundred'), ('num.10000', 'ten thousand'), ('num.100000', 'a hundred thousand'), ('num.1000000', 'a million'),
   ('money.price', 'price'), ('verb.cost', 'to cost'), ('money.money', 'money'), ('money.change', 'change (money given back)'), ('money.receipt', 'receipt'),
   ('measure.bottle', 'bottle'), ('measure.can', 'can, tin'), ('measure.box', 'box'), ('measure.packet', 'packet'), ('measure.kilo', 'kilo(gram)'),
   ('measure.gram', 'gram'), ('measure.litre', 'litre'), ('measure.piece', 'piece'), ('measure.pair', 'pair, couple'), ('measure.slice', 'slice')],
  {'*': ['fn.quantity']}, [('fr.price', 'THING costs NUMBER (money)'), ('fr.quantity', 'NUMBER CONTAINER(S) of FOOD (two bottles of water)')]),
 ('cr.12', 'A2', 'At the restaurant: polite requests', [
   ('food.menu', 'menu'), ('verb.order', 'to order (food, a taxi)'), ('money.bill', 'bill, check (at a restaurant)'), ('job.waiter', 'waiter, waitress'),
   ('money.tip', 'tip (money for service)'), ('food.dish', 'dish (food), course'), ('food.starter', 'starter'), ('food.dessert', 'dessert'),
   ('adj.vegetarian', 'vegetarian'), ('adj.spicy', 'spicy, hot (food)'), ('adj.sweet', 'sweet'), ('adj.sour', 'sour'), ('adj.bitter', 'bitter'),
   ('adj.salty', 'salty'), ('verb.wouldlike', 'would like (polite wish)')],
  {'*': ['fn.polite.request']}, [('fr.request', 'I would like FOOD; could you bring THING?'), ('fr.taste', 'The FOOD is TASTE-ADJECTIVE')]),
 ('cr.13', 'A2', 'The weather: sentences without a doer', [
   ('nature.sky', 'sky'), ('nature.sun', 'sun'), ('nature.moon', 'moon'), ('nature.star', 'star'), ('nature.cloud', 'cloud'), ('nature.rain', 'rain'),
   ('nature.snow', 'snow'), ('nature.wind', 'wind'), ('nature.storm', 'storm'), ('nature.fog', 'fog'), ('nature.ice', 'ice'), ('nature.weather', 'weather'),
   ('sci.temperature', 'temperature'), ('sci.degree', 'degree (of temperature)'), ('adj.sunny', 'sunny'), ('adj.cloudy', 'cloudy'), ('adj.wet', 'wet'), ('adj.dry', 'dry'),
   ('verb.rain', 'to rain'), ('verb.snow', 'to snow')],
  {'*': ['fn.impersonal']}, [('fr.weather', 'It is raining / snowing / windy; it is COLD / HOT'), ('fr.weather.when', 'Yesterday / tomorrow the weather was / will be ADJECTIVE')]),
 ('cr.14', 'A2', 'Nature: there is, there are', [
   ('nature.sea', 'sea'), ('nature.river', 'river'), ('nature.lake', 'lake'), ('nature.mountain', 'mountain'), ('nature.hill', 'hill'), ('nature.forest', 'forest, woods'),
   ('nature.field', 'field (farmland)'), ('nature.desert', 'desert'), ('nature.island', 'island'), ('nature.beach', 'beach'), ('nature.valley', 'valley'),
   ('nature.ground', 'ground, earth, soil'), ('nature.stone', 'stone, rock'), ('nature.tree', 'tree'), ('nature.flower', 'flower'), ('nature.grass', 'grass'),
   ('nature.leaf', 'leaf')],
  {'*': ['fn.existential']}, [('fr.there.is', 'There is / are (no) THING(S) at PLACE'), ('fr.nature.where', 'PLACE is near / behind THE MOUNTAIN …')]),
 ('cr.15', 'A2', 'Animals: irregular and collective plurals', [
   ('animal.dog', 'dog'), ('animal.cat', 'cat'), ('animal.horse', 'horse'), ('animal.cow', 'cow'), ('animal.sheep', 'sheep'), ('animal.goat', 'goat'),
   ('animal.pig', 'pig'), ('animal.chicken', 'chicken, hen (the bird)'), ('animal.duck', 'duck'), ('animal.bird', 'bird'), ('animal.fish', 'fish (the animal)'),
   ('animal.mouse', 'mouse'), ('animal.rabbit', 'rabbit'), ('animal.lion', 'lion'), ('animal.tiger', 'tiger'), ('animal.bear', 'bear'), ('animal.wolf', 'wolf'),
   ('animal.fox', 'fox'), ('animal.elephant', 'elephant'), ('animal.monkey', 'monkey'), ('animal.snake', 'snake'), ('animal.insect', 'insect'),
   ('animal.bee', 'bee'), ('animal.fly', 'fly (the insect)'), ('animal.butterfly', 'butterfly'), ('animal.animal', 'animal')],
  {'*': ['fn.plural.irregular']}, [('fr.animals', 'PERSON has / sees NUMBER ANIMALS'), ('fr.animal.does', 'The ANIMAL eats / lives / runs …')]),
 ('cr.16', 'A2', 'Feelings: how much — very, too, enough', [
   ('adj.angry', 'angry'), ('adj.afraid', 'afraid, scared'), ('adj.surprised', 'surprised'), ('adj.bored', 'bored'), ('adj.worried', 'worried'),
   ('adj.proud', 'proud'), ('adj.jealous', 'jealous'), ('adj.nervous', 'nervous'), ('adj.calm', 'calm'), ('verb.love', 'to love'), ('verb.hate', 'to hate'),
   ('verb.feel', 'to feel'), ('verb.laugh', 'to laugh'), ('verb.cry', 'to cry, to weep'), ('verb.smile', 'to smile'), ('adv.very', 'very'), ('adv.too', 'too (too big)'),
   ('adv.enough', 'enough'), ('adv.quite', 'quite, rather')],
  {'*': ['fn.degree']}, [('fr.feel', 'PERSON is / feels (very / too) FEELING'), ('fr.because.feel', 'PERSON is FEELING because …')]),
 ('cr.17', 'A2', 'Describing people: relative clauses', [
   ('adj.short.person', 'short (of a person, not tall)'), ('adj.fat', 'fat'), ('adj.thin', 'thin, slim'), ('body.beard', 'beard'), ('obj.glasses', 'glasses, spectacles'),
   ('adj.kind', 'kind, good-hearted'), ('adj.honest', 'honest, sincere'), ('adj.lazy', 'lazy'), ('adj.clever', 'clever, intelligent'), ('adj.shy', 'shy'),
   ('adj.funny', 'funny'), ('adj.polite', 'polite'), ('pron.who', 'who, the one who (relative)'), ('pron.which', 'which, that (relative)')],
  {'*': ['fn.relative']}, [('fr.relative', 'the PERSON who / THING that …'), ('fr.describe', 'PERSON is ADJECTIVE and has BODY-FEATURE')]),
 ('cr.18', 'A2', 'Whose is it: possession in depth', [
   ('home.armchair', 'armchair'), ('home.carpet', 'carpet, rug'), ('home.curtain', 'curtain'), ('home.washingmachine', 'washing machine'), ('home.oven', 'oven'),
   ('home.sink', 'sink'), ('verb.clean', 'to clean'), ('verb.washdishes', 'to wash the dishes'), ('verb.iron', 'to iron'), ('verb.tidy', 'to tidy up'),
   ('verb.sweep', 'to sweep'), ('home.rubbish', 'rubbish, garbage'), ('obj.lock', 'lock'), ('home.roof', 'roof')],
  {'*': ['fn.genitive']}, [('fr.genitive', 'the THING of PERSON / PLACE (my brother\'s car, the door of the house)'), ('fr.chores', 'PERSON cleans / tidies THE ROOM')]),
 ('cr.19', 'A2', 'Telling a story: one thing after another', [
   ('adv.first', 'first (adverb)'), ('adv.afterthat', 'after that, afterwards'), ('adv.finally', 'finally, in the end'), ('adv.suddenly', 'suddenly'),
   ('adv.meanwhile', 'meanwhile'), ('verb.happen', 'to happen'), ('verb.find', 'to find'), ('verb.lose', 'to lose (something)'), ('verb.decide', 'to decide'),
   ('verb.notice', 'to notice'), ('abstract.event', 'event'), ('abstract.story', 'story')],
  {'*': ['fn.sequence']}, [('fr.sequence', 'First PERSON did X, then Y, finally Z'), ('fr.before.past', 'When PERSON arrived, OTHER had already left')]),
 ('cr.20', 'A2', 'The way: path and manner of moving', [
   ('verb.turn', 'to turn'), ('verb.cross', 'to cross (a street)'), ('adv.straight', 'straight on'), ('prep.along', 'along'), ('prep.past', 'past (go past the bank)'),
   ('prep.around', 'around'), ('place.corner', 'corner'), ('place.crossroads', 'crossroads, junction'), ('place.trafficlight', 'traffic light'),
   ('place.bridge', 'bridge'), ('obj.map', 'map'), ('place.north', 'north'), ('place.south', 'south'), ('place.east', 'east'), ('place.west', 'west')],
  {'*': ['fn.path'], 'isolating': ['fn.complement.direction']}, [('fr.way', 'Go straight / turn left / cross THE STREET (until PLACE)'), ('fr.move.manner', 'PERSON walks / drives / runs across / along / into PLACE')]),
 ('cr.21', 'A2', 'Free time: verb + verb', [
   ('abstract.sport', 'sport'), ('sport.football', 'football, soccer'), ('verb.swim', 'to swim'), ('verb.dance', 'to dance'), ('verb.sing', 'to sing'),
   ('art.music', 'music'), ('art.instrument', 'musical instrument'), ('art.guitar', 'guitar'), ('art.piano', 'piano'), ('sport.team', 'team'), ('sport.match', 'match, game'),
   ('verb.win', 'to win'), ('verb.losegame', 'to lose (a game)'), ('abstract.hobby', 'hobby'), ('verb.try', 'to try'), ('verb.stop', 'to stop (doing)')],
  {'*': ['fn.verb.verb']}, [('fr.like.to', 'PERSON likes / wants / tries / starts to do ACTIVITY'), ('fr.play', 'PERSON plays SPORT / INSTRUMENT')]),
 ('cr.22', 'A2', 'When, while, before, after: time clauses', [
   ('adj.busy', 'busy'), ('abstract.freetime', 'free time'), ('abstract.schedule', 'schedule, timetable'), ('adv.ontime', 'on time'),
   ('conj.while', 'while (at the same time)'), ('conj.before', 'before (+ clause)'), ('conj.after', 'after (+ clause)'), ('conj.until', 'until (+ clause)'),
   ('conj.since', 'since (+ clause)'), ('conj.assoonas', 'as soon as')],
  {'*': ['fn.time.clause']}, [('fr.when.clause', 'When / while / before / after CLAUSE, CLAUSE')]),
 ('cr.23', 'A2', 'The biggest: comparison in depth', [
   ('place.continent', 'continent'), ('place.capital', 'capital (city)'), ('abstract.population', 'population'), ('place.border', 'border'), ('place.coast', 'coast'),
   ('place.world', 'the world'), ('conj.asas', 'as … as'), ('adv.less', 'less'), ('adv.least', 'least, the least')],
  {'*': ['fn.superlative']}, [('fr.superlative', 'PLACE is the ADJECTIVE-est PLACE in the world / of all'), ('fr.as.as', 'X is as ADJECTIVE as Y; the more …, the more …')]),
 ('cr.24', 'A2', 'Someone, nobody, everything: indefinite words', [
   ('pron.someone', 'someone, somebody'), ('pron.something', 'something'), ('pron.everything', 'everything'), ('pron.everyone', 'everyone, everybody'),
   ('pron.anything', 'anything (in questions and negations)'), ('pron.anyone', 'anyone'), ('adv.somewhere', 'somewhere'), ('adv.everywhere', 'everywhere'),
   ('adv.nowhere', 'nowhere'), ('quant.every', 'every, each'), ('quant.both', 'both'), ('quant.either', 'either (of two)'), ('quant.neither', 'neither (of two)')],
  {'*': ['fn.indefinite']}, [('fr.indefinite', 'Someone / nobody / everyone did ACTION; PERSON saw something / nothing')]),
 ('cr.25', 'B1', 'If: real conditions', [
   ('adj.lost', 'lost (I am lost)'), ('adj.broken', 'broken, out of order'), ('verb.miss', 'to miss (a bus, a train)'), ('abstract.mistake', 'mistake'),
   ('verb.repair', 'to repair, to fix'), ('abstract.problem', 'problem'), ('verb.solve', 'to solve'), ('verb.help', 'to help')],
  {'*': ['fn.condition.real']}, [('fr.if.real', 'If CLAUSE, (then) CLAUSE (present / future)')]),
 ('cr.26', 'B1', 'Wishes and hopes', [
   ('abstract.dream', 'dream (a wish)'), ('verb.hope', 'to hope'), ('verb.wish', 'to wish'), ('abstract.success', 'success'), ('work.career', 'career'),
   ('abstract.goal', 'goal, aim'), ('time.future', 'the future'), ('abstract.luck', 'luck, good fortune')],
  {'*': ['fn.wish']}, [('fr.wish', 'I hope / wish that CLAUSE; may you …!')]),
 ('cr.27', 'B1', 'If I were …: unreal conditions', [
   ('verb.regret', 'to regret'), ('abstract.chance', 'chance, opportunity'), ('abstract.decision', 'decision'), ('verb.choose', 'to choose')],
  {'*': ['fn.condition.unreal']}, [('fr.if.unreal', 'If CLAUSE (unreal), CLAUSE (would …)'), ('fr.if.past.unreal', 'If PERSON had done X, Y would have happened')]),
 ('cr.28', 'B1', 'The passive: what was done', [
   ('verb.build', 'to build'), ('verb.invent', 'to invent'), ('verb.discover', 'to discover'), ('verb.found', 'to found (a city, a company)'),
   ('verb.destroy', 'to destroy'), ('verb.elect', 'to elect'), ('verb.report', 'to report'), ('abstract.accident', 'accident'), ('comm.news', 'the news')],
  {'*': ['fn.passive']}, [('fr.passive', 'THING was built / invented / destroyed (by PERSON) (in YEAR)')]),
 ('cr.29', 'B1', 'He said that …: reported speech', [
   ('verb.say', 'to say'), ('verb.ask', 'to ask (a question)'), ('verb.answer', 'to answer'), ('verb.think', 'to think (an opinion)'), ('verb.believe', 'to believe'),
   ('verb.claim', 'to claim'), ('verb.mean', 'to mean'), ('verb.promise', 'to promise')],
  {'*': ['fn.reported']}, [('fr.reported', 'PERSON said / thinks / promised that CLAUSE')]),
 ('cr.30', 'B1', 'Knowing: indirect questions; knowing a fact, knowing someone', [
   ('verb.know.fact', 'to know (a fact)'), ('verb.know.person', 'to know (a person, a place), to be acquainted with'), ('verb.understand', 'to understand'),
   ('verb.learn', 'to learn'), ('verb.teach', 'to teach'), ('edu.subject', 'subject (at school)'), ('edu.test', 'test, exam'), ('edu.mark', 'mark, grade'),
   ('edu.degree', 'degree (from a university)'), ('edu.course', 'course (of study)'), ('edu.lesson', 'lesson, class'), ('edu.homework', 'homework'),
   ('conj.whether', 'whether, if (in an indirect question)')],
  {'*': ['fn.indirect.question', 'fn.know']}, [('fr.indirect.q', 'I don\'t know whether / where / why CLAUSE'), ('fr.know', 'PERSON knows THAT … / knows PERSON')]),
 ('cr.31', 'B1', 'Work: participles', [
   ('work.company', 'company, firm'), ('work.boss', 'boss'), ('work.colleague', 'colleague'), ('work.meeting', 'meeting'), ('work.salary', 'salary, wages'),
   ('work.contract', 'contract'), ('work.interview', 'job interview'), ('verb.apply', 'to apply (for a job)'), ('verb.employ', 'to employ, to hire'),
   ('verb.retire', 'to retire'), ('work.job', 'job, work (employment)')],
  {'*': ['fn.participle']}, [('fr.participle', 'the THING done / written / bought (yesterday); the PERSON working (here)')]),
 ('cr.32', 'B1', 'Reading, learning, the arrival: verbal nouns', [
   ('abstract.reading', 'reading (the activity)'), ('abstract.writing', 'writing (the activity)'), ('abstract.travel', 'travel, travelling (the activity)'),
   ('abstract.arrival', 'arrival'), ('abstract.departure', 'departure'), ('abstract.development', 'development'), ('abstract.help', 'help (the noun)'),
   ('abstract.change', 'change (the noun)')],
  {'*': ['fn.verbal.noun']}, [('fr.verbal.noun', 'ACTIVITY-NOUN is ADJECTIVE / important; after the arrival of PERSON …')]),
 ('cr.33', 'B1', 'Building verbs from verbs and roots', [
   ('verb.open', 'to open'), ('verb.close', 'to close'), ('verb.rise', 'to rise, to go up'), ('verb.raise', 'to raise, to lift'), ('verb.fall', 'to fall'),
   ('verb.drop', 'to drop'), ('verb.wake', 'to wake (someone) up'), ('verb.break', 'to break'), ('verb.fix', 'to fix, to mend'), ('verb.grow', 'to grow')],
  {'*': ['fn.verb.derivation'], 'isolating': ['fn.complement.result']}, [('fr.change.state', 'PERSON opened / broke / raised THING; THING opened / broke / rose')]),
 ('cr.34', 'B1', 'Because of, so that, although: cause, purpose, concession', [
   ('abstract.opinion', 'opinion'), ('abstract.reason', 'reason'), ('abstract.example', 'example'), ('verb.agree', 'to agree'), ('verb.disagree', 'to disagree'),
   ('abstract.argument', 'argument (a reason given)'), ('abstract.advantage', 'advantage'), ('abstract.disadvantage', 'disadvantage'),
   ('prep.becauseof', 'because of'), ('conj.inorderto', 'in order to, so that'), ('prep.despite', 'despite, in spite of')],
  {'*': ['fn.cause.purpose']}, [('fr.cause', 'Because of THING / so that CLAUSE / although CLAUSE, CLAUSE')]),
 ('cr.35', 'B1', 'Numbers in use: fractions, percentages, measures', [
   ('num.third', 'a third'), ('num.percent', 'percent'), ('num.half.adj', 'half (a half kilo)'), ('verb.cut', 'to cut'), ('verb.boil', 'to boil'),
   ('verb.fry', 'to fry'), ('verb.bake', 'to bake'), ('verb.mix', 'to mix'), ('verb.add', 'to add'), ('obj.spoon', 'spoon'), ('home.pan', 'pan (frying pan)'),
   ('home.pot', 'pot, saucepan'), ('food.recipe', 'recipe')],
  {'*': ['fn.fractions']}, [('fr.recipe', 'Cut / mix / add NUMBER (FRACTION) of FOOD'), ('fr.percent', 'NUMBER percent of PEOPLE …')]),
 ('cr.36', 'B1', 'Politeness and register', [
   ('verb.invite', 'to invite'), ('abstract.party', 'party (a celebration)'), ('person.guest', 'guest'), ('verb.congratulate', 'to congratulate'),
   ('abstract.wedding', 'wedding'), ('verb.celebrate', 'to celebrate'), ('verb.thank', 'to thank'), ('verb.apologise', 'to apologise')],
  {'*': ['fn.register']}, [('fr.formal', 'a formal request, invitation or apology (letter, message)'), ('fr.informal', 'the same said informally to a friend')]),
 ('cr.37', 'B1', 'Attitude in the sentence: particles and discourse markers', [
   ('intj.really', 'really? (surprise)'), ('intj.exactly', 'exactly!'), ('intj.noway', 'no way!'), ('intj.isee', 'I see'), ('intj.well', 'well … (starting, hesitating)'),
   ('adv.anyway', 'anyway')],
  {'*': ['fn.attitude.particles']}, [('fr.attitude', 'a short exchange where a particle or marker gives the speaker\'s attitude')]),
 ('cr.38', 'B1', 'New words: loanwords and technology', [
   ('tech.computer', 'computer'), ('tech.internet', 'the internet'), ('tech.website', 'website'), ('comm.email', 'e-mail'), ('tech.app', 'app (application)'),
   ('tech.screen', 'screen'), ('verb.download', 'to download'), ('verb.post', 'to post (online)'), ('tech.password', 'password'), ('verb.charge', 'to charge (a phone)')],
  {'*': ['fn.loanwords']}, [('fr.tech', 'PERSON downloads / posts / charges TECH-THING')]),
 ('cr.39', 'B1', 'Having something done: causatives', [
   ('place.townhall', 'town hall'), ('comm.form', 'form (to fill in)'), ('comm.document', 'document, papers'), ('comm.signature', 'signature'),
   ('abstract.queue', 'queue, line'), ('verb.deliver', 'to deliver'), ('verb.let', 'to let, to make (someone do something)')],
  {'*': ['fn.causative']}, [('fr.causative', 'PERSON has THING repaired / makes PERSON do ACTION / lets PERSON do ACTION')]),
 ('cr.40', 'B1', 'Aspect in depth: done, ongoing, experienced, resulting', [
   ('adv.already', 'already'), ('adv.still', 'still'), ('adv.yet', 'yet (not yet)'), ('adv.ever', 'ever (have you ever …?)'), ('adv.justnow', 'just (a moment ago)')],
  {'*': ['fn.aspect.depth']}, [('fr.aspect', 'PERSON has already / not yet / ever done ACTION; PERSON is still doing ACTION')]),
 ('cr.41', 'B2', 'Society and the environment: the nominal style', [
   ('abstract.environment', 'environment'), ('abstract.pollution', 'pollution'), ('nature.climate', 'climate'), ('abstract.energy', 'energy'),
   ('abstract.society', 'society'), ('abstract.solution', 'solution'), ('verb.protect', 'to protect'), ('verb.reduce', 'to reduce')],
  {'*': ['fn.nominal.style']}, [('fr.nominal', 'The ACTION-NOUN of THING leads to / requires …')]),
 ('cr.42', 'B2', 'Institutions: complex relative clauses', [
   ('pol.government', 'government'), ('law.law', 'law'), ('law.court', 'court (of law)'), ('law.rights', 'rights'), ('pol.citizen', 'citizen'),
   ('pol.election', 'election'), ('pol.party', 'party (political)'), ('pol.vote', 'vote, ballot'), ('pron.whose', 'whose (relative)')],
  {'*': ['fn.relative.complex']}, [('fr.relative.complex', 'the PERSON whose THING … / the PLACE in which …')]),
 ('cr.43', 'B2', 'The arts: emphasis and word order', [
   ('art.art', 'art'), ('art.painting', 'painting, picture'), ('art.film', 'film, movie'), ('art.theatre', 'theatre'), ('lit.novel', 'novel'), ('lit.poem', 'poem'),
   ('art.actor', 'actor, actress'), ('lit.author', 'author, writer'), ('art.exhibition', 'exhibition')],
  {'*': ['fn.emphasis']}, [('fr.emphasis', 'It was PERSON who …; THIS FILM I liked (topic first)')]),
 ('cr.44', 'B2', 'Science: probability and certainty', [
   ('sci.research', 'research'), ('sci.experiment', 'experiment'), ('sci.result', 'result'), ('sci.theory', 'theory'), ('verb.prove', 'to prove'),
   ('verb.measure', 'to measure'), ('sci.data', 'data'), ('adv.probably', 'probably'), ('adv.certainly', 'certainly')],
  {'*': ['fn.epistemic']}, [('fr.epistemic', 'PERSON may / might / must have done ACTION; probably …')]),
 ('cr.45', 'B2', 'History: the tenses of narration', [
   ('pol.empire', 'empire'), ('pol.king', 'king'), ('pol.queen', 'queen'), ('pol.war', 'war'), ('pol.peace', 'peace'), ('pol.revolution', 'revolution'),
   ('pol.independence', 'independence'), ('adj.ancient', 'ancient'), ('abstract.history', 'history')],
  {'*': ['fn.narrative.tenses']}, [('fr.narration', 'In YEAR the KING … ; then the people …')]),
 ('cr.46', 'B2', 'Word formation: compounds, derivation, word families', [
   ('abstract.word', 'word'), ('abstract.meaning', 'meaning (of a word)'), ('abstract.family.word', 'word family')],
  {'*': ['fn.word.formation']}, [('fr.word.formation', 'a word built from another (the teacher → to teach → the teaching)')]),
 ('cr.47', 'B2', 'Idioms, proverbs and culture', [
   ('abstract.tradition', 'tradition'), ('abstract.custom', 'custom'), ('abstract.festival', 'festival'), ('relig.religion', 'religion'), ('abstract.proverb', 'proverb, saying')],
  {'*': ['fn.idioms']}, [('fr.idiom', 'a sentence with an idiom or a proverb, and its meaning')]),
 ('cr.48', 'B2', 'Registers and varieties', [
   ('abstract.dialect', 'dialect'), ('abstract.accent', 'accent'), ('abstract.slang', 'slang'), ('adj.formal', 'formal'), ('adj.informal', 'informal')],
  {'*': ['fn.varieties']}, [('fr.register.pair', 'the same message in a formal and an informal / regional variety')]),
]

FUNCTIONS = {  # id: (title, category, tags)
 'fn.past': ('The past: completed actions', 'morphosyntax', ['Tense', 'Aspect']),
 'fn.past.ongoing': ('How it used to be: the ongoing and habitual past', 'morphosyntax', ['Aspect']),
 'fn.future': ('The future: plans and intentions', 'morphosyntax', ['Tense']),
 'fn.ordinals': ('Ordinal numbers, dates and the clock', 'morphosyntax', ['Number']),
 'fn.modal': ('Can, must, may, need, should: modality', 'morphosyntax', ['Mood']),
 'fn.experiencer': ('Who feels: "it hurts", "I like" — experiencer constructions', 'syntax', ['Case']),
 'fn.advice': ('Advice and obligation in use', 'pragmatics', ['Mood']),
 'fn.wear': ('Wearing, putting on, taking off: the verbs of clothing', 'semantics', []),
 'fn.agreement.plural': ('Agreement in the plural: adjectives, determiners, verbs', 'morphosyntax', ['Number']),
 'fn.reflexive': ('Reflexive and reciprocal verbs', 'morphosyntax', ['Voice']),
 'fn.indirect.object': ('Two objects: giving, sending, telling (the indirect object)', 'morphosyntax', ['Case']),
 'fn.quantity': ('Big numbers, prices, quantities and containers', 'morphosyntax', ['Number']),
 'fn.polite.request': ('Polite requests: "I would like", "could you"', 'pragmatics', ['Mood']),
 'fn.impersonal': ('Sentences without a doer: the weather and impersonal verbs', 'syntax', []),
 'fn.existential': ('There is, there are: existence and location', 'syntax', []),
 'fn.plural.irregular': ('Irregular, collective and counted plurals', 'morphology', ['Number']),
 'fn.degree': ('How much: very, too, enough, quite', 'semantics', ['Degree']),
 'fn.relative': ('Relative clauses: the man who …, the book that …', 'syntax', []),
 'fn.genitive': ('Possession in depth: genitive constructions', 'morphosyntax', ['Case', 'Possession']),
 'fn.sequence': ('Telling a story: sequence and the past before the past', 'syntax', ['Tense']),
 'fn.path': ('Path and manner of movement', 'semantics', []),
 'fn.complement.direction': ('Directional complements (come up, go out …)', 'morphosyntax', []),
 'fn.verb.verb': ('Verb + verb: like to, want to, start, stop, try', 'syntax', []),
 'fn.time.clause': ('Time clauses: when, while, before, after, until, since', 'syntax', []),
 'fn.superlative': ('Comparison in depth: the most, as … as, the more … the more', 'morphosyntax', ['Degree']),
 'fn.indefinite': ('Someone, nobody, everything: indefinite and negative words', 'morphosyntax', []),
 'fn.condition.real': ('Real conditions: if + present / future', 'syntax', ['Mood']),
 'fn.wish': ('Wishes and hopes: subjunctive, optative and their substitutes', 'morphosyntax', ['Mood']),
 'fn.condition.unreal': ('Unreal conditions: if I were …, I would have …', 'morphosyntax', ['Mood']),
 'fn.passive': ('The passive: what was done', 'morphosyntax', ['Voice']),
 'fn.reported': ('Reported speech: he said that …', 'syntax', ['Mood']),
 'fn.indirect.question': ('Indirect questions: I don\'t know whether / where …', 'syntax', []),
 'fn.know': ('Knowing a fact and knowing someone', 'semantics', []),
 'fn.participle': ('Participles: the letter written yesterday', 'morphology', []),
 'fn.verbal.noun': ('Verbal nouns: reading, learning, the arrival', 'morphology', []),
 'fn.verb.derivation': ('Building verbs from verbs and roots (patterns, prefixes, valency)', 'morphology', []),
 'fn.complement.result': ('Result complements (finish eating, break open …)', 'morphosyntax', []),
 'fn.cause.purpose': ('Cause, purpose and concession: because of, so that, although', 'syntax', []),
 'fn.fractions': ('Numbers in use: fractions, percentages, measures', 'morphosyntax', ['Number']),
 'fn.register': ('Politeness and register: formal address, letters and messages', 'pragmatics', []),
 'fn.attitude.particles': ('Attitude in the sentence: particles and discourse markers', 'pragmatics', []),
 'fn.loanwords': ('New words: loanwords, calques and how they are integrated', 'lexicon', []),
 'fn.causative': ('Having something done: causatives (let, make, have)', 'morphosyntax', ['Voice']),
 'fn.aspect.depth': ('Aspect in depth: done, ongoing, experienced, resulting', 'morphosyntax', ['Aspect']),
 'fn.nominal.style': ('Abstract nouns and the nominal style', 'syntax', []),
 'fn.relative.complex': ('Complex relative clauses: whose, with a preposition, resumptive pronouns', 'syntax', []),
 'fn.emphasis': ('Emphasis and word order: topic, focus, clefts', 'syntax', []),
 'fn.epistemic': ('Probability and certainty: may, might, must have', 'semantics', ['Mood']),
 'fn.narrative.tenses': ('The tenses of narration and of written language', 'morphosyntax', ['Tense']),
 'fn.word.formation': ('Word formation: compounds, derivation, word families', 'morphology', []),
 'fn.idioms': ('Idioms, proverbs and set phrases', 'lexicon', []),
 'fn.varieties': ('Registers and varieties: written / spoken, formal / informal, regional', 'pragmatics', []),
}

# the field of a new concept, by the prefix of its id (fields that do not exist yet are created)
FIELD_OF = {'verb': 'verbs', 'adj': 'qualities', 'adv': 'core', 'conj': 'core', 'prep': 'core', 'pron': 'core', 'quant': 'core', 'intj': 'interjections',
            'time': 'time', 'num': 'numbers', 'obj': 'home', 'home': 'home', 'place': 'town', 'person': 'people', 'job': 'people', 'food': 'food.basics',
            'money': 'money', 'measure': 'measures', 'body': 'body', 'health': 'health', 'clothes': 'clothes', 'nature': 'nature', 'animal': 'animals',
            'sci': 'science', 'abstract': 'abstract', 'art': 'arts', 'sport': 'sport', 'comm': 'communication', 'edu': 'education', 'work': 'work',
            'tech': 'technology', 'pol': 'politics', 'law': 'law', 'lit': 'literature', 'relig': 'religion'}
NEW_FIELD_TITLE = {'clothes': 'Clothes', 'animals': 'Animals', 'body': 'The body', 'health': 'Health', 'nature': 'Nature', 'measures': 'Measures and amounts',
                   'money': 'Money', 'science': 'Science', 'abstract': 'Abstract things', 'arts': 'The arts', 'sport': 'Sport and games', 'communication': 'Communication',
                   'education': 'Education', 'work': 'Work and business', 'technology': 'Technology', 'politics': 'Politics and society', 'law': 'Law',
                   'literature': 'Literature', 'religion': 'Religion', 'interjections': 'Interjections and reactions'}


def nfc_dump(obj):
    return unicodedata.normalize('NFC', json.dumps(obj, ensure_ascii=False, indent=1) + '\n')


def main(root):
    J = lambda rel: json.load(open(os.path.join(root, rel), encoding='utf-8'))
    def W(rel, obj):
        p = os.path.join(root, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(nfc_dump(obj))
    fields = {}
    for f in sorted(glob.glob(os.path.join(root, 'core/fields/*.json'))):
        d = json.load(open(f, encoding='utf-8')); fields[d['field']] = (os.path.relpath(f, root), d)
    where = {c['id']: fname for fname, (_, d) in fields.items() for c in d['concepts']}
    nodes = J('core/nodes.json')['nodes']
    owned = {c: n['id'] for n in nodes if not n['id'].startswith('cr.') for c in n.get('concepts') or []}
    used = [cid for L in LESSONS for cid, _ in L[3]]
    assert len(used) == len(set(used)), sorted({c for c in used if used.count(c) > 1})
    clash = sorted(c for c in used if c in owned)
    assert not clash, f'concepts already taught by another node (D13: one place per concept): {clash}'
    added = placed = 0
    for nid, level, title, cs, fns, frames in LESSONS:
        for cid, gloss in cs:
            if cid in where:   # an existing concept — usually a meaning that was pending (D15): it gets its place now
                _, d = fields[where[cid]]
                for c in d['concepts']:
                    if c['id'] == cid and c.get('pending'):
                        r1 = [x['rank'] for x in d['concepts'] if x.get('tier') == 1]
                        c.pop('pending'); c['tier'] = 1; c['rank'] = (max(r1) + 1 if r1 else 1); placed += 1
                continue
            fname = FIELD_OF[cid.split('.')[0]]
            if fname not in fields:
                fields[fname] = (f'core/fields/{fname}.json', {'field': fname, 'title': NEW_FIELD_TITLE.get(fname, fname),
                                 'sources': ['the core of the course (docs/LANGUAGES.md D17, §4.4.2)'], 'concepts': []})
            _, d = fields[fname]
            subs = d.get('subgroups') or []
            r1 = [c['rank'] for c in d['concepts'] if c.get('tier') == 1]
            item = {'id': cid, 'gloss': gloss, 'tier': 1, 'rank': (max(r1) + 1 if r1 else 1)}
            if subs:
                if not any(s['id'] == 'core' for s in subs): subs.append({'id': 'core', 'title': 'From the core lessons'})
                item['subgroup'] = 'core'
            d['concepts'].append(item); where[cid] = fname; added += 1
        for fid in [x for v in fns.values() for x in v]: assert fid in FUNCTIONS, fid
    for _, (rel, d) in fields.items():
        if any(c['id'] in used for c in d['concepts']) or not os.path.exists(os.path.join(root, rel)): W(rel, d)
    # the lesson chain cr.01 → cr.48 after fd.18, after the nodes already there (the fields keep their place, D13)
    keep = [n for n in nodes if not n['id'].startswith('cr.')]
    core = [{'id': nid, 'kind': 'lesson', 'stage': 'core', 'step': 19 + i, 'level': level, 'title': title, 'concepts': [c for c, _ in cs], 'functions': fns,
             'prereqs': [LESSONS[i - 1][0] if i else 'fd.18']} for i, (nid, level, title, cs, fns, _) in enumerate(LESSONS)]
    W('core/nodes.json', {'nodes': keep + core})
    for fid, (title, cat, tags) in FUNCTIONS.items():
        p = f'core/functions/{fid}.json'
        old = J(p) if os.path.exists(os.path.join(root, p)) else {}
        lvl = next(L[1] for L in LESSONS if any(fid in v for v in L[4].values()))
        W(p, {'id': fid, 'title': title, 'category': cat, 'level': lvl, 'after': old.get('after', []), 'tags': tags})
    fr = J('core/frames.json'); have = {f['id']: f for f in fr['frames']}
    for nid, _, _, _, _, frames in LESSONS:
        for i, m in frames:
            if i in have: have[i]['meaning'] = m; have[i]['lessons'] = [nid]
            else: fr['frames'].append({'id': i, 'meaning': m, 'lessons': [nid]})
    W('core/frames.json', fr)
    course = J('course.json')
    done = set()   # a lesson leaves the draft once its words are written in every course language
    for nid, *_ in LESSONS:
        if all(os.path.exists(os.path.join(root, f'lang/{c}/lexicon/{nid}.json')) for c in course['languages']): done.add(nid)
    course['draft'] = sorted(set(course.get('draft') or []) - done | {L[0] for L in LESSONS if L[0] not in done})
    W('course.json', course)
    print(f'{len(LESSONS)} core lessons · {added} new concepts · {placed} pending meanings placed · {len(FUNCTIONS)} functions · '
          f'{sum(len(L[5]) for L in LESSONS)} frames · draft: {len(course["draft"])}')


if __name__ == '__main__': main(sys.argv[1])
