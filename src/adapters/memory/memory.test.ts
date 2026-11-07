/// <reference types="node" />
/** The in-memory adapters and the local ones built on ports pass their contracts. */
import { addDays } from '../../kernel/day.ts';
import { promised } from '../../kernel/promise.ts';
import { clockContract } from '../../ports/contract/clock.contract.ts';
import { computeContract } from '../../ports/contract/compute.contract.ts';
import { errorReporterContract } from '../../ports/contract/error-reporter.contract.ts';
import { CONTRACT_CATALOGS, i18nContract } from '../../ports/contract/i18n.contract.ts';
import { notifierContract } from '../../ports/contract/notifier.contract.ts';
import { remoteContract } from '../../ports/contract/remote.contract.ts';
import { storageContract } from '../../ports/contract/storage.contract.ts';
import { telemetryContract } from '../../ports/contract/telemetry.contract.ts';
import { createErrorReporter } from '../local/error-reporter.ts';
import { coreJobs, createJobRegistry, inlineCompute } from '../local/jobs.ts';
import { localTelemetry } from '../local/telemetry.ts';
import { manualClock } from './clock.ts';
import { catalogI18n } from './i18n.ts';
import { recordingNotifier } from './notifier.ts';
import { memoryCloud } from './remote.ts';
import { memoryStorage } from './storage.ts';

storageContract('memory', o =>
  memoryStorage({
    ...(o.kvQuota === undefined ? {} : { kvQuota: o.kvQuota }),
    ...(o.docsQuota === undefined ? {} : { docsQuota: o.docsQuota }),
  }),
);

clockContract('manual', () => {
  const clock = manualClock(Date.UTC(2026, 10, 7, 10));
  return {
    clock,
    pass: ms =>
      promised(() => {
        clock.advance(ms);
      }),
    dayChange: () =>
      promised(() => {
        const next = addDays(clock.today(), 1);
        clock.set(Date.parse(`${next}T00:00:01Z`));
      }),
  };
});

computeContract(
  'inline',
  registry => inlineCompute(registry),
  jobs => createJobRegistry({ ...coreJobs(), ...jobs }),
);

i18nContract('catalog', catalogs => {
  const i18n = catalogI18n(catalogs);
  return {
    i18n,
    use: l => {
      i18n.use(l);
    },
  };
});

notifierContract('recording', () => {
  let t = 1_000_000;
  const n = recordingNotifier(() => t);
  return {
    notifier: n,
    onScreen: () => n.onScreen().map(x => x.text),
    announced: () => n.announced,
    settle: async () => {},
    advance: ms => {
      t += ms;
    },
  };
});

remoteContract('memory cloud', ({ now }) => {
  const cloud = memoryCloud({ now });
  cloud.addUser('ada@example.org', 'correct-horse-1', 'Ada');
  cloud.addRpc('echo', args => args);
  return {
    ...cloud.device(),
    credentials: { email: 'ada@example.org', password: 'correct-horse-1' },
    rpcName: 'echo',
    setOffline: x => {
      cloud.setOffline(x);
    },
  };
});

telemetryContract('local', () =>
  localTelemetry({
    store: memoryStorage().kv,
    setTimeout: f => {
      f();
      return 0;
    },
  }),
);

const QUIET = { debug() {}, info() {}, warn() {}, error() {} };
errorReporterContract(
  'local journal',
  d => createErrorReporter({ now: d.now, notifier: d.notifier, i18n: d.i18n, journalStore: d.store, console: d.console }),
  {
    deps(now = Date.now) {
      const told: Array<{ kind: string; text: string }> = [];
      const notifier = {
        toast: (text: string) => {
          told.push({ kind: 'toast', text });
        },
        notice: (text: string) => {
          told.push({ kind: 'notice', text });
        },
        alert: (text: string) => {
          told.push({ kind: 'alert', text });
        },
        onOverflow: () => () => {},
      };
      const i18n = catalogI18n({
        en: {
          ...CONTRACT_CATALOGS.en,
          'loader.storage.full': 'The storage of this browser is full.',
          'err.cloud.network': 'OFFLINE {detail}',
        },
      });
      return { store: memoryStorage().kv, notifier, i18n, now, console: QUIET, told: () => told };
    },
  },
);
