/**
 * A small key → JSON store over the page's localStorage (this device) or sessionStorage (this tab's session), looked up on
 * first use. A value that is not JSON reads as missing; a write that the storage refuses (full, blocked) answers false.
 */
export interface WebJsonStore {
  get(key: string): unknown;
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
}

type Area = 'localStorage' | 'sessionStorage';

function area(name: Area): Storage | null {
  try {
    return (globalThis as unknown as Partial<Record<Area, Storage>>)[name] ?? null;
  } catch {
    return null; // blocked site data: the store is empty and keeps nothing
  }
}

export function webJsonStore(name: Area): WebJsonStore {
  return Object.freeze({
    get(key: string): unknown {
      try {
        const v = area(name)?.getItem(key);
        return v == null ? null : (JSON.parse(v) as unknown);
      } catch {
        return null; // not JSON (hand-edited) or unreadable: missing
      }
    },
    set(key: string, value: unknown): boolean {
      const st = area(name);
      if (!st) return false;
      try {
        st.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false; // full or blocked: the caller decides (the translation cache starts again)
      }
    },
    remove(key: string): void {
      try {
        area(name)?.removeItem(key);
      } catch {
        return; // blocked site data: there is nothing to remove
      }
    },
  });
}
