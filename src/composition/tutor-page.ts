/**
 * What the tutor's two halves share: the page's globals they read (the engine's older scripts load after build/ui.js and
 * build/study.js, so each is looked up at the call), the tutor's markdown as safe markup, a download and a copy. The
 * session and the drawer are in build/study.js (src/composition/tutor.ts); Me › Conversations in build/ui.js
 * (src/composition/conversations-window.ts).
 */
import type { PageConvos } from '../adapters/browser/conversations.ts';
import type { MessageParams, I18n } from '../ports/i18n.ts';
import type { ConvoRow } from '../features/tutor/ui/conversations.ts';
import type { MenuItem } from '../features/tutor/ui/view.ts';
import { markdown } from '../features/study/ui/text.ts';

export const OPEN_CONVO = 'noema-device:openConvo';

export interface PageGlobals {
  NoemaConvos?: PageConvos & { toMarkdown?: (r: unknown, o: unknown) => string; KIND_NAME?: Record<string, string> };
  NoemaClaude?: { Key: { get(acc: string): string } };
  NoemaLLM?: {
    replyLang(acc: null, pref: string, ui: string): { code: string; auto: boolean; name: string; address: string };
    chatRule(r: unknown, content: string): string;
    fieldsRule(r: unknown, content: string, what: string): string;
  };
  NoemaI18n?: {
    LOCALES?: readonly { tag: string; name: string; pseudo?: boolean }[];
    t(k: string, p?: unknown): string;
    has(k: string): boolean;
  };
  NoemaShell?: ShellApi;
  NoemaThemes?: { tutor?(): { emoji?: string } | null };
  NoemaCurriculum?: {
    stepsOf?(acc: string, sid: string): { c: { id: string }; nid: string }[];
    shownTitle(c: unknown): string;
    shownNode(c: unknown, nid: string): { title?: string } | null;
  };
  Noema?: {
    account?: { id: string } | null;
    kv?: { acc?: string };
    subject?: { id: string } | null;
    switchTo(acc: string, sid: string, hash?: string): unknown;
    jget<T>(k: string, d: T): T;
    toast?(text: string, ms?: number): void;
  };
  marked?: { parse(s: string, o: unknown): string };
  DOMPurify?: { sanitize(html: string, o: unknown): string; addHook(name: string, f: (n: Element) => void): void };
}
export interface ShellApi {
  L(k: string, p?: MessageParams): string;
  menuButton(items: () => readonly (MenuItem | null)[], o: { label: string }): HTMLElement;
  popMenu(anchor: HTMLElement, items: readonly MenuItem[]): void;
  closePops(): void;
  modal(
    title: string,
    build: (w: { head: HTMLElement; body: HTMLElement; close: () => void; refocus: () => void }) => void,
    o?: { cls?: string },
  ): void;
  svg(key: string): string;
  fmtDate(t: unknown, o?: Intl.DateTimeFormatOptions): string;
  tv(): { tutor: string };
  convos?: (openId?: string) => void;
  goConvo?: (r: ConvoRow) => void;
  readonly engine?: { resumeConvo?: () => void } | null;
}

export const W = (): PageGlobals => globalThis as unknown as PageGlobals;

/** the page's markdown libraries (engine/vendor: marked + DOMPurify) with the app's rules: links open apart, no pictures or styles */
let hooked = false;
function libs(): { parse(s: string): string; sanitize(h: string): string } | null {
  const { marked, DOMPurify } = W();
  if (!marked || !DOMPurify) return null;
  if (!hooked) {
    DOMPurify.addHook('afterSanitizeAttributes', n => {
      if (n.tagName === 'A') {
        n.setAttribute('target', '_blank');
        n.setAttribute('rel', 'noopener noreferrer');
      }
    });
    hooked = true;
  }
  return {
    parse: s => marked.parse(s, { gfm: true, breaks: true, async: false }),
    sanitize: h => DOMPurify.sanitize(h, { FORBID_TAGS: ['img', 'style', 'iframe', 'form'], FORBID_ATTR: ['style'] }),
  };
}
export function mdElement(text: string, i18n: I18n, toast: (t: string) => void): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = markdown(text, i18n.t('engine.core.copy'), libs());
  const el = (t.content.firstElementChild as HTMLElement | null) ?? document.createElement('div');
  el.addEventListener('click', e => {
    const btn = (e.target as Element | null)?.closest('[data-copy]'),
      pre = btn?.closest('.pre');
    if (!(pre instanceof HTMLElement)) return;
    e.stopPropagation();
    void navigator.clipboard.writeText(pre.dataset['code'] ?? '').then(() => {
      toast(i18n.t('engine.core.copied'));
    });
  });
  return el;
}
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // no clipboard here (an insecure page, a denied permission): the learner copies it from a prompt
    window.prompt('', text);
    return false;
  }
}
