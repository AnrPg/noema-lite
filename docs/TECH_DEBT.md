# Tech-debt & ideas ledger

Things we decided **not** to build yet, so they are not forgotten. Each entry: what, why it matters,
what to think about first, and status. Newest at the top.

| # | Item | Status | Added |
|---|---|---|---|
| TD-1 | Video exercises | 💭 to think about | 2026-10-06 |
| TD-2 | Sound / audio exercises | 💭 to think about | 2026-10-06 |
| TD-3 | Keyboard-only answering for hotspot / sequence pictures | ✅ closed 2026-10-07 | 2026-10-06 |
| TD-4 | Tutor that can *see* the picture (multimodal Gemini) | 💭 idea | 2026-10-06 |
| TD-5 | Real Supabase sync tested only against the emulator | ✅ closed 2026-10-07 | 2026-10-06 |
| TD-6 | Claude: verify the connector with claude.ai and way A with a real API key | 📋 known gap | 2026-10-06 |
| TD-7 | Curricula: run once with real Claude / Gemini keys; preparation only while a tab is open | 📋 known gap | 2026-10-07 |
| TD-8 | Viewer: exact layout for old binary DOC/PPT, Pages/Keynote; PDF text search | 💭 idea | 2026-10-07 |

---

### TD-1 · Video exercises — 💭 to think about
**Why:** procedures (lab techniques, surgery steps, a Spark UI walkthrough), motion (heart cycle,
physics) and lectures are best shown as video.
**Ideas:** timestamp questions (“pause at 02:13 — what happens next?”), *hotspot on a paused frame*
(reuse `noema.visual/v1` regions on a frame), order-the-clips, “spot the mistake in this clip”.
**Think first:**
- Storage & size: packs are one self-contained file today (data URIs). Video must be **referenced**, not
  embedded (YouTube/Vimeo embed, or files in private cloud storage) → offline use and the bundle lose it.
- Copyright: only own recordings or properly licensed material (same `credit`/`license` rule as pictures).
- Accessibility: captions/transcripts required; the transcript also feeds the AI tutor.
- Schema: a `noema.media/v1` item with `mime: video/*`, `poster`, `captions` (WebVTT), `duration`; exercise
  fields `at` (seconds) / `from`–`to`.

### TD-2 · Sound / audio exercises — 💭 to think about
**Why:** languages (pronunciation, listening comprehension — useful for Greek/Russian tutoring),
medicine (heart & lung sounds), music, birdsong.
**Ideas:** listen → choose (MCQ), listen → type (dictation, reuse `labelMatch` fuzzy matching),
“which of these two is …?”, audio hotspots on a waveform/spectrogram picture.
**Think first:** size (short Opus clips are small enough to embed; long ones must be referenced),
autoplay rules on phones (must start on a tap), recording the learner’s voice (microphone permission,
privacy — never upload without consent), transcripts for accessibility and for the tutor.

### TD-3 · Keyboard-only answering for picture exercises — ✅ closed 2026-10-07
Every picture exercise now works without a mouse or touch screen (`vStage().keyboard()` in
`engine/src/35_visual.js`):
- **Tab** focuses the picture; a crosshair appears in the middle.
- **Arrow keys** move it (4 % of the picture per press, **Shift** + arrow = 1 % for small parts).
- **Enter / Space** taps at the crosshair (hotspot: places the pin; sequence: picks the next part;
  figure: reveals the part). **Backspace** undoes the last tap.
- A screen-reader live region says where the crosshair is and what was picked (“Step 2: Driver”) —
  never the right answer, so the exercise is not given away.
- Tested in `tests/visual.js` (hotspot and sequence answered with the keyboard only, Enter never checks the card by accident).

### TD-4 · Tutor that can see the picture — 💭 idea
Today the tutor gets a text version (alt text, labelled parts, the answers). Gemini accepts images
(PNG/JPEG/WebP — not SVG): rasterise the SVG through a canvas and send it with “Ask the tutor”.
Watch the token cost and keep the text version as the fallback.

### TD-5 · Real Supabase sync — ✅ closed 2026-10-07
What was done so a mistake in the real project cannot go unnoticed:
1. **The database rules are tested on a real PostgreSQL**, not only on the emulator:
   `tests/sql_policies.py` installs `cloud/supabase.sql` twice (it must be re-runnable) and checks 22
   row-level-security rules as three different users (own data, public subjects, shares, storage).
2. **Sync no longer depends on device clocks**: conversations carry a server-set `synced_at`, so a late
   push from an offline phone is never skipped by another device.
3. **One-click live check in the app**: ⚙️ → Cloud → 🩺 *Check the cloud connection* runs 8 real round
   trips (sign-in & token refresh, profile, progress sync, conversations, snapshots, private files,
   public subjects, sharing), cleans up after itself and shows a 👉 fix for every failure.
4. **The same check from a terminal** (macOS, Windows, Linux): `node tests/live_cloud.js` (anonymous:
   tables and rules installed) and with `NOEMA_LIVE_EMAIL` / `NOEMA_LIVE_PASSWORD` the full round trip.
5. Friendlier network errors, `keepalive` only for small bodies (browsers reject larger ones).

One-time step after each change of `cloud/supabase.sql`: run it in the Supabase SQL editor, then 🩺.

### TD-6 · Claude connector on the real services — 📋 known gap
`tests/connector.js` covers the protocol, tools, upload and consent against the emulator. Still to verify
live: Supabase OAuth server settings (DCR, consent path, signing keys), Claude’s sign-in round trip, and
that the claude.ai sandbox can `curl` the signed upload URL (Pro/Max have network access by default; if a
plan blocks it, the skill falls back to `noema_save_pack` for small packs or the downloadable file).

**Status 2026-10-07:** checked live — `/mcp` deployed (405 on GET, 401 + resource metadata without a
token), Supabase OAuth server on with dynamic client registration, PKCE S256. Still to do by hand: add the
connector once in claude.ai and save one subject. **Way A** (✨ Create with Claude → *Here in noema-lite*) is
tested against a scripted Claude API (`tests/claude_api.js`); run it once with a real API key and a small
PDF: watch that the skill upload, PDFs in the container and the web-picture tool behave as in the test
(the code falls back automatically if PDFs or web search are refused).

### TD-7 · Curricula on the real vendors — 📋 known gap
`tests/curriculum.js` runs the whole flow against scripted Claude and Gemini APIs. Still to do once by
hand: build a small curriculum with a real Claude key and one with a real Gemini key; prepare one step
each; check cost, time, and the quality of a Gemini-built step against a skill-built one.
**Design limit:** steps are prepared in the browser, so only while a noema-lite tab is open somewhere.
A server-side worker would need the user's API key on a server — deliberately not done (keys stay on
the device). Possible later: a Supabase Edge Function that holds a key the user opts in to store.

### TD-8 · Viewer: the rare formats — 💭 idea
Old binary Word/PowerPoint (DOC, PPT), Apple Pages/Keynote and Outlook MSG show only the text found inside them
(with ⬇️ download for the real program). PPTX shows text and pictures per slide, not the exact layout. PDFs have no
text layer yet (no select/search inside the viewer). Options: a server-side converter (LibreOffice) — would need
a backend; pdf.js TextLayer for search.
