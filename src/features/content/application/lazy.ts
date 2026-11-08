/* The content checks of the app's page without their code (src/composition/browser.ts): the checks need the compiled data
   contracts at every step (a chapter, an exercise, a pack), so they come in the same piece as the contracts' validators
   (build/contracts.js, src/composition/contracts.ts) and answer once it is in. NoemaCore.content.ready() loads it; the UI
   root waits for it with NoemaCore.contracts.ready() before it opens the learning log or a subject
   (src/composition/ui-root.ts), and everything on the page that checks content (the generator, the translations, the
   activity runtimes, the author) runs after that. A check before it is a bug of the caller (invariant.failed), never a pass. */
import { NoemaError } from '../../../kernel/errors.ts';
import type { ContentChecks } from './index.ts';

/** every name of ContentChecks, each forwarded by the facade (`satisfies`: none missing, none extra) */
const NAMES = Object.keys({
  checkPack: true,
  checkChapter: true,
  checkSubject: true,
  checkActivities: true,
  checkActivityPackages: true,
  checkSimSpec: true,
  partsPlan: true,
  resolveParts: true,
  partSpec: true,
  partMsg: true,
  freeVars: true,
  ownSpec: true,
  specNames: true,
  needRequires: true,
  enginesNamed: true,
  lintHtml: true,
  lintPython: true,
  checkExercise: true,
  checkBalance: true,
  checkQuality: true,
  checkBridge: true,
  checkTranslation: true,
  requiredLocales: true,
  ACTIVITY_RULES: true,
  RULES: true,
  QUALITY: true,
  LANGS: true,
  PACK_RULES: true,
  TYPES: true,
  BLOCKS: true,
  ID_RE: true,
} satisfies Record<keyof ContentChecks, true>) as (keyof ContentChecks)[];

/** NoemaCore.content: the checks' names, plus ready() and loaded */
export type LazyContentChecks = ContentChecks & {
  /** resolves once the checks are in (loads them the first time) */
  ready(): Promise<void>;
  readonly loaded: boolean;
};

/** The facade over the checks `load` builds (once; a failed load may be tried again). */
export function lazyContentChecks(load: () => Promise<ContentChecks>): LazyContentChecks {
  let checks: ContentChecks | null = null;
  let loading: Promise<void> | null = null;
  const need = (): ContentChecks => {
    if (!checks) throw new NoemaError('invariant.failed', 'the content checks are not loaded yet: await NoemaCore.content.ready() first');
    return checks;
  };
  const facade: Record<string, unknown> = {
    ready: () =>
      (loading ??= load().then(
        c => {
          checks = c;
        },
        (e: unknown) => {
          loading = null;
          throw e;
        },
      )),
  };
  Object.defineProperty(facade, 'loaded', { get: () => checks !== null, enumerable: true });
  // a check is a plain function (none uses `this`) and a constant its value: both are read from the checks once they are in
  for (const k of NAMES) Object.defineProperty(facade, k, { enumerable: true, get: () => need()[k] });
  return Object.freeze(facade) as LazyContentChecks;
}
