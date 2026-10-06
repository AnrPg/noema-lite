# Tech-debt & ideas ledger

Things we decided **not** to build yet, so they are not forgotten. Each entry: what, why it matters,
what to think about first, and status. Newest at the top.

| # | Item | Status | Added |
|---|---|---|---|
| TD-1 | Video exercises | 💭 to think about | 2026-10-06 |
| TD-2 | Sound / audio exercises | 💭 to think about | 2026-10-06 |
| TD-3 | Keyboard-only answering for hotspot / sequence pictures | 📋 known gap | 2026-10-06 |
| TD-4 | Tutor that can *see* the picture (multimodal Gemini) | 💭 idea | 2026-10-06 |
| TD-5 | Real Supabase sync tested only against the emulator | 📋 known gap | 2026-10-06 |

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

### TD-3 · Keyboard-only answering for picture exercises — 📋 known gap
Drag (buttons + tap-to-place), label, select, reveal and occlusion work with the keyboard. **Hotspot**
and **sequence** need a pointer: a keyboard mode could move a crosshair with the arrow keys, or list the
parts as buttons for sequence (not for hotspot — the list would give the answer away).

### TD-4 · Tutor that can see the picture — 💭 idea
Today the tutor gets a text version (alt text, labelled parts, the answers). Gemini accepts images
(PNG/JPEG/WebP — not SVG): rasterise the SVG through a canvas and send it with “Ask the tutor”.
Watch the token cost and keep the text version as the fallback.

### TD-5 · Real Supabase sync — 📋 known gap
Sign-up, sync, snapshots and private storage pass against the local Supabase emulator
(`tests/mock_supabase.js`). Verify once against the real project after the website deploy.
