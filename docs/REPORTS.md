# Problem reports: the button, the locator, the admins' page

Learners can tell us about a mistake (a wrong answer, a bad translation, a broken screen) from any page. The report carries
a screenshot and enough data to find **exactly one place to change**, for a person or for Claude.

| Part | Where |
|---|---|
| The button | foot of the side rail from 760 px wide (speech bubble with "!"); on phones Me › Report a problem |
| The dialog, the locator, the admins' page | `engine/report.js` (`window.NoemaReport`), styles `engine/src/96_report.css` |
| The engine's half of the locator | `engine/src/85_locate.js` (`locateItem`, handed to the shell as `engine.locate`) |
| The table | `cloud/supabase.sql` §15 `noema_error_reports` |
| Claude through the connector | `noema_reports`, `noema_report`, `noema_report_update` (`cloud/mcp/server.mjs`) |
| Words | `i18n/report/` |
| Tests | `tests/reports.js` (browser, connector, unit), `tests/sql_policies.py` (the rules in PostgreSQL) |

## 1. Sending a report
1. The button takes a screenshot of the window as it is (modern-screenshot, MIT, `engine/vendor/`, loaded on the first
   report only) and opens the dialog: the screenshot (can be left out), **what kind** (wrong content, translation, looks
   wrong, does not work, an idea, other), a note, and **Point at it**.
2. **Point at it** lets the learner tap the exact thing that is wrong. That element is framed in the screenshot (taken again)
   and becomes the report's target; without it the target is the element the page was focused on, or nothing.
3. **Send** writes one row to `noema_error_reports`. It needs a cloud account; a local profile can download the report as
   JSON instead. A report that cannot be sent (offline) waits in `localStorage` `noema1:report:outbox` and is retried.
4. "What is sent" in the dialog shows the whole locator before sending.

## 2. The locator (v1): finding the one place to change
`NoemaReport.collect(target)` builds it from four sources, strongest first:

* **The data chain**: the `data-*` attributes from the target up to the page (`data-ex` exercise, `data-ch` chapter,
  `data-bid` block, `data-card` flashcard, `data-pid` drill, `data-nf` the field inside the item, such as `options.2`,
  `items.3.def` or `rows.1.0`). With the route it becomes `place`, and the engine's `locateItem(place)` turns that into
  `item`: chapter (id, number, index), section, block (index, type, text), exercise (id, type, section, difficulty, tags,
  question, cite, src), card, drill, trap, and the field's text **as shown** and **in the pack's own language** when a
  translation was shown (`item.content.translation`).
* **Interface words**: `target.i18n` gives the catalogue keys whose English or current-language text matches the
  target's text (reverse lookup; the pack's own text, `[data-nf]`, is skipped), so a wrong label leads to its
  `i18n/<component>/<locale>.arb` entry.
* **Language courses**: `lang` holds the course, view, `data-node`, `data-lex` and `data-lang` of the target.
* **The context**: `app` (version, build commit `NOEMA_BUILD.commit`, build time, bundle or site), `route`, `screen`
  (title, crumbs, tab), `ui` (locale, direction, theme, character, viewport, scroll, user agent), `visible` (the items on
  screen), `errors` (the last ten console errors and unhandled rejections), and `target` (CSS selector, tag, text,
  rectangle, what the learner had typed).

`itemRef` sums it up in one string: `ex:<id>`, `card:<key>`, `blk:<section>/<bid>`, `trap:<id>`, `drill:<id>`,
`sec:<id>`, `ch:<id>`, `ui:<key>`, `lang:<course>/<view>/<node>` or `page:<page>`.

`NoemaReport.repoFiles(locator)` lists the files to open, best first: the translation file when a translation was shown,
then `chapters/<ch>.json`, `patches/`, the bridges, `subject.json` (or the private/cloud pack's path), the language course
folder, the `.arb` files of the matched keys, and for "looks wrong" / "does not work" the code file of the screen.
`NoemaReport.brief(report)` writes an English markdown brief from all of it for Claude.

## 3. The admins' page `#/admin/reports`
For the people in `noema_admins` (same table as the vault's review). Me › Problem reports (with the number of new ones,
and a dot on the rail button). The list has filters *open · new · fixed · all* (`?f=`); a report (`#/admin/reports/<id>`)
shows the screenshot, the note, the "where" table, **Copy the brief for Claude** (falls back to a download), Download JSON,
and the status (new → seen → fixing → fixed / won't fix / duplicate), a note of ours, "fixed in" (a commit or PR), Save
and Delete. Opening a new report marks it seen.

## 4. Fixing with Claude
With the noema-lite connector and an admin account: *"look at the new problem reports and fix them"*. `noema_reports` lists
them, `noema_report` returns the brief, the full locator and the screenshot, and `noema_report_update` sets the status,
our note and `fixed_in`. Or paste the brief from the admins' page into a Claude Code session in this repository.

## 5. Rules in the database (§15)
* Anyone signed in may insert a report as themselves; a trigger sets `reporter`, `reporter_name`, `reporter_email`,
  `status = 'new'`, clears our fields, and allows 40 reports a day per person.
* A reporter sees their own reports; admins see, update and delete all. Admins can change only `status`, `admin_note`
  and `fixed_in`; what the reporter wrote stays as written.
* Limits: note ≤ 4000 characters, locator ≤ 200 000, screenshot a `data:image/(jpeg|png|webp)` URL ≤ 3 000 000.

## 6. Setup
Run `cloud/supabase.sql` again (it is idempotent; §15 adds the table), then make yourself an admin once:
`insert into public.noema_admins (user_id) select id from auth.users where email = '<your email>' on conflict do nothing;`
