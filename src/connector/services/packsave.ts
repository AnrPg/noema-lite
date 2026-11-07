/* Saving a checked pack (noema_finish_upload, noema_save_pack): check everything that travels with it, then the saga
   "pack" registers it. Its steps, each recorded once done (services/sagas.ts):
     sources   the rows of the source-file index (noema_source_files) for the packaged files — they are all in storage by now
     register  the synced card a:packmeta:<subject> (the picker shows the subject from it)
   and for a step of a Roadmap
     inbox     the inbox entry that tells the app the step is saved (fixed key: written once)
     release   its claim ends (the inbox entry and the subject keep it out of the queue)
     publish   👥 a shared Roadmap: the step for the other participants (somebody else's version that came first stays theirs)
   or, with curriculum_id + step, `attach` (the inbox entry that puts the subject on that step).
   A failure never undoes what is saved: the subject stays registered, and the next call with the same pack resumes at the step
   that failed (the claim, held WAITING by noema_start_upload, lasts 72 h meanwhile). The idempotency key is the pack's
   content (+ curriculum_id and step): finishing the same upload twice registers it once, posts one inbox entry. */
import type { Pack, PackCheckResult } from '../engine/api.ts';
import { fail, text, type ToolContext, type ToolResult } from '../tool.ts';
import { message, sha256Hex } from '../util.ts';
import { attachToStep, curState, findStep, releaseStep, sharedOn, type StepRef } from './curricula.ts';
import { activityFileStatus, actCurl, languagesTodo, packaged, sourceFileRows, sourceFileStatus, translationStatus, trCurl, trNamed, uploadCommands, withTranslations, type Known } from './packfiles.ts';
import { roadmapTodoText } from './roadmap.ts';
import { sagaKey } from './sagas.ts';
import { nameOf } from './supabase.ts';

export const summary = (p: Pack, r: PackCheckResult): string => `✅ “${p.subject.title}” (${p.subject.id}) is in the noema-lite account: ${r.counts.chapters} chapters, ${r.counts.sections} sections, ${r.counts.exercises} exercises (${r.counts.visual} visual), ${r.counts.media} pictures.` +
  `\nThe learner's app gets it the next time it opens (or after tapping ☁️ → Sync now).` + (r.warnings.length ? `\n⚠️ Warnings:\n- ${r.warnings.slice(0, 20).join('\n- ')}` : '');

export const packmetaKey = (sid: string): string => 'a:packmeta:' + sid;

/** The synced card of the subject → its updatedAt (the saga's proof that the card is the one it wrote). */
async function register(ctx: ToolContext, p: Pack, counts: PackCheckResult['counts'], extra: Record<string, unknown>): Promise<string> {
  const updatedAt = new Date().toISOString();
  const meta = { ...p.subject, counts: { ...(p.counts ?? {}), ...counts }, version: p.version ?? null, ...(p.translations ? { contentLocales: Object.keys(p.translations) } : {}), via: 'claude', updatedAt, ...extra };
  await ctx.kv.put(packmetaKey(p.subject.id), meta);
  return updatedAt;
}

/** 👥 A step of a shared curriculum is saved → the other participants get it (the pack now; its source files follow when the
    learner's app opens — it publishes them with the step). Somebody else's version that came first stays the shared one. */
async function publishStep(ctx: ToolContext, step: StepRef, p: Pack, files: number): Promise<string> {
  const CS = ctx.engine.curShare, CUR = ctx.engine.curriculum; if (!CS) return '';
  const { c, nid } = step, path = CS.core.stepPath(c.id, ctx.uid, nid);
  try {
    const cur = await CS.core.row(ctx.sb.api, c.id, nid);
    if (cur && cur.author !== ctx.uid && (cur.status === 'ready' || Date.parse(cur.claimed_until ?? '') > Date.now())) return `\n👥 ${cur.author_name || 'Another member'} had already ${cur.status === 'ready' ? 'prepared' : 'started'} this step of the shared curriculum — theirs is the shared version; this one stays in the learner's own account.`;
    await ctx.storage.writeJson(path, JSON.stringify(p), { bucket: CS.BUCKET });
    const r = await CS.core.ready(ctx.sb.api, { cid: c.id, nid, me: ctx.uid, name: nameOf(step.user), packId: CUR.packId(c, nid), version: p.version ?? null, path, meta: { chunks: 0, counts: p.counts ?? null, sharedFiles: {}, filePaths: [], sourceFiles: files, filesPending: files > 0 } });
    if (!r.ok) return `\n👥 ${r.row?.author_name || 'Another member'} prepared this step a moment earlier — theirs is the shared version; this one stays in the learner's own account.`;
    return `\n👥 Shared: every member of “${c.title || c.goal}” sees this step on their map now.`;
  } catch (e) { return `\n⚠️ Saved for the learner, but sharing it with the curriculum's members failed (${message(e).slice(0, 120)}) — the learner's app tries again when it opens.`; }
}

/** The pack is stored and valid: check its packaged files, then save it — or say which files to upload. */
export async function completePack(ctx: ToolContext, sid: string, p: Pack, res: PackCheckResult, attach: { curriculum_id: string; step: string }, content: string): Promise<ToolResult> {
  const need = packaged(p), CJ = ctx.engine.curJobs, CUR = ctx.engine.curriculum;
  const step = await findStep(ctx, sid).catch(() => null);   // a step of one of the learner's curricula?
  if (step) step.user = ctx.user;
  const known: Known = new Map(step ? Object.entries(step.c.files ?? {}).filter(([, f]) => f.sha256).map(([fid, f]) => [f.sha256 as string, { subj: CUR.curStore(step.c.id), src: fid }]) : []);
  if (need.length) {
    const st = await sourceFileStatus(ctx, sid, need, known);
    if (st.missing.length) {
      return fail(`The pack is valid, but ${st.missing.length} of its ${need.length} source file(s) are not in the account yet: ${st.missing.map(x => x.id).join(', ')}.\n` +
        `The learner must get exactly the files the pack was built from (each part of a split PDF), so the subject is NOT saved yet. Upload them — run in your sandbox, from the folder that contains work/ (adjust the paths if your files are elsewhere; they are also inside ${sid}.noema.zip):\n\n` +
        await uploadCommands(ctx, sid, st.missing) + `\n\nThen call noema_finish_upload with subject_id "${sid}" again.`);
    }
  }
  const as = await activityFileStatus(ctx, sid, p);   // h5p@1: the activities' .h5p files beside the pack
  if (as.errors.length) return fail(`The pack is valid, but ${as.errors.length} problem(s) were found in its H5P activities' files — fix them (python3 scripts/activity_lint.py work/${sid}), rebuild with make_pack.py and upload them again:\n- ${as.errors.slice(0, 20).join('\n- ')}`);
  if (as.missing.length) return fail(`The pack is valid, but ${as.missing.length} of its H5P activities' files are not in the account yet (or have another size): ${as.missing.map(a => a.id).join(', ')}. The subject is NOT saved yet. Upload them — run in your sandbox, from the folder that contains work/ (they are also inside ${sid}.noema.zip):\n\n` +
    (await Promise.all(as.missing.map(a => actCurl(ctx, sid, a)))).join('\n\n') + `\n\nThen call noema_finish_upload with subject_id "${sid}" again.`);
  const ts = await translationStatus(ctx, sid, p);
  if (ts.bad.length) return fail(`The pack is valid, but ${ts.bad.length} of its translations do not match it — fix them (same ids, sections, answers and code as the pack), rebuild with make_pack.py and upload them again:\n- ${ts.bad.join('\n- ')}`);
  if (ts.missing.length) return fail(`The pack is valid, but ${ts.missing.length} of its translations are not in the account yet: ${ts.missing.join(', ')}. The subject is NOT saved yet. Upload them — run in your sandbox, from the folder that contains work/ (make_pack.py wrote them to work/${sid}/build/):\n\n` +
    (await Promise.all(ts.missing.map(loc => trCurl(ctx, sid, loc)))).join('\n\n') + `\n\nThen call noema_finish_upload with subject_id "${sid}" again.`);

  const key = sagaKey('pack', sid, (await sha256Hex(content + '\n' + attach.curriculum_id + '\n' + attach.step)).slice(0, 32));
  const seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);   // the inbox entries' key: time-ordered, fixed by the saga
  try {
    const out = await ctx.sagas.run<string>('pack', key, async s => {
      if (need.length) await s.step('sources', async () => { await ctx.sourceFiles.put(sid, sourceFileRows(ctx, need, known)); return need.length; });
      await s.step('register', () => register(ctx, p, res.counts, step ? { curriculum: step.c.id, node: step.nid, ...(step.c.title !== undefined ? { curTitle: step.c.title } : {}) } : {}));
      let more = '';
      if (step) {
        await s.step('inbox', async () => { const k = CJ.inboxKey(step.c.id, seq); await ctx.kv.put(k, { v: 1, kind: 'step', nid: step.nid, packId: sid, version: p.version ?? null, at: new Date().toISOString(), via: 'claude-app' }); return k; });
        await s.step('release', async () => { await releaseStep(ctx, step.c.id, step.nid).catch(() => undefined); return true; });
        if (sharedOn(ctx, step.c)) more += await s.step('publish', async () => publishStep(ctx, step, await withTranslations(ctx, sid, p), need.length));
        const st = await curState(ctx, step.c, ctx.uid), left = CJ.work(st).steps.length;
        more += `\n🧭 This is the step “${step.c.nodes[step.nid]?.title}” of the curriculum “${step.c.title}”: it appears ready on the learner's map by itself (the app picks it up when it is open or next opened).` + (left ? `\n${left} more step(s) are queued — call noema_curriculum_task with curriculum_id "${step.c.id}" for the next one, if the learner asked for more.` : '') + roadmapTodoText(ctx.engine, st, { only: step.nid });
      } else if (attach.step) {
        more += await s.step('attach', async () => {
          const a = await attachToStep(ctx, sid, p, attach.curriculum_id, attach.step, cid => CJ.inboxKey(cid, seq)).catch((e: unknown) => ({ error: message(e) }));
          return a.error !== undefined ? `\n⚠️ Saved, but not attached to a step: ${a.error}\n📚 Until then it is on the learner's Shelf.` : '\n' + a.line;
        });
      } else more += `\n📚 It is not on a step of any of the learner's curricula, so it is on their 📚 Shelf (study it from there, or “Put on a map…”). To attach it to a step of a curriculum, call this tool again with curriculum_id and step.`;
      more += await languagesTodo(ctx, p).catch(() => '');
      return summary(p, res) + (need.length ? `\n📎 ${need.length} source file(s) attached — the learner opens them with 👁 in 📚 Sources, at the cited pages.` : '') + (trNamed(p).length ? `\n🌐 Translations: ${trNamed(p).join(', ')}.` : '') + more;
    }, { stillDone: async () => (await ctx.kv.has(packmetaKey(sid))) });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(sid));
  } catch (e) {
    return fail(`Saving “${p.subject.title}” stopped: ${message(e).slice(0, 300)}\nWhat is saved stays saved (the source files and the subject's card, if that step was reached); call noema_finish_upload with subject_id "${sid}" again — it goes on from the step that failed.`);
  }
}

export const REPLAYED = '\n(This upload was already saved by an earlier call: nothing was written again.)';
export const BUSY = (what: string): string => `“${what}” is being saved by another call right now — wait a moment and call again (it then reports what that call saved).`;
