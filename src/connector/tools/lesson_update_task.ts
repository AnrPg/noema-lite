/* noema_lesson_update_task — 💬→📖 a chat the learner sent to improve a lesson: the list of those waiting, or one with its
   brief (the chat as the source, its attachments, the chapter as it is, the rules and the answer's format). */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { chatOf, lessonBase, own, request, requests } from '../services/lessons.ts';
import { briefFor, chapterOf, filePath, localesOf } from '../../features/lesson-updates/domain/index.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_lesson_update_task',
    description:
      'A chat with the tutor that the learner sent to improve a lesson ("Use this chat in a lesson" in the app): without request_id, the requests that wait (newest first); with it, the brief — the chat (the version the learner kept) as the SOURCE, links to its attachments, the chapter as it is, the rules (Q0 and Q1–Q9 for the chapter with the addition, every text in each language of the pack) and the format of the answer. Write an ADDITIVE update of that chapter and send it with noema_lesson_update_submit; the learner reviews and approves it in the app.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'The request (lu…), from the list or from the message the learner pasted' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  async handler(args, ctx) {
    const id = argStr(args, 'request_id');
    if (!id) {
      const all = await requests(ctx);
      if (!all.length)
        return text('No chat is waiting to improve a lesson. (The learner sends one from the tutor: ⋮ › Use this chat in a lesson.)');
      return text(
        `${String(all.length)} chat(s) sent to improve a lesson:\n` +
          all
            .map(
              ({ req, card }) =>
                `- ${req.id} — “${req.chapter.title}” (${req.chapter.id}) of “${req.subject.title}” (${req.subject.id}), from the chat “${req.conversation.title}” (${String(req.conversation.turns)} turns), ${req.at.slice(0, 16).replace('T', ' ')} UTC — ${card ? `a proposal is waiting for the learner (rev ${String(card.rev)})` : 'waiting for you'}`,
            )
            .join('\n') +
          '\nCall noema_lesson_update_task with request_id for its brief.',
      );
    }
    const req = await request(ctx, id);
    if (!req) return fail(`No request "${id}" in this account (noema_lesson_update_task without request_id lists them).`);
    if (req.state === 'applied' || req.state === 'declined' || req.state === 'undone')
      return fail(
        `The request ${id} is closed (${req.state}): the learner already answered it. Ask them to send the chat again if they want another update.`,
      );
    const lb = await lessonBase(ctx, req.subject.id);
    if (!lb)
      return fail(
        `The subject “${req.subject.title}” (${req.subject.id}) is not one of the learner's own packs in the account: only their own subjects can be improved.`,
      );
    const ch = chapterOf(lb.base.pack, req.chapter.id);
    if (!ch) return fail(`The subject has no chapter ${req.chapter.id} any more.`);
    const chat = await chatOf(ctx, id);
    if (chat === null)
      return fail(
        `The chat of ${id} is not in the account's storage yet: the learner's app uploads it when it is online — ask them to open the app, then call again.`,
      );
    const files = await Promise.all(
      req.files.map(async f => ({ ...f, ...(f.path ? { url: await ctx.storage.downloadUrl(own(ctx, filePath(id, f.id)), 7200) } : {}) })),
    );
    return text(
      briefFor({ req, chat, chapter: ch, locales: localesOf(lb.base, req.chapter.id), files, via: 'connector' }) +
        (files.some(f => f.url)
          ? '\n\n(The links to the attachments are valid for 2 hours: download them with curl in your sandbox.)'
          : ''),
    );
  },
};
