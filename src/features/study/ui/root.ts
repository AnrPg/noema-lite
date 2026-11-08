/**
 * The study area's root: one StudyApp for the open subject, its pages drawn for the address (routes.ts), and the page's
 * keys (1–6 choose an option of the first open exercise, Enter checks it or goes on, Escape closes the tutor and a
 * dialog). The composition hands it the host (the adapter of the app around it), the words and the clock.
 */
import type { Clock } from '../../../ports/clock.ts';
import type { I18n } from '../../../ports/i18n.ts';
import { StudyApp } from './app.ts';
import { chapterOutline, figureAsText, sectionText } from '../domain/as-text.ts';
import type { Block, Chapter, Exercise, Section } from '../domain/pack.ts';
import { exerciseCard, exerciseText, type CardElement, type CardOptions } from './exercise/card.ts';
import { figureBlock, rCenter, vRegions, vTargets } from './exercise/visual.ts';
import { defineStudyElements } from './lit/base.ts';
import { knowledgeMap, reportedView } from './kmap.ts';
import { defineStudyElements } from './lit/base.ts';
import type { MenuEntry, StudyHost } from './host.ts';
import type { AiPort, TutorPort } from './parts.ts';
import { showStudyRoute, STUDY_SEGMENTS } from './routes.ts';
import { openSearch, resetProgress, subjectMenu } from './screens/home.ts';
import { wireCopy } from './text.ts';

export interface StudyUi {
  readonly app: StudyApp;
  /** draws the page of an address; → false when it is not a study page */
  show(hash: string): boolean;
  /** the first segments of the study addresses */
  readonly segments: ReadonlySet<string>;
  /** a figure block of the pack (an activity's fallback picture) */
  figure(b: Block): HTMLElement;
  /** the course as text for the AI (English, like its prompts): a figure, a section, a chapter's outline, an exercise */
  figureText(b: Block): string;
  sectionText(s: Section): string;
  chapterOutline(c: Chapter): string;
  exerciseText(ex: Exercise): string;
  /** an exercise's card, outside a round (the suites render every one) */
  exerciseCard(ex: Exercise, o?: CardOptions): CardElement;
  /** what the browser suites look into: a picture exercise's parts (their centres) and the parts it asks about, and
      the two dialogs the ⋮ menus open (the knowledge map, the reported exercises) */
  readonly inspect: {
    parts(ex: Exercise): { readonly id: string; readonly label: string; readonly c: readonly [number, number] }[];
    targets(ex: Exercise): string[];
    knowledgeMap(chapterId?: string): void;
    reported(): void;
    /** the subject's ⋮ as it is now, and two of its dialogs (the search in the subject, the reset's question) */
    subjectMenu(): (MenuEntry | null)[];
    search(): void;
    reset(): void;
  };
}

export function createStudyUi(host: StudyHost & { readonly tutor: TutorPort; readonly ai: AiPort }, i18n: I18n, clock: Clock): StudyUi {
  defineStudyElements();
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
  return {
    app,
    show,
    segments: STUDY_SEGMENTS,
    figure: b => figureBlock(app, host.media, b),
    figureText: b => figureAsText(host.media, b),
    sectionText: sec => sectionText(sec, host.media, b => host.activities.asText(b)),
    chapterOutline,
    exerciseText: ex => exerciseText(app, ex),
    exerciseCard: (ex, o) => exerciseCard(app, ex, o),
    inspect: {
      parts: ex => vRegions(ex, ex.media ? host.media[ex.media] : undefined).map(r => ({ id: r.id, label: r.label ?? '', c: rCenter(r) })),
      targets: ex => vTargets(ex, vRegions(ex, ex.media ? host.media[ex.media] : undefined)).map(r => r.id),
      knowledgeMap: id => {
        knowledgeMap(app, id);
      },
      reported: () => {
        reportedView(app);
      },
      subjectMenu: () => subjectMenu(app)(),
      search: () => {
        openSearch(app);
      },
      reset: () => {
        resetProgress(app);
      },
    },
  };
}

function wireKeys(app: StudyApp): void {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && app.sourcesUi.deckOpen) app.sourcesUi.toggleDeck(false);
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
