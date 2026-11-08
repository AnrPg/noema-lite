/**
 * The community features in the browser root (docs/SEARCH.md, docs/VAULT.md, docs/SOCIAL.md, docs/REPORTS.md): their
 * tokens, the Supabase adapters of their ports (one SupabaseClient sharing the sign-in of engine/cloud.js), and their names
 * on the phase bridge. The bridge speaks the old screens' language: plain values, promises that reject with a NoemaError.
 *
 *   NoemaCore.search        the query side: fold · foldMap · toneNumbers · forms · matches · searchTerms · TYPES · ORDER ·
 *                           PRACTISABLE · search(records, q, filters) · snip(hit) · sameText · params.* · keeper(P, status) ·
 *                           saved.* · recent.* · roundSteps(groups, byKey)
 *   NoemaCore.vault         formats.* · checkFile · fields() · loadFields() · files.* (filter, sort, values, folders, pins,
 *                           the address) · the server's use cases (list, upload, remove, edit, rate, report, count, download,
 *                           propose, suggest, myRatings, myReports)
 *   NoemaCore.social        state · onChange · ensureMe · savePrivacy · refresh · names · search · bond · requests · waiting ·
 *                           groups · unbuddy · putFile · dropFile · reset · refusalKey · nameSearch · server.* (every call)
 *   NoemaCore.reports       KINDS · STATUSES · OPEN · brief · repoFiles · componentsOf · row · send · flush · outbox ·
 *                           isAdmin · newCount · list · one · save · remove
 *   NoemaCore.engineRequests FIELDS · ACCURACY · STATUSES · OPEN · VIA · ENGINE_RE · COLS · normalize · cleanPatch · brief ·
 *                           store(account) → { kind, submit, mine, all, update, isAdmin }
 */
import { supabaseRest, type Rest } from '../adapters/supabase/rest.ts';
import { supabaseReports, supabaseEngineRequests } from '../adapters/supabase/reports.ts';
import { supabaseSocial } from '../adapters/supabase/social.ts';
import { supabaseVault } from '../adapters/supabase/vault.ts';
import { NoemaError } from '../kernel/errors.ts';
import { err, type AsyncResult, type Result } from '../kernel/result.ts';
import * as reportsDomain from '../features/reports/domain/index.ts';
import { engineRequestService, type EngineRequestService } from '../features/reports/application/engine-requests.ts';
import { reportService, type ReportService } from '../features/reports/application/reports.ts';
import * as search from '../features/search/domain/index.ts';
import { searchService } from '../features/search/application/search.ts';
import * as social from '../features/social/domain/index.ts';
import { socialService, type SocialService } from '../features/social/application/social.ts';
import * as vault from '../features/vault/domain/index.ts';
import { vaultService, type VaultService } from '../features/vault/application/vault.ts';
import type { BridgeExtension } from './bridge.ts';
import { token, type Registration } from './container.ts';
import { CLOCK, CONFIG, ENGINES, ERRORS, I18N, STORAGE } from './tokens.ts';

export const REST = token<Rest>('community.rest', 'PostgREST, RPC and Storage of the Supabase project, with the signed-in person');
export const VAULT = token<VaultService>('community.vault', 'the vault: shared study files (docs/VAULT.md)');
export const SOCIAL = token<SocialService>('community.social', 'people, buddies, conversations, study groups (docs/SOCIAL.md)');
export const REPORTS = token<ReportService>('community.reports', 'problem reports ⚑ (docs/REPORTS.md)');
export const ENGINE_REQUESTS = token<EngineRequestService>(
  'community.engineRequests',
  'requests for new engines (docs/INTERACTIVE_LIBRARY.md §3)',
);

/** The calls of a deployment without a cloud project: nobody is signed in, every call says so. */
function noCloud(): Rest {
  const no = (): AsyncResult<never> =>
    Promise.resolve(err(new NoemaError('auth.not_signed_in', 'this app has no cloud project (config.js)')));
  return { uid: () => null, json: no, rows: no, write: no, rpc: no, putObject: no, removeObjects: no, download: no };
}
const randomId = (): string => globalThis.crypto.randomUUID();

/** The registrations (APP_REGISTRATIONS in browser.ts). */
export const COMMUNITY_REGISTRATIONS: readonly Registration[] = [
  c =>
    c.register(REST, r => {
      const cfg = r.get(CONFIG),
        key = cfg.supabaseKey || cfg.supabaseAnonKey || '',
        f = (globalThis as { fetch?: typeof fetch }).fetch;
      if (!cfg.supabaseUrl || !key || !f) return noCloud();
      return supabaseRest({ url: cfg.supabaseUrl, key, fetch: (u, i) => f(u, i), store: r.get(STORAGE).kv });
    }),
  c =>
    c.register(VAULT, r =>
      vaultService({ server: supabaseVault(r.get(REST)), kv: r.get(STORAGE).kv, clock: r.get(CLOCK), newId: randomId }),
    ),
  c => c.register(SOCIAL, r => socialService({ server: supabaseSocial(r.get(REST)), errors: r.get(ERRORS), newId: randomId })),
  c => c.register(REPORTS, r => reportService({ server: supabaseReports(r.get(REST)), kv: r.get(STORAGE).kv })),
  c =>
    c.register(ENGINE_REQUESTS, r => {
      const catalog = r.get(ENGINES).catalog;
      return engineRequestService({
        server: supabaseEngineRequests(r.get(REST)),
        kv: r.get(STORAGE).kv,
        clock: r.get(CLOCK),
        newId: randomId,
        suggest: text => catalog.suggest(text),
      });
    }),
];

/* ---------- the bridge: Results → promises that reject with the NoemaError ---------- */
type Fn = (...args: never[]) => unknown;
/** A use case that answers a Result → a promise of its value (rejected with the error). */
function promised<A extends unknown[], T>(f: (...args: A) => AsyncResult<T>): (...args: A) => Promise<T> {
  return async (...args: A) => value(await f(...args));
}
function value<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw r.error;
}
/** Every method of an object of use cases, promised. */
function promisedAll(o: object): Record<string, Fn> {
  const out: Record<string, Fn> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'function') out[k] = promised(v as (...a: unknown[]) => AsyncResult<unknown>);
  return out;
}
/** checkFile with the words' key, or '' (the old screens show T(key)). */
const checkFile = (name: string, size: number, head: Uint8Array, used = 0): string => {
  const r = vault.checkFile(name, size, head, used);
  return r.ok ? '' : r.error;
};

export const COMMUNITY_BRIDGE: readonly BridgeExtension[] = [
  {
    name: 'search',
    build: r => {
      const svc = searchService({ i18n: r.get(I18N) });
      return Object.freeze({
        fold: search.fold,
        foldMap: search.foldMap,
        toneNumbers: search.toneNumbers,
        forms: search.forms,
        latin: search.latin,
        matches: search.matchesAll,
        searchTerms: search.searchTerms,
        TYPES: search.TYPES,
        ORDER: search.ORDER,
        PRACTISABLE: search.PRACTISABLE,
        search: (records: Iterable<search.SearchRecord>, q: unknown, filters?: search.SearchFilters) => svc.search(records, q, filters),
        snip: search.snip,
        sameText: search.sameText,
        params: Object.freeze({
          KEYS: search.PARAM_KEYS,
          parse: search.parseParams,
          queryString: search.queryString,
          pageHash: search.pageHash,
          listOf: search.listOf,
          sameQuery: search.sameQuery,
          saved: search.savedParams,
          hereOf: search.hereOf,
          hereParams: search.hereParams,
        }),
        keeper: search.keeper,
        saved: Object.freeze({
          list: search.savedSearches,
          make: search.newSavedSearch,
          rename: search.renameSaved,
          remove: search.removeSaved,
          find: search.savedFor,
          cleanName: search.cleanName,
        }),
        recent: Object.freeze({ list: search.recentSearches, remember: search.rememberSearch }),
        roundSteps: search.roundSteps,
      });
    },
  },
  {
    name: 'vault',
    build: r => {
      const svc = r.get(VAULT);
      return Object.freeze({
        ...promisedAll(svc),
        fields: () => svc.fields(),
        KINDS: vault.KINDS,
        GROUPS: vault.GROUPS,
        FORMATS: vault.FORMATS,
        ACCEPT: vault.ACCEPT,
        MAX_FILE: vault.MAX_FILE,
        QUOTA: vault.QUOTA,
        MAX_FILE_MB: vault.MAX_FILE_MB,
        QUOTA_MB: vault.QUOTA_MB,
        extOf: vault.extOf,
        groupOf: vault.groupOf,
        checkFile,
        KEYS: vault.VAULT_KEYS,
        parse: vault.parseVaultParams,
        hashOf: vault.vaultHash,
        activeFilters: vault.activeFilters,
        listOf: vault.listOf,
        same: vault.same,
        tidy: vault.tidy,
        fieldsOf: vault.fieldsOf,
        langsOf: vault.langsOf,
        stars: vault.stars,
        given: vault.given,
        inField: vault.inField,
        filter: vault.filterFiles,
        SORTS: vault.sortKeys(),
        sort: vault.sortFiles,
        values: vault.valuesOf,
        snapName: vault.snapName,
        NONE: vault.NONE,
        SCHOOL: vault.SCHOOL,
        folderPath: vault.folderPath,
        schoolFolder: vault.schoolFolder,
        fieldFolder: vault.fieldFolder,
        pins: Object.freeze({ list: vault.pinsOf, isPinned: vault.isPinned, pin: vault.pin, unpin: vault.unpin }),
        fieldGraph: vault.fieldGraph,
      });
    },
  },
  {
    name: 'social',
    build: r => {
      const svc = r.get(SOCIAL);
      return Object.freeze({
        ...promisedAll(svc),
        get state() {
          return svc.state;
        },
        me: () => svc.me(),
        onChange: (f: () => void) => svc.onChange(f),
        changed: () => {
          svc.changed();
        },
        bond: (x: string) => svc.bond(x),
        requests: () => svc.requests(),
        waiting: () => svc.waiting(),
        groups: () => svc.groups(),
        reset: () => {
          svc.reset();
        },
        server: Object.freeze({ ...promisedAll(svc.server), uid: () => svc.server.uid() }),
        refusalKey: social.refusalKey,
        nameSearch: social.nameSearch,
        cleanQuery: social.cleanQuery,
        MAX_BODY: social.MAX_BODY,
      });
    },
  },
  {
    name: 'reports',
    build: r => {
      const svc = r.get(REPORTS);
      return Object.freeze({
        ...promisedAll(svc),
        outbox: () => svc.outbox(),
        KINDS: reportsDomain.REPORT_KINDS,
        STATUSES: reportsDomain.REPORT_STATUSES,
        OPEN: reportsDomain.REPORT_OPEN,
        brief: reportsDomain.reportBrief,
        repoFiles: reportsDomain.repoFiles,
        componentsOf: reportsDomain.componentsOf,
        row: reportsDomain.reportRow,
      });
    },
  },
  {
    name: 'engineRequests',
    build: r => {
      const svc = r.get(ENGINE_REQUESTS);
      return Object.freeze({
        FIELDS: reportsDomain.REQUEST_FIELDS,
        ACCURACY: reportsDomain.ACCURACY,
        STATUSES: reportsDomain.REQUEST_STATUSES,
        OPEN: reportsDomain.REQUEST_OPEN,
        VIA: reportsDomain.VIA,
        ENGINE_RE: reportsDomain.ENGINE_ID_RE,
        COLS: reportsDomain.REQUEST_COLUMNS,
        normalize: (input: unknown) => svc.normalize(input),
        cleanPatch: reportsDomain.cleanRequestPatch,
        brief: reportsDomain.requestBrief,
        store: (account: { kind?: string; id?: string | null } | null) => {
          const s = svc.store(account);
          return Object.freeze({ ...promisedAll(s), kind: s.kind });
        },
      });
    },
  },
];
