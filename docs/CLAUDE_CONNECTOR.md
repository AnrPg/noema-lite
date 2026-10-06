# Create subjects with Claude — two ways

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
      end_turn → a .json in $OUTPUT_DIR? → GET /v1/files/{id}/content → import
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
* **`/api/img`** (`cloud/img/proxy.mjs` → Netlify function): fetches a picture whose host blocks
  browsers (no CORS). Holds no secrets; http(s) only, no private/local addresses, pictures only, ≤ 15 MB,
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
  `noema_finish_upload` (checks the pack, registers it so it appears on every device), `noema_save_pack`
  (small packs inline). Prompt `create_subject` (claude.ai: **+ → noema-lite → Create a noema-lite subject**).
* Without the connector: Claude hands over the `.json` → 📥 Import subject pack.

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
