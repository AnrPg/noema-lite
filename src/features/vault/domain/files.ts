/**
 * The files of the vault as the page sees them (docs/VAULT.md §1): the filters (every one in the address, every one across
 * all the folders), the search words (in any script: translit.ts), the orders, the folders — views of the one list, never
 * copies: by school (university › department › course) or down the field graph — and the pinned folders.
 */
import { textOf } from '../../../kernel/text.ts';
import { fold } from '../../search/domain/fold.ts';
import { matchesAll } from '../../search/domain/translit.ts';
import type { VaultFile } from '../../../ports/vault.ts';
import type { FieldGraph } from './fields.ts';

export type { VaultFile } from '../../../ports/vault.ts';
import { groupOf } from './formats.ts';

export const KINDS = Object.freeze([
  'notes',
  'slides',
  'exam',
  'exam_solved',
  'exercises',
  'lab',
  'summary',
  'book',
  'recording',
  'other',
] as const);

/* ---------- the page's settings, in the address: #/vault?q=…&u=…&sem=3&k=notes,exam … ---------- */
/** q words · v files|'' (folders) · by school|field · f the folder path · u d c p university, department, course, professor ·
    y year · sem semester · k kinds · sub field · x exercises · sol solutions · hw hand|typed · lg language · ft format groups ·
    r stars at least · used · mine · g a study group's folder · sort · id open that file */
export const VAULT_KEYS = Object.freeze([
  'q',
  'v',
  'by',
  'f',
  'u',
  'd',
  'c',
  'p',
  'y',
  'sem',
  'k',
  'sub',
  'x',
  'sol',
  'hw',
  'lg',
  'ft',
  'r',
  'used',
  'mine',
  'g',
  'sort',
  'id',
] as const);
export type VaultKey = (typeof VAULT_KEYS)[number];
export type VaultParams = Partial<Record<VaultKey, string>>;
/** The keys that are not filters (the words, the view, the folder, the order, the file opened). */
const NOT_FILTERS: ReadonlySet<VaultKey> = new Set(['q', 'v', 'by', 'f', 'sort', 'id']);

/** The settings of an address ("#/vault?…"). */
export function parseVaultParams(hash: string): VaultParams {
  const q = new URLSearchParams(hash.split('?')[1] ?? ''),
    P: VaultParams = {};
  for (const k of VAULT_KEYS) {
    const v = q.get(k);
    if (v) P[k] = v;
  }
  return P;
}
export function vaultHash(P: VaultParams): string {
  const q = new URLSearchParams();
  for (const k of VAULT_KEYS) {
    const v = P[k];
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return '#/vault' + (s ? '?' + s : '');
}
/** The filters in use, in the order of the keys. */
export const activeFilters = (P: VaultParams): VaultKey[] => VAULT_KEYS.filter(k => !NOT_FILTERS.has(k) && !!P[k]);

export const listOf = (s: unknown): string[] => (s == null ? '' : textOf(s)).split(',').filter(Boolean);
/** The same name written another way (case, accents, spaces): one place stays one folder. */
export const same = (a: unknown, b: unknown): boolean => fold(a) === fold(b);
/** A name as typed, compared with the names in the vault (spaces tidied too). */
export const tidy = (s: unknown): string => fold(s).replace(/\s+/g, ' ').trim();
export const fieldsOf = (f: VaultFile): readonly string[] => f.fields ?? [];
export const langsOf = (f: VaultFile): string[] => listOf(f.language);
export const stars = (f: VaultFile): number => (f.rating_n ? (f.rating_sum ?? 0) / f.rating_n : 0);
export const given = (v: unknown): boolean => v != null && v !== '';
/** Filed under the field, or under a field below it. */
export const inField = (f: VaultFile, id: string, graph: FieldGraph): boolean => fieldsOf(f).some(x => graph.up(x).has(id));

/** The files that pass every filter and the search words; `hay` gives the text a file is searched in (its words in the
    menus' languages are the caller's: vault.ts hayOf). */
export function filterFiles(all: readonly VaultFile[], P: VaultParams, graph: FieldGraph, hay: (f: VaultFile) => string): VaultFile[] {
  const k = listOf(P.k),
    ft = listOf(P.ft);
  return all.filter(
    f =>
      (!P.u || same(f.university, P.u)) &&
      (!P.d || same(f.department, P.d)) &&
      (!P.c || same(f.course, P.c)) &&
      (!P.p || same(f.professor ?? '', P.p)) &&
      (!P.y || String(f.year) === P.y) &&
      (!P.sem || String(f.semester) === P.sem || !f.semester) &&
      (!k.length || k.includes(f.kind)) &&
      (!P.sub || inField(f, P.sub, graph)) &&
      (!P.x || !!f.has_exercises) &&
      (!P.sol || !!f.has_solutions) &&
      (!P.hw || (P.hw === 'hand' ? !!f.handwritten : !f.handwritten)) &&
      (!P.lg || langsOf(f).includes(P.lg)) &&
      (!ft.length || ft.includes(groupOf(f.file_name))) &&
      (!P.r || (!!f.rating_n && stars(f) >= +P.r)) &&
      (!P.used || (f.used ?? 0) > 0) &&
      (!P.mine || !!f.mine) &&
      (!P.g || f.room === P.g) &&
      (!P.q || matchesAll(hay(f), P.q)),
  );
}

export const SORTS = Object.freeze({
  new: (a: VaultFile, b: VaultFile) => String(b.created_at).localeCompare(String(a.created_at)),
  rating: (a: VaultFile, b: VaultFile) => stars(b) - stars(a) || (b.rating_n ?? 0) - (a.rating_n ?? 0),
  downloads: (a: VaultFile, b: VaultFile) => (b.downloads ?? 0) - (a.downloads ?? 0),
  year: (a: VaultFile, b: VaultFile) => (b.year ?? 0) - (a.year ?? 0),
});
export type SortKey = keyof typeof SORTS;
export const sortKeys = (): SortKey[] => Object.keys(SORTS) as SortKey[];
export const sortFiles = (list: readonly VaultFile[], key: string | undefined): VaultFile[] =>
  [...list].sort(SORTS[(key && key in SORTS ? key : 'new') as SortKey]);

/** The distinct values of a column (the way they were first written), most used first. */
export function valuesOf(rows: readonly Readonly<Record<string, unknown>>[], field: string): { v: string | number; n: number }[] {
  const m = new Map<string, { v: string | number; n: number }>();
  for (const r of rows) {
    const v = r[field];
    if (v == null || v === '') continue;
    const val = typeof v === 'number' ? v : textOf(v);
    const key = fold(val);
    const x = m.get(key) ?? { v: val, n: 0 };
    x.n++;
    m.set(key, x);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || String(a.v).localeCompare(String(b.v), undefined, { numeric: true }));
}
/** A name already in the vault written another way → that one (else null). */
export function snapName(rows: readonly VaultFile[], field: string, typed: string): string | null {
  const t = tidy(typed);
  const m = valuesOf(rows, field).find(x => tidy(x.v) === t);
  return m ? String(m.v) : null;
}

/* ---------- 📁 folders ---------- */
/** The folder of the files without that detail (in the address: f=-›…). */
export const NONE = '-';
export const SCHOOL = Object.freeze(['university', 'department', 'course'] as const);
export type FolderLevel = (typeof SCHOOL)[number] | 'field';
export interface FolderEntry {
  readonly v: string;
  readonly n: number;
}
export const folderPath = (f: string | undefined): string[] => (f ?? '').split('›').filter(Boolean);
const valsOf = (f: VaultFile, lev: string): unknown[] => (given(f[lev]) ? [f[lev]] : []);

/** By school, at a path: the files here, and either the folders of the next level (most files first, then by name, the
    files without that detail last) or, at the course, the end. */
export function schoolFolder(
  list: readonly VaultFile[],
  path: readonly string[],
  nameOf: (level: FolderLevel, v: string) => string,
): { here: VaultFile[]; depth: number; level: FolderLevel | null; kids: FolderEntry[] } {
  const depth = Math.min(path.length, SCHOOL.length);
  const here = list.filter(f =>
    path.slice(0, depth).every((p, i) => {
      const vs = valsOf(f, SCHOOL[i] as string);
      return vs.length ? vs.some(v => textOf(v) === p || same(v, p)) : p === NONE;
    }),
  );
  if (depth >= SCHOOL.length) return { here, depth, level: null, kids: [] };
  const lev = SCHOOL[depth] as FolderLevel;
  const kids = valuesOf(
    here.flatMap(f => valsOf(f, lev).map(v => ({ [lev]: v }))),
    lev,
  ).map(x => ({ v: String(x.v), n: x.n }));
  kids.sort((a, b) => b.n - a.n || nameOf(lev, a.v).localeCompare(nameOf(lev, b.v)));
  const none = here.filter(f => !valsOf(f, lev).length).length;
  if (none) kids.push({ v: NONE, n: none });
  return { here, depth, level: lev, kids };
}

/** By field, at a path: the fields under this one that hold files (a file under two of them shows in both), and the files
    filed under this field itself. At the top: the broad fields, and NONE for the files of fields not known here. */
export function fieldFolder(
  list: readonly VaultFile[],
  path: readonly string[],
  graph: FieldGraph,
  nameOf: (id: string) => string,
): { node: string | null; here: VaultFile[]; kids: FolderEntry[]; direct: VaultFile[] } {
  const node = path[path.length - 1] ?? null;
  const known = (f: VaultFile): boolean => fieldsOf(f).some(x => !!graph.get(x));
  if (node === NONE) return { node, here: list.filter(f => !known(f)), kids: [], direct: [] };
  const here = node ? list.filter(f => inField(f, node, graph)) : [...list];
  const kids = (node ? graph.children(node) : graph.roots())
    .map(v => ({ v, n: here.filter(f => inField(f, v, graph)).length }))
    .filter(x => x.n)
    .sort((a, b) => b.n - a.n || nameOf(a.v).localeCompare(nameOf(b.v)));
  if (!node) {
    const lost = here.filter(f => !known(f)).length;
    if (lost) kids.push({ v: NONE, n: lost });
  }
  return { node, here, kids, direct: node ? here.filter(f => fieldsOf(f).includes(node)) : [] };
}

/** A folder pinned for quick return. */
export interface Pin {
  readonly by: 'school' | 'field';
  readonly f: string;
  readonly label: string;
}
export const PINS_MAX = 12;
export function pinsOf(stored: unknown): Pin[] {
  return Array.isArray(stored)
    ? stored.filter(
        (x): x is Pin =>
          !!x && typeof x === 'object' && typeof (x as Pin).f === 'string' && ((x as Pin).by === 'school' || (x as Pin).by === 'field'),
      )
    : [];
}
export const isPinned = (pins: readonly Pin[], by: string, f: string): boolean => pins.some(x => x.by === by && x.f === f);
export const pin = (pins: readonly Pin[], p: Pin): Pin[] => [p, ...pins.filter(x => !(x.by === p.by && x.f === p.f))].slice(0, PINS_MAX);
export const unpin = (pins: readonly Pin[], by: string, f: string): Pin[] => pins.filter(x => !(x.by === by && x.f === f));
