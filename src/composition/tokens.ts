/**
 * The tokens of the core's registrations (src/composition/container.ts). Helpers add their own tokens in their own
 * modules (e.g. src/plugins/… for the plugin registry); these keys are taken.
 */
import type { Auth } from '../ports/auth.ts';
import type { AiFactory } from '../ports/ai.ts';
import type { Clock } from '../ports/clock.ts';
import type { Compute } from '../ports/compute.ts';
import type { ErrorReporter } from '../ports/error-reporter.ts';
import type { I18n } from '../ports/i18n.ts';
import type { Notifier } from '../ports/notifier.ts';
import type { Remote } from '../ports/remote.ts';
import type { Storage } from '../ports/storage.ts';
import type { Telemetry } from '../ports/telemetry.ts';
import type { MutableJobRegistry } from '../adapters/local/jobs.ts';
import type { EngineLibrary } from '../engines/register.ts';
import { token } from './container.ts';

/** The public settings of this deployment (config.js → window.NOEMA_CONFIG), as far as the core reads them. */
export interface CoreConfig {
  readonly supabaseUrl?: string;
  readonly supabaseKey?: string;
  readonly supabaseAnonKey?: string;
  readonly anthropicBase?: string;
  readonly geminiBase?: string;
}

/** The cloud of this deployment (null when config.js names no Supabase project). */
export interface Cloud {
  readonly auth: Auth;
  readonly remote: Remote;
}

export const CONFIG = token<CoreConfig>('core.config', 'the deployment settings (config.js)');
export const STORAGE = token<Storage>('core.storage', 'this device\'s storage (Storage port)');
export const CLOCK = token<Clock>('core.clock', 'the time and the learner\'s day (Clock port)');
export const I18N = token<I18n>('core.i18n', 'the interface language (I18n port)');
export const NOTIFIER = token<Notifier>('core.notifier', 'toasts, notices, alerts (Notifier port)');
export const TELEMETRY = token<Telemetry>('core.telemetry', 'local counters and events (Telemetry port)');
export const ERRORS = token<ErrorReporter>('core.errors', 'the error journal and the learner\'s warnings (ErrorReporter port)');
export const JOBS = token<MutableJobRegistry>('core.jobs', 'the Compute jobs by name');
export const COMPUTE = token<Compute>('core.compute', 'jobs off the main thread (Compute port)');
export const AI = token<AiFactory>('core.ai', 'makes the AI of a provider for a key (AI port)');
export const CLOUD = token<Cloud | null>('core.cloud', 'Auth + Remote of the Supabase project, or null');
export const ENGINES = token<EngineLibrary>('engines.library', 'the engine library of sim-spec@1 (src/engines): the expression language, the catalogue, every engine as a lazy plugin');
