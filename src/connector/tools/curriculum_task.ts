/* noema_curriculum_task — the next task of a curriculum as complete instructions (a step is claimed for this run before it is handed out) */
import { argFlag, argStr, fail, text, type Tool } from '../tool.ts';
import { claimStep, curState, downloadLines, pickCurriculum, sharedOn } from '../services/curricula.ts';
import type { Task } from '../engine/api.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_curriculum_task",
    "description": "The next piece of work on a curriculum, as complete instructions: an agent task of the map (answer with noema_curriculum_submit), a batch of chapter plans (same), or a step to prepare as a subject pack (build it with the noema-pack-builder workflow and save it with noema_start_upload/noema_finish_upload under the given subject_id). A step handed to you is claimed for you: other runs skip it until you save it (or for 4 hours; 72 hours once noema_start_upload was called for its pack, so a step whose upload waits is not built twice), so each queued step is prepared once — prepare the step you got. When the learner only asks what is next, pass peek = true. Call it again after each accepted answer or saved step — or after a step whose upload the network blocked (it waits; retry every waiting upload together at the end).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "curriculum_id": {
          "type": "string",
          "description": "from noema_curricula (may be omitted when only one curriculum has work)"
        },
        "want": {
          "type": "string",
          "enum": [
            "any",
            "map",
            "plan",
            "step"
          ],
          "description": "only this kind of work (default any: map first, then plans, then queued steps)"
        },
        "step": {
          "type": "string",
          "description": "prepare this step (id or title) even if it is not queued"
        },
        "peek": {
          "type": "boolean",
          "description": "true = only SAY what is next (the learner asked what is next, you will not do it now): the step is not claimed, so another run can still take it"
        },
        "force": {
          "type": "boolean",
          "description": "with step: take over a step that another run claimed but stopped preparing without saving"
        }
      }
    }
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id')); if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    const CJ = ctx.engine.curJobs, CS = ctx.engine.curShare;
    const c = await curState(ctx, pk.c, ctx.uid), force = argFlag(args, 'force'), peek = argFlag(args, 'peek'), want = argStr(args, 'want'), stepArg = argStr(args, 'step');
    let t: Task | null = null;
    for (let tries = 0; tries < 8; tries++) {   // a step is handed out only once it is claimed for this run (another run may claim it a moment earlier → the next one)
      t = CJ.next(c, { want: want || 'any', step: stepArg, force });
      if (!t || t.error || t.kind !== 'step') break;
      if (peek) return text(`Next step (not claimed — peek): “${t.stepTitle}” (${t.nid}) · subject_id ${t.packId}. ${CJ.work(c).steps.length} step(s) queued in all. To prepare it, call noema_curriculum_task again without peek.`);
      if (await claimStep(ctx, c.id, t.nid, { force: force && !!stepArg, c, user: ctx.user })) break;
      if (stepArg) { const x = sharedOn(ctx, c) && CS ? await CS.core.row(ctx.sb.api, c.id, t.nid).catch(() => null) : null; t = { ...t, error: x && x.author !== ctx.uid ? `“${t.stepTitle}” is ${x.status === 'ready' ? 'prepared' : 'being prepared'} by ${x.author_name || 'another member'} of this shared curriculum — do not prepare it again.` : `“${t.stepTitle}” has just been taken by another run — do not prepare it twice. If that run has stopped without saving it, call again with force = true.` }; break; }
      const n = c.nodes[t.nid]; if (n) n.pack = { ...n.pack, claimedAt: new Date().toISOString() }; t = null;
    }
    if (t?.error) return fail(t.error);
    if (!t) {
      const busy = CJ.work(c).claimed;
      return text(`✅ Nothing is waiting in “${c.title || c.goal}”${want && want !== 'any' ? ` (${want})` : ''}. ` + (busy.length ? `${busy.length} queued step(s) are being prepared by other runs right now (${busy.slice(0, 5).map(id => '“' + (c.nodes[id]?.title ?? id) + '”').join(', ')}) — do NOT prepare them again; stop here. ` : '') + (CJ.isApp(c) ? 'Steps reach this queue when the learner opens them on the map (or the app queues the next ones ahead). ' : '') + 'To prepare a particular step anyway, call noema_curriculum_task with step = its title.');
    }
    if (t.kind !== 'step') return text(CJ.taskText(c, t, 'connector', { fileLines: t.downloads?.length ? await downloadLines(ctx, `work/plan-${c.id}`, t.downloads) : [] }));
    const lines = t.downloads?.length ? await downloadLines(ctx, `work/${t.packId}/sources`, t.downloads, sharedOn(ctx, c) ? c.shared?.files ?? null : null) : [];
    return text(CJ.stepText(c, t, { mode: 'connector', fileLines: lines }));
  },
};
