/**
 * A conversation with the tutor (formerly engine/src/60_convos.js): the in-memory shape the tutor works with, its
 * canonical record (noema.conversation/v1, docs/CONVERSATIONS.md, kept by the ConversationStore port), the conversion
 * both ways (the origin of a conversation — the button and the exact part it began from — goes with it), titles, and the
 * Markdown export. Pure.
 */
import type { I18n } from '../../../ports/i18n.ts';
import { str, type Control, type ThreadState } from './threads.ts';
import type { TutorCtx } from './prompts.ts';

export const SCHEMA = 'noema.conversation/v1';
/** one-shot AI records (they are conversations too) */
export const ONE_SHOT_KINDS = ['grading', 'code-review', 'question', 'drill-grading'] as const;
export const KIND_ICON: Readonly<Record<string, string>> = { grading: '📝', 'code-review': '⌨️', question: '✨', 'drill-grading': '🔧' };
/** a titledLen that means "named by the learner: never rename" */
export const USER_TITLED = 1e9;

export interface TurnMeta {
  readonly directive?: string;
  readonly intent?: string;
  noemaState?: Control;
  readonly [key: string]: unknown;
}
export interface Turn {
  readonly id?: string;
  readonly role: 'user' | 'model';
  readonly text: string;
  readonly t: number;
  readonly hidden?: boolean;
  meta?: TurnMeta;
}
/** where a conversation is about, as kept (a TutorCtx without the exercise's full text) */
export type CtxRecord = TutorCtx;
export interface Conversation {
  readonly id: string;
  kind: string;
  mode: string | null;
  readonly created: number;
  updated: number;
  ctx: CtxRecord | null;
  model: string;
  provider: string;
  title: string | null;
  titleSource?: string;
  titledLen: number;
  msgs: Turn[];
  tutorState?: ThreadState | null;
  meta?: Readonly<Record<string, unknown>>;
}

/** The canonical record (engine/convos.js normalize() gives every field its default). */
export interface ConversationRecord {
  readonly schema?: string;
  readonly id: string;
  readonly account?: { readonly id: string; readonly kind?: string } | null;
  readonly subject?: { readonly id: string; readonly title?: string; readonly packVersion?: string | null } | null;
  readonly kind?: string;
  readonly mode?: string | null;
  readonly title?: string | null;
  readonly titleSource?: string;
  readonly context?: {
    readonly type: string;
    readonly id: string | null;
    readonly label: string | null;
    readonly chapterId?: string;
    readonly sectionId?: string;
    readonly origin?: Readonly<Record<string, string | number>>;
  };
  readonly model?: { readonly provider: string; readonly name: string | null };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deleted?: boolean;
  readonly stats?: { readonly messages: number };
  readonly messages: readonly {
    readonly id?: string;
    readonly role: string;
    readonly content: string;
    readonly createdAt?: string;
    readonly meta?: TurnMeta;
  }[];
  readonly tutorState?: ThreadState;
  readonly meta?: Readonly<Record<string, unknown>>;
}

const KINDS = new Set(['section', 'chapter', 'exercise', 'playbook', 'item']);
const parse = (s: string | undefined, or: number): number => {
  const n = s ? Date.parse(s) : NaN;
  return Number.isFinite(n) ? n : or;
};

/** canonical record → the tutor's shape */
export function fromRecord(r: ConversationRecord): Conversation {
  const c = r.context;
  const created = parse(r.createdAt, 0);
  const ctx: CtxRecord | null =
    c?.type && c.type !== 'course' && KINDS.has(c.type)
      ? {
          kind: c.type as CtxRecord['kind'],
          id: c.id ?? '',
          ...(c.label ? { label: c.label } : {}),
          ...(c.type === 'item' ? { sec: c.sectionId ?? null, ch: c.chapterId ?? null } : {}),
          ...(c.origin ? { origin: c.origin } : {}),
        }
      : null;
  const titled = r.meta?.['titledAtMessage'];
  return {
    id: r.id,
    kind: r.kind ?? 'tutor',
    mode: r.mode ?? null,
    created,
    updated: parse(r.updatedAt, created),
    ctx,
    model: r.model?.name ?? '',
    title: r.title ?? null,
    ...(r.titleSource ? { titleSource: r.titleSource } : {}),
    titledLen: r.titleSource === 'user' ? USER_TITLED : typeof titled === 'number' ? titled : r.title ? r.messages.length : 0,
    msgs: r.messages.map(m => ({
      ...(m.id ? { id: m.id } : {}),
      role: m.role === 'user' ? 'user' : 'model',
      text: m.content,
      t: parse(m.createdAt, created),
      ...(m.meta ? { meta: m.meta } : {}),
    })),
    tutorState: r.tutorState ?? null,
    provider: r.model?.provider ?? 'google',
    ...(r.meta ? { meta: r.meta } : {}),
  };
}

/** The tutor's shape → the canonical record (the store adds the account and the subject). sectionOf: an exercise's section. */
export function toRecord(cv: Conversation, sectionOf: (exerciseId: string) => string | null): ConversationRecord {
  const c = cv.ctx;
  const sec = c?.kind === 'section' ? c.id : c?.kind === 'exercise' ? sectionOf(c.id) : c?.kind === 'item' ? (c.sec ?? null) : null;
  const meta: Record<string, unknown> = { ...cv.meta };
  delete meta['titledAtMessage'];
  if (cv.titledLen && cv.titledLen < USER_TITLED) meta['titledAtMessage'] = cv.titledLen;
  return {
    id: cv.id,
    kind: cv.kind,
    mode: cv.mode,
    title: cv.title,
    titleSource: cv.titleSource ?? (cv.titledLen >= USER_TITLED ? 'user' : cv.title ? 'ai' : 'none'),
    // origin: the button the conversation began from and the exact part (block, exercise, card, drill) — the search shows it (docs/SEARCH.md)
    context: c
      ? {
          type: c.kind,
          id: c.id,
          label: c.label ?? null,
          ...(sec ? { sectionId: sec, chapterId: sec.split('-')[0] ?? sec } : {}),
          origin: c.origin ?? { via: 'tutor' },
        }
      : { type: 'course', id: null, label: null, origin: { via: 'tutor' } },
    model: { provider: cv.provider || 'google', name: cv.model || null },
    createdAt: new Date(cv.created).toISOString(),
    updatedAt: new Date(cv.updated || cv.created).toISOString(),
    messages: cv.msgs
      .filter(m => !m.hidden)
      .map(m => ({
        ...(m.id ? { id: m.id } : {}),
        role: m.role === 'user' ? 'user' : 'model',
        content: m.text,
        createdAt: new Date(m.t || cv.created).toISOString(),
        ...(m.meta ? { meta: m.meta } : {}),
      })),
    ...(cv.tutorState ? { tutorState: cv.tutorState } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

/** a tutor conversation (not a one-shot AI record) */
export const isTutor = (kind: string | null | undefined): boolean => !kind || kind === 'tutor';

/* ---------- titles: succinct, descriptive, canonical ---------- */
export function cleanTitle(t: unknown): string {
  return (str(t).split('\n')[0] ?? '')

    .replace(/^\s*(title\s*:\s*)/i, '')
    .replace(/[*_#`"“”'‘’]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.:;,!-]+$/, '')
    .trim()
    .slice(0, 90);
}
/** "Ch3 · Title" → "Title": the label without a leading chapter number (English, as older records have it, or the UI's). */
export function stripChapter(s: string, i18n: I18n): string {
  const pre = i18n.t('engine.common.chTitle', { num: '\u0001', title: '\u0002' }).split('\u0002')[0] ?? '';
  const loc = pre.includes('\u0001')
    ? '|' +
      pre
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace('\u0001', '\\d+')
        .replace(/\s+/g, '\\s*')
    : '';
  return s.replace(new RegExp('^(?:Ch\\d+\\s*·\\s*' + loc + ')'), ''); // i18n-ignore
}
export function fallbackTitle(cv: Conversation, subjectTitle: string, i18n: I18n): string {
  const topic =
    (cv.ctx?.label && stripChapter(cv.ctx.label, i18n)) ||
    (cv.msgs.find(m => m.role === 'user')?.text ?? subjectTitle).split(/\s+/).slice(0, 7).join(' ');
  return cleanTitle(topic) || i18n.t('engine.cv.fallbackTitle', { title: subjectTitle });
}
export const displayTitle = (cv: Conversation, subjectTitle: string, i18n: I18n): string =>
  cv.title ?? fallbackTitle(cv, subjectTitle, i18n);
/** should the conversation be (re)named now? after the first reply, then every 8 messages */
export const wantsTitle = (cv: Conversation): boolean =>
  cv.msgs.some(m => m.role !== 'user') && (!cv.title || cv.msgs.length - (cv.titledLen || 0) >= 8);

/* ---------- export ---------- */
export const slug = (s: string): string =>
  str(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'conversation';
const pad = (n: number): string => str(n).padStart(2, '0');
/** "YYYY-MM-DD HH:MM" in the device's time zone */
export function fmtDate(t: number, withTime = true): string {
  const d = new Date(t);
  return (
    `${str(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    (withTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '')
  );
}
/** keeps a message's headings below the speakers' headings (code fences untouched) */
export function demoteHeadings(text: string, minLevel: number): string {
  let fence = false;
  return text
    .split('\n')
    .map(l => {
      if (/^\s*(```|~~~)/.test(l)) fence = !fence;
      if (fence) return l;
      return l.replace(/^(#{1,6})\s+/, (_m, hs: string) => '#'.repeat(Math.min(6, hs.length + minLevel - 1)) + ' ');
    })
    .join('\n');
}
/** The words a Markdown export needs from its surroundings. */
export interface ExportInfo {
  readonly i18n: I18n;
  readonly subjectTitle: string;
  readonly tutorName: string;
  readonly tutorAvatar: string;
  readonly profile: string;
  /** "noema-lite (noema-lite)" or the other app that wrote it */
  readonly source: string;
  modeName(mode: string | null): string;
}
export function convoMarkdown(cv: Conversation, x: ExportInfo, level = 1): string {
  const H = '#'.repeat(level),
    t = x.i18n.t.bind(x.i18n);
  const lines = [
    `${H} ${displayTitle(cv, x.subjectTitle, x.i18n)}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **${t('engine.cv.md.mode')}** | ${x.modeName(cv.mode)} |`,
    `| **${t('engine.cv.md.context')}** | ${cv.ctx?.label ? cv.ctx.label.replace(/\|/g, '\\|') : t('engine.cv.wholeCourse')} |`,
    `| **${t('engine.cv.md.started')}** | ${fmtDate(cv.created)} |`,
    `| **${t('engine.cv.md.last')}** | ${fmtDate(cv.updated || cv.created)} |`,
    `| **${t('engine.cv.md.messages')}** | ${x.i18n.format.number(cv.msgs.length)} |`,
    `| **${t('engine.cv.md.tutor')}** | ${x.tutorName} (${cv.provider === 'claude' ? 'Claude' : 'Gemini'}${cv.model ? ' · ' + cv.model : ''}) |`, // i18n-ignore
    `| **${t('engine.cv.md.subject')}** | ${x.subjectTitle} |`,
    `| **${t('engine.cv.md.profile')}** | ${x.profile} |`,
    `| **${t('engine.cv.md.source')}** | ${x.source} |`,
    '',
    '---',
    '',
  ];
  const lessons = cv.tutorState?.lessons ?? [];
  if (lessons.length)
    lines.push(`${H}# 📌 ` + t('engine.cv.md.lessons'), '', ...lessons.map((l, i) => `${str(i + 1)}. ${l.text}`), '', '---', '');
  for (const m of cv.msgs) {
    const who = m.role === 'user' ? '🧑 ' + t('engine.cv.md.you') : `${x.tutorAvatar} ${x.tutorName}`;
    lines.push(`${H}# ${who}${m.t ? ' · ' + fmtDate(m.t).slice(11) : ''}`, '', demoteHeadings(str(m.text).trim(), level + 2), '');
  }
  return lines.join('\n');
}
/** the hidden tutor state never leaves the app (a stored text from an older version may still carry it) */
export const visibleText = (t: unknown): string =>
  str(t ?? '')
    .replace(/<noema-state>[\s\S]*?<\/noema-state>/g, '')
    .trim();

/** The names other apps' records carry (meta.app); null for noema-lite's own. */
const APP_NAME: Readonly<Record<string, string>> = { meletee: 'Meletee' }; // i18n-ignore (an app's name)
export function otherApp(cv: { readonly meta?: Readonly<Record<string, unknown>> | undefined }): string | null {
  const a = cv.meta?.['app'];
  return typeof a === 'string' && a && a !== 'noema-lite' ? (APP_NAME[a] ?? a) : null;
}
const OWN_MODES = new Set(['socratic', 'explain', 'quiz', 'interview', 'debug']);
const camel = (s: string): string => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
/** A conversation's mode for the learner: this app's modes in the UI language, other apps' as they name them (loader.convo.mode.*). */
export function modeName(mode: string | null, i18n: I18n): string {
  if (!mode) return '';
  if (OWN_MODES.has(mode)) return i18n.t('engine.cv.mode_' + mode);
  const k = 'loader.convo.mode.' + camel(mode);
  return i18n.has(k) ? i18n.t(k) : mode;
}
/** the badge of a one-shot AI record (grading, code review …) */
export const kindBadge = (kind: string, i18n: I18n): string => {
  const icon = KIND_ICON[kind];
  return icon ? `${icon} ${i18n.t('engine.cv.kind_' + kind.replace('-', '_'))}` : '';
};
