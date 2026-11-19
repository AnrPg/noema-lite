/* noema_check_pack — the checks of an upload (noema_finish_upload / noema_save_pack, all quality rules Q0–Q8), on demand, saving
   nothing: every issue, grouped by chapter, with the file to edit. Optional: the upload runs the same checks and refuses a pack
   that fails them, whether this tool was called or not. */
import { argStr, fail, type Tool } from '../tool.ts';
import type { Pack } from '../engine/api.ts';
import { issueReport } from '../services/issues.ts';
import { ID_RE, message, str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_check_pack',
    description:
      "Optional, on demand: run every check a pack's upload runs (the pack contract and all quality rules Q0–Q8, as noema_finish_upload and noema_save_pack do) and list every issue by chapter, with where it is (section, block, exercise, field, the words found) and the file to fix. Saves nothing. Use it to see all issues at once after an upload was refused, or before uploading; the upload checks again and refuses a failing pack anyway. Pass subject_id (the file uploaded with noema_start_upload's curl) or pack_json (a small pack inline). Fix only the chapters and maps it names, rebuild with make_pack.py and upload again — nothing else needs redoing.",
    inputSchema: {
      type: 'object',
      properties: {
        subject_id: { type: 'string', description: "the pack uploaded with noema_start_upload's curl (not yet saved, or saved)" },
        pack_json: { type: 'string', description: 'or: the whole noema-pack JSON document as a string' },
        warnings: { type: 'boolean', description: 'also list the warnings (default false: errors only)' },
        limit: { type: 'number', description: 'at most this many issues (default 300)' },
      },
    },
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id'),
      inline = str(args.pack_json);
    let p: Pack;
    try {
      if (inline) p = JSON.parse(inline) as Pack;
      else if (sid && ID_RE.test(sid)) p = JSON.parse(await (await ctx.storage.readFresh(`${ctx.uid}/packs/${sid}.json`)).text()) as Pack;
      else return fail('pass subject_id (an uploaded pack) or pack_json');
    } catch (e) {
      return fail(`Could not read the pack (${message(e).slice(0, 160)}).`);
    }
    const res = ctx.engine.content.checkPack(p, sid || undefined, { requireQuality: true });
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 300;
    const head = res.errors.length
      ? `✗ ${res.errors.length} error(s), ${res.warnings.length} warning(s): the upload would refuse this pack.`
      : `✓ No errors (${res.warnings.length} warning(s)): the upload would accept it.`;
    return { content: [{ type: 'text', text: head + issueReport(res.errors, res.warnings, { warnings: args.warnings === true, limit }) }] };
  },
};
