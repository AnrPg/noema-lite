/**
 * The Notifier's rules, independent of how a message is drawn: at most NOTIFIER_RULES.maxNotices notices on screen; a
 * further one moves them all (and the rest of the burst, until it has been quiet for a notice's time) to the overflow
 * listeners (the 🔔 bell); an alert is also announced in the assertive live region. A Surface draws: the browser's draws
 * the toasts and the live region (src/adapters/browser/notifier.ts), the recording one keeps what was asked (tests).
 */
import type { Unsubscribe } from '../../ports/common.ts';
import { NOTIFIER_RULES, type Notifier, type OverflowNotice } from '../../ports/notifier.ts';

export type ToastKind = 'toast' | 'notice' | 'alert';

/** A drawn toast: removing it takes it off screen (early, before its time). */
export interface ShownToast {
  remove(): void;
  isShown(): boolean;
}

export interface NotifierSurface {
  /** Draws a toast that removes itself after ms. */
  show(text: string, kind: ToastKind, ms: number): ShownToast;
  /** Announces the text in the assertive live region (the same text again is announced again). */
  announce(text: string): void;
}

export interface NotifierOptions {
  readonly now?: () => number;
  readonly rules?: Partial<typeof NOTIFIER_RULES>;
}

export function policyNotifier(surface: NotifierSurface, options: NotifierOptions = {}): Notifier {
  const R = { ...NOTIFIER_RULES, ...options.rules };
  const now = options.now ?? Date.now;
  let shown: Array<{ toast: ShownToast; text: string; at: number }> = [];
  let burstUntil = 0;
  const listeners = new Set<(n: readonly OverflowNotice[]) => void>();
  return {
    toast(text, o = {}) {
      surface.show(text, 'toast', o.ms ?? R.toastMs);
    },
    notice(text, o = {}) {
      const ms = o.ms ?? R.noticeMs,
        at = now();
      shown = shown.filter(x => x.toast.isShown());
      if (shown.length >= R.maxNotices || at < burstUntil) {
        const moved = shown.splice(0);
        for (const x of moved) x.toast.remove();
        burstUntil = at + ms;
        const items = [...moved.map(x => ({ text: x.text, at: x.at })), { text, at }];
        for (const l of [...listeners]) l(items);
        return;
      }
      shown.push({ toast: surface.show(text, 'notice', ms), text, at });
    },
    alert(text, o = {}) {
      surface.show(text, 'alert', o.ms ?? R.alertMs);
      surface.announce(text);
    },
    onOverflow(listener): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
