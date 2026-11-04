# Writing an interactive activity — the playbook

The contract is `docs/INTERACTIVE.md`; this page is how to make one that teaches. The reference activity is
`tools/activities_examples/alias-lab/` (sampling and aliasing: an explorer in the theory and a graded sim exercise).

## When an activity earns its place

Make one only when **trying** teaches something that reading and pictures cannot: a relation between quantities
(move one, watch another), a process over time, a system with feedback, a search for a setting that works, a fault to find
by probing. Not for: a fact, a definition, a static diagram (use a figure), a quiz (use the exercise types). One or two
well-made activities per chapter at most; most chapters need none.

## Steps

1. **Pick the learnable** (map/chNN.json): what the learner should see happen, and the misconception the activity breaks.
2. **Start from the reference**: `python3 activity_new.py <subject-dir> <id>` copies alias-lab (app.html, strings in en/el/ru,
   the registry entry, a fallback picture) under the new id. Change it; keep its structure:
   - every word in `strings.<locale>.json`, shown with `noema.t(key)`;
   - wait for `noema.ready`, then read `noema.task`, `noema.state`, `noema.exercise`;
   - colours from `--noema-*` tokens; redraw on `noema.on('theme', …)`;
   - `noema.saveState(…)` on every change worth keeping; `noema.event(…)` for what the learner did;
   - graded: `noema.result({score, passed, detail})` **only after the learner did something** (else Check would grade
     the untouched start), and again on each change.
3. **The theory block** goes right after the text that explains the idea, and is itself explained right after it (Q7b):
   what is on screen, how to read it, what to try first, what to notice.
4. **The sim exercise**: `q` states the goal fully (self-contained, Q1), `task.params` set the case, `hints` go from the idea
   to the method (never the answer), `reveal` says why the right setting works, `explain` covers the tempting wrong one.
   Add `"sim"` to the chapter map's `fits.types` (it is opt-in).
5. **The fallback**: a still picture of the most telling state plus a text (>= 40 characters) that teaches the same idea in
   words; a learner who never sees the activity still learns it.
6. **Translate** the string tables into every language the pack is read in (its own + en, el, ru), naturally, as for the
   chapters; units and symbols stay.
7. **Check** (docs/INTERACTIVE.md §11): `activity_lint.py`, `activity_test.py` (with solutions and wrong attempts),
   `activity_preview.py`, then `make_pack.py`.

## activity_test.py cases — `activities/<id>/tests.json`

```json
{ "cases": [
  { "name": "right rate",  "exercise": "ch01-e900", "steps": [{ "set": "#fs", "value": "10" }], "expect": { "passed": true } },
  { "name": "too slow",    "exercise": "ch01-e900", "steps": [{ "set": "#fs", "value": "5" }],  "expect": { "passed": false } },
  { "name": "explorer",    "steps": [{ "set": "#fs", "value": "10" }], "expect": { "text": { "#out": "3 Hz" } } }
] }
```
`steps`: `{"set": selector, "value": …}` (an input gets the value and an `input` event), `{"click": selector}`,
`{"wait": ms}`. `expect`: `passed` (the last reported result), `text` (selector → a part of its text), `state` (keys of the
saved state).

## Pitfalls

- A busy loop (`while (!done) {}`) or a long synchronous computation: stopped after 1.5 s. Split the work with
  `requestAnimationFrame` / `setTimeout`, or keep it small.
- `onclick="…"` and other inline handlers do not run (scripts only by hash): use `addEventListener`.
- Anything from the network (scripts, fonts, pictures, `fetch`): blocked. Inline it (`data:` URIs), keep it under 256 KB.
- `localStorage`, cookies: not available. Use `noema.saveState`.
- Text in the HTML: the learner reading Greek sees English. Every word through the tables.
- A result that is right by accident (the start state already meets the goal): start the task away from the goal.
- Too small on a phone: test at 360 px; controls >= 36 px; no horizontal scroll.
