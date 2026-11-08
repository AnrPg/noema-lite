/**
 * THE TOOLS ROOT: the core for scripts that run under Node (tools/*.mjs, tests): memory storage, the system clock,
 * the given catalogs, notices kept in memory, Compute inline. Nothing in it reaches a browser API or the network.
 */
import { systemClock } from '../adapters/browser/clock.ts';
import { createErrorReporter } from '../adapters/local/error-reporter.ts';
import { inlineCompute } from '../adapters/local/jobs.ts';
import { localTelemetry } from '../adapters/local/telemetry.ts';
import { catalogI18n, type Catalogs } from '../adapters/memory/i18n.ts';
import { recordingNotifier } from '../adapters/memory/notifier.ts';
import { memoryStorage } from '../adapters/memory/storage.ts';
import type { Clock } from '../ports/clock.ts';
import { Container, type Registration } from './container.ts';
import { buildJobRegistry } from './jobs.ts';
import { CLOCK, CLOUD, COMPUTE, CONFIG, ERRORS, I18N, JOBS, NOTIFIER, STORAGE, TELEMETRY, type CoreConfig } from './tokens.ts';

export interface ToolsCoreOptions {
  readonly catalogs?: Catalogs;
  readonly locale?: string;
  readonly config?: CoreConfig;
  readonly clock?: Clock;
}

/** Helpers append the registrations their tools need here. */
export const TOOLS_REGISTRATIONS: readonly Registration[] = [];

export function createToolsContainer(o: ToolsCoreOptions = {}, extra: readonly Registration[] = []): Container {
  const c = new Container();
  c.value(CONFIG, o.config ?? {});
  c.register(CLOCK, () => o.clock ?? systemClock());
  c.register(STORAGE, r => memoryStorage({ now: () => r.get(CLOCK).now() }));
  c.register(I18N, () => catalogI18n(o.catalogs ?? {}, o.locale ?? 'en'));
  c.register(NOTIFIER, r => recordingNotifier(() => r.get(CLOCK).now()));
  c.register(TELEMETRY, r => localTelemetry({ now: () => r.get(CLOCK).now() }));
  c.register(ERRORS, r =>
    createErrorReporter({ now: () => r.get(CLOCK).now(), notifier: r.get(NOTIFIER), i18n: r.get(I18N), telemetry: r.get(TELEMETRY) }),
  );
  c.register(JOBS, () => buildJobRegistry());
  c.register(COMPUTE, r => inlineCompute(r.get(JOBS)));
  c.value(CLOUD, null);
  for (const register of [...TOOLS_REGISTRATIONS, ...extra]) register(c);
  return c.freeze();
}
