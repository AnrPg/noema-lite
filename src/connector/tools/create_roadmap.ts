/* noema_create_roadmap — a new Roadmap from the material the learner gave Claude (saga "roadmap": one Roadmap per plan, however often it is sent) */
import { argOff, argStr, fail, text, type Tool } from '../tool.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { roadmapTodoText } from '../services/roadmap.ts';
import { sagaKey } from '../services/sagas.ts';
import type { Curriculum } from '../engine/api.ts';
import { sha256Hex, type Json } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_create_roadmap",
    "description": "Make a new Roadmap (a curriculum: a map of steps, each step becomes a subject) in the learner's noema-lite account from the material the learner gave you — the From-your-sources way (skill §0b): use it when the material is several topics that build on each other, or more than one subject can hold; for ONE coherent topic build one subject pack instead. New material for a Roadmap that exists (the next lectures of the same course) is a new PART of that Roadmap: noema_extend_roadmap, never a second Roadmap. Read every file first, then send the steps (each with its prerequisites and the files and pages it is made from). It is checked like the app's own proposal; then plan the chapters and prepare the steps with noema_curriculum_task.",
    "inputSchema": {
      "type": "object",
      "required": [
        "plan_json"
      ],
      "properties": {
        "plan_json": {
          "type": "string",
          "description": "ONE JSON object: { \"title\": \"…\", \"summary\": \"…\", \"steps\": [{ \"ref\": \"s1\", \"title\": \"…\", \"summary\": \"what it covers\", \"role\": \"foundation|intro|aspect|subtopic|related|synthesis|application\", \"prerequisites\": [\"refs of earlier steps\"], \"files\": [\"path/of/file.pdf pp. 12–40\", …] }], \"files\": [{ \"path\": \"path/of/file.pdf\", \"pages\": 120 }] } — \"files\" lists EVERY file the learner gave you (pages for PDFs); every file must be used by a step, and pages must exist."
        },
        "language": {
          "type": "string",
          "description": "language code of the Roadmap (en, el, fr, de …): the language the learner studies in"
        },
        "learner": {
          "type": "string",
          "description": "optional: who the learner is and their goal (one line)"
        },
        "prepare": {
          "type": "boolean",
          "description": "default true: every step is queued for you in study order, so noema_curriculum_task hands you first the chapter plans, then the steps one by one (the learner asked you for the whole course). false: only the map — the learner chooses in the app which steps to prepare."
        }
      }
    }
  },
  async handler(args, ctx) {
    const E = ctx.engine, CUR = E.curriculum, rawPlan = args.plan_json == null ? '' : String(args.plan_json);
    let d: { title?: unknown } & Record<string, unknown>; try { d = E.llm.parseJSON(rawPlan) as typeof d; } catch { return fail('plan_json is not valid JSON — send ONE JSON object (no prose around it).'); }
    const r = E.sourcePlan.fromClaude(d);
    if (r.errors) return fail(`Your Roadmap has ${r.errors.length} problem(s) — fix ALL of them and call noema_create_roadmap again with the complete corrected object:\n- ${r.errors.slice(0, 40).join('\n- ')}`);
    const lang = (argStr(args, 'language') || 'en').toLowerCase();
    if (!CUR.LANG[lang]) return fail(`Unknown language "${lang}". Use one of: ${Object.keys(CUR.LANG).join(', ')}`);
    const prepare = !argOff(args, 'prepare'), learner = argStr(args, 'learner').slice(0, 400);
    // the same plan sent again (a retry) is the same Roadmap: never a second one
    const key = sagaKey('roadmap', (await sha256Hex([rawPlan, lang, learner, prepare].join('\n'))).slice(0, 40));
    const out = await ctx.sagas.run<string>('roadmap', key, async s => {
      // the record is made and written in one step (its id is new each time it is made): a resumed run reuses the one written
      const c = await s.step('record', async () => {
        const c = E.curImport.record(r.parsed, { title: String(d.title).slice(0, 120), language: lang, learner, provider: 'claudeapp' });
        for (const [nid, f] of Object.entries(r.chat)) { const n = c.nodes[nid]; if (n) n.chatFiles = f; }
        if (prepare) { const t0 = Date.now(); CUR.order(c).forEach((nid, i) => { const n = c.nodes[nid]; if (!n) return; n.pack = { id: CUR.packId(c, nid), status: 'app', queuedAt: new Date(t0 + i).toISOString(), error: null, auto: false }; n.reviewed = new Date(t0).toISOString(); }); }
        c.fromSources = { at: new Date().toISOString(), via: 'connector' }; if (r.plan.summary) c.summary = String(r.plan.summary).slice(0, 400);
        await ctx.kv.put('a:curriculum:' + c.id, c);
        return c as unknown as Json;
      }) as unknown as Curriculum;
      const n = Object.keys(c.nodes).length;
      return `✅ The Roadmap “${c.title}” (${c.id}) is in the learner's noema-lite account: ${n} steps, ${c.edges.length} ${c.edges.length === 1 ? 'link' : 'links'}. It appears under Roadmaps the next time the app syncs.\nNext: call noema_curriculum_task with curriculum_id "${c.id}" — first the chapter plans of its steps, then ${prepare ? 'every step in study order (all are queued for you)' : 'the steps the learner queues in the app'}, one subject each, from the files of this chat.` + roadmapTodoText(E, c);
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY('This Roadmap'));
  },
};
