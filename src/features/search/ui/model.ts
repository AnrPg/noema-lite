/**
 * The search as the screens use it (docs/SEARCH.md): the account's index (src/features/catalog, its records built in the
 * Worker) over the host's sources, a search with the page's settings, the recent searches of this device, the saved
 * searches of the account (synced: a:searches), and the practice round (this tab: sessionStorage
 * noema-device:searchRound) whose steps run one after another in the engine (#/srun) and the language routes.
 *
 * One SearchUi per app root; the page, the quick sheet, the Knowledge tab's link and the engine's round ask it.
 */
import { NoemaError } from '../../../kernel/errors.ts';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { I18n } from '../../../ports/i18n.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';
import type { CatalogIndex, IndexSource } from '../../catalog/application/index-store.ts';
import type { SourceInput } from '../../catalog/domain/records.ts';
import type { SearchService } from '../application/search.ts';
import { keeper } from '../domain/filters.ts';
import { hereOf, hereParams, listOf, pageHash, parseParams, type Here, type SearchParams } from '../domain/params.ts';
import { PRACTISABLE, type SearchRecord } from '../domain/records.ts';
import { roundSteps, type RoundStep } from '../domain/round.ts';
import {
  cleanName,
  newSavedSearch,
  recentSearches,
  rememberSearch,
  removeSaved,
  renameSaved,
  savedSearches,
  type SavedSearch,
} from '../domain/saved.ts';
import type { SearchHit, SearchResults } from '../domain/scoring.ts';
import type { CommunityHost } from '../../community/ui/host.ts';
import type { Notifier } from '../../../ports/notifier.ts';

export interface SearchDeps {
  readonly host: CommunityHost;
  readonly notify: Notifier;
  readonly search: SearchService;
  /** the index of one account over its sources (NoemaCore.catalog.index) */
  readonly openIndex: (account: string, sources: () => Promise<readonly IndexSource[]>) => CatalogIndex;
  /** this device (recent searches, "searched here before") */
  readonly device: KeyValueStore;
  /** this tab (the practice round) */
  readonly tab: KeyValueStore;
  readonly now: () => number;
  readonly newId: () => string;
}

/** results with the groups the kind filter keeps */
export interface ShownResults extends SearchResults {
  readonly shown: [string, SearchHit[]][];
  readonly shownTotal: number;
}

export interface Round {
  readonly q?: string;
  readonly back: string;
  readonly steps: (RoundStep & { readonly title: string })[];
  i: number;
  readonly at: number;
}

export const ROUND_KEY = 'noema-device:searchRound';

const parseJson = (raw: string | null): unknown => {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null; // a value written by hand or by an older build: as if there were none
  }
};

/** the catalogue's records are the search's records (records.ts is their contract; the builders write w as 'know' or 'lang') */
const asSearch = (l: readonly unknown[]): SearchRecord[] => l as SearchRecord[];

export class SearchUi {
  #idx: CatalogIndex | null = null;
  #idxAcc: string | null = null;
  readonly d: SearchDeps;
  readonly #i18n: () => I18n;

  constructor(d: SearchDeps, i18n: () => I18n) {
    this.d = d;
    this.#i18n = i18n;
  }

  #L(k: string, p?: Record<string, string | number>): string {
    return this.#i18n().t('sh.sr_' + k, p);
  }
  #acc(): string | null {
    return this.d.host.account()?.id ?? null;
  }

  /* ---------- the index ---------- */
  index(): CatalogIndex {
    const a = this.#acc() ?? '';
    if (!this.#idx || this.#idxAcc !== a) {
      this.#idx = this.d.openIndex(a, () => this.#sources());
      this.#idxAcc = a;
    }
    return this.#idx;
  }
  async #sources(): Promise<IndexSource[]> {
    if (!this.#acc()) return [];
    const list = await this.d.host.searchSources();
    return list.map(s => ({
      key: s.key,
      sig: s.sig,
      ...(s.label ? { label: s.label } : {}),
      input: async () => (await s.input()) as SourceInput | null,
    }));
  }
  /** reads what is stored, then brings it up to date in the background; remembers that this device searches */
  warm(): CatalogIndex {
    const I = this.index();
    void I.load().then(() => I.refresh());
    const a = this.#acc();
    if (a) this.d.device.set(`noema1:${a}:meta:searchUsed`, String(this.d.now()));
    return I;
  }
  /** a little after start, when the learner has searched on this device before */
  warmIfUsed(): void {
    const a = this.#acc();
    if (!a) return;
    const r = this.d.device.get(`noema1:${a}:meta:searchUsed`);
    if (r.ok && r.value) {
      const I = this.index();
      void I.load().then(() => I.refresh());
    }
  }
  onIndex(f: () => void): Unsubscribe {
    return this.index().on(f);
  }

  /* ---------- a search with the page's settings ---------- */
  parse(hash: string = this.d.host.hash()): SearchParams {
    return parseParams(hash);
  }
  hereNow(): Here | null {
    return hereOf(this.parse());
  }
  run(P: SearchParams): ShownResults {
    const I = this.index(),
      types = listOf(P.t);
    const host = this.d.host;
    const keep = keeper(P, {
      subject: id => host.subjectStatus(id),
      roadmapPacks: id => host.roadmapPacks(id),
    });
    const res = this.d.search.search(asSearch(I.records()), P.q ?? '', {
      w: P.w === 'know' || P.w === 'lang' ? P.w : '',
      langs: listOf(P.lg),
      keep,
    });
    const shown = types.length ? res.groups.filter(([t]) => types.includes(t)) : res.groups;
    return { ...res, shown, shownTotal: shown.reduce((a, [, l]) => a + l.length, 0) };
  }
  record(key: string): SearchRecord | null {
    return (this.index().byKey(key) as SearchRecord | null) ?? null;
  }

  /** opens a found record at its exact place (another subject loads first; a conversation opens in its window) */
  open(r: SearchRecord, q: string): void {
    const P = this.parse();
    this.remember(P.q ? P : { q });
    const h = r.h,
      host = this.d.host;
    if (h.startsWith('convo:')) host.openConversation(h.slice(6));
    else if (r.sj && h.startsWith('#/') && !h.startsWith('#/search')) host.openSubject(r.sj, h);
    else host.go(h);
  }

  /* ---------- recent searches (this device) and saved searches (the account's, synced) ---------- */
  #recentKey(): string {
    return `noema1:${this.#acc() ?? ''}:meta:searchRecent`;
  }
  recents(): SearchParams[] {
    const r = this.d.device.get(this.#recentKey());
    return recentSearches(parseJson(r.ok ? r.value : null) ?? []);
  }
  remember(P: SearchParams): void {
    this.d.device.set(this.#recentKey(), JSON.stringify(rememberSearch(this.recents(), P)));
  }
  collections(): SavedSearch[] {
    return savedSearches(parseJson(this.d.host.getAccountSetting('searches')) ?? []);
  }
  #putCollections(list: readonly SavedSearch[]): void {
    this.d.host.setAccountSetting('searches', JSON.stringify(list));
  }
  save(P: SearchParams, name: string): SavedSearch | null {
    const n = cleanName(name);
    if (!n) return null;
    const c = newSavedSearch(P, n, 'q' + this.d.newId(), new Date(this.d.now()).toISOString());
    this.#putCollections([...this.collections(), c]);
    return c;
  }
  rename(id: string, name: string): boolean {
    const n = cleanName(name);
    if (!n) return false;
    this.#putCollections(renameSaved(this.collections(), id, n));
    return true;
  }
  remove(id: string): void {
    this.#putCollections(removeSaved(this.collections(), id));
  }
  /** a saved search's words in a line: the side, the kinds, the place, the language, the status */
  describe(p: SearchParams): string {
    const t = (k: string, v?: Record<string, string>): string => this.#i18n().t(k, v);
    const st = { unread: 'stUnread', unsolved: 'stUnsolved', wrong: 'stWrong' }[p.st ?? ''];
    return [
      p.w ? t(p.w === 'lang' ? 'sh.languages' : 'sh.knowledge') : '',
      listOf(p.t)
        .map(k => this.#L('t_' + k))
        .join(', '),
      p.in && p.it ? this.#L('hereIs', { title: p.it }) : '',
      listOf(p.lg)
        .map(c => langNameOf(this.#i18n(), c))
        .join(', '),
      st ? this.#L(st) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /* ---------- "Practise these results": one round, place by place ---------- */
  canPractise(P: SearchParams): boolean {
    const kinds = listOf(P.t);
    return kinds.length > 0 && kinds.every(t => PRACTISABLE.includes(t));
  }
  round(): Round | null {
    const r = this.d.tab.get(ROUND_KEY);
    const v = parseJson(r.ok ? r.value : null) as Round | null;
    return v && Array.isArray(v.steps) ? v : null;
  }
  #putRound(R: Round | null): void {
    if (R) this.d.tab.set(ROUND_KEY, JSON.stringify(R));
    else this.d.tab.delete(ROUND_KEY);
  }
  endRound(): void {
    this.#putRound(null);
  }
  /** the steps of a round from the results shown, each with its title */
  steps(res: ShownResults): Round['steps'] {
    return roundSteps(res.shown, k => this.record(k)).map(st =>
      st.kind === 'ex'
        ? { ...st, title: `${st.subject} · ${this.#L('pEx', { n: st.n })}` }
        : st.kind === 'cards'
          ? { ...st, title: `${st.subject} · ${this.#L('pCards', { n: st.n })}` }
          : { ...st, title: st.field ? this.#L('pWords', { title: st.fieldTitle ?? st.field }) : (st.lesson ?? '') },
    );
  }
  practise(res: ShownResults, P: SearchParams): void {
    const steps = this.steps(res);
    if (!steps.length) {
      this.d.notify.toast(this.#L('practiseNone'), { ms: 4500 });
      return;
    }
    this.#putRound({ ...(P.q ? { q: P.q } : {}), back: pageHash(P), steps, i: 0, at: this.d.now() });
    this.remember(P);
    this.goStep(0);
  }
  goStep(i: number): void {
    const R = this.round();
    if (!R) return;
    const host = this.d.host;
    if (i >= R.steps.length) {
      this.#putRound(null);
      this.d.notify.toast(this.#L('roundDone'), { ms: 3500 });
      host.go(R.back);
      return;
    }
    R.i = i;
    this.#putRound(R);
    const st = R.steps[i];
    if (!st) return;
    if (st.kind === 'lang') host.go(st.href);
    else if (host.openSubjectId() === st.sj) host.go('#/srun');
    else host.openSubject(st.sj, '#/srun');
  }
  /** for the engine's round (#/srun): the button after this step */
  after(): { readonly label: string; run(): void } | null {
    const R = this.round();
    if (!R) return null;
    const nx = R.steps[R.i + 1];
    return nx
      ? {
          label: this.#L('next', { title: nx.title }),
          run: () => {
            this.goStep(R.i + 1);
          },
        }
      : {
          label: this.#L('roundEnd'),
          run: () => {
            this.goStep(R.steps.length);
          },
        };
  }

  /** the address of the page for these settings */
  pageHash(P: SearchParams): string {
    return pageHash(P);
  }
  hereParams(h: Here | null): SearchParams {
    return hereParams(h);
  }
}

export function langNameOf(i18n: I18n, code: string): string {
  try {
    return new Intl.DisplayNames([i18n.locale()], { type: 'language' }).of(code) ?? code;
  } catch {
    return code; // not a code the platform knows: the code itself
  }
}

/** a failure of the index as a NoemaError (the page shows its words) */
export const indexError = (e: unknown): NoemaError => NoemaError.from(e);
