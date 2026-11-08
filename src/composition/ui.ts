/**
 * The entry of build/ui.js (tools/esbuild.mjs, kind "page"; index.html loads it right after build/app.js): defines the
 * Lit kit and the screens of phase 3 that the older screens already use (the Roadmap levels: roadmaps-ui.ts), and on a
 * development page (localhost) serves the kit's demo #/ui-kit instead of the older screens (engine/loader.js then starts
 * nothing). The only module with a side effect on import; tests import ui-root.ts and roadmaps-ui.ts instead.
 */
import { startRoadmapsUi } from './roadmaps-ui.ts';
import { isUiKitPage, startUiKit } from './ui-root.ts';

startRoadmapsUi();
if (isUiKitPage(window.location)) void startUiKit();
