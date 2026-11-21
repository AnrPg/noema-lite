/* noema-lite — 💬→📖 lesson updates in the app (docs/LESSON_UPDATES.md): the use cases over one port.

     send      the learner sends a chat for a lesson: the request (synced row a:lessonreq:<id>), and for a cloud account the
               chat and its attachments as files of the account, so Claude reads them through the connector
     message   the text the learner copies into a Claude chat (with the connector: a short one that names the request;
               without: the whole brief, chat and chapter included)
     pending   the proposals that wait for the learner (the 🔔 bell)
     open      one request with its proposal, ready for the review
     paste     an answer pasted back from a Claude chat: the same gate as the connector's (prepare), before the review
     preview   the diff of every chapter it changes and what the checks say, with the learner's picks
     approve   the gate again on the lesson as it is now, a copy of the lesson as it was (for undo), then the lesson saved
               the usual way (the pack with its translations, the bridges) — nothing is saved unless every check passes
     decline · undo

   Rows have one writer each (docs/SYNC.md): the app writes the request, the connector the proposal's card. */
import { err, ok, type Result } from '../../../kernel/result.ts';
import {
  applyProposal,
  asProposal,
  beforePath,
  briefFor,
  chapterDiff,
  chapterOf,
  chatFiles,
  chatMarkdown,
  chatPath,
  filePath,
  FILE_MAX,
  FILES_MAX,
  localesOf,
  newRequestId,
  prepareProposal,
  proposalPath,
  proposalPicks,
  PROP_PREFIX,
  REQ_PREFIX,
  verifyProposal,
  type Base,
  type ChapterDiff,
  type ChatFile,
  type ChatRecord,
  type Checks,
  type LessonRequest,
  type Picks,
  type Proposal,
  type ProposalCard,
  type Result as Applied,
} from '../domain/index.ts';
import { isObj, objs, s, type Obj } from '../../content/domain/util.ts';

/** a subject the learner may improve (their own pack) */
export interface OwnSubject {
  readonly id: string;
  readonly title: string;
  readonly language: string;
  readonly chapters: readonly { readonly id: string; readonly title: string }[];
}
export interface LessonPorts {
  /** the open account: its id, and whether it is a cloud account (the connector works for those only) */
  account(): { readonly id: string; readonly cloud: boolean } | null;
  now(): number;
  unique(): string;
  /** the account's synced keys (a:<name>) */
  read(name: string): unknown;
  write(name: string, value: unknown): void;
  keys(prefix: string): readonly string[];
  /** the account's files in the cloud (paths relative to the account's folder) */
  upload(path: string, body: Blob | string, type: string): Promise<void>;
  download(path: string): Promise<unknown>;
  /** the subjects the learner owns (packs of the account), with their chapters */
  subjects(): Promise<readonly OwnSubject[]>;
  /** the lesson as it is: the pack, its translations (noema-translation files) and its bridges */
  lesson(subject: string): Promise<Base | null>;
  /** saves the lesson the usual way (the pack with its translations inline, then the bridges); version: the new one */
  save(subject: string, r: Applied, version: string): Promise<void>;
  /** the content checks (loaded on first use) */
  checks(): Promise<Checks>;
  /** an attachment of a chat on this device (bytes), null when it is not here */
  attachment(id: string): Promise<{ readonly name: string; readonly mediaType: string; readonly bytes: Uint8Array } | null>;
  /** this device's keeping of a lesson as it was before an update (for undo when offline too) */
  keep(key: string, value: unknown): Promise<void>;
  kept(key: string): Promise<unknown>;
}

export type LessonError =
  'no_account' | 'not_own' | 'no_chapter' | 'empty_chat' | 'not_found' | 'changed' | 'invalid' | 'closed' | 'no_backup';
/** why a use case did not happen: a code the screens put in words, and the checks' own text (English, for Claude) */
export interface LessonFail {
  readonly code: LessonError;
  readonly detail: string;
}
const fail = (code: LessonError, detail = ''): LessonFail => ({ code, detail });
type Async<T> = Promise<Result<T, LessonFail>>;

export interface Review {
  readonly req: LessonRequest;
  readonly card: ProposalCard | null;
  readonly update: Proposal | null;
}
/** one changed chapter of a preview, before and after */
export interface ChapterChange {
  readonly id: string;
  readonly title: string;
  readonly diff: ChapterDiff;
}
export interface Preview {
  /** every chapter it changes, in the order of the chapters */
  readonly chapters: readonly ChapterChange[];
  /** the language the diff is in (the learner's when the pack has it, else the pack's) */
  readonly locale: string;
  readonly errors: readonly string[];
  readonly changed: boolean;
}

const parse = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return null; // an unreadable row is no request
  }
};

export function createLessonUpdates(p: LessonPorts) {
  const reqOf = (id: string): LessonRequest | null => {
    const v = parse(p.read(REQ_PREFIX + id));
    return isObj(v) && v.id === id ? (v as unknown as LessonRequest) : null;
  };
  const cardOf = (id: string): ProposalCard | null => {
    const v = parse(p.read(PROP_PREFIX + id));
    return isObj(v) && v.id === id ? (v as unknown as ProposalCard) : null;
  };
  const put = (r: LessonRequest): void => {
    p.write(REQ_PREFIX + r.id, { ...r, updatedAt: new Date(p.now()).toISOString() });
  };
  const versionAfter = (v: unknown, id: string): string =>
    `${typeof v === 'string' && v ? v.replace(/\+lu\..*$/, '') : 'v'}+lu.${id.slice(-8)}.${p.now().toString(36)}`;

  return {
    /** every request of the account, newest first */
    requests(): LessonRequest[] {
      return p
        .keys(REQ_PREFIX)
        .map(k => reqOf(k.slice(REQ_PREFIX.length)))
        .filter((x): x is LessonRequest => x !== null)
        .sort((a, b) => b.at.localeCompare(a.at));
    },
    /** the proposals waiting for the learner (newest first) */
    pending(): { req: LessonRequest; card: ProposalCard }[] {
      return this.requests()
        .filter(r => r.state === 'open' || r.state === 'proposed')
        .map(req => ({ req, card: cardOf(req.id) }))
        .filter((x): x is { req: LessonRequest; card: ProposalCard } => x.card !== null);
    },
    subjects: () => p.subjects(),

    /** The learner sends a chat for a chapter → the request (and its files in the cloud). */
    async send(o: {
      readonly record: ChatRecord;
      readonly subject: OwnSubject;
      readonly chapter: string;
      readonly note?: string;
      readonly locale: string;
      readonly names: { readonly learner: string; readonly tutor: string };
    }): Async<LessonRequest> {
      const acc = p.account();
      if (!acc) return err(fail('no_account'));
      const ch = o.subject.chapters.find(c => c.id === o.chapter);
      if (!ch) return err(fail('no_chapter'));
      const chat = chatMarkdown(o.record, o.names);
      if (!chat.turns) return err(fail('empty_chat'));
      const id = newRequestId(p.now(), p.unique());
      const files: ChatFile[] = [];
      for (const f of chatFiles(o.record).slice(0, FILES_MAX)) {
        if (!acc.cloud || f.size > FILE_MAX) {
          files.push(f);
          continue;
        }
        const got = await p.attachment(f.id);
        if (!got) {
          files.push(f); // not on this device: Claude sees its name
          continue;
        }
        const path = filePath(id, f.id);
        await p.upload(path, new Blob([got.bytes as BlobPart], { type: got.mediaType }), got.mediaType);
        files.push({ ...f, path });
      }
      const req: LessonRequest = {
        v: 1,
        id,
        at: new Date(p.now()).toISOString(),
        subject: { id: o.subject.id, title: o.subject.title, language: o.subject.language },
        chapter: { id: ch.id, title: ch.title },
        conversation: { id: o.record.id, title: o.record.title ?? '', turns: chat.turns },
        ...(o.note?.trim() ? { note: o.note.trim().slice(0, 2000) } : {}),
        locale: o.locale,
        files,
        state: 'open',
      };
      // the chat first: a request Claude can see always has its chat
      if (acc.cloud)
        await p.upload(
          chatPath(id),
          JSON.stringify({ format: 'noema-lesson-chat', v: 1, id, text: chat.text, cut: chat.cut }),
          'application/json',
        );
      else await p.keep('chat:' + id, chat.text);
      put(req);
      return ok(req);
    },

    /** The message for a Claude chat: with the connector (cloud accounts) short, else the whole brief. */
    async message(id: string, withConnector: boolean): Async<string> {
      const req = reqOf(id);
      if (!req) return err(fail('not_found'));
      if (withConnector)
        return ok(
          `Please improve my noema-lite lesson “${req.chapter.title}” (${req.subject.title}) from my chat with the tutor “${req.conversation.title}”: call noema_lesson_update_task with request_id "${req.id}" and follow it.`,
        );
      const b = await p.lesson(req.subject.id);
      if (!b || !chapterOf(b.pack, req.chapter.id)) return err(fail('no_chapter'));
      const acc = p.account();
      const text = acc?.cloud
        ? s((parse(await p.download(chatPath(id)).catch(() => null)) as Obj | null)?.['text'] ?? '')
        : s(await p.kept('chat:' + id));
      return ok(briefFor({ req, chat: text, pack: b.pack, locales: localesOf(b, req.chapter.id), files: req.files, via: 'copy' }));
    },

    /** One request and its proposal (the connector's), for the review. */
    async open(id: string): Async<Review> {
      const req = reqOf(id);
      if (!req) return err(fail('not_found'));
      const card = cardOf(id);
      const update = card ? asProposal(parse(await p.download(proposalPath(id)).catch(() => null))) : null;
      return ok({ req, card, update });
    },

    /** An answer pasted back from a Claude chat → the update to review, or every problem (to paste back to Claude). */
    async paste(id: string, text: string): Async<{ update: Proposal; fixed: readonly string[] }> {
      const req = reqOf(id);
      if (!req) return err(fail('not_found'));
      const m = /```(?:json[c]?)?\s*([\s\S]*?)```/.exec(text);
      let raw: unknown;
      try {
        raw = JSON.parse((m?.[1] ?? text).trim()) as unknown;
      } catch {
        return err(fail('invalid', 'The answer is not JSON: ask Claude for ONLY the JSON, in one code block.'));
      }
      if (isObj(raw)) raw = { ...raw, request: id };
      const b = await p.lesson(req.subject.id);
      if (!b) return err(fail('not_own'));
      const r = prepareProposal(await p.checks(), b, raw);
      if (!r.proposal) return err(fail('invalid', r.problems.slice(0, 40).join('\n')));
      return ok({ update: r.proposal, fixed: r.fixed });
    },

    /** Every chapter it changes before and after with these picks, in the language the learner reads, and what the checks say. */
    async preview(u: Proposal, picks: Picks, locale: string): Async<Preview> {
      const b = await p.lesson(u.pack);
      if (!b) return err(fail('not_own'));
      const v = verifyProposal(await p.checks(), b, u, picks);
      const shown = Object.keys(b.translations).find(l => l === locale || l.split('-')[0] === locale.split('-')[0]) ?? null;
      const r = applyProposal(b, u, picks);
      const chaptersOf = (pack: Obj, tr: Readonly<Record<string, Obj>>): Obj[] =>
        shown ? objs(tr[shown]?.['chapters']) : objs(pack['chapters']);
      const before = chaptersOf(b.pack, b.translations),
        after = chaptersOf(r.pack, r.translations);
      const chapters: ChapterChange[] = [];
      for (const part of u.parts) {
        const x = before.find(c => c.id === part.chapter),
          y = after.find(c => c.id === part.chapter);
        if (!x || !y) return err(fail('no_chapter'));
        chapters.push({ id: part.chapter, title: s(y['title'] ?? part.chapter), diff: chapterDiff(x, y) });
      }
      return ok({
        chapters,
        locale: shown ?? s(b.pack['subject'] && (b.pack['subject'] as Obj)['language']),
        errors: v.errors,
        changed: v.changed,
      });
    },

    /** Apply it: the gate on the lesson as it is now, a copy of the lesson as it was, then the lesson saved. */
    async approve(id: string, u: Proposal, picks: Picks): Async<LessonRequest> {
      const req = reqOf(id);
      if (!req) return err(fail('not_found'));
      if (req.state !== 'open' && req.state !== 'proposed') return err(fail('closed'));
      const b = await p.lesson(u.pack);
      if (!b) return err(fail('not_own'));
      const v = verifyProposal(await p.checks(), b, u, picks);
      if (v.changed) return err(fail('changed'));
      if (v.errors.length) return err(fail('invalid', v.errors.slice(0, 20).join('\n')));
      const acc = p.account();
      const before = JSON.stringify({
        format: 'noema-lesson-before',
        v: 1,
        id,
        subject: u.pack,
        version: b.pack['version'] ?? null,
        base: b,
      });
      await p.keep('before:' + id, before);
      if (acc?.cloud) await p.upload(beforePath(id), before, 'application/json');
      const r = applyProposal(b, u, picks);
      const version = versionAfter(b.pack['version'], id);
      await p.save(u.pack, r, version);
      const next: LessonRequest = {
        ...req,
        state: 'applied',
        picks: proposalPicks(u, picks),
        appliedAt: new Date(p.now()).toISOString(),
        version,
      };
      put(next);
      return ok(next);
    },

    decline(id: string): Result<LessonRequest, LessonFail> {
      const req = reqOf(id);
      if (!req) return err(fail('not_found'));
      if (req.state === 'applied') return err(fail('closed'));
      const next: LessonRequest = { ...req, state: 'declined' };
      put(next);
      return ok(next);
    },

    /** The lesson as it was before the update (this device's copy, else the account's) saved again. */
    async undo(id: string): Async<LessonRequest> {
      const req = reqOf(id);
      if (!req) return err(fail('not_found'));
      if (req.state !== 'applied') return err(fail('closed'));
      let raw = parse(await p.kept('before:' + id));
      if (!isObj(raw) && p.account()?.cloud) raw = parse(await p.download(beforePath(id)).catch(() => null));
      if (!isObj(raw) || !isObj(raw['base'])) return err(fail('no_backup'));
      const b = raw['base'] as unknown as Base;
      // the lesson changed again since (another update, a new version from Claude): putting the old one back would lose that
      const now = await p.lesson(req.subject.id);
      if (!now) return err(fail('not_own'));
      if (req.version && now.pack['version'] !== req.version) return err(fail('changed'));
      const back: Applied = { pack: { ...b.pack }, translations: { ...b.translations }, bridges: { ...(b.bridges ?? {}) } };
      await p.save(req.subject.id, back, versionAfter(b.pack['version'], id + 'u'));
      const next: LessonRequest = { ...req, state: 'undone' };
      put(next);
      return ok(next);
    },
  };
}
export type LessonUpdates = ReturnType<typeof createLessonUpdates>;
