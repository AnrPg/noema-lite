/* noema_finish_upload — step 3 of saving a pack: check it and everything that travels with it, then save it (saga "pack") */
import { argStr, fail, type Tool } from '../tool.ts';
import type { Pack } from '../engine/api.ts';
import { completePack } from '../services/packsave.ts';
import { ID_RE, message } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_finish_upload',
    description:
      'Step 2: checks the uploaded pack, its source files (every file packaged by make_pack.py — each part of a split PDF — must be uploaded, with the right size) and the .h5p files of its H5P activities (activities/<id>/item.h5p: size, sha256 and the package rules) and adds it to the user’s subject picker. Returns errors to fix, the upload commands of missing source or activity files (run them, then call it again), or a summary.',
    inputSchema: {
      type: 'object',
      properties: {
        subject_id: {
          type: 'string',
        },
        curriculum_id: {
          type: 'string',
          description:
            "optional, with step: attach the saved subject to this step of one of the learner's curricula (it then teaches that step; only that step is re-planned). Without it the subject goes to the learner's 📚 Shelf.",
        },
        step: {
          type: 'string',
          description: 'optional: the step (id or title) of curriculum_id that this subject teaches',
        },
      },
      required: ['subject_id'],
    },
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id');
    if (!ID_RE.test(sid)) return fail('bad subject_id');
    let raw: string, p: Pack;
    try {
      raw = await (await ctx.storage.readFresh(`${ctx.uid}/packs/${sid}.json`)).text();
      p = JSON.parse(raw) as Pack;
    } catch (e) {
      return fail(`No uploaded file found for "${sid}" (${message(e).slice(0, 120)}). Run the curl command from noema_start_upload first.`);
    }
    const res = ctx.engine.content.checkPack(p, sid, { requireQuality: true });
    if (res.errors.length)
      return fail(
        `The pack has ${res.errors.length} error(s) — fix them, rebuild with make_pack.py and upload again:\n- ${res.errors.slice(0, 40).join('\n- ')}`,
      );
    return completePack(ctx, sid, p, res, { curriculum_id: argStr(args, 'curriculum_id'), step: argStr(args, 'step') }, raw);
  },
};
