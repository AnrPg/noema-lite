# Sources of the vegetables field and the course core

* `curated.py` — the hand-curated list (id, English gloss, subgroup, tier, English Wikipedia title), built from
  Wikipedia's “List of vegetables” (2026-10-08) and Wikidata, plus additions for the course cuisines.
* `veg_final.json` — the list with Wikidata ids, the number of Wikipedia editions (sitelinks) and the article titles
  in de/ar/he/zh, as fetched on 2026-10-08 (SPARQL on query.wikidata.org).
* `mkcourse.py` — writes the language-neutral core of `library/languages/polyglot-semitic-zh-de` (course.json,
  core/fields, core/nodes.json, core/functions, core/frames.json). Rerunning it overwrites those files only.
