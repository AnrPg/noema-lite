# 🧭 The new frame and 文A language courses — notes for merging

This file is on both `main` and `languages`. It tells whoever merges one into the other what the new frame (the redesigned
interface, branch `claude/project-thread-bhkz8b`, docs/UI_MAP.md) changes around the language courses (docs/LANGUAGES.md),
and how the courses can live inside it. Nothing on the `languages` branch has to change before that merge: the courses keep
working as they are. The new frame only gives them a place to appear.

## What the new frame is
* `engine/shell.js` (`window.NoemaShell`) draws the frame every screen lives in: a top bar (crumbs, ⋮, 🔔, "Me") and tabs at
  the bottom on phones, or a rail on the left on wider screens. Tabs: **Today · Knowledge · Languages · Discover · Progress**.
* The **Languages** tab (icon `文A`, never 🌍 and never a speaking person) shows only when the learner chose
  "Languages" or "Both" (the first-start question, or Me › What I learn). The choice is `world: 'know' | 'lang' | 'both'` in
  the account settings (`a:settings`), read with `NoemaThemes.world()`.
* The shell owns the address. Its own pages are `#/`, `#/learn`, `#/shelf`, `#/map/<id>`, `#/lang`, `#/discover`,
  `#/progress`, `#/me…` and `#/character`. A subject's pages (`#/subject`, `#/ch/…`, `#/s/…`, …) are drawn by the engine.
* With `shell: false` in `config.js`, the older screens run exactly as before (the subject picker, the classic top bar).
  The older test suites run in that mode; `tests/shell.js` tests the new frame.

## How the language courses plug in
The languages branch registers its world once `NoemaShell` exists (it is loaded before `engine/loader.js`):

```js
window.NoemaShell?.registerWorld('lang', {
  // the Languages tab (#/lang): draw the learner's courses into v (a <div class="ns-view">)
  page(v, { h, open, L }) { /* e.g. one .ns-item button per course from REG.languages */ },
  // #/lang/<course>/… : a course drawn INSIDE the frame (top bar and tabs stay)
  route(parts, { page, chrome, main, h, L, go, sheet, menuButton, faceEl }) {
    // page({ crumbs: [['Languages', '#/lang'], [title]], menu: [...] }, ...nodes) draws a page and its top bar,
    // or call chrome({...}) and draw into main yourself (e.g. NoemaLangUI.start({ ..., host: main }))
  },
  create() { /* "+ New language" on the Languages tab and in Discover */ },
  menu() { return [/* the Languages tab's ⋮: { label, sub?, icon?, run } */]; },
  today(box, { h, L, open, go, lead }) { /* optional: a "continue" card for the course you were in, on Today; with lead
    (nothing else to continue) draw only the course the learner was in and return true, so it leads the page */ },
});
```

Every member is optional. `chrome({ tutor })` (and `page`) may name what the character button opens on that page (a
course: its own tutor). Done on the `languages` branch on 2026-10-09: docs/LANGUAGES.md §8 *Inside the frame*. Without a registered world the Languages tab lists the subjects with `kind: 'language'` (none
today) and says there are no languages yet. Menus and ⋮ items take `{ label, sub, icon, run, href, danger }` (or `'-'` for a line).

## Where the two branches will meet (merge conflicts)
1. **`engine/loader.js`, boot.** With the frame on, the boot no longer opens the subject picker at start (unless the
   learner asked for it in Me › Profile); it mounts the frame and opens Today. The languages branch's line
   `if (meta.kind === 'language') return startLanguage(acc, meta);` must come **after** the frame is mounted, and the
   frame should then be mounted with `NoemaShell.mount({ engine: meta.kind !== 'language' })` (otherwise it waits for a
   subject engine that never comes). Better still, in the frame open a course at `#/lang/<course>` through `route()` above,
   and keep `startLanguage` for `shell: false`.
2. **`engine/loader.js`, `pickSubject`.** Unchanged by the frame (it is still opened from ⋮ › "Choose a subject"); keep
   the 🌍 Languages button the languages branch adds (merge note in docs/SHELF_AND_LANGUAGES.md).
3. **`index.html`.** The frame adds `engine/i18n_shell.js`, `engine/themes.js`, `engine/art.js` after `i18n.js`, and
   `engine/shell.js`, `engine/react.js` after `curmap.js`, and replaces the Google Fonts links with
   `<link rel="stylesheet" href="fonts/fonts.css">` (the fonts are self-hosted in `fonts/`). Keep both sets of scripts.
4. **`tools/build.py`.** `build_site` copies the five new files and `fonts/`; the bundle inlines them. Keep main's file list
   and add the languages branch's own copy loop (`langcore.js`, `langui.js`, `langui.css`) as it is.
5. **CSS.** The frame's styles are in `engine/src/95_shell.css` (built last into `engine/engine.css`); everything is under
   `body.ns-on`, so `langui.css` is untouched. Inside the frame, colours come from the learner's character as CSS variables
   on `<html data-m="…">`: `--bg`, `--paper`, `--ink`, `--ink2`, `--ink3`, `--line`, `--acc`, `--acc-ink`, `--acc-soft`,
   the tones `--t1…--t4` with their ink `--t1i…--t4i`, and the fonts `--display`, `--font`. A course drawn inside the frame looks native when it uses them.

## What it never touches
* No language data, no `s:lang:*` key, nothing in `library/languages/`, `engine/lang/`, `langcore.js` or `langui.*`.
* The Shelf still skips language courses; Roadmaps still refuse them as steps.

Then rebuild (`python3 tools/build.py`) and run `tests/run_e2e.sh` (it runs `tests/shell.js` and the older suites).
