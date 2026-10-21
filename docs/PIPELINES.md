# Content pipelines — every way content is made, step by step, each step checked

Every piece of content (a Roadmap, a subject pack, a translation, a bridge, a language course) is made by one **flow**: an
ordered list of **steps**, and each step has a **check** that says whether it is done. The flows and steps are data, read
the same way by Claude (the skill), the connector and the tests:

| File | What |
| --- | --- |
| `tools/pipelines/steps.json` | every step: title, what to do, `needs`, what it `produces`, its `check`, its `doc`, its `gate` |
| `tools/pipelines/<id>.json` | one flow (`noema.pipeline/v1`): its steps in order and when it applies |
| `tools/pipeline.py` | detect the flow, record a run (`run.json`), say the next step, run a step's check |
| `tools/pack_rules.json` → `quality` | the quality rules the `map`, `write`, `blind_solve`, `review` and `checks` steps enforce (§4) |
| `tools/pack_quality.py`, `engine/packcheck.js` | the same quality checker in Python (skill, build) and JS (app, connector); `tests/pack_rules.js` compares them |
| MCP `noema_pipeline` | the same flows and steps through the connector (detect / steps / flows), for Claude without the skill |

The skill ships `scripts/pipeline.py`, `scripts/pipelines/*.json` and this file as `references/PIPELINES.md`.

## 1. How Claude uses it

```sh
python3 scripts/pipeline.py detect --sources 2              # → 4  Sources → one subject
python3 scripts/start_subject.py work demo "Demo" --lang en
python3 scripts/pipeline.py start 4 work/demo               # writes work/demo/run.json
python3 scripts/pipeline.py next work/demo                  # the next step: what to do, the doc, how it is checked
python3 scripts/pipeline.py check work/demo map             # runs the check; on success records it with the hashes of
                                                            # what it produced
python3 scripts/pipeline.py done work/demo upload --note "noema_finish_upload ok"   # a connector call or a judgement
python3 scripts/pipeline.py status work/demo                # every step: todo / done / stale / failed / planned
```

- A step is refused while a step it `needs` is not done.
- When a file a done step produced changes, that step **and every step after it** becomes `stale` and is checked again
  (a change to a chapter after the review re-opens write → blind_solve → review → checks; the map stays done).
- `status` exits 1 while a strict step is open. `review` gates are a judgement recorded with `done --note`; `planned`
  steps (translations, until PR C) are listed and not required.

## 2. Flows

| Id | Flow | When | Steps |
| --- | --- | --- | --- |
| 1 | Sources → Roadmap → every step | a pile of material, several topics building on each other | classify → shape → dag → audit → expand → plan → start_subject → map → pictures → write → blind_solve → review → checks → upload → translate → bridges → next |
| 1b | Goal → Roadmap | a goal and no sources | classify → shape → dag → audit → expand → plan → next |
| 2 | A Roadmap step → its subject | `noema_curriculum_task` hands over one step | classify → start_subject → map → pictures → write → blind_solve → review → checks → upload → translate → bridges → next |
| 3 | Plan the chapters, fill the queue | the Roadmap exists | classify → plan → next |
| 4 | Sources → one subject | the material fits one subject | classify → start_subject → map → pictures → write → blind_solve → review → checks → upload → translate → bridges |
| 5 | Add to an existing subject | new material (`unpack.py`, `patches/`) | classify → map → pictures → write → blind_solve → review → checks → upload → translate → bridges |
| 6 | Language help 文A | a bridge for a pack | classify → bridges |
| 7 | Translate a pack | a pack into another language | classify → translate → checks → upload |
| 8 | Import a map or a subject | a Roadmap file or a pack the learner made | classify → import |
| L1 | Γ1 · A task of a language course | `noema_lang_task` | classify → L.brief → L.task → L.order → L.words → L.grammar → L.notes → L.sentences → L.exercises → L.green |
| L2 | Γ2 · A new language in a course | "add Persian to my course" | classify → L.brief → L.phenomena → L.params → L.order → L.words → L.grounding → L.grammar → L.notes → L.sentences → L.exercises → L.package → L.facades → L.green |

`detect` takes the facts: `--sources N --topics N` (more than one topic → 1, else 4), `--goal` (1b), `--step` (2),
`--queue` (3), `--extend` (5), `--bridge` (6), `--translate` (7), `--import` (8), `--lang-task` (L1), `--new-language`
(L2). The language flows only run the language tools as they are; their rules are `docs/LANGUAGE_RULES.md`.

## 3. Steps and their checks

| Step | Check |
| --- | --- |
| shape, dag, audit, expand, plan | the connector accepts it (`noema_create_roadmap`, `noema_curriculum_submit`) |
| start_subject | `subject.json` with `authoring.rules` ≥ 2 and the `map/`, `review/` folders |
| map | every `map/chNN.json` passes the map rules (`map.*`, known values in `fits` / `unfit`) |
| pictures | judgement: every picture kept teaches what the text cannot (docs/VISUAL.md §5) |
| write | `validate.py` on the chapters |
| blind_solve | `review/chNN.json` `blind`: every exercise solved without the key, every mismatch fixed |
| review | `review/chNN.json` `rubric` on ≥ 15 learnables (or all) |
| checks | `make_pack.py` builds the pack with every quality rule (§4) |
| upload | `noema_finish_upload` / `noema_save_pack` accepts it (the same checks again) |
| translate | the translated chapters exist and validate (planned) |
| bridges | `bridge.py check` for en, el, ru, ar (docs/BRIDGE.md) |
| L.* | the language tools: `validate_lang.py`, `lang_phenomena.py`, `lang_refcheck.py --offline`, `lang_facade.py lint / parity`, `lang_strict_report.js`, `lang_course.py package`, `tests/lang_rules.py` |

## 4. The quality rules (per chapter)

On for every pack with `subject.authoring.rules` ≥ 2 (`start_subject.py` writes 2). **Errors** when `authoring.by` is
`claude` or `gemini`, warnings for `learner` or `import` packs; older packs without `rules` are not checked (TD-11). The
connector refuses a pack built since 2026-10-22 without `rules` ≥ 2, so leaving the field out does not skip the checks.

The chapter's **knowledge map** `map/chNN.json` comes first (format in `tools/CONTENT_SPEC.md`):

- `points` is the **exhaustive** inventory of the material: every point not taught in an earlier DAG node (`taughtIn`)
  sits in a learnable (`map.exhaustive`). Points have a level and categories (pitfall, confusable, falsefriend, detail,
  sequence, multipart, nomenclature, acronym, formula, edge, recent, hard-understand, hard-remember).
- `learnables` group points; each becomes several exercises in different types (**facades**).
- `fits` declares the exercise types, focus tags and paradigms (`mode`) that make sense for the chapter; every other
  value has a reason in `unfit`. The code types without `features.code`, `calc` without `features.math` and the picture
  types in a chapter without a picture are unfit by themselves.
- `sourceQuestions`: every question the material asks, with its checked answer.

| Check | Rule |
| --- | --- |
| fit.types, fit.focus | every type and focus tag in `fits` ≥ 3 exercises |
| mode.coverage | every paradigm in `fits.modes` ≥ 2 exercises |
| mix.difficulty | difficulty 1 / 2 / 3 = 20 / 25 / 55 % (± 5) |
| mix.think | recall ≤ 25 %, apply or higher ≥ 40 %, ≥ 3 critical-thinking exercises (analyze, evaluate, create) |
| mix.order (warning) | easier exercises first inside a section |
| lr.link, lr.facades, cats.facades | every exercise names `lr` and `think`; every learnable, and every point with a category, ≥ 2 exercises in ≥ 2 types |
| source.questions, cite.present | every source question has an exercise citing it (`cite.sq`); every exercise keeps its origin in `cite` |
| self.contained | no text points at the source's structure ("Q2", "page 5", "the source says") |
| explain.depth, mcq.why | explanations ≥ 2 sentences; a why for every option |
| trivial.answer, trivial.longest (warning) | the answer is not in the question, nor by far the longest option |
| review.done | the blind re-solve and the rubric are done |

**Sizes are a mild suggestion only — never an error or a warning.** About 2 facades per learnable make the core set,
plus a reserve without a cap. 40–70 learnables per node give ~80–140 core exercises and 160–280 in all; above ~180 in the
core, think about splitting the node.

## 5. Tests

- `tests/pack_rules.js`: the Python and JS checkers give the same messages on the same chapters; strictness; the
  connector's refusal.
- `tests/pipelines.py`: every flow and step is consistent, every command exists, `detect`, and flow 4 end to end in a
  temporary folder with the scripts as the skill ships them.
- `tests/connector.js`: `noema_pipeline`, and the refusal of a new pack without the rules.
