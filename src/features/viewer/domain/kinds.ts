/* noema-lite — 👁 the file viewer (docs/SOURCES.md): what kind a file is, from its name or its type. Pure. */

export const KINDS = Object.freeze({
  pdf: ['pdf'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'jfif', 'apng'],
  heic: ['heic', 'heif'],
  tiff: ['tif', 'tiff'],
  markdown: ['md', 'markdown', 'mdown'],
  csv: ['csv', 'tsv'],
  json: ['json', 'geojson', 'jsonl'],
  html: ['html', 'htm', 'xhtml'],
  text: [
    'txt',
    'log',
    'xml',
    'yaml',
    'yml',
    'ini',
    'cfg',
    'conf',
    'toml',
    'sql',
    'py',
    'js',
    'ts',
    'jsx',
    'tsx',
    'java',
    'c',
    'h',
    'cpp',
    'hpp',
    'cs',
    'go',
    'rs',
    'rb',
    'php',
    'sh',
    'bash',
    'zsh',
    'ps1',
    'bat',
    'r',
    'm',
    'swift',
    'kt',
    'scala',
    'lua',
    'pl',
    'tex',
    'bib',
    'srt',
    'vtt',
    'css',
    'scss',
    'less',
    'svgz',
    'properties',
    'env',
    'gradle',
    'dockerfile',
    'makefile',
  ],
  docx: ['docx', 'docm', 'dotx'],
  odt: ['odt', 'odp', 'ott'],
  rtf: ['rtf'],
  sheet: ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'numbers', 'fods'],
  pptx: ['pptx', 'ppsx', 'potx'],
  epub: ['epub'],
  ipynb: ['ipynb'],
  eml: ['eml', 'mht', 'mhtml'],
  zip: ['zip', 'jar', 'kmz'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'],
  video: ['mp4', 'webm', 'ogv', 'mov', 'm4v'],
  legacy: ['doc', 'ppt', 'msg', 'wps', 'pages', 'key'],
} as const);

/** A kind of file the viewer reads; 'unknown' is shown as text or a hex view, 'youtube' and 'web' are addresses. */
export type FileKind = keyof typeof KINDS | 'unknown';
export type ShownKind = FileKind | 'youtube' | 'web' | 'error';
/** every kind with its words (loader.viewer.kind.<kind>) */
export const KIND_NAMES: readonly ShownKind[] = Object.freeze([
  ...(Object.keys(KINDS) as (keyof typeof KINDS)[]),
  'unknown',
  'youtube',
  'web',
]);

/** the extension of a name or address ('Book.PDF?x' → 'pdf') */
export const ext = (name: string | null | undefined): string => /\.([a-z0-9]+)(?:$|\?)/.exec((name ?? '').toLowerCase())?.[1] ?? '';

export function kindOf(name: string | null | undefined, type = ''): FileKind {
  const e = ext(name);
  for (const [k, list] of Object.entries(KINDS) as [keyof typeof KINDS, readonly string[]][]) if (list.includes(e)) return k;
  const t = type.toLowerCase();
  if (t.includes('pdf')) return 'pdf';
  if (/heic|heif/.test(t)) return 'heic';
  if (t.includes('tiff')) return 'tiff';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (t.includes('html')) return 'html';
  if (t.includes('json')) return 'json';
  if (t.includes('csv')) return 'csv';
  if (t.includes('markdown')) return 'markdown';
  if (t.includes('wordprocessingml')) return 'docx';
  if (t.includes('spreadsheet') || t.includes('excel')) return 'sheet';
  if (t.includes('presentationml')) return 'pptx';
  if (t.includes('epub')) return 'epub';
  if (t.includes('zip')) return 'zip';
  if (t.startsWith('text/')) return 'text';
  if (t.includes('rfc822')) return 'eml';
  return 'unknown';
}

/** A YouTube address → its privacy-friendly embed address (at `start` seconds, else the address's t=), or null. */
export function youtube(u: string, start?: number | null): string | null {
  const s = u,
    m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(s);
  if (!m) return null;
  const t = start ?? (Number(/[?&]t=(\d+)/.exec(s)?.[1]) || 0);
  return `https://www.youtube-nocookie.com/embed/${m[1] ?? ''}${t ? '?start=' + String(t) : ''}`;
}

/** the file name of an address ('https://x/a/Book%201.pdf?x' → 'Book 1.pdf') */
export function nameOfUrl(url: string): string {
  const last = url.split(/[?#]/)[0]?.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last) || 'file';
  } catch {
    return last || 'file'; // a broken escape: the name as written
  }
}
