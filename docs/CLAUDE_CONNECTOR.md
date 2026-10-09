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
| Code | `engine/claude.js` + `claudeGuide()` in `engine/loader.js` | `cloud/mcp/server.mjs` (+ skill zip) |

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
* Tools: `noema_whoami`, `noema_authoring_guide`, `noema_get_toolkit` (the scripts, when the skill is not
  installed), `noema_list_subjects`, `noema_get_pack_url`, `noema_start_upload` → `curl` →
  `noema_finish_upload` (checks the pack **and its source files**: every file make_pack.py packaged — each part of
  a split PDF — must be in the account's storage with the recorded size; missing ones come back as ready `curl`
  commands with signed URLs (files over 45 MB as `split` + one `curl` per part, since Supabase takes ≤ 50 MB per
  object — so there is no size limit), and the subject is registered only when all are there, together with the synced file
  index so every device shows 👁), `noema_save_pack` (small packs inline; same file check),
  `noema_start_source_upload` (one extra file). Prompt `create_subject` (claude.ai: **+ → noema-lite → Create a noema-lite subject**).
* Without the connector: Claude hands over the package `<id>.noema.zip` → 📥 Import subject pack (pack + source files).

## C. Curricula with the Claude plan (connector)

The same connector lets the learner's Claude do a **curriculum's** work — the four agents, the chapter plans and the
steps — with the learner's Claude plan instead of API credit (docs/CURRICULUM.md §7). Tools: `noema_curricula` (what
waits), `noema_curriculum_task` (the next task as complete instructions: agent prompt + JSON Schema, or a step's brief +
subject id + signed links to the learner's files), `noema_curriculum_submit` (checked with the app's own validators;
problems come back to fix). Prompt `curriculum_work`. A step is saved with the usual upload; `noema_finish_upload`
recognises a curriculum step by its subject id, registers it with its curriculum and node, links packaged files that are
the learner's own (same SHA-256) instead of asking for them again, and tells the app through the inbox.
**Shared curricula** (docs/CURRICULUM.md §8): a step handed out is also reserved among the curriculum's participants (steps
others prepared or are preparing are skipped, and asked for by name they are refused), and `noema_finish_upload` publishes it
for everybody at once; members get signed links to the owner's material files and never get map / plan tasks.
The connector runs the app's own code for this (`engine/llm.js`, `curriculum.js`, `curjobs.js`, `curshare.js`, bundled by
`tools/build.py` → `MCP_ENGINE`), so tasks, checks and results are identical to the in-app agents.
In noema-lite: ❓ Help → Set up Claude → **C** (⭐ recommended for curricula — usually the cheapest), and the
“💬 Claude app” choice when creating or importing a curriculum.

## One-time setup (owner)

1. **Supabase → Authentication → OAuth Server**: enable the OAuth 2.1 server, turn on **dynamic client
   registration**, set the **authorization path** to `/oauth/consent`.
   (Site URL under *Authentication → URL Configuration* must be `https://noema-lite.netlify.app`.)
   If the dashboard asks for asymmetric JWT signing keys (*Project Settings → JWT Keys*), switch to them.
2. Push to GitHub → Netlify builds the website **and** the functions `/mcp` and `/api/img`
   (`netlify.toml` → `[functions]`).
3. Check: `https://noema-lite.netlify.app/.well-known/oauth-protected-resource/mcp` shows JSON, and
   `https://noema-lite.netlify.app/mcp` answers `405` to a browser GET (it only speaks POST).

## Tests
* `tests/claude_api.js` — way A against a scripted Claude API: key checks, automatic skill upload,
  Files API, pause_turn, the picture tool (direct + `/api/img` + not-a-picture), Claude's question, resume
  after a reload, the pack imported with embedded pictures, the key never in the cloud, the two guides
  (numbered steps, tips, FAQ), phone layout, `/api/img` safety.
* `tests/connector.js` — way B: 401 + resource metadata, protocol, every tool, toolkit + prompt,
  upload → check → register, refusal of broken packs, consent page, the subject in the picker.
* `tests/curriculum_app.js` — way C: a curriculum built and planned by the connector as the learner's Claude (wrong
  answers sent back, the inbox, the app applying it), a step prepared and picked up, the learner's PDF by signed link and
  not uploaded twice, the by-hand path (copy / paste, step bundle, 📥 package), Set up Claude → C, phone.
