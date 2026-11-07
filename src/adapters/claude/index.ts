/**
 * The AI port over the Claude Messages API, behind its anti-corruption layer: the port's parts, tools and tool choice →
 * Anthropic's content blocks; its streamed events (always streamed, so long answers never time out) → the port's
 * answer, stop reason and usage; its HTTP failures → the contract codes ai.* with the English words engine/claude.js
 * always used (docs/i18n.md §6.2). Transient failures (429, 529, 5xx, a dropped connection) are retried with back-off.
 */
import { NoemaError, type ErrorCode, type ErrorParams } from '../../kernel/errors.ts';
import { err, ok, type AsyncResult, type Result } from '../../kernel/result.ts';
import type { AI, ChatRequest, ChatResponse, ContentPart, ModelInfo, StopReason, ToolCall } from '../../ports/ai.ts';
import type { Json } from '../../ports/common.ts';
import { backoffMs, realSleep, sseData, type HttpFetch, type Sleep } from '../local/http.ts';

export interface ClaudeOptions {
  readonly apiKey: string;
  readonly fetch: HttpFetch;
  readonly baseUrl?: string;
  /** The model when a request names none; left out: the newest Sonnet this key can use (else its newest model). */
  readonly defaultModel?: string;
  readonly maxRetries?: number;
  readonly sleep?: Sleep;
}

export const CLAUDE_API_VERSION = '2023-06-01';

/* ---------- errors: an answer of the API → [English message, code, params] (the same words as engine/claude.js) ---------- */
export function claudeError(status: number, type: string, message: string): NoemaError {
  const m = message;
  const e = (msg: string, code: ErrorCode, params: ErrorParams = {}, retryable = false): NoemaError =>
    new NoemaError(code, msg, { params, status, retryable });
  if (status === 400 && /tool_choice|forced tool|not supported for this model|does not support tools/i.test(m))
    return e(m, 'ai.unsupported', { detail: m });
  if (status === 401)
    return e(
      'The key was not accepted — check that you copied all of it (it starts with sk-ant-), or create a new one.',
      'ai.unauthorized',
    );
  if (status === 403)
    return e('This key is not allowed to do that (' + m + '). Use a key from your own workspace.', 'ai.forbidden', { detail: m });
  if (/credit balance|billing|purchase credits/i.test(m))
    return e('Your Claude API account has no credit left. Add credit: platform.claude.com → Settings → Billing.', 'ai.no_credit');
  if (status === 413)
    return e('A file is too big for the Claude API (' + m + '). Split the PDF or attach fewer files.', 'ai.too_large', { detail: m });
  if (status === 429)
    return e(
      'Too many requests or the spending limit was reached — waiting and trying again… (' + m + ')',
      'ai.rate_limited',
      { detail: m },
      true,
    );
  if (status === 529 || type === 'overloaded_error') return e('Claude is busy right now — trying again…', 'ai.overloaded', {}, true);
  return m ? e(m, 'ai.api', { status, detail: m }, status >= 500) : e(`HTTP ${status}`, 'ai.http', { status }, status >= 500);
}
const aborted = (): NoemaError => new NoemaError('ai.aborted', 'Stopped.');
const noKey = (): NoemaError => new NoemaError('ai.no_key.device', 'No Claude API key on this device.');

/* ---------- the port's request → the Messages API body ---------- */
type Block = { [key: string]: Json };
function toBlock(p: ContentPart): Block {
  switch (p.type) {
    case 'text':
      return { type: 'text', text: p.text };
    case 'image':
      return { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } };
    case 'document':
      return {
        type: 'document',
        source: { type: 'base64', media_type: p.mediaType, data: p.data },
        ...(p.title ? { title: p.title } : {}),
      };
    case 'tool_call':
      return { type: 'tool_use', id: p.id, name: p.name, input: p.input };
    case 'tool_result':
      return { type: 'tool_result', tool_use_id: p.callId, content: p.content, ...(p.isError ? { is_error: true } : {}) };
  }
}
export function claudeBody(r: ChatRequest, model: string): Block {
  const jsonRule = r.json
    ? `\n\nAnswer with exactly one JSON value (no prose, no code fence)${r.jsonSchema ? ` that matches this JSON Schema:\n${JSON.stringify(r.jsonSchema)}` : '.'}`
    : '';
  const system = (r.system ?? '') + jsonRule;
  const body: Block = {
    model,
    max_tokens: r.maxTokens ?? 16000,
    stream: true,
    messages: r.messages.map(m => ({ role: m.role, content: m.content.map(toBlock) })),
  };
  if (system) body['system'] = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  if (r.temperature !== undefined) body['temperature'] = r.temperature;
  if (r.tools?.length) body['tools'] = r.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  if (r.toolChoice && r.tools?.length) {
    const c = r.toolChoice;
    body['tool_choice'] = typeof c === 'object' ? { type: 'tool', name: c.tool } : { type: c };
  }
  return body;
}

const STOPS: { readonly [k: string]: StopReason } = {
  end_turn: 'end',
  stop_sequence: 'end',
  max_tokens: 'max_tokens',
  tool_use: 'tool_call',
  refusal: 'refused',
  pause_turn: 'other',
};

interface Draft {
  kind: 'text' | 'tool' | 'other';
  text: string;
  id: string;
  name: string;
  json: string;
}

/** The streamed events → the port's answer. Throws a NoemaError (an `error` event, a broken tool input). */
async function readStream(res: Response, r: ChatRequest, model: string): Promise<ChatResponse> {
  if (!res.body) throw new NoemaError('ai.api', 'Claude sent an empty answer', { params: { status: res.status, detail: 'empty body' } });
  const drafts: Array<Draft | undefined> = []; // by the stream's block index (a block may never start)
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let stop: StopReason = 'other',
    seenModel = model;
  for await (const data of sseData(res.body, r.signal)) {
    let d: { [k: string]: unknown };
    try {
      d = JSON.parse(data) as { [k: string]: unknown };
    } catch {
      continue;
    } // a keep-alive or a line that is not an event
    const t = d['type'];
    if (t === 'message_start') {
      const m = d['message'] as { model?: string; usage?: Record<string, number> } | undefined;
      if (m?.model) seenModel = m.model;
      usage.input += m?.usage?.['input_tokens'] ?? 0;
      usage.cacheRead += m?.usage?.['cache_read_input_tokens'] ?? 0;
      usage.cacheWrite += m?.usage?.['cache_creation_input_tokens'] ?? 0;
      usage.output += m?.usage?.['output_tokens'] ?? 0;
    } else if (t === 'content_block_start') {
      const b = d['content_block'] as { type?: string; text?: string; id?: string; name?: string } | undefined;
      drafts[d['index'] as number] = {
        kind: b?.type === 'text' ? 'text' : b?.type === 'tool_use' ? 'tool' : 'other',
        text: b?.text ?? '',
        id: b?.id ?? '',
        name: b?.name ?? '',
        json: '',
      };
    } else if (t === 'content_block_delta') {
      const x = drafts[d['index'] as number],
        delta = d['delta'] as { type?: string; text?: string; partial_json?: string } | undefined;
      if (!x || !delta) continue;
      if (delta.type === 'text_delta' && delta.text) {
        x.text += delta.text;
        r.onDelta?.({ type: 'text', text: delta.text });
      } else if (delta.type === 'input_json_delta' && delta.partial_json) {
        x.json += delta.partial_json;
        r.onDelta?.({ type: 'tool_input', callId: x.id, name: x.name, partialJson: delta.partial_json });
      }
    } else if (t === 'message_delta') {
      const delta = d['delta'] as { stop_reason?: string } | undefined,
        u = d['usage'] as { output_tokens?: number } | undefined;
      if (delta?.stop_reason) stop = STOPS[delta.stop_reason] ?? 'other';
      if (u?.output_tokens) usage.output = Math.max(usage.output, u.output_tokens);
    } else if (t === 'error') {
      const e = d['error'] as { type?: string; message?: string } | undefined;
      throw claudeError(0, e?.type ?? '', e?.message ?? 'stream error');
    }
  }
  const content: ContentPart[] = [],
    toolCalls: ToolCall[] = [];
  for (const x of drafts) {
    if (!x) continue;
    if (x.kind === 'text' && x.text) content.push({ type: 'text', text: x.text });
    if (x.kind === 'tool') {
      let input: Json;
      try {
        input = x.json ? (JSON.parse(x.json) as Json) : {};
      } catch (e) {
        if (stop === 'max_tokens') {
          input = null;
        } // cut off by the token limit: the caller sees stop = max_tokens
        else throw new NoemaError('ai.not_json', 'The answer was not valid JSON.', { cause: e });
      }
      content.push({ type: 'tool_call', id: x.id, name: x.name, input });
      toolCalls.push({ id: x.id, name: x.name, input });
    }
  }
  const text = content.flatMap(p => (p.type === 'text' ? [p.text] : [])).join('');
  return { provider: 'claude', model: seenModel, content, text, toolCalls, stop, usage: usage };
}

export function claudeAI(o: ClaudeOptions): AI {
  const base = (o.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '');
  const sleep = o.sleep ?? realSleep,
    maxRetries = o.maxRetries ?? 5;
  const headers = (json: boolean): Record<string, string> => ({
    'x-api-key': o.apiKey,
    'anthropic-version': CLAUDE_API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(json ? { 'content-type': 'application/json' } : {}),
  });

  /** One call with retries: a function that makes the request and reads the answer. */
  async function withRetries<T>(signal: AbortSignal | undefined, attempt: (n: number) => Promise<T>): AsyncResult<T> {
    for (let n = 0; ; n++) {
      if (signal?.aborted) return err(aborted());
      try {
        return ok(await attempt(n));
      } catch (e) {
        if (signal?.aborted) return err(aborted());
        const ne =
          e instanceof NoemaError
            ? e
            : new NoemaError(
                'ai.network',
                `No connection to Claude (${e instanceof Error ? e.message : String(e)}). Check the internet connection and press Resume.`,
                { params: { detail: e instanceof Error ? e.message : String(e) }, cause: e, retryable: true },
              );
        if (!ne.retryable || n >= maxRetries) return err(ne);
        try {
          await sleep(
            ne.code === 'ai.network'
              ? Math.min(30_000, 1500 * 2 ** n)
              : backoffMs(n, (ne.params['retryAfter'] as string | undefined) ?? null),
            signal,
          );
        } catch {
          return err(aborted());
        } // aborted while waiting
      }
    }
  }
  /** A failed HTTP answer → its NoemaError (the Retry-After kept for the back-off). */
  async function failure(res: Response): Promise<NoemaError> {
    let type = '',
      msg = '';
    try {
      const j = (await res.json()) as { error?: { type?: string; message?: string } };
      type = j.error?.type ?? '';
      msg = j.error?.message ?? '';
    } catch {
      msg = '';
    } // no JSON body: the status alone decides
    const e = claudeError(res.status, type, msg);
    const ra = res.headers.get('retry-after');
    return ra && e.retryable
      ? new NoemaError(e.code, e.message, { params: { ...e.params, retryAfter: ra }, status: res.status, retryable: true })
      : e;
  }

  let chosen: AsyncResult<string> | null = null;
  /** The model of a request: its own, the configured default, else the newest Sonnet of the key's models (asked once). */
  const modelFor = async (r: ChatRequest): AsyncResult<string> => {
    if (r.model) return ok(r.model);
    if (o.defaultModel) return ok(o.defaultModel);
    const pick: AsyncResult<string> = (chosen ??= ai.models().then((ms): Result<string> => {
      if (!ms.ok) {
        chosen = null;
        return ms;
      } // asked again next time (the key may be fixed meanwhile)
      const id = (ms.value.find(m => /sonnet/i.test(m.id)) ?? ms.value[0])?.id;
      return id ? ok(id) : err(new NoemaError('ai.api', 'this key can use no model', { params: { status: 0, detail: 'no models' } }));
    }));
    return pick;
  };

  const ai: AI = {
    provider: 'claude',
    async chat(r) {
      if (!o.apiKey) return err(noKey());
      const m = await modelFor(r);
      if (!m.ok) return m;
      const model = m.value;
      const body = JSON.stringify(claudeBody(r, model));
      return withRetries(r.signal, async () => {
        const res = await o.fetch(base + '/v1/messages', {
          method: 'POST',
          headers: headers(true),
          body,
          ...(r.signal ? { signal: r.signal } : {}),
        });
        if (!res.ok) throw await failure(res);
        return readStream(res, r, model);
      });
    },
    async models(): AsyncResult<ModelInfo[]> {
      if (!o.apiKey) return err(noKey());
      return withRetries(undefined, async () => {
        const res = await o.fetch(base + '/v1/models?limit=100', { method: 'GET', headers: headers(false) });
        if (!res.ok) throw await failure(res);
        const j = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
        return (j.data ?? []).map(m => ({ id: m.id, name: m.display_name ?? m.id }));
      });
    },
  };
  return ai;
}
