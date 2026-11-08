/**
 * 🗄️ The vault's page model (docs/VAULT.md): the list read once (with my ratings, my reports and my study groups), the
 * field graph named in the menus' language, what a search looks in (the title and every field, a type or a language in
 * the menus' words of every language this page holds), the format check in the learner's words, the pinned folders.
 * No Lit and no DOM: the bridge (NoemaCore.community.vault) uses it before the screens are loaded, and so do the tests.
 */
import type { Result } from '../../../kernel/result.ts';
import type { I18n } from '../../../ports/i18n.ts';
import type { Notifier } from '../../../ports/notifier.ts';
import type { VaultFile } from '../../../ports/vault.ts';
import type { CommunityHost } from '../../community/ui/host.ts';
import type { VaultService } from '../application/vault.ts';
import {
  checkFile as checkBytes,
  fieldsOf,
  filterFiles,
  langsOf,
  MAX_FILE_MB,
  pinsOf,
  QUOTA_MB,
  type FieldGraph,
  type Pin,
  type VaultParams,
} from '../domain/index.ts';

/** What a file is sent with in a conversation (the social area draws the dialog). */
export interface SendItem {
  readonly kind: 'vault';
  readonly id: string;
  readonly title: string;
}

export interface VaultUiDeps {
  readonly host: CommunityHost;
  readonly notify: Notifier;
  readonly i18n: () => I18n;
  readonly vault: VaultService;
  /** my study groups (a group's own folder, "Share with") */
  readonly groups: () => Promise<readonly { readonly id: string; readonly name: string }[]>;
  /** the bytes I have put in the cloud already (the files sent in conversations count too); null: not known */
  readonly usedBytes: () => Promise<number | null>;
  /** ✉ a file into one of my conversations (null: the social area is not here) */
  readonly sendTo: ((item: SendItem) => void) | null;
}

/** The languages a file can be in (the menus offer these; a file may hold several). */
export const STUDY_LANGS = Object.freeze(['en', 'el', 'de', 'fr', 'es', 'it', 'ru', 'tr', 'ar', 'he', 'hi', 'zh', 'ja', 'pt', 'sq']);

/** a language's name in another language ('' when the platform does not know the tag) */
function nameIn(tag: string, code: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(code) ?? '';
  } catch {
    return ''; // a catalog's tag the platform does not know: its language names are left out
  }
}

/** the account's own setting that holds the pinned folders */
const PINS = 'vaultpins';

export class VaultUi {
  readonly d: VaultUiDeps;
  #cache: VaultFile[] | null = null;
  #loading: Promise<VaultFile[]> | null = null;
  /** my stars and my reports, by file */
  ratings: Record<string, number> = {};
  reported: Record<string, string> = {};
  groups: readonly { readonly id: string; readonly name: string }[] = [];

  constructor(d: VaultUiDeps) {
    this.d = d;
  }
  get #i18n(): I18n {
    return this.d.i18n();
  }
  T(k: string, p?: Record<string, string | number>): string {
    return this.#i18n.t('vault.' + k, p);
  }

  /* ---------- the list (read once; again after a change) ---------- */
  load(force = false): Promise<VaultFile[]> {
    if (this.#cache && !force) return Promise.resolve(this.#cache);
    if (this.#loading && !force) return this.#loading;
    const v = this.d.vault;
    const soft = async <T>(p: Promise<Result<T>>, d: T): Promise<T> => {
      const r = await p.catch(() => null);
      return r?.ok ? r.value : d;
    };
    this.#loading = (async () => {
      const [rows, rt, rp, gs] = await Promise.all([
        v.list(),
        soft(v.myRatings(), {}),
        soft(v.myReports(), {}),
        this.d.groups().catch(() => []),
        // without the fields the files still show
        v.loadFields().then(r => {
          if (!r.ok) console.warn('vault fields', r.error.message); // i18n-ignore (a log)
        }),
      ]);
      if (!rows.ok) throw rows.error;
      this.groups = gs;
      this.ratings = rt;
      this.reported = rp;
      return (this.#cache = rows.value);
    })().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }
  cached(): readonly VaultFile[] {
    return this.#cache ?? [];
  }
  /** forget the list (another account, a change elsewhere) */
  reset(): void {
    this.#cache = null;
  }
  groupName(id: string | null | undefined): string {
    return this.groups.find(g => g.id === id)?.name ?? this.T('aGroup');
  }

  /* ---------- 🧭 the fields, in the menus' language ---------- */
  get graph(): FieldGraph {
    return this.d.vault.fields();
  }
  fieldName(id: string): string {
    return this.graph.name(id, this.#i18n.locale());
  }
  fieldNames(f: VaultFile): string {
    return fieldsOf(f)
      .map(id => this.fieldName(id))
      .join(', ');
  }

  /* ---------- small words ---------- */
  num(n: number): string {
    return this.#i18n.format.number(n);
  }
  mb(bytes: number): string {
    return this.#i18n.format.number(Math.max(0.1, bytes / 1048576), { maximumFractionDigits: 1 }) + ' MB'; // i18n-ignore (a unit)
  }
  langName(code: string): string {
    try {
      return new Intl.DisplayNames([this.#i18n.locale()], { type: 'language' }).of(code) ?? code;
    } catch {
      return code; // a code the platform does not know: the code itself
    }
  }
  semName(n: unknown): string {
    return Number(n) ? this.T('semN', { n: Number(n) }) : this.T('semAny');
  }
  uni(v: unknown): string {
    return (typeof v === 'string' && v && v !== '-') || typeof v === 'number' ? String(v) : this.T('unspecified');
  }
  when(f: VaultFile): string {
    if (f.year && f.semester) return this.T('yearSem', { year: f.year, sem: f.semester });
    if (f.year) return String(f.year);
    return f.semester ? this.semName(f.semester) : '';
  }
  where(f: VaultFile): string {
    return [f.course, f.university, this.when(f)].filter(Boolean).join(' · ') || this.fieldNames(f) || this.T('unspecified');
  }

  /* ---------- the search: what a file is found by ---------- */
  /** a word of the vault's menus in every language this page holds (the menus' own, English, any other loaded) */
  #every(k: string): string[] {
    const out = new Set([this.T(k)]);
    for (const cat of Object.values(this.d.host.report.catalogs())) {
      const w = cat['vault.' + k];
      if (typeof w === 'string' && !/[{}]/.test(w)) out.add(w);
    }
    return [...out];
  }
  #langWords(code: string): string[] {
    const out = new Set([this.langName(code)]);
    for (const tag of Object.keys(this.d.host.report.catalogs())) {
      const n = nameIn(tag, code);
      if (n) out.add(n);
    }
    return [...out];
  }
  hayOf(f: VaultFile): string {
    const g = this.graph;
    return [
      f.title,
      f.description,
      f.university,
      f.department,
      f.course,
      f.professor,
      f.file_name,
      ...this.#every('kind.' + f.kind),
      ...fieldsOf(f).flatMap(id => g.allNames(id)),
      f.uploader_name,
      f.year ? String(f.year) : '',
      f.semester ? this.semName(f.semester) : '',
      ...langsOf(f).flatMap(c => this.#langWords(c)),
      ...(f.has_exercises ? this.#every('c.exercises') : []),
      ...(f.has_solutions ? this.#every('c.solutions') : []),
      ...(f.handwritten ? this.#every('c.handwritten') : []),
    ]
      .filter(Boolean)
      .join(' · ');
  }
  /** the files that pass every filter and the search words */
  filter(all: readonly VaultFile[], P: VaultParams): VaultFile[] {
    return filterFiles(all, P, this.graph, f => this.hayOf(f));
  }

  /* ---------- the format check, by the first bytes ---------- */
  /** '' when the vault takes the file, else why not (in the learner's words) */
  async checkFile(file: Pick<Blob, 'slice'> & { readonly name: string; readonly size: number }, usedBytes = 0): Promise<string> {
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const r = checkBytes(file.name, file.size, head, usedBytes);
    if (r.ok) return '';
    return this.T(r.error, { mb: r.error === 'quotaFull' ? QUOTA_MB : MAX_FILE_MB });
  }

  /* ---------- 📌 the pinned folders (the account's own, synced) ---------- */
  pins(): Pin[] {
    try {
      return pinsOf(JSON.parse(this.d.host.getAccountSetting(PINS) ?? '[]'));
    } catch {
      return []; // a value written by hand: none
    }
  }
  putPins(list: readonly Pin[]): void {
    this.d.host.setAccountSetting(PINS, JSON.stringify(list));
  }
}
