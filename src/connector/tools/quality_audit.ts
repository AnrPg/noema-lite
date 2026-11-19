/* noema_quality_audit — the deep audit of a pack (src/features/content/domain/audit.ts): every rule at today's strictness,
   whatever the pack's authoring.rules or age, and a learning report per chapter (depth, gradual introduction, retention,
   interactivity, variety) with what to add, the engines of the library that fit and the questions only a reader answers.
   Saves nothing. On demand: the upload, make_pack.py and the pipeline's gates enforce the rules whether it is called or not. */
import { argStr, fail, type Tool } from '../tool.ts';
import { ID_RE, message, str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_quality_audit',
    description:
      "Deep quality audit of a pack, on demand: every quality rule at today's strictness (Q0 gradual introduction to Q8, whatever the pack's authoring.rules or age, so an older pack is measured against the newest requirements), plus a learning report per chapter — depth (teaching words per section and per new concept, think-first questions), gradual introduction (the concept ladder), retention (exercises per learnable in more than one type, flashcards, pitfalls, self-explanation), interactivity (activities, simulations, picture exercises, and the engines of the library that fit the chapter) and variety (exercise types, kinds of thinking, learning paradigms, ways of showing) — each scored 0–100 with what to add, and the judgement questions to answer by reading every section. Saves nothing. Pass subject_id (a saved or uploaded pack of the learner) or pack_json. Fix in place (unpack.py --repair if the work folder is gone), make_pack.py, upload again; the upload enforces the rules anyway.",
    inputSchema: {
      type: 'object',
      properties: {
        subject_id: {
          type: 'string',
          description: "one of the learner's packs (noema_list_subjects), saved or just uploaded with noema_start_upload's curl",
        },
        pack_json: { type: 'string', description: 'or: the whole noema-pack JSON document as a string' },
        format: { type: 'string', enum: ['text', 'json'], description: 'text (default) or the audit as JSON' },
      },
    },
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id'),
      inline = str(args.pack_json);
    let p: unknown;
    try {
      if (inline) p = JSON.parse(inline);
      else if (sid && ID_RE.test(sid)) p = JSON.parse(await (await ctx.storage.readFresh(`${ctx.uid}/packs/${sid}.json`)).text());
      else return fail('pass subject_id (one of your packs) or pack_json');
    } catch (e) {
      return fail(`Could not read the pack (${message(e).slice(0, 160)}).`);
    }
    const a = ctx.engine.content.auditPack(p);
    const text = args.format === 'json' ? JSON.stringify(a) : ctx.engine.content.auditReport(a);
    return { content: [{ type: 'text', text }] };
  },
};
