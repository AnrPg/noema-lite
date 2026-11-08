/* noema-lite — the work a Roadmap has outside the app, for the learner's own Claude (docs/CURRICULUM.md §7):
     map   the graph agents (1 · 1b · 2) — only for a Roadmap made with the Claude app
     plan  chapter plans of steps (batches of 5, at most 2 of them with files)
     step  a step to prepare as a subject — any Roadmap, once it is queued (pack.status 'app')
   Which work there is, in which order, which step comes next, and the queue as it really is (settle: what was saved
   meanwhile, what other runs or participants hold). A `level` narrows plans and steps to the steps at that level
   (noema_curriculum_task level, docs/CURRICULUM.md §11). */
import type { KvRow, MaterialFile, RemoteStep, Roadmap, Step } from './model.ts';
import { clone, ms } from './model.ts';
import { curStore, order, packId } from './graph.ts';
import { liveClaims, LEASE, WAIT } from './claims.ts';
import { atLevel } from './levels.ts';

export const BATCH = 5;
export const BATCH_FILES = 2;
export const GRAPH = ['dag', 'audit', 'expand'] as const;
export type GraphStage = (typeof GRAPH)[number];

export const isApp = (c: Pick<Roadmap, 'provider'> | null | undefined): boolean => c?.provider === 'claudeapp';
export const prepared = (n: Step | undefined): boolean => ['ready', 'generating'].includes(n?.pack?.status ?? '');
/** A step needs its chapter plan: it is not prepared (a step taught by an attached subject is planned from it, never
    prepared), and it has no chapters or a re-plan was asked for. */
export const needsPlan = (n: Step | undefined): boolean =>
  !!n && (!prepared(n) || !!n.pack?.assigned) && (!n.chapters?.length || !!n.replan);
/** 👥 a Roadmap someone shared with the learner: its map and plans are the owner's. */
export const member = (c: Pick<Roadmap, 'shared'> | null | undefined): boolean => c?.shared?.role === 'member' && !c.shared.ended;
/** 📦 Planning waits until the learner has attached the subjects they already have. */
export const holding = (c: Pick<Roadmap, 'attachFirst' | 'nodes'>): boolean =>
  !!c.attachFirst && Object.values(c.nodes).some(n => !n.chapters?.length);
/** A step's plan is fixed: its pack is prepared (or being prepared) from it, and no subject of the learner teaches it. */
export const planLocked = (n: Step | undefined): boolean => prepared(n) && !n?.pack?.assigned;

export interface Work {
  graph: GraphStage | null;
  toPlan: string[];
  /** queued and free, in queue order */
  steps: string[];
  /** queued and being prepared by a run right now (settle) */
  claimed: string[];
  done: boolean;
}

/** What is still to do outside the app. level: only the steps at that level are planned and prepared (the map is the map's). */
export function work(c: Roadmap, { level = '' }: { level?: string } = {}): Work {
  const stage = c.stage ?? '',
    graph = isApp(c) && !member(c) && (GRAPH as readonly string[]).includes(stage) ? (stage as GraphStage) : null;
  const at = (id: string): boolean => !level || atLevel(c, c.nodes[id], level);
  const toPlan =
    isApp(c) && !graph && stage !== 'dag' && !holding(c)
      ? order(c).filter(id => needsPlan(c.nodes[id]) && (!member(c) || !!c.nodes[id]?.pack?.assigned) && at(id))
      : [];
  const queued = Object.keys(c.nodes)
    .filter(id => c.nodes[id]?.pack?.status === 'app' && at(id))
    .sort((a, b) => (c.nodes[a]?.pack?.queuedAt ?? '').localeCompare(c.nodes[b]?.pack?.queuedAt ?? '') || a.localeCompare(b));
  const steps = queued.filter(id => !c.nodes[id]?.pack?.claimedAt),
    claimed = queued.filter(id => !!c.nodes[id]?.pack?.claimedAt);
  return { graph, toPlan, steps, claimed, done: !graph && !toPlan.length && !steps.length };
}

/** Which re-plan requests a plan task answers: a hash of the replanAt of each of its steps ('' when none was asked for). An
    answer written for an older request no longer matches. */
export function planGen(c: Roadmap, ids: readonly string[]): string {
  const v = ids.map(i => c.nodes[i]?.replanAt ?? '');
  if (!v.some(Boolean)) return '';
  let h = 5381;
  for (const ch of v.join('|')) h = (Math.imul(h, 33) ^ ch.charCodeAt(0)) >>> 0;
  return '@' + h.toString(36);
}

const hasFiles = (c: Roadmap, id: string): boolean => {
  const n = c.nodes[id];
  return !!n?.material?.files?.length && !n.pack?.assigned;
};
/** The next plan batch: up to BATCH steps, at most BATCH_FILES of them with files (Claude reads their pages first). */
export function planBatch(c: Roadmap, ids: readonly string[]): string[] {
  const out: string[] = [];
  let withFiles = 0;
  for (const id of ids) {
    const f = hasFiles(c, id);
    if (out.length && f && withFiles >= BATCH_FILES) continue;
    out.push(id);
    if (f) withFiles++;
    if (out.length >= BATCH) break;
  }
  return out;
}

/** The id of a plan task, and the steps of one (null: not a plan task). */
export const planTaskId = (c: Roadmap, ids: readonly string[]): string => 'plan:' + ids.join(',') + planGen(c, ids);
export function planTaskSteps(c: Roadmap, id: string): string[] | null {
  const m = /^plan:([^@]+)(@[0-9a-z]+)?$/.exec(id);
  if (!m) return null;
  const ids = (m[1] ?? '').split(',').filter(Boolean);
  return ids.length && ids.every(i => needsPlan(c.nodes[i])) && (m[2] ?? '') === planGen(c, ids) ? ids : null;
}

export interface Download {
  store: string;
  src: string;
  name: string;
  size: number;
  type: string;
  pages: number | null;
  sha256: string | null;
}
/** The learner's files of some steps, each file once (even when several steps or page ranges use it). */
export function downloadsOf(c: Roadmap, ids: readonly string[]): Download[] {
  const out: Download[] = [],
    seen = new Set<string>();
  for (const nid of ids) {
    const n = c.nodes[nid],
      files: MaterialFile[] = n?.pack?.assigned ? [] : (n?.material?.files ?? []);
    for (const f of files) {
      const store = f.fileId ? curStore(c.id) : packId(c, nid),
        src = f.fileId ?? f.srcId ?? '',
        k = store + '/' + src;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ store, src, name: f.name, size: f.size ?? 0, type: f.type ?? '', pages: f.pages ?? null, sha256: f.sha256 ?? null });
    }
  }
  return out;
}

/** A step named by Claude or the learner: its id, its exact title, or a title that contains the words. */
export function findStep(c: Roadmap, q: string): string | null {
  if (Object.prototype.hasOwnProperty.call(c.nodes, q)) return q;
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const ids = Object.keys(c.nodes);
  return (
    ids.find(id => (c.nodes[id]?.title ?? '').toLowerCase() === s) ??
    ids.find(id => (c.nodes[id]?.title ?? '').toLowerCase().includes(s)) ??
    null
  );
}

/** A pack's card (KV a:packmeta:<id>) as the queue reads it. */
export interface PackMeta {
  id?: string;
  curriculum?: string;
  node?: string;
  updatedAt?: string;
  version?: string | null;
}
/** Saved already? The step's subject card is newer than the step's place in the queue. */
export const savedSince = (c: Roadmap, nid: string, meta: PackMeta | null | undefined): boolean =>
  !!meta &&
  meta.id === packId(c, nid) &&
  meta.curriculum === c.id &&
  meta.node === nid &&
  ms(meta.updatedAt) >= ms(c.nodes[nid]?.pack?.queuedAt);

export interface SettleOptions {
  claims?: readonly KvRow[];
  packs?: readonly KvRow[];
  /** 👥 what the other participants prepared / are preparing (engine/curshare.js remoteOf), for a shared Roadmap */
  remote?: Record<string, RemoteStep> | null;
  now: number;
  lease?: number;
  wait?: number;
}
/** The queue as it really is (the connector works on this): a queued step whose subject was saved after it was queued is
    prepared — even when an older copy put it back in the queue; a queued step with a live claim (or held by another
    participant) is being prepared. Returns a new record. */
export function settle(c: Roadmap, o: SettleOptions): Roadmap {
  const cc = clone(c),
    live = liveClaims(c.id, o.claims ?? [], o.now, o.lease ?? LEASE, o.wait ?? WAIT),
    saved = new Map<string, PackMeta>();
  const rem = o.remote && cc.shared && !cc.shared.ended ? o.remote : null;
  if (rem) cc.remote = rem;
  for (const r of o.packs ?? []) {
    let m: unknown = r.value;
    if (typeof m === 'string')
      try {
        m = JSON.parse(m);
      } catch {
        continue; // an unreadable card says nothing about the queue
      }
    const meta = m as PackMeta | null;
    if (meta?.curriculum === c.id && meta.node) saved.set(meta.node, meta);
  }
  for (const [nid, n] of Object.entries(cc.nodes)) {
    if (n.pack?.status !== 'app') continue;
    const meta = saved.get(nid);
    if (savedSince(cc, nid, meta)) {
      n.pack = { ...n.pack, status: 'ready', version: meta?.version ?? null };
      continue;
    }
    const x = rem?.[nid];
    if (x?.status === 'ready') {
      n.pack = { ...n.pack, status: 'ready', version: x.version ?? null, ...(x.by !== undefined ? { by: x.by } : {}) };
      continue;
    }
    if (x && !x.mine) {
      n.pack = { ...n.pack, claimedAt: x.at ?? new Date(o.now).toISOString(), ...(x.by !== undefined ? { by: x.by } : {}) };
      continue;
    }
    const t = live.get(nid);
    if (t !== undefined) n.pack = { ...n.pack, claimedAt: new Date(t).toISOString() };
  }
  return cc;
}

export type StepRefusal = { error: string };
/** Why a named step cannot be handed out as a step to prepare (English, for Claude), or 'plan' when it needs its plan first and
    this Roadmap's plans are Claude's, or null when it can be prepared. */
export function stepRefusal(c: Roadmap, nid: string, { force = false }: { force?: boolean } = {}): string | null {
  const n = c.nodes[nid];
  if (!n) return `No step “${nid}” in “${c.title ?? c.goal ?? c.id}”.`;
  if (n.pack?.assigned)
    return needsPlan(n) && isApp(c)
      ? 'plan'
      : `“${n.title}” is taught by “${n.pack.title ?? n.pack.id ?? ''}”, a subject the learner attached to it — it is not prepared.`;
  if (prepared(n)) return `“${n.title}” is already prepared.`;
  if (n.pack?.claimedAt && !force)
    return `“${n.title}” is being prepared by another run since ${n.pack.claimedAt} — do not prepare it twice. If that run has stopped without saving it, call noema_curriculum_task again with step and force = true.`;
  const r = c.remote?.[nid];
  if (c.shared && !c.shared.ended && r && (r.status === 'ready' || !r.mine))
    return `“${n.title}” ${r.status === 'ready' ? 'has been prepared' : 'is being prepared'} by ${r.by ?? 'another member'} of this shared Roadmap — do not prepare it again (the learner gets it on the map).`;
  if (!n.chapters?.length)
    return member(c)
      ? `“${n.title}” has no chapter plan yet — the owner of this shared Roadmap plans it first.`
      : isApp(c)
        ? 'plan'
        : `“${n.title}” has no chapter plan yet — open it in noema-lite and plan it first (✏️ Edit step).`;
  return null;
}

/** The queue entry of a step sent to the Claude app (prepare it there). */
export const queued = (c: Roadmap, nid: string, at: number): NonNullable<Step['pack']> => ({
  ...(c.nodes[nid]?.pack ?? {}),
  id: packId(c, nid),
  status: 'app',
  queuedAt: new Date(at).toISOString(),
  error: null,
  auto: false,
});

/** Queue every step for the Claude app in study order (a Roadmap Claude made with prepare = true). */
export function queueAll(c: Roadmap, now: number, only?: ReadonlySet<string>): void {
  order(c)
    .filter(id => !only || only.has(id))
    .forEach((id, i) => {
      const n = c.nodes[id];
      if (!n) return;
      n.pack = queued(c, id, now + i);
      n.reviewed = new Date(now).toISOString();
    });
}
