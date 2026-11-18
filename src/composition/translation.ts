/**
 * 🌐 The machine translation of shared texts (src/features/translation, docs/i18n.md §11), composed for the page:
 *
 *   NoemaCore.mt (build/app.js)   the translator: translate(texts, { from, to, kind, acc }) → [{ text, original, translated,
 *                                 cached, provider?, reason? }] · estimate · detect · differs · check · provider · settings ·
 *                                 setSettings · enabled · cache.{get, put, all, size, clear} · usage.{day, session, perMinute} ·
 *                                 useProvider(mock | null) (tests) · PUBLIC_KINDS · DEFAULTS
 *   NoemaShell.mt (build/ui.js)   its screens (src/composition/translation-ui.ts)
 *
 * The providers are the learner's own keys on this device only (Claude: engine/claude.js Key; Gemini: the device's key,
 * never the key the app ships with), called through engine/llm.js; the settings are a:settings.mt, written through
 * NoemaThemes.putSettings so they sync.
 */
import { webJsonStore } from '../adapters/browser/json-store.ts';
import { createTranslator, type MtProvider, type Translator } from '../features/translation/application/translator.ts';
import { MT_DEFAULTS, mtPrompt, type MtSettings, type Price } from '../features/translation/domain/plan.ts';
import { PUBLIC_KINDS } from '../features/translation/domain/policy.ts';
import type { BridgeExtension } from './bridge.ts';
import type { Resolver } from './container.ts';
import { CLOCK, STORAGE } from './tokens.ts';

export interface MtGlobals {
  NOEMA_CONFIG?: { mtPerMinute?: number; geminiPrices?: Price };
  DEFAULT_GEMINI_KEY?: string;
  Noema?: { account?: { id?: string } | null; kv?: { acc?: string | null }; local?: { geminiKey?: string } };
  NoemaThemes?: { putSettings?(patch: Readonly<Record<string, unknown>>, acc: string): void };
  NoemaI18n?: { locale?: string };
  NoemaClaude?: { Key?: { get?(acc: string): string | null | undefined }; priceOf?(model: string): Price };
  NoemaLLM?: {
    json(o: Readonly<Record<string, unknown>>): Promise<{ data: { t: unknown[] } }>;
  };
  NoemaCore?: { mt?: Translator };
}

const settingsKey = (acc: string): string => `noema1:${acc}:a:settings`;

/** The translator over the root's storage and clock and the page's keys, settings writer and AI client. */
export function pageTranslator(r: Resolver, g: MtGlobals = globalThis as MtGlobals): Translator {
  const kv = r.get(STORAGE).kv,
    clock = r.get(CLOCK),
    device = webJsonStore('localStorage'),
    json = (k: string): Record<string, unknown> => {
      const v = device.get(k);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    };
  const account = (acc?: string | null): string =>
    acc || g.Noema?.account?.id || g.Noema?.kv?.acc || (json('noema1:current')['acc'] as string | undefined) || 'anon';
  const ownKeys = (acc: string): { claude: string; gemini: string } => {
    const dev = kv.get('noema-device:geminiKey:' + acc);
    let gem = (dev.ok && dev.value) || (json(settingsKey(acc))['apiKey'] as string | undefined) || g.Noema?.local?.geminiKey || '';
    if (gem && gem === g.DEFAULT_GEMINI_KEY) gem = ''; // a key the app ships with is not the learner's own
    return { claude: g.NoemaClaude?.Key?.get?.(acc) ?? '', gemini: gem };
  };
  const enName = (tag: string): string => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
    } catch {
      return tag; // a tag Intl does not know: named as it is
    }
  };
  const viaLlm =
    (provider: 'claude' | 'gemini'): MtProvider['translate'] =>
    async (acc, texts, { to, from }) => {
      const L = g.NoemaLLM;
      if (!L) throw Object.assign(new Error('No AI client loaded.'), { code: 'mt.no_provider' }); // a log: the hint says it
      const q = mtPrompt(texts, to, from, enName),
        n = texts.length;
      const res = await L.json({
        acc,
        provider,
        system: q.system,
        prompt: q.prompt,
        schema: q.schema,
        name: 'translations',
        repairs: 1,
        maxTokens: q.maxTokens,
        validate: (d: { t: unknown[] }) => (d.t.length === n ? [] : [`expected ${n} strings, got ${d.t.length}`]),
      });
      return { texts: res.data.t.map(String) };
    };
  const providers: readonly MtProvider[] = [
    {
      id: 'claude',
      label: 'Claude',
      has: acc => !!ownKeys(acc).claude,
      translate: viaLlm('claude'),
      price: acc => {
        const m = kv.get(`noema1:${acc}:a:claudeModel`);
        let model = 'sonnet';
        try {
          model = m.ok && m.value ? (JSON.parse(m.value) as string) : model;
        } catch {
          model = 'sonnet'; // not JSON: the default model's price
        }
        return g.NoemaClaude?.priceOf ? g.NoemaClaude.priceOf(model) : { in: 3, out: 15 };
      },
    },
    {
      id: 'gemini',
      label: 'Gemini',
      has: acc => !!ownKeys(acc).gemini,
      translate: viaLlm('gemini'),
      price: () => g.NOEMA_CONFIG?.geminiPrices ?? { in: 0.3, out: 2.5 },
    },
  ];
  return createTranslator({
    account,
    uiLocale: () => g.NoemaI18n?.locale || 'en',
    readSettings: acc => json(settingsKey(acc))['mt'],
    writeSettings: (acc: string, mt: MtSettings) => {
      if (g.NoemaThemes?.putSettings) {
        g.NoemaThemes.putSettings({ mt }, acc);
        return;
      }
      device.set(settingsKey(acc), { ...json(settingsKey(acc)), mt });
    },
    device,
    session: webJsonStore('sessionStorage'),
    clock: { now: () => clock.now(), today: () => clock.today() },
    providers: () => providers,
    perMinute: () => g.NOEMA_CONFIG?.mtPerMinute || 6,
  });
}

export const mtBridge: BridgeExtension = {
  name: 'mt',
  build: r => Object.freeze({ ...pageTranslator(r), PUBLIC_KINDS, DEFAULTS: MT_DEFAULTS }),
};
