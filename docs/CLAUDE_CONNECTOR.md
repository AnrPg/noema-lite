# Create subjects with Claude — skill + connector

Every user can turn their own sources into a noema-lite subject with **their own Claude plan**.
noema-lite never handles Claude logins or keys (that would break Anthropic’s terms: subscription
logins may only be used in Anthropic’s own apps). Instead the user brings noema-lite **into Claude**:

```
 user's Claude (claude.ai / Desktop, own plan)                     noema-lite
 ┌──────────────────────────────────────────┐   1. skill zip    ┌───────────────────────────┐
 │ skill "noema-pack-builder"               │ ◄──────────────── │ /downloads/…zip (website) │
 │  reads sources, pictures, writes pack,   │                   │                           │
 │  validates (scripts/make_pack.py)        │   2. connector    │ /mcp  (Netlify function)  │
 │ connector "noema-lite" (MCP, OAuth) ─────┼─────────────────► │  tools noema_*            │
 │  noema_start_upload → curl → finish      │                   │        │ user's own token │
 └──────────────────────────────────────────┘                   │        ▼                  │
                                                                │ Supabase (RLS): storage   │
            sign-in + consent ─────────────────────────────────►│ packs/ + a:packmeta:* key │
            (<site>/oauth/consent, Supabase OAuth 2.1 server)    └───────────────────────────┘
```

* **Skill** (`skill/noema-pack-builder/` → `dist/site/downloads/noema-pack-builder.zip`, built by
  `tools/build.py site|skill`): the workflow + the content contract (`CONTENT_SPEC.md`, `VISUAL.md`)
  + the tools (`validate.py`, `svgkit.py`, `extract_images.py`, `fetch_image.py`, `make_pack.py`,
  `unpack.py`). Works on every Claude plan with code execution on.
* **Connector** (`cloud/mcp/server.mjs` → `dist/functions/mcp.mjs`, served at `<site>/mcp`): a stateless
  MCP server (Streamable HTTP, JSON). OAuth 2.1 is done by **Supabase Auth’s OAuth server**: Claude
  registers itself (dynamic client registration), the user signs in to noema-lite and approves on
  `<site>/oauth/consent`, and every tool call carries the **user’s own access token** — so row-level
  security applies exactly as in the app. The function holds **no secrets**.
* Tools: `noema_whoami`, `noema_authoring_guide`, `noema_list_subjects`, `noema_get_pack_url`,
  `noema_start_upload` (signed URL → the sandbox `curl`s the file), `noema_finish_upload` (checks the
  pack, registers it as `a:packmeta:<id>` so it appears in the picker on every device), `noema_save_pack`
  (small packs inline).
* Without the connector: Claude hands over the `.json` → 📥 Import subject pack.

## One-time setup (owner)

1. **Supabase → Authentication → OAuth Server**: enable the OAuth 2.1 server, turn on **dynamic client
   registration**, set the **authorization path** to `/oauth/consent`.
   (Site URL under *Authentication → URL Configuration* must be `https://noema-lite.netlify.app`.)
   If the dashboard asks for asymmetric JWT signing keys (*Project Settings → JWT Keys*), switch to them.
2. Push to GitHub → Netlify builds the website **and** the function (`netlify.toml` → `[functions]`).
3. Check: `https://noema-lite.netlify.app/.well-known/oauth-protected-resource/mcp` shows JSON, and
   `https://noema-lite.netlify.app/mcp` answers `405` to a browser GET (it only speaks POST).

## For each user (shown in the app: ✨ Create with Claude)

1. Download the skill → Claude: *Customize → Skills → + → Upload a skill*.
2. Optional, cloud account: Claude: *Customize → Connectors → + → Add custom connector* →
   name `noema-lite`, URL `https://noema-lite.netlify.app/mcp` → sign in → Allow.
3. Open Claude, attach the sources, paste the prompt from the app.

## Tests
`tests/connector.js` runs the generated function against the Supabase emulator: 401 + resource
metadata, protocol negotiation, every tool, upload → check → register, refusal of broken packs,
the consent page (allow / deny), and the subject appearing in the picker and opening.
