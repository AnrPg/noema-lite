# Editorial review of the Greek (el) explanation facade

Reviewed 2026-10-11 by a Claude agent (`f-elreview`). Scope: the whole facade, 97,145 entries written by about 20 agents:
`facades/el/{core,ar,he,zh,de}.json`, `_phenomena/facades/el/*.json` and `_typology/facades/el.json`.
Method: scripts first (term scans, master↔Greek term maps, typography checks), then reading.
Fixes were merged with `tools/lang_facade.py merge … --by claude`. Parity stays **0 stale · 0 missing · 0 runs broken**
(97,145 / 97,145). No target-language run was changed (Arabic, Hebrew, Chinese, pinyin, German forms,
transliterations, `*`-forms). Numbers changed only their separators (3,500 → 3.500, 0.5 → 0,5), which parity allows.

**1,659 entries changed in total** (about 1.7 % of the facade): de 545 · zh 518 · he 222 · ar 211 · core 41 ·
phenomena 118 · typology 2.

## 1. What was checked and decided

### 1.1 Terminology (`/tmp/claude-0/agents/GREEK_TERMS.md`)
None of the forms marked “Do NOT use” is left. For each concept, the master's English term was mapped to the Greek term
the facade uses. These are the entries that did not match and were fixed:

| Concept | Fixed | Examples |
|---|---:|---|
| localizer → **λέξη θέσης** (when the master says “place word” for 上 / 里 / 前面 after a noun) | 11 | *λέξη τόπου* is kept for real place words (这里, 国外, 在家) |
| coverb → **συνρήμα** | 2 | *ρηματικές προθέσεις*, an English “coverbs” |
| broken / sound plural → **σπαστός / ομαλός** | 9 | *σπασμένοι*, *εσωτερικός*, *υγιής*, *κανονικοί πληθυντικοί* |
| elative → **τύπος υπεροχής** | 4 | *επιτατικός* |
| separable verb / particle → **χωριζόμενο** | 15 | *χωριστό μόριο* (13 times in the word features) |
| a *separate* verb or particle → **ξεχωριστό** | 24 | so that *χωριστό ρήμα sein* is not read as “separable” |
| two-way preposition → **πρόθεση διπλής πτώσης** | 7 | *διπλής κατεύθυνσης*, *διπλής χρήσης*, *δύο πτώσεων* |
| retroflex → **ανακεκαμμένο** | 3 | *ανάκαμψη* |
| tone sandhi → **αλλαγή τόνου (sandhi)** | 2 | *τονική αλλαγή* |
| fusional → **συγχωνευτική** | 1 | *συντηκτική* |
| pinyin, kasra → kept in **Latin letters** | 56 | *πινγίν*, *κάσρα* |
| Umlaut / Ablaut → kept in **German** in the German pages | 8 | *μεταφωνία*, *μετάπτωση* (kept as the Greek explanation at first use; the typology keeps the general Greek terms) |
| weak Arabic verbs | 1 | *Αδύναμα ρήματα* → *Ρήματα με ασθενή ρίζα* |
| “none” label in the word-feature texts → **«Κανένα»:** | 32 | a lowercase *κανένα:* in the Hebrew word features |

The checks that found nothing to fix: *ποιόν ενεργείας*, *μετρητική λέξη*, *status constructus*, *σύνταξη γενικής*,
*κελευστική*, *ελατίβ*, *διαχωριζόμενο*, *ρήμα τροπικότητας*, *τοπικός δείκτης*, hellenized binyan / niqqud names,
the Arabic perfect and imperfect, jussive, construct state, sun letters, collective and unit nouns, diptotes,
modal verbs and particles, Präteritum / Perfekt / Partizip / Konjunktiv, *Ρώτα τον εαυτό σου*.

### 1.2 One Greek name per thing
A map from each vegetable or food concept to the Greek used in the concept gloss, the sense definitions of the four
languages and the bank sentences listed about **60 conflicts**. One name was chosen for each and applied everywhere
(**303 entries**). The main decisions:

- γουασάμπι (not ουασάμπι, βασάμπι or wasabi) · χαλαπένιο, χαμπανέρο (both feminine, like *πιπεριά*: *η χαλαπένιο*,
  *οι χαμπανέρο*) · χίκαμα · γιακόν · γκαλάνγκαλ (neuter; not γαλάγκα or γαλάγκαλ) · κόντζακ (not κόνιακ, which is
  cognac) · ντάλς · κοματσούνα · σίσαρο · βοράγο, μποράντζα · κάππαρη (not κάπαρη) · ραντίτσιο · νεροσπανάκι ·
  κολραμπί, γογγυλοκράμβη (and *ρουταμπάγκα, σουηδικό γογγύλι*, no longer *γογγυλοκράμβη*) · λάχανο Σαβοΐας
- κατσαρό λάχανο, κέιλ = kale · λαχανίδα = collard greens (they had been mixed up) · πικρό πεπόνι, μομόρντικα ·
  σκορτσονέρα, μαύρο σαλσιφί · σαλσιφί, τραγοπώγων · αγριαγκινάρα, κάρδος · κιχώριο, αντίδι Βελγίου ·
  ανδράφαξη, χρυσολάχανο, αλίμη (Atriplex; *ανδράκλα / ανδράκλι* means purslane and *αλμυρίκι* tamarisk) ·
  σαλικόρνια, αλμυρήθρα · τράπα, τρίβολος του νερού (Trapa) and κινέζικο νεροκάστανο (Eleocharis) ·
  μπιζέλι μανζ-τού = snow pea, ζαχαρομπίζελο = sugar snap · αμπελοφάσουλο · ράπινι, τσίμε ντι ράπα · μουλουχία
  (φύλλα γιούτας; *μολόχα* is mallow) · τοματίγιο, φυσαλίς (not *φυσαλίδα*, which is a bubble) · κολοκυθοανθός ·
  βοϊδόγλωσσα · ελεφαντόσκορδο · φιδοκολοκύθα · κρεμμύδι της Ουαλίας · αιγυπτιακό κρεμμύδι · βλίτο (not *βλήτο*) ·
  μαρούλι άισμπεργκ · πουρές (not «purée» inside Greek prose)
- People in translations get Greek letters: *Βανγκ Μινγκ*, *κύριε Βανγκ*, *θείε Βανγκ*, *Μαξ Βέμπερ*, *Τομ*,
  *Σουλτς*, *Πέτερ* (45 entries). *Müller* stays in Latin letters in the German files, because parity treats it as a
  German form. Bibliographic names (Wang 1990, Wang Zhihuan as a source) stay in Latin letters.

### 1.3 Spelling and register (606 entries)
- The language name is **τα κινεζικά** (not *κινέζικα*, which stays only in food names such as *κινέζικο λάχανο*).
- **άντρας** (not *άνδρας*); **αδελφός, ξαδέλφη** (not *αδερφός*). Both spellings are correct; most of the facade
  already used these.
- **πληθυντικός ευγενείας**, the Greek grammar term (not *ευγενικός πληθυντικός*).
- **Κοράνι** (not *Κοράνιο*), genitive *του Κορανίου*.
- Final -ν: *την ντομάτα, την πρώτη, στην ταϊβανέζικη, τη λένε* (35 entries).
- Bank-gloss tags made uniform: *(σε πολλούς)*, *(μιλάει άντρας)*, *(ευγενικά)*, *(πληθυντικός ευγενείας)* (59).

### 1.4 Typography
- Greek apostrophe **’** (not `'`): *γι’ αυτό, απ’ όλα, Βάλ’ το, του ’80* (107).
- **Hebrew sentences keep the Hebrew question mark `?`.** About 30 cited Hebrew questions had been given the Greek
  `;` (*מָה זֶה;*). A Greek question that only *cites* a Hebrew word keeps `;`. The Greek `;` is correct everywhere
  else. No Latin `?` is left at the end of a Greek sentence.
- Greek number format: *3.500*, *100.000*, *0,5*, *14,4*, *1,70* (25). Dates and verse references are unchanged.
- No `“ ” ' '` quotation marks are left in Greek prose. They remain only where German „…“ or Chinese “ ” punctuation is
  the topic. No accents on all-caps, no double spaces (except the master's own), no doubled words (*στην αρχή αρχή*,
  *και και*). Markdown: every `**` is balanced, and every list or `→` example matches the master. Three exceptions are
  bugs in the master itself (see 3.1).
- No English left in Greek prose apart from cited forms: the scan found only German cited forms (*also, her, hin*) and
  English words cited as English.

### 1.5 Notes for Greek natives (`for: "el"`, 547 notes): all read
Cited Greek forms inside the Greek prose could not be told apart from the explanation (*Το ελληνικό σε καλύπτει…*,
*Το δεν έχω ψωμί είναι…*). They are now in **«…»**, the way most of these notes already marked them (272 notes). Some
notes were also reworded:
- *ty:core/notes/1* — *στο «του λόγου» η κατάληξη -ου…*
- *g:de:fn.prep.core/notes/0* — had *το «σε» καλύπτει … το «σε»*
- *x:ar:funduq*, *x:ar:bank*, *x:ar:mahall*, *x:ar:kanaba*, *x:ar:bazilla*, *x:de:Künstler*, *x:de:zu_Fuß*,
  *x:de:Bruder*, *x:he:bevakasha*, *x:zh:che*
- *g:zh:fn.possessive/notes/0* — had *ως κλιτικό*

### 1.6 Quality sample: about 420 random entries
The sample covered 70 bank glosses, 70 example translations, 45 grammar texts, 45 word-profile texts, 40 glosses,
30 mixed cells, 30 phenomena, 20 typology entries, 35 notes for other languages, 25 parameter reasons and 25 language
or absence texts. The Greek is natural and the gender and number agreement is correct. About 15 small fixes were made
(*υπερβολικά ακριβό*, *Χαίρετε, ονομάζομαι…* for “Good afternoon”, *σμούθι*, *αυτός που γράφει* instead of
*γράφων*, *Το artiste…*, *(Ablaut, μετάπτωση)*).

## 2. Please review yourself (most important first)

1. **Rare plants.** The names in 1.2 were chosen by usage and botany, but no Greek market name exists for several of
   them. Please check: `c:veg.orache`, `x:ar:sarmaq`, `x:ar:qataf`, `x:he:maluach`, `x:de:Gartenmelde` (Atriplex) ·
   `c:veg.fathen` (*χηνοπόδιο το λευκό, λουτσά*; `x:ar:sarmaq` *βλίτο του σκύλου*, `x:zh:li.goosefoot` *λουβουδιά*) ·
   `c:veg.glasswort` and `x:ar:ushnan` · `c:veg.cardoon` · `c:veg.salsify` · `c:veg.landcress` · `c:veg.lambslettuce` ·
   `c:veg.rapini` · `c:veg.watercaltrop` · `c:veg.goodkinghenry` (*σπανάκι του καλού βασιλιά Ερρίκου* / *«καλός
   Ερρίκος»*) · `c:veg.welshonion` · `c:veg.butternut` (*κολοκύθα βουτυράτη*; shops write *κολοκύθα butternut*) ·
   `ch:zh:棕` (*τραχύκαρπος*) · `c:veg.chineseartichoke` · `c:veg.dulse` · `c:veg.komatsuna`. Also the gender of
   *χαλαπένιο / χαμπανέρο* (feminine everywhere now) and of *γκαλάνγκαλ* (neuter).
2. **Bible, Qurʾān, Mishnah and Confucius quotations: 238 entries.** Most are in `x:he:*` (194) and `x:ar:*` (35).
   They are free translations from the English master, not the wording of the Greek Bible (Βάμβας / Septuagint).
   Examples: `x:he:shachach/profile/funFacts/0` (Ψαλμός 137 *«Αν σε ξεχάσω, Ιερουσαλήμ»*),
   `x:he:maluach/profile/examples/2/tr` (Ιώβ 30:4), `x:he:machar/profile/phrases/0`, `x:he:achot/profile/phrases/0`
   (Άσμα Ασμάτων), `x:ar:arada/profile/examples/3/tr` (Qurʾān 18:77), `x:ar:sayyara/profile/examples/2/tr`,
   `x:he:kana/profile/examples/3/tr` (Pirkei Avot 1:6), `x:zh:pengyou/profile/phrases/0` (Ανάλεκτα 1.1). Where the
   master writes *Qurʾān*, it stays in Latin letters next to *Κοράνι*, because it is a protected run.
3. **Etymology claims in the notes for Greeks** that are disputed or only hypotheses:
   - `x:ar:finjan/profile/notes/0`: *φλιτζάνι ← فِنْجَان ← πίναξ* (most sources derive finjān from Persian)
   - `x:de:bleiben/profile/notes/0`: *bleiben ~ λίπος*
   - `x:ar:maydan/profile/notes/0`: *μέσος*
   - `x:ar:aruzz/profile/notes/2`: Arabic أَرُزّ from *ὄρυζα*
   - `x:zh:che/profile/notes/0`: 车 ~ *κύκλος*, labelled as a hypothesis
   - `x:de:ohne/profile/notes/0`: *άνευ*, labelled *ίσως*
   - `x:ar:qarib_boat/profile/notes/0`: *κάραβος*
4. **Albanian (204) and Portuguese (266) notes, and the other Tier-3 notes.** Their Greek was sampled, but their
   claims about those languages were not checked. For example, `x:ar:wala/profile/notes/6` says Albanian *as … as*
   means “neither … nor”; it now says so explicitly. If the owner wants, a speaker of each language should check them.
5. **Conventions to confirm.**
   - Greek cited forms are in «» in the notes for Greeks. The R2 rule allows `*italic*`, which 6 phenomenon notes use
     (`p:he.*`).
   - Greek letters are used for people in translations, Latin letters for historical Chinese names in examples (*Qi
     Baishi*, *Yan Hui*, *Kong Rong*, *Yang Guo*, still in pinyin).
   - *μάραθος / μάραθο*, *φύτρες / φύτρα* and *αμάραντος / αμάρανθος* are both correct and were left mixed.
   - Pinyin names keep their pinyin when the text explains the reading.

## 3. Bugs in the master, for the master's authors

1. The master turned one sentence into a broken list (“- A Yiddish import: vos hert zikh?” / “- ‘what is heard?’ …”).
   The Greek keeps the intended single sentence, so these entries differ from the master's structure on purpose:
   - `x:he:ma-nishma/profile/funFacts/0`
   - `x:he:kama/profile/pitfalls/0`
   - `x:he:lean/profile/funFacts/0`
2. Internal ids appear in the prose, and the Greek copies them:
   - `ph:zh/wordFeatures/*/why` (“…are in toneSandhi”)
   - `p:de.morph.noun.*/examples/*/note` (“(fn.noun.gender)”)
   - `ph:de/distinctions/53/note` (“verb.know”)
   - `ph:de/distinctions/56/words/0/value` (“(home.wall)”)
   - `ph:zh/distinctions/101/note` (“(time.holiday)”)
   - `g:he:fn.overview/pathNote` (“(fn.root.pattern)”)
3. *Qurʾān* and some names of people (Müller) are protected runs, so a translation cannot write them in Greek letters.
