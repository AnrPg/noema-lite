/* Curricula (Roadmaps) as the connector sees them (docs/CURRICULUM.md §7–§10): the app's own code decides the tasks, the
   checks and how an answer changes a curriculum (engine/curriculum.js, curjobs.js, curshare.js); the connector writes only
   inbox entries (a:curin:…) the app applies, the claims of runs (a:curclaim:…) and — with a compare-and-swap — a Roadmap's
   translations. Claims: a step handed out is claimed atomically (inserted if free, taken over only when it ran out: 4 h,
   72 h while its upload waits — CJ.leaseOf); 👥 in a shared curriculum it is also reserved among the participants. */
import type { Curriculum, CurNode, Download, Pack, SharedFile } from '../engine/api.ts';
import type { ToolContext } from '../tool.ts';
import { nameOf, type AuthUser } from './supabase.ts';
import { extOf, parseJson, safeSeg } from '../util.ts';
import { partNames } from './packfiles.ts';

export const sharedOn = (ctx: ToolContext, c: Curriculum | null | undefined): boolean => !!(c?.shared && !c.shared.ended && ctx.engine.curShare);

export async function curricula(ctx: ToolContext): Promise<Curriculum[]> {
  const out: Curriculum[] = [];
  for (const r of await ctx.kv.rows('a:curriculum:')) { const c = parseJson(r.value) as Curriculum | undefined; if (c?.format === 'noema.curriculum/v1' && c.nodes) out.push(c); }
  return out.sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')));
}

/** The curriculum as it will be once the app has applied the answers still waiting in the inbox — with its queue as it really
    is: steps whose subject is saved already are prepared, steps claimed by a run that is building them are taken. */
export async function curState(ctx: ToolContext, c: Curriculum, uid: string | null = null): Promise<Curriculum> {
  const CJ = ctx.engine.curJobs, CS = ctx.engine.curShare;
  const [inbox, claims, packs, remote] = await Promise.all([ctx.kv.rows(`${CJ.IN}${c.id}:`), ctx.kv.rows(`${CJ.CLAIM}${c.id}:`), ctx.kv.rows(`a:packmeta:cur-${c.id.slice(1, 7)}-`),
    sharedOn(ctx, c) && CS ? CS.core.rows(ctx.sb.api, c.id).catch(() => null) : Promise.resolve(null)]);
  return CJ.settle(CJ.merged(c, inbox), { claims, packs, remote, me: uid });
}

export const releaseStep = (ctx: ToolContext, cid: string, nid: string): Promise<void> => ctx.kv.delete(ctx.engine.curJobs.claimKey(cid, nid));

/** Claim a step for this run — atomically, so two runs that ask at the same moment never get the same step: insert the claim
    if there is none; else take it over (compare-and-swap on the version read) only when it has run out, or with force. */
export async function claimStep(ctx: ToolContext, cid: string, nid: string, { force = false, c = null, user = null }: { force?: boolean; c?: Curriculum | null; user?: AuthUser | null } = {}): Promise<boolean> {
  const CJ = ctx.engine.curJobs, key = CJ.claimKey(cid, nid);
  const value = JSON.stringify({ v: 1, nid, at: new Date().toISOString(), run: Math.random().toString(36).slice(2, 10) });
  let mine = false;
  for (let i = 0; i < 3 && !mine; i++) {
    if (await ctx.kv.insert(key, value)) { mine = true; break; }
    const row = await ctx.kv.row(key);
    if (!row) continue;   // released between the two requests: insert again (never a write without the version it read)
    if (!force && !CJ.claimExpired(row)) break;
    mine = !!(await ctx.kv.swap(key, row.updated_at, value));
  }
  const CS = ctx.engine.curShare;
  if (mine && c && sharedOn(ctx, c) && CS) {   // 👥 also reserved among the participants (somebody else may have it — then not this one)
    const r = await CS.core.claim(ctx.sb.api, { cid, nid, me: ctx.uid, name: nameOf(user), packId: ctx.engine.curriculum.packId(c, nid) }).catch(() => ({ ok: false }));
    if (!r.ok) { await releaseStep(ctx, cid, nid).catch(() => undefined); return false; }
  }
  return mine;
}

export interface StepRef { c: Curriculum; nid: string; user?: AuthUser | null; shared?: boolean; sharedBy?: string | null }

export async function findStep(ctx: ToolContext, sid: string): Promise<StepRef | null> {
  const m = /^cur-([a-z0-9]{1,6})-/.exec(sid); if (!m) return null;
  for (const r of await ctx.kv.rows('a:curriculum:c' + m[1])) {
    const c = parseJson(r.value) as Curriculum | undefined; if (!c?.nodes) continue;
    const nid = Object.keys(c.nodes).find(id => ctx.engine.curriculum.packId(c, id) === sid); if (nid) return { c, nid };
  }
  return null;
}
/** A step the map does not have yet but its inbox does (a new part, noema_extend_roadmap, before the app merged it). */
export async function findInboxStep(ctx: ToolContext, sid: string): Promise<StepRef | null> {
  const m = /^cur-([a-z0-9]{1,6})-/.exec(sid); if (!m) return null;
  for (const r of await ctx.kv.rows('a:curriculum:c' + m[1])) {
    const c = parseJson(r.value) as Curriculum | undefined; if (!c?.nodes) continue;
    const mc = ctx.engine.curJobs.merged(c, await ctx.kv.rows(`${ctx.engine.curJobs.IN}${c.id}:`));
    const nid = Object.keys(mc.nodes ?? {}).find(id => ctx.engine.curriculum.packId(mc, id) === sid); if (nid) return { c: mc, nid };
  }
  return null;
}
/** The step a pack teaches (made for it, or attached to it). */
export async function stepOfPack(ctx: ToolContext, sid: string): Promise<StepRef | null> {
  const s = await findStep(ctx, sid).catch(() => null); if (s) return s;
  for (const c of await curricula(ctx)) { const nid = Object.keys(c.nodes ?? {}).find(id => c.nodes[id]?.pack?.id === sid); if (nid) return { c, nid }; }
  return null;
}

/** The pack of a Roadmap step is built and its upload starts (noema_start_upload): the step's claim becomes WAITING (72 h,
    renewed by every new start), so while the network blocks the upload and the run goes on to other steps (docs/PIPELINES.md
    §1b) no run builds this step again. The claim still ends when the step is saved. 👥 A shared reservation is renewed as long. */
export async function holdStep(ctx: ToolContext, sid: string, user: AuthUser | null = null): Promise<StepRef | null> {
  const step = await findStep(ctx, sid).catch(() => null) ?? await findInboxStep(ctx, sid).catch(() => null); if (!step) return null;
  const CJ = ctx.engine.curJobs, CS = ctx.engine.curShare;
  await ctx.kv.put(CJ.claimKey(step.c.id, step.nid), { v: 1, nid: step.nid, at: new Date().toISOString(), waiting: true, packId: sid });
  if (sharedOn(ctx, step.c) && CS) {   // → step.shared false: the other members' reservation could not be renewed (said in the reply)
    const r = await CS.core.claim(ctx.sb.api, { cid: step.c.id, nid: step.nid, me: ctx.uid, name: nameOf(user), packId: sid, lease: CJ.WAIT }).catch(() => ({ ok: false, row: undefined }));
    step.shared = !!r.ok; step.sharedBy = r.row?.author && r.row.author !== ctx.uid ? r.row.author_name ?? '' : null;
  }
  return step;
}

export async function pickCurriculum(ctx: ToolContext, id: string, { any = false }: { any?: boolean } = {}): Promise<{ c: Curriculum; error?: undefined } | { error: string; c?: undefined }> {
  const all = await curricula(ctx);
  if (!all.length) return { error: 'This account has no curriculum yet. In noema-lite: 🧭 Curricula → ➕ New curriculum or 📥 Import a map (choose “Claude app” as the AI).' };
  if (id) { const c = all.find(x => x.id === id) ?? all.find(x => (x.title || x.goal || '').toLowerCase() === id.toLowerCase()); return c ? { c } : { error: `No curriculum “${id}”. The learner's curricula:\n${all.map(x => `- ${x.id}: “${x.title || x.goal}”`).join('\n')}` }; }
  const states = await Promise.all(all.map(c => curState(ctx, c)));
  if (any && all.length === 1 && all[0]) return { c: all[0] };   // a question about the map itself: the only Roadmap, busy or not
  const busy = states.filter(c => !ctx.engine.curJobs.work(c).done);
  const only = busy.length === 1 ? all.find(x => x.id === busy[0]?.id) : undefined;
  if (!any && only) return { c: only };
  return { error: `Which curriculum? Call again with curriculum_id:\n${states.map(c => workLine(ctx, c)).join('\n')}` };
}

export function workLine(ctx: ToolContext, c: Curriculum): string {
  const w = ctx.engine.curJobs.work(c); const bits: string[] = [];
  const title = (id: string): string => '“' + (c.nodes[id]?.title ?? id) + '”';
  if (w.graph) bits.push(`its map is being built (next: ${w.graph === 'dag' ? 'agent 1, the map' : w.graph === 'audit' ? 'agent 1b, the prerequisite check' : 'agent 2, the goal in depth'})`);
  if (w.toPlan.length) bits.push(`${w.toPlan.length} step(s) need their chapter plan`);
  if (w.steps.length) bits.push(`${w.steps.length} step(s) queued to prepare: ${w.steps.slice(0, 5).map(title).join(', ')}${w.steps.length > 5 ? '…' : ''}`);
  if (w.claimed.length) bits.push(`${w.claimed.length} step(s) being prepared by another run right now: ${w.claimed.slice(0, 5).map(title).join(', ')}${w.claimed.length > 5 ? '…' : ''}`);
  const n = Object.keys(c.nodes).length, ready = Object.values(c.nodes).filter(x => x.pack?.status === 'ready').length;
  const sh = c.shared && !c.shared.ended ? (c.shared.role === 'member' ? ` · 👥 shared by ${c.shared.ownerName || 'its owner'}` : ' · 👥 shared by the learner') : '';
  return `- “${c.title || c.goal}” — curriculum_id ${c.id}${sh} · ${n} steps${(c.parts ?? []).length > 1 ? ` in ${(c.parts ?? []).length} parts` : ''}, ${ready} prepared · made with ${c.provider === 'claudeapp' ? 'the Claude app' : 'noema-lite (API key / Gemini)'}\n  ${bits.length ? 'To do: ' + bits.join('; ') : 'nothing waiting for you'}`;
}

/** 📦 Attach a saved subject to a step of one of the learner's curricula (docs/CURRICULUM.md §9): the app applies it from the
    inbox (Edit.assign) — the step is taught by this subject from then on, and only that step is re-planned to match it.
    keyOf(cid): the key of the inbox entry (the saga that calls this gives a fixed one, so a repeated call writes it once). */
export async function attachToStep(ctx: ToolContext, sid: string, p: Pack, cidArg: string, stepArg: string, keyOf: (cid: string) => string): Promise<{ line: string; error?: undefined } | { error: string; line?: undefined }> {
  if (!cidArg) return { error: 'curriculum_id is needed with step (see noema_curricula).' };
  const pc = await pickCurriculum(ctx, cidArg); if (pc.error !== undefined) return { error: pc.error };
  const CUR = ctx.engine.curriculum;
  const c = await curState(ctx, pc.c, ctx.uid), s = stepArg.trim().toLowerCase();
  const nid = c.nodes[stepArg] ? stepArg : Object.keys(c.nodes).find(id => c.nodes[id]?.title.toLowerCase() === s) ?? Object.keys(c.nodes).find(id => c.nodes[id]?.title.toLowerCase().includes(s));
  const n: CurNode | undefined = nid ? c.nodes[nid] : undefined;
  if (!nid || !n) return { error: `No step “${stepArg}” in “${c.title || c.goal}”. Its steps: ${Object.keys(c.nodes).slice(0, 60).map(id => `${id} (“${c.nodes[id]?.title}”)`).join(', ')}` };
  const no = CUR.Edit?.cannotAssign?.(c, n);
  if (no) return { error: no };
  if (n.pack?.assigned && n.pack.id === sid) return { line: `📦 It already teaches the step “${n.title}” of “${c.title || c.goal}”.` };
  const chs = p.chapters ?? [];
  await ctx.kv.put(keyOf(c.id), { v: 1, kind: 'assign', nid, packId: sid, from: 'claude', at: new Date().toISOString(), title: p.subject.title, description: String(p.subject.description ?? '').slice(0, 400), outline: CUR.outlineOf(p),
    sections: chs.flatMap(ch => (ch.sections ?? []).map(x => x.id)), exercises: chs.reduce((a, ch) => a + (ch.exercises ?? []).length, 0), chapters: chs.length });
  return { line: `📦 Attached to the step “${n.title}” of “${c.title || c.goal}”: that step is taught by this subject from now on (it is never prepared), and only that step is re-planned to match it${sharedOn(ctx, c) ? ' (for this learner only: the curriculum is shared, its other members keep the shared step)' : ''} — the learner's app applies it when it is open or next opened${c.provider === 'claudeapp' ? '; then noema_curriculum_task hands you its new chapter plan' : ''}.` };
}

/** How Claude gets one of the learner's files into its sandbox (signed links, 2 h; big files are stored in parts). */
export async function downloadLines(ctx: ToolContext, dir: string, downloads: Download[], shared: Record<string, SharedFile> | null = null): Promise<string[]> {
  const out: string[] = [], index: Record<string, Record<string, { cloud?: boolean; name?: string; size?: number; chunks?: number }>> = {};
  const CS = ctx.engine.curShare;
  const fetchLines = (urls: string[], local: string): string => urls.length === 1 ? `  curl -sSL -o "${local}" "${urls[0]}"` : urls.map((u, i) => `  curl -sSL -o "/tmp/noema-part.${String(i).padStart(3, '0')}" "${u}"`).join('\n') + `\n  cat /tmp/noema-part.* > "${local}" && rm /tmp/noema-part.*`;
  for (const d of downloads) {
    index[d.store] ??= await ctx.sourceFiles.of(d.store).catch(() => ({}));
    const meta = index[d.store]?.[d.src];
    const local = `${dir}/${String(d.name).replace(/["$`\\]/g, '_')}`;
    const sf = !meta?.cloud && shared?.[d.src] && /^curfiles-/.test(d.store) ? shared[d.src] : null;   // 👥 a member: the owner's copy in the shared curriculum
    if (sf && CS) {
      const urls: string[] = [];
      for (const pth of partNames(sf.path, sf.chunks ?? 0)) urls.push(await ctx.storage.downloadUrl(pth, 7200, CS.BUCKET));
      out.push(`- ${d.name} (${((d.size || sf.size || 0) / 1048576).toFixed(1)} MB${d.pages ? `, ${d.pages} pages` : ''}, from the shared curriculum):\n  mkdir -p "${dir}"\n` + fetchLines(urls, local));
      continue;
    }
    if (!meta?.cloud) { out.push(`- ${d.name}: ⚠️ not in the learner's cloud yet (it is uploaded when noema-lite is open on the device where it was added). Ask the learner to attach it to this chat, or build the step without it and say so.`); continue; }
    const base = `${ctx.uid}/sources/${d.store}/${safeSeg(d.src)}/file.${extOf(meta.name || d.name)}`;
    const urls: string[] = [];
    for (const pth of partNames(base, meta.chunks ?? 0)) urls.push(await ctx.storage.downloadUrl(pth, 7200));
    out.push(`- ${d.name} (${((d.size || meta.size || 0) / 1048576).toFixed(1)} MB${d.pages ? `, ${d.pages} pages` : ''}):\n  mkdir -p "${dir}"\n` + fetchLines(urls, local));
  }
  out.push('(The links are valid for 2 hours. If your sandbox cannot reach them, ask the learner to attach the files to this chat.)');
  return out;
}
