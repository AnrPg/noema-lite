/* noema_start_source_upload — a signed upload URL for one original source file, registered in the source-file index */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { extOf, ID_RE, safeSeg } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_start_source_upload",
    "description": "Upload ONE original source file (PDF, slides, document… or one part of a split PDF) so the learner can open it inside noema-lite (👁 preview, at the cited page). Normally not needed: noema_finish_upload gives the commands for every source file the pack contains. Use it to add or replace a single file; returns a signed URL + curl command.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "subject_id": {
          "type": "string"
        },
        "source_id": {
          "type": "string",
          "description": "the id in sources.json"
        },
        "filename": {
          "type": "string",
          "description": "original file name, e.g. ecb-ch5.pdf"
        }
      },
      "required": [
        "subject_id",
        "source_id",
        "filename"
      ]
    }
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id'), src = argStr(args, 'source_id'), fname = argStr(args, 'filename').split(/[\\/]/).pop() ?? '';
    if (!ID_RE.test(sid)) return fail('subject_id: lowercase letters, digits, hyphens');
    if (!/^[\w.-]{1,60}$/.test(src) || !fname) return fail('source_id (as in sources.json) and filename are required');
    const u = await ctx.storage.uploadUrl(`${ctx.uid}/sources/${sid}/${safeSeg(src)}/file.${extOf(fname)}`);
    // registered in the learner's source-file index (its own row) so every device shows 👁 for this source
    await ctx.sourceFiles.put(sid, { [src]: { name: fname, type: '', size: 0, added: new Date().toISOString(), cloud: true, via: 'claude' } });
    return text(`Upload URL for source "${src}" (valid 2 h):\n${u}\n\nRun in your sandbox:\ncurl -sS -X PUT -H "x-upsert: true" -H "apikey: ${ctx.sb.key}" --data-binary @"/path/to/${fname}" "${u}"`);
  },
};
