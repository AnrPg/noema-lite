/**
 * The AI port without a vendor: the copy fallback. When the learner has no AI key on this device, a turn still produces
 * its whole prompt — the instructions and the conversation so far — as one plain text the learner can copy and paste
 * into any AI chat they use. chat() answers ai.no_key.any (the screens then offer the 🔑 guide and the copy); prompt()
 * gives the text of the last request.
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, type AsyncResult } from '../../kernel/result.ts';
import type { AI, ChatRequest, ChatResponse, ModelInfo } from '../../ports/ai.ts';

/** a request as one text: its instructions, then each message by its speaker */
export function promptText(
  r: ChatRequest,
  names: { readonly user: string; readonly assistant: string } = { user: 'Learner', assistant: 'Tutor' },
): string {
  const turns = r.messages.map(m => {
    const text = m.content.map(p => (p.type === 'text' ? p.text : p.type === 'tool_result' ? p.content : '')).join('\n');
    return `${m.role === 'user' ? names.user : names.assistant}: ${text}`;
  });
  return [r.system ? r.system.trim() : '', turns.join('\n\n')].filter(Boolean).join('\n\n---\n\n');
}

export interface CopyPromptAI extends AI {
  /** the text of the last request (null before the first) */
  prompt(): string | null;
}

export function copyPromptAI(): CopyPromptAI {
  let last: string | null = null;
  return {
    provider: 'gemini', // no vendor: the port names one of its two (nothing is ever sent)
    chat(r: ChatRequest): AsyncResult<ChatResponse> {
      last = promptText(r);
      return Promise.resolve(err(new NoemaError('ai.no_key.any', 'Add a Claude API key or a Gemini key first.')));
    },
    models: (): AsyncResult<ModelInfo[]> => Promise.resolve(ok([])),
    prompt: () => last,
  };
}
