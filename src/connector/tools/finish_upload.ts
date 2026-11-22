/* noema_finish_upload — step 3 of saving a pack: check it and everything that travels with it, then save it (saga "pack") */
import { argStr, fail, text, type Tool, type ToolContext } from '../tool.ts';
import type { Pack, PackCheckResult } from '../engine/api.ts';
import { refusal } from '../services/issues.ts';
import { completePack } from '../services/packsave.ts';
import { ID_RE, message, sha256Hex } from '../util.ts';

/** how long the checks may take before the call answers "checked, call again" instead of saving in the same call */
export const CHECK_BUDGET_MS = 25_000;
const KEEP_MS = 2 * 3600e3;
let rulesTag: Promise<string> | null = null;
/** The pack's checks, kept for 2 h per content and rules (checks/<id>.json in the learner's storage): a call that comes back
    after "checked, call again", or a retry after a timeout, does not check the same file again. */
async function checkedPack(ctx: ToolContext, sid: string, p: Pack, raw: string): Promise<PackCheckResult> {
  const C = ctx.engine.content;
  rulesTag ??= sha256Hex(JSON.stringify(C.PACK_RULES)).then(h => h.slice(0, 16));
  const sha = await sha256Hex(raw),
    tag = await rulesTag,
    file = `${ctx.uid}/checks/${sid}.json`;
  interface Kept {
    sha?: string;
    rules?: string;
    at?: number;
    res?: PackCheckResult;
  }
  const kept = await ctx.storage
    .text(file)
    .then(t => JSON.parse(t ?? 'null') as Kept | null)
    .catch(() => null); // none kept (or unreadable): check again
  if (kept?.sha === sha && kept.rules === tag && Date.now() - (kept.at ?? 0) < KEEP_MS && kept.res && Array.isArray(kept.res.errors))
    return kept.res;
  const res = C.checkPack(p, sid, { requireQuality: true });
  const keep: PackCheckResult = { errors: res.errors.slice(0, 2000), warnings: res.warnings.slice(0, 300), counts: res.counts };
  await ctx.storage
    .writeJson(file, JSON.stringify({ sha, rules: tag, at: Date.now(), res: keep }), { noCache: true })
    .catch(() => undefined);
  return res;
}

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
    const t0 = Date.now();
    const sid = argStr(args, 'subject_id');
    if (!ID_RE.test(sid)) return fail('bad subject_id');
    let raw: string, p: Pack;
    try {
      raw = await (await ctx.storage.readFresh(`${ctx.uid}/packs/${sid}.json`)).text();
      p = JSON.parse(raw) as Pack;
    } catch (e) {
      return fail(`No uploaded file found for "${sid}" (${message(e).slice(0, 120)}). Run the curl command from noema_start_upload first.`);
    }
    const res = await checkedPack(ctx, sid, p, raw);
    if (res.errors.length) return fail(refusal(res.errors));
    // a big pack (900–1700 exercises) can take its checks past what the gateway waits for: then this call stops here with the
    // pack checked (the result is kept), and the next call goes straight on to saving it — never a 502 after a save
    if (Date.now() - t0 > CHECK_BUDGET_MS)
      return text(
        `⏳ “${p.subject.title}” passed every check (${res.counts.exercises ?? 0} exercises in ${res.counts.chapters ?? 0} chapters) — that took ${Math.round((Date.now() - t0) / 1000)} s, so it is not saved yet, to answer before the connection times out. Call noema_finish_upload with subject_id "${sid}" again${argStr(args, 'curriculum_id') ? ' (the same curriculum_id and step)' : ''} now: it reuses this check and saves the pack (nothing is checked or written twice).`,
      );
    return completePack(ctx, sid, p, res, { curriculum_id: argStr(args, 'curriculum_id'), step: argStr(args, 'step') }, raw);
  },
};
