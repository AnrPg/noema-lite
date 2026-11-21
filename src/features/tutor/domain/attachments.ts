/**
 * Files in the tutor chat (docs/CONVERSATIONS.md "Attachments"): which kinds there are, what each AI can read, the limits,
 * and how a file goes to the AI (a typed part of the learner's message: ports/ai.ts ContentPart). Pure.
 *
 * Both AIs read pictures (PNG, JPEG, WebP, GIF) and PDFs; Gemini also reads sound and video. A text file (notes, code, a
 * CSV) goes to either as text. Every file goes with its message on every later turn of the branch, as a chat app does,
 * within a budget per request: the newest files first, and a note for the older ones left out.
 */
import type { ContentPart } from '../../../ports/ai.ts';
import type { Attachment, AttachmentKind } from './conversation.ts';

/** files per message */
export const MAX_FILES = 6;
/** bytes per file (pictures are made smaller before they are kept: ≤ 1568 px on the long side) */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
/** bytes of files in one request to the AI (Gemini takes ~20 MB per request, base64 included; Claude 32 MB) */
export const REQUEST_BUDGET: Readonly<Record<'gemini' | 'claude', number>> = { gemini: 14 * 1024 * 1024, claude: 22 * 1024 * 1024 };
/** characters of a text file sent to the AI */
export const MAX_TEXT_CHARS = 200_000;

const IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|ya?ml|toml|ini|log|sql|py|ipynb|js|mjs|ts|tsx|jsx|java|kt|scala|c|h|cc|cpp|hpp|cs|go|rs|rb|php|sh|bash|zsh|r|m|swift|dart|lua|pl|tex|bib|html?|css|scss)$/i;

/** the kind of a file, or null when no AI here can read it */
export function kindOf(mediaType: string, name = ''): AttachmentKind | null {
  const t = mediaType.toLowerCase();
  if (IMAGE.has(t)) return 'image';
  if (t === 'application/pdf') return 'pdf';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('text/') || /json|xml|yaml|csv|javascript|typescript|x-sh|x-python/.test(t) || TEXT_EXT.test(name)) return 'text';
  return null;
}
/** the AI the learner talks to now, as the files see it ('copy': no key — the files cannot be pasted) */
export type FileReader = 'gemini' | 'claude' | 'copy';
/** can this AI read files of this kind? */
export const reads = (ai: FileReader, kind: AttachmentKind): boolean =>
  ai === 'copy' ? kind === 'text' : ai === 'gemini' ? true : kind !== 'audio' && kind !== 'video';
/** the file picker's accept="…" for this AI */
export function acceptFor(ai: FileReader): string {
  const base = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/*',
    '.md',
    '.csv',
    '.json',
    '.py',
    '.sql',
    '.js',
    '.ts',
  ];
  return (
    ai === 'gemini' ? [...base, 'audio/*', 'video/*'] : ai === 'copy' ? ['text/*', '.md', '.csv', '.json', '.py', '.sql'] : base
  ).join(',');
}
/** why a file cannot be added: null when it can */
export function refusal(
  f: { readonly mediaType: string; readonly name: string; readonly size: number },
  ai: FileReader,
  already: number,
): 'type' | 'reader' | 'size' | 'count' | null {
  const k = kindOf(f.mediaType, f.name);
  if (!k) return 'type';
  if (!reads(ai, k)) return 'reader';
  if (f.size > MAX_FILE_BYTES) return 'size';
  if (already >= MAX_FILES) return 'count';
  return null;
}

/* i18n-ignore-start */ // words for the AI (English, like the rest of the prompt)
const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const text = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

/** One file as a part of the learner's message for this AI. bytes null: not on this device; over: left out (budget). */
export function partOf(a: Attachment, bytes: Uint8Array | null, ai: FileReader, over = false): ContentPart {
  const label = `"${a.name}" (${a.mediaType})`;
  if (!bytes) return { type: 'text', text: `[The learner attached ${label}; it is not on this device, so it is not shown to you.]` };
  if (!reads(ai, a.kind)) return { type: 'text', text: `[The learner attached ${label}; this model cannot read it.]` };
  if (over) return { type: 'text', text: `[The learner attached ${label} earlier; it is left out of this message to save space.]` };
  switch (a.kind) {
    case 'image':
      return { type: 'image', mediaType: a.mediaType, data: b64(bytes) };
    case 'pdf':
      return { type: 'document', mediaType: 'application/pdf', data: b64(bytes), title: a.name };
    case 'audio':
    case 'video':
      return { type: 'media', mediaType: a.mediaType, data: b64(bytes), title: a.name };
    case 'text': {
      const t = text(bytes);
      return {
        type: 'text',
        text: `📎 ${a.name}:\n\`\`\`\n${t.length > MAX_TEXT_CHARS ? t.slice(0, MAX_TEXT_CHARS) + '\n… (cut)' : t}\n\`\`\``,
      };
    }
  }
}
/* i18n-ignore-end */

/**
 * Which files of a path go whole: the newest ones first, while they fit the AI's budget (text files are counted too).
 * → the ids left out.
 */
export function overBudget(path: readonly { readonly attachments?: readonly Attachment[] }[], ai: FileReader): Set<string> {
  const budget = ai === 'claude' ? REQUEST_BUDGET.claude : REQUEST_BUDGET.gemini;
  const out = new Set<string>();
  let used = 0;
  for (let i = path.length - 1; i >= 0; i--)
    for (const a of path[i]?.attachments ?? []) {
      if (used + a.size > budget && used > 0) out.add(a.id);
      else used += a.size;
    }
  return out;
}
