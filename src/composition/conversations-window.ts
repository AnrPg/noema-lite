/**
 * Me › Conversations (build/ui.js): every subject's conversations with the tutor in a window of the frame, grouped by
 * Roadmap and step (src/features/tutor/ui/conversations.ts), and "Continue" — in this subject's tutor at once, else after
 * opening its subject (the tutor picks it up from sessionStorage noema-device:openConvo: TutorUi.resumeAsked()).
 *
 *   NoemaShell.convos(openId?)   the window (a search result opens its conversation at once)
 *   NoemaShell.goConvo(record)   continue a conversation
 */
import type { StoredConversation } from '../ports/conversations.ts';
import type { I18n, MessageParams } from '../ports/i18n.ts';
import { isTutor, kindBadge, modeName } from '../features/tutor/domain/conversation.ts';
import { defineConversationsUi, type ConvoRow, type NoemaConversations } from '../features/tutor/ui/conversations.ts';
import { OPEN_CONVO, W, download, mdElement } from './tutor-page.ts';

/** the tutor mounted on this page, as the window needs it */
export interface MountedTutor {
  readonly subjectId: string;
  readonly session: { resume(id: string): boolean };
  changed(id: string, patch: { readonly title?: string } | null): void;
}

export function conversationsWindow(
  i18n: I18n,
  current: () => MountedTutor | null,
): {
  conversations: (openId?: string) => void;
  goConvo: (r: ConvoRow) => void;
} {
  defineConversationsUi();
  const accountId = (): string | null => W().Noema?.account?.id ?? W().Noema?.kv?.acc ?? null;
  const toast = (t: string): void => {
    W().Noema?.toast?.(t);
  };
  /* ---------- Me › Conversations (the frame's window) ---------- */
  function conversations(openId?: string): void {
    const S = W().NoemaShell,
      C = W().NoemaConvos,
      a = accountId();
    if (!S || !C || !a) return;
    const L = (k: string, p?: MessageParams): string => S.L(k, p);
    S.modal(
      L('activity'),
      ({ head, body, close, refocus }) => {
        const el = document.createElement('noema-conversations') as NoemaConversations;
        el.head = head;
        el.close = close;
        el.refocus = refocus;
        el.host = {
          L,
          list: () => C.list(a) as unknown as Promise<ConvoRow[]>,
          put: r => C.put(a, r as unknown as StoredConversation) as unknown as Promise<ConvoRow>,
          remove: async id => {
            await C.remove(a, id);
          },
          changed: (id, patch) => {
            current()?.changed(id, patch);
          },
          placeOf: (sid, title) => {
            const CU = W().NoemaCurriculum;
            const st = CU?.stepsOf ? CU.stepsOf(a, sid) : [];
            const first = st[0];
            if (first && CU)
              return {
                g: 'c:' + first.c.id,
                gt: CU.shownTitle(first.c) || L('roadmap'),
                s: first.c.id + '/' + first.nid,
                st: CU.shownNode(first.c, first.nid)?.title ?? title ?? sid,
              };
            return { g: 'other', gt: L('otherSubjects'), s: 's:' + sid, st: title ?? sid };
          },
          resume: r => {
            goConvo(r);
          },
          modeOf: r => {
            if (!isTutor(r.kind)) return C.KIND_NAME?.[r.kind ?? ''] ?? (kindBadge(r.kind ?? '', i18n) || (r.kind ?? ''));
            const m = r.mode ?? '',
              k = 'mode' + m.charAt(0).toUpperCase() + m.slice(1);
            return m && i18n.has('sh.' + k) ? L(k) : m ? modeName(m, i18n) : '';
          },
          tutorName: () => S.tv().tutor,
          date: iso => S.fmtDate(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          md: t =>
            mdElement(t, i18n, x => {
              toast(x);
            }),
          markdown: rows =>
            rows
              .map(r =>
                C.toMarkdown
                  ? C.toMarkdown(r, { tutorName: S.tv().tutor, tutorAvatar: W().NoemaThemes?.tutor?.()?.emoji ?? '' })
                  : r.messages.map(m => `**${m.role === 'user' ? L('you') : S.tv().tutor}:** ${m.content}`).join('\n\n'),
              )
              .join('\n\n---\n\n'),
          download,
          closeIcon: () => S.svg('close').innerHTML, // the shell's icon is a span.ns-svg; the window draws its own
        };
        body.append(el);
        void el.load(openId ?? null);
      },
      { cls: 'ns-convos' },
    );
  }
  /** continue a conversation in its subject's tutor: at once when that subject is open, else after opening it */
  function goConvo(r: ConvoRow): void {
    const a = accountId(),
      sid = r.subject?.id;
    if (!a || !sid) return;
    const t = current();
    if (t && t.subjectId === sid && t.session.resume(r.id)) return;
    try {
      sessionStorage.setItem(OPEN_CONVO, JSON.stringify({ acc: a, sid, id: r.id }));
    } catch (e) {
      W().NoemaCore?.errors.report(e, { where: 'tutor.goConvo', severity: 'info' }); // no sessionStorage: it does not reopen by itself
    }
    void W().Noema?.switchTo(a, sid, '#/subject');
  }
  return { conversations, goConvo };
}
