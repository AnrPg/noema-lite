/**
 * The AI port over Google's Gemini API (v1beta), behind its anti-corruption layer: the port's messages → `contents`
 * (role "model" for the assistant, inlineData for pictures and PDFs, functionCall / functionResponse for tools), tools →
 * functionDeclarations with an OpenAPI-subset schema, tool choice → functionCallingConfig, JSON mode → responseMimeType
 * (+ responseSchema); the answer's parts, finishReason and usageMetadata → the port's answer. Errors → ai.* with the
 * English words engine/llm.js always used. A model that refuses a thinking setting is asked again without it.
 */
import { NoemaError, type ErrorParams } from '../../kernel/errors.ts';
import { err, ok, type AsyncResult } from '../../kernel/result.ts';
import type { AI, ChatRequest, ChatResponse, ContentPart, ModelInfo, StopReason, ToolCall } from '../../ports/ai.ts';
import type { Json } from '../../ports/common.ts';
import { backoffMs, realSleep, sseData, type HttpFetch, type Sleep } from '../local/http.ts';

export interface GeminiOptions {
  readonly apiKey: string;
  readonly fetch: HttpFetch;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  readonly maxRetries?: number;
  readonly sleep?: Sleep;
}

export const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';

/** How good a model is for the app (engine/src/20_ai.js modelScore): negative = not offered. */
export function geminiModelScore(name: string): number {
  const n = name.replace(/^models\//, '');
  if (/(image|tts|audio|live|embed|aqa|gemma|robotics|computer|native|veo|imagen|learnlm|nano|banana|thinking-exp|research|deep)/i.test(n)) return -1;
  if (!/gemini/i.test(n)) return -1;
  let s = 0;
  const v = /gemini-(\d+(?:\.\d+)?)/.exec(n);
  if (v?.[1]) s += parseFloat(v[1]) * 100;
  else if (/latest/.test(n)) s += 240;
  if (/flash/.test(n)) s += 60;
  if (/lite/.test(n)) s -= 45;
  if (/pro/.test(n)) s += 20;
  if (/preview|exp/.test(n)) s -= 8;
  if (/\d{2}-\d{2}|\d{3}$/.test(n)) s -= 3;
  return s;
}

export function thinkingFor(model: string): { [k: string]: Json } | null {
  if (/gemini-3/.test(model)) return { thinkingLevel: 'low' };
  if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/2\.5-pro/.test(model)) return { thinkingBudget: 128 };
  return null;
}

/* ---------- errors ---------- */
const e = (msg: string, code: 'ai.quota' | 'ai.api_gemini' | 'ai.no_connection' | 'ai.aborted' | 'ai.no_key.gemini' | 'ai.unsupported', params: ErrorParams = {}, status?: number, retryable = false): NoemaError =>
  new NoemaError(code, msg, { params, retryable, ...(status === undefined ? {} : { status }) });
export function geminiError(status: number, text: string): NoemaError {
  if (status === 429) return e('Gemini’s free quota is used up for now (429) — wait a minute or use Claude.', 'ai.quota', {}, status, true);
  if (status === 400 && /function calling|tools? (is|are) not supported/i.test(text)) return e(text.slice(0, 200), 'ai.unsupported', { detail: text.slice(0, 200) }, status);
  return e(`Gemini ${status}: ${text.slice(0, 200)}`, 'ai.api_gemini', { status, detail: text.slice(0, 200) }, status, status >= 500);
}
const networkError = (cause: unknown): NoemaError => {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new NoemaError('ai.no_connection', 'No connection to Gemini: ' + detail, { params: { provider: 'Gemini', detail }, cause, retryable: true });
};
const aborted = (): NoemaError => e('Stopped.', 'ai.aborted');

/* ---------- the port's request → the generateContent body ---------- */
const SCHEMA_KEYS = new Set(['type', 'format', 'description', 'nullable', 'enum', 'properties', 'required', 'items', 'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'anyOf', 'propertyOrdering', 'title']);
/** A JSON Schema → the OpenAPI subset Gemini takes (unknown keywords dropped, recursively). */
export function geminiSchema(s: Json): Json {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out: { [k: string]: Json } = {};
  for (const [k, v] of Object.entries(s)) {
    if (!SCHEMA_KEYS.has(k)) continue;
    if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) out[k] = Object.fromEntries(Object.entries(v).map(([p, x]) => [p, geminiSchema(x)]));
    else out[k] = k === 'items' || k === 'anyOf' ? geminiSchema(v) : v;
  }
  return out;
}
type Part = { [k: string]: Json };
function toPart(p: ContentPart): Part {
  switch (p.type) {
    case 'text': return { text: p.text };
    case 'image': case 'document': return { inlineData: { mimeType: p.mediaType, data: p.data } };
    case 'tool_call': return { functionCall: { name: p.name, args: p.input } };
    case 'tool_result': return { functionResponse: { name: p.name, response: { content: p.content, ...(p.isError ? { isError: true } : {}) } } };
  }
}
export function geminiBody(r: ChatRequest, model: string, thinking: boolean): { [k: string]: Json } {
  const gc: { [k: string]: Json } = { maxOutputTokens: r.maxTokens ?? 65536 };
  if (r.temperature !== undefined) gc['temperature'] = r.temperature;
  if (r.json) { gc['responseMimeType'] = 'application/json'; if (r.jsonSchema) gc['responseSchema'] = geminiSchema(r.jsonSchema); }
  const th = thinking ? thinkingFor(model) : null;
  if (th) gc['thinkingConfig'] = th;
  const body: { [k: string]: Json } = { contents: r.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: m.content.map(toPart) })), generationConfig: gc };
  if (r.system) body['systemInstruction'] = { parts: [{ text: r.system }] };
  if (r.tools?.length) {
    body['tools'] = [{ functionDeclarations: r.tools.map(t => ({ name: t.name, description: t.description, parameters: geminiSchema(t.inputSchema) })) }];
    const c = r.toolChoice ?? 'auto';
    body['toolConfig'] = { functionCallingConfig: typeof c === 'object' ? { mode: 'ANY', allowedFunctionNames: [c.tool] } : { mode: c === 'any' ? 'ANY' : c === 'none' ? 'NONE' : 'AUTO' } };
  }
  return body;
}

const STOPS: { readonly [k: string]: StopReason } = { STOP: 'end', MAX_TOKENS: 'max_tokens', SAFETY: 'refused', RECITATION: 'refused', PROHIBITED_CONTENT: 'refused', BLOCKLIST: 'refused', SPII: 'refused' };

interface Chunk {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean; functionCall?: { name: string; args?: Json } }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
}

/** Folds the answer's chunks (one for generateContent, many when streamed) into the port's answer. */
class Answer {
  text = '';
  calls: ToolCall[] = [];
  finish: string | null = null;
  blocked = false;
  usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  model: string;
  readonly r: ChatRequest;
  constructor(model: string, r: ChatRequest) { this.model = model; this.r = r; }
  add(c: Chunk): void {
    const cand = c.candidates?.[0];
    for (const p of cand?.content?.parts ?? []) {
      if (p.thought) continue;
      if (p.text) { this.text += p.text; this.r.onDelta?.({ type: 'text', text: p.text }); }
      if (p.functionCall) {
        const id = 'call_' + this.calls.length, input = p.functionCall.args ?? {};
        this.calls.push({ id, name: p.functionCall.name, input });
        this.r.onDelta?.({ type: 'tool_input', callId: id, name: p.functionCall.name, partialJson: JSON.stringify(input) });
      }
    }
    if (cand?.finishReason) this.finish = cand.finishReason;
    if (c.promptFeedback?.blockReason) this.blocked = true;
    if (c.modelVersion) this.model = c.modelVersion;
    const u = c.usageMetadata;
    if (u) this.usage = { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cacheRead: u.cachedContentTokenCount ?? 0, cacheWrite: 0 };
  }
  done(): ChatResponse {
    const content: ContentPart[] = [...(this.text ? [{ type: 'text' as const, text: this.text }] : []), ...this.calls.map(c => ({ type: 'tool_call' as const, ...c }))];
    const stop: StopReason = this.blocked ? 'refused' : this.calls.length ? 'tool_call' : (STOPS[this.finish ?? ''] ?? 'other');
    return { provider: 'gemini', model: this.model, content, text: this.text, toolCalls: this.calls, stop, usage: this.usage };
  }
}

export function geminiAI(o: GeminiOptions): AI {
  const base = (o.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const sleep = o.sleep ?? realSleep, maxRetries = o.maxRetries ?? 5;
  const noThinking = new Set<string>();
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': o.apiKey };

  return {
    provider: 'gemini',
    async chat(r): AsyncResult<ChatResponse> {
      if (!o.apiKey) return err(e('No Gemini key (⚙️ Settings).', 'ai.no_key.gemini'));
      const model = r.model ?? o.defaultModel ?? GEMINI_DEFAULT_MODEL;
      const stream = !!r.onDelta;
      const url = `${base}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
      for (let n = 0; ; n++) {
        if (r.signal?.aborted) return err(aborted());
        let res: Response;
        try {
          res = await o.fetch(url, { method: 'POST', headers, body: JSON.stringify(geminiBody(r, model, !noThinking.has(model))), ...(r.signal ? { signal: r.signal } : {}) });
        } catch (x) {
          if (r.signal?.aborted) return err(aborted());
          if (n >= maxRetries - 1) return err(networkError(x));
          try { await sleep(1500 * 2 ** n, r.signal); } catch { return err(aborted()); } // aborted while waiting
          continue;
        }
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          if (res.status === 400 && /thinking/i.test(t) && !noThinking.has(model) && thinkingFor(model)) { noThinking.add(model); n--; continue; }
          const ge = geminiError(res.status, t);
          if (ge.retryable && n < maxRetries) {
            try { await sleep(backoffMs(n, res.headers.get('retry-after'), 4000), r.signal); } catch { return err(aborted()); } // aborted while waiting
            continue;
          }
          return err(ge);
        }
        const a = new Answer(model, r);
        try {
          if (stream && res.body) {
            for await (const data of sseData(res.body, r.signal)) {
              let c: Chunk;
              try { c = JSON.parse(data) as Chunk; } catch { continue; } // not an event (a keep-alive)
              a.add(c);
            }
          } else a.add((await res.json()) as Chunk);
        } catch (x) {
          if (r.signal?.aborted) return err(aborted());
          if (n < maxRetries - 1) continue; // the connection dropped mid-answer: ask again
          return err(networkError(x));
        }
        return ok(a.done());
      }
    },
    async models(): AsyncResult<ModelInfo[]> {
      if (!o.apiKey) return err(e('No Gemini key (⚙️ Settings).', 'ai.no_key.gemini'));
      let res: Response;
      try { res = await o.fetch(`${base}/models?pageSize=1000`, { method: 'GET', headers: { 'x-goog-api-key': o.apiKey } }); } catch (x) { return err(networkError(x)); }
      if (!res.ok) return err(geminiError(res.status, await res.text().catch(() => '')));
      const d = (await res.json()) as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
      return ok((d.models ?? [])
        .filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName ?? m.name.replace(/^models\//, '') }))
        .filter(m => geminiModelScore(m.id) >= 0)
        .sort((a, b) => geminiModelScore(b.id) - geminiModelScore(a.id)));
    },
  };
}
