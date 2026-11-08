/**
 * The entry of build/lang-activities.js (tools/esbuild.mjs, kind "lazy", on build/ui.js's shared Lit and kit): the screens
 * of languages and activities. The shell (NoemaShell.area5, src/composition/area5.ts) runs it on the first language page;
 * the one-file bundle keeps it as text. The only module with a side effect on import; tests import
 * lang-activities-root.ts instead.
 */
import { langActivities } from './lang-activities-root.ts';
import { AREA5_PIECE_KEY } from './pieces.ts';

(globalThis as Record<string, unknown>)[AREA5_PIECE_KEY] = langActivities();
