/**
 * The entry of build/lesson-updates.js (tools/esbuild.mjs, kind "lazy", on build/ui.js's shared Lit and kit): 💬→📖 the
 * windows and the service of lesson updates (docs/LESSON_UPDATES.md). NoemaShell.lessonUpdates
 * (src/composition/lesson-updates-door.ts) runs it the first time one is opened; the one-file bundle keeps it as text.
 * The only module with a side effect on import; tests import lesson-updates.ts instead.
 */
import { LESSON_UPDATES_PIECE_KEY } from './lesson-updates-door.ts';
import { lessonUpdatesPiece } from './lesson-updates.ts';

(globalThis as Record<string, unknown>)[LESSON_UPDATES_PIECE_KEY] = lessonUpdatesPiece();
