/* noema_lang_submit — an answer to a language-course task, checked with the app's own code (saga "lang-answer": one inbox entry per answer) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { langPeers, langState, pickLangCourse, releaseLangTask, type LangState } from '../services/lang.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { sagaKey } from '../services/sagas.ts';
import { message, sha256Hex, str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_lang_submit',
    description:
      "Submit your answer to a task from noema_lang_task. It is checked exactly as noema-lite checks it (forms against the paradigm cells, the facade of every word, sentences, the parallel order, the D19 contrast notes …); problems come back as a list — fix all of them and submit again. Accepted answers reach the learner's app by themselves.",
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'string',
        },
        task_id: {
          type: 'string',
        },
        result_json: {
          type: 'string',
          description: "ONE JSON object matching the task's JSON Schema",
        },
      },
      required: ['course_id', 'task_id', 'result_json'],
    },
  },
  async handler(args, ctx) {
    const pk = await pickLangCourse(ctx, argStr(args, 'course_id'));
    if (pk.error !== undefined) return fail(pk.error);
    const NL = ctx.engine.lang,
      tid = argStr(args, 'task_id'),
      raw = str(args.result_json);
    const key = sagaKey('lang-answer', pk.rec.id, (await sha256Hex(tid + '\n' + raw)).slice(0, 40));
    const before = await ctx.sagas.finished<string>(key);
    if (before !== undefined) return text(before + REPLAYED);
    let st: LangState;
    try {
      st = await langState(ctx, pk.rec);
    } catch (e) {
      return fail(message(e));
    }
    const t = NL.langTaskById(st.rec, tid);
    if (!t) return fail(`Task "${tid}" is not open any more (already answered, or not queued). Call noema_lang_task for the current one.`);
    let data: unknown;
    try {
      data = ctx.engine.llm.parseJSON(raw);
    } catch {
      return fail('result_json is not valid JSON — send ONE JSON object (no prose around it).');
    }
    const errs = NL.checkLangAnswer(st.rec, st.data, t, data, { peers: t.kind === NL.LANGJOBS.KIND.core ? await langPeers(ctx) : [] });
    if (errs.length)
      return fail(
        `Your answer has ${errs.length} problem(s) — fix ALL of them (validate_lang.py in your sandbox shows them too) and call noema_lang_submit again with the complete corrected object:\n- ${errs.slice(0, 40).join('\n- ')}`,
      );
    const seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);
    const out = await ctx.sagas.run<string>('lang-answer', key, async s => {
      await s.step('inbox', async () => {
        const k = NL.langInboxKey(st.rec.id, seq);
        await ctx.kv.put(k, { v: 1, kind: t.kind, task: t.id, data, at: new Date().toISOString(), via: 'claude-app' });
        return k;
      });
      await s.step('release', async () => {
        await releaseLangTask(ctx, st.rec.id, t.id).catch(() => undefined);
        return true;
      });
      const after = NL.langMerged(st.rec, st.data, [
        { key: NL.langInboxKey(st.rec.id, 'zzzz'), value: JSON.stringify({ task: t.id, data }) },
      ]);
      const w = NL.langWork(after.rec);
      return (
        `✅ Accepted (${t.id}). It reaches the learner's app by itself (merged into the course when noema-lite is open).\n` +
        (w.queued.length
          ? `${w.queued.length} task(s) still queued — call noema_lang_task with course_id "${st.rec.id}" if the learner asked for more.`
          : 'Nothing else is queued in this course 🎉.')
      );
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The answer to "${tid}"`));
  },
};
