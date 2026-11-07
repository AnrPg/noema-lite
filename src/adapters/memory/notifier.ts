/** A Notifier that records what it was asked to show (tests): the same rules as the browser's, a recording surface. */
import type { Notifier } from '../../ports/notifier.ts';
import { policyNotifier, type NotifierSurface, type ToastKind } from '../local/notifier-policy.ts';

export interface RecordedToast {
  readonly text: string;
  readonly kind: ToastKind;
  readonly ms: number;
  shown: boolean;
}

export function recordingNotifier(now: () => number = Date.now): Notifier & { readonly toasts: RecordedToast[]; readonly announced: string[]; onScreen(): RecordedToast[] } {
  const toasts: RecordedToast[] = [], announced: string[] = [];
  const surface: NotifierSurface = {
    show(text, kind, ms) {
      const t: RecordedToast = { text, kind, ms, shown: true };
      toasts.push(t);
      return { remove: () => { t.shown = false; }, isShown: () => t.shown };
    },
    announce: text => { announced.push(text); },
  };
  return Object.assign(policyNotifier(surface, { now }), { toasts, announced, onScreen: () => toasts.filter(t => t.shown) });
}
