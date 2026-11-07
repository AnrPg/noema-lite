/**
 * Helpers of the HTTP adapters (AI vendors): server-sent events, back-off, an abortable sleep.
 */

/** Each `data:` payload of a server-sent-event stream, as it arrives (events end with a blank line; lines may be split). */
export async function* sseData(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const flush = function* (final: boolean): Generator<string> {
    buf = buf.replace(/\r\n/g, '\n');
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0 || (final && buf.trim() && (i = buf.length) >= 0)) {
      const event = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
      if (data) yield data;
      if (final && !buf.trim()) break;
    }
  };
  try {
    for (;;) {
      if (signal?.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      yield* flush(false);
    }
    buf += dec.decode();
    yield* flush(true);
  } finally {
    reader.releaseLock();
  }
}

/** Waits before the next try: the server's Retry-After (seconds) when it gave one, else 2^attempt × base, at most cap. */
export function backoffMs(attempt: number, retryAfter: string | null, baseMs = 2000, capMs = 60_000): number {
  const ra = Number(retryAfter);
  return ra > 0 ? Math.min(ra * 1000, capMs) : Math.min(capMs, baseMs * 2 ** attempt);
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const h = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = (): void => { clearTimeout(h); reject(signal?.reason); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;
