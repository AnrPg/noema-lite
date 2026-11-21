/**
 * AttachmentStore port: the files a learner adds to a message of the tutor chat (pictures, PDFs, sound, video, text).
 * The conversation record keeps only a reference (id = the content's SHA-256, name, type, size: docs/CONVERSATIONS.md
 * "Attachments"); the bytes live on the device, per account, so a record stays small enough to sync. The same file added
 * twice is stored once.
 */

/** a file's bytes as the store keeps them */
export interface StoredFile {
  readonly name: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface AttachmentStore {
  /** keeps the file → its id (the content hash) */
  put(account: string, file: StoredFile): Promise<string>;
  /** the file, or null when this device does not have it (it was added on another device) */
  get(account: string, id: string): Promise<StoredFile | null>;
}
