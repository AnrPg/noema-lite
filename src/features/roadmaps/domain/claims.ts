/* noema-lite — claims: a step handed to one run of the learner's Claude (docs/CURRICULUM.md §7). KV a:curclaim:<cid>:<nid>
   (contract noema.curriculum.v1#claim) is a lease: other runs skip the step until it is saved, or until the lease runs out
   (LEASE, a run that died); a step whose pack is built and only its upload waits is WAITING (WAIT), so a long run never
   builds it twice. */
import type { KvRow } from './model.ts';
import { ms } from './model.ts';

export const CLAIM = 'a:curclaim:';
export const LEASE = 4 * 3600e3;
export const WAIT = 72 * 3600e3;

export const claimKey = (cid: string, nid: string): string => `${CLAIM}${cid}:${nid}`;

export interface ClaimValue {
  v: 1;
  nid: string;
  at: string;
  run?: string;
  waiting?: boolean;
  packId?: string;
}

/** A claim's value as stored (text or already parsed), or null. */
export function claimValue(row: Pick<KvRow, 'value'> | null | undefined): Partial<ClaimValue> | null {
  let v = row?.value;
  if (typeof v === 'string')
    try {
      v = JSON.parse(v);
    } catch {
      return null; // an unreadable claim counts as a plain lease (it still runs out)
    }
  return v && typeof v === 'object' ? v : null;
}

/** How long a claim row lasts: WAIT once its upload waits, else LEASE. */
export const leaseOf = (row: Pick<KvRow, 'value'> | null | undefined, lease = LEASE, wait = WAIT): number =>
  claimValue(row)?.waiting ? Math.max(wait, lease) : lease;

/** Has this claim row run out at `now`? */
export const claimExpired = (row: KvRow | null | undefined, now: number, lease = LEASE, wait = WAIT): boolean =>
  now - ms(row?.updated_at) >= leaseOf(row, lease, wait);

/** The value of a new claim (run: a random token of the run that takes it). */
export const newClaim = (nid: string, now: number, run: string): ClaimValue => ({ v: 1, nid, at: new Date(now).toISOString(), run });
/** The value of a waiting claim (its pack is built, its upload waits). */
export const waitingClaim = (nid: string, packId: string, now: number): ClaimValue => ({
  v: 1,
  nid,
  at: new Date(now).toISOString(),
  waiting: true,
  packId,
});

/** The live claims of a Roadmap among KV rows → step id → when it was claimed (ms). */
export function liveClaims(cid: string, rows: readonly KvRow[], now: number, lease = LEASE, wait = WAIT): Map<string, number> {
  const out = new Map<string, number>(),
    pre = CLAIM + cid + ':';
  for (const r of rows) if (r.key.startsWith(pre) && !claimExpired(r, now, lease, wait)) out.set(r.key.slice(pre.length), ms(r.updated_at));
  return out;
}
