# 📚 The Shelf and 🌍 language courses — notes for merging

> **Done.** The `languages` branch was merged into `main` on 2026-10-10 (with its history) and deleted. This note is kept as the record of how the two met.

This file is on both `main` and `languages`, so whoever merges one into the other knows what the Shelf work
(docs/CURRICULUM.md §9) changes around the language courses (docs/LANGUAGES.md). It applies once the Shelf pull request
(branch `claude/project-thread-hg3u6n`) is merged into `main`. Nothing in the language courses has to change for it: they
keep working as they are. The only work is resolving three small merge conflicts, described below.

## What the Shelf work changes
* **The subject picker** (`pickSubject` in `engine/loader.js`) no longer has a 📚 Subjects tab. Its `.cm-modes` row has one
  button, 🧭 Curricula, then an inline list of the learner's curricula, then **📚 the Shelf**: a folded `<details class="pick-shelf">`
  with the subjects that teach no step of any curriculum (the chips are the same `.noema-chip`s as before).
* `pickSubject` keeps its contract: it returns a Promise that resolves with the chosen subject's meta (or `null`), and
  inside the overlay the names `close` and `resolve` are still in scope. So the 🌍 Languages button works there unchanged:
  `pickLanguage(acc, s => { close(); resolve(s); })`.
* **`.cm-modes`** in `engine/src/30_shell.css` (and the generated `engine/engine.css`) gets exactly the rule the languages
  branch already has: `grid-template-columns:repeat(auto-fit,minmax(130px,1fr))`. Identical on both sides, so it merges cleanly.
* New: `Noema.shelf(acc)`, `Noema.openShelf(acc)`, `Noema.loadSubject(acc, id)`, `NoemaCurriculum.stepsOf(acc, id)`,
  `NoemaCurriculum.Edit.assign / detach / refreshAssigned`.
* **🔔 updates** (`Notes` in `engine/loader.js`, the banner in `engine/src/40_views.js`): besides shares and curriculum
  invitations, the bell now lists updates that wait for the learner (kinds `curupdate`, `stepupdate`, `subjupdate`: a
  shared curriculum's changes, a new version of a prepared step, a new version of a subject from 🌍 Explore). The subject
  picker still lists only subject shares (`!x.kind`). Language courses never produce any of them.

## What it never touches
* Language courses are never on the Shelf: `shelf()` skips `kind: 'language'` and every `lang:` id (they are not in
  `subjectsFor` anyway).
* They can never be attached to a curriculum step: `Edit.assign` refuses `lang:` ids and `kind: 'language'`, and the attach
  dialogs list only subjects from `subjectsFor`.
* No key `s:lang:*`, nothing in `library/languages/`, no `REG.languages` entry and nothing in `tools/build.py` or the
  registry shape is read, written or cleaned up by it.
* The boot code the languages branch changes is not touched: the `wanted` / `langMeta(wanted)` lookup and
  `if (meta.kind === 'language') return startLanguage(acc, meta);` stay exactly where they are. (The Shelf work only changes
  the later line that sets `Noema.node`, which runs for subject packs only.)

## Resolving the conflicts when `languages` meets `main`
1. **`engine/loader.js`, the `.cm-modes` row in `pickSubject`.** Keep main's single 🧭 Curricula button and add the
   🌍 Languages button after it (the 📚 Subjects button is gone, so do not bring it back):
   ```js
   const modes = el('div', { class: 'cm-modes', role: 'tablist' },
     el('button', { class: 'cm-mode on', role: 'tab', 'aria-selected': 'true', onclick: () => CM()?.library(acc, { onStudy }) }, tr('pick.curricula', null, acc), el('small', {}, tr('pick.curriculaSub', null, acc))),
     (REG.languages || []).length ? el('button', { class: 'cm-mode', role: 'tab', 'aria-selected': 'false', onclick: () => pickLanguage(acc, s => { close(); resolve(s); }) }, '🌍 Languages', el('small', {}, 'several at once')) : null);
   ```
   Everything else the languages branch adds to `loader.js` (`langMeta`, `pickLanguage`, `startLanguage`, the boot lines)
   goes in as it is.
2. **`tests/curriculum.js`**, the picker check near the top. The picker now has 1 mode plus 🌍 Languages when there are
   language courses:
   ```js
   ok(await p.locator('.cm-mode').count() === 1 + (await p.evaluate(() => (window.NOEMA_REGISTRY.languages || []).length ? 1 : 0)), 'the subject picker leads with 🧭 Curricula (and 🌍 Languages when there are language courses); the other subjects wait on the 📚 Shelf');
   ```
3. **`README.md`, the section on how you study.** Keep main's heading *How you study* with its two bullets (🧭 Curricula, then
   📦 Subjects and the 📚 Shelf) — not the old *Two ways to study* with 📚 Subjects first — and add the languages branch's
   **🌍 Languages** bullet after them, with its *Hard rule — the parallel order* paragraph unchanged.
4. `tests/lang_ui.js` needs no change: it clicks `.cm-mode:has-text("Languages")`, then the course chip in the language
   overlay (the Shelf never shows a language course, so `.noema-chip:has-text("Arabic")` still matches only that chip).

Then rebuild (`python3 tools/build.py`) and run `tests/run_e2e.sh` (it runs `tests/shelf.js` and the language tests).
