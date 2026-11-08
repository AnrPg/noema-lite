/**
 * The entry of build/study.js (tools/esbuild.mjs, kind "lazy"): the study area's pages (src/features/study/ui), which the
 * page runs once, before it opens the first subject (NoemaCore.studyUi.ready(), src/composition/study-ui.ts). It hands
 * them over on self.__noemaStudyPiece, which the loader reads right after the script has run.
 */
import { createStudyUi } from '../features/study/ui/root.ts';
import { mountTutor } from './tutor.ts';

/** what build/study.js hands the page */
export interface StudyPiece {
  readonly createStudyUi: typeof createStudyUi;
  /** the tutor of the open subject (src/composition/tutor.ts): only ever used with a subject open, so it comes with its pages */
  readonly mountTutor: typeof mountTutor;
}

(globalThis as { __noemaStudyPiece?: StudyPiece }).__noemaStudyPiece = { createStudyUi, mountTutor };
