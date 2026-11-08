/* noema-lite — a restructuring proposal approved by the learner (or declined): docs/CURRICULUM.md §11.3.
   Everything is read and checked first (the plan against the Roadmap as it is now, every pack it cuts or joins, the counts of
   chapters, sections, exercises, cards, translated chapters and bridge parts before = after); only then is anything written —
   the new packs first, then the changed ones, then the packs joined into others are removed. The caller saves the Roadmap
   it gets back. The learning log gets roadmap.restructured with every item that changed subject. */
import { ok, err, type AsyncResult } from '../../../kernel/result.ts';
import { NoemaError } from '../../../kernel/errors.ts';
import type { Proposal, Roadmap } from '../domain/model.ts';
import { clone } from '../domain/model.ts';
import {
  applyRestructure,
  bundleCounts,
  chapterMap,
  mergeBundles,
  mergeStates,
  setBundleLevels,
  splitBundle,
  splitState,
  type BundleCounts,
  type PackBundle,
  type ProgressState,
} from '../domain/restructure.ts';
import { restructured, type Restructured } from '../domain/events.ts';
import type { RoadmapEventLog, RoadmapPacks } from './ports.ts';

export interface Applied {
  readonly roadmap: Roadmap;
  readonly before: BundleCounts;
  readonly after: BundleCounts;
  readonly event: Restructured;
}

const fail = (message: string, params: Record<string, string> = {}): NoemaError =>
  new NoemaError('roadmap.restructure', message, { params: { detail: message, ...params } });

/** Apply the pending proposal `id` of a Roadmap. → the new Roadmap (with the proposal marked applied), or why not. */
export async function applyProposal(
  account: string,
  c: Roadmap,
  id: string,
  deps: { packs: RoadmapPacks; log: RoadmapEventLog; now: number },
): AsyncResult<Applied> {
  const p = (c.proposals ?? []).find(x => x.id === id);
  if (p?.status !== 'pending') return err(fail(`no pending proposal "${id}"`));
  const r = applyRestructure(c, p.plan, deps.now);
  if (!r.ok) return err(fail(r.error.join('; ')));
  const { roadmap, packs: ops } = r.value;
  const writes: { bundle: PackBundle; node: string; state?: ProgressState }[] = [],
    removes: string[] = [],
    moves: { item: string; from: string; to: string }[] = [],
    before: PackBundle[] = [],
    after: PackBundle[] = [];
  const load = async (pack: string): AsyncResult<PackBundle> => {
    const b = await deps.packs.load(account, pack);
    return b.ok ? b : err(fail(`the subject ${pack} could not be read`, { pack }));
  };
  for (const s of ops.split) {
    const b = await load(s.pack);
    if (!b.ok) return b;
    const m = chapterMap(c.nodes[s.step]?.chapters ?? [], b.value.pack);
    if (!m.ok)
      return err(fail(`the subject of “${c.nodes[s.step]?.title ?? s.step}” does not follow its chapter plan (${m.error.join(', ')})`));
    const ids = (refs: readonly string[]): string[] => refs.map(x => m.value.get(x)).filter((x): x is string => !!x);
    const parts = s.parts.map(q => ({
      pack: q.pack,
      title: q.title,
      chapters: ids(q.chapters),
      levels: q.levels,
      node: { id: c.id, node: q.step },
    }));
    const cut = splitBundle(b.value, parts);
    if (!cut.ok) return err(fail(cut.error.join('; ')));
    const states = splitState(
      deps.packs.state(account, s.pack),
      cut.value.map(x => x.pack.chapters),
    );
    before.push(b.value);
    cut.value.forEach((x, k) => {
      const q = s.parts[k];
      if (!q) return;
      after.push(x);
      writes.push({ bundle: x, node: q.step, ...(states[k] ? { state: states[k] } : {}) });
      if (k > 0) for (const ch of x.pack.chapters) moves.push({ item: ch.id, from: s.pack, to: q.pack });
    });
  }
  for (const mg of ops.merge) {
    const into = await load(mg.pack);
    if (!into.ok) return into;
    const others: PackBundle[] = [];
    for (const f of mg.from) {
      const b = await load(f.pack);
      if (!b.ok) return b;
      others.push(b.value);
    }
    const joined = mergeBundles(into.value, others, { ...(mg.title ? { title: mg.title } : {}), levels: mg.levels });
    if (!joined.ok) return err(fail(joined.error.join('; ')));
    before.push(into.value, ...others);
    after.push(joined.value);
    const state = mergeStates([deps.packs.state(account, mg.pack), ...mg.from.map(f => deps.packs.state(account, f.pack))]);
    writes.push({ bundle: joined.value, node: mg.step, state });
    for (const [k, f] of mg.from.entries()) {
      removes.push(f.pack);
      for (const ch of others[k]?.pack.chapters ?? []) moves.push({ item: ch.id, from: f.pack, to: mg.pack });
    }
  }
  for (const lv of ops.levels) {
    const b = await load(lv.pack);
    if (!b.ok) return b;
    const m = chapterMap(c.nodes[lv.step]?.chapters ?? [], b.value.pack);
    const byId: Record<string, string | null> = {};
    if (m.ok)
      for (const [ref, level] of Object.entries(lv.chapters)) {
        const pid = m.value.get(ref);
        if (pid) byId[pid] = level;
      }
    else if (Object.values(lv.chapters).some(x => x !== null))
      return err(fail(`the subject of “${c.nodes[lv.step]?.title ?? lv.step}” does not follow its chapter plan (${m.error.join(', ')})`));
    const x = setBundleLevels(b.value, lv.levels, byId);
    before.push(b.value);
    after.push(x);
    writes.push({ bundle: x, node: lv.step });
  }
  const b0 = bundleCounts(before),
    a0 = bundleCounts(after);
  if (JSON.stringify(b0) !== JSON.stringify(a0))
    return err(fail(`the restructuring would lose material (before ${JSON.stringify(b0)}, after ${JSON.stringify(a0)})`));
  // every check passed: write — new packs first (nothing points at them yet), then the changed ones, then remove the joined
  const isNew = (w: { bundle: PackBundle }): boolean => !Object.values(c.nodes).some(n => n.pack?.id === w.bundle.pack.subject.id);
  for (const w of [...writes.filter(isNew), ...writes.filter(x => !isNew(x))]) {
    const title = roadmap.nodes[w.node]?.title ?? w.bundle.pack.subject.title;
    const s = await deps.packs.save(account, w.bundle, { roadmap: c.id, node: w.node, title: roadmap.title ?? title });
    if (!s.ok) return s;
    if (w.state) {
      const st = await deps.packs.setState(account, w.bundle.pack.subject.id, w.state);
      if (!st.ok) return st;
    }
  }
  for (const pack of removes) {
    const x = await deps.packs.remove(account, pack);
    if (!x.ok) return x;
  }
  // the steps' pack cards follow the packs they now have
  for (const w of writes) {
    const n = roadmap.nodes[w.node];
    if (!n?.pack) continue;
    const chs = w.bundle.pack.chapters;
    n.pack = {
      ...n.pack,
      id: w.bundle.pack.subject.id,
      status: 'ready',
      sections: chs.flatMap(ch => (ch.sections ?? []).map(s => s.id)),
      exercises: chs.reduce((a, ch) => a + (ch.exercises?.length ?? 0), 0),
      chapters: chs.length,
    };
  }
  const event = restructured(c.id, id, moves, deps.now);
  const logged = await deps.log.append(account, [event]);
  if (!logged.ok) return logged;
  roadmap.proposals = (roadmap.proposals ?? []).map(x => (x.id === id ? decided(x, 'applied', deps.now) : x));
  return ok({ roadmap, before: b0, after: a0, event });
}

/** Decline the pending proposal `id` (nothing changes but the proposal) → the new Roadmap. */
export function declineProposal(c: Roadmap, id: string, now: number): Roadmap {
  const out = clone(c);
  out.proposals = (out.proposals ?? []).map(x => (x.id === id && x.status === 'pending' ? decided(x, 'declined', now) : x));
  return out;
}

const decided = (p: Proposal, status: 'applied' | 'declined', now: number): Proposal => ({
  ...p,
  status,
  decidedAt: new Date(now).toISOString(),
});
