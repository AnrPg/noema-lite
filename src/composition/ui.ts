/**
 * The entry of build/ui.js (tools/esbuild.mjs, kind "dev"): the UI foundation of phase 3 on its demo route #/ui-kit.
 * engine/loader.js loads this script instead of starting the older screens when a development page (localhost) opens
 * #/ui-kit; it never loads on the start screen or in the site. The only module with a side effect on import; tests
 * import ui-root.ts instead.
 */
import { startUiKit } from './ui-root.ts';

void startUiKit();
