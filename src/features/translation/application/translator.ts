/* 🌐 Machine translation of SHARED content (docs/i18n.md §11): titles and descriptions other learners made public (🌍 Explore),
   shared Roadmaps and shared subjects' metadata — never anything private.
     • Providers: only the learner's OWN keys on this device (Claude or Gemini, behind MtProvider). No own key → nothing is
       translated, the original stays.
     • Consent: off by default; the learner turns it on (a:settings.mt.on) after reading what is sent where.
     • The policy check (domain/policy.ts) before anything is sent.
     • Cache per (hash of the text, target locale) on this device, size-capped, least recently used out.
     • Caps: requests per session and per minute, characters per day; a cost estimate before a bulk translation.
   The use cases over their ports; the screens (ui/) mark texts and translate them in place. */
import { baseLang, detect, differs } from '../domain/detect.ts';
import { check, type MtItem, type PolicyReason } from '../domain/policy.ts';
import {
  cacheKey,
  cachePut,
  capFor,
  chunks,
  estimateOf,
  mtSettings,
  type CacheRecord,
  type CapReason,
  type Estimate,
  type MtSettings,
  type Price,
} from '../domain/plan.ts';

/** One provider of translations: the learner's own key on this device. */
export interface MtProvider {
  readonly id: string;
  readonly label: string;
  has(acc: string): boolean;
  translate(
    acc: string,
    texts: readonly string[],
    o: { to: string; from?: string | null | undefined },
  ): Promise<{ texts: readonly string[] }>;
  price(acc: string): Price;
}

/** A small key → JSON store (this device: localStorage; this session: sessionStorage). */
export interface JsonStore {
  get(key: string): unknown;
  /** → false when it could not be written (storage full) */
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export interface TranslatorPorts {
  /** the account (acc, else the one signed in now; 'anon' without one) */
  account(acc?: string | null): string;
  /** the interface language */
  uiLocale(): string;
  /** the account's a:settings.mt as stored, and its writer (synced) */
  readSettings(acc: string): unknown;
  writeSettings(acc: string, mt: MtSettings): void;
  /** this device (the cache, the characters of the day) */
  readonly device: JsonStore | null;
  /** this session (its requests) */
  readonly session: JsonStore | null;
  readonly clock: { now(): number; today(): string };
  /** the real providers, in the order 'auto' tries them */
  providers(): readonly MtProvider[];
  /** requests per minute (config.js mtPerMinute) */
  perMinute(): number;
}

/** Why a text came back untranslated. */
export type MtReason = PolicyReason | CapReason | 'off' | 'nokey' | 'same' | 'error';
export interface MtResult {
  text: string;
  readonly original: string;
  translated: boolean;
  cached: boolean;
  provider?: string;
  reason?: MtReason;
  error?: unknown;
}
export interface TranslateOptions {
  readonly from?: string | null | undefined;
  readonly to?: string | undefined;
  readonly kind?: string | null | undefined;
  readonly acc?: string | null | undefined;
}
export type MtInput = string | (MtItem & { readonly text: unknown });

export interface Translator {
  translate(texts: readonly MtInput[], o?: TranslateOptions): Promise<MtResult[]>;
  estimate(texts: readonly MtInput[], o?: { to?: string; acc?: string | null }): Estimate;
  detect: typeof detect;
  differs(text: string, stored?: string | null, to?: string): boolean;
  check: typeof check;
  provider(acc?: string | null): { id: string; label: string } | null;
  settings(acc?: string | null): MtSettings;
  setSettings(acc: string | null | undefined, patch: Partial<MtSettings>): MtSettings;
  enabled(acc?: string | null): boolean;
  uiLocale(): string;
  readonly cache: {
    key(text: string, to: string): string;
    all(acc?: string | null): CacheRecord;
    get(acc: string | null | undefined, text: string, to: string): string | null;
    put(acc: string | null | undefined, to: string, pairs: readonly { text: string; t: string }[], hits?: readonly string[]): void;
    size(acc?: string | null): number;
    clear(acc?: string | null): void;
  };
  readonly usage: {
    day(acc?: string | null): number;
    session(acc?: string | null): number;
    perMinute(): number;
  };
  /** Tests: replace the providers with a mock (null restores the real ones). */
  useProvider(p: (Partial<MtProvider> & Pick<MtProvider, 'translate'>) | null): void;
}

const cacheId = (acc: string): string => 'noema-device:mt:cache:' + acc;
const dayId = (acc: string): string => 'noema-device:mt:day:' + acc;
const sessionId = (acc: string): string => 'noema-mt:session:' + acc;

export function createTranslator(p: TranslatorPorts): Translator {
  let mock: MtProvider | null = null;
  const sessionMem: Record<string, number> = {};
  const recent: number[] = [];

  const settings = (acc?: string | null): MtSettings => mtSettings(p.readSettings(p.account(acc)));
  const setSettings = (acc: string | null | undefined, patch: Partial<MtSettings>): MtSettings => {
    const a = p.account(acc),
      mt = { ...settings(a), ...patch };
    p.writeSettings(a, mt);
    return mt;
  };

  const provider = (acc?: string | null): MtProvider | null => {
    const a = p.account(acc);
    if (mock) return mock.has(a) ? mock : null;
    const want = settings(a).provider,
      all = p.providers();
    if (want === 'claude' || want === 'gemini') return all.find(x => x.id === want && x.has(a)) ?? null;
    return all.find(x => x.has(a)) ?? null;
  };

  const record = (acc?: string | null): CacheRecord => {
    const v = p.device?.get(cacheId(p.account(acc)));
    return v && typeof v === 'object' ? (v as CacheRecord) : {};
  };
  const cache: Translator['cache'] = {
    key: cacheKey,
    all: record,
    get(acc, text, to) {
      return record(acc)[cacheKey(text, to)]?.t ?? null;
    },
    put(acc, to, pairs, hits = []) {
      if (!p.device) return;
      const a = p.account(acc),
        next = cachePut(record(a), to, pairs, hits, p.clock.now());
      if (!p.device.set(cacheId(a), next)) p.device.remove(cacheId(a)); // storage full: start again
    },
    size: acc => Object.keys(record(acc)).length,
    clear(acc) {
      p.device?.remove(cacheId(p.account(acc)));
    },
  };

  const perMinute = (): number => {
    const t = p.clock.now() - 60000;
    while (recent.length && (recent[0] ?? 0) < t) recent.shift();
    return recent.length;
  };
  const usage: Translator['usage'] = {
    day(acc) {
      const u = p.device?.get(dayId(p.account(acc))) as { day?: string; chars?: number } | null | undefined;
      return u && u.day === p.clock.today() ? (u.chars ?? 0) : 0;
    },
    session(acc) {
      const a = p.account(acc),
        v = p.session?.get(sessionId(a));
      return (typeof v === 'number' && v) || sessionMem[a] || 0;
    },
    perMinute,
  };
  const spend = (acc: string, chars: number): void => {
    sessionMem[acc] = usage.session(acc) + 1;
    p.session?.set(sessionId(acc), sessionMem[acc]);
    recent.push(p.clock.now());
    p.device?.set(dayId(acc), { day: p.clock.today(), chars: usage.day(acc) + chars });
  };

  const textOf = (x: MtInput): string => (typeof x === 'string' ? x : x.text);

  const estimate: Translator['estimate'] = (texts, o = {}) => {
    const acc = p.account(o.acc),
      to = o.to ?? p.uiLocale();
    const uniq = [...new Set(texts.map(textOf))];
    const todo = uniq.filter(t => cache.get(acc, t, to) == null);
    const pr = provider(acc);
    return estimateOf(todo, uniq.length - todo.length, pr ? pr.price(acc) : { in: 0, out: 0 }, pr ? pr.label : null);
  };

  /**
   * texts: strings, or { text, language?, kind?, private?, sensitive? }. Never throws for policy, caps or a provider error:
   * every item comes back with its original when it was not translated (reason: off · nokey · policy · private · sensitive ·
   * empty · long · same · cap.daily · cap.session · cap.rate · error, then .error has the provider's error).
   */
  async function translate(texts: readonly MtInput[], o: TranslateOptions = {}): Promise<MtResult[]> {
    const acc = p.account(o.acc),
      to = o.to ?? p.uiLocale();
    const items: MtItem[] = texts.map(x => (typeof x === 'string' ? { text: x } : { ...x, text: textOf(x) }));
    const out: MtResult[] = items.map(x => ({ text: x.text, original: x.text, translated: false, cached: false }));
    const set = (i: number, v: Partial<MtResult>): void => {
      const r = out[i];
      if (r) Object.assign(r, v);
    };
    const s = settings(acc),
      pr = provider(acc);
    const todo = new Map<string, number[]>(); // text → its indexes (each text sent once)
    items.forEach((x, i) => {
      const why = check(x, o.kind);
      if (why) {
        set(i, { reason: why });
        return;
      }
      if (!differs(x.text, x.language ?? o.from, to)) {
        set(i, { reason: 'same' });
        return;
      }
      if (!s.on) {
        set(i, { reason: 'off' });
        return;
      }
      const hit = cache.get(acc, x.text, to);
      if (hit != null) {
        set(i, { text: hit, translated: true, cached: true });
        return;
      }
      if (!pr) {
        set(i, { reason: 'nokey' });
        return;
      }
      todo.set(x.text, [...(todo.get(x.text) ?? []), i]);
      return undefined;
    });
    const hits = out.filter(r => r.cached).map(r => r.original);
    const fresh: { text: string; t: string }[] = [];
    const each = (chunk: readonly string[], v: Partial<MtResult>): void => {
      for (const t of chunk) for (const i of todo.get(t) ?? []) set(i, v);
    };
    for (const chunk of chunks([...todo.keys()])) {
      const chars = chunk.reduce((a, t) => a + t.length, 0),
        cap = capFor(s, { session: usage.session(acc), day: usage.day(acc), perMinute: perMinute() }, chars, p.perMinute());
      if (cap) {
        each(chunk, { reason: cap });
        continue;
      }
      spend(acc, chars);
      try {
        // pr is set: todo holds texts only when there is a provider
        const r = await (pr as MtProvider).translate(acc, chunk, { to, from: o.from });
        chunk.forEach((t, j) => {
          const tx = (r.texts[j] ?? '').trim();
          if (!tx) {
            each([t], { reason: 'error' });
            return;
          }
          fresh.push({ text: t, t: tx });
          each([t], { text: tx, translated: true, provider: (pr as MtProvider).label });
        });
      } catch (e) {
        each(chunk, { reason: 'error', error: e });
      }
    }
    if (fresh.length || hits.length) cache.put(acc, to, fresh, hits);
    return out;
  }

  return Object.freeze({
    translate,
    estimate,
    detect,
    differs: (text: string, stored?: string | null, to?: string) => differs(text, stored, to ?? p.uiLocale()),
    check,
    provider: (acc?: string | null) => {
      const x = provider(acc);
      return x ? { id: x.id, label: x.label } : null;
    },
    settings,
    setSettings,
    enabled: (acc?: string | null) => settings(acc).on,
    uiLocale: () => p.uiLocale(),
    cache: Object.freeze(cache),
    usage: Object.freeze(usage),
    useProvider(m: (Partial<MtProvider> & Pick<MtProvider, 'translate'>) | null) {
      mock = m ? { id: 'mock', label: 'Mock', has: () => true, price: () => ({ in: 1, out: 1 }), ...m } : null; // a test's provider
    },
  });
}

export { baseLang };
