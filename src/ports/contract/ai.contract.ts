/// <reference types="node" />
/**
 * The AI contract: what every vendor adapter does the same way. `make(scenario, { apiKey })` gives the adapter over a
 * fake of its vendor's API that plays the scenario (and counts the HTTP calls); back-off waits are instant.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { aiErrorKind, type AI, type ChatRequest } from '../ai.ts';
import type { Json } from '../common.ts';

export type AiScenario =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tool'; readonly name: string; readonly input: Json }
  | { readonly kind: 'max_tokens'; readonly text: string }
  /** one transient failure (429 / 503), then the text */
  | { readonly kind: 'transient_then_text'; readonly text: string }
  /** rate-limited every time */
  | { readonly kind: 'rate_limited' }
  /** the vendor cannot be reached */
  | { readonly kind: 'network' }
  /** the answer never comes (until the request is aborted) */
  | { readonly kind: 'hang' };

export interface AiHarness {
  readonly ai: AI;
  calls(): number;
}
export type AiHarnessFactory = (scenario: AiScenario, o: { readonly apiKey: string }) => AiHarness;

const ask = (text: string, extra: Partial<ChatRequest> = {}): ChatRequest => ({
  system: 'You are a tutor.',
  messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  ...extra,
});

export function aiContract(name: string, make: AiHarnessFactory): void {
  describe(`AI contract: ${name}`, () => {
    test('a text answer: text, one text part, stop "end", usage, provider', async () => {
      const h = make({ kind: 'text', text: 'Spark is lazy.' }, { apiKey: 'k' });
      const r = await h.ai.chat(ask('What is Spark?', { model: 'm1' }));
      assert.ok(r.ok, r.ok ? '' : r.error.message);
      assert.equal(r.value.text, 'Spark is lazy.');
      assert.deepEqual(r.value.content, [{ type: 'text', text: 'Spark is lazy.' }]);
      assert.equal(r.value.stop, 'end');
      assert.equal(r.value.provider, h.ai.provider);
      assert.ok(r.value.usage.input > 0 && r.value.usage.output > 0);
      assert.deepEqual(r.value.toolCalls, []);
    });

    test('streaming: the deltas add up to the text', async () => {
      const h = make({ kind: 'text', text: 'One two three four.' }, { apiKey: 'k' });
      let streamed = '';
      const r = await h.ai.chat(
        ask('Count', {
          model: 'm1',
          onDelta: d => {
            if (d.type === 'text') streamed += d.text;
          },
        }),
      );
      assert.ok(r.ok);
      assert.equal(streamed, 'One two three four.');
      assert.equal(r.value.text, streamed);
    });

    test('a tool call: its name and parsed input, stop "tool_call"', async () => {
      const h = make({ kind: 'tool', name: 'submit', input: { title: 'Plan', steps: [1, 2] } }, { apiKey: 'k' });
      const r = await h.ai.chat(
        ask('Plan it', {
          model: 'm1',
          tools: [
            {
              name: 'submit',
              description: 'Submit the plan',
              inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false },
            },
          ],
          toolChoice: { tool: 'submit' },
        }),
      );
      assert.ok(r.ok, r.ok ? '' : r.error.message);
      assert.equal(r.value.stop, 'tool_call');
      assert.equal(r.value.toolCalls.length, 1);
      assert.equal(r.value.toolCalls[0]?.name, 'submit');
      assert.deepEqual(r.value.toolCalls[0].input, { title: 'Plan', steps: [1, 2] });
      assert.ok(r.value.content.some(p => p.type === 'tool_call'));
    });

    test('cut off by the token limit: stop "max_tokens"', async () => {
      const h = make({ kind: 'max_tokens', text: 'The beginning of' }, { apiKey: 'k' });
      const r = await h.ai.chat(ask('Write a lot', { model: 'm1', maxTokens: 5 }));
      assert.ok(r.ok && r.value.stop === 'max_tokens');
    });

    test('a transient failure is retried; a lasting rate limit ends as rate_limited', async () => {
      const t = make({ kind: 'transient_then_text', text: 'ok now' }, { apiKey: 'k' });
      const r = await t.ai.chat(ask('Hi', { model: 'm1' }));
      assert.ok(r.ok && r.value.text === 'ok now');
      assert.equal(t.calls(), 2);
      const l = make({ kind: 'rate_limited' }, { apiKey: 'k' });
      const f = await l.ai.chat(ask('Hi', { model: 'm1' }));
      assert.ok(!f.ok && aiErrorKind(f.error) === 'rate_limited', f.ok ? '' : f.error.code);
      assert.ok(l.calls() > 1);
    });

    test('no network: kind "network"; no key: kind "no_key", and no call is made', async () => {
      const n = make({ kind: 'network' }, { apiKey: 'k' });
      const r = await n.ai.chat(ask('Hi', { model: 'm1' }));
      assert.ok(!r.ok && aiErrorKind(r.error) === 'network', r.ok ? '' : r.error.code);
      const k = make({ kind: 'text', text: 'x' }, { apiKey: '' });
      const r2 = await k.ai.chat(ask('Hi', { model: 'm1' }));
      assert.ok(!r2.ok && aiErrorKind(r2.error) === 'no_key');
      assert.equal(k.calls(), 0);
    });

    test('cancellation: an aborted request ends at once as ai.aborted', async () => {
      const h = make({ kind: 'hang' }, { apiKey: 'k' });
      const ac = new AbortController();
      const p = h.ai.chat(ask('Hi', { model: 'm1', signal: ac.signal }));
      setTimeout(() => {
        ac.abort();
      }, 20);
      const r = await p;
      assert.ok(!r.ok && r.error.code === 'ai.aborted' && aiErrorKind(r.error) === 'aborted');
    });

    test('models: a list, best first', async () => {
      const h = make({ kind: 'text', text: 'x' }, { apiKey: 'k' });
      const r = await h.ai.models();
      assert.ok(r.ok && r.value.length > 0 && typeof r.value[0]?.id === 'string');
    });
  });
}
