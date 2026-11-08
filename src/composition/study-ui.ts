/**
 * The study area's pages on the phase bridge (NoemaCore.studyUi). Their code is the lazy piece build/study.js
 * (src/composition/study-pages.ts): the library waits for `ready()` before it opens a subject (engine/app/library.js), then
 * the engine hands the open subject to `mount(host)`, with the host adapter it builds (src/features/study/ui/host.ts), and
 * from then on draws every study address with `show(hash)`. The words are the app's I18n port, the time its Clock.
 *
 *   await NoemaCore.studyUi.ready(); NoemaCore.studyUi.mount(host) → { app, show(hash), segments }
 */
import type { StudyUi } from '../features/study/ui/root.ts';
import type { StudyHost } from '../features/study/ui/host.ts';
import { STUDY_SEGMENTS } from '../features/study/ui/route-table.ts';
import type { AiPort, TutorPort } from '../features/study/ui/parts.ts';
import { NoemaError } from '../kernel/errors.ts';
import type { BridgeExtension } from './bridge.ts';
import { token } from './container.ts';
import type { StudyPiece } from './study-pages.ts';
import type { TutorPageHost, TutorUi } from './tutor.ts';
import { CLOCK, I18N } from './tokens.ts';

/** the one load of build/study.js (registered by the browser's composition: src/composition/browser.ts) */
export const STUDY_PIECE = token<() => Promise<StudyPiece>>('core.studyPiece', 'the load of build/study.js');

export const STUDY_UI_BRIDGE: readonly BridgeExtension[] = [
  {
    name: 'studyUi',
    build: r => {
      let ui: StudyUi | null = null,
        tutor: TutorUi | null = null,
        piece: StudyPiece | null = null;
      return Object.freeze({
        /** resolves once the study pages' code is in (loads it the first time) */
        ready: (): Promise<void> =>
          r
            .get(STUDY_PIECE)()
            .then(p => {
              piece = p;
            }),
        get loaded(): boolean {
          return piece !== null;
        },
        mount(host: StudyHost & { readonly tutor: TutorPort; readonly ai: AiPort }): StudyUi {
          if (!piece) throw new NoemaError('invariant.failed', 'the study pages are not loaded yet: await NoemaCore.studyUi.ready() first');
          ui = piece.createStudyUi(host, r.get(I18N), r.get(CLOCK));
          return ui;
        },
        /** the first segments of the study addresses (the frame registers them before the pages' code is in) */
        segments: STUDY_SEGMENTS,
        /** the tutor of the open subject (src/composition/tutor.ts): mounted before the study area, which gets its two ports */
        tutor(host: TutorPageHost): TutorUi {
          if (!piece) throw new NoemaError('invariant.failed', 'the study pages are not loaded yet: await NoemaCore.studyUi.ready() first');
          tutor = piece.mountTutor(host, r.get(I18N));
          return tutor;
        },
        /** the tutor mounted on this page (null before a subject opens) */
        currentTutor: (): TutorUi | null => tutor,
        /** the study area mounted on this page (null before a subject opens) */
        current: (): StudyUi | null => ui,
      });
    },
  },
];
