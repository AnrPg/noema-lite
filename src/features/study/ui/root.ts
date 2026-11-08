/**
 * The study area's root: one StudyApp for the open subject, its pages drawn for the address (routes.ts), and the page's
 * keys (1–6 choose an option of the first open exercise, Enter checks it or goes on, Escape closes the tutor and a
 * dialog). The composition hands it the host (the adapter of the app around it), the words and the clock.
 */
import type { Clock } from '../../../ports/clock.ts';
import type { I18n } from '../../../ports/i18n.ts';
import { StudyApp } from './app.ts';
import type { CardElement } from './exercise/card.ts';
import type { StudyHost } from './host.ts';
import type { AiPort, TutorPort } from './parts.ts';
import { showStudyRoute, STUDY_SEGMENTS } from './routes.ts';
import { wireCopy } from './text.ts';

export interface StudyUi {
  readonly app: StudyApp;
  /** draws the page of an address; → false when it is not a study page */
  show(hash: string): boolean;
  /** the first segments of the study addresses */
  readonly segments: ReadonlySet<string>;
}

export function createStudyUi(host: StudyHost & { readonly tutor: TutorPort; readonly ai: AiPort }, i18n: I18n, clock: Clock): StudyUi {
  const app = new StudyApp(host, i18n, clock);
  app.tutor = host.tutor;
  app.ai = host.ai;
  const show = (hash: string): boolean => showStudyRoute(app, hash);
  app.rerender = () => {
    show(location.hash);
  };
  wireKeys(app);
  wireCopy(document, text => {
    void navigator.clipboard.writeText(text).then(
      () => {
        app.toast(`📋 ${app.t('engine.core.copied')}`);
      },
      (e: unknown) => {
        app.toast(`⚠️ ${app.errText(e)}`, 4000);
      },
    );
  });
  return { app, show, segments: STUDY_SEGMENTS };
}

function wireKeys(app: StudyApp): void {
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t instanceof Element && t.matches('input,textarea,select,[contenteditable=""],[contenteditable="true"]')) return;
    if (e.key === 'Escape') {
      app.tutor.close();
      document.querySelector('.modal')?.remove();
      return;
    }
    const main = app.host.frame.main();
    const card = [...main.querySelectorAll<CardElement>('.ex')].find(c => !c._locked?.());
    if (!card) {
      if (e.key !== 'Enter') return;
      const next = main.querySelector<HTMLButtonElement>('.btn.primary[data-next]');
      if (next?.offsetParent) next.click();
      return;
    }
    if (/^[1-6]$/.test(e.key) && card._w?.keys) card._w.keys(Number(e.key) - 1);
    else if (e.key === 'Enter') card._check?.();
  });
}
