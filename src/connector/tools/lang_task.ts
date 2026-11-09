/* noema_lang_task — the next task of a language course (claimed for this run before it is handed out) */
import { argFlag, argStr, fail, text, type Tool } from '../tool.ts';
import { siteFile } from '../env.ts';
import type { LangTask } from '../engine/api.ts';
import { claimLangTask, langFiles, langPeers, langState, pickLangCourse, type LangState } from '../services/lang.ts';
import { message } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_lang_task',
    description:
      'The next task of a language course, as complete instructions: what to write, the binding rules, the course context, the link to the course file, the checks to run in your sandbox (lang_course.py, validate_lang.py, lang_refcheck.py from the toolkit) and the JSON Schema of the answer. D19 first: the language is taught through each learner\'s native language — neutral texts that name no language outside the course, and on every grammar page a contrast note for each supported native (en el ru fr ar de hi zh ja it es sq pt tr) and the five type notes; R1–R3: notes shown in three sections (the learner\'s own languages first, the languages being learned, the others folded), every note structured (paragraphs, "- " lists, **bold**, "→ " example lines), every word states every parameter of its part of speech (WORD_PARAMETERS.md / wordFeatures). The task is claimed for you (other runs skip it for 4 hours) — write the task you got and answer with noema_lang_submit. peek = true only says what is next.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'string',
          description: 'from noema_lang_courses (may be omitted when only one course has work)',
        },
        want: {
          type: 'string',
          enum: ['any', 'core', 'node', 'function', 'compare', 'refill'],
          description: 'only this kind of task (default any, in queue order)',
        },
        task: {
          type: 'string',
          description: 'this task id (e.g. "node:fd.03:de")',
        },
        peek: {
          type: 'boolean',
        },
        force: {
          type: 'boolean',
          description: 'with task: take over a task another run claimed but stopped writing',
        },
      },
    },
  },
  async handler(args, ctx) {
    const pk = await pickLangCourse(ctx, argStr(args, 'course_id'));
    if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    const NL = ctx.engine.lang,
      peek = argFlag(args, 'peek'),
      force = argFlag(args, 'force'),
      wantArg = argStr(args, 'want'),
      taskArg = argStr(args, 'task');
    const want = wantArg && wantArg !== 'any' ? 'lang.' + wantArg : 'any';
    let st: LangState;
    try {
      st = await langState(ctx, pk.rec);
    } catch (e) {
      return fail(message(e));
    }
    let t: LangTask | null = null;
    for (let tries = 0; tries < 8; tries++) {
      t = NL.langNext(st.rec, { want, task: taskArg, force });
      if (!t || t.error) break;
      if (peek)
        return text(
          `Next task (not claimed — peek): ${t.id} (${t.kind}). ${NL.langWork(st.rec).queued.length} task(s) queued in all. To write it, call noema_lang_task again without peek.`,
        );
      if (await claimLangTask(ctx, st.rec.id, t.id, force && !!taskArg)) break;
      if (taskArg) {
        t = {
          ...t,
          error: `“${t.id}” has just been taken by another run — do not write it twice. If that run stopped, call again with force = true.`,
        };
        break;
      }
      t.claimedAt = new Date().toISOString();
      t = null;
    }
    if (t?.error) return fail(t.error);
    if (!t) {
      const busy = NL.langWork(st.rec).claimed;
      return text(
        `✅ Nothing is waiting in “${st.rec.title}”${want !== 'any' ? ` (${wantArg})` : ''}. ` +
          (busy.length
            ? `${busy.length} task(s) are being written by other runs right now (${busy
                .slice(0, 5)
                .map(x => x.id)
                .join(', ')}) — do NOT write them again; stop here.`
            : 'The learner queues more in the app (✨ Through Claude, 🌙 night queue, ✨ more sentences).'),
      );
    }
    const peers = t.kind === NL.LANGJOBS.KIND.core ? await langPeers(ctx) : [];
    const files = await langFiles(ctx, st);
    const lib = (ctx.env.config.languages ?? [])[0];
    return text(
      NL.langTaskText(st.rec, st.data, t, { mode: 'connector', files, peers, libraryUrl: lib ? siteFile(ctx.env.config, lib.path) : '' }),
    );
  },
};
