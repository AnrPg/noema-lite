/* noema_curriculum_submit — an answer to a map / plan task, checked with the app's own validators (saga "answer": one inbox entry per answer) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { sagaKey } from '../services/sagas.ts';
import { sha256Hex, str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_curriculum_submit',
    description:
      "Submit your answer to a map / chapter-plan task from noema_curriculum_task. It is checked exactly as noema-lite checks its own agents; problems come back as a list — fix all of them and submit again. Accepted answers reach the learner's app by themselves.",
    inputSchema: {
      type: 'object',
      properties: {
        curriculum_id: {
          type: 'string',
        },
        task_id: {
          type: 'string',
          description: 'the task id given with the task (e.g. "dag", "plan:a,b,c")',
        },
        result_json: {
          type: 'string',
          description: "ONE JSON object matching the task's JSON Schema",
        },
      },
      required: ['curriculum_id', 'task_id', 'result_json'],
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'));
    if (pk.error !== undefined) return fail(pk.error);
    const E = ctx.engine,
      CJ = E.curJobs,
      tid = argStr(args, 'task_id'),
      raw = str(args.result_json);
    const key = sagaKey('answer', pk.c.id, (await sha256Hex(tid + '\n' + raw)).slice(0, 40));
    const before = await ctx.sagas.finished<string>(key);
    if (before !== undefined) return text(before + REPLAYED); // the same answer again (its task may be closed by now)
    const c = await curState(ctx, pk.c, ctx.uid);
    const t = CJ.byId(c, tid);
    if (!t)
      return fail(
        `Task "${tid}" is not open any more (already answered, or the curriculum changed). Call noema_curriculum_task for the current one.`,
      );
    let data: unknown;
    try {
      data = E.llm.parseJSON(raw);
    } catch {
      return fail('result_json is not valid JSON — send ONE JSON object (no prose around it).');
    }
    const errs = CJ.check(c, t, data);
    if (errs.length)
      return fail(
        `Your answer has ${errs.length} problem(s) — fix ALL of them and call noema_curriculum_submit again with the complete corrected object:\n- ${errs.slice(0, 40).join('\n- ')}`,
      );
    const seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);
    const out = await ctx.sagas.run<string>('answer', key, async s => {
      await s.step('inbox', async () => {
        const k = CJ.inboxKey(c.id, seq);
        await ctx.kv.put(k, { v: 1, kind: t.kind, task: t.id, data, at: new Date().toISOString(), via: 'claude-app' });
        return k;
      });
      const after = CJ.merged(c, [{ key: CJ.inboxKey(c.id, 'zzzz'), value: JSON.stringify({ kind: t.kind, task: t.id, data }) }]);
      const w = CJ.work(after);
      return (
        `✅ Accepted (${t.title}). It reaches the learner's app by itself.\n` +
        (w.graph || w.toPlan.length
          ? `Next: call noema_curriculum_task with curriculum_id "${c.id}" — ${w.graph ? 'the next agent of the map' : `${w.toPlan.length} step(s) still need their chapter plan`}.`
          : w.steps.length
            ? `The map and all plans are done. ${w.steps.length} step(s) are queued to prepare — call noema_curriculum_task if the learner asked you to prepare steps.`
            : `The map and all chapter plans are done 🎉. Steps are prepared when the learner sends them to the Claude app from the map (or queues the next ones).`)
      );
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The answer to "${tid}"`));
  },
};
