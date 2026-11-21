/**
 * NoemaShell.lessonUpdates (build/ui.js, docs/LESSON_UPDATES.md): 💬→📖 a chat with the tutor used to improve a lesson.
 * What the frame needs at once is here — the 🔔 rows of the proposals that wait for the learner (read from the synced rows
 * a:lessonreq:<id> and a:lessonup:<id>) and the news when one arrives; the windows and the service (the checks, the apply)
 * are the lazy piece build/lesson-updates.js (src/composition/lesson-updates.ts), run the first time one is opened:
 *
 *   send(record, { subject, chapter })   "Use this chat in a lesson" (the tutor's ⋮, Me › Conversations)
 *   review(id)                           the proposal's window (the 🔔 row's Review)
 *   decline(id) → Promise                the 🔔 row's ✕
 *   bell(acc) → rows                     the 🔔 rows (engine/app/community.js Notes.local, kind 'lessonupdate')
 */
import { noemaI18n } from '../adapters/browser/i18n.ts';
import type { ChatRecord } from '../features/lesson-updates/domain/brief.ts';
import { PROP_PREFIX, REQ_PREFIX, type LessonRequest, type ProposalCard } from '../features/lesson-updates/domain/model.ts';
import { call, obj, str, type Any } from './community-host.ts';
import type { LessonUpdatesPiece } from './lesson-updates.ts';
import { pieceLoader, type PieceHost } from './pieces.ts';
import { UI_SHARED, UI_SHARED_KEY } from './ui-shared.ts';

/** Where build/lesson-updates.js leaves its module (src/composition/lesson-updates-piece.ts). */
export const LESSON_UPDATES_PIECE_KEY = '__noemaLessonUpdatesPiece';

export interface LessonUpdatesShell {
  send(record: ChatRecord, ctx?: { readonly subject?: string | null; readonly chapter?: string | null }): void;
  review(id: string): void;
  decline(id: string): Promise<void>;
  bell(acc?: string | null): readonly Readonly<Record<string, unknown>>[];
}

type Win = Window & Readonly<Record<string, unknown>>;

export function lessonUpdatesDoor(win: Win, page: PieceHost, script: string | undefined): LessonUpdatesShell {
  (globalThis as Record<string, unknown>)[UI_SHARED_KEY] ??= UI_SHARED;
  const load = pieceLoader<LessonUpdatesPiece>(page, script, 'lesson-updates', LESSON_UPDATES_PIECE_KEY);
  const i18n = noemaI18n();
  const g = (name: string): Any | null => obj(win[name]);
  const N = (): Any | null => g('Noema');
  const acc = (): string | null => str(obj(N()?.['account'])?.['id']) || str(obj(N()?.['kv'])?.['acc']) || null;
  const kv = (): Any | null => obj(obj(g('NoemaCore')?.['storage'])?.['kv']);
  const json = (k: string): Any | null => {
    const v = call<unknown>(kv(), 'get', k);
    if (typeof v !== 'string') return null;
    try {
      return obj(JSON.parse(v));
    } catch {
      return null; // an unreadable row is no request
    }
  };
  const report = (e: unknown, where: string): void => {
    call(obj(g('NoemaCore')?.['errors']), 'report', e, { where, severity: 'warning' });
    call(N(), 'toast', i18n.t('lu.err.invalid'), 4000);
  };
  /** the proposals that wait for the learner: a request still open (or proposed) with Claude's card */
  const pending = (a: string): { req: LessonRequest; card: ProposalCard }[] => {
    const head = `noema1:${a}:`;
    const keys = call<unknown>(kv(), 'keys', head + REQ_PREFIX);
    const out: { req: LessonRequest; card: ProposalCard }[] = [];
    for (const k of Array.isArray(keys) ? keys : []) {
      if (typeof k !== 'string') continue;
      const req = json(k) as LessonRequest | null;
      if (!req || (req.state !== 'open' && req.state !== 'proposed')) continue;
      const card = json(head + PROP_PREFIX + req.id) as ProposalCard | null;
      if (card?.id === req.id) out.push({ req, card });
    }
    return out.sort((x, y) => y.card.at.localeCompare(x.card.at));
  };

  /** the 🔔 line of a proposal: its one lesson by title, several by their number */
  const ready = (req: LessonRequest, card: ProposalCard | null): string => {
    const ch = card?.chapters ?? [];
    return ch.length > 1
      ? i18n.t('lu.bell.readyMany', { n: ch.length })
      : i18n.t('lu.bell.ready', { chapter: ch[0]?.title ?? card?.chapterTitle ?? req.chapter.title });
  };

  /* a proposal that arrives (the sync brings its card) joins the bell, and is said once */
  const told = new Set<string>();
  const announce = (keys: readonly string[]): void => {
    const a = acc();
    if (!a || !keys.some(k => k.includes(PROP_PREFIX))) return;
    call(obj(N()?.['notes']), 'local');
    for (const { req, card } of pending(a))
      if (!told.has(req.id)) {
        told.add(req.id);
        call(N(), 'notice', '📖 ' + ready(req, card));
      }
  };
  for (const ev of ['noema:pulled', 'noema:remote'])
    win.addEventListener(ev, e => {
      announce(((e as CustomEvent<{ keys?: unknown[] } | null>).detail?.keys ?? []).map(String));
    });

  return Object.freeze({
    send: (record, ctx) => {
      load().then(
        p => {
          p.send(record, ctx);
        },
        (e: unknown) => {
          report(e, 'lessonup.load');
        },
      );
    },
    review: id => {
      load().then(
        p => {
          p.review(id);
        },
        (e: unknown) => {
          report(e, 'lessonup.load');
        },
      );
    },
    decline: async id => {
      try {
        (await load()).decline(id);
      } catch (e) {
        report(e, 'lessonup.load');
      }
    },
    bell: a0 => {
      const a = acc();
      if (!a || (a0 && a0 !== a)) return [];
      return pending(a).map(({ req, card }) => ({
        id: 'lu:' + req.id,
        kind: 'lessonupdate',
        request: req.id,
        title: card.chapterTitle ?? req.chapter.title,
        text: ready(req, card),
        sub: card.summary
          ? card.summary.slice(0, 160)
          : i18n.t('lu.bell.from', { chat: req.conversation.title || i18n.t('lu.review.chat') }),
        at: card.at,
      }));
    },
  } satisfies LessonUpdatesShell);
}
