/* noema-lite — what Claude gets (docs/LESSON_UPDATES.md §2): the chat as a source (the conversation's active path, with
   its attachments listed), the chapters as they are, and the task with the format of the answer. One text for both ways: the
   connector's noema_lesson_update_task and the message the learner copies into a Claude chat. English (Claude's working
   language); the learner's words (summary, questions, options) are asked for in the learner's language. Pure. */
import { objs, s, type Obj } from '../../content/domain/util.ts';
import { CHAT_MAX_CHARS, UPDATE_FORMAT, type ChatFile, type LessonRequest } from './model.ts';

/** a turn of the conversation as the record keeps it (noema.conversation/v1: `messages` is the active path, in order) */
export interface ChatTurn {
  readonly role: string;
  readonly content: string;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
  readonly attachments?:
    readonly { readonly id: string; readonly name: string; readonly mediaType: string; readonly size: number }[] | undefined;
}
export interface ChatRecord {
  readonly id: string;
  readonly title?: string | null;
  readonly mode?: string | null;
  readonly context?: {
    readonly type?: string;
    readonly label?: string | null;
    readonly chapterId?: string;
    readonly sectionId?: string;
  } | null;
  readonly messages: readonly ChatTurn[];
}

/** the turns a learner saw (the hidden ones — a directive the app sent for them — are left out) */
export const shownTurns = (r: ChatRecord): ChatTurn[] => r.messages.filter(m => !m.meta?.['hidden'] && m.content.trim() !== '');

/** every file attached on the active path, once each (by id) */
export function chatFiles(r: ChatRecord): ChatFile[] {
  const seen = new Set<string>(),
    out: ChatFile[] = [];
  for (const m of r.messages)
    for (const a of m.attachments ?? [])
      if (a.id && !seen.has(a.id)) {
        seen.add(a.id);
        out.push({ id: a.id, name: a.name || a.id, mediaType: a.mediaType || 'application/octet-stream', size: a.size || 0 });
      }
  return out;
}

/** The chat as a source: Markdown, the newest turns kept when it is longer than max (with a line that says so). */
export function chatMarkdown(
  r: ChatRecord,
  names: { learner: string; tutor: string },
  max = CHAT_MAX_CHARS,
): { text: string; turns: number; cut: number } {
  const turns = shownTurns(r);
  const parts = turns.map(m => {
    const who = m.role === 'user' ? names.learner : names.tutor;
    const files = (m.attachments ?? []).map(a => `📎 ${a.name}`).join(', ');
    return `**${who}:**${files ? ` (${files})` : ''}\n${m.content.trim()}`;
  });
  let total = 0,
    from = parts.length;
  while (from > 0 && total + (parts[from - 1]?.length ?? 0) + 2 <= max) total += (parts[--from]?.length ?? 0) + 2;
  if (from === parts.length && parts.length) from = parts.length - 1; // one turn longer than everything: its end
  const kept = parts.slice(from).map((p, i) => (i === 0 && p.length > max ? '…' + p.slice(p.length - max) : p));
  const head = from > 0 ? [`(${String(from)} earlier turns left out: the chat is long)`] : [];
  return { text: [...head, ...kept].join('\n\n'), turns: turns.length, cut: from };
}

/** the next free ids of a chapter: section number and exercise number */
export function freeIds(ch: Obj): { section: string; exercise: string } {
  const id = s(ch.id);
  const max = (xs: string[], re: RegExp): number => xs.reduce((a, x) => Math.max(a, Number(re.exec(x)?.[1] ?? 0)), 0);
  const sn =
      max(
        objs(ch.sections).map(x => s(x.id)),
        /-s(\d{2})$/,
      ) + 1,
    en =
      max(
        objs(ch.exercises).map(x => s(x.id)),
        /-e(\d{3})$/,
      ) + 1;
  return { section: `${id}-s${String(sn).padStart(2, '0')}`, exercise: `${id}-e${String(en).padStart(3, '0')}` };
}

/** the format of the answer, once (also in docs/LESSON_UPDATES.md §3): one PART per chapter that gets something */
export const FORMAT_SPEC = `{
  "format": "${UPDATE_FORMAT}", "v": 1, "request": "<request id>", "pack": "<subject id>",
  "summary": "<2–3 lines for the learner, in THEIR language: what it adds, in which lessons, and why>",
  "parts": [   // one per chapter that gets something (often one; more when the chat covers what other lessons teach)
    { "chapter": "chNN",
      "ops": [   // ADDITIONS only; places are those of the chapter AS IT IS now
        { "op": "section", "after": "chNN-sMM" | null, "section": { "id": "<new chNN-sNN>", "title": "…", "focus": "<one idea>", "hook": "…", "blocks": [ … ] },
          "i18n": { "<locale>": { "title": "…", "focus": "…", "hook": "…", "blocks": [ …same blocks translated… ] } }, "why": "<one line, learner's language>" },
        { "op": "blocks", "section": "chNN-sMM", "at": <block number to insert before; leave out = at the end>, "blocks": [ … ],
          "i18n": { "<locale>": [ …the same blocks translated… ] }, "why": "…" },
        { "op": "exercises" | "flashcards" | "pitfalls", "items": [ …complete items, new ids, each with its "section"… ], "i18n": { "<locale>": [ …translated… ] }, "why": "…" },
        { "op": "map", "concepts": [ { "id", "terms", "in": "<section>", "def", "needs" } ], "points": [ … ], "known": [ … ] }
      ],
      "choices": [   // only where the learner must decide; each with a recommended option (it applies if they do not choose); ids unique across the parts
        { "id": "c1", "kind": "full" | "duplicate" | "other", "question": "<learner's language>", "why": "…", "recommended": "<option id>",
          "options": [ { "id": "new", "label": "<learner's language, ≤ 120 chars>", "ops": [ … ] },
                       { "id": "replace", "label": "…", "ops": [ { "op": "replace", "section": "chNN-sMM", "at": <block number>, "block": { … }, "i18n": { … } } ] } ] }
      ],
      "bridges": { "<pair key, e.g. ru or el.ru>": [ <new 文A entries for the new words, as in docs/BRIDGE.md, with their translation> ] }   // optional
    }
  ]
}`;

/** the chapters a brief carries in full up to this many characters (the rest as an outline) */
export const BRIEF_CHAPTERS_MAX = 240_000;

/** a chapter in a few lines: its sections (id, title, focus), the concepts its map introduces, its next free ids */
export function outline(ch: Obj): string {
  const free = freeIds(ch);
  const secs = objs(ch.sections).map(x => `  - ${s(x.id)} “${s(x.title)}”${x.focus ? ` — ${s(x.focus)}` : ''}`);
  const map = objs((ch.map as Obj | undefined)?.concepts)
    .map(c => `${s(c.id)}@${s(c.in)}`)
    .join(', ');
  return [
    `- ${s(ch.id)} “${s(ch.title)}” (${String(objs(ch.exercises).length)} exercises; new ids from ${free.section} and ${free.exercise})`,
    ...secs,
    map ? `  concepts: ${map}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join('\n');
}

/** The task for Claude. pack: the lesson as it is (pack language): the chapter the learner picked in full, the others in full
    too while they fit (BRIEF_CHAPTERS_MAX), else as an outline; locales: the pack's translations (every added text in each of
    them); files: the chat's attachments (with a link when the connector made one). */
export function briefFor(o: {
  readonly req: LessonRequest;
  readonly chat: string;
  readonly pack: Obj;
  readonly locales: readonly string[];
  readonly files: readonly (ChatFile & { readonly url?: string })[];
  readonly via: 'connector' | 'copy';
}): string {
  const { req } = o;
  const chapters = objs(o.pack.chapters);
  const picked = chapters.find(c => c.id === req.chapter.id) ?? null;
  const others = chapters.filter(c => c !== picked);
  const full = JSON.stringify(others).length + JSON.stringify(picked ?? {}).length <= BRIEF_CHAPTERS_MAX;
  const free = picked ? freeIds(picked) : null;
  const lang = req.subject.language || 'en';
  const files = o.files.length
    ? o.files.map(f => `- ${f.name} (${f.mediaType}, ${String(Math.round(f.size / 1024))} KB)${f.url ? ` — ${f.url}` : ''}`).join('\n')
    : '(none)';
  const answer =
    o.via === 'connector'
      ? `Call noema_lesson_update_submit with request_id "${req.id}" and update_json = the JSON. It runs every check of the pack again and answers what to fix (all at once); fix and call it again until it is accepted. Nothing reaches the learner until it is accepted, and then only after they approve it in the app.`
      : `Answer with ONLY the JSON, in one code block. The learner pastes it into the app, which runs every check of the pack again; if it lists problems, they paste them back to you: fix them and answer the whole JSON again.`;
  const rest = !others.length
    ? []
    : full
      ? [``, `## The other chapters as they are (in ${lang})`, '```json', JSON.stringify(others), '```']
      : [
          ``,
          `## The other chapters (an outline: the pack is too long to give them in full)`,
          ...others.map(outline),
          o.via === 'connector'
            ? `(For a part in one of them, read that chapter in full first: noema_get_pack_url with subject_id "${req.subject.id}".)`
            : `(A part in one of them may only add new sections, blocks at the end of a section and new exercises or cards: you do not see their text.)`,
        ];
  return [
    `# Improve the lessons from a chat with the tutor (noema-lite)`,
    ``,
    `The learner studied “${req.chapter.title}” (${req.chapter.id}) of the subject “${req.subject.title}” (${req.subject.id}) and talked about it with the tutor. Use that conversation as a SOURCE: find what is worth adding — a clearer explanation of what they struggled with, a better example or analogy, a misconception they hit (as a pitfall, a "think first" reveal, or an exercise that catches it), facts or details the lessons lack, good questions as exercises — and write it as an ADDITIVE update. Do not repeat what the lessons already say; do not copy the chat: rewrite it as lesson content of the same quality as the rest.`,
    `Put each piece where it belongs: usually in “${req.chapter.title}”, but what the chat says about a topic another chapter of the subject teaches goes into THAT chapter (one part per chapter, in "parts"), so that it comes when the learner reaches that topic. A piece that needs what a later chapter teaches goes into that later chapter (after the section that teaches it), never dropped.`,
    req.note ? `\nThe learner's note: “${req.note}”` : null,
    ``,
    `## The rules (the same as every pack: tools/CONTENT_SPEC.md, noema_authoring_guide)`,
    `- Q0 first: nothing is used before it is taught — in the chapter, and across the subject: a part may use what an earlier chapter teaches, never what a later one does. A term, quantity, unit, symbol or acronym may appear only in or after the section that introduces it (map.concepts "in"); a new concept goes into the knowledge map of its chapter (op "map") with the section that teaches it. One focus per section, at most 3 new concepts in it; a section already full gets a NEW section instead, or a choice of kind "full" (a new section · replace the weaker text) when the learner should decide.`,
    `- Q1–Q9 hold for each chapter WITH its addition: the exercise mix (recall ≤ 25 %, application/active > 40 %, difficulty 20/25/55), every exercise self-contained (never "the chat", "the example above" or "the source"), every figure explained, the variety of engines. New exercises: complete, of the types that fit, each with "section", "difficulty", "tags", "explain", "lr" (a learnable of the map: add one with op "map" when it is new), "think" and "cite": { "src": "chat:${req.conversation.id}", "loc": "<turn number>" } (the chat is their source).`,
    `- The language of the pack is ${lang}. Every added text comes ALSO in each language the pack is translated into — ${o.locales.length ? o.locales.join(', ') : '(none)'} — under "i18n": the same structure, the same ids, answers and code, only the words change. Natural wording.`,
    `- Content a lesson already has: if the chat explains it better, offer a choice of kind "duplicate": skip it · merge it into that place ("replace" with the merged text) · keep it as a second explanation — and recommend one. Never add a plain repetition.`,
    `- The summary, the "why" lines, the questions and the option labels are for the learner: write them in their language (${req.locale}), short.`,
    free
      ? `- New ids in ${req.chapter.id}: sections from ${free.section} up, exercises from ${free.exercise} up; in another chapter, the next free ones of that chapter; flashcards need ids new in their chapter. Places name the chapters as they are now.`
      : null,
    `- If a 文A bridge of the pack exists for a pair, you may add entries for the new words under the part's "bridges" (docs/BRIDGE.md).`,
    ``,
    `## The answer`,
    answer,
    '',
    '```jsonc',
    FORMAT_SPEC,
    '```',
    ``,
    `## The chat (${req.conversation.title || 'with the tutor'}, ${String(req.conversation.turns)} turns, the version the learner kept)`,
    o.chat,
    ``,
    `## Its attachments`,
    files,
    o.via === 'copy' && o.files.length ? `(The learner attaches them to this chat.)` : null,
    ``,
    `## The chapter the chat is about, as it is (${req.chapter.id}, in ${lang})`,
    '```json',
    JSON.stringify(picked),
    '```',
    ...rest,
  ]
    .filter((x): x is string => x !== null)
    .join('\n');
}

/** A conversation as the tutor keeps it (its turns: role, text, hidden, meta, attachments) → the chat a request takes. */
export function lessonChat(
  cv: {
    readonly id: string;
    readonly title?: string | null;
    readonly mode?: string | null;
    readonly msgs: readonly { readonly role: string; readonly text: string; readonly hidden?: boolean; readonly meta?: unknown }[];
  },
  context: ChatRecord['context'],
): ChatRecord {
  return {
    id: cv.id,
    title: cv.title ?? null,
    mode: cv.mode ?? null,
    context: context ?? null,
    messages: cv.msgs
      .filter(m => !m.hidden)
      .map(m => {
        const files = (m as { readonly attachments?: ChatTurn['attachments'] }).attachments;
        return {
          role: m.role,
          content: m.text,
          ...(m.meta && typeof m.meta === 'object' ? { meta: m.meta as Readonly<Record<string, unknown>> } : {}),
          ...(files?.length ? { attachments: files } : {}),
        };
      }),
  };
}
