/// <reference types="node" />
/** The Claude adapter passes the AI contract (a fake Messages API), maps the port's model to Anthropic's, and its errors keep the contract. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiContract } from '../../ports/contract/ai.contract.ts';
import { fakeClaude } from '../testing/fake-ai-vendors.ts';
import { claudeAI, claudeBody, claudeError } from './index.ts';

const instant = async (): Promise<void> => {};
aiContract('claude', (scenario, { apiKey }) => {
  const f = fakeClaude(scenario);
  return { ai: claudeAI({ apiKey, fetch: (u, i) => f.fetch(u, i), sleep: instant }), calls: f.calls };
});

test('the request: system with cache control, typed parts, tools, tool choice, streaming always', () => {
  const b = claudeBody({
    system: 'Be brief.',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image', mediaType: 'image/png', data: 'AAA' }, { type: 'document', mediaType: 'application/pdf', data: 'BBB', title: 'notes.pdf' }] },
      { role: 'assistant', content: [{ type: 'tool_call', id: 'toolu_1', name: 'search', input: { q: 'x' } }] },
      { role: 'user', content: [{ type: 'tool_result', callId: 'toolu_1', name: 'search', content: 'nothing', isError: true }] },
    ],
    tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }],
    toolChoice: 'any',
    temperature: 0.2,
  }, 'claude-sonnet-x');
  assert.equal(b['stream'], true);
  assert.deepEqual(b['system'], [{ type: 'text', text: 'Be brief.', cache_control: { type: 'ephemeral' } }]);
  const m = b['messages'] as Array<{ content: Array<Record<string, unknown>> }>;
  assert.deepEqual(m[0]?.content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } });
  assert.deepEqual(m[0]?.content[2], { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' }, title: 'notes.pdf' });
  assert.deepEqual(m[1]?.content[0], { type: 'tool_use', id: 'toolu_1', name: 'search', input: { q: 'x' } });
  assert.deepEqual(m[2]?.content[0], { type: 'tool_result', tool_use_id: 'toolu_1', content: 'nothing', is_error: true });
  assert.deepEqual(b['tools'], [{ name: 'search', description: 'Search', input_schema: { type: 'object' } }]);
  assert.deepEqual(b['tool_choice'], { type: 'any' });
  assert.deepEqual(claudeBody({ messages: [], tools: [{ name: 't', description: '', inputSchema: {} }], toolChoice: { tool: 't' } }, 'm')['tool_choice'], { type: 'tool', name: 't' });
  assert.match(JSON.stringify(claudeBody({ messages: [], json: true, jsonSchema: { type: 'object' } }, 'm')['system']), /exactly one JSON value/);
});

test('the model: the request\'s, else the newest Sonnet the key can use', async () => {
  const f = fakeClaude({ kind: 'text', text: 'hi' });
  const ai = claudeAI({ apiKey: 'k', fetch: (u, i) => f.fetch(u, i), sleep: instant });
  const r = await ai.chat({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] });
  assert.ok(r.ok);
  assert.equal(f.bodies[0]?.['model'], 'claude-sonnet-x');
  assert.equal(r.value.usage.cacheRead, 3);
});

/* the error contract: the English .message of a code with a catalog entry is the catalog's English text */
const arb = JSON.parse(readFileSync(new URL('../../../i18n/errors/en.arb', import.meta.url), 'utf8')) as Record<string, string>;
const fill = (m: string, p: Readonly<Record<string, unknown>>): string => m.replace(/\{(\w+)\}/g, (x, k: string) => (p[k] === undefined ? x : String(p[k])));
test('Claude errors → ai.* codes whose English words are the catalog\'s', () => {
  const cases: Array<[number, string, string, string]> = [
    [401, '', 'invalid x-api-key', 'ai.unauthorized'], [403, '', 'not allowed', 'ai.forbidden'], [400, '', 'Your credit balance is too low', 'ai.no_credit'],
    [413, '', 'request too large', 'ai.too_large'], [429, '', 'rate', 'ai.rate_limited'], [529, '', '', 'ai.overloaded'], [500, 'overloaded_error', 'Overloaded', 'ai.overloaded'],
    [500, '', '', 'ai.http'], [400, '', 'tool_choice is not supported for this model', 'ai.unsupported'],
  ];
  for (const [status, type, msg, code] of cases) {
    const e = claudeError(status, type, msg);
    assert.equal(e.code, code, `${status} ${msg}`);
    const en = arb['err.' + code];
    if (en) assert.equal(e.message, fill(en, e.params), code);
  }
  const api = claudeError(400, 'invalid_request_error', 'messages: at least one message is required');
  assert.ok(api.code === 'ai.api' && api.message === 'messages: at least one message is required' && !arb['err.ai.api'], 'ai.api keeps the API\'s own words');
});
