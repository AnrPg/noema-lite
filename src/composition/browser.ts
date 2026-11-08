/**
 * THE BROWSER ROOT, its wiring (src/composition/app.ts is the entry that starts it; built to build/app.js, an IIFE;
 * docs/ARCHITECTURE.md §5). It is the one place that picks the
 * browser adapters, wires them into the container and publishes the phase bridge window.NoemaCore (src/composition/
 * bridge.ts has its exact surface). index.html and the one-file bundle load build/app.js right after the vendor
 * scripts, before engine/i18n.js and every other engine script, so NoemaCore exists when engine/loader.js runs.
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
import { browserNotifier } from '../adapters/browser/notifier.ts';
import { browserLifecycle } from '../adapters/browser/lifecycle.ts';
import { workerCompute, type WorkerLike } from '../adapters/browser/compute.ts';
import { createErrorReporter, JOURNAL_KEY } from '../adapters/local/error-reporter.ts';
import { localTelemetry, TELEMETRY_KEY } from '../adapters/local/telemetry.ts';
import { inlineCompute } from '../adapters/local/jobs.ts';
import { STUDY_BRIDGE, STUDY_REGISTRATIONS } from './study.ts';
import { claudeAI } from '../adapters/claude/index.ts';
import { geminiAI } from '../adapters/gemini/index.ts';
import { createSupabase } from '../adapters/supabase/index.ts';
import * as contracts from '../contracts/index.ts';
import { createAppEngines } from '../engines/register.ts';
import { NoemaError } from '../kernel/errors.ts';
import type { AiFactory } from '../ports/ai.ts';
import { buildBridge, type BridgeExtension, type NoemaCoreBridge } from './bridge.ts';
import { COMMUNITY_BRIDGE, COMMUNITY_REGISTRATIONS } from './community.ts';
import { Container, type Registration } from './container.ts';
import { buildJobRegistry } from './jobs.ts';
import { bridgesDomain, ROADMAP_EVENTS, roadmapsSurface } from './roadmaps.ts';
import { accountKvStore, kvRoadmapEventLog } from './roadmap-events.ts';
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
  // the engine library (src/engines): its plugins' manifests at once, each engine's code and Worker bundle when first loaded
  c => c.register(ENGINES, () => createAppEngines()),
  // the community features (src/features/{search,vault,social,reports}): their Supabase adapters and use cases
  ...COMMUNITY_REGISTRATIONS,
  // the study read models (src/features/study) and the search index's store (src/features/catalog)
  ...STUDY_REGISTRATIONS,
  // local-first sync (src/features/sync, docs/SYNC.md): the outbox, the settings registers, the loop and the lease
  registerSync,
  // the Roadmap events (levels reached, restructurings) of the account, in its synced store
  c => c.register(ROADMAP_EVENTS, r => kvRoadmapEventLog(accountKvStore(() => r.get(STORAGE).kv))),
];
/** Helpers append the names they add to window.NoemaCore here (a core name is refused). */
export const BRIDGE_EXTENSIONS: readonly BridgeExtension[] = [
  // the compiled data contracts (src/contracts): the shape checks of engine/packcheck.js and every other reader. Node,
  // the connector and the skill get the same module as engine/contracts.js (tools/contracts.mjs builds both from it).
  { name: 'contracts', build: () => contracts },
  // the engine library: the activity core (engine/src/32_activities.js), packcheck.js, the activity author and #/engines
  { name: 'engines', build: r => r.get(ENGINES) },
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
];

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

const DIAGNOSTIC_KEYS: ReadonlySet<string> = new Set([JOURNAL_KEY, TELEMETRY_KEY]);

/** The core registrations of the browser (every factory runs on first get). */
export function registerBrowser(c: Container, page: PageLike, scriptUrl: string | null): void {
  const fetchOf = (): typeof fetch => {
    const f = page.fetch;
    if (!f) throw new NoemaError('internal.unexpected', 'this browser has no fetch');
    return (u, i) => f(u, i);
  };
  c.value(CONFIG, page.NOEMA_CONFIG ?? {});
  c.register(STORAGE, () => browserStorage());
  c.register(CLOCK, () => systemClock());
  c.register(I18N, () => noemaI18n());
  c.register(NOTIFIER, () => browserNotifier());
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
export function createAppContainer(page: PageLike, scriptUrl: string | null, extra: readonly Registration[] = []): Container {
  const c = new Container();
  registerBrowser(c, page, scriptUrl);
  for (const register of [...APP_REGISTRATIONS, ...extra]) register(c);
  return c.freeze();
}

/** Starts the root once per page and publishes window.NoemaCore (read-only; a second app.js leaves the first). */
export function start(page: PageLike & object = globalThis as PageLike & object): NoemaCoreBridge {
  const existing = (page as { NoemaCore?: NoemaCoreBridge }).NoemaCore;
  if (existing) return existing;
  const scriptUrl = workerUrlNextTo(page.document?.currentScript?.src);
  const container = createAppContainer(page, scriptUrl);
  const core = buildBridge(container, BRIDGE_EXTENSIONS);
  Object.defineProperty(page, 'NoemaCore', { value: core, writable: false, enumerable: false, configurable: false });
  return core;
}
