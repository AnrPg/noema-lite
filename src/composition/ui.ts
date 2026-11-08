/**
 * The entry of build/ui.js (tools/esbuild.mjs, kind "page"; index.html loads it right after build/app.js): defines the
 * Lit kit and the screens of phase 3 that the older screens already use (the Roadmap levels: roadmaps-ui.ts), and on a
 * development page (localhost) serves the kit's demo #/ui-kit instead (engine/loader.js then starts nothing). The only module with a side effect on import; tests import ui-root.ts and roadmaps-ui.ts instead.
 */
import { startRoadmapsUi } from './roadmaps-ui.ts';
import { isUiKitPage, startUiKit } from './ui-root.ts';

// one provider of the UI services on the body: the kit's demo page has its own (and leaving it reloads the page). The demo
// starts once the page's later scripts ran (engine/themes.js wears the older character on load: the kit's look comes after)
if (isUiKitPage(window.location)) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void startUiKit(), { once: true });
  else void startUiKit();
} else startRoadmapsUi();
