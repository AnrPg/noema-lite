/**
 * What the vault takes (docs/VAULT.md §3): documents, slides, spreadsheets, e-books, pictures, audio and video — each
 * format by its extension, its mime type and a check of its first bytes (a program renamed .pdf is refused). No programs,
 * scripts, archives or SVG. ≤ 20 MB a file, ≤ 50 MB a person (the vault and the files of conversations together).
 */
import { textOf } from '../../../kernel/text.ts';
import { err, ok, OK_VOID, type Result } from '../../../kernel/result.ts';

export const MAX_FILE = 20 * 1048576;
export const QUOTA = 50 * 1048576;
export const MAX_FILE_MB = 20;
export const QUOTA_MB = 50;

/** The groups the format filter offers. */
export const GROUPS = Object.freeze(['doc', 'slides', 'sheet', 'book', 'image', 'audio', 'video', 'text'] as const);
export type FormatGroup = (typeof GROUPS)[number];

type Head = Uint8Array;
const at = (b: Head, off: number, s: string): boolean =>
  Array.from({ length: s.length }, (_, i) => s.charCodeAt(i)).every((c, i) => b[off + i] === c);
const ZIP = (b: Head): boolean => at(b, 0, 'PK\x03\x04'),
  OLE = (b: Head): boolean => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  FTYP = (b: Head): boolean => at(b, 4, 'ftyp'),
  TEXT = (b: Head): boolean => !b.slice(0, 4096).includes(0),
  JPEG = (b: Head): boolean => b[0] === 0xff && b[1] === 0xd8;

export interface Format {
  readonly mime: string;
  readonly group: FormatGroup;
  /** do the first bytes say it is what its extension says? */
  readonly looksRight: (head: Head) => boolean;
}
const F = (mime: string, group: FormatGroup, looksRight: (head: Head) => boolean): Format => Object.freeze({ mime, group, looksRight });

export const FORMATS: Readonly<Record<string, Format>> = Object.freeze({
  pdf: F('application/pdf', 'doc', b => at(b, 0, '%PDF')),
  doc: F('application/msword', 'doc', OLE),
  docx: F('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc', ZIP),
  odt: F('application/vnd.oasis.opendocument.text', 'doc', ZIP),
  rtf: F('application/rtf', 'doc', b => at(b, 0, '{\\rtf')),
  txt: F('text/plain', 'text', TEXT),
  md: F('text/markdown', 'text', TEXT),
  tex: F('text/x-tex', 'text', TEXT),
  csv: F('text/csv', 'sheet', TEXT),
  ppt: F('application/vnd.ms-powerpoint', 'slides', OLE),
  pptx: F('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'slides', ZIP),
  odp: F('application/vnd.oasis.opendocument.presentation', 'slides', ZIP),
  xls: F('application/vnd.ms-excel', 'sheet', OLE),
  xlsx: F('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet', ZIP),
  ods: F('application/vnd.oasis.opendocument.spreadsheet', 'sheet', ZIP),
  epub: F('application/epub+zip', 'book', ZIP),
  png: F('image/png', 'image', b => b[0] === 0x89 && at(b, 1, 'PNG')),
  jpg: F('image/jpeg', 'image', JPEG),
  jpeg: F('image/jpeg', 'image', JPEG),
  gif: F('image/gif', 'image', b => at(b, 0, 'GIF8')),
  webp: F('image/webp', 'image', b => at(b, 0, 'RIFF') && at(b, 8, 'WEBP')),
  heic: F('image/heic', 'image', FTYP),
  mp3: F('audio/mpeg', 'audio', b => at(b, 0, 'ID3') || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)),
  m4a: F('audio/mp4', 'audio', FTYP),
  wav: F('audio/wav', 'audio', b => at(b, 0, 'RIFF') && at(b, 8, 'WAVE')),
  ogg: F('audio/ogg', 'audio', b => at(b, 0, 'OggS')),
  flac: F('audio/flac', 'audio', b => at(b, 0, 'fLaC')),
  mp4: F('video/mp4', 'video', FTYP),
  mov: F('video/quicktime', 'video', FTYP),
  webm: F('video/webm', 'video', b => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3),
});

/** The extension of a file name, lower case ('' when it has none). */
export const extOf = (name: unknown): string =>
  (/\.([a-z0-9]{1,5})$/.exec((name == null ? '' : textOf(name)).toLowerCase()) ?? [])[1] ?? '';
export const formatOf = (name: unknown): Format | null => FORMATS[extOf(name)] ?? null;
/** The group of a file (by its name; 'doc' when it is not a known format). */
export const groupOf = (name: unknown): FormatGroup => formatOf(name)?.group ?? 'doc';
/** The `accept` of the file picker: every extension the vault takes. */
export const ACCEPT = Object.keys(FORMATS)
  .map(e => '.' + e)
  .join(',');

/** Why a file cannot go into the vault (each has its words in i18n/vault: vault.<code>). */
export type FileProblem = 'badFormat' | 'tooBig' | 'empty' | 'quotaFull' | 'notWhatItSays';

/** The checks that need no bytes: the format, the size, the person's room left. */
export function checkFileInfo(name: string, size: number, usedBytes = 0): Result<Format, FileProblem> {
  const f = formatOf(name);
  if (!f) return err('badFormat');
  if (size > MAX_FILE) return err('tooBig');
  if (!size) return err('empty');
  if (usedBytes + size > QUOTA) return err('quotaFull');
  return ok(f);
}
/** Every check, with the file's first bytes (≥ 12 of them; 4096 are read). */
export function checkFile(name: string, size: number, head: Uint8Array, usedBytes = 0): Result<void, FileProblem> {
  const info = checkFileInfo(name, size, usedBytes);
  if (!info.ok) return info;
  return info.value.looksRight(head) ? OK_VOID : err('notWhatItSays');
}
