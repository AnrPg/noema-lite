# D19 — the English master as a facade: parity and lint (status 2026-10-11)

Course `library/languages/polyglot-semitic-zh-de` (with the shared `_phenomena/` and `_typology/`), after the content
agents' rewrite (D19 + R1–R3). Contract: `docs/language-packs.md`; registry: `tools/schemas/noema.langfacade.fields.json`; tool:
`tools/lang_facade.py`. Regenerate everything below with

```
python3 tools/lang_facade.py extract  library/languages/polyglot-semitic-zh-de            # facades/en/ (+ _phenomena, _typology)
python3 tools/lang_facade.py parity   library/languages/polyglot-semitic-zh-de --locale en  # facades/en/PARITY.md
python3 tools/lang_facade.py roundtrip library/languages/polyglot-semitic-zh-de             # strip + re-apply = identical bytes
python3 tools/lang_facade.py lint     library/languages/polyglot-semitic-zh-de             # the D19 rules
```

## The master facade is generated, not committed

`extract --locale en` writes ~12 MB of JSON (88,676 addresses; the texts themselves are 3.9 M characters) that is a pure
function of the course files: the same command always gives the same entries (`src` = the hash of each text). Committing
it would double every content change in the history and go stale with the first edit, so `facades/en/`,
`_phenomena/facades/en/` and `_typology/facades/en.json` are in `.gitignore`. What proves the master is complete and
addressable is the **round trip**, run by `tests/lang_facade.py` on every test run: extract → blank every registered text
in a copy of the course → re-apply the facade → all 427 files byte-identical (✅ 2026-10-11). Locale facades (el, ru, fr …)
are real translations and **are** committed (`facades/<locale>/`), with their `PARITY.md`.

## Parity of the master (en) — after the D19 content pass (2026-10-11)

✅ 97,009 addresses · 0 missing · 0 stale · 0 target-language runs broken · 0 orphans · 0 unregistered text fields ·
0 duplicate addresses; round trip: 97,009 texts in 427 files, stripped and re-applied byte-identical. Every string of the
course is either a registered explanation field (gloss · prose · mixed · note), a registered content / author-only field,
or a structural value (ids, tags, cells) of the registry's `structuralKeys`.

| tier | texts | characters |
|---|---:|---:|
| 1 | 35,228 | 1,711,253 |
| 2 | 43,782 | 1,893,604 |
| 3 | 17,999 | 839,934 |
| all | 97,009 | 4,444,791 |

| kind | texts | characters |
|---|---:|---:|
| gloss | 41,632 | 930,402 |
| mixed | 11,676 | 167,494 |
| prose | 37,641 | 2,548,574 |
| prose (notes) | 6,060 | 798,321 |

| facade file | texts | characters |
|---|---:|---:|
| `facades/<loc>/core.json` | 2,144 | 54,299 |
| `facades/<loc>/ar.json` | 19,073 | 920,589 |
| `facades/<loc>/he.json` | 19,096 | 924,871 |
| `facades/<loc>/zh.json` | 25,784 | 1,059,844 |
| `facades/<loc>/de.json` | 24,061 | 1,066,071 |
| `_phenomena/facades/<loc>/ar.json` | 1,443 | 85,461 |
| `_phenomena/facades/<loc>/he.json` | 1,481 | 95,637 |
| `_phenomena/facades/<loc>/zh.json` | 1,584 | 88,789 |
| `_phenomena/facades/<loc>/de.json` | 1,487 | 107,472 |
| `_typology/facades/<loc>.json` | 856 | 41,758 |

Notes: 6,060 in the master — 3,644 on grammar pages, 2,128 in word profiles (`profile.notes`, where the comparisons of
the old pitfalls / fun facts / etymologies went), 288 on phenomena and the overview; 4,127 for a supported native, 663
for a type / branch / family, 1,270 for other languages of the reference set (shown only in the folded “From other
languages” section, R1; translated as Tier 3).

## Lint of the master (D19 rules) — 0 errors, 0 warnings

`python3 tools/lang_facade.py lint library/languages/polyglot-semitic-zh-de`: 0 errors, 0 warnings, 1,270 infos (the notes
for languages that are not supported natives). `python3 tools/validate_lang.py library/languages/polyglot-semitic-zh-de
--d19-strict`: valid, 0 errors (the remaining warnings are frames without a German sentence yet and draft-node notices).
**Since 2026-10-11 the D19 rules (required notes, the lint of every learner text) and the R3 map file are ERRORS by
default** in `tools/validate_lang.py` (`--d19-lenient` makes them warnings; `"d19": "lenient"` in course.json is kept for
the pre-D19 test fixture `tests/fixtures/lang-mini` only) and in the app's answer check (`LANGJOBS.D19.strict = true`).
R2 (structure) stays a warning by contract (§2.3).

The bridges of the polyglot layer (cognates, loans, false friends, links to the learner's languages) read
`profile.notes` since the content pass (a note for a language: its own language and the course languages), from the
master texts (`profile.$m`) when a facade is applied.

## The el facade (Greek) — parity

`python3 tools/lang_facade.py parity library/languages/polyglot-semitic-zh-de --locale el --no-write` (2026-10-11, before
the notes' delta pass):

❌ 97,009 addresses · done 81,331 · stale 1,569 · missing 14,109 · target-language runs broken 0 · orphans 0 · notes it
cannot show 0 · unregistered 0.

| el tier | total | done | stale | missing |
|---|---:|---:|---:|---:|
| 1 | 32,371 | 31,402 | 164 | 805 |
| 2 | 42,036 | 40,659 | 995 | 382 |
| 3 | 22,602 | 9,270 | 410 | 12,922 |

| el file | total | done | stale | missing |
|---|---:|---:|---:|---:|
| `facades/el/core.json` | 2,144 | 2,126 | 0 | 18 |
| `facades/el/ar.json` | 19,073 | 15,707 | 177 | 3,189 |
| `facades/el/he.json` | 19,096 | 15,294 | 229 | 3,573 |
| `facades/el/zh.json` | 25,784 | 19,783 | 607 | 5,394 |
| `facades/el/de.json` | 24,061 | 22,145 | 349 | 1,567 |
| `_phenomena/facades/el/*` | 5,995 | 5,420 | 207 | 368 |
| `_typology/facades/el.json` | 856 | 856 | 0 | 0 |

The missing addresses are mostly the notes (none translated yet: they come in the delta pass) and the texts the content
pass changed (stale). Tier 1 counts the el notes and the type / branch / family notes; the notes for other languages
are Tier 3 (§3.1) — the manifest's `coverage` (what the app's gate reads) uses the same tiers since 2026-10-11. The
facade lint (`lint --locale el`): 0 errors, 95 warnings — 88 on stale entries (translations of texts the content pass
has since neutralised; they go with the refresh), 7 real: a translation that names a language its master does not
(“αγγλική λέξη” for a sound loan of ‘cherry’, “μογγολική”, “αρμενικό αγγούρι” for the snake melon …).

**In the app**: with `facades/el/facade.json` status `preview` on a deploy-preview host (or `config.i18nPreview`), the
facade is offered as soon as Tier 1 is complete; `tests/lang_native.js` builds a copy with the real el facade set to
`preview` and checks the gate (not offered while Tier 1 is incomplete), then — Tier 1 marked complete in the copy — a
Greek native's course: Greek explanations, Greek notes (once the facade has them), the word card's parameters with Greek
labels, the exercises unchanged (a “meaning” answer is the same sentence's gloss, in Greek).

## Known limits of the lint

* Language names come from CLDR (Python `babel` when installed, else `tools/i18n/langnames/<locale>.json`, made by
  `node tools/i18n/langnames/make.js`) plus a short list of historical / group names; demonyms that are not about a
  language (“Welsh onion”) are skipped only in glosses.
* Provenance is recognised by cue words before the name (from, borrowed, via, loan, calque, derived, origin …) and refused
  after comparison cues (cognate, compare, cf., like, as in …) in the same clause.
* In a locale facade, names are matched by stem (inflected Russian, German … forms; Greek: whole words, an adjectival
  name with its endings, a stop-list of ordinary words such as σαν, πάλι, λάμπα, βεγγαλικά), course languages, their
  varieties (καντονέζικα) and the locale's own language excepted, and a translation may name what its master names.
  Target-language runs (other scripts, *-forms, numbers, transliterations, course-language forms and romanizations, a table
  cell written entirely in the course language) must survive translation byte for byte; English loanwords with diacritics
  (café, jalapeño, Yucatán …) are no runs, and a number may take the locale's separators (3,500 ↔ 3.500). German words
  without diacritics inside a sentence cannot be told from English by the parity check.
