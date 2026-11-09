/**
 * ConversationStore port: where the conversations with the AI live (docs/CONVERSATIONS.md). One record is one
 * noema.conversation/v1 object — a tutor chat in any mode, or a one-shot AI job (grading, a code review, a new question, a
 * drill's checklist). The adapter keeps them per account (IndexedDB, then the backup folder and the cloud in the
 * background: engine/convos.js today), normalises what it is given (older shapes, partial objects) and never hard-deletes:
 * a removal is a tombstone, so it reaches the folder and the other devices. Records are plain JSON; the tutor's shape and
 * the conversion are the tutor's domain (src/features/tutor/domain/conversation.ts).
 */
import type { Unsubscribe } from './common.ts';

/** A stored record (the schema's fields; the domain types it). */
export type StoredConversation = { readonly id: string; readonly [field: string]: unknown };

export interface ConversationStore {
  /** a new time-sortable id: cv_<10 base36 ms><6 random> */
  newId(at?: number): string;
  /** the account's records, oldest id first (tombstones left out unless asked) */
  list(account: string, o?: { readonly subject?: string; readonly includeDeleted?: boolean }): Promise<StoredConversation[]>;
  get(account: string, id: string): Promise<StoredConversation | null>;
  /** saves (insert or update) with a new updatedAt; → the record as normalised and stored */
  put(account: string, record: StoredConversation): Promise<StoredConversation>;
  /** a tombstone: deleted, without its messages */
  remove(account: string, id: string): Promise<void>;
  /** a record saved on this device (the sync and the backup folder follow it) */
  onChange(listener: (account: string, record: StoredConversation) => void): Unsubscribe;
}
