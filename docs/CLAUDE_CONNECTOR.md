# Create subjects (and curricula) with Claude — three ways

Every user can turn their own sources into a noema-lite subject with Claude. The app (✨ **Create with
Claude**) offers two ways, each explained as numbered steps with sub-steps and ⓘ tips, starting from
creating the account:

| | **A. Here in noema-lite** | **B. In the Claude app or website** |
|---|---|---|
| Claude account | Claude **Console** (platform.claude.com) + an **API key** | claude.ai (Free, Pro or Max) |
| Who pays | pay-as-you-go API credit (a few dollars per subject; live estimate + limit) | the user's Claude plan |
| The user… | never leaves noema-lite | chats with Claude in Claude's app |
| Skill | **uploaded automatically** by the app (Skills API, with the user's key) | optional — the connector gives Claude the same toolkit |
| Result | imported into the picker automatically | saved by the connector → appears in the picker |
| Code | `engine/claude.js` + `claudeGuide()` in `engine/loader.js` | `src/connector` (+ skill zip) — see **The connector's code** below |

Why not "log in with your Claude subscription" inside noema-lite? Anthropic allows subscription logins
only in its own apps; third-party apps must use an API key. Way B keeps the subscription inside
Claude's own app and brings noema-lite **into** Claude instead (connector). Claude does not let other
websites install skills into a claude.ai account, so in way B the skill is an optional manual upload —
and not needed, because the connector's `noema_get_toolkit` hands Claude the same scripts.

## A. Inside the app — the user's API key (`engine/claude.js`)

```
 browser (noema-lite page)                                   Claude API (user's key, CORS)
 1. GET /v1/models  ─ check the key, newest Sonnet preselected ─►
 2. GET /downloads/noema-pack-builder.zip → POST /v1/skills (once; new version when the zip changes)
 3. POST /v1/files  ─ each source ─────────────────────────────►
 4. POST /v1/messages  container.skills=[noema-pack-builder], tools = code execution,
    web_search, noema_web_image (client tool)  ─ loop ─────────►
      pause_turn → resend (same container) · max_tokens → "Continue."
      tool_use noema_web_image → the APP downloads the picture (directly, or via /api/img),
                                 returns it as an image + its size
      end_turn → <id>.noema.zip (or a .json) in $OUTPUT_DIR? → GET /v1/files/{id}/content
                 → import the pack + attach its packaged source files (size + SHA-256 checked)
                 no pack → Claude's question is shown with an answer box
```

* **The key** stays on the device (`localStorage`, or only for the tab), never in the cloud or backups.
* **Robust:** the whole job (messages, container id, pictures, cost) is saved in IndexedDB after every
  step → a closed tab, a network error or a stop can be **resumed**; transient errors (429/5xx/529,
  network) are retried with back-off; friendly messages for a wrong key, no credit, too-big files;
  fallbacks when PDFs are not accepted in the container (sent as documents) or web search is off for the
  key; a spending limit (estimate from published prices) pauses the job and asks.
* **Pictures from the web:** the code-execution sandbox has no internet. Claude finds pictures with
  web search and calls `noema_web_image`; the app downloads them and registers them in the pack as
  `"fetch": "app"` web pictures (url + size, no file — docs/VISUAL.md §6), embedding them at import.
* **Finding pictures** (`engine/imglib.js`, one library for the app, the picture service and the connector): Claude gets
  `noema_image_search` — Bing + DuckDuckGo Images (the whole web, what a Google image search shows too), Wikimedia
  Commons, Openverse, NASA, iNaturalist, Wellcome, Art Institute of Chicago, keyless, in parallel (`/api/imgsearch`) — and
  `noema_web_image` / the connector's `noema_image_fetch` accept a **page**: Wikimedia / Wikipedia file pages (any
  language, `#/media/File:…`, thumbnails) become the file, other pages their main picture (og:image, logos skipped).
  The skill has `find_images.py` and a `fetch_image.py` that does the same. Personal study: any licence, source recorded.
* **`/api/img`** (`cloud/img/proxy.mjs` → Netlify function, with `engine/imglib.js` prepended): fetches a picture whose host blocks
  browsers (no CORS), or the picture of a page. Holds no secrets; http(s) only, no private/local addresses, pictures only, ≤ 15 MB,
  10 s, redirects re-checked, only for this site's pages.
* Prompt caching (system + newest turn) keeps long jobs cheaper.

## B. In Claude — connector (+ optional skill)

```
 user's Claude (claude.ai / Desktop / mobile, own plan)            noema-lite
 ┌──────────────────────────────────────────┐   toolkit zip     ┌───────────────────────────┐
 │ skill "noema-pack-builder" (optional)    │ ◄──────────────── │ /downloads/…zip (website) │
 │  or noema_get_toolkit → curl + unzip      │                   │                           │
 │ connector "noema-lite" (MCP, OAuth) ─────┼─────────────────► │ /mcp  (Netlify function)  │
 │  noema_start_upload → curl → finish      │                   │  tools noema_*  + prompt  │
 └──────────────────────────────────────────┘                   │        │ user's own token │
            sign-in + consent ─────────────────────────────────►│ Supabase (RLS)            │
            (<site>/oauth/consent, Supabase OAuth 2.1 server)    └───────────────────────────┘
```

* **The connector address is the same for everybody:** `https://noema-lite.netlify.app/mcp` (the app
  always shows `siteUrl + /mcp`). It lives on the website, so it does not depend on the user's computer
  or operating system. (`http://localhost:5433x/mcp` only ever appeared in the automated tests, which run
  a local copy of the site.)
* OAuth 2.1 is done by **Supabase Auth's OAuth server**: Claude registers itself (dynamic client
  registration), the user signs in to noema-lite and approves on `<site>/oauth/consent`, and every tool
  call carries the **user's own access token** — row-level security applies exactly as in the app.
  The function holds **no secrets**.
* Tools: `noema_whoami`, `noema_pipeline` (which content flow this is and its steps in order, each with its check —
  docs/PIPELINES.md; called first), `noema_authoring_guide`, `noema_get_toolkit` (the scripts, when the skill is not
  installed), `noema_list_subjects`, `noema_get_pack_url`, `noema_start_upload` → `curl` →
  `noema_finish_upload` (checks the pack **and its source files**: every file make_pack.py packaged — each part of
  a split PDF — must be in the account's storage with the recorded size; missing ones come back as ready `curl`
  commands with signed URLs (files over 45 MB as `split` + one `curl` per part, since Supabase takes ≤ 50 MB per
  object — so there is no size limit), and the subject is registered only when all are there, together with a row per file
  in `noema_source_files` so every device shows 👁; it also runs the quality rules of docs/PIPELINES.md §4 and refuses a pack built since
  2026-10-22 without `subject.authoring.rules` ≥ 2), `noema_save_pack` (small packs inline; same file check),
  `noema_start_source_upload` (one extra file), `noema_save_translation` (one full translation of a pack, `noema-translation`,
  beside it: inline or through an upload URL; its `"subject"` — the name, tagline, hero in that language — is merged into
  `subject.i18n.<locale>` and the synced card; every new pack gets en, el, ru, de, fr — docs/PIPELINES.md §4b; `noema_finish_upload`
  also asks for the translation files a pack names, with ready `curl` commands, and lists the languages, names and bridge
  pairs still to do; 🛡 the pack is re-read right before it is written and checked after, written again while another save
  dropped this one's entry), `noema_save_roadmap_translation` (a Roadmap's own words — title, goal, per step everything its
  panel shows: title, summary, learning goals, domains, each chapter's title, teaching goals and coverage — in one
  language, into the same languages as its packs: the whole map after `noema_create_roadmap`, each step with its pack's
  translations; merged and written straight into the Roadmap with a conditional write, plus an inbox entry;
  docs/CURRICULUM.md §10). Prompt `create_subject` (claude.ai: **+ → noema-lite → Create a noema-lite subject**).
* Without the connector: Claude hands over the package `<id>.noema.zip` → 📥 Import subject pack (pack + source files).
* **文A language help** (docs/BRIDGE.md): `noema_bridge_guide` (the format and workflow, the account's bridges, the mistakes
  learners reported) and `noema_save_bridge` (one built `noema-bridge` file, ≤ 1.5 MB — uploaded with the `curl` command it returns for
  `subject_id` + `native` (+ `source` for a bridge from one of the pack's translations, docs/BRIDGE.md §2.4), then saved by
  the same call again; `bridge_json` inline only for small files — checked with the app's own `checkBridge` against the pack
  (a translation's bridge only once that translation is saved) and stored at `<uid>/bridges/<pack>.<pair>.json` + its row of
  `noema_bridges`, one per pack × pair). Prompt
  `language_help` (**+ → noema-lite → Language help for a noema-lite subject**). Any pack language into any other.
  Without the connector: the learner imports the built file with 📥.

## C. Curricula with the Claude plan (connector)

The same connector lets the learner's Claude do a **curriculum's** work — the four agents, the chapter plans and the
steps — with the learner's Claude plan instead of API credit (docs/CURRICULUM.md §7). Tools: `noema_curricula` (what
waits), `noema_curriculum_task` (the next task as complete instructions: agent prompt + JSON Schema, or a step's brief +
subject id + signed links to the learner's files), `noema_curriculum_submit` (checked with the app's own validators;
problems come back to fix), and `noema_create_roadmap` (a new Roadmap from the material the learner gave Claude —
docs/FROM_SOURCES.md §5), `noema_roadmap_map` + `noema_extend_roadmap` (a new part of a Roadmap that exists, from new
material, joined to its steps by `"@<step id>"` — docs/FROM_SOURCES.md §6), `noema_link_roadmap_steps` (prerequisite
links between steps already on a Roadmap, prepared ones too, and wrong links removed; only the map changes — §6).
**🪜 Levels** (docs/CURRICULUM.md §11): `noema_create_roadmap` and `noema_extend_roadmap` take the ladder Claude proposes
with the map (`"levels"`: a preset — `"grade:5-9"`, `"semester:6"`, `"year:4"`, `"difficulty"` — or the course's own list)
and each step's `"level"` (an id or `{ "from", "to" }`), checked by the level rules (a prerequisite never above its step; a
part adds levels at the top of the ladder, of the same kind); `noema_create_roadmap` `level_test` asks for a level test
before moving up. `noema_curriculum_task` `level` and `noema_pipeline` `level` (+ `curriculum_id`) give the work of one
level with what that level means for difficulty (§11.4). `noema_restructure_levels` proposes a new arrangement by level —
a new ladder, steps or chapters moved, a step split per level, steps merged, links changed — as a plan that goes to the
inbox and is applied **only once the learner (in a shared Roadmap its owner) approves it in the app**, keeping every id so
progress, translations and bridges follow the material (§11.3); `action: "status"` shows the proposal waiting and the
last decisions; a member's Claude is refused. The tools' code uses the Roadmaps domain (`src/features/roadmaps/domain`)
directly. Prompt `curriculum_work`. A step is saved with the usual upload; `noema_finish_upload`
recognises a curriculum step by its subject id, registers it with its curriculum and node, links packaged files that are
the learner's own (same SHA-256) instead of asking for them again, and tells the app through the inbox.
**Shared curricula** (docs/CURRICULUM.md §8): a step handed out is also reserved among the curriculum's participants (steps
others prepared or are preparing are skipped, and asked for by name they are refused), and `noema_finish_upload` publishes it
for everybody at once; members get signed links to the owner's material files and never get map / plan tasks.
The connector runs the app's own code for this (`engine/llm.js`, `curriculum.js`, `curjobs.js`, `curshare.js`, `curimport.js`, `sourceplan.js`, listed in
`src/connector/engine/sources.ts`), so tasks, checks and results are identical to the in-app agents.
In noema-lite: ❓ Help → Set up Claude → **C** (⭐ recommended for curricula — usually the cheapest), and the
“💬 Claude app” choice when creating or importing a curriculum.

## D. A whole language in one prompt (connector + skill)

The learner says one sentence in the Claude app — *"add Persian to my polyglot course"* — and Claude builds a complete
**language package** (docs/LANGUAGES.md §10.2: one language for one course, `noema.langpack/v1`) and saves it into the
learner's account; the app adds the language to the course on every device. Tools:
* `noema_language_package_guide` (course id or title — a library course or the learner's own —, language code or name) →
  the complete instructions of the skill `noema-language-builder` specialised for that course and language: the
  playbook's steps in order (docs/NEW_LANGUAGE_PLAYBOOK.md), the batches with the node ids of THIS course, the toolkit
  (`/downloads/noema-language-builder.zip`) and course file links, the checks, the progress file, the upload. With it
  Claude needs no skill installed. Prompt `add_language` (claude.ai: **+ → noema-lite → Add a language to my course**).
* `noema_lang_package_start` (course, language code) → a signed upload URL (2 h) into the learner's private storage
  `langs/<course>.lang-<code>.json` and the exact `curl` command (like `noema_start_upload`).
* `noema_lang_package_finish` (course, language code) → downloads the file, checks it with the app's own
  `checkLangPackage` against the course (the library course file of the website, or the account course) and records
  `a:langpack:<course>:<code>` (synced to every device); a refused package comes back with every problem listed.
The connector stores no secret and writes only the learner's own storage and keys. The work itself (≈ 25 batches, each a
sub-agent with the audit turn) needs a sandbox that runs long tasks — Claude Code or the Claude app / Cowork with code
execution; a plain chat cannot do it. Tested by `tests/lang_package.js`.

## The connector's code

`src/connector` (TypeScript, strict), bundled with esbuild into the Netlify function `dist/functions/mcp.mjs`:

| | |
|---|---|
| `tools/<tool>.ts` | one module per tool: its definition (name, description, input schema — what `tools/list` shows) and its handler; `tools/index.ts` lists them in order |
| `router.ts` | the MCP protocol: Streamable HTTP, stateless JSON-RPC (`initialize`, `tools/*`, `prompts/*`, `ping`, notifications → 202), the OAuth protected-resource metadata, the 401 challenge |
| `validate.ts` | a tool's arguments checked against its input schema before the handler runs (types — `"12"`, `"false"` converted when lossless —, enums, arrays, nested objects); a missing top-level argument is left to the tool, which answers with its own instructions |
| `services/` | Supabase as the user (`supabase.ts`), the key/value rows with the one compare-and-swap (`kv.ts`: a row is replaced only if it is still the version read, and its new version is always strictly later), storage, the entry tables (`rows.ts`), sagas (`sagas.ts`), curricula, Roadmaps, packs, language courses, admins |
| `engine/` | the app's engine files (`sources.ts`, in load order) run by `legacy.ts` in a scope of their own — `window` inside them is that scope, nothing leaks into the function's globals; `api.ts` types what the tools use |
| `prompts.ts`, `protocol.ts` | the prompts, the server's version, protocols and instructions |

`src/composition/connector.ts` wires it (the engine, the data, the network) and is the bundle's entry:
`tools/connector_bundle.mjs` gives it `virtual:noema-connector-data` (the public config and the documents `tools/build.py`
collects) and each `legacy:engine/…` file as text. `tools/build.py site` runs it; the tests bundle it with their own data
(`tests/connector_fn.js`). Unit tests: `src/connector/**/*.test.ts` (`node --test --experimental-strip-types`).

### Sagas: every multi-step save is safe to repeat
Each save that writes more than one thing is a saga (`services/sagas.ts`, table `noema_sagas`, cloud/supabase.sql §18) with
an idempotency key the tool derives from what it saves, so Claude retrying a call (a timeout, the same upload finished twice)
never writes anything twice:

| Saga | Key | Steps |
|---|---|---|
| `pack` — `noema_finish_upload`, `noema_save_pack` | subject + SHA-256 of the pack (+ the step it is attached to) | source-file rows → the subject's card → the Roadmap inbox entry → the step's claim released → published to the shared Roadmap → attached to a step |
| `translation` — `noema_save_translation` | subject + locale + SHA-256 | the translation file (undone if a later step fails) → the pack names it → the card |
| `roadmap-i18n` — `noema_save_roadmap_translation` | Roadmap + locale + SHA-256 | written into the Roadmap → the inbox entry |
| `bridge` — `noema_save_bridge` | pack + pair + SHA-256 | the bridge file (undone if a later step fails) → its row → the upload cleared |
| `roadmap` — `noema_create_roadmap` | SHA-256 of the plan | the Roadmap record (made once: a retry reuses its id) |
| `extend` / `links` / `restructure` — `noema_extend_roadmap`, `noema_link_roadmap_steps`, `noema_restructure_levels` | Roadmap + SHA-256 | the inbox entry (its key fixed by the saga) |
| `answer` — `noema_curriculum_submit` | Roadmap + task + SHA-256 of the answer | the inbox entry |
| `lang-answer` — `noema_lang_submit` | course + task + SHA-256 | the inbox entry → the task's claim released |
| `langpack` — `noema_lang_package_finish` | course + language + SHA-256 of the package | the package's record |

* **done** → the first call's answer again, with "(This upload was already saved by an earlier call: nothing was written
  again.)" — unless what it made is gone (the subject deleted meanwhile): then it runs again from the start.
* **running** with a live lease (10 min) → "being saved by another call right now — call again".
* **failed**, or running with its lease run out (the call stopped) → the next call resumes it, skipping the steps recorded as
  done. A step that fails undoes the steps of the same call that name an undo (the files above), marks the saga failed with
  the error and answers what is saved and that calling again goes on from there. Every write of the saga row is a
  compare-and-swap, so a call that lost the saga to another stops at its next step.
* Claims keep their rules: a step handed out waits 72 h for its upload, a claim that ran out is taken over by a
  compare-and-swap (never two runs on one step). Finished sagas are dropped after a week.

### Entry tables
The 👁 source files of a subject and the 文A bridges are rows of their own — `noema_source_files` (one per source file per
subject) and `noema_bridges` (one per pack × pair), cloud/supabase.sql §17 — instead of one JSON map in `noema_kv`
(`a:srcfiles:<subject>`, `a:bridges`) that every writer read, changed and wrote back whole. The connector writes rows; the app
keeps them in local caches (`engine/cloud.js` "entry tables": changes go through an outbox, a pull rebuilds the caches, the
first pull of an account sends up entries only that device had). §17b moves existing kv maps into the tables (safe to run
again; a map that does not fit stays where it is).

## One-time setup (owner)

1. **Supabase → Authentication → OAuth Server**: enable the OAuth 2.1 server, turn on **dynamic client
   registration**, set the **authorization path** to `/oauth/consent`.
   (Site URL under *Authentication → URL Configuration* must be `https://noema-lite.netlify.app`.)
   If the dashboard asks for asymmetric JWT signing keys (*Project Settings → JWT Keys*), switch to them.
2. Run `cloud/supabase.sql` again (SQL Editor): it adds the tables `noema_source_files`, `noema_bridges` and `noema_sagas`
   (§17, §18) and moves the old maps `a:srcfiles:*` / `a:bridges` into them (§17b). The connector and the app need them.
3. Push to GitHub → Netlify builds the website **and** the functions `/mcp` and `/api/img`
   (`netlify.toml` → `[functions]`).
4. Check: `https://noema-lite.netlify.app/.well-known/oauth-protected-resource/mcp` shows JSON, and
   `https://noema-lite.netlify.app/mcp` answers `405` to a browser GET (it only speaks POST).

## Tests
* `tests/claude_api.js` — way A against a scripted Claude API: key checks, automatic skill upload,
  Files API, pause_turn, the picture tool (direct + `/api/img` + not-a-picture), Claude's question, resume
  after a reload, the pack imported with embedded pictures, the key never in the cloud, the two guides
  (numbered steps, tips, FAQ), phone layout, `/api/img` safety.
* `tests/connector.js` — way B: 401 + resource metadata, protocol, every tool, toolkit + prompt,
  upload → check → register, refusal of broken packs, the sagas (finished twice → nothing written twice; busy; resumed),
  the rows of the entry tables, Roadmaps by level (levels with the map and with a new part, refused levels, the map's
  levels, `level` on `noema_curriculum_task` and `noema_pipeline`, `noema_restructure_levels`: a refused plan, the
  proposal in the inbox with nothing changed, sent again, status), consent page, the subject in the picker.
* `src/connector/**/*.test.ts` — the saga runner, the compare-and-swap, the argument checks, the engine's scope.
* `tests/sql_policies.py` — the entry tables and sagas: owner only, the server's stamp, the move of the old kv maps.
* `tests/lang_package.js` — way D: the package round trip (`lang_course.py package` / `unpack --package`), the check that
  refuses a wrong form, a missing facade or a new node, start / finish (signed URL, the record, the problems listed), the
  app with the added language after a reload and on a second device, Remove, phone width.
* `tests/curriculum_app.js` — way C: a curriculum built and planned by the connector as the learner's Claude (wrong
  answers sent back, the inbox, the app applying it), a step prepared and picked up, the learner's PDF by signed link and
  not uploaded twice, the by-hand path (copy / paste, step bundle, 📥 package), Set up Claude → C, phone.
