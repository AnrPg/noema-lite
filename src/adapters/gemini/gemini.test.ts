/// <reference types="node" />
/** The Gemini adapter passes the AI contract (a fake Gemini API), maps the port's model to Gemini's, and its errors keep the contract. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiContract } from '../../ports/contract/ai.contract.ts';
import { fakeGemini } from '../testing/fake-ai-vendors.ts';
import { geminiAI, geminiBody, geminiError, geminiSchema } from './index.ts';

const instant = async (): Promise<void> => {};
aiContract('gemini', (scenario, { apiKey }) => {
  const f = fakeGemini(scenario);
  return { ai: geminiAI({ apiKey, fetch: (u, i) => f.fetch(u, i), sleep: instant }), calls: f.calls };
});

test('the request: roles, inline data, function calls and responses, tools, tool choice, JSON mode, thinking', () => {
  const b = geminiBody({
    system: 'Be brief.',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image', mediaType: 'image/png', data: 'AAA' }] },
      { role: 'assistant', content: [{ type: 'tool_call', id: 'call_0', name: 'search', input: { q: 'x' } }] },
      { role: 'user', content: [{ type: 'tool_result', callId: 'call_0', name: 'search', content: 'nothing' }] },
    ],
    tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object', properties: { q: { type: 'string', minLength: 1 } }, additionalProperties: false, $schema: 'x' } }],
    toolChoice: { tool: 'search' },
    json: true,
    jsonSchema: { type: 'object', additionalProperties: false, properties: { a: { type: 'integer', const: 1 } } },
  }, 'gemini-2.5-flash', true);
  const contents = b['contents'] as Array<{ role: string; parts: Array<Record<string, unknown>> }>;
  assert.deepEqual(contents.map(c => c.role), ['user', 'model', 'user']);
  assert.deepEqual(contents[0]?.parts[1], { inlineData: { mimeType: 'image/png', data: 'AAA' } });
  assert.deepEqual(contents[1]?.parts[0], { functionCall: { name: 'search', args: { q: 'x' } } });
  assert.deepEqual(contents[2]?.parts[0], { functionResponse: { name: 'search', response: { content: 'nothing' } } });
  assert.deepEqual(b['systemInstruction'], { parts: [{ text: 'Be brief.' }] });
  assert.deepEqual(b['tools'], [{ functionDeclarations: [{ name: 'search', description: 'Search', parameters: { type: 'object', properties: { q: { type: 'string', minLength: 1 } } } }] }]);
  assert.deepEqual(b['toolConfig'], { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['search'] } });
  const gc = b['generationConfig'] as Record<string, unknown>;
  assert.equal(gc['responseMimeType'], 'application/json');
  assert.deepEqual(gc['responseSchema'], { type: 'object', properties: { a: { type: 'integer' } } });
  assert.deepEqual(gc['thinkingConfig'], { thinkingBudget: 0 });
  assert.equal((geminiBody({ messages: [] }, 'gemini-2.5-flash', false)['generationConfig'] as Record<string, unknown>)['thinkingConfig'], undefined);
  assert.deepEqual(geminiSchema({ anyOf: [{ type: 'string', default: 'x' }] }), { anyOf: [{ type: 'string' }] });
});

test('models: only text models, best first; thoughts are not part of the answer', async () => {
  const f = fakeGemini({ kind: 'text', text: 'Hello there' });
  const ai = geminiAI({ apiKey: 'k', fetch: (u, i) => f.fetch(u, i), sleep: instant });
  const m = await ai.models();
  assert.ok(m.ok);
  assert.deepEqual(m.value.map(x => x.id), ['gemini-2.5-flash', 'gemini-2.0-flash']);
  const r = await ai.chat({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] });
  assert.ok(r.ok && r.value.text === 'Hello there' && r.value.usage.cacheRead === 2);
});

test('a model that refuses the thinking setting is asked again without it', async () => {
  let n = 0;
  const bodies: Array<Record<string, unknown>> = [];
  const ai = geminiAI({ apiKey: 'k', sleep: instant, fetch: async (_u, i) => {
    n++;
    bodies.push(JSON.parse(String(i.body)) as Record<string, unknown>);
    if (n === 1) return new Response('{"error":{"message":"Thinking is not supported for this model"}}', { status: 400 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  const r = await ai.chat({ model: 'gemini-3-pro', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] });
  assert.ok(r.ok && r.value.text === 'ok');
  assert.ok((bodies[0]?.['generationConfig'] as Record<string, unknown>)['thinkingConfig']);
  assert.equal((bodies[1]?.['generationConfig'] as Record<string, unknown>)['thinkingConfig'], undefined);
});

const arb = JSON.parse(readFileSync(new URL('../../../i18n/errors/en.arb', import.meta.url), 'utf8')) as Record<string, string>;
const fill = (m: string, p: Readonly<Record<string, unknown>>): string => m.replace(/\{(\w+)\}/g, (x, k: string) => (p[k] === undefined ? x : String(p[k])));
test('Gemini errors → ai.* codes whose English words are the catalog\'s', async () => {
  for (const [status, text, code] of [[429, 'quota', 'ai.quota'], [400, 'API key not valid. Please pass a valid API key.', 'ai.api_gemini'], [503, 'overloaded', 'ai.api_gemini']] as const) {
    const e = geminiError(status, text);
    assert.equal(e.code, code);
    assert.equal(e.message, fill(arb['err.' + code] ?? '', e.params), code);
  }
  const off = await geminiAI({ apiKey: 'k', sleep: instant, maxRetries: 1, fetch: async () => { throw new TypeError('Failed to fetch'); } }).chat({ messages: [] });
  assert.ok(!off.ok && off.error.code === 'ai.no_connection');
  assert.equal(off.error.message, fill(arb['err.ai.no_connection'] ?? '', off.error.params));
  const nokey = await geminiAI({ apiKey: '', fetch: async () => new Response('') }).chat({ messages: [] });
  assert.ok(!nokey.ok && nokey.error.message === arb['err.ai.no_key.gemini']);
});
