/**
 * Test doubles: the Claude Messages API and the Gemini API behind `fetch`, playing an AiScenario of the AI contract.
 * Each answers the way its vendor does (Anthropic's server-sent events; Gemini's JSON or `alt=sse` chunks) and records
 * the requests, so the vendor-specific tests can check what the adapter sent.
 */
import type { AiScenario } from '../../ports/contract/ai.contract.ts';

export interface VendorFake {
  fetch(url: string, init: RequestInit): Promise<Response>;
  readonly calls: () => number;
  readonly bodies: Array<Record<string, unknown>>;
}

const sse = (events: unknown[], typed = true): Response =>
  new Response(events.map(e => (typed ? `event: ${(e as { type: string }).type}\n` : '') + `data: ${JSON.stringify(e)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
/** The JSON a request sent (the adapters send JSON text). */
export function jsonBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== 'string') throw new TypeError('the fake vendor reads JSON text bodies only');
  return JSON.parse(init.body) as Record<string, unknown>;
}
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Waits until the request is aborted, then fails as fetch does. */
const hang = (init: RequestInit): Promise<Response> =>
  new Promise((_r, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
    });
  });

function common(s: AiScenario, init: RequestInit, n: number, failure: () => Response): Promise<Response> | null {
  if (s.kind === 'network') return Promise.reject(new TypeError('Failed to fetch'));
  if (s.kind === 'hang') return hang(init);
  if (s.kind === 'rate_limited' || (s.kind === 'transient_then_text' && n === 1)) return Promise.resolve(failure());
  return null;
}

export function fakeClaude(s: AiScenario): VendorFake {
  let n = 0;
  const bodies: Array<Record<string, unknown>> = [];
  const words = (t: string): string[] => t.split(/(?<= )/);
  return {
    calls: () => n,
    bodies,
    async fetch(url, init) {
      n++;
      if (url.endsWith('/v1/models?limit=100'))
        return json(200, {
          data: [
            { id: 'claude-opus-x', display_name: 'Opus X' },
            { id: 'claude-sonnet-x', display_name: 'Sonnet X' },
          ],
        });
      bodies.push(jsonBody(init));
      const early = common(s, init, n, () =>
        json(429, {
          type: 'error',
          error: { type: 'rate_limit_error', message: 'Number of request tokens has exceeded your per-minute rate limit' },
        }),
      );
      if (early) return early;
      const start = {
        type: 'message_start',
        message: {
          model: 'claude-test',
          usage: { input_tokens: 12, cache_read_input_tokens: 3, cache_creation_input_tokens: 0, output_tokens: 1 },
        },
      };
      if (s.kind === 'tool') {
        const j = JSON.stringify(s.input),
          half = Math.floor(j.length / 2);
        return sse([
          start,
          { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: s.name, input: {} } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: j.slice(0, half) } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: j.slice(half) } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
          { type: 'message_stop' },
        ]);
      }
      const text = s.kind === 'text' || s.kind === 'max_tokens' || s.kind === 'transient_then_text' ? s.text : '';
      return sse([
        start,
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'ping' },
        ...words(text).map(w => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: w } })),
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: s.kind === 'max_tokens' ? 'max_tokens' : 'end_turn' }, usage: { output_tokens: 7 } },
        { type: 'message_stop' },
      ]);
    },
  };
}

export function fakeGemini(s: AiScenario): VendorFake {
  let n = 0;
  const bodies: Array<Record<string, unknown>> = [];
  return {
    calls: () => n,
    bodies,
    async fetch(url, init) {
      n++;
      if (/\/models\?pageSize=/.test(url))
        return json(200, {
          models: [
            { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
            { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
          ],
        });
      bodies.push(jsonBody(init));
      const early = common(s, init, n, () =>
        json(429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }),
      );
      if (early) return early;
      const usage = { promptTokenCount: 11, candidatesTokenCount: 6, cachedContentTokenCount: 2 };
      const chunks: unknown[] =
        s.kind === 'tool'
          ? [
              {
                candidates: [
                  { content: { role: 'model', parts: [{ functionCall: { name: s.name, args: s.input } }] }, finishReason: 'STOP' },
                ],
                usageMetadata: usage,
                modelVersion: 'gemini-test',
              },
            ]
          : (() => {
              const text = s.kind === 'text' || s.kind === 'max_tokens' || s.kind === 'transient_then_text' ? s.text : '';
              const parts = text.split(/(?<= )/);
              return [
                { candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }] } }] },
                ...parts.map((p, i) => ({
                  candidates: [
                    {
                      content: { role: 'model', parts: [{ text: p }] },
                      ...(i === parts.length - 1 ? { finishReason: s.kind === 'max_tokens' ? 'MAX_TOKENS' : 'STOP' } : {}),
                    },
                  ],
                  ...(i === parts.length - 1 ? { usageMetadata: usage, modelVersion: 'gemini-test' } : {}),
                })),
              ];
            })();
      if (url.includes(':streamGenerateContent')) return sse(chunks, false);
      // one answer: the chunks folded into one
      const all = chunks as Array<{
        candidates: Array<{ content: { parts: unknown[] }; finishReason?: string }>;
        usageMetadata?: unknown;
        modelVersion?: string;
      }>;
      return json(200, {
        candidates: [
          {
            content: { role: 'model', parts: all.flatMap(c => c.candidates[0]?.content.parts ?? []) },
            finishReason: all.at(-1)?.candidates[0]?.finishReason,
          },
        ],
        usageMetadata: all.at(-1)?.usageMetadata,
        modelVersion: 'gemini-test',
      });
    },
  };
}
