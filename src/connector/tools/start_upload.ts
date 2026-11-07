/* noema_start_upload — step 1 of saving a pack: a signed upload URL (and the Roadmap step held while the upload waits) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { holdStep } from '../services/curricula.ts';
import { ID_RE } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_start_upload',
    description:
      'Step 1 of saving a pack built in your sandbox: returns a signed URL (valid 2 h) and the exact curl command to PUT the pack (work/<id>/build/<id>.json, written by make_pack.py) to it. Then call noema_finish_upload — it also asks for the source files packaged with the pack. The upload is never a prerequisite: if the network blocks the curl, do not stop — pipeline.py defer work/<id> upload, go on with the flow (the next Roadmap step too), and retry every waiting upload together at the end (pipeline.py pending work); if it still fails, give the learner the <id>.noema.zip. For a Roadmap step this call also keeps the step reserved for the run while its upload waits (72 h, renewed by every call), so no other run builds it again.',
    inputSchema: {
      type: 'object',
      properties: {
        subject_id: {
          type: 'string',
          description: 'pack.subject.id',
        },
      },
      required: ['subject_id'],
    },
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id');
    if (!ID_RE.test(sid)) return fail('subject_id: lowercase letters, digits, hyphens (it must equal pack.subject.id)');
    if ((ctx.env.config.library ?? []).some(s => s.id === sid))
      return fail(`"${sid}" is a library subject id — use a new id (e.g. "${sid}-mine").`);
    const u = await ctx.storage.uploadUrl(`${ctx.uid}/packs/${sid}.json`);
    const held = await holdStep(ctx, sid, ctx.user).catch(() => null); // a Roadmap step: reserved while its upload waits (idempotent: a new start renews it)
    const heldLine = !held
      ? ''
      : held.shared === false
        ? `🧭 Step “${held.c.nodes[held.nid]?.title || held.nid}” stays reserved in the learner's own account while its upload waits (72 h), but its reservation among the shared Roadmap's members could NOT be renewed${held.sharedBy ? ` (${held.sharedBy} has it)` : ''}: call noema_start_upload again before 4 h pass, or upload it now, or another member may prepare it too.\n\n`
        : `🧭 Step “${held.c.nodes[held.nid]?.title || held.nid}” stays reserved for this run while its upload waits (72 h, renewed each time you call this tool; it ends once noema_finish_upload saves it), so no other run builds it again.\n\n`;
    return text(
      heldLine +
        `Upload URL (valid 2 h):\n${u}\n\nRun in your sandbox:\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${ctx.sb.key}" --data-binary @work/${sid}/build/${sid}.json "${u}"\n\nThen call noema_finish_upload with subject_id "${sid}" (it gives you the upload commands for the pack's source files). If the sandbox cannot reach the internet, give the user the package ${sid}.noema.zip instead (they import it with 📥 Import subject pack — the source files come with it).`,
    );
  },
};
