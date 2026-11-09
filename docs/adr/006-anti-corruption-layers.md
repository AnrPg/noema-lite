# ADR 006 · Anti-corruption layers for Supabase, Claude and Gemini

* **Status:** accepted (phase 1, 2026-11-07).

## Context

The app talks to three outside services, and each has its own model:

- **Supabase:**
  - GoTrue sessions and `error_code`s;
  - PostgREST filters (`eq.`, `like.` with `*` as the wildcard) and `Prefer` headers;
  - Storage paths.
- **The Claude Messages API:** content blocks, `tool_use` / `tool_result`, server-sent events, `cache_control`, and
  `stop_reason`.
- **The Gemini API:** `contents` / `parts`, `functionCall`, `generationConfig`, `thinkingConfig`, an OpenAPI subset for
  schemas, and `finishReason`.

In the old code these shapes appear throughout `engine/cloud.js`, `engine/claude.js`, `engine/llm.js` and
`engine/src/20_ai.js`. A change on the vendor's side, or a second vendor, touches many files. The same mapping of
errors to codes is written more than once.

## Decision

Each vendor gets an adapter folder that is the only place where its formats exist:

- **`src/adapters/supabase/`**, which implements Auth and Remote:
  - `errors.ts` maps GoTrue and PostgREST answers to the codes of docs/i18n.md §6, ported from `cloud.js` `codeOf`;
  - `client.ts` keeps the session in the same format and under the same key as `cloud.js`
    (`noema1:cloud:session`), so both can run during the transition, and refreshes the session once at a time;
  - `remote.ts` maps collections to tables (`TABLES`) and buckets (`BUCKETS`). Compare-and-swap is a `PATCH … updated_at=eq.<expected>`, or an insert with `resolution=ignore-duplicates`
    when nothing is expected. Prefixes are escaped for `like`, and the result is filtered again on the client.
- **`src/adapters/claude/`** and **`src/adapters/gemini/`**, which implement AI:
  - the port's `ChatRequest` (messages of parts, tools, `toolChoice`, JSON mode with an optional schema) becomes the
    vendor's body (`claudeBody`, `geminiBody`, `geminiSchema`);
  - the vendor's answer becomes a `ChatResponse` (text, tool calls, `stop`, `usage`);
  - vendor errors become `ai.*` codes, whose English texts equal the catalog's (a test checks this);
  - retries with back-off respect `Retry-After`;
  - a refused option (Claude `tool_choice`, Gemini thinking) is either retried without it or reported as
    `ai.unsupported`.

  The default model is chosen from the vendor's model list (`models()`), never hard-coded, except Gemini's documented
  alias `gemini-flash-latest`.
- Each adapter passes its port's contract against a fake of the vendor (`src/adapters/testing/fake-supabase.ts`,
  `fake-ai-vendors.ts`), so no test needs the network.

## Consequences

- Features see only the port's vocabulary. A new vendor is a new folder plus one line in the AI factory of the root.
- In phase 1, the old `cloud.js` and `claude.js` keep their own copies of the mapping. Phase 2 moves the sync and the
  pack-builder onto the Remote, Auth and AI ports and deletes those copies. Until then, a change to the error mapping is
  made in both places. The tests of `tests/i18n_errors.js` (old) and `src/adapters/*/*.test.ts` (new) check both
  against the same catalog.
- The fakes must follow the vendors. When a vendor changes its format, the fake changes in the same commit as the
  adapter.

## Alternatives

- **The vendors' SDKs (`@supabase/supabase-js`, `@anthropic-ai/sdk`, `@google/genai`).** They add a lot of bundle
  weight (the page must also run from one offline file). They also bring their own error types and retry policies, and
  they would still need a layer to map their types to ours. `fetch` plus about 300 lines per vendor is smaller and
  fully testable with a fake.
- **One generic "OpenAI-compatible" layer.** Claude's and Gemini's tool calls, caching, thinking and streaming differ
  enough that a lowest common denominator would lose features that the app uses.
- **Mapping in the features.** That is the current state, which this decision ends.
