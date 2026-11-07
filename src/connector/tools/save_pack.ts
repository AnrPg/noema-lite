/* noema_save_pack — save a small pack inline (the same checks and saga as noema_finish_upload) */
import { argStr, fail, type Tool } from '../tool.ts';
import type { Pack } from '../engine/api.ts';
import { completePack } from '../services/packsave.ts';
import { MAX_INLINE, message } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_save_pack",
    "description": "Save a SMALL pack (≤ 1.5 MB of JSON) passed inline as text. For bigger packs (pictures!) use noema_start_upload + noema_finish_upload.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pack_json": {
          "type": "string",
          "description": "The whole noema-pack JSON document as a string"
        },
        "curriculum_id": {
          "type": "string",
          "description": "optional, with step: attach the saved subject to this step of one of the learner's curricula (it then teaches that step; only that step is re-planned). Without it the subject goes to the learner's 📚 Shelf."
        },
        "step": {
          "type": "string",
          "description": "optional: the step (id or title) of curriculum_id that this subject teaches"
        }
      },
      "required": [
        "pack_json"
      ]
    }
  },
  async handler(args, ctx) {
    const raw = args.pack_json == null ? '' : String(args.pack_json);
    if (raw.length > MAX_INLINE) return fail(`Too big for inline saving (${Math.round(raw.length / 1024)} KB). Use noema_start_upload + noema_finish_upload.`);
    let p: Pack; try { p = JSON.parse(raw) as Pack; } catch (e) { return fail('pack_json is not valid JSON: ' + message(e)); }
    const res = ctx.engine.packCheck.checkPack(p, undefined, { requireQuality: true });
    if (res.errors.length) return fail(`${res.errors.length} error(s):\n- ${res.errors.slice(0, 40).join('\n- ')}`);
    if ((ctx.env.config.library ?? []).some(s => s.id === p.subject.id)) return fail(`"${p.subject.id}" is a library subject id — use a new id.`);
    await ctx.storage.writeJson(`${ctx.uid}/packs/${p.subject.id}.json`, raw, { noCache: true });
    return completePack(ctx, p.subject.id, p, res, { curriculum_id: argStr(args, 'curriculum_id'), step: argStr(args, 'step') }, raw);
  },
};
