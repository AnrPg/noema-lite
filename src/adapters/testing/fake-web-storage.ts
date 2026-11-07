/** Test double: a localStorage with a quota (characters of keys + values), throwing QuotaExceededError like browsers. */
import type { WebStorageLike } from '../browser/storage.ts';

export function fakeWebStorage(quota = Infinity): WebStorageLike & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  const size = (): number => { let n = 0; for (const [k, v] of map) n += k.length + v.length; return n; };
  return {
    map,
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => map.get(k) ?? null,
    setItem(k, v) {
      const old = map.get(k);
      if (size() - (old === undefined ? 0 : k.length + old.length) + k.length + v.length > quota)
        throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError', code: 22 });
      map.set(k, String(v));
    },
    removeItem: k => { map.delete(k); },
  };
}
