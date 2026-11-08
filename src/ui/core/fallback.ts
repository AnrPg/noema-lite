/**
 * The services of a component that is not inside an app (no provider above it): words are the key's last part, as the
 * I18n adapter answers before its runtime is there, the time is the platform's, no other language is offered. It keeps a
 * stray component drawable; every real screen gets its services from its root (services.ts).
 */
import { dayOf } from '../../kernel/day.ts';
import type { Clock, TimerHandle } from '../../ports/clock.ts';
import type { I18n } from '../../ports/i18n.ts';
import type { UiServices } from './services.ts';

const lastPart = (key: string): string => key.split('.').pop() ?? key;

const i18n: I18n = {
  t: key => lastPart(key),
  has: () => false,
  err: e => (e instanceof Error ? e.message : typeof e === 'string' ? e : ''),
  plural: n => new Intl.PluralRules('en').select(n),
  locale: () => 'en',
  chain: () => ['en'],
  dir: () => 'ltr',
  format: {
    number: (n, o) => new Intl.NumberFormat('en', o).format(n),
    percent: (x, o) => new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0, ...o }).format(x),
    date: (d, o) => {
      const x = d instanceof Date ? d : new Date(d);
      return Number.isNaN(x.getTime()) ? '' : new Intl.DateTimeFormat('en', o).format(x);
    },
    time: (d, o) => {
      const x = d instanceof Date ? d : new Date(d);
      return Number.isNaN(x.getTime()) ? '' : new Intl.DateTimeFormat('en', o ?? { timeStyle: 'short' }).format(x);
    },
    relative: (v, unit) => new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(v, unit),
    list: (items, o) => new Intl.ListFormat('en', o).format([...items]),
    compare: (a, b) => a.localeCompare(b, 'en'),
  },
  onChange: () => () => undefined,
};

const handle = (h: unknown): TimerHandle => h as TimerHandle;
const clock: Clock = {
  now: () => Date.now(),
  today: () => dayOf(Date.now()),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  setTimeout: (f, ms) => handle(globalThis.setTimeout(f, ms)),
  clearTimeout: h => {
    globalThis.clearTimeout(h as unknown as ReturnType<typeof globalThis.setTimeout>);
  },
  setInterval: (f, ms) => handle(globalThis.setInterval(f, ms)),
  clearInterval: h => {
    globalThis.clearInterval(h as unknown as ReturnType<typeof globalThis.setInterval>);
  },
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      const t = globalThis.setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        globalThis.clearTimeout(t);
        reject(signal.reason as Error);
      });
    }),
  onDayChange: () => () => undefined,
};

export const FALLBACK_SERVICES: UiServices = {
  i18n,
  clock,
  locales: { list: () => [{ tag: 'en', name: 'English', dir: 'ltr' }], use: () => Promise.resolve('en') },
};
