/**
 * The entry of build/lang-activities.js (tools/esbuild.mjs, kind "page"): the screens of languages and activities. NoemaCore.screens
 * (screens-bridge.ts) loads it on the first mount of one of them; the one-file bundle has it inline. The only module with a
 * side effect on import; tests import lang-activities-root.ts instead.
 */
import { startLangActivities } from './lang-activities-root.ts';

startLangActivities();
