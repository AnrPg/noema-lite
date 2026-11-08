/**
 * The entry of build/study.js (tools/esbuild.mjs, kind "lazy"): the study area's pages (src/features/study/ui), which the
 * page runs once, before it opens the first subject (NoemaCore.studyUi.ready(), src/composition/study-ui.ts). It hands
 * them over on self.__noemaStudyPiece, which the loader reads right after the script has run.
 */
import { createStudyUi } from '../features/study/ui/root.ts';

/** what build/study.js hands the page */
export interface StudyPiece {
  readonly createStudyUi: typeof createStudyUi;
}

(globalThis as { __noemaStudyPiece?: StudyPiece }).__noemaStudyPiece = { createStudyUi };
