/* noema_lesson_update_submit — 💬→📖 the update of a lesson made from a chat: checked by the app's own gate (every rule of the
   pack with the addition, every translation, the bridges; the fixes it makes by itself), then the proposal the learner
   reviews in the app (saga "lesson": the proposal's file, then its card). Nothing in the lesson changes here. */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { gateChecks, lessonBase, propKey, request, writeProposal } from '../services/lessons.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { sagaKey } from '../services/sagas.ts';
import { countOps, opsFor, prepareProposal, type Proposal } from '../../features/lesson-updates/domain/index.ts';
import { MAX_INLINE, message, sha256Hex } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_lesson_update_submit',
    description:
      'Send the update of the lessons made from a chat (noema_lesson_update_task gives the brief and the format "noema-lesson-update": one part per chapter that gets something). It is checked like a pack, part by part in the order of the chapters: every rule for each chapter WITH its addition (Q0 nothing before it is taught, one focus and ≤ 3 new concepts a section, Q1–Q9, the exercise mix), every translation (each added text in each language of the pack), the 文A bridges; a repetition of the lesson must be a choice of kind "duplicate". An addition that uses a term before the section that teaches it is placed after that section by itself (the learner sees it). Every problem comes back at once: fix them and send the whole update again. Accepted: the learner reviews it in the app (a diff, their choices) and nothing reaches the lesson until they approve it.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'The request (lu…) the update answers' },
        update_json: { type: 'string', description: 'ONE JSON object of format "noema-lesson-update" (no prose around it)' },
      },
      required: ['request_id', 'update_json'],
    },
  },
  async handler(args, ctx) {
    const id = argStr(args, 'request_id'),
      raw = argStr(args, 'update_json');
    const req = await request(ctx, id);
    if (!req) return fail(`No request "${id}" in this account (noema_lesson_update_task lists them).`);
    if (req.state === 'applied' || req.state === 'declined' || req.state === 'undone')
      return fail(`The request ${id} is closed (${req.state}): the learner already answered it.`);
    if (raw.length > MAX_INLINE)
      return fail(
        `update_json is ${String(Math.round(raw.length / 1024))} KB: at most 1.5 MB. Make the update smaller (fewer, better additions).`,
      );
    let u: unknown;
    try {
      u = JSON.parse(raw) as unknown;
    } catch (e) {
      return fail('update_json is not valid JSON: ' + message(e));
    }
    if (u && typeof u === 'object' && !Array.isArray(u)) (u as Record<string, unknown>)['request'] = id;
    const lb = await lessonBase(ctx, req.subject.id);
    if (!lb) return fail(`The subject ${req.subject.id} is not one of the learner's own packs in the account.`);
    const r = prepareProposal(gateChecks(ctx), lb.base, u);
    if (!r.proposal)
      return fail(
        `The update has ${String(r.problems.length)} problem(s) — fix ALL of them and send the whole update again:\n- ${r.problems.slice(0, 40).join('\n- ')}` +
          (r.fixed.length ? `\n(Already fixed by the checks, nothing to do: ${r.fixed.join('; ')}.)` : ''),
      );
    const update: Proposal = r.proposal;
    const n = counts(update);
    const choices = update.parts.reduce((a, x) => a + (x.choices?.length ?? 0), 0);
    const chapters = update.parts.map(x => ({ id: x.chapter, title: chapterTitle(lb.base.pack, x.chapter) }));
    const titles = chapters.map(c => `“${c.title}”`).join(', ');
    const body = JSON.stringify(update);
    const key = sagaKey('lesson', id, (await sha256Hex(body)).slice(0, 32));
    const out = await ctx.sagas.run<string>('lesson', key, async s => {
      const rev = await s.step(
        'proposal',
        async () =>
          (
            await writeProposal(ctx, id, body, {
              v: 1,
              id,
              at: new Date().toISOString(),
              pack: req.subject.id,
              chapter: chapters[0]?.id ?? req.chapter.id,
              chapterTitle: chapters[0]?.title ?? req.chapter.title,
              chapters,
              summary: update.summary,
              counts: {
                additions: Object.values(n).reduce((a, k) => a + k, 0),
                choices,
                notes: update.parts.reduce((a, x) => a + (x.notes?.length ?? 0), 0),
              },
            })
          ).rev,
      );
      return (
        `✅ The update of ${titles} passed every check and waits for the learner (${propKey(id)}, rev ${String(rev)}): ` +
        Object.entries(n)
          .map(([k, v]) => `${String(v)} ${k}`)
          .join(', ') +
        (choices ? `; ${String(choices)} choice(s) for them` : '') +
        (r.fixed.length ? `; fixed by the checks: ${r.fixed.join('; ')}` : '') +
        `. Their app shows it in 🔔 with a diff; nothing in the lesson changes until they approve it.`
      );
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The update of “${req.chapter.title}”`));
  },
};

/** what every part adds, by kind */
function counts(p: Proposal): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of p.parts) for (const [k, v] of Object.entries(countOps(opsFor(u)))) out[k] = (out[k] ?? 0) + v;
  return out;
}
const chapterTitle = (pack: Record<string, unknown>, id: string): string => {
  const c = (Array.isArray(pack['chapters']) ? (pack['chapters'] as Record<string, unknown>[]) : []).find(x => x['id'] === id);
  return typeof c?.['title'] === 'string' ? c['title'] : id;
};
