# D19 — the English master as a facade: parity and lint (status 2026-10-11)

Course `library/languages/polyglot-semitic-zh-de` (with the shared `_phenomena/` and `_typology/`), before the content
agents' rewrite. Contract: `docs/language-packs.md`; registry: `tools/schemas/noema.langfacade.fields.json`; tool:
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

## Parity of the master (en)

✅ 88,676 addresses · 0 missing · 0 stale · 0 target-language runs broken · 0 orphans · 0 unregistered text fields ·
0 duplicate addresses. Every string of the course is either a registered explanation field (gloss · prose · mixed · note),
a registered content / author-only field, or a structural value (ids, tags, cells) of the registry's `structuralKeys`.

| tier | texts | characters |
|---|---:|---:|
| 1 | 34,072 | 1,470,459 |
| 2 | 41,654 | 1,807,294 |
| 3 | 12,950 | 607,300 |
| all | 88,676 | 3,885,053 |

| kind | texts | characters |
|---|---:|---:|
| gloss | 41,473 | 927,531 |
| mixed | 11,675 | 166,732 |
| prose | 33,020 | 2,385,605 |
| prose (notes) | 2,508 | 405,185 |

| facade file | texts | characters |
|---|---:|---:|
| `facades/<loc>/core.json` | 2,124 | 45,560 |
| `facades/<loc>/ar.json` | 17,581 | 789,100 |
| `facades/<loc>/he.json` | 17,431 | 806,325 |
| `facades/<loc>/zh.json` | 23,212 | 927,833 |
| `facades/<loc>/de.json` | 21,845 | 938,477 |
| `_phenomena/facades/<loc>/ar.json` | 1,316 | 70,907 |
| `_phenomena/facades/<loc>/he.json` | 1,452 | 92,577 |
| `_phenomena/facades/<loc>/zh.json` | 1,573 | 87,502 |
| `_phenomena/facades/<loc>/de.json` | 1,286 | 85,062 |
| `_typology/facades/<loc>.json` | 856 | 41,710 |


Notes: 2,508 in the master (all on grammar pages) — 1,203 for a supported native or a type (they go into the locale
facades), 1,305 for other languages of the old reference set (fa, mr, tr, ko, fi, hu, sw, lg, vi, iu: kept as source
material, never shown). Per locale, Tier 1 is ≈ 1.1 M characters (the locale's own notes only).

## Lint of the master (D19 rules) — 2,463 warnings, 0 errors

These are **warnings** in `tools/validate_lang.py` until the content agents' work is merged; `--d19-strict` makes them
errors (the default flips then).

| category | count | what |
|---|---:|---|
| names | 2,262 | a general text names a language outside the course (provenance in etymologies excluded; glosses only when they compare) |
| required | 131 | grammar pages without every required note — every page lacks it, sq, pt and the five type notes (type:polysynthetic exists on 7); 25–26 Arabic pages also lack de and zh |
| anchored | 55 | explanations through English grammar: “no ‘do’” (he, ar, de question pages), “there is no ‘a’ / ‘it’”, “no ‘to’ / ‘of’” (zh), “was …-ing” (de) — he 23 · zh 12 · de 11 · ar 9 |
| note-names | 15 | a note names a third language (Persian in a note for hi, Yiddish in a note for de, Aramaic / Phoenician in notes for el …) |
| note-source (info) | 1,305 | notes for languages that are not supported natives: kept, never shown |

“names” by field (where the comparisons have to move into `profile.notes` / `notes`):

| field (address prefix) | warnings |
|---|---:|
| `profile/funFacts/* (x)` | 954 |
| `profile/etymology/text (x)` | 500 |
| `features/root/none (x)` | 122 |
| `profile/synonyms/*/nuance (x)` | 118 |
| `profile/pitfalls/* (x)` | 108 |
| `profile/subtleties/* (x)` | 104 |
| `use (a)` | 100 |
| `alsoNote (p)` | 88 |
| `profile/feeling (x)` | 38 |
| `reason (a)` | 35 |
| `features/pattern/none (x)` | 20 |
| `profile/synonymsNone (x)` | 19 |
| `examples/*/note (p)` | 11 |
| `what (p)` | 10 |
| `facts/*/value (g)` | 5 |
| `languages (ty)` | 4 |
| `quiz/*/why (g)` | 4 |
| `features/compound/none (x)` | 4 |
| `quiz/*/q (g)` | 3 |
| `examples/*/analysis (ty)` | 2 |
| `summary (g)` | 2 |
| `profile/examples/*/tr (x)` | 2 |
| `spectrum (ty)` | 1 |
| `quiz/*/options/* (g)` | 1 |
| `blocks/*/caption (g)` | 1 |

By language: de 866 · ar 580 · he 517 · zh 292 · core / shared 7 (core/typology.json names example languages of each type;
three concept glosses). Most named: English 836 · Greek 444 · Turkish 244 · Dutch 207 · Latin 206 · Russian 206 ·
French 118 · Aramaic 115 · Italian 102 · Japanese 95 · Persian 92 · Spanish 61 · Akkadian 59 · Danish 57.
Most of the Dutch / Danish / Swedish / Gothic / Akkadian / Ugaritic hits are cognate lists in etymologies (“Compare Dutch
boon, English bean”): the cognates in supported natives become `profile.notes`, the others are dropped from learner text.

## Known limits of the lint

* Language names come from CLDR (Python `babel` when installed, else `tools/i18n/langnames/<locale>.json`, made by
  `node tools/i18n/langnames/make.js`) plus a short list of historical / group names; demonyms that are not about a
  language (“Welsh onion”) are skipped only in glosses.
* Provenance is recognised by cue words before the name (from, borrowed, via, loan, calque, derived, origin …) and refused
  after comparison cues (cognate, compare, cf., like, as in …) in the same clause.
* In a locale facade, names are matched by stem (inflected Greek, Russian, German … forms), course languages and the
  locale's own language excepted; target-language runs (other scripts, *-forms, numbers, accented Latin words, a table
  cell written entirely in the course language) must survive translation byte for byte. German words without diacritics
  inside a sentence cannot be told from English by the parity check.
