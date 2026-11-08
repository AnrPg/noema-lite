/**
 * The study area's pages on the phase bridge (NoemaCore.studyUi): the older page (engine/src/40_views.js) hands the
 * open subject to `mount(host)`, with the host adapter it builds (src/features/study/ui/host.ts), and from then on draws
 * every study address with `show(hash)`. The words are the app's I18n port, the time its Clock.
 *
 *   NoemaCore.studyUi.mount(host) → { app, show(hash), segments }
 */
import { createStudyUi, type StudyUi } from '../features/study/ui/root.ts';
import type { StudyHost } from '../features/study/ui/host.ts';
import type { AiPort, TutorPort } from '../features/study/ui/parts.ts';
import type { BridgeExtension } from './bridge.ts';
import { CLOCK, I18N } from './tokens.ts';

export const STUDY_UI_BRIDGE: readonly BridgeExtension[] = [
  {
    name: 'studyUi',
    build: r => {
      let ui: StudyUi | null = null;
      return Object.freeze({
        mount(host: StudyHost & { readonly tutor: TutorPort; readonly ai: AiPort }): StudyUi {
          ui = createStudyUi(host, r.get(I18N), r.get(CLOCK));
          return ui;
        },
        /** the study area mounted on this page (null before a subject opens) */
        current: (): StudyUi | null => ui,
      });
    },
  },
];
