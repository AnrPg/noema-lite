/* noema_curriculum_submit — an answer to a map / plan task, checked with the app's own validators (saga "answer": one inbox entry per answer) */
import { argStr, fail, text, type Tool, type ToolContext } from '../tool.ts';
import type { Curriculum } from '../engine/api.ts';
import { needsPlan } from '../../features/roadmaps/domain/index.ts';
import type { Step } from '../../features/roadmaps/domain/model.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { sagaKey } from '../services/sagas.ts';
import { sha256Hex, str } from '../util.ts';

interface Outcome {
  ok: boolean;
  text: string;
  /** the steps whose chapter plan is stored now (read back from the Roadmap as it will be) */
  stored: string[];
  /** steps of the task whose plan is not there when read back */
  missing: string[];
}

/** One answer: checked against the Roadmap as it will be (the record + its inbox, the answers before it included), written as
    one inbox entry, then read back — the receipt names the steps whose plans are stored, so none is lost silently. */
async function submitOne(ctx: ToolContext, c0: Curriculum, tid: string, raw: string): Promise<Outcome> {
  const E = ctx.engine,
    CJ = E.curJobs;
  const no = (t: string): Outcome => ({ ok: false, text: t, stored: [], missing: [] });
  const key = sagaKey('answer', c0.id, (await sha256Hex(tid + '\n' + raw)).slice(0, 40));
  const ids = /^plan:([^@]+)/.exec(tid)?.[1]?.split(',').filter(Boolean) ?? [];
  const planned = (x: Curriculum, i: string): boolean => !!x.nodes[i]?.chapters?.length && !needsPlan(x.nodes[i] as Step);
  // the Roadmap as it is now: the stored record read again (the app saves it before it deletes the answers it applied, so an
  // answer gone from the inbox is in the record by then), with its inbox
  const fresh = async (): Promise<Curriculum> => {
    const pk = await pickCurriculum(ctx, c0.id).catch(() => null);
    return curState(ctx, pk && pk.error === undefined ? pk.c : c0, ctx.uid);
  };
  const readBack = async (): Promise<{ stored: string[]; missing: string[] }> => {
    let after = await fresh();
    if (ids.some(i => !planned(after, i))) after = await fresh(); // the app was between its save and its delete: read again
    return { stored: ids.filter(i => planned(after, i)), missing: ids.filter(i => !planned(after, i)) };
  };
  const before = await ctx.sagas.finished<string>(key);
  if (before !== undefined) {
    const rb = await readBack(); // the same answer again (its task may be closed by now)
    return { ok: !rb.missing.length, text: before + REPLAYED, ...rb };
  }
  const c = await fresh();
  const t = CJ.byId(c, tid);
  if (!t) {
    const rb = ids.length ? await readBack() : { stored: [], missing: [] };
    if (ids.length && !rb.missing.length)
      return { ok: true, text: `Task "${tid}" is answered already: the plans of ${rb.stored.join(', ')} are stored.`, ...rb };
    return no(
      `Task "${tid}" is not open any more (already answered, or the curriculum changed). Call noema_curriculum_task for the current one.`,
    );
  }
  let data: unknown;
  try {
    data = E.llm.parseJSON(raw);
  } catch {
    return no('result_json is not valid JSON — send ONE JSON object (no prose around it).');
  }
  const errs = CJ.check(c, t, data);
  if (errs.length)
    return no(
      `Your answer has ${errs.length} problem(s) — fix ALL of them and call noema_curriculum_submit again with the complete corrected object:\n- ${errs.slice(0, 40).join('\n- ')}`,
    );
  const seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);
  const out = await ctx.sagas.run<string>('answer', key, async s => {
    await s.step('inbox', async () => {
      const k = CJ.inboxKey(c.id, seq);
      await ctx.kv.put(k, { v: 1, kind: t.kind, task: t.id, data, at: new Date().toISOString(), via: 'claude-app' });
      return k;
    });
    return `✅ Accepted (${t.title}). It reaches the learner's app by itself.`;
  });
  if (out.status !== 'done') return no(BUSY(`The answer to "${tid}"`));
  const rb = await readBack();
  return {
    ok: !rb.missing.length,
    text:
      out.value +
      (out.replayed ? REPLAYED : '') +
      (rb.missing.length ? `\n⚠️ Read back, the plans of ${rb.missing.join(', ')} are NOT stored — submit this answer again.` : ''),
    ...rb,
  };
}

/** What is next once the answers are in. */
async function nextLine(ctx: ToolContext, c0: Curriculum): Promise<string> {
  const pk = await pickCurriculum(ctx, c0.id).catch(() => null);
  const c = await curState(ctx, pk && pk.error === undefined ? pk.c : c0, ctx.uid),
    w = ctx.engine.curJobs.work(c);
  return w.graph || w.toPlan.length
    ? `Next: call noema_curriculum_task with curriculum_id "${c.id}" — ${w.graph ? 'the next agent of the map' : `${w.toPlan.length} step(s) still need their chapter plan`}.`
    : w.steps.length
      ? `The map and all plans are done. ${w.steps.length} step(s) are queued to prepare — call noema_curriculum_task if the learner asked you to prepare steps.`
      : `The map and all chapter plans are done 🎉. Steps are prepared when the learner sends them to the Claude app from the map (or queues the next ones).`;
}

export const tool: Tool = {
  definition: {
    name: 'noema_curriculum_submit',
    description:
      "Submit your answer to a map / chapter-plan task from noema_curriculum_task — or several plan answers at once (answers_json). Each is checked exactly as noema-lite checks its own agents; problems come back as a list — fix all of them and submit again. Accepted answers reach the learner's app by themselves. The receipt names every step whose chapter plan is stored (read back after writing) and any that is not.",
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
        answers_json: {
          type: 'string',
          description:
            'instead of task_id + result_json: several answers in one call, a JSON list [{ "task_id": "plan:a,b", "result": { …the answer object… } }, …] — each checked and stored in order (the ones before it count), with one receipt for all',
        },
      },
      required: ['curriculum_id'],
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'));
    if (pk.error !== undefined) return fail(pk.error);
    const many = str(args.answers_json).trim();
    if (!many) {
      const tid = argStr(args, 'task_id'),
        raw = str(args.result_json);
      if (!tid || !raw) return fail('Give task_id and result_json (one answer), or answers_json (several).');
      const o = await submitOne(ctx, pk.c, tid, raw);
      if (!o.ok && !o.stored.length) return fail(o.text);
      return text(
        `${o.text}${o.stored.length ? `\n🧾 Stored: the chapter plans of ${o.stored.join(', ')}.` : ''}\n${await nextLine(ctx, pk.c)}`,
      );
    }
    let list: unknown;
    try {
      list = ctx.engine.llm.parseJSON(many);
    } catch {
      return fail('answers_json is not valid JSON — a list [{ "task_id": "…", "result": { … } }, …].');
    }
    if (!Array.isArray(list) || !list.length)
      return fail('answers_json must be a non-empty list [{ "task_id": "…", "result": { … } }, …].');
    const lines: string[] = [],
      stored: string[] = [],
      missing: string[] = [];
    let bad = 0;
    for (const [i, x] of list.entries()) {
      const a = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
      const tid = typeof a.task_id === 'string' ? a.task_id.trim() : '',
        res = a.result ?? a.result_json;
      if (!tid || res == null) {
        bad++;
        lines.push(`${i + 1}. ❌ needs "task_id" and "result"`);
        continue;
      }
      const o = await submitOne(ctx, pk.c, tid, typeof res === 'string' ? res : JSON.stringify(res));
      if (!o.ok) bad++;
      stored.push(...o.stored);
      missing.push(...o.missing);
      lines.push(`${i + 1}. ${o.ok ? '' : '❌ '}${tid}: ${o.text.replace(/\n/g, '\n   ')}`);
    }
    const receipt = `🧾 Receipt: ${list.length - bad} of ${list.length} answer(s) stored${stored.length ? ` — the chapter plans of ${stored.length} step(s): ${stored.join(', ')}` : ''}.${missing.length ? ` ⚠️ Not stored: ${missing.join(', ')}.` : ''}`;
    const body = `${receipt}\n${lines.join('\n')}\n${await nextLine(ctx, pk.c)}`;
    return bad ? fail(body) : text(body);
  },
};
