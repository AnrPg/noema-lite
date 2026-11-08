/**
 * THE BROWSER ROOT, its wiring (src/composition/app.ts is the entry that starts it; built to build/app.js, an IIFE;
 * docs/ARCHITECTURE.md §5). It is the one place that picks the
 * browser adapters, wires them into the container and publishes the phase bridge window.NoemaCore (src/composition/
 * bridge.ts has its exact surface). index.html and the one-file bundle load build/app.js right after the vendor
 * scripts, before engine/i18n.js and every other engine script, so NoemaCore exists when build/ui.js and engine/app/*.js run.
 *
 * Evaluating this module touches no DOM, timer or network: every adapter looks up its platform objects when first used,
 * so the root also loads in a bare vm (tests/bridge.js, tests/mt.js, src/composition/composition.test.ts).
 *
 * Adding to the root: a helper exports a Registration (c => c.register(TOKEN, factory)) and appends it to
 * APP_REGISTRATIONS; a bridge name for the old UI goes into BRIDGE_EXTENSIONS; a Compute job into JOB_REGISTRATIONS
 * (src/composition/jobs.ts). Nothing else in this file changes for a feature.
 */
import { browserStorage } from '../adapters/browser/storage.ts';
import { systemClock } from '../adapters/browser/clock.ts';
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { browserNotifier, switchableSurface, type SwitchableSurface } from '../adapters/browser/notifier.ts';
import { browserLifecycle } from '../adapters/browser/lifecycle.ts';
import { workerCompute, type WorkerLike } from '../adapters/browser/compute.ts';
import { createErrorReporter, JOURNAL_KEY } from '../adapters/local/error-reporter.ts';
import { localTelemetry, TELEMETRY_KEY } from '../adapters/local/telemetry.ts';
import { inlineCompute } from '../adapters/local/jobs.ts';
import { STUDY_BRIDGE, STUDY_REGISTRATIONS } from './study.ts';
import { claudeAI } from '../adapters/claude/index.ts';
import { geminiAI } from '../adapters/gemini/index.ts';
import { createSupabase } from '../adapters/supabase/index.ts';
import { lazyContracts, type LazyContracts } from '../contracts/lazy.ts';
import { provideContracts } from '../contracts/page.ts';
import { createLazyEngines, type EnginesPiece } from '../engines/lazy.ts';
import { NoemaError } from '../kernel/errors.ts';
import type { AiFactory } from '../ports/ai.ts';
import { buildBridge, type BridgeExtension, type NoemaCoreBridge } from './bridge.ts';
import { Container, token, type Registration } from './container.ts';
import { lazyContentChecks, type LazyContentChecks } from '../features/content/application/lazy.ts';
import type { ChecksPiece } from './contracts.ts';
import { COMMUNITY_BRIDGE, COMMUNITY_REGISTRATIONS } from './community.ts';
import { buildJobRegistry } from './jobs.ts';
import { browserLearning, learningBridge } from './learning.ts';
import { bridgesDomain, ROADMAP_EVENTS, roadmapsSurface } from './roadmaps.ts';
import { randomId, registerSync, syncBridge } from './sync.ts';
import {
  AI,
  CLOCK,
  CLOUD,
  COMPUTE,
  CONFIG,
  ENGINES,
  ERRORS,
  I18N,
  JOBS,
  LIFECYCLE,
  NOTIFIER,
  STORAGE,
  TELEMETRY,
  type CoreConfig,
} from './tokens.ts';

/** Helpers append their registrations here (each registers its own tokens; a token already taken is an error). */
export const APP_REGISTRATIONS: readonly Registration[] = [
  // the learning log (event sourcing, src/features/study): the account's LearningLog over the app's IndexedDB, and the
  // seams it fills: the read models' feed, the sync's event log and old progress, the Roadmap events
  browserLearning,
  // the community features (src/features/{search,vault,social,reports}): their Supabase adapters and use cases
  ...COMMUNITY_REGISTRATIONS,
  // the study read models (src/features/study) and the search index's store (src/features/catalog)
  ...STUDY_REGISTRATIONS,
  // local-first sync (src/features/sync, docs/SYNC.md): the outbox, the settings registers, the loop and the lease
  registerSync,
];
/** Helpers append the names they add to window.NoemaCore here (a core name is refused). */
export const BRIDGE_EXTENSIONS: readonly BridgeExtension[] = [
  // the compiled data contracts (src/contracts): the shape checks of the learning log, the content checks and every other
  // reader. In the page their validators are build/contracts.js (src/contracts/lazy.ts; the learning log's own contract is
  // in build/app.js, src/contracts/page.ts); the connector and the Node tools (build/noema-tools.cjs) bundle the same module.
  { name: 'contracts', build: r => r.get(CONTRACTS) },
  // the engine library: the activity core (engine/src/32_activities.js), the content checks, the activity author and #/engines
  { name: 'engines', build: r => r.get(ENGINES) },
  // the learning log: every write of progress is an event, every read its fold (src/composition/learning.ts has the surface)
  learningBridge,
  // search, vault, social, reports, engineRequests: engine/search.js, vault.js, social.js, report.js, #/engines
  ...COMMUNITY_BRIDGE,
  // NoemaCore.study (grading, FSRS-6, the queues, progress, XP and the read models) and NoemaCore.catalog (the search
  // index's records, built in the Worker): src/composition/study.ts
  ...STUDY_BRIDGE,
  // the sync loop, the settings, the lease ("in use on another device"): engine/cloud.js, engine/loader.js, the account page
  syncBridge,
  // the Roadmaps domain (graph, tasks, claims, inbox, levels, restructuring) and its services: curriculum.js, curjobs.js,
  // curshare.js, curimport.js, sourceplan.js, curmap.js
  { name: 'roadmaps', build: r => roadmapsSurface(r.get(ROADMAP_EVENTS)) },
  // the 文A bridges' lookup (engine/bridge.js)
  { name: 'bridges', build: () => bridgesDomain },
  // the content checks (src/features/content): the pack, chapter, quality, translation, bridge and activity rules — the
  // generator (engine/packgen.js), the library, the activity runtimes and the author. Their code comes with the contracts'
  // validators (build/contracts.js, src/features/content/application/lazy.ts): every caller runs after
  // NoemaCore.contracts.ready() (the root waits for it before it opens a subject or a course, the Roadmaps before their jobs)
  { name: 'content', build: r => r.get(CONTENT) },
  // where the toasts are drawn: the frame (build/ui.js) hands NoemaCore.notify its kit toaster (src/ui/kit/toaster.ts)
  {
    name: 'toasts',
    build: r =>
      Object.freeze({
        use: (s: Parameters<SwitchableSurface['use']>[0]) => {
          r.get(TOAST_SURFACE).use(s);
        },
      }),
  },
];

/** the data contracts of the page, their validators loaded on demand (NoemaCore.contracts) */
export const CONTRACTS = token<LazyContracts>('core.contracts', 'the data contracts, their validators in build/contracts.js');
/** the content checks of the page, their code loaded with the contracts' validators (NoemaCore.content) */
export const CONTENT = token<LazyContentChecks>('core.content', 'the content checks, their code in build/contracts.js');
/** the one load of build/contracts.js both share */
const CHECKS_PIECE = token<() => Promise<ChecksPiece>>('core.checksPiece', 'the load of build/contracts.js');

/** the surface NoemaCore.notify draws on (switchable: the page's `.toasts`, then the frame's toaster) */
export const TOAST_SURFACE = token<SwitchableSurface>('core.toastSurface', 'where the notifier draws (NoemaCore.toasts.use)');

/** The id of the inline copy of build/worker.js in the one-file bundle (tools/build.py writes it). */
export const WORKER_SOURCE_ID = 'noema-worker:worker';

interface PageLike {
  readonly NOEMA_CONFIG?: CoreConfig;
  readonly document?: {
    readonly currentScript?: { readonly src?: string } | null;
    getElementById(id: string): { readonly textContent: string | null } | null;
  };
  readonly location?: { readonly protocol?: string };
  readonly Worker?: new (url: string) => WorkerLike;
  readonly Blob?: typeof Blob;
  readonly URL?: { createObjectURL(b: Blob): string };
  readonly fetch?: typeof fetch;
}

/** Where build/worker.js is: next to this script (read while this script runs, the only time currentScript is it). */
function workerUrlNextTo(script: string | undefined): string | null {
  return script && /app\.js(\?.*)?$/.test(script) ? script.replace(/app\.js(\?.*)?$/, 'worker.js$1') : null;
}

/** Makes the Worker of the Compute pool: the bundle's inline copy, else the file next to app.js (never on file://). */
export function workerFactory(page: PageLike, scriptUrl: string | null): () => WorkerLike {
  return () => {
    const W = page.Worker;
    if (!W) throw new NoemaError('compute.unavailable', 'this browser has no Web Workers');
    const inline = page.document?.getElementById(WORKER_SOURCE_ID)?.textContent;
    if (inline && page.Blob && page.URL) return new W(page.URL.createObjectURL(new page.Blob([inline], { type: 'text/javascript' })));
    if (page.location?.protocol === 'file:') throw new NoemaError('compute.unavailable', 'a page opened from a file cannot start Workers');
    if (!scriptUrl) throw new NoemaError('compute.unavailable', 'build/worker.js cannot be located');
    return new W(scriptUrl);
  };
}

/** The id of the inline copy of a lazy piece (build/<name>.js) in the one-file bundle (tools/build.py writes it). */
export const lazySourceId = (name: string): string => `noema-lazy:${name}`;
export const ENGINES_SOURCE_ID = lazySourceId('engines');

/** Where build/<name>.js is: next to this script. */
const pieceUrlNextTo = (script: string | undefined, name: string): string | null =>
  script && /app\.js(\?.*)?$/.test(script) ? script.replace(/app\.js(\?.*)?$/, `${name}.js$1`) : null;

/**
 * Runs the lazy piece build/<name>.js once (the bundle's inline copy, else the file next to app.js) and hands over what it
 * left on globalThis[key] (src/composition/engines.ts, src/composition/contracts.ts).
 */
export function pieceLoader<T>(page: PageLike, script: string | undefined, name: string, key: string): () => Promise<T> {
  const url = pieceUrlNextTo(script, name),
    file = `build/${name}.js`;
  const left = (): T | undefined => (globalThis as Record<string, unknown>)[key] as T | undefined;
  let loading: Promise<T> | null = null;
  return () =>
    (loading ??= new Promise<T>((resolve, reject) => {
      const doc = (globalThis as { document?: Document }).document;
      const settle = (): void => {
        const p = left();
        if (p) resolve(p);
        else reject(new NoemaError('compute.unavailable', `${file} did not load`));
      };
      if (left()) {
        settle();
        return;
      }
      if (!doc) {
        reject(new NoemaError('compute.unavailable', `no page to load ${file} into`));
        return;
      }
      const s = doc.createElement('script');
      const inline = page.document?.getElementById(lazySourceId(name))?.textContent;
      if (inline) {
        s.textContent = inline;
        doc.head.append(s);
        settle();
        return;
      }
      if (!url) {
        reject(new NoemaError('compute.unavailable', `${file} cannot be located`));
        return;
      }
      s.src = url;
      s.onload = settle;
      s.onerror = () => {
        reject(new NoemaError('compute.unavailable', `${file} could not be loaded`));
      };
      doc.head.append(s);
    }).catch((e: unknown) => {
      loading = null; // a failed load may be tried again
      throw e;
    }));
}

/** Runs build/engines.js once and hands over its piece. */
export const enginesLoader = (page: PageLike, script: string | undefined): (() => Promise<EnginesPiece>) =>
  pieceLoader<EnginesPiece>(page, script, 'engines', '__noemaEnginesPiece');

/** Runs build/contracts.js once and hands over the compiled contracts and the content checks. */
export const checksLoader = (page: PageLike, script: string | undefined): (() => Promise<ChecksPiece>) =>
  pieceLoader<ChecksPiece>(page, script, 'contracts', '__noemaContractsPiece');

const DIAGNOSTIC_KEYS: ReadonlySet<string> = new Set([JOURNAL_KEY, TELEMETRY_KEY]);

/** The core registrations of the browser (every factory runs on first get). */
export function registerBrowser(c: Container, page: PageLike, scriptUrl: string | null, script?: string): void {
  const fetchOf = (): typeof fetch => {
    const f = page.fetch;
    if (!f) throw new NoemaError('internal.unexpected', 'this browser has no fetch');
    return (u, i) => f(u, i);
  };
  c.value(CONFIG, page.NOEMA_CONFIG ?? {});
  c.register(STORAGE, () => browserStorage());
  c.register(CLOCK, () => systemClock());
  c.register(I18N, () => noemaI18n());
  // the engine library (src/engines): the expression language, the catalogue and the manifests at once; every engine's code,
  // its Worker bundle and the schema kernel in build/engines.js, loaded the first time one is needed (src/engines/lazy.ts)
  c.register(ENGINES, () => createLazyEngines(enginesLoader(page, script)));
  // the data contracts and the content checks (src/contracts, src/features/content): their code in build/contracts.js, one
  // piece, loaded the first time either is asked to be ready (NoemaCore.contracts.ready() brings both). The learning log's
  // event contract is in build/app.js (src/contracts/page.ts): the log opens without the piece.
  c.register(CHECKS_PIECE, () => checksLoader(page, script));
  c.register(CONTRACTS, r => {
    const load = r.get(CHECKS_PIECE);
    return lazyContracts(() =>
      Promise.all([load(), r.get(CONTENT).ready()]).then(([p]) => {
        provideContracts(p.contracts); // the domain modules' check in the page's bundles (src/contracts/page.ts)
        return p.contracts;
      }),
    );
  });
  c.register(CONTENT, r => {
    const load = r.get(CHECKS_PIECE);
    // the runtimes' package checkers (NoemaWasm, NoemaEmbed, NoemaH5P) are read from the page when a check runs
    return lazyContentChecks(() => load().then(p => p.contentChecks(r.get(ENGINES), () => globalThis)));
  });
  c.register(TOAST_SURFACE, () => switchableSurface());
  c.register(NOTIFIER, r => browserNotifier(r.get(TOAST_SURFACE)));
  c.register(LIFECYCLE, () => browserLifecycle(() => page as never, randomId));
  c.register(TELEMETRY, r => localTelemetry({ store: r.get(STORAGE).kv }));
  c.register(ERRORS, r => {
    const errors = createErrorReporter({
      notifier: r.get(NOTIFIER),
      i18n: r.get(I18N),
      journalStore: r.get(STORAGE).kv,
      telemetry: r.get(TELEMETRY),
    });
    // the learner's "storage is full" warning (loader.storage.full, assertive live region), throttled by the reporter.
    // The diagnostics' own writes (the journal, the counters) are left out: reporting them would report again, forever.
    r.get(STORAGE).onFull(e => {
      if (DIAGNOSTIC_KEYS.has(e.key)) return;
      errors.report(new NoemaError('storage.quota', 'the browser storage for this site is full', { params: { key: e.key } }), {
        where: 'storage.' + e.store,
        severity: 'error',
        notify: true,
        context: { key: e.key },
      });
    });
    return errors;
  });
  c.register(JOBS, () => buildJobRegistry());
  c.register(COMPUTE, r => {
    const errors = r.get(ERRORS),
      jobs = r.get(JOBS);
    return workerCompute({
      createWorker: workerFactory(page, scriptUrl),
      fallback: inlineCompute(jobs),
      onUnavailable: e => {
        errors.report(e, { where: 'compute.worker', severity: 'info' });
      },
    });
  });
  c.register(AI, r => {
    const cfg = r.get(CONFIG);
    const make: AiFactory = (provider, apiKey) => {
      const base = provider === 'claude' ? cfg.anthropicBase : cfg.geminiBase;
      const o = { apiKey, fetch: fetchOf(), ...(base ? { baseUrl: base } : {}) };
      return provider === 'claude' ? claudeAI(o) : geminiAI(o);
    };
    return make;
  });
  c.register(CLOUD, r => {
    const cfg = r.get(CONFIG);
    const key = cfg.supabaseKey || cfg.supabaseAnonKey || '';
    if (!cfg.supabaseUrl || !key) return null;
    return createSupabase({ url: cfg.supabaseUrl, key, fetch: fetchOf(), store: r.get(STORAGE).kv });
  });
}

/** Builds the browser root: the core, the helpers' registrations, frozen. */
export function createAppContainer(
  page: PageLike,
  scriptUrl: string | null,
  extra: readonly Registration[] = [],
  script?: string,
): Container {
  const c = new Container();
  registerBrowser(c, page, scriptUrl, script);
  for (const register of [...APP_REGISTRATIONS, ...extra]) register(c);
  return c.freeze();
}

/** Starts the root once per page and publishes window.NoemaCore (read-only; a second app.js leaves the first). */
export function start(page: PageLike & object = globalThis as PageLike & object): NoemaCoreBridge {
  const existing = (page as { NoemaCore?: NoemaCoreBridge }).NoemaCore;
  if (existing) return existing;
  const script = page.document?.currentScript?.src;
  const container = createAppContainer(page, workerUrlNextTo(script), [], script);
  const core = buildBridge(container, BRIDGE_EXTENSIONS);
  Object.defineProperty(page, 'NoemaCore', { value: core, writable: false, enumerable: false, configurable: false });
  return core;
}
