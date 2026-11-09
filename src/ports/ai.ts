/**
 * AI port: one chat model, whoever makes it (docs/ARCHITECTURE.md §4, docs/adr/006).
 *
 * A request is a system text, messages of typed parts (text, images, PDFs, tool calls and their results), optional tools
 * (a name, a description, a JSON Schema of the input) and a tool choice. The answer is the same parts, the stop reason
 * and the tokens used. Streaming: `onDelta` gets each piece of text or tool input as it arrives. Cancellation: `signal`
 * (an aborted request is ai.aborted). Each vendor's adapter (Claude, Gemini) maps its messages, tools, stop reasons,
 * usage and errors to this model; nothing vendor-specific crosses the port.
 *
 * Errors carry the contract codes ai.* (docs/i18n.md §6.2); `aiErrorKind` reads them as a vendor-neutral kind, so a
 * caller can decide (ask for a key, wait, show "offline") without knowing the vendor.
 */
import type { NoemaError } from '../kernel/errors.ts';
import type { AsyncResult } from '../kernel/result.ts';
import type { Json } from './common.ts';

export type AiProviderId = 'claude' | 'gemini';
export type Role = 'user' | 'assistant';

export type ContentPart =
  | { readonly type: 'text'; readonly text: string }
  /** A picture, base64 (no data: prefix). */
  | { readonly type: 'image'; readonly mediaType: string; readonly data: string }
  /** A document (PDF), base64. */
  | { readonly type: 'document'; readonly mediaType: string; readonly data: string; readonly title?: string }
  | { readonly type: 'tool_call'; readonly id: string; readonly name: string; readonly input: Json }
  | { readonly type: 'tool_result'; readonly callId: string; readonly name: string; readonly content: string; readonly isError?: boolean };

export interface ChatMessage {
  readonly role: Role;
  readonly content: readonly ContentPart[];
}

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** A JSON Schema (object) of the tool's input. */
  readonly inputSchema: { readonly [key: string]: Json };
}

/** auto: the model decides; none: no tool; any: some tool; { tool }: exactly that one. */
export type ToolChoice = 'auto' | 'none' | 'any' | { readonly tool: string };

export type StreamDelta =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_input'; readonly callId: string; readonly name: string; readonly partialJson: string };

export interface ChatRequest {
  /** The vendor's model id; the adapter's default when left out. */
  readonly model?: string;
  readonly system?: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolSpec[];
  readonly toolChoice?: ToolChoice;
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Ask for one JSON value as the text (JSON mode); with `jsonSchema`, matching it where the vendor can enforce it. */
  readonly json?: boolean;
  readonly jsonSchema?: { readonly [key: string]: Json };
  readonly signal?: AbortSignal;
  /** Streams the answer; without it the adapter may still stream internally (long answers never time out). */
  readonly onDelta?: (delta: StreamDelta) => void;
}

export type StopReason = 'end' | 'max_tokens' | 'tool_call' | 'refused' | 'other';

export interface Usage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Json;
}

export interface ChatResponse {
  readonly provider: AiProviderId;
  readonly model: string;
  readonly content: readonly ContentPart[];
  /** All text parts joined. */
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly stop: StopReason;
  readonly usage: Usage;
}

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
}

export interface AI {
  readonly provider: AiProviderId;
  chat(request: ChatRequest): AsyncResult<ChatResponse>;
  /** The models this key can use, best first. */
  models(): AsyncResult<ModelInfo[]>;
}

/** Makes the AI of a provider for one key (keys are per account and device, so the root registers factories). */
export type AiFactory = (provider: AiProviderId, apiKey: string) => AI;

export type AiErrorKind =
  | 'no_key'
  | 'unauthorized'
  | 'forbidden'
  | 'no_credit'
  | 'rate_limited'
  | 'overloaded'
  | 'too_large'
  | 'network'
  | 'aborted'
  | 'bad_answer'
  | 'unsupported'
  | 'other';

/** The vendor-neutral kind of an AI error, read from its contract code. */
export function aiErrorKind(e: NoemaError): AiErrorKind {
  switch (e.code) {
    case 'ai.no_key.device':
    case 'ai.no_key.claude':
    case 'ai.no_key.gemini':
    case 'ai.no_key.any':
      return 'no_key';
    case 'ai.unauthorized':
    case 'ai.unauthorized_short':
      return 'unauthorized';
    case 'ai.forbidden':
      return 'forbidden';
    case 'ai.no_credit':
    case 'ai.no_credit_short':
      return 'no_credit';
    case 'ai.rate_limited':
    case 'ai.quota':
      return 'rate_limited';
    case 'ai.overloaded':
      return 'overloaded';
    case 'ai.too_large':
      return 'too_large';
    case 'ai.network':
    case 'ai.no_connection':
    case 'ai.network_gemini':
      return 'network';
    case 'ai.aborted':
      return 'aborted';
    case 'ai.not_json':
    case 'ai.invalid':
      return 'bad_answer';
    case 'ai.unsupported':
      return 'unsupported';
    default:
      return 'other';
  }
}

export const NO_USAGE: Usage = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
