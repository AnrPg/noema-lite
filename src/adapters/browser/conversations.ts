/**
 * The ConversationStore port over the page's conversation store (engine/convos.js, window.NoemaConvos): IndexedDB store
 * "convos" (key "<account>|<id>"), then the backup folder and the cloud in the background (engine/cloud.js follows its
 * onChange). Its records are the canonical noema.conversation/v1 objects, normalised on every put, so a record written by
 * an older version or another app is read and saved again without loss. The store is looked up at each call: it loads
 * after the UI root.
 */
import type { Unsubscribe } from '../../ports/common.ts';
import type { ConversationStore, StoredConversation } from '../../ports/conversations.ts';

/** engine/convos.js's surface (the parts the port needs) */
export interface PageConvos {
  newId(at?: number): string;
  list(acc: string, o?: { subject?: string | null; includeDeleted?: boolean }): Promise<StoredConversation[]>;
  get(acc: string, id: string): Promise<StoredConversation | null | undefined>;
  put(acc: string, rec: StoredConversation, o?: { silent?: boolean; keepUpdatedAt?: boolean }): Promise<StoredConversation>;
  remove(acc: string, id: string): Promise<unknown>;
  onChange(f: (acc: string, rec: StoredConversation) => void): void;
}

const missing = (): Promise<never> => Promise.reject(new Error('the conversation store (engine/convos.js) is not loaded'));

export function pageConversationStore(page: () => PageConvos | null | undefined): ConversationStore {
  let n = 0;
  return {
    newId(at = Date.now()) {
      const s = page();
      if (s) return s.newId(at);
      n++;
      return 'cv_' + at.toString(36).padStart(10, '0') + n.toString(36).padStart(6, '0');
    },
    list: (acc, o = {}) =>
      page()?.list(acc, { ...(o.subject ? { subject: o.subject } : {}), ...(o.includeDeleted ? { includeDeleted: true } : {}) }) ??
      missing(),
    get: async (acc, id) => (await (page()?.get(acc, id) ?? missing())) ?? null,
    put: (acc, rec) => page()?.put(acc, rec) ?? missing(),
    remove: async (acc, id) => {
      await (page()?.remove(acc, id) ?? missing());
    },
    onChange(f): Unsubscribe {
      let on = true;
      page()?.onChange((a, r) => {
        if (on) f(a, r);
      });
      return () => {
        on = false;
      };
    },
  };
}
