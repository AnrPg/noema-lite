/**
 * The AttachmentStore port in the browser: IndexedDB database "noema-attachments", store "files", key
 * "<account>|<sha-256 hex>", value { name, mediaType, bytes } (docs/CONVERSATIONS.md "Attachments"). The id is the hash of
 * the bytes, so the same file is kept once. Also: making a picture ready for the AI (at most 1568 px on its long side, the
 * size the AIs read anyway: fewer tokens, a smaller copy on the device).
 */
import type { AttachmentStore, StoredFile } from '../../ports/attachments.ts';

const DB = 'noema-attachments',
  STORE = 'files';

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const q = idb.open(DB, 1);
    q.onupgradeneeded = () => {
      q.result.createObjectStore(STORE);
    };
    q.onsuccess = () => {
      res(q.result);
    };
    q.onerror = () => {
      rej(q.error ?? new Error('indexedDB'));
    };
  });
}
function run<T>(db: IDBDatabase, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((res, rej) => {
    const r = f(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => {
      res(r.result as T);
    };
    r.onerror = () => {
      rej(r.error ?? new Error('indexedDB'));
    };
  });
}
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
}

export function browserAttachmentStore(idb: IDBFactory = indexedDB): AttachmentStore {
  let db: Promise<IDBDatabase> | null = null;
  const conn = (): Promise<IDBDatabase> => (db ??= open(idb));
  return {
    async put(account, file) {
      const id = (await sha256Hex(file.bytes)).slice(0, 40);
      const d = await conn();
      const have = await run<StoredFile | undefined>(d, 'readonly', s => s.get(account + '|' + id));
      if (!have)
        await run(d, 'readwrite', s => s.put({ name: file.name, mediaType: file.mediaType, bytes: file.bytes }, account + '|' + id));
      return id;
    },
    async get(account, id) {
      const v = await run<StoredFile | undefined>(await conn(), 'readonly', s => s.get(account + '|' + id));
      return v ? { name: v.name, mediaType: v.mediaType, bytes: new Uint8Array(v.bytes) } : null;
    },
  };
}

/** the long side the AIs read pictures at (Claude: 1568 px; Gemini tiles larger ones down) */
export const IMAGE_MAX_SIDE = 1568;

/** A file the learner chose, as the store keeps it: a big picture made smaller (an animated GIF and a small one as they are). */
export async function readFile(f: File): Promise<StoredFile> {
  const raw = new Uint8Array(await f.arrayBuffer());
  const type = f.type || 'application/octet-stream';
  if (!/^image\/(png|jpeg|webp)$/.test(type) || typeof createImageBitmap !== 'function')
    return { name: f.name, mediaType: type, bytes: raw };
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, IMAGE_MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (k >= 1 && raw.length < 1_500_000) return { name: f.name, mediaType: type, bytes: raw };
    const w = Math.max(1, Math.round(bmp.width * k)),
      h = Math.max(1, Math.round(bmp.height * k));
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d')?.drawImage(bmp, 0, 0, w, h);
    const out = type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await c.convertToBlob({ type: out, quality: 0.86 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return bytes.length < raw.length ? { name: f.name, mediaType: out, bytes } : { name: f.name, mediaType: type, bytes: raw };
  } catch {
    return { name: f.name, mediaType: type, bytes: raw };
  }
}
