/**
 * Notifier port: short messages to the learner (docs/ARCHITECTURE.md §4). Texts arrive already translated.
 *
 *  • toast(text)  — a short message that fades (a status, not announced by screen readers).
 *  • notice(text) — a piece of news (a step ready, links added): a toast while at most two are on screen; a third moves
 *    them all to the overflow listeners (the 🔔 bell, engine/loader.js), so toasts never stack up over the page.
 *  • alert(text)  — something the learner must not miss (the storage is full): a long toast AND an assertive live region,
 *    so screen readers announce it at once, the same text again when it repeats.
 */
import type { Unsubscribe } from './common.ts';

export interface NotifyOptions {
  /** How long it stays on screen, in ms. */
  readonly ms?: number;
}

export interface OverflowNotice {
  readonly text: string;
  readonly at: number;
}

export interface Notifier {
  toast(text: string, options?: NotifyOptions): void;
  notice(text: string, options?: NotifyOptions): void;
  alert(text: string, options?: NotifyOptions): void;
  /** Notices that did not fit on screen (the ones moved off it, then the new one), oldest first. */
  onOverflow(listener: (notices: readonly OverflowNotice[]) => void): Unsubscribe;
}

/** The rules every notifier keeps (the contract tests check them). */
export const NOTIFIER_RULES = Object.freeze({
  /** At most this many notices on screen at once. */
  maxNotices: 2,
  toastMs: 2400,
  noticeMs: 4000,
  alertMs: 12000,
});
